"""Read physical RAM and kernel memory pressure; never infer pressure from %."""

from __future__ import annotations

import ctypes
import os


class MemoryStatusEx(ctypes.Structure):
    # Fixed-width Windows ABI types also allow portable fault-injection tests.
    _fields_ = [
        ("dwLength", ctypes.c_uint32),
        ("dwMemoryLoad", ctypes.c_uint32),
        ("ullTotalPhys", ctypes.c_uint64),
        ("ullAvailPhys", ctypes.c_uint64),
        ("ullTotalPageFile", ctypes.c_uint64),
        ("ullAvailPageFile", ctypes.c_uint64),
        ("ullTotalVirtual", ctypes.c_uint64),
        ("ullAvailVirtual", ctypes.c_uint64),
        ("ullAvailExtendedVirtual", ctypes.c_uint64),
    ]


def _load_library():
    if os.name != "nt":
        raise OSError("windows-memory-platform-unavailable")
    # LOAD_LIBRARY_SEARCH_SYSTEM32; never resolve a workspace/PATH DLL.
    return ctypes.WinDLL("kernel32.dll", use_last_error=True, winmode=0x00000800)


def _kernel32():
    if (
        ctypes.sizeof(MemoryStatusEx) != 64
        or ctypes.sizeof(ctypes.c_void_p) not in (4, 8)
        or [getattr(MemoryStatusEx, name).offset for name, _ in MemoryStatusEx._fields_]
        != [0, 4, 8, 16, 24, 32, 40, 48, 56]
    ):
        raise OSError("windows-memory-layout-invalid")
    kernel = _load_library()
    signatures = (
        ("GlobalMemoryStatusEx", [ctypes.POINTER(MemoryStatusEx)], ctypes.c_int32),
        ("CreateMemoryResourceNotification", [ctypes.c_int32], ctypes.c_void_p),
        (
            "QueryMemoryResourceNotification",
            [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int32)],
            ctypes.c_int32,
        ),
        ("CloseHandle", [ctypes.c_void_p], ctypes.c_int32),
    )
    try:
        for name, arguments, result in signatures:
            function = getattr(kernel, name)
            function.argtypes, function.restype = arguments, result
    except (AttributeError, TypeError) as exc:
        raise OSError("windows-memory-api-unavailable") from exc
    return kernel


def read_memory() -> tuple[int, int, str]:
    """Return a volatile observation, after every owned handle closes successfully.

    The documented middle band (neither notification) maps to warning. Two
    agreeing query pairs reduce transition ambiguity; disagreement or both set
    is unknown. This is not an atomic snapshot or a memory reservation.
    PageFile fields represent commit limits/headroom, so are deliberately unused.
    """
    kernel = _kernel32()
    handles = []
    try:
        status = MemoryStatusEx()
        status.dwLength = ctypes.sizeof(status)
        if not kernel.GlobalMemoryStatusEx(ctypes.byref(status)):
            raise OSError("windows-memory-status-unavailable")
        if (
            status.dwLength != 64
            or status.dwMemoryLoad > 100
            or not 0 < status.ullTotalPhys
            or status.ullAvailPhys > status.ullTotalPhys
            or status.ullAvailExtendedVirtual != 0
        ):
            raise OSError("windows-memory-status-invalid")
        for kind in (
            0,
            1,
        ):  # LowMemoryResourceNotification, HighMemoryResourceNotification
            handle = kernel.CreateMemoryResourceNotification(kind)
            if (
                type(handle) is not int
                or not 0 < handle < ctypes.c_void_p(-1).value
                or handle in handles
            ):
                raise OSError("windows-memory-handle-invalid")
            handles.append(handle)
        states = []
        for _ in range(2):
            pair = []
            for handle in handles:
                state = ctypes.c_int32(-1)  # Detect success without a written output.
                if not kernel.QueryMemoryResourceNotification(
                    handle, ctypes.byref(state)
                ):
                    raise OSError("windows-memory-query-unavailable")
                if state.value not in (0, 1):
                    raise OSError("windows-memory-state-invalid")
                pair.append(state.value)
            states.append(tuple(pair))
        pressure = "unknown"
        if states[0] == states[1]:
            pressure = {(0, 1): "normal", (1, 0): "critical", (0, 0): "warning"}.get(
                states[0],
                "unknown",
            )
        return status.ullTotalPhys, status.ullAvailPhys, pressure
    finally:
        close_failed = False
        for handle in reversed(handles):
            try:
                if not kernel.CloseHandle(handle):
                    close_failed = True
            except Exception:
                close_failed = True
        if close_failed:
            # Do not retry an uncertain close: that could close a reused handle.
            raise OSError("windows-memory-close-unconfirmed")
