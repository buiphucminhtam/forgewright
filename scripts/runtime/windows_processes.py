"""Bounded, read-only Windows process observations. Unknown never means dead.

Toolhelp snapshots provide parent IDs; GetProcessTimes binds birth separately.
No process is opened with termination, memory-write, or duplicate-handle rights.
"""

from contextlib import contextmanager
import ctypes
from ctypes import wintypes
import os
import math
import time


class HandleCloseError(OSError):
    pass


class ProcessEntry(ctypes.Structure):
    _fields_ = [
        ("size", wintypes.DWORD),
        ("usage", wintypes.DWORD),
        ("pid", wintypes.DWORD),
        ("heap", ctypes.c_size_t),
        ("module", wintypes.DWORD),
        ("threads", wintypes.DWORD),
        ("parent", wintypes.DWORD),
        ("priority", wintypes.LONG),
        ("flags", wintypes.DWORD),
        ("name", wintypes.WCHAR * 260),
    ]


class ProcessMemoryCounters(ctypes.Structure):
    """PROCESS_MEMORY_COUNTERS_EX: SIZE_T is pointer-sized on native Windows."""

    _fields_ = [
        ("size", wintypes.DWORD),
        ("page_faults", wintypes.DWORD),
        ("peak_working_set", ctypes.c_size_t),
        ("working_set", ctypes.c_size_t),
        ("peak_paged_pool", ctypes.c_size_t),
        ("paged_pool", ctypes.c_size_t),
        ("peak_nonpaged_pool", ctypes.c_size_t),
        ("nonpaged_pool", ctypes.c_size_t),
        ("pagefile", ctypes.c_size_t),
        ("peak_pagefile", ctypes.c_size_t),
        ("private_usage", ctypes.c_size_t),
    ]


class NativeProcesses:
    def __init__(self):
        if os.name != "nt":
            raise OSError("native Windows process API required")
        self.api = ctypes.WinDLL("kernel32", use_last_error=True)
        signatures = {
            "CreateToolhelp32Snapshot": (
                [wintypes.DWORD, wintypes.DWORD],
                wintypes.HANDLE,
            ),
            "Process32FirstW": (
                [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)],
                wintypes.BOOL,
            ),
            "Process32NextW": (
                [wintypes.HANDLE, ctypes.POINTER(ProcessEntry)],
                wintypes.BOOL,
            ),
            "OpenProcess": (
                [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD],
                wintypes.HANDLE,
            ),
            "GetProcessTimes": (
                [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4,
                wintypes.BOOL,
            ),
            "QueryFullProcessImageNameW": (
                [
                    wintypes.HANDLE,
                    wintypes.DWORD,
                    wintypes.LPWSTR,
                    ctypes.POINTER(wintypes.DWORD),
                ],
                wintypes.BOOL,
            ),
            "WaitForSingleObject": ([wintypes.HANDLE, wintypes.DWORD], wintypes.DWORD),
            "CloseHandle": ([wintypes.HANDLE], wintypes.BOOL),
        }
        for name, (arguments, result) in signatures.items():
            function = getattr(self.api, name)
            function.argtypes, function.restype = arguments, result

    def close(self, handle):
        if not self.api.CloseHandle(handle):
            raise HandleCloseError(
                ctypes.get_last_error(), "native process handle close failed"
            )

    @contextmanager
    def process(self, pid, *, synchronize=False):
        if type(pid) is not int or pid <= 0:
            raise ValueError("invalid process ID")
        rights = 0x1000 | (0x100000 if synchronize else 0)
        handle = self.api.OpenProcess(rights, False, pid)
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            yield handle
        finally:
            self.close(handle)

    def birth(self, handle):
        creation, exited, kernel, user = (wintypes.FILETIME() for _ in range(4))
        if not self.api.GetProcessTimes(
            handle,
            ctypes.byref(creation),
            ctypes.byref(exited),
            ctypes.byref(kernel),
            ctypes.byref(user),
        ):
            raise ctypes.WinError(ctypes.get_last_error())
        value = creation.dwHighDateTime << 32 | creation.dwLowDateTime
        if value <= 0:
            raise ValueError("unknown process birth")
        return value

    def identity_text(self, pid):
        with self.process(pid, synchronize=True) as handle:
            if self.api.WaitForSingleObject(handle, 0) != 258:
                raise OSError("process is not confirmed alive")
            birth = self.birth(handle)
            buffer = ctypes.create_unicode_buffer(32768)
            length = wintypes.DWORD(len(buffer))
            if not self.api.QueryFullProcessImageNameW(
                handle, 0, buffer, ctypes.byref(length)
            ):
                raise ctypes.WinError(ctypes.get_last_error())
            if not length.value or length.value >= len(buffer):
                raise ValueError("unknown process executable")
            # Preserve Get-Process StartTime.ToUniversalTime().Ticks identity.
            # FILETIME starts in 1601, whereas .NET ticks start in year 1.
            return f"{pid}\n{birth + 504911232000000000}\n{buffer.value}"

    def snapshot(self, *, max_entries=65536, timeout=2):
        handle = self.api.CreateToolhelp32Snapshot(2, 0)
        if handle == wintypes.HANDLE(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        deadline = time.monotonic() + timeout
        rows = {}
        entry = ProcessEntry()
        entry.size = ctypes.sizeof(entry)
        try:
            found = self.api.Process32FirstW(handle, ctypes.byref(entry))
            while found:
                if len(rows) >= max_entries or time.monotonic() >= deadline:
                    raise ValueError("process census incomplete")
                pid, parent = int(entry.pid), int(entry.parent)
                if pid in rows:
                    raise ValueError("duplicate process in census")
                birth = None
                if pid > 4:
                    try:
                        with self.process(pid) as process:
                            birth = self.birth(process)
                    except HandleCloseError:
                        raise
                    except OSError:
                        # Protected/exited entries stay visible, with explicitly
                        # unknown birth. An ancestry walk touching one must stop.
                        pass
                rows[pid] = (parent, pid, birth)
                found = self.api.Process32NextW(handle, ctypes.byref(entry))
            if ctypes.get_last_error() != 18 or os.getpid() not in rows:
                raise OSError("process census incomplete")
            return rows
        finally:
            self.close(handle)

    def memory_usage(self, handle):
        """Return actual working-set bytes from a held read-only process handle.

        Microsoft permits PROCESS_QUERY_LIMITED_INFORMATION for this query on
        supported Windows versions. No VM_READ, write, or termination access.
        https://learn.microsoft.com/windows/win32/api/psapi/nf-psapi-getprocessmemoryinfo
        """
        query = ctypes.WinDLL("psapi", use_last_error=True).GetProcessMemoryInfo
        query.argtypes = [
            wintypes.HANDLE,
            ctypes.POINTER(ProcessMemoryCounters),
            wintypes.DWORD,
        ]
        query.restype = wintypes.BOOL
        counters = ProcessMemoryCounters()
        counters.size = ctypes.sizeof(counters)
        if not query(handle, ctypes.byref(counters), ctypes.sizeof(counters)):
            raise ctypes.WinError(ctypes.get_last_error())
        if counters.size != ctypes.sizeof(counters):
            raise ValueError("unknown process memory layout")
        return int(counters.working_set)

    def memory_snapshot(self, *, max_entries=65536, timeout=1):
        """Complete bounded census, with null RSS/birth for unobservable entries.

        A snapshot identity and same-handle birth/liveness checks bind each
        working-set sample. Protected, exited or reused PIDs remain visible as
        unknown; callers must reject unknown entries in their owned tree.
        """
        if (
            type(max_entries) is not int
            or not 1 <= max_entries <= 65536
            or type(timeout) not in (int, float)
            or not math.isfinite(timeout)
            or not 0 < timeout <= 2
        ):
            raise ValueError("invalid memory census bounds")
        deadline = time.monotonic() + timeout
        snapshot = self.snapshot(max_entries=max_entries, timeout=timeout)
        if len(snapshot) > max_entries or os.getpid() not in snapshot:
            raise ValueError("process memory census incomplete")
        rows = []
        for pid, (parent, _, expected_birth) in snapshot.items():
            if time.monotonic() >= deadline:
                raise ValueError("process memory census incomplete")
            if pid == 0:
                continue
            row = dict(pid=pid, ppid=parent, pgid=pid, rssKiB=None, start=None)
            if expected_birth is not None:
                try:
                    with self.process(pid, synchronize=True) as handle:
                        if self.api.WaitForSingleObject(handle, 0) != 258:
                            raise OSError("process is not confirmed alive")
                        birth = self.birth(handle)
                        if birth != expected_birth:
                            raise ValueError("process birth changed")
                        working_set = self.memory_usage(handle)
                        if (
                            self.birth(handle) != birth
                            or self.api.WaitForSingleObject(handle, 0) != 258
                        ):
                            raise OSError("process changed during memory query")
                        # Round upward: converting to KiB must not undercount.
                        row.update(
                            rssKiB=(working_set + 1023) // 1024,
                            start=f"windows-filetime:{birth}",
                        )
                except HandleCloseError:
                    raise
                except (OSError, ValueError):
                    row.update(rssKiB=None, start=None)
            rows.append(row)
        if time.monotonic() >= deadline:
            raise ValueError("process memory census incomplete")
        return rows
