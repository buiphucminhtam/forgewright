"""Windows ACL inspection and exclusive private-directory provisioning.

Inspection is a snapshot, not a filesystem lock or an AccessCheck replacement. It
rejects a reparse leaf through the same handle used to query its ACL. It does
not prevent same-user ACL/path replacement races after the snapshot or inspect
ancestors; callers must retain their trusted-root/parent-chain guards.
Only ordinary allow/deny ACEs are understood. Unknown ACEs fail closed.
Provisioning creates new directories only; it never changes an existing ACL.

API references:
https://learn.microsoft.com/windows/win32/api/aclapi/nf-aclapi-getsecurityinfo
https://learn.microsoft.com/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation
https://learn.microsoft.com/windows/win32/fileio/file-access-rights-constants
"""

import ctypes
import errno
import importlib.util
import os
import struct
from contextlib import ExitStack, contextmanager
from pathlib import Path


# SID bytes are architecture-independent: revision, count, authority, subauthorities.
_SYSTEM = bytes.fromhex("010100000000000512000000")  # S-1-5-18
_ADMINISTRATORS = bytes.fromhex("01020000000000052000000020020000")
_OWNER_RIGHTS = bytes.fromhex("010100000000000304000000")  # S-1-3-4
_CREATOR_OWNER = bytes.fromhex("010100000000000300000000")  # S-1-3-0
# FILE_READ_DATA/EA/ATTRIBUTES, EXECUTE, READ_CONTROL, SYNCHRONIZE,
# GENERIC_READ and GENERIC_EXECUTE. Everything else is conservatively writable.
_READ_ONLY = 0xA01200A9


def _invalid(message):
    return OSError(errno.EINVAL, "Invalid Windows security information: " + message)


def _sid(data, offset, end):
    if offset < 0 or offset + 8 > end or end > len(data):
        raise _invalid("SID header bounds")
    revision, count = data[offset : offset + 2]
    length = 8 + count * 4
    if revision != 1 or count > 15 or offset + length > end:
        raise _invalid("SID revision/length")
    return data[offset : offset + length]


def _canonical_sid_equal(left, right):
    for value in (left, right):
        if _sid(value, 0, len(value)) != value:
            raise _invalid("noncanonical SID")
    return left == right


def _descriptor_is_private(
    data, current_sid, sid_equal=_canonical_sid_equal, *, confidential=False
):
    """Evaluate bounded self-relative bytes; malformed input is never success."""
    if len(data) < 20:
        raise _invalid("descriptor header")
    revision, _, control, owner, _, _, dacl = struct.unpack_from("<BBHIIII", data)
    if revision != 1 or not control & 0x8000:  # SE_SELF_RELATIVE
        raise _invalid("descriptor revision/format")
    if not owner:
        return False
    if owner < 20 or owner % 4:
        raise _invalid("owner offset")
    owner_sid = _sid(data, owner, len(data))
    if not sid_equal(owner_sid, current_sid):
        return False
    if not control & 4 or not dacl:  # absent or NULL DACL allows everyone
        return False
    if dacl < 20 or dacl % 4 or dacl + 8 > len(data):
        raise _invalid("DACL offset")
    acl_revision, reserved, size, count, reserved2 = struct.unpack_from(
        "<BBHHH", data, dacl
    )
    if (
        acl_revision not in (2, 4)
        or reserved
        or reserved2
        or size < 8
        or dacl + size > len(data)
    ):
        raise _invalid("DACL header/length")
    end = dacl + size
    cursor = dacl + 8
    # Owner-relative aliases are trusted ONLY after the exact owner check above.
    trusted = (current_sid, _SYSTEM, _ADMINISTRATORS, _OWNER_RIGHTS, _CREATOR_OWNER)
    for _ in range(count):
        if cursor + 4 > end:
            raise _invalid("ACE header bounds")
        kind, flags, ace_size = struct.unpack_from("<BBH", data, cursor)
        if ace_size < 4 or ace_size % 4 or cursor + ace_size > end:
            raise _invalid("ACE length")
        if kind not in (0, 1) or flags & ~0x1F:
            return False
        if ace_size < 16:
            raise _invalid("ordinary ACE length")
        mask = struct.unpack_from("<I", data, cursor + 4)[0]
        trustee = _sid(data, cursor + 8, cursor + ace_size)
        if 8 + len(trustee) != ace_size:
            raise _invalid("ordinary ACE trailing bytes")
        # Denies never authorize writes and never excuse a later unsafe allow.
        # INHERIT_ONLY_ACE is intentionally not filtered out.
        if (
            kind == 0
            and (mask if confidential else mask & ~_READ_ONLY)
            and not any(sid_equal(trustee, sid) for sid in trusted)
        ):
            return False
        cursor += ace_size
    return True


class _FileInformation(ctypes.Structure):
    """BY_HANDLE_FILE_INFORMATION: DWORD attributes, three FILETIMEs, six DWORDs."""

    _fields_ = [
        ("attributes", ctypes.c_uint32),
        ("creation", ctypes.c_uint32 * 2),
        ("last_access", ctypes.c_uint32 * 2),
        ("last_write", ctypes.c_uint32 * 2),
        ("volume", ctypes.c_uint32),
        ("size_high", ctypes.c_uint32),
        ("size_low", ctypes.c_uint32),
        ("links", ctypes.c_uint32),
        ("index_high", ctypes.c_uint32),
        ("index_low", ctypes.c_uint32),
    ]


class _Native:
    """Explicit pointer-width signatures for all acquired native resources."""

    def __init__(self):
        if os.name != "nt":
            raise OSError(errno.ENOSYS, "Windows security queries require Windows")
        self.advapi = ctypes.WinDLL("advapi32", use_last_error=True)
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        ptr = ctypes.c_void_p
        out = ctypes.POINTER(ptr)
        dword = ctypes.c_uint32
        boolean = ctypes.c_int32
        signatures = (
            (
                self.advapi,
                "GetSecurityInfo",
                [ptr, dword, dword, out, out, out, out, out],
                dword,
            ),
            (self.advapi, "IsValidAcl", [ptr], boolean),
            (self.advapi, "IsValidSid", [ptr], boolean),
            (self.advapi, "EqualSid", [ptr, ptr], boolean),
            (self.advapi, "GetLengthSid", [ptr], dword),
            (self.advapi, "IsValidSecurityDescriptor", [ptr], boolean),
            (
                self.advapi,
                "GetSecurityDescriptorControl",
                [ptr, ctypes.POINTER(ctypes.c_uint16), ctypes.POINTER(dword)],
                boolean,
            ),
            (self.advapi, "GetSecurityDescriptorLength", [ptr], dword),
            (self.advapi, "OpenThreadToken", [ptr, dword, boolean, out], boolean),
            (self.advapi, "OpenProcessToken", [ptr, dword, out], boolean),
            (
                self.advapi,
                "GetTokenInformation",
                [ptr, dword, ptr, dword, ctypes.POINTER(dword)],
                boolean,
            ),
            (self.kernel, "GetCurrentProcess", [], ptr),
            (self.kernel, "GetCurrentThread", [], ptr),
            (
                self.kernel,
                "CreateFileW",
                [ctypes.c_wchar_p, dword, dword, ptr, dword, dword, ptr],
                ptr,
            ),
            (
                self.kernel,
                "GetFileInformationByHandle",
                [ptr, ctypes.POINTER(_FileInformation)],
                boolean,
            ),
            (self.kernel, "CloseHandle", [ptr], boolean),
            (self.kernel, "LocalFree", [ptr], ptr),
        )
        for library, name, args, result in signatures:
            function = getattr(library, name)
            function.argtypes = args
            function.restype = result

    def equal_sid(self, left, right):
        _canonical_sid_equal(left, right)  # bounds/revision before native reads
        buffers = [ctypes.create_string_buffer(value) for value in (left, right)]
        for value, buffer in zip((left, right), buffers):
            if not self.advapi.IsValidSid(buffer) or self.advapi.GetLengthSid(
                buffer
            ) != len(value):
                raise _invalid("native SID")
        return bool(self.advapi.EqualSid(*buffers))

    def current_sid(self):
        token = ctypes.c_void_p()
        if not self.advapi.OpenThreadToken(
            self.kernel.GetCurrentThread(), 8, True, ctypes.byref(token)
        ):
            error = ctypes.get_last_error()
            if error != 1008:  # ERROR_NO_TOKEN: only then use the process token
                raise ctypes.WinError(error)
            if not self.advapi.OpenProcessToken(
                self.kernel.GetCurrentProcess(), 8, ctypes.byref(token)
            ):
                raise ctypes.WinError(ctypes.get_last_error())
        try:
            needed = ctypes.c_uint32()
            result = self.advapi.GetTokenInformation(
                token, 1, None, 0, ctypes.byref(needed)
            )
            if result or ctypes.get_last_error() != 122:  # ERROR_INSUFFICIENT_BUFFER
                raise _invalid("TokenUser size query")
            size = needed.value
            if size < ctypes.sizeof(ctypes.c_void_p) + 4 or size > 65536:
                raise _invalid("TokenUser size")
            buffer = ctypes.create_string_buffer(size)
            if not self.advapi.GetTokenInformation(
                token, 1, buffer, size, ctypes.byref(needed)
            ):
                raise ctypes.WinError(ctypes.get_last_error())
            if needed.value > size or needed.value < ctypes.sizeof(ctypes.c_void_p) + 4:
                raise _invalid("TokenUser returned length")
            address = ctypes.c_void_p.from_buffer(buffer).value
            if not address:
                raise _invalid("TokenUser NULL SID")
            sid = _sid(buffer.raw, address - ctypes.addressof(buffer), needed.value)
            if not self.equal_sid(sid, sid):
                raise _invalid("TokenUser SID")
            return sid
        finally:
            if not self.kernel.CloseHandle(token):
                raise ctypes.WinError(ctypes.get_last_error())

    def descriptor(self, path):
        # READ_CONTROL | FILE_READ_ATTRIBUTES, share read/write but not delete;
        # OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT.
        handle = ctypes.c_void_p(
            self.kernel.CreateFileW(path, 0x20080, 3, None, 3, 0x02200000, None)
        )
        if not handle.value or handle.value == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        descriptor = ctypes.c_void_p()
        try:
            if self.is_reparse(handle):
                return None
            dacl = ctypes.c_void_p()
            result = self.advapi.GetSecurityInfo(
                handle,
                1,
                5,
                None,
                None,
                ctypes.byref(dacl),
                None,
                ctypes.byref(descriptor),
            )  # SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION
            if result:
                raise ctypes.WinError(result)
            if not descriptor.value or not self.advapi.IsValidSecurityDescriptor(
                descriptor
            ):
                raise _invalid("native descriptor")
            if dacl.value and not self.advapi.IsValidAcl(dacl):
                raise _invalid("native DACL")
            control = ctypes.c_uint16()
            revision = ctypes.c_uint32()
            if not self.advapi.GetSecurityDescriptorControl(
                descriptor, ctypes.byref(control), ctypes.byref(revision)
            ):
                raise ctypes.WinError(ctypes.get_last_error())
            if revision.value != 1 or not control.value & 0x8000:
                raise _invalid("native descriptor is not self-relative")
            size = self.advapi.GetSecurityDescriptorLength(descriptor)
            if size < 20 or size > 1024 * 1024:
                raise _invalid("native descriptor size")
            data = ctypes.string_at(descriptor, size)
            # Catch an observed transition to a reparse point during the query.
            # This does not promise protection from a hostile same-user ABA race.
            return None if self.is_reparse(handle) else data
        finally:
            try:
                if descriptor.value and self.kernel.LocalFree(descriptor):
                    raise ctypes.WinError(ctypes.get_last_error())
            finally:
                if not self.kernel.CloseHandle(handle):
                    raise ctypes.WinError(ctypes.get_last_error())

    def is_reparse(self, handle):
        information = _FileInformation()
        if not self.kernel.GetFileInformationByHandle(
            handle, ctypes.byref(information)
        ):
            raise ctypes.WinError(ctypes.get_last_error())
        return bool(information.attributes & 0x400)  # FILE_ATTRIBUTE_REPARSE_POINT


def is_private_path(path, *, confidential=False) -> bool:
    """Return policy approval, or raise OSError when native state is unknown.

    The effective token user must own the path exactly. Only that SID, SYSTEM
    and BUILTIN\\Administrators may have any allow ACE beyond read/execute;
    OWNER RIGHTS/CREATOR OWNER are accepted only after exact owner matching.
    Read-only grants to other principals are permitted by the default integrity
    policy. With confidential=True, every nonzero foreign allow ACE is rejected,
    including read/execute/metadata access and inherit-only grants, for private
    token-bearing files and their directories. NULL/absent DACLs,
    foreign owners, and unsupported ACEs are rejected. No ACLs are modified.
    """
    name = os.fsdecode(os.fspath(path))
    if not name or "\x00" in name:
        raise _invalid("empty or NUL-containing path")
    native = _Native()
    current = native.current_sid()
    data = native.descriptor(os.path.abspath(name))
    return (
        False
        if data is None
        else _descriptor_is_private(
            data, current, native.equal_sid, confidential=confidential
        )
    )


class _SecurityAttributes(ctypes.Structure):
    _fields_ = [
        ("length", ctypes.c_uint32),
        ("descriptor", ctypes.c_void_p),
        ("inherit_handle", ctypes.c_int32),
    ]


class _DirectoryProvisioner(_Native):
    def __init__(self):
        super().__init__()
        convert = self.advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW
        convert.argtypes = [
            ctypes.c_wchar_p,
            ctypes.c_uint32,
            ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(ctypes.c_uint32),
        ]
        convert.restype = ctypes.c_int32
        self.kernel.CreateDirectoryW.argtypes = [
            ctypes.c_wchar_p,
            ctypes.POINTER(_SecurityAttributes),
        ]
        self.kernel.CreateDirectoryW.restype = ctypes.c_int32

    @contextmanager
    def private_attributes(self, sid):
        # The SID came from the effective token and was natively validated.
        # SID authority is big-endian; each subauthority is a little-endian DWORD.
        _canonical_sid_equal(sid, sid)
        authority = int.from_bytes(sid[2:8], "big")
        parts = [
            str(struct.unpack_from("<I", sid, offset)[0])
            for offset in range(8, len(sid), 4)
        ]
        user = f"S-{sid[0]}-{authority}" + "".join("-" + part for part in parts)
        sddl = f"O:{user}D:P(A;OICI;FA;;;{user})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)"
        descriptor = ctypes.c_void_p()
        size = ctypes.c_uint32()
        try:
            if not self.advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl, 1, ctypes.byref(descriptor), ctypes.byref(size)
            ):
                raise ctypes.WinError(ctypes.get_last_error())
            if (
                not descriptor.value
                or not 20 <= size.value <= 65536
                or not self.advapi.IsValidSecurityDescriptor(descriptor)
            ):
                raise _invalid("directory creation descriptor")
            raw = ctypes.string_at(descriptor, size.value)
            if not struct.unpack_from("<H", raw, 2)[
                0
            ] & 0x1000 or not _descriptor_is_private(
                raw, sid, self.equal_sid, confidential=True
            ):
                raise _invalid("directory creation DACL is not protected/private")
            yield _SecurityAttributes(ctypes.sizeof(_SecurityAttributes), descriptor, 0)
        finally:
            if descriptor.value and self.kernel.LocalFree(descriptor):
                raise ctypes.WinError(ctypes.get_last_error())


def create_private_directory(path) -> Path:
    """Create missing directories with a protected confidential DACL from birth.

    Existing ancestors are containers, not inferred authority: their ACLs are
    never changed. All ancestors are pinned and reparse points rejected. An
    existing target is accepted only if already confidential and owned by the
    effective token user. A racing create is refused, even if its ACL is safe.

    Returns an absolute lexical Path. Writes no payload, modifies no existing
    ACL, and never deletes a path on failure (empty protected ancestors may
    remain). Pinning ends on return: callers still validate before secret writes.
    This does not authenticate hostile same-user writers or prevent a writable
    ancestor from causing denial of service after the handles are released.
    """
    native = _DirectoryProvisioner()  # Fail closed on unsupported platforms.
    # RLG installs a flat source-bound manifest; MCP preserves scripts/lite.
    helper = Path(__file__).resolve().with_name("windows_secure_io.py")
    if not os.path.lexists(helper):
        helper = Path(__file__).resolve().parents[1] / "lite/windows_secure_io.py"
    spec = importlib.util.spec_from_file_location("forgewright_private_directory_io", helper)
    io = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(io)

    name = os.fsdecode(os.fspath(path))
    if not name or "\0" in name or ".." in Path(name).parts:
        raise _invalid("private directory path")
    target = Path(os.path.abspath(name))
    try:
        for part in target.relative_to(Path(target.anchor)).parts:
            io._safe_basename(part)
        missing = []
        existing = target
        while True:
            try:
                before = existing.lstat()
                break
            except FileNotFoundError:
                if existing.parent == existing:
                    raise
                missing.append(existing)
                existing = existing.parent
        with ExitStack() as stack:
            stack.enter_context(
                io.locked_directory_chain(Path(target.anchor), existing)
            )
            pinned = existing.lstat()
            if (pinned.st_dev, pinned.st_ino) != (before.st_dev, before.st_ino):
                raise _invalid("directory ancestor changed while opening")
            current_sid = native.current_sid()
            if not missing:
                data = native.descriptor(str(target))
                if data is None or not _descriptor_is_private(
                    data, current_sid, native.equal_sid, confidential=True
                ):
                    raise PermissionError(
                        errno.EACCES, "existing directory is not private", str(target)
                    )
                return target
            with native.private_attributes(current_sid) as attributes:
                for directory in reversed(missing):
                    # No exists-ok fallback: concurrent creation is not ours.
                    if not native.kernel.CreateDirectoryW(
                        str(directory), ctypes.byref(attributes)
                    ):
                        raise ctypes.WinError(ctypes.get_last_error())
                    created = directory.lstat()
                    stack.enter_context(io.locked_directory_chain(directory, directory))
                    pinned = directory.lstat()
                    if (pinned.st_dev, pinned.st_ino) != (
                        created.st_dev,
                        created.st_ino,
                    ):
                        raise _invalid("created directory changed before pinning")
                    data = native.descriptor(str(directory))
                    if (
                        data is None
                        or not struct.unpack_from("<H", data, 2)[0] & 0x1000
                        or not _descriptor_is_private(
                            data, current_sid, native.equal_sid, confidential=True
                        )
                    ):
                        raise PermissionError(
                            errno.EACCES,
                            "created directory is not protected/private",
                            str(directory),
                        )
            return target
    except ValueError as error:
        raise _invalid(str(error)) from error
