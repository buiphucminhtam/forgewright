"""Local, per-user admission pipes with bounded, cancellable native I/O.

No pickle, network listener, lease authority, or process termination. A peer is
trusted only within the existing same-user boundary; this is not a sandbox for
hostile processes running as that user. Pending OVERLAPPED storage stays alive
until cancellation completion is observed.
"""

from contextlib import contextmanager
import ctypes
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import sys
import time

from host_admission_store import AdmissionError

MAX_REQUEST = 16384
MAX_RESPONSE = 65536
IDLE_SECONDS = 15


def support():
    if os.name != "nt":
        raise AdmissionError("platform-unavailable")
    runtime = Path(__file__).resolve().parent
    for directory in (runtime, runtime.parent / "lite"):
        if str(directory) not in sys.path:
            sys.path.insert(0, str(directory))
    import windows_secure_io

    return windows_secure_io


@contextmanager
def private_home(home, *, create=False):
    from windows_security import create_private_directory, is_private_path

    io = support()
    home = (
        Path(home)
        if home is not None
        else Path.home() / ".forgewright/runtime/admission"
    )
    if ".." in home.parts:
        raise AdmissionError("unsafe-state-directory")
    home = Path(os.path.abspath(home))
    for part in home.parts[1:]:
        io._safe_basename(part)
    if create:
        create_private_directory(home)
    with io.locked_directory_chain(Path(home.anchor), home):
        if not is_private_path(home, confidential=True):
            raise AdmissionError("unsafe-state-directory")
        for name in (
            "host.sqlite3",
            "host.sqlite3-wal",
            "host.sqlite3-shm",
            "host.sqlite3-journal",
            "broker.pid",
            "last-exit.json",
        ):
            path = home / name
            if os.path.lexists(path):
                info = path.lstat()
                if (
                    not stat.S_ISREG(info.st_mode)
                    or getattr(info, "st_file_attributes", 0) & 0x400
                    or not is_private_path(path, confidential=True)
                ):
                    raise AdmissionError("unsafe-state-file")
        yield home


def endpoint(home, sid):
    # The directory is pinned and checked before this resolved spelling is used.
    name = os.path.normcase(str(Path(home).resolve(strict=True)))
    digest = hashlib.sha256(sid + b"\0" + name.encode("utf-8")).hexdigest()
    return "\\\\.\\pipe\\forgewright-admission-" + digest


class NativePipe:
    def __init__(self):
        support()
        import _winapi
        from windows_security import _DirectoryProvisioner, _SecurityAttributes
        from windows_processes import NativeProcesses

        self.win = _winapi
        self.security = _DirectoryProvisioner()
        self.processes = NativeProcesses()
        self.sid = self.security.current_sid()
        self.kernel = self.security.kernel
        ptr, uint, boolean = ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int32
        signatures = {
            "CreateNamedPipeW": (
                [
                    ctypes.c_wchar_p,
                    uint,
                    uint,
                    uint,
                    uint,
                    uint,
                    uint,
                    ctypes.POINTER(_SecurityAttributes),
                ],
                ptr,
            ),
            "DisconnectNamedPipe": ([ptr], boolean),
            "GetNamedPipeClientProcessId": ([ptr, ctypes.POINTER(uint)], boolean),
            "GetNamedPipeServerProcessId": ([ptr, ctypes.POINTER(uint)], boolean),
        }
        for name, (args, result) in signatures.items():
            function = getattr(self.kernel, name)
            function.argtypes, function.restype = args, result

    def close(self, handle):
        if not self.kernel.CloseHandle(handle):
            raise ctypes.WinError(ctypes.get_last_error())

    def check_descriptor(self, handle):
        from windows_security import _descriptor_is_private

        descriptor = ctypes.c_void_p()
        code = self.security.advapi.GetSecurityInfo(
            handle, 1, 5, None, None, None, None, ctypes.byref(descriptor)
        )
        if code:
            raise ctypes.WinError(code)
        try:
            size = self.security.advapi.GetSecurityDescriptorLength(descriptor)
            if not descriptor or not 20 <= size <= 65536:
                raise AdmissionError("unsafe-broker-pipe")
            raw = ctypes.string_at(descriptor, size)
            if not _descriptor_is_private(
                raw, self.sid, self.security.equal_sid, confidential=True
            ):
                raise AdmissionError("unsafe-broker-pipe")
        finally:
            if self.kernel.LocalFree(descriptor):
                raise ctypes.WinError(ctypes.get_last_error())

    def process_sid(self, process):
        from windows_security import _sid

        token = ctypes.c_void_p()
        api = self.security.advapi
        if not api.OpenProcessToken(process, 8, ctypes.byref(token)):
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            size = ctypes.c_uint32()
            if (
                api.GetTokenInformation(token, 1, None, 0, ctypes.byref(size))
                or ctypes.get_last_error() != 122
            ):
                raise AdmissionError("broker-peer-unavailable")
            if not ctypes.sizeof(ctypes.c_void_p) + 4 <= size.value <= 65536:
                raise AdmissionError("broker-peer-unavailable")
            buffer = ctypes.create_string_buffer(size.value)
            if not api.GetTokenInformation(
                token, 1, buffer, len(buffer), ctypes.byref(size)
            ):
                raise ctypes.WinError(ctypes.get_last_error())
            if size.value > len(buffer):
                raise AdmissionError("broker-peer-unavailable")
            address = ctypes.c_void_p.from_buffer(buffer).value
            if not address:
                raise AdmissionError("broker-peer-unavailable")
            return _sid(buffer.raw, address - ctypes.addressof(buffer), size.value)
        finally:
            self.close(token)

    @contextmanager
    def peer(self, pipe, *, server):
        query = (
            self.kernel.GetNamedPipeServerProcessId
            if server
            else self.kernel.GetNamedPipeClientProcessId
        )
        pid = ctypes.c_uint32()
        if not query(pipe, ctypes.byref(pid)) or not pid.value:
            raise AdmissionError("broker-peer-unavailable")
        with self.processes.process(pid.value, synchronize=True) as process:
            if self.processes.api.WaitForSingleObject(process, 0) != 258:
                raise AdmissionError("broker-peer-unavailable")
            self.processes.birth(process)  # Must be a queryable live process instance.
            if not self.security.equal_sid(self.process_sid(process), self.sid):
                raise AdmissionError("broker-peer-mismatch")
            again = ctypes.c_uint32()
            if not query(pipe, ctypes.byref(again)) or again.value != pid.value:
                raise AdmissionError("broker-peer-mismatch")
            yield process  # Keep the process object/PID pinned for the exchange.

    def create(self, name):
        with self.security.private_attributes(self.sid) as attributes:
            handle = self.kernel.CreateNamedPipeW(
                name,
                3 | 0x40000000 | 0x80000,
                8,
                1,
                MAX_RESPONSE,
                MAX_REQUEST,
                100,
                ctypes.byref(attributes),
            )  # duplex, OVERLAPPED, FIRST_INSTANCE; byte mode, REJECT_REMOTE
            error = ctypes.get_last_error()
        if handle == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(error)
        try:
            self.check_descriptor(handle)
        except BaseException:
            self.close(handle)
            raise
        return handle

    def finish(self, operation, deadline):
        remaining = max(0, math.ceil((deadline - time.monotonic()) * 1000))
        try:
            result = self.win.WaitForSingleObject(operation.event, remaining)
            if result != 0:
                raise TimeoutError("broker-io-timeout")
        except BaseException:
            try:
                operation.cancel()
            except BaseException:
                os._exit(125)  # Unknown pending I/O cannot outlive its buffers.
            # Windows cancellation is asynchronous. Never free a pending buffer.
            if self.win.WaitForSingleObject(operation.event, 1000) != 0:
                # This process owns no workload. Exit closes its pipe handles;
                # SQLite retains uncertainty rather than continuing unsafe I/O.
                os._exit(125)
            operation.GetOverlappedResult(True)
            raise
        # CPython's already-connected ConnectNamedPipe event is synthetic;
        # its nonblocking result can be ERROR_IO_INCOMPLETE despite signaling.
        # Match CPython PipeListener: observe the event, then complete the result.
        size, error = operation.GetOverlappedResult(True)
        if error:
            raise ctypes.WinError(error)
        return size

    def connect(self, handle, deadline):
        operation = self.win.ConnectNamedPipe(handle, overlapped=True)
        self.finish(operation, deadline)

    def read_line(self, handle, limit, deadline):
        result = bytearray()
        while b"\n" not in result:
            operation, _ = self.win.ReadFile(
                handle, min(4096, limit + 1 - len(result)), overlapped=True
            )
            count = self.finish(operation, deadline)
            if not count:
                raise EOFError("broker-disconnected")
            result.extend(operation.getbuffer())
            if len(result) > limit:
                raise AdmissionError("request-too-large")
        if result.find(b"\n") != len(result) - 1:
            raise AdmissionError("invalid-request")
        return bytes(result)

    def write(self, handle, raw, deadline):
        operation, _ = self.win.WriteFile(handle, raw, overlapped=True)
        if self.finish(operation, deadline) != len(raw):
            raise OSError("incomplete pipe write")

    def open(self, name, deadline):
        while True:
            try:
                # Identification-only SQOS prevents a server impersonating us.
                handle = self.win.CreateFile(name, 0xC0020000, 0, 0, 3, 0x40110000, 0)
                break
            except OSError as error:
                if error.winerror != 231:
                    raise
                if time.monotonic() >= deadline:
                    raise TimeoutError("broker-connect-timeout") from error
                time.sleep(min(0.01, max(0, deadline - time.monotonic())))
        try:
            self.check_descriptor(handle)
        except BaseException:
            self.close(handle)
            raise
        return handle


def request_bytes(home, raw, *, timeout=3.5):
    if (
        not isinstance(timeout, (float, int))
        or not math.isfinite(timeout)
        or not 0 < timeout <= 3.5
    ):
        raise ValueError("invalid broker deadline")
    if not raw or len(raw) > MAX_REQUEST or not raw.endswith(b"\n"):
        raise AdmissionError("request-too-large")
    deadline = time.monotonic() + timeout
    with private_home(home) as home:
        native = NativePipe()
        handle = native.open(endpoint(home, native.sid), deadline)
        try:
            with native.peer(handle, server=True):
                native.write(handle, raw, deadline)
                response = native.read_line(handle, MAX_RESPONSE, deadline)
                # Bounded acknowledgment prevents DisconnectNamedPipe discarding
                # a queued reply. This is transport receipt, never a lease release.
                native.write(handle, b"\x06", deadline)
                return response
        finally:
            native.close(handle)


def publish(home, name, value):
    from windows_security import is_private_path

    path = home / name
    fd = support().open_anchored_lock_file(home, home, path)
    try:
        if not is_private_path(path, confidential=True):
            raise AdmissionError("unsafe-state-file")
        # Non-secret accounting only; never used to grant ownership or a lease.
        # The lifetime directory pin prevents atomic directory-relative rename.
        raw = json.dumps(value).encode()
        os.ftruncate(fd, 0)
        if os.write(fd, raw) != len(raw):
            raise OSError("incomplete accounting write")
        os.fsync(fd)
    finally:
        os.close(fd)


def serve(home, admission_factory, dispatch, protocol):
    with private_home(home, create=True) as home:
        native = NativePipe()
        try:
            handle = native.create(endpoint(home, native.sid))
        except OSError as error:
            if error.winerror not in (5, 231):
                raise
            # Do not mistake an inaccessible/squatted endpoint for our broker.
            reply = json.loads(
                request_bytes(
                    home,
                    json.dumps({"schema": protocol, "action": "ping"}).encode() + b"\n",
                )
            )
            if reply.get("ok") is not True or reply.get("schema") != protocol:
                raise AdmissionError("broker-owner-unconfirmed") from error
            return
        admission = None
        try:
            admission = admission_factory(home)
            publish(home, "broker.pid", os.getpid())
            idle = time.monotonic() + IDLE_SECONDS
            while time.monotonic() < idle:
                try:
                    native.connect(handle, idle)
                except TimeoutError:
                    break
                except OSError as error:
                    if error.winerror not in (109, 232):
                        raise
                    # A client may disappear before ConnectNamedPipe is issued.
                    if (
                        not native.kernel.DisconnectNamedPipe(handle)
                        and ctypes.get_last_error() != 233
                    ):
                        raise ctypes.WinError(ctypes.get_last_error())
                    continue
                try:
                    with native.peer(handle, server=False):
                        raw = native.read_line(
                            handle, MAX_REQUEST, min(idle, time.monotonic() + 1)
                        )
                        try:
                            data = dispatch(admission, json.loads(raw))
                            reply = {"ok": True, "schema": protocol, "data": data}
                        except (
                            AdmissionError,
                            ValueError,
                            TypeError,
                            KeyError,
                        ) as error:
                            reply = {
                                "ok": False,
                                "schema": protocol,
                                "error": str(error)
                                if isinstance(error, AdmissionError)
                                else "invalid-request",
                            }
                        except Exception:
                            reply = {
                                "ok": False,
                                "schema": protocol,
                                "error": "admission-unavailable",
                            }
                        encoded = (
                            json.dumps(reply, separators=(",", ":")).encode() + b"\n"
                        )
                        if len(encoded) > MAX_RESPONSE:
                            raise AdmissionError("response-too-large")
                        native.write(handle, encoded, time.monotonic() + 1)
                        operation, _ = native.win.ReadFile(handle, 1, overlapped=True)
                        native.finish(operation, time.monotonic() + 1)
                        if bytes(operation.getbuffer()) != b"\x06":
                            raise AdmissionError("invalid-acknowledgment")
                        idle = time.monotonic() + IDLE_SECONDS
                except (OSError, EOFError, TimeoutError, AdmissionError):
                    pass  # No inferred release; a lost reply can have committed.
                finally:
                    if (
                        not native.kernel.DisconnectNamedPipe(handle)
                        and ctypes.get_last_error() != 233
                    ):
                        raise ctypes.WinError(ctypes.get_last_error())
            publish(
                home,
                "last-exit.json",
                {
                    "pid": os.getpid(),
                    "cpuSeconds": time.process_time(),
                    "reason": "idle-exit",
                },
            )
        finally:
            try:
                if admission is not None:
                    admission.close()
                    (home / "broker.pid").unlink(missing_ok=True)
            finally:
                native.close(handle)
