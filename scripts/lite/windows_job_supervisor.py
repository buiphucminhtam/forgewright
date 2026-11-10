#!/usr/bin/env python3
"""Own a Windows checker tree; stdin EOF requests cancellation.

The trusted worker waits for admission before executing the checker. The
supervisor owns a non-inherited, unnamed kill-on-close job and only exits
successfully after every job process has terminated. This is lifecycle
containment for ordinary child creation, not a hostile same-user sandbox.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import threading
import time

# One budget covers both active-job draining and reaping the worker. Callers
# allow five seconds, leaving two seconds for IPC and interpreter teardown.
CLEANUP_TIMEOUT_SECONDS = 3.0


def worker_exit_code(code: object) -> int:
    if code is None:
        return 0
    if not isinstance(code, int) or code in (125, 126) or not 0 <= code <= 255:
        return 124
    return code


class BasicLimits(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_int64),
        ("PerJobUserTimeLimit", ctypes.c_int64),
        ("LimitFlags", wintypes.DWORD),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", wintypes.DWORD),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", wintypes.DWORD),
        ("SchedulingClass", wintypes.DWORD),
    ]


class IoCounters(ctypes.Structure):
    _fields_ = [(name, ctypes.c_uint64) for name in (
        "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
        "ReadTransferCount", "WriteTransferCount", "OtherTransferCount",
    )]


class ExtendedLimits(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", BasicLimits),
        ("IoInfo", IoCounters),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryUsed", ctypes.c_size_t),
        ("PeakJobMemoryUsed", ctypes.c_size_t),
    ]


class Accounting(ctypes.Structure):
    _fields_ = [(name, ctypes.c_int64) for name in (
        "TotalUserTime", "TotalKernelTime", "ThisPeriodTotalUserTime",
        "ThisPeriodTotalKernelTime",
    )] + [(name, wintypes.DWORD) for name in (
        "TotalPageFaultCount", "TotalProcesses", "ActiveProcesses",
        "TotalTerminatedProcesses",
    )]


class WindowsJob:
    def __init__(self):
        self.api = ctypes.WinDLL("kernel32", use_last_error=True)
        signatures = {
            "CreateJobObjectW": ([ctypes.c_void_p, wintypes.LPCWSTR], wintypes.HANDLE),
            "SetInformationJobObject": ([wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD], wintypes.BOOL),
            "QueryInformationJobObject": ([wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p], wintypes.BOOL),
            "AssignProcessToJobObject": ([wintypes.HANDLE, wintypes.HANDLE], wintypes.BOOL),
            "TerminateJobObject": ([wintypes.HANDLE, wintypes.UINT], wintypes.BOOL),
            "OpenProcess": ([wintypes.DWORD, wintypes.BOOL, wintypes.DWORD], wintypes.HANDLE),
            "CloseHandle": ([wintypes.HANDLE], wintypes.BOOL),
        }
        for name, (args, result) in signatures.items():
            function = getattr(self.api, name)
            function.argtypes, function.restype = args, result
        self.handle = self.api.CreateJobObjectW(None, None)
        if not self.handle:
            raise ctypes.WinError(ctypes.get_last_error())
        limits = ExtendedLimits()
        limits.BasicLimitInformation.LimitFlags = 0x2000  # KILL_ON_JOB_CLOSE; no breakaway
        if not self.api.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            error = ctypes.WinError(ctypes.get_last_error())
            self.close()
            raise error

    def assign(self, pid: int) -> None:
        process = self.api.OpenProcess(0x0101, False, pid)  # SET_QUOTA | TERMINATE
        if not process:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            if not self.api.AssignProcessToJobObject(self.handle, process):
                raise ctypes.WinError(ctypes.get_last_error())
        finally:
            if not self.api.CloseHandle(process):
                raise ctypes.WinError(ctypes.get_last_error())

    def reclaim(self, deadline: float | None = None) -> None:
        if deadline is None:
            deadline = time.monotonic() + CLEANUP_TIMEOUT_SECONDS
        failure = None
        # Retain an initial failure even if the second attempt reclaims the job.
        for _ in range(2):
            if self.api.TerminateJobObject(self.handle, 1):
                break
            failure = ctypes.WinError(ctypes.get_last_error())
        while True:
            accounting = Accounting()
            if not self.api.QueryInformationJobObject(self.handle, 1, ctypes.byref(accounting), ctypes.sizeof(accounting), None):
                raise ctypes.WinError(ctypes.get_last_error())
            if accounting.ActiveProcesses == 0:
                if failure:
                    raise failure
                return
            if time.monotonic() >= deadline:
                raise RuntimeError("job cleanup unconfirmed: active processes remain")
            time.sleep(0.01)

    def close(self) -> None:
        if self.handle:
            handle, self.handle = self.handle, None
            if not self.api.CloseHandle(handle):
                raise ctypes.WinError(ctypes.get_last_error())


def supervise(arguments: list[str]) -> int:
    job = WindowsJob()
    child = None
    admitted = False
    cancelled = threading.Event()

    def watch_owner() -> None:
        # No caller-controlled command protocol: any data or EOF means stop.
        try:
            os.read(sys.stdin.fileno(), 1)
        finally:
            cancelled.set()

    threading.Thread(target=watch_owner, daemon=True).start()
    try:
        child = subprocess.Popen(
            [sys.executable, "-I", "-B", "-X", "utf8", str(Path(__file__).resolve()), "--worker", *arguments],
            stdin=subprocess.PIPE,
            close_fds=True,
        )
        job.assign(child.pid)
        admitted = True
        try:
            if not cancelled.is_set():
                child.stdin.write(b"G")
                child.stdin.flush()
            child.stdin.close()
            while child.poll() is None and not cancelled.wait(0.01):
                pass
            result = child.poll()
        finally:
            # A failed admission write/flush/close may already have released
            # the worker. Kill-on-close alone does not prove it was reaped.
            cleanup_deadline = time.monotonic() + CLEANUP_TIMEOUT_SECONDS
            job.reclaim(cleanup_deadline)
            child.wait(timeout=max(0, cleanup_deadline - time.monotonic()))
        # ExitProcess/abrupt termination can bypass the worker's Python exit
        # adapter. Normalize only worker statuses, never owner cancellation.
        return worker_exit_code(result) if result is not None and not cancelled.is_set() else 126
    finally:
        # Before admission the worker can only wait, never execute the checker.
        if child is not None and not admitted and child.poll() is None:
            child.kill()
            child.wait(timeout=3)
        job.close()


def _completion_support():
    script_dir = Path(__file__).resolve().parent
    # -I omits the script directory; import only installed framework support.
    for directory in (script_dir, script_dir.parent / "runtime"):
        if str(directory) not in sys.path:
            sys.path.insert(0, str(directory))
    import windows_job_client
    import windows_secure_io
    return windows_job_client, windows_secure_io


def prepare_completion(path, token):
    client, _ = _completion_support()
    client.check_completion_target(path, token)


def publish_completion(path, token, code):
    client, io = _completion_support()
    client.check_completion_target(path, token)
    if type(code) is not int or not 0 <= code <= 255 or code == 125:
        raise ValueError("invalid supervisor completion status")
    path = Path(path)
    payload = dict(schema=client.SCHEMA, token=token, exit_code=code, quiescent=True)
    # The atomic writer owns the leaf directory's strict-to-publication handle
    # transition. Retain only its ancestors here, or rename hits sharing denial.
    with io.locked_directory_chain(Path(path.anchor), path.parent.parent):
        client.check_completion_target(path, token)
        io.atomic_write_bytes(path.parent, path, json.dumps(payload, separators=(",", ":")).encode("utf-8"))


def main() -> int:
    if os.name != "nt":
        raise RuntimeError("Windows Job Objects are required")
    arguments = sys.argv[1:]
    if arguments and arguments[0] == "--worker":
        if sys.stdin.buffer.read(1) != b"G":
            return 1
        if arguments[1:2] == ["--exec"]:
            return worker_exit_code(subprocess.run(arguments[2:], check=False).returncode)
        sys.argv = arguments[1:]
        runpy.run_path(sys.argv[0], run_name="__main__")
        return 0
    # Parse only the fixed supervisor prefix. Payload options are opaque and
    # cannot select a different receipt or be mistaken for supervisor options.
    if (len(arguments) < 6 or arguments[0] != "--completion-file"
            or arguments[2] != "--completion-token"
            or arguments[4] not in {"--exec", "--script"}):
        raise ValueError("completion-file, completion-token and worker mode are required")
    path, token = arguments[1], arguments[3]
    worker = arguments[4:] if arguments[4] == "--exec" else arguments[5:]
    prepare_completion(path, token)
    result = supervise(worker)  # Includes reclaim, worker wait AND job.close.
    publish_completion(path, token, result)
    return result


if __name__ == "__main__":
    worker_entry = sys.argv[1:2] == ["--worker"]
    try:
        exit_code = main()
    except BaseException as error:
        if worker_entry and isinstance(error, SystemExit):
            exit_code = worker_exit_code(error.code)
        else:
            print(f"Windows job supervision failed: {error}", file=sys.stderr, flush=True)
            # Only the supervisor can emit reserved cleanup protocol codes.
            exit_code = 124 if worker_entry else 125
    raise SystemExit(exit_code)
