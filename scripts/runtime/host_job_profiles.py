"""Owner-installed, content-bound finite recipes. Never infer them from argv.

Private same-user files are an enrollment boundary, not authentication against
a malicious same-user writer. Installation is an explicit review operation.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
from contextlib import ExitStack

from host_job_runner import JobRequest, validate, JobError
from project_storage import disk_limits, StorageError

SCHEMA = "forgewright-finite-profile/v2"
NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


class ProfileError(RuntimeError):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def _windows_io():
    # Resolve only the framework-owned helper package, never profile content.
    scripts_root = str(Path(__file__).resolve().parents[1])
    if scripts_root not in sys.path:
        sys.path.insert(0, scripts_root)
    from lite import windows_secure_io
    from windows_security import is_private_path

    return windows_secure_io, is_private_path


def _windows_path(path, io):
    path = Path(path)
    if ".." in path.parts:
        raise ValueError("profile path must not traverse parent components")
    path = Path(os.path.abspath(path))
    for component in path.relative_to(Path(path.anchor)).parts:
        io._safe_basename(component)
    return path


def _windows_private_dir(path):
    io, is_private = _windows_io()
    try:
        path = _windows_path(path, io)
        missing = []
        existing = path
        while not existing.exists():
            missing.append(existing)
            existing = existing.parent
        # Pin ancestry without imposing current-user ownership on the drive or
        # system ancestors. Authority starts at the existing creation parent.
        with ExitStack() as stack:
            stack.enter_context(io.locked_directory_chain(Path(path.anchor), existing))
            if not is_private(existing, confidential=True):
                raise ProfileError("unsafe-profile-directory")
            if (
                not missing
                and existing.parent != existing
                and not is_private(existing.parent, confidential=True)
            ):
                raise ProfileError("unsafe-profile-directory")
            for directory in reversed(missing):
                directory.mkdir(mode=0o700, exist_ok=True)
                stack.enter_context(io.locked_directory_chain(directory, directory))
                if not is_private(directory, confidential=True):
                    raise ProfileError("unsafe-profile-directory")
    except (OSError, ValueError) as error:
        raise ProfileError("unsafe-profile-directory") from error


def _open_windows_profile(path, io):
    """Open an existing leaf without following reparse points or sharing writes."""
    import ctypes
    import msvcrt

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    pointer = ctypes.c_void_p
    dword = ctypes.c_uint32
    create = kernel.CreateFileW
    create.argtypes = [ctypes.c_wchar_p, dword, dword, pointer, dword, dword, pointer]
    create.restype = pointer
    query = kernel.GetFileInformationByHandleEx
    query.argtypes = [pointer, ctypes.c_int32, pointer, dword]
    query.restype = ctypes.c_int32
    # GENERIC_READ, FILE_SHARE_READ, OPEN_EXISTING,
    # FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT.
    handle = create(str(path), 0x80000000, 1, None, 3, 0x02200000, None)
    if not handle or handle == pointer(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        attributes = (dword * 2)()  # FILE_ATTRIBUTE_TAG_INFO
        if not query(handle, 9, ctypes.byref(attributes), ctypes.sizeof(attributes)):
            raise ctypes.WinError(ctypes.get_last_error())
        if attributes[0] & (0x400 | 0x10):  # reparse point or directory
            raise ProfileError("unsafe-profile-file")
        return msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY | os.O_NOINHERIT)
    except BaseException:
        io._close_windows_handle(handle)
        raise


def _windows_private_read(path, limit):
    io, is_private = _windows_io()
    file_opened = False
    try:
        path = _windows_path(path, io)
        if not isinstance(limit, int) or limit < 0:
            raise ValueError("invalid profile size limit")
        with io.locked_directory_chain(Path(path.anchor), path.parent):
            try:
                parent_private = is_private(path.parent, confidential=True)
            except OSError as error:
                # A failed authority query is not proof that the file is absent.
                raise ProfileError("unsafe-profile-file") from error
            if not parent_private:
                raise ProfileError("unsafe-profile-file")
            fd = _open_windows_profile(path, io)
            file_opened = True
            with os.fdopen(fd, "rb") as stream:
                opened = os.fstat(stream.fileno())
                current = path.lstat()
                identity = (opened.st_dev, opened.st_ino)
                if (
                    not stat.S_ISREG(opened.st_mode)
                    or not stat.S_ISREG(current.st_mode)
                    or opened.st_nlink != 1
                    or current.st_nlink != 1
                    or io._is_reparse(current)
                    or identity != (current.st_dev, current.st_ino)
                    or not is_private(path, confidential=True)
                ):
                    raise ProfileError("unsafe-profile-file")
                if opened.st_size > limit:
                    raise ProfileError("profile-too-large")
                raw = stream.read(limit + 1)
                if len(raw) > limit:
                    raise ProfileError("profile-too-large")
                final = os.fstat(stream.fileno())
                current = path.lstat()
                if (
                    not stat.S_ISREG(current.st_mode)
                    or io._is_reparse(current)
                    or identity != (current.st_dev, current.st_ino)
                    or final.st_nlink != 1
                    or current.st_nlink != 1
                    or final.st_size != opened.st_size
                    or final.st_mtime_ns != opened.st_mtime_ns
                    or current.st_size != final.st_size
                    or current.st_mtime_ns != final.st_mtime_ns
                ):
                    raise ProfileError("unsafe-profile-file")
                return raw
    except FileNotFoundError as error:
        if file_opened:
            raise ProfileError("unsafe-profile-file") from error
        # Preserve the original os.open absence contract for enrollment callers.
        # Only directory-chain opening or leaf opening can reach this branch.
        raise
    except (OSError, ValueError) as error:
        raise ProfileError("unsafe-profile-file") from error


def private_dir(path):
    path = Path(path)
    if os.name == "nt":
        _windows_private_dir(path)
        return path
    # Do not normalize away symlinks before checking each component.
    if any(p.is_symlink() for p in [path, *path.parents]):
        raise ProfileError("unsafe-profile-path")
    path.mkdir(parents=True, mode=0o700, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or (
        hasattr(os, "getuid") and (info.st_uid != os.getuid() or info.st_mode & 0o077)
    ):
        raise ProfileError("unsafe-profile-directory")
    return path


def private_read(path, limit=16384):
    if os.name == "nt":
        return _windows_private_read(path, limit)
    if any(p.is_symlink() for p in [path, *path.parents]):
        raise ProfileError("unsafe-profile-path")
    fd = os.open(
        path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    )
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or (
            hasattr(os, "getuid")
            and (info.st_uid != os.getuid() or info.st_mode & 0o077)
        ):
            raise ProfileError("unsafe-profile-file")
        raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise ProfileError("profile-too-large")
        return raw


def profile_path(home, project, name):
    if not isinstance(name, str) or not NAME.fullmatch(name):
        raise ProfileError("invalid-profile-id")
    scope = digest(os.fsencode(Path(project).resolve(strict=True)))
    return Path(home) / "profiles" / scope / (name + ".json")


def validate_profile(value):
    required = {
        "schema",
        "id",
        "project",
        "cwd",
        "argv",
        "command",
        "memory_mib",
        "scratch_bytes",
        "disk_floor_bytes",
        "timeout",
        "sources",
        "env",
        "artifact_policy",
        "disk_paths",
    }
    if (
        not isinstance(value, dict)
        or set(value) != required
        or value.get("schema") != SCHEMA
    ):
        raise ProfileError("invalid-profile")
    project = Path(value["project"]).resolve(strict=True)
    profile_path(project, project, value["id"])  # Validate name; creates nothing.
    if not isinstance(value["command"], str) or not 0 < len(value["command"]) <= 4096:
        raise ProfileError("invalid-profile-command")
    if not isinstance(value["sources"], dict) or not 1 <= len(value["sources"]) <= 32:
        raise ProfileError("missing-source-bindings")
    for filename, expected in value["sources"].items():
        path = project / filename
        if (
            Path(filename).is_absolute()
            or ".." in Path(filename).parts
            or path.is_symlink()
            or any(p.is_symlink() for p in path.parents if p != project.parent)
            or not path.resolve(strict=True).is_relative_to(project)
            or not path.is_file()
            or path.stat().st_size > 4 * 1024**2
        ):
            raise ProfileError("unsafe-source-binding")
        if digest(path.read_bytes()) != expected:
            raise ProfileError("source-drift")
    env = value["env"]
    # Credentials and loader/exec injection do not belong in persisted recipes.
    if not isinstance(env, dict) or any(
        k
        not in {
            "CI",
            "LANG",
            "LC_ALL",
            "GRADLE_OPTS",
            "CMAKE_BUILD_PARALLEL_LEVEL",
            "npm_config_jobs",
        }
        or not isinstance(v, str)
        or len(v) > 256
        or "\0" in v
        for k, v in env.items()
    ):
        raise ProfileError("invalid-profile-env")
    paths = value["disk_paths"]
    if not isinstance(paths, list) or not 1 <= len(paths) <= 8:
        raise ProfileError("missing-volume-declarations")
    for item in paths:
        if not isinstance(item, dict) or set(item) != {"path", "device"}:
            raise ProfileError("invalid-volume-declaration")
        target = Path(item["path"])
        if (
            not target.is_absolute()
            or str(target.resolve(strict=True)) != item["path"]
            or not target.is_dir()
            or target.stat().st_dev != item["device"]
        ):
            raise ProfileError("target-volume-drift")
    try:
        limits = disk_limits(project)
        if (
            value["artifact_policy"]["project_limit_bytes"] > limits["project_bytes"]
            or value["artifact_policy"]["ttl_seconds"] > limits["ttl_seconds"]
        ):
            raise ProfileError("profile-raises-host-disk-limit")
    except (StorageError, KeyError, TypeError) as error:
        raise ProfileError("invalid-profile-disk-policy") from error
    request = JobRequest(
        project=project,
        cwd=project / value["cwd"],
        argv=value["argv"],
        profile=value["id"],
        memory_mib=value["memory_mib"],
        scratch_bytes=value["scratch_bytes"],
        disk_floor_bytes=max(value["disk_floor_bytes"], limits["min_free_bytes"]),
        timeout=value["timeout"],
        artifact_policy=value["artifact_policy"],
        disk_paths=tuple(Path(item["path"]) for item in paths),
        disk_devices=tuple(item["device"] for item in paths),
        profile_digest=digest(
            (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
        ),
    )
    try:
        validate(request)
        executable = Path(value["argv"][0])
        if (
            not executable.is_absolute()
            or not executable.resolve(strict=True).is_file()
        ):
            raise ProfileError("absolute-executable-required")
    except (JobError, OSError, ValueError, TypeError) as error:
        raise ProfileError("invalid-profile-request") from error
    return request


def install_profile(home, value):
    request = validate_profile(value)
    path = profile_path(home, request.project, value["id"])
    private_dir(Path(home))
    private_dir(path.parent)
    raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    if len(raw) > 16384:
        raise ProfileError("profile-too-large")
    if path.exists():
        if private_read(path) == raw:
            return digest(raw)
        raise ProfileError("profile-exists-use-new-version")
    fd = os.open(
        path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600
    )
    with os.fdopen(fd, "wb") as stream:
        if os.name == "nt":
            # Inspect the inherited DACL while the new file is still empty.
            # Confidential parent validation alone must not publish a token if
            # the created file has acquired an unsafe default/inherited grant.
            _, is_private = _windows_io()
            try:
                if not is_private(path, confidential=True):
                    raise ProfileError("unsafe-profile-file")
            except OSError as error:
                raise ProfileError("unsafe-profile-file") from error
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return digest(raw)


def load_profile(home, project, name, expected):
    try:
        raw = private_read(profile_path(home, project, name))
        if digest(raw) != expected:
            raise ProfileError("profile-digest-mismatch")
        value = json.loads(raw)
        if Path(value["project"]).resolve(strict=True) != Path(project).resolve(
            strict=True
        ):
            raise ProfileError("profile-project-mismatch")
        validate_profile(value)
        return value
    except (OSError, ValueError, KeyError, TypeError, JobError) as error:
        raise ProfileError("profile-unavailable") from error
