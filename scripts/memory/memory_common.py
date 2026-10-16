"""Shared identity and configuration for optional, local project memory."""

import hashlib
from contextlib import contextmanager
import json
import os
from pathlib import Path
import subprocess
import time

import continuity
from memory_redaction import redact


def disabled() -> bool:
    return any(
        os.environ.get(key, "").lower() in {"true", "1", "yes"}
        for key in ("MEM0_DISABLED", "FORGEWRIGHT_SKIP_MEM0")
    )


def workspace_root() -> Path:
    configured = os.environ.get("FORGEWRIGHT_WORKSPACE", "").strip()
    if configured:
        root = Path(configured).expanduser().resolve()
        if not root.is_dir():
            raise ValueError("invalid_memory_workspace")
        return root
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if result.returncode == 0:
            return Path(result.stdout.strip()).resolve()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return Path.cwd().resolve()


def project_id(workspace=None) -> str:
    return os.environ.get("MEM0_PROJECT_ID", "").strip() or (
        "workspace:"
        + hashlib.sha256(str(workspace or workspace_root()).encode()).hexdigest()[:24]
    )


def session_namespace(session: str) -> str:
    return (
        project_id() + ":session:" + hashlib.sha256(session.encode()).hexdigest()[:24]
    )


def active_session() -> str:
    return os.environ.get("FORGEWRIGHT_SESSION") or os.environ.get(
        "FORGEWRIGHT_SESSION_ID", ""
    )


def database_path() -> Path:
    configured = os.environ.get("MEM0_DB_PATH", "").strip()
    path = (
        Path(configured).expanduser() if configured else Path(".forgewright/memory.db")
    )
    return (path if path.is_absolute() else workspace_root() / path).absolute()


def runtime_root() -> Path:
    configured = os.environ.get("MEMORY_DB_DIR", "").strip()
    return (
        Path(configured).expanduser().resolve()
        if configured
        else workspace_root() / ".forgewright/runtime/memory"
    )


def atomic_json(path: Path, data: dict) -> None:
    if continuity._has_symlink_component(path):
        raise ValueError("unsafe_memory_state_path")
    continuity._atomic_write(
        path, (json.dumps(redact(data), ensure_ascii=False, indent=2) + "\n").encode()
    )


@contextmanager
def json_transaction(path: Path, initial: dict):
    """Bounded process lock and atomic publication, using continuity primitives."""
    if disabled():
        raise RuntimeError("memory_disabled")
    if continuity._has_symlink_component(path):
        raise ValueError("unsafe_memory_state_path")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with continuity._open_writer_lock(path.parent) as lock:
        deadline = time.monotonic() + 2
        while True:
            try:
                if os.name == "nt":
                    lock.seek(0)
                    continuity.msvcrt.locking(
                        lock.fileno(), continuity.msvcrt.LK_NBLCK, 1
                    )
                else:
                    continuity.fcntl.flock(
                        lock.fileno(),
                        continuity.fcntl.LOCK_EX | continuity.fcntl.LOCK_NB,
                    )
                break
            except (OSError, BlockingIOError):
                if time.monotonic() >= deadline:
                    raise TimeoutError("memory_state_busy")
                time.sleep(0.01)
        data = (
            json.loads(path.read_text())
            if path.exists()
            else json.loads(json.dumps(initial))
        )
        if not isinstance(data, dict):
            raise ValueError("invalid_memory_state")
        yield data
        atomic_json(path, data)
