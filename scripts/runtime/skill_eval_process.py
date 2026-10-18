#!/usr/bin/env python3
"""Private, per-invocation Linux subreaper; never modifies the calling process.

This process has no model/credential logic. It inherits bounded capture pipes,
keeps the command in its own caller-created session, and reaps adopted orphans.
"""

from __future__ import annotations

import ctypes
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from skill_eval_host import _identity, _scan_owned


def main() -> int:
    report = Path(sys.argv[1])
    cleanup_seconds = float(sys.argv[2])
    owner_pid, owner_born = int(sys.argv[3]), int(sys.argv[4])
    argv = sys.argv[5:]
    # PR_SET_CHILD_SUBREAPER: scoped to this private process, never host/pytest.
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:
        report.write_text(
            json.dumps({"complete": False, "error": "subreaper_unavailable"})
        )
        return 125
    interrupted = []
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda number, frame: interrupted.append(number))
    # Parent-death signal closes the race between owner polling intervals.
    if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0:
        report.write_text(
            json.dumps({"complete": False, "error": "parent_death_signal_unavailable"})
        )
        return 125
    owner = _identity(owner_pid)
    if (
        owner is None
        or owner[0] != (owner_pid, owner_born)
        or os.getppid() != owner_pid
    ):
        report.write_text(
            json.dumps(
                {
                    "complete": True,
                    "reaped_pids": [],
                    "remaining_pids": [],
                    "subreaper": True,
                    "owner_lost": True,
                }
            )
        )
        return 125
    own = _identity(os.getpid())
    owned = {os.getpid(): own[0]}
    reaped = []
    target = subprocess.Popen(argv)
    target_identity = _identity(target.pid)
    if target_identity:
        owned[target.pid] = target_identity[0]
    status = None
    while status is None and not interrupted:
        _scan_owned(os.getpid(), own[0][1], owned)
        owner = _identity(owner_pid)
        if owner is None or owner[0] != (owner_pid, owner_born) or owner[3] == "Z":
            interrupted.append(signal.SIGTERM)
        status = target.poll()
        if status is None:
            time.sleep(0.01)
    deadline = time.monotonic() + cleanup_seconds
    remaining = [target.pid]
    while time.monotonic() < deadline:
        live = _scan_owned(os.getpid(), own[0][1], owned)
        for pid, ident in live.items():
            if pid == os.getpid():
                continue
            entry = _identity(pid)
            if entry and entry[0] == ident:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        while True:
            try:
                pid, raw_status = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                pid = 0
                break
            if pid == 0:
                break
            reaped.append(pid)
            if pid == target.pid:
                status = os.waitstatus_to_exitcode(raw_status)
                target.returncode = status
        remaining = [
            pid
            for pid, ident in owned.items()
            if pid != os.getpid() and (entry := _identity(pid)) and entry[0] == ident
        ]
        if not remaining:
            break
        time.sleep(0.01)
    report.write_text(
        json.dumps(
            {
                "complete": not remaining,
                "reaped_pids": reaped,
                "remaining_pids": remaining,
                "subreaper": True,
            }
        )
    )
    if remaining:
        return 125
    return (
        status
        if status is not None and status >= 0
        else 128 + abs(status or signal.SIGTERM)
    )


if __name__ == "__main__":
    raise SystemExit(main())
