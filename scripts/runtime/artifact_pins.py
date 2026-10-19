"""Shared workspace artifact lock and token-owned consumer protection.

Pins never expire implicitly. Metadata is private same-user state, not proof
against a malicious same-user writer. No process execution or admission grant.
"""

from contextlib import contextmanager
from contextvars import ContextVar
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import stat
import time
import uuid
import threading

from project_storage import StorageError, _open_directory, _bound_root, measure_tree

_LOCKED = ContextVar("artifact_locks", default=frozenset())


@contextmanager
def artifact_lock(workspace):
    if workspace is None:
        yield
        return
    workspace = Path(workspace).resolve(strict=True)
    key = (os.getpid(), threading.get_ident(), str(workspace))
    if key in _LOCKED.get():
        yield
        return
    current = workspace
    for part in (".forgewright", "runtime"):
        parent = _open_directory(current)
        try:
            try:
                os.mkdir(part, mode=0o700, dir_fd=parent)
            except FileExistsError:
                pass
            child = os.open(
                part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent
            )
            os.close(child)
        finally:
            os.close(parent)
        current /= part
    parent = _open_directory(current)
    descriptor, reset = None, None
    try:
        descriptor = os.open(
            ".artifact.lock",
            os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,
            0o600,
            dir_fd=parent,
        )
        info = os.fstat(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_mode & 0o077
        ):
            raise StorageError("unsafe-artifact-lock")
        deadline = time.monotonic() + 2
        while True:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise StorageError("artifact-lock-busy")
                time.sleep(0.02)
        reset = _LOCKED.set(_LOCKED.get() | {key})
        yield
    finally:
        if reset is not None:
            _LOCKED.reset(reset)
        if descriptor is not None:
            os.close(descriptor)
        os.close(parent)


def pins(record, *, updated=None):
    """Call while holding artifact_lock; read fresh state before any deletion."""
    _bound_root(record)
    folder = Path(record["workspace"]) / ".forgewright/runtime/artifact-pins"
    parent = _open_directory(folder.parent)
    try:
        try:
            os.mkdir(folder.name, mode=0o700, dir_fd=parent)
        except FileExistsError:
            pass
    finally:
        os.close(parent)
    descriptor = _open_directory(folder)
    name = record["job_id"] + ".json"
    identity = {k: record[k] for k in ("job_id", "nonce", "device", "inode")}
    try:
        try:
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=descriptor)
        except FileNotFoundError:
            value = {
                "schema": "forgewright-artifact-pins/v1",
                "identity": identity,
                "pins": [],
            }
        else:
            with os.fdopen(fd, "rb") as stream:
                info = os.fstat(stream.fileno())
                if (
                    not stat.S_ISREG(info.st_mode)
                    or info.st_uid != os.getuid()
                    or info.st_mode & 0o077
                    or info.st_size > 16384
                ):
                    raise StorageError("unsafe-artifact-pins")
                value = json.load(stream)
            if value.get("identity") != identity or not isinstance(
                value.get("pins"), list
            ):
                raise StorageError("artifact-pin-identity-mismatch")
        if updated is not None:
            if len(updated) > 64:
                raise StorageError("artifact-pin-limit")
            value["pins"] = updated
            temp = name + "." + uuid.uuid4().hex + ".tmp"
            fd = os.open(
                temp,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
                0o600,
                dir_fd=descriptor,
            )
            try:
                with os.fdopen(fd, "w") as stream:
                    json.dump(value, stream)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temp, name, src_dir_fd=descriptor, dst_dir_fd=descriptor)
                os.fsync(descriptor)
            finally:
                try:
                    os.unlink(temp, dir_fd=descriptor)
                except FileNotFoundError:
                    pass
        return value["pins"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise StorageError("artifact-protection-unavailable") from error
    finally:
        os.close(descriptor)


def pin_artifact(record, consumer):
    if not isinstance(consumer, str) or not re.fullmatch(
        r"[A-Za-z0-9_.:-]{1,128}", consumer
    ):
        raise StorageError("invalid-artifact-consumer")
    with artifact_lock(record["workspace"]):
        if record.get("state") != "retained" or measure_tree(
            _bound_root(record)
        ) != record.get("snapshot"):
            raise StorageError("artifact-unavailable")
        token = secrets.token_hex(32)
        pins(
            record,
            updated=pins(record)
            + [
                {
                    "consumer": consumer,
                    "token_digest": hashlib.sha256(token.encode()).hexdigest(),
                }
            ],
        )
        return token


def unpin_artifact(record, token):
    with artifact_lock(record["workspace"]):
        current = pins(record)
        expected = hashlib.sha256(token.encode()).hexdigest()
        remaining = [
            pin
            for pin in current
            if not hmac.compare_digest(pin["token_digest"], expected)
        ]
        if len(remaining) == len(current):
            raise StorageError("artifact-pin-owner-mismatch")
        pins(record, updated=remaining)
