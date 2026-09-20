#!/usr/bin/env python3
"""One demand-started local IPC broker per user; no network, jobs, or model calls.

SQLite remains the transaction authority. The file lock prevents duplicate
brokers. Clients heartbeat while running; the broker exits after 15 idle
seconds and leaves uncertain leases quarantined, never implicitly released.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import socketserver
import stat
import time

from host_admission import AdmissionError, HostAdmission

PROTOCOL = "forgewright-host-admission/v1"
MAX_REQUEST = 16384


def dispatch(admission, request):
    if not isinstance(request, dict) or request.get("schema") != PROTOCOL:
        raise AdmissionError("protocol-mismatch")
    action = request.get("action")
    common = {"schema", "action"}
    if action == "ping":
        if set(request) != common:
            raise AdmissionError("invalid-request")
        # Liveness is not a grant or readiness decision. Real requests still
        # read current pressure and process identity within their transaction.
        return {"protocol": PROTOCOL, "alive": True}
    if action == "status":
        if set(request) != common:
            raise AdmissionError("invalid-request")
        return admission.status()
    allowed = common | {"job_id", "token", "owner_pid"}
    if action == "enqueue":
        allowed |= {"project_root", "run_id", "kind", "memory_mib", "parent_lease_id"}
    elif action == "release":
        allowed |= {"quiescent"}
    elif action != "poll":
        raise AdmissionError("unknown-action")
    if set(request) - allowed:
        raise AdmissionError("invalid-request")
    args = {k: v for k, v in request.items() if k not in common}
    if action == "enqueue":
        return admission.enqueue(**args)
    if action == "release":
        return admission.release(**args)
    return admission.poll(**args)


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(1)
        server = self.server
        try:
            raw = self.rfile.readline(MAX_REQUEST + 1)
            if len(raw) > MAX_REQUEST or not raw.endswith(b"\n"):
                raise AdmissionError("request-too-large")
            request = json.loads(raw)
            result = dispatch(server.admission, request)
            reply = {"ok": True, "schema": PROTOCOL, "data": result}
        except (AdmissionError, ValueError, TypeError, KeyError) as error:
            code = (
                str(error) if isinstance(error, AdmissionError) else "invalid-request"
            )
            reply = {"ok": False, "schema": PROTOCOL, "error": code}
        except (OSError, TimeoutError):
            return
        except Exception:
            reply = {"ok": False, "schema": PROTOCOL, "error": "admission-unavailable"}
        try:
            self.wfile.write(json.dumps(reply, separators=(",", ":")).encode() + b"\n")
        except OSError:
            pass
        server.last_request = time.monotonic()


def serve(home):
    # AF_UNIX is intentionally not represented as portable OS execution isolation.
    if os.name != "posix" or not hasattr(socketserver, "UnixStreamServer"):
        raise AdmissionError("platform-unavailable")
    import fcntl

    os.umask(0o077)
    admission = HostAdmission(home)
    home = admission.home
    sock_path = home / "broker.sock"
    if len(os.fsencode(sock_path)) >= 100:
        raise AdmissionError("socket-path-too-long")
    lock = os.open(home / "broker.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(lock)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
            raise AdmissionError("unsafe-broker-lock")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return  # Existing owner remains authoritative; no duplicate process.
        if sock_path.exists() or sock_path.is_symlink():
            info = sock_path.lstat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
                raise AdmissionError("unsafe-broker-socket")
            sock_path.unlink()  # Only stale socket while holding the lifetime lock.
        server = socketserver.UnixStreamServer(str(sock_path), Handler)
        (home / "broker.pid").write_text(str(os.getpid()))
        server.admission = admission
        server.last_request = time.monotonic()
        server.timeout = 1
        os.chmod(sock_path, 0o600)
        try:
            while time.monotonic() - server.last_request < 15:
                server.handle_request()
        finally:
            server.server_close()
            # Bounded, non-secret process accounting for the requested idle/RAM checks.
            stats = {
                "pid": os.getpid(),
                "cpuSeconds": time.process_time(),
                "reason": "idle-exit",
            }
            temp = home / ("last-exit." + str(os.getpid()) + ".tmp")
            fd = os.open(
                temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
            )
            with os.fdopen(fd, "w") as handle:
                json.dump(stats, handle)
            os.replace(temp, home / "last-exit.json")
            if sock_path.exists():
                sock_path.unlink()
            (home / "broker.pid").unlink(missing_ok=True)
    finally:
        os.close(lock)
        admission.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path)
    args = parser.parse_args()
    try:
        serve(args.home)
    except Exception as error:
        code = (
            str(error) if isinstance(error, AdmissionError) else "admission-unavailable"
        )
        print(json.dumps({"ok": False, "error": re.sub(r"[^a-z0-9-]", "", code)[:100]}))
        raise SystemExit(1)
