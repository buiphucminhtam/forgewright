"""Host-turn baselines for Stop admission, separate from completion evidence.

Only a matching prompt hook can narrow the legacy worktree scope. Missing,
unsafe or incomplete metadata keeps the conservative worktree fallback.
"""

from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import time

from evidence_common import _ignored_verify_path, worktree_fingerprint

SCHEMA = "forgewright-turn-baseline/v1"
MAX_BYTES = 4 * 1024 * 1024
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_PATHS = 10_000
SESSION_FALLBACK_TURN = "__session_scope__"


def _identity(payload):
    session = payload.get("session_id")
    turn = payload.get("turn_id") or payload.get("turn")
    if (
        not turn
        and "turn_id" not in payload
        and "turn" not in payload
        and isinstance(session, str)
        and 0 < len(session) <= 256
    ):
        turn = SESSION_FALLBACK_TURN
    if not all(
        isinstance(value, str) and 0 < len(value) <= 256 for value in (session, turn)
    ):
        raise ValueError("host turn identity missing")
    return {"session": session, "turn": turn}


def _git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root, timeout=10)


def _dirty_paths(root):
    # Failure must invalidate admission scope, never masquerade as a clean tree.
    paths = set()
    for args in (
        ("diff", "--name-only", "-z"),
        ("diff", "--name-only", "-z", "--cached"),
        ("ls-files", "--others", "--exclude-standard", "-z"),
    ):
        paths.update(
            os.fsdecode(path) for path in _git(root, *args).split(b"\0") if path
        )
    return sorted(path for path in paths if not _ignored_verify_path(path))


@contextmanager
def _directory(root, *, create=False):
    # Descriptor-relative opens prevent a swapped runtime parent from redirecting
    # either reads or writes. Unsupported hosts retain legacy Stop admission.
    if os.name == "nt" or not hasattr(os, "O_NOFOLLOW"):
        raise ValueError("anchored turn baseline unavailable")
    descriptors = [os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)]
    try:
        for name in (".forgewright", "runtime", "turn-scopes"):
            parent = descriptors[-1]
            if create:
                try:
                    os.mkdir(name, 0o700, dir_fd=parent)
                except FileExistsError:
                    pass
            fd = os.open(
                name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent
            )
            descriptors.append(fd)
            info = os.fstat(fd)
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                raise ValueError("unsafe turn baseline directory")
        yield descriptors[-1]
    finally:
        for fd in reversed(descriptors):
            os.close(fd)


def _name(identity):
    return (
        hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        + ".json"
    )


def _records(root, paths):
    paths = sorted(set(paths))
    if len(paths) > MAX_PATHS:
        raise ValueError("turn scope exceeds path budget")
    staged = _git(root, "ls-files", "--stage", "-z", "--", *paths) if paths else b""
    index = {}
    for item in staged.split(b"\0"):
        if item:
            value, name = item.split(b"\t", 1)
            index.setdefault(os.fsdecode(name), []).append(value.decode("ascii"))
    result = {}
    for relative in paths:
        path = root / relative
        if Path(relative).is_absolute() or ".." in Path(relative).parts:
            raise ValueError("unsafe scope path")
        # Git paths can themselves be links. Hash the link, never its target.
        try:
            info = path.lstat()
        except FileNotFoundError:
            content = "absent"
        else:
            if any(
                parent.is_symlink()
                for parent in path.parents
                if parent != root and root in parent.parents
            ):
                raise ValueError("symlink scope parent")
            if stat.S_ISLNK(info.st_mode):
                content = "link:" + os.readlink(path)
            elif stat.S_ISDIR(info.st_mode):
                content = worktree_fingerprint(path)
                if not content.startswith("TREE:"):
                    raise ValueError("unproven submodule state")
            elif stat.S_ISREG(info.st_mode) and info.st_size <= MAX_FILE_BYTES:
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                try:
                    with os.fdopen(fd, "rb", closefd=False) as handle:
                        data = handle.read(MAX_FILE_BYTES + 1)
                    after = os.fstat(fd)
                    if (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns) != (
                        after.st_dev,
                        after.st_ino,
                        after.st_size,
                        after.st_mtime_ns,
                    ) or len(data) > MAX_FILE_BYTES:
                        raise ValueError("scope file changed during read")
                    content = (
                        f"{stat.S_IMODE(info.st_mode)}:"
                        + hashlib.sha256(data).hexdigest()
                    )
                finally:
                    os.close(fd)
            else:
                raise ValueError("unsupported scope file")
        result[relative] = {"content": content, "index": index.get(relative, [])}
    return result


def capture_turn(root: Path, payload: dict) -> None:
    root = root.resolve()
    identity = _identity(payload)
    head = _git(root, "rev-parse", "HEAD").decode().strip()
    record = {
        "schema": SCHEMA,
        "workspace": str(root),
        "identity": identity,
        "created_at": time.time(),
        "head": head,
        "records": _records(root, _dirty_paths(root)),
    }
    raw = json.dumps(record, sort_keys=True).encode()
    if len(raw) > MAX_BYTES:
        raise ValueError("turn baseline exceeds byte budget")
    with _directory(root, create=True) as directory:
        target_name = _name(identity)
        if identity["turn"] == SESSION_FALLBACK_TURN:
            temp_name = f".{target_name}.{os.getpid()}.{time.time_ns()}.tmp"
            fd = os.open(
                temp_name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
                dir_fd=directory,
            )
            try:
                with os.fdopen(fd, "wb", closefd=False) as handle:
                    handle.write(raw)
                    handle.flush()
                    os.fsync(fd)
            finally:
                os.close(fd)
            try:
                os.replace(
                    temp_name,
                    target_name,
                    src_dir_fd=directory,
                    dst_dir_fd=directory,
                )
            except BaseException:
                try:
                    os.unlink(temp_name, dir_fd=directory)
                except OSError:
                    pass
                raise
            return
        # Create once per exact host turn: retries cannot reset its baseline.
        fd = os.open(
            target_name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=directory,
        )
        try:
            with os.fdopen(fd, "wb", closefd=False) as handle:
                handle.write(raw)
                handle.flush()
                os.fsync(fd)
        finally:
            os.close(fd)


def files_changed_this_turn(root: Path, payload: dict) -> list[str] | None:
    try:
        root = root.resolve()
        identity = _identity(payload)
        with _directory(root) as directory:
            fd = os.open(_name(identity), os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
            try:
                info = os.fstat(fd)
                if (
                    not stat.S_ISREG(info.st_mode)
                    or info.st_nlink != 1
                    or info.st_size > MAX_BYTES
                ):
                    raise ValueError("unsafe turn baseline")
                with os.fdopen(fd, "rb", closefd=False) as handle:
                    record = json.loads(handle.read(MAX_BYTES + 1))
            finally:
                os.close(fd)
        if (
            record.get("schema") != SCHEMA
            or record.get("identity") != identity
            or record.get("workspace") != str(root)
            or not 0 <= time.time() - record["created_at"] <= 7200
            or not isinstance(record.get("records"), dict)
        ):
            raise ValueError("turn baseline mismatch")
        before = record["records"]
        paths = set(before) | set(_dirty_paths(root))
        committed = _git(
            root, "diff", "--name-only", "-z", record["head"], "HEAD", "--"
        )
        committed_paths = {os.fsdecode(path) for path in committed.split(b"\0") if path}
        paths.update(committed_paths)
        after = _records(root, paths)
        # Paths clean at prompt time have no baseline entry. Current dirty or
        # committed changes are therefore included, as are deletions/staging.
        return sorted(
            path for path in paths if path not in before or before[path] != after[path]
        )
    except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError):
        return None
