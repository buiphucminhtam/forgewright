"""Windows storage operations pinned to native no-follow handles.

Only known symlink/junction leaves are counted or unlinked, never traversed.
Unknown native metadata, sharing conflicts and ACLs preserve data. Like the
POSIX backend this is not isolation from a malicious same-user producer.
"""

from contextlib import contextmanager, ExitStack
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import time
import uuid

from windows_security import _Native, _FileInformation, _descriptor_is_private

# Resolve only framework-owned locations, independent of cwd/PYTHONPATH.
# Installed runtimes are flat; source checkouts keep the helper under ../lite.
_helper_path = Path(__file__).resolve().with_name("windows_secure_io.py")
if not os.path.lexists(_helper_path):
    _helper_path = Path(__file__).resolve().parents[1] / "lite/windows_secure_io.py"
_spec = importlib.util.spec_from_file_location(
    "forgewright_windows_storage_secure_io", _helper_path
)
secure = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(secure)


def sync_directory(folder):
    """Flush a no-follow native directory handle; failure never means durable."""
    if os.name != "nt":
        raise OSError("native Windows directory flush required")
    from windows_security import _Native, _FileInformation

    folder = Path(os.path.abspath(folder))
    native = _Native()
    with secure.locked_directory_chain(Path(folder.anchor), folder.parent):
        # GENERIC_WRITE is required by FlushFileBuffers. OPEN_REPARSE_POINT
        # binds the check and flush to one directory; no delete/write sharing.
        handle = native.kernel.CreateFileW(
            str(folder), 0x40000080, 1, None, 3, 0x02200000, None
        )
        if handle == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            info = _FileInformation()
            if not native.kernel.GetFileInformationByHandle(handle, ctypes.byref(info)):
                raise ctypes.WinError(ctypes.get_last_error())
            if not info.attributes & 0x10 or info.attributes & 0x400:
                raise OSError("unsafe-history-directory")
            flush = native.kernel.FlushFileBuffers
            flush.argtypes = [ctypes.c_void_p]
            flush.restype = ctypes.c_int32
            if not flush(handle):
                raise ctypes.WinError(ctypes.get_last_error())
        finally:
            if not native.kernel.CloseHandle(handle):
                raise ctypes.WinError(ctypes.get_last_error())


def error(code):
    from project_storage import StorageError

    return StorageError(code)


@contextmanager
def pinned(path):
    path = Path(os.path.abspath(path))
    with ExitStack() as stack:
        try:
            handles = stack.enter_context(
                secure.locked_directory_chain(Path(path.anchor), path)
            )
        except ValueError as exc:
            raise error("storage-unavailable") from exc
        if not handles:
            raise OSError("Windows directory handles unavailable")
        yield path


@contextmanager
def publication_parent(path):
    path = Path(os.path.abspath(path))
    with pinned(path.parent):
        handle = secure._open_publication_directory(path)
        try:
            yield path
        finally:
            secure._close_windows_handle(handle)


def _private_handle(native, handle, *, confidential=False):
    descriptor = ctypes.c_void_p()
    try:
        result = native.advapi.GetSecurityInfo(
            handle, 1, 5, None, None, None, None, ctypes.byref(descriptor)
        )
        if result:
            raise ctypes.WinError(result)
        if not descriptor.value or not native.advapi.IsValidSecurityDescriptor(
            descriptor
        ):
            raise OSError("invalid-storage-security")
        size = native.advapi.GetSecurityDescriptorLength(descriptor)
        if not 20 <= size <= 1024 * 1024:
            raise OSError("invalid-storage-security")
        if not _descriptor_is_private(
            ctypes.string_at(descriptor, size),
            native.current_sid(),
            native.equal_sid,
            confidential=confidential,
        ):
            raise error("storage-ownership-unconfirmed")
    finally:
        if descriptor.value and native.kernel.LocalFree(descriptor):
            raise ctypes.WinError(ctypes.get_last_error())


@contextmanager
def entry(path, *, delete=False, private=False, read=False):
    """Caller pins ancestors; retain a no-write/no-delete-share leaf handle."""
    import msvcrt

    path = Path(path)
    secure._safe_basename(path.name)
    native = _Native()
    access = 0x20080 | (0x10000 if delete else 0) | (0x80000000 if read else 0)
    handle = native.kernel.CreateFileW(str(path), access, 1, None, 3, 0x02200000, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    descriptor = None
    try:
        native_info = _FileInformation()
        if not native.kernel.GetFileInformationByHandle(
            handle, ctypes.byref(native_info)
        ):
            raise ctypes.WinError(ctypes.get_last_error())
        info = path.lstat()

        class FileIdInfo(ctypes.Structure):
            _fields_ = [
                ("volume", ctypes.c_uint64),
                ("identifier", ctypes.c_ubyte * 16),
            ]

        identity = FileIdInfo()
        query = native.kernel.GetFileInformationByHandleEx
        query.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_void_p,
            ctypes.c_uint32,
        ]
        query.restype = ctypes.c_int32
        if not query(handle, 18, ctypes.byref(identity), ctypes.sizeof(identity)):
            raise ctypes.WinError(ctypes.get_last_error())
        if (info.st_dev, info.st_ino) != (
            identity.volume,
            int.from_bytes(identity.identifier, "little"),
        ):
            raise error("storage-drift")
        if bool(info.st_file_attributes & 0x400) != bool(
            native_info.attributes & 0x400
        ):
            raise error("storage-drift")
        if native_info.attributes & 0x400:
            if info.st_reparse_tag not in (0xA000000C, 0xA0000003):
                raise error("storage-reparse-unconfirmed")
        elif not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
            raise error("storage-special-file")
        if private:
            _private_handle(native, handle)
        descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
        yield descriptor, info
    finally:
        if descriptor is not None:
            os.close(descriptor)
        elif not native.kernel.CloseHandle(handle):
            raise ctypes.WinError(ctypes.get_last_error())


def measure_tree(path, *, max_entries, timeout, visitor, active):
    from project_storage import _manifest_entry

    deadline = time.monotonic() + timeout
    count = logical = allocated = 0
    digest = hashlib.sha256()
    path = Path(os.path.abspath(path))
    try:
        with pinned(path):
            initial = path.lstat()
            device = initial.st_dev

            def visit(directory, prefix):
                nonlocal count, logical, allocated
                if prefix.count("/") > 64:
                    raise error("storage-census-incomplete")
                names = []
                with os.scandir(directory) as entries:
                    for item in entries:
                        if (
                            time.monotonic() >= deadline
                            or count + len(names) >= max_entries
                        ):
                            raise error("storage-census-incomplete")
                        names.append(item.name)
                for name in sorted(names):
                    if time.monotonic() >= deadline or count >= max_entries:
                        raise error("storage-census-incomplete")
                    child = directory / name
                    try:
                        with entry(child) as (_, info):
                            if info.st_dev != device:
                                raise error("storage-cross-volume")
                            relative = prefix + name
                            row = [
                                relative,
                                info.st_mode,
                                info.st_dev,
                                info.st_ino,
                                info.st_nlink,
                                info.st_size,
                                info.st_mtime_ns,
                                info.st_ctime_ns,
                            ]
                            digest.update(
                                json.dumps(row, separators=(",", ":")).encode() + b"\n"
                            )
                            count += 1
                            if visitor:
                                visitor(relative, info)
                            if (
                                stat.S_ISDIR(info.st_mode)
                                and not info.st_file_attributes & 0x400
                            ):
                                visit(child, relative + "/")
                            else:
                                logical += info.st_size
                                # AllocationSize comes from the held no-follow handle.
                                import msvcrt

                                class StandardInfo(ctypes.Structure):
                                    _fields_ = [
                                        ("allocation", ctypes.c_int64),
                                        ("end", ctypes.c_int64),
                                        ("links", ctypes.c_uint32),
                                        ("pending", ctypes.c_ubyte),
                                        ("directory", ctypes.c_ubyte),
                                    ]

                                native = _Native()
                                query = native.kernel.GetFileInformationByHandleEx
                                query.argtypes = [
                                    ctypes.c_void_p,
                                    ctypes.c_int,
                                    ctypes.c_void_p,
                                    ctypes.c_uint32,
                                ]
                                query.restype = ctypes.c_int32
                                standard = StandardInfo()
                                if not query(
                                    msvcrt.get_osfhandle(_),
                                    1,
                                    ctypes.byref(standard),
                                    ctypes.sizeof(standard),
                                ):
                                    raise ctypes.WinError(ctypes.get_last_error())
                                if standard.allocation < 0:
                                    raise error("storage-unavailable")
                                allocated += standard.allocation
                            if not active and _manifest_entry(
                                child.lstat()
                            ) != _manifest_entry(info):
                                raise error("storage-drift")
                    except FileNotFoundError:
                        if not active:
                            raise
                if not active and set(names) != set(os.listdir(directory)):
                    raise error("storage-drift")

            visit(path, "")
            final = path.lstat()
            if not active and (initial.st_mtime_ns, initial.st_ctime_ns) != (
                final.st_mtime_ns,
                final.st_ctime_ns,
            ):
                raise error("storage-drift")
            return dict(
                bytes=logical,
                allocated_bytes=allocated,
                entries=count,
                device=initial.st_dev,
                inode=initial.st_ino,
                fingerprint=digest.hexdigest(),
                complete=not active,
            )
    except OSError as exc:
        raise error("storage-unavailable") from exc


def create_storage(workspace, job):
    from windows_security import is_private_path

    current = workspace
    for part in (".forgewright", "runtime", "build-jobs", job):
        with pinned(current):
            target = current / part
            try:
                target.mkdir(mode=0o700)
            except FileExistsError:
                if part == job:
                    raise error("storage-already-exists")
            with pinned(target):
                if not is_private_path(target):
                    raise error("storage-ownership-unconfirmed")
        current = target
    with pinned(current):
        for part in ("scratch", "output"):
            (current / part).mkdir(mode=0o700)
        return current.lstat()


def directory_names(path):
    with pinned(path):
        return set(os.listdir(path))


def absent(parent, names):
    with pinned(parent):
        for name in names:
            try:
                (parent / name).lstat()
                return False
            except FileNotFoundError:
                pass
    return True


def _rename_unique(descriptor: int, directory_handle: int, target_name: str) -> None:
    import ctypes
    import msvcrt
    from ctypes import wintypes

    class FileRenameInfo(ctypes.Structure):
        _fields_ = [
            ("replace_if_exists", wintypes.DWORD),
            ("root_directory", wintypes.HANDLE),
            ("file_name_length", wintypes.DWORD),
            ("file_name", wintypes.WCHAR * 1),
        ]

    class IoStatusValue(ctypes.Union):
        _fields_ = [("status", wintypes.LONG), ("pointer", wintypes.LPVOID)]

    class IoStatusBlock(ctypes.Structure):
        _anonymous_ = ("value",)
        _fields_ = [("value", IoStatusValue), ("information", ctypes.c_size_t)]

    name = secure._safe_basename(target_name)
    encoded_name = name.encode("utf-16-le")
    name_offset = FileRenameInfo.file_name.offset
    buffer = ctypes.create_string_buffer(
        name_offset + len(encoded_name) + ctypes.sizeof(wintypes.WCHAR)
    )
    rename_info = ctypes.cast(buffer, ctypes.POINTER(FileRenameInfo)).contents
    rename_info.replace_if_exists = 0
    rename_info.root_directory = directory_handle
    rename_info.file_name_length = len(encoded_name)
    ctypes.memmove(
        ctypes.addressof(buffer) + name_offset, encoded_name, len(encoded_name)
    )

    ntdll = ctypes.WinDLL("ntdll")
    set_information = ntdll.NtSetInformationFile
    set_information.argtypes = [
        wintypes.HANDLE,
        ctypes.POINTER(IoStatusBlock),
        wintypes.LPVOID,
        wintypes.DWORD,
        ctypes.c_int,
    ]
    set_information.restype = wintypes.LONG
    status_block = IoStatusBlock()
    status = set_information(
        msvcrt.get_osfhandle(descriptor),
        ctypes.byref(status_block),
        buffer,
        len(buffer),
        10,
    )
    if status != 0:
        to_dos_error = ntdll.RtlNtStatusToDosError
        to_dos_error.argtypes = [wintypes.LONG]
        to_dos_error.restype = wintypes.ULONG
        raise ctypes.WinError(to_dos_error(status))


def move_entry(source, target):
    """Move by the opened source identity; target is a private unique slot."""
    with entry(source, delete=True, private=True) as (fd, _):
        destination = secure._open_publication_directory(target.parent)
        try:
            if target.exists() or target.is_symlink():
                raise error("storage-drift")
            _rename_unique(fd, destination, target.name)
        finally:
            secure._close_windows_handle(destination)


def delete_tree(
    parent, name, expected, *, manifest, transaction_name, parent_identity=None
):
    from project_storage import _manifest_entry

    parent = Path(parent)
    deadline = time.monotonic() + 5
    mapping = {key: "entry-" + str(index) for index, key in enumerate(sorted(manifest))}
    children = {}
    for key in manifest:
        prefix, _, leaf = key.rpartition("/")
        children.setdefault(prefix + "/" if prefix else "", {})[leaf] = key
    raw = (
        json.dumps(
            dict(
                schema="forgewright-deletion-manifest/v1",
                entries=manifest,
                staging=mapping,
            ),
            sort_keys=True,
        )
        + "\n"
    ).encode()
    if len(manifest) > 100000 or len(raw) > 32 * 1024**2:
        raise error("storage-cleanup-incomplete")
    transaction = parent / transaction_name
    with pinned(parent):
        if parent_identity is not None:
            info = parent.lstat()
            if (info.st_dev, info.st_ino) != parent_identity:
                raise error("storage-drift")
        transaction.mkdir(mode=0o700)
        from windows_security import is_private_path

        with pinned(transaction):
            if not is_private_path(transaction):
                raise error("storage-ownership-unconfirmed")
            transaction_identity = (
                transaction.stat().st_dev,
                transaction.stat().st_ino,
            )
        with publication_parent(transaction):
            info = transaction.lstat()
            if (info.st_dev, info.st_ino) != transaction_identity:
                raise error("storage-drift")
            secure.atomic_write_bytes(parent, transaction / "manifest.json", raw)
            sync_directory(transaction)

            def erase(path, identity, prefix):
                if time.monotonic() >= deadline:
                    raise error("storage-cleanup-incomplete")
                with entry(path, delete=True, private=True) as (fd, opened):
                    if (
                        opened.st_dev,
                        opened.st_ino,
                    ) != identity or opened.st_file_attributes & 0x400:
                        raise error("storage-drift")
                    selected = children.get(prefix, {})
                    if directory_names_unlocked(path, deadline) != set(selected):
                        raise error("storage-drift")
                    for original, relative in selected.items():
                        if time.monotonic() >= deadline:
                            raise error("storage-cleanup-incomplete")
                        source = path / original
                        before = source.lstat()
                        expected_entry = manifest[relative]
                        if _manifest_entry(before) != expected_entry:
                            raise error("storage-drift")
                        if before.st_dev != opened.st_dev:
                            raise error("storage-ownership-unconfirmed")
                        if stat.S_ISREG(before.st_mode) and before.st_nlink != 1:
                            raise error("storage-hardlink-unconfirmed")
                        staged = transaction / mapping[relative]
                        move_entry(source, staged)
                        with entry(staged, delete=True, private=True) as (
                            child_fd,
                            moved,
                        ):
                            if _manifest_entry(moved)[:-1] != expected_entry[:-1]:
                                raise error("storage-drift")
                            is_directory = (
                                stat.S_ISDIR(moved.st_mode)
                                and not moved.st_file_attributes & 0x400
                            )
                            if not is_directory:
                                if stat.S_ISREG(moved.st_mode) and moved.st_nlink != 1:
                                    raise error("storage-hardlink-unconfirmed")
                                secure._dispose_open_file(child_fd)
                        if is_directory:
                            erase(staged, tuple(expected_entry[:2]), relative + "/")
                    secure._dispose_open_file(fd)

            erase(parent / name, expected, "")
            # FileDispositionInfo may succeed while compatible external handles
            # retain a delete-pending name. Keep the durable manifest until both
            # the root and every staged data entry are absent from pinned names.
            if name.casefold() in {
                item.casefold() for item in directory_names_unlocked(parent, deadline)
            } or directory_names_unlocked(transaction, deadline) != {"manifest.json"}:
                raise OSError("storage deletion namespace absence unconfirmed")
            with entry(transaction / "manifest.json", delete=True, private=True) as (
                fd,
                _,
            ):
                secure._dispose_open_file(fd)
            if directory_names_unlocked(transaction, deadline):
                raise OSError("storage manifest deletion absence unconfirmed")
        # Flush and remove only the transaction we created, bound by identity.
        sync_directory(transaction)
        with entry(transaction, delete=True, private=True) as (fd, info):
            if (info.st_dev, info.st_ino) != transaction_identity:
                raise error("storage-drift")
            secure._dispose_open_file(fd)
        remaining = {
            item.casefold() for item in directory_names_unlocked(parent, deadline)
        }
        if name.casefold() in remaining or transaction_name.casefold() in remaining:
            raise OSError("storage deletion namespace absence unconfirmed")
    sync_directory(parent)


def directory_names_unlocked(path, deadline):
    names = set()
    with os.scandir(path) as entries:
        for item in entries:
            if len(names) >= 100000 or time.monotonic() >= deadline:
                raise error("storage-cleanup-incomplete")
            names.add(item.name)
    return names


def remove(record, expected, *, on_intent):
    import project_storage as storage

    path = storage._bound_root(record)
    staged = None
    try:
        with publication_parent(path.parent):
            manifest = {}
            before = storage.measure_tree(
                path,
                visitor=lambda relative, info: manifest.__setitem__(
                    relative, storage._manifest_entry(info)
                ),
            )
            if before != expected or (before["device"], before["inode"]) != (
                record["device"],
                record["inode"],
            ):
                raise error("storage-drift")
            tombstone = path.parent / (".reclaim-" + path.name + "-" + uuid.uuid4().hex)
            transaction = ".delete-" + uuid.uuid4().hex
            record["cleanup_intent"] = dict(
                schema="forgewright-artifact-cleanup-intent/v1",
                original_path=str(path),
                staged_path=str(tombstone),
                device=record["device"],
                inode=record["inode"],
                nonce=record["nonce"],
                expected_fingerprint=expected["fingerprint"],
                expected_bytes=expected["bytes"],
                transaction_path=str(path.parent / transaction),
                manifest_entries_sha256=hashlib.sha256(
                    json.dumps(manifest, sort_keys=True).encode()
                ).hexdigest(),
            )
            if on_intent:
                on_intent(record)
            move_entry(path, tombstone)
            staged = tombstone
            if storage.measure_tree(staged) != expected:
                raise error("storage-drift-quarantined")
        delete_tree(
            path.parent,
            tombstone.name,
            (record["device"], record["inode"]),
            manifest=manifest,
            transaction_name=transaction,
        )
    except OSError as exc:
        raise storage.StorageError(
            "storage-cleanup-pending", pending_path=str(staged or path)
        ) from exc
    except storage.StorageError as exc:
        if staged is not None and exc.pending_path is None:
            exc.pending_path = str(staged)
        raise


def private_metadata(path, limit, *, expected=None, identity=False):
    """Read, optionally delete, the same private regular file through one handle."""
    from project_storage import _manifest_entry

    path = Path(os.path.abspath(path))
    with pinned(path.parent):
        with entry(path, delete=expected is not None, private=True, read=True) as (
            fd,
            info,
        ):
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_file_attributes & 0x400
                or info.st_nlink != 1
            ):
                raise ValueError("unsafe-history-entry")
            import msvcrt

            _private_handle(_Native(), msvcrt.get_osfhandle(fd), confidential=True)
            raw = bytearray()
            while len(raw) <= limit:
                chunk = os.read(fd, min(65536, limit + 1 - len(raw)))
                if not chunk:
                    break
                raw.extend(chunk)
            if len(raw) > limit:
                raise ValueError("history-entry-too-large")
            if _manifest_entry(path.lstat()) != _manifest_entry(info):
                raise ValueError("history-drift")
            if expected is not None:
                if raw != expected:
                    raise ValueError("history-drift")
                secure._dispose_open_file(fd)
            if identity:
                return bytes(raw), (info.st_dev, info.st_ino)
            return bytes(raw)


def private_lock_file(path):
    """Anchor one non-replaceable regular lock inode and verify its private ACL."""
    import msvcrt

    path = Path(os.path.abspath(path))
    with pinned(path.parent):
        fd = secure.open_anchored_lock_file(Path(path.anchor), path.parent, path)
        try:
            _private_handle(_Native(), msvcrt.get_osfhandle(fd), confidential=True)
            return fd
        except BaseException:
            os.close(fd)
            raise


def atomic_private(path, raw):
    """Publish private metadata while pinning ancestry; reject unsafe old leaves."""
    from windows_security import is_private_path

    path = Path(os.path.abspath(path))
    with publication_parent(path.parent):
        if not is_private_path(path.parent, confidential=True):
            raise error("storage-ownership-unconfirmed")
        try:
            with entry(path, private=True, read=True) as (_, info):
                if (
                    not stat.S_ISREG(info.st_mode)
                    or info.st_file_attributes & 0x400
                    or info.st_nlink != 1
                ):
                    raise error("storage-ownership-unconfirmed")
                if not is_private_path(path, confidential=True):
                    raise error("storage-ownership-unconfirmed")
        except FileNotFoundError:
            pass
        import msvcrt

        secure.atomic_write_bytes(
            Path(path.anchor),
            path,
            raw,
            validate_temporary=lambda fd, _: _private_handle(
                _Native(), msvcrt.get_osfhandle(fd), confidential=True
            ),
        )
        with entry(path, private=True) as (_, info):
            if info.st_nlink != 1 or not is_private_path(path, confidential=True):
                raise error("storage-ownership-unconfirmed")
        sync_directory(path.parent)


def exchange_files(parent, first, second):
    """Atomically exchange two no-follow regular files on a TxF-capable volume.

    ReplaceFileW can leave the live slot absent on a partial failure. This
    narrow TxF operation instead preserves both names until commit, or fails
    closed. TxF is optional/deprecated; no path-based or non-atomic fallback.
    https://learn.microsoft.com/windows/win32/fileio/how-to-use-transactional-ntfs
    """
    import msvcrt
    from ctypes import wintypes

    parent = Path(os.path.abspath(parent))
    secure._safe_basename(first)
    secure._safe_basename(second)
    native = _Native()
    transaction_api = ctypes.WinDLL("KtmW32", use_last_error=True)
    create = transaction_api.CreateTransaction
    create.argtypes = [
        wintypes.LPVOID,
        wintypes.LPVOID,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.LPWSTR,
    ]
    create.restype = wintypes.HANDLE
    commit = transaction_api.CommitTransaction
    rollback = transaction_api.RollbackTransaction
    for operation in (commit, rollback):
        operation.argtypes = [wintypes.HANDLE]
        operation.restype = wintypes.BOOL
    open_file = native.kernel.CreateFileTransactedW
    open_file.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.LPVOID,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.HANDLE,
        wintypes.HANDLE,
        wintypes.LPVOID,
        wintypes.LPVOID,
    ]
    open_file.restype = wintypes.HANDLE
    invalid = wintypes.HANDLE(-1).value
    with publication_parent(parent):
        transaction = create(None, None, 0, 0, 0, 5000, "Forgewright config exchange")
        if not transaction or transaction == invalid:
            raise ctypes.WinError(ctypes.get_last_error())
        committed = False
        try:
            with ExitStack() as handles:
                directory = secure._open_publication_directory(parent)
                handles.callback(secure._close_windows_handle, directory)
                descriptors = []
                devices = []
                for name in (first, second):
                    # GENERIC_READ | READ_CONTROL | DELETE | FILE_READ_ATTRIBUTES;
                    # FILE_SHARE_READ blocks in-place mutation and reparse edits.
                    handle = open_file(
                        str(parent / name),
                        0x80030080,
                        1,
                        None,
                        3,
                        0x02200000,
                        None,
                        transaction,
                        None,
                        None,
                    )
                    if not handle or handle == invalid:
                        raise ctypes.WinError(ctypes.get_last_error())
                    try:
                        info = _FileInformation()
                        if not native.kernel.GetFileInformationByHandle(
                            handle, ctypes.byref(info)
                        ):
                            raise ctypes.WinError(ctypes.get_last_error())
                        if info.attributes & (0x400 | 0x10) or info.links != 1:
                            raise OSError("unsafe-config-exchange-file")
                        if (info.size_high << 32) | info.size_low > 1024**2:
                            raise OSError("config-exchange-file-too-large")
                        _private_handle(native, handle, confidential=True)
                        descriptor = msvcrt.open_osfhandle(
                            handle, os.O_RDONLY | os.O_BINARY
                        )
                    except BaseException:
                        native.kernel.CloseHandle(handle)
                        raise
                    handles.callback(os.close, descriptor)
                    descriptors.append(descriptor)
                    devices.append(info.volume)
                if devices[0] != devices[1]:
                    raise OSError("cross-volume-config-exchange")
                temporary = ".fw-exchange-" + uuid.uuid4().hex
                _rename_unique(descriptors[0], directory, temporary)
                _rename_unique(descriptors[1], directory, first)
                _rename_unique(descriptors[0], directory, second)
            # TxF requires all transacted leaf handles closed before commit.
            if not commit(transaction):
                raise ctypes.WinError(ctypes.get_last_error())
            committed = True
        finally:
            try:
                if not committed and not rollback(transaction):
                    # Closing the last uncommitted handle also requests rollback.
                    raise ctypes.WinError(ctypes.get_last_error())
            finally:
                if not native.kernel.CloseHandle(transaction):
                    raise ctypes.WinError(ctypes.get_last_error())
