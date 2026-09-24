#!/usr/bin/env python3
"""Transactional Forgewright project auto-bootstrap manager.

The Node CLI owns cheap policy/preflight reads. This module performs mutating
project/global setup behind ownership receipts and fail-closed rollback.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable

_RUNTIME_DIR = Path(__file__).resolve().parent
if str(_RUNTIME_DIR) not in sys.path:
    sys.path.insert(0, str(_RUNTIME_DIR))
from host_admission import AdmissionError, HostAdmission  # noqa: E402

POLICY_SCHEMA = "forgewright-bootstrap-policy/v1"
STATE_SCHEMA = "forgewright-project-bootstrap/v1"
GLOBAL_SCHEMA = "forgewright-global-runtime/v1"
REGISTRY_SCHEMA = "forgewright-bootstrap-registry/v1"
MODES = ("plugin", "automation", "full")
MODE_RANK = {"plugin": 0, "automation": 1, "full": 2}
PROJECT_FILES = (
    ".forgewright/project.json",
    ".forgewright/project-profile.json",
    ".forgewright/execution-policy.yaml",
    ".forgewright/docs-manifest.json",
    "docs/project-state.json",
    ".production-grade.yaml",
)
MAX_STATE_BYTES = 4 * 1024 * 1024
BOOTSTRAP_WORKER_MIB = 128
BOOTSTRAP_HEAVY_MIB = 128


class BootstrapError(RuntimeError):
    def __init__(self, code: str, message: str, *, stage: str | None = None):
        super().__init__(message)
        self.code = code
        self.stage = stage


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def root_digest(path: Path) -> str:
    return sha256_bytes(str(path.resolve()).encode())


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def bootstrap_home() -> Path:
    explicit = os.environ.get("FORGEWRIGHT_BOOTSTRAP_HOME", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    xdg = os.environ.get("XDG_CONFIG_HOME", "").strip()
    if xdg:
        return Path(xdg).expanduser().resolve() / "forgewright"
    return (Path.home() / ".config" / "forgewright").resolve()


def _safe_existing_file(path: Path, maximum: int = MAX_STATE_BYTES) -> None:
    if not path.exists():
        return
    info = path.lstat()
    if (
        path.is_symlink()
        or not path.is_file()
        or info.st_nlink > 1
        or info.st_size > maximum
    ):
        raise BootstrapError("unsafe_state_path", f"unsafe state path: {path}")


def load_json(path: Path, *, maximum: int = MAX_STATE_BYTES) -> dict[str, Any] | None:
    if not path.exists():
        return None
    _safe_existing_file(path, maximum)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BootstrapError("invalid_json", f"invalid JSON state: {path}") from error
    if not isinstance(value, dict):
        raise BootstrapError("invalid_json", f"JSON state must be an object: {path}")
    return value


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _safe_existing_file(path)
    payload = (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode()
    if len(payload) > MAX_STATE_BYTES:
        raise BootstrapError("state_too_large", f"state exceeds bound: {path}")
    fd, temp_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb", closefd=True) as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
        try:
            directory_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
    finally:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass


def validate_policy(value: dict[str, Any]) -> dict[str, Any]:
    required = {
        "schema",
        "enabled",
        "auto",
        "mode",
        "forgewright_root",
        "allowed_roots",
        "deny_roots",
        "auto_update",
        "mcp_clients",
        "pi_policy",
        "pi_model",
        "created_at",
        "updated_at",
    }
    if set(value) != required or value.get("schema") != POLICY_SCHEMA:
        raise BootstrapError(
            "invalid_policy", "bootstrap policy fields/schema mismatch"
        )
    if (
        value["mode"] not in MODES
        or not isinstance(value["enabled"], bool)
        or not isinstance(value["auto"], bool)
    ):
        raise BootstrapError(
            "invalid_policy", "bootstrap policy mode/enabled/auto invalid"
        )
    if value["pi_policy"] not in ("existing-subscription-only", "disabled"):
        raise BootstrapError("invalid_policy", "unsupported Pi policy")
    if not all(
        isinstance(x, str) for x in value["allowed_roots"] + value["deny_roots"]
    ):
        raise BootstrapError("invalid_policy", "allow/deny roots must be strings")
    if not all(x in ("codex", "claude-code") for x in value["mcp_clients"]):
        raise BootstrapError("invalid_policy", "unsupported MCP client")
    return value


def policy() -> dict[str, Any]:
    value = load_json(bootstrap_home() / "bootstrap-policy.json", maximum=128 * 1024)
    if value is None:
        raise BootstrapError(
            "policy_missing", "global bootstrap policy is not configured"
        )
    return validate_policy(value)


def canonical_project(target: str) -> Path:
    path = Path(target).expanduser()
    if not path.exists() or not path.is_dir():
        raise BootstrapError(
            "project_missing", f"project directory not found: {target}"
        )
    return path.resolve()


def _under(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def enforce_policy_root(project: Path, value: dict[str, Any]) -> None:
    deny = [Path(x).expanduser().resolve() for x in value["deny_roots"]]
    allowed = [Path(x).expanduser().resolve() for x in value["allowed_roots"]]
    if any(_under(project, root) for root in deny):
        raise BootstrapError(
            "root_denied", f"project is under a denied root: {project}"
        )
    if allowed and not any(_under(project, root) for root in allowed):
        raise BootstrapError(
            "root_not_allowed", f"project is not under an allowed root: {project}"
        )


def state_path(project: Path) -> Path:
    return project / ".forgewright" / "bootstrap.json"


def read_state(project: Path) -> dict[str, Any] | None:
    value = load_json(state_path(project))
    if value is None:
        return None
    if value.get("schema") != STATE_SCHEMA:
        raise BootstrapError("invalid_state", "project bootstrap state schema mismatch")
    if value.get("project_root_digest") != root_digest(project):
        raise BootstrapError(
            "foreign_state", "project bootstrap receipt belongs to another root"
        )
    return value


def source_commit(root: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "HEAD"],
        text=True,
        capture_output=True,
        timeout=3,
        check=False,
    )
    value = result.stdout.strip()
    if result.returncode != 0 or not value or len(value) != 40:
        raise BootstrapError(
            "source_commit_unavailable", "cannot resolve Forgewright source commit"
        )
    return value


def _posix_process_group_gone(pid: int) -> bool:
    if os.name == "nt":
        return True
    try:
        os.killpg(pid, 0)
    except ProcessLookupError:
        return True
    except PermissionError:
        return False
    return False


def _terminate_owned_process_tree(process: subprocess.Popen[str]) -> bool:
    if process.poll() is None:
        try:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    text=True,
                    capture_output=True,
                    timeout=5,
                    check=False,
                )
            else:
                os.killpg(process.pid, signal.SIGTERM)
        except (ProcessLookupError, OSError, subprocess.SubprocessError):
            try:
                process.terminate()
            except OSError:
                pass
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        try:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    text=True,
                    capture_output=True,
                    timeout=5,
                    check=False,
                )
            else:
                os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, OSError, subprocess.SubprocessError):
            try:
                process.kill()
            except OSError:
                pass
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass
    if os.name == "nt":
        return process.poll() is not None
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        if _posix_process_group_gone(process.pid):
            return True
        time.sleep(0.02)
    return _posix_process_group_gone(process.pid)


def _drain_owned_process_group(process: subprocess.Popen[str]) -> bool:
    if os.name == "nt":
        return process.poll() is not None
    try:
        os.killpg(process.pid, 0)
    except ProcessLookupError:
        return True
    except PermissionError:
        return False
    # Bootstrap adapters must settle before returning. None of the adapters in
    # this transaction are allowed to daemonize; shared runtime servers are
    # started later by their normal client/runtime launchers.
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return True
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        try:
            os.killpg(process.pid, 0)
        except ProcessLookupError:
            return True
        time.sleep(0.02)
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        return True
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        if _posix_process_group_gone(process.pid):
            return True
        time.sleep(0.02)
    return _posix_process_group_gone(process.pid)


def run(
    argv: list[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
    timeout: float = 120,
    required: bool = True,
    stage: str,
) -> dict[str, Any]:
    merged_env = {**os.environ, **(env or {})}
    creationflags = (
        getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) if os.name == "nt" else 0
    )
    try:
        process = subprocess.Popen(
            argv,
            cwd=cwd,
            env=merged_env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=os.name != "nt",
            creationflags=creationflags,
        )
    except OSError as error:
        if required:
            raise BootstrapError(
                "adapter_failed",
                f"{stage}: cannot run {' '.join(argv)}",
                stage=stage,
            ) from error
        return {"status": "unavailable", "detail": str(error)}
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as error:
        settled = _terminate_owned_process_tree(process)
        if not settled:
            raise BootstrapError(
                "adapter_cleanup_unconfirmed",
                f"{stage}: timed out and owned process tree did not settle",
                stage=stage,
            ) from error
        if required:
            raise BootstrapError(
                "adapter_timeout",
                f"{stage}: timed out after {timeout}s: {' '.join(argv)}",
                stage=stage,
            ) from error
        return {
            "status": "degraded",
            "detail": f"timeout after {timeout}s",
        }
    if not _drain_owned_process_group(process):
        raise BootstrapError(
            "adapter_cleanup_unconfirmed",
            f"{stage}: owned process group did not settle after adapter exit",
            stage=stage,
        )
    if process.returncode != 0:
        if required:
            raise BootstrapError(
                "adapter_failed",
                f"{stage}: {' '.join(argv)} failed ({process.returncode}): {(stderr or stdout)[-1500:]}",
                stage=stage,
            )
        return {
            "status": "degraded",
            "exit_code": process.returncode,
            "detail": (stderr or stdout)[-1000:],
        }
    return {"status": "ready", "stdout": stdout[-4000:]}


def cli_entry() -> list[str]:
    explicit = os.environ.get("FORGEWRIGHT_CLI_ENTRY", "").strip()
    if explicit:
        return [os.environ.get("FORGEWRIGHT_NODE", "node"), explicit]
    raise BootstrapError(
        "cli_entry_missing",
        "FORGEWRIGHT_CLI_ENTRY was not provided by the Forge CLI",
    )


def call_forge(
    args: list[str], *, project: Path, required: bool, stage: str
) -> dict[str, Any]:
    env = {
        "FORGEWRIGHT_WORKSPACE": str(project),
        "FORGEWRIGHT_BOOTSTRAP_HOME": str(bootstrap_home()),
        "FORGE_DELEGATION_NOTICE": "0",
    }
    return run(
        [*cli_entry(), "--json", *args],
        cwd=project,
        env=env,
        timeout=180,
        required=required,
        stage=stage,
    )


def snapshot(project: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for relative in PROJECT_FILES:
        path = project / relative
        if path.exists():
            _safe_existing_file(path)
            data = path.read_bytes()
            result[relative] = {
                "exists": True,
                "sha256": sha256_bytes(data),
                "base64": base64.b64encode(data).decode(),
            }
        else:
            result[relative] = {
                "exists": False,
                "sha256": None,
                "base64": None,
            }
    return result


def ownership(
    before: dict[str, dict[str, Any]], project: Path, stage: str
) -> list[dict[str, Any]]:
    receipts: list[dict[str, Any]] = []
    for relative, previous in before.items():
        path = project / relative
        if path.exists():
            _safe_existing_file(path)
            current_sha = sha256_bytes(path.read_bytes())
        else:
            current_sha = None
        if current_sha == previous["sha256"] or current_sha is None:
            continue
        receipts.append(
            {
                "path": relative,
                "stage": stage,
                "before_exists": previous["exists"],
                "before_sha256": previous["sha256"],
                "before_base64": previous["base64"],
                "after_sha256": current_sha,
            }
        )
    return receipts


def merge_receipts(
    existing: list[dict[str, Any]], new: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    by_path = {item["path"]: dict(item) for item in existing}
    for item in new:
        if item["path"] in by_path:
            original = by_path[item["path"]]
            original["after_sha256"] = item["after_sha256"]
            original["stage"] = f"{original['stage']}+{item['stage']}"
        else:
            by_path[item["path"]] = dict(item)
    return [by_path[key] for key in sorted(by_path)]


def restore_directory_receipts(
    project: Path, receipts: Iterable[dict[str, Any]]
) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []
    for item in reversed(list(receipts)):
        if item.get("kind") != "project_directory":
            continue
        path = project / str(item.get("path", ""))
        if not path.exists():
            actions.append({"path": str(item.get("path")), "status": "already_missing"})
            continue
        if path.is_symlink() or not path.is_dir():
            actions.append({"path": str(item.get("path")), "status": "unsafe_skip"})
            continue
        try:
            current = directory_digest(path)
        except BootstrapError:
            actions.append({"path": str(item.get("path")), "status": "unsafe_skip"})
            continue
        if current != item.get("after_digest"):
            actions.append(
                {"path": str(item.get("path")), "status": "user_modified_skip"}
            )
            continue
        shutil.rmtree(path)
        actions.append({"path": str(item.get("path")), "status": "removed"})
    return actions


def restore_receipts(
    project: Path, receipts: Iterable[dict[str, Any]]
) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []
    for item in reversed(list(receipts)):
        path = project / item["path"]
        current_sha = None
        if path.exists():
            try:
                _safe_existing_file(path)
            except BootstrapError:
                actions.append({"path": item["path"], "status": "unsafe_skip"})
                continue
            current_sha = sha256_bytes(path.read_bytes())
        if current_sha != item["after_sha256"]:
            actions.append({"path": item["path"], "status": "user_modified_skip"})
            continue
        if item["before_exists"]:
            data = base64.b64decode(item["before_base64"])
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            actions.append({"path": item["path"], "status": "restored"})
        else:
            path.unlink(missing_ok=True)
            actions.append({"path": item["path"], "status": "removed"})
    return actions


def admission_home() -> Path:
    explicit = os.environ.get("FORGEWRIGHT_ADMISSION_HOME", "").strip()
    return (
        Path(explicit).expanduser().resolve()
        if explicit
        else (Path.home() / ".forgewright/runtime/admission").resolve()
    )


def _wait_admission_active(
    admission: HostAdmission,
    row: dict[str, Any],
    *,
    job_id: str,
    token: str,
    owner_pid: int,
    timeout: float,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    current = row
    while current.get("state") == "queued":
        if time.monotonic() >= deadline:
            try:
                admission.release(job_id, token, owner_pid, quiescent=True)
            except AdmissionError:
                pass
            raise BootstrapError(
                "host_capacity_timeout",
                f"host capacity did not become available within {timeout}s",
            )
        time.sleep(0.1)
        current = admission.poll(job_id, token, owner_pid)
    if current.get("state") != "active":
        raise BootstrapError(
            "host_admission_closed",
            f"host admission closed with state={current.get('state')}",
        )
    return current


def _open_host_admission(timeout: float = 5.0) -> HostAdmission:
    deadline = time.monotonic() + timeout
    delay = 0.02
    while True:
        try:
            return HostAdmission(admission_home())
        except sqlite3.OperationalError as error:
            if "locked" not in str(error).lower() or time.monotonic() >= deadline:
                raise
            time.sleep(delay)
            delay = min(0.25, delay * 1.7)


class HostCapacityLease:
    def __init__(self, project: Path, *, wait_seconds: float = 120.0):
        self.project = project.resolve()
        self.wait_seconds = wait_seconds
        self.owner_pid = os.getpid()
        self.admission: HostAdmission | None = None
        self.worker_id: str | None = None
        self.worker_token: str | None = None
        self.run_id = "bootstrap-" + uuid.uuid4().hex
        self.uncertain = False

    def __enter__(self):
        try:
            self.admission = _open_host_admission()
            self.worker_id = "bootstrap-worker-" + uuid.uuid4().hex
            self.worker_token = uuid.uuid4().hex + uuid.uuid4().hex
            row = self.admission.enqueue(
                job_id=self.worker_id,
                token=self.worker_token,
                project_root=str(self.project),
                run_id=self.run_id,
                owner_pid=self.owner_pid,
                kind="worker",
                memory_mib=BOOTSTRAP_WORKER_MIB,
            )
            _wait_admission_active(
                self.admission,
                row,
                job_id=self.worker_id,
                token=self.worker_token,
                owner_pid=self.owner_pid,
                timeout=self.wait_seconds,
            )
            return self
        except AdmissionError as error:
            if self.admission is not None:
                self.admission.close()
            raise BootstrapError("host_admission_unavailable", str(error)) from error

    @contextmanager
    def heavy(self, *, wait_seconds: float | None = None):
        if not self.admission or not self.worker_id or not self.worker_token:
            raise BootstrapError(
                "host_lease_missing", "bootstrap worker lease is not active"
            )
        heavy_id = "bootstrap-heavy-" + uuid.uuid4().hex
        heavy_token = uuid.uuid4().hex + uuid.uuid4().hex
        try:
            row = self.admission.enqueue(
                job_id=heavy_id,
                token=heavy_token,
                project_root=str(self.project),
                run_id=self.run_id,
                owner_pid=self.owner_pid,
                kind="heavy",
                memory_mib=BOOTSTRAP_HEAVY_MIB,
                parent_lease_id=self.worker_id,
            )
            _wait_admission_active(
                self.admission,
                row,
                job_id=heavy_id,
                token=heavy_token,
                owner_pid=self.owner_pid,
                timeout=wait_seconds or self.wait_seconds,
            )
            yield
        except AdmissionError as error:
            raise BootstrapError("host_admission_unavailable", str(error)) from error
        finally:
            try:
                self.admission.release(
                    heavy_id,
                    heavy_token,
                    self.owner_pid,
                    quiescent=not self.uncertain,
                )
            except AdmissionError:
                self.uncertain = True

    def mark_uncertain(self) -> None:
        self.uncertain = True

    def __exit__(self, exc_type, exc, _tb):
        if (
            isinstance(exc, BootstrapError)
            and exc.code == "adapter_cleanup_unconfirmed"
        ):
            self.uncertain = True
        if self.admission and self.worker_id and self.worker_token:
            try:
                self.admission.release(
                    self.worker_id,
                    self.worker_token,
                    self.owner_pid,
                    quiescent=not self.uncertain,
                )
            except AdmissionError:
                self.uncertain = True
            self.admission.close()
        if self.uncertain and exc is None:
            raise BootstrapError(
                "host_quiescence_unconfirmed",
                "bootstrap host capacity could not be safely released",
            )
        return False


class Lock:
    def __init__(self, name: str, timeout: float = 120.0):
        home = bootstrap_home()
        (home / "locks").mkdir(parents=True, exist_ok=True)
        self.path = home / "locks" / f"{name}.lock"
        self.timeout = timeout
        self.fd: int | None = None

    def __enter__(self):
        deadline = time.monotonic() + self.timeout
        while True:
            try:
                self.fd = os.open(
                    self.path,
                    os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                    0o600,
                )
                os.write(
                    self.fd,
                    json.dumps({"pid": os.getpid(), "started_at": now()}).encode(),
                )
                os.fsync(self.fd)
                return self
            except FileExistsError:
                stale = False
                try:
                    data = load_json(self.path, maximum=16 * 1024) or {}
                    pid = int(data.get("pid", -1))
                    if pid <= 0:
                        raise ValueError("invalid lock pid")
                    try:
                        os.kill(pid, 0)
                    except ProcessLookupError:
                        stale = True
                    except PermissionError:
                        # A process we cannot signal is not ours to reclaim.
                        stale = False
                except (BootstrapError, ValueError, OSError):
                    try:
                        age = time.time() - self.path.stat().st_mtime
                    except FileNotFoundError:
                        continue
                    # The exclusive create becomes visible before owner JSON is
                    # fully written. Never reclaim a fresh unparsable lock.
                    stale = age >= 5.0
                if stale:
                    try:
                        self.path.unlink()
                    except FileNotFoundError:
                        pass
                    continue
                if time.monotonic() >= deadline:
                    raise BootstrapError(
                        "bootstrap_busy", f"bootstrap lock busy: {self.path}"
                    )
                time.sleep(0.1)

    def __exit__(self, *_args):
        if self.fd is not None:
            os.close(self.fd)
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass


def write_state(project: Path, state: dict[str, Any]) -> None:
    state_path(project).parent.mkdir(parents=True, exist_ok=True)
    atomic_json(state_path(project), state)


def registry() -> dict[str, Any]:
    path = bootstrap_home() / "registry.json"
    value = load_json(path, maximum=512 * 1024)
    if value is None:
        return {"schema": REGISTRY_SCHEMA, "projects": []}
    if value.get("schema") != REGISTRY_SCHEMA or not isinstance(
        value.get("projects"), list
    ):
        raise BootstrapError("invalid_registry", "bootstrap registry is malformed")
    return value


def save_registry(value: dict[str, Any]) -> None:
    atomic_json(bootstrap_home() / "registry.json", value)


def register_project(project: Path, mode: str, status: str) -> None:
    with Lock("registry", timeout=30):
        value = registry()
        digest = root_digest(project)
        entry = {
            "root": str(project),
            "root_digest": digest,
            "mode": mode,
            "status": status,
            "updated_at": now(),
        }
        value["projects"] = [
            x for x in value["projects"] if x.get("root_digest") != digest
        ] + [entry]
        value["projects"].sort(key=lambda x: x["root"])
        save_registry(value)


def unregister_project(project: Path) -> None:
    with Lock("registry", timeout=30):
        value = registry()
        digest = root_digest(project)
        value["projects"] = [
            x for x in value["projects"] if x.get("root_digest") != digest
        ]
        save_registry(value)


def fault(stage: str) -> None:
    requested = os.environ.get("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE")
    if requested == stage:
        raise BootstrapError(
            "injected_failure",
            f"injected failure after {stage}",
            stage=stage,
        )


def ensure_policy_file(root: Path, project: Path) -> str:
    source = root / ".forgewright" / "execution-policy.yaml"
    target = project / ".forgewright" / "execution-policy.yaml"
    if target.exists():
        _safe_existing_file(target)
        return "preserved"
    if not source.is_file():
        raise BootstrapError(
            "policy_source_missing",
            f"execution policy source missing: {source}",
            stage="policy_seed",
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())
    return "created"


def directory_digest(path: Path) -> str:
    hasher = hashlib.sha256()
    files = 0
    total = 0
    for child in sorted(path.rglob("*"), key=lambda item: item.as_posix()):
        relative = child.relative_to(path).as_posix().encode()
        hasher.update(relative + b"\\0")
        if child.is_symlink():
            hasher.update(b"L" + os.readlink(child).encode() + b"\\0")
            continue
        if child.is_dir():
            hasher.update(b"D\\0")
            continue
        if not child.is_file():
            raise BootstrapError(
                "unsafe_owned_directory", f"unsupported entry in {path}: {child}"
            )
        files += 1
        total += child.stat().st_size
        if files > 5000 or total > 64 * 1024 * 1024:
            raise BootstrapError(
                "owned_directory_too_large",
                f"owned directory exceeds safety bound: {path}",
            )
        hasher.update(b"F" + child.read_bytes() + b"\\0")
    return hasher.hexdigest()


def gitnexus(project: Path) -> dict[str, Any]:
    existing = [
        name for name in (".gitnexus", ".forgenexus") if (project / name).exists()
    ]
    if existing:
        return {
            "status": "ready",
            "detail": "preserved_existing_index",
            "created_dirs": [],
        }
    command = shutil.which("gitnexus")
    if not command:
        return {
            "status": "degraded",
            "detail": "gitnexus_unavailable",
            "created_dirs": [],
        }
    result = run(
        [command, "analyze", str(project), "--index-only"],
        cwd=project,
        required=False,
        stage="index",
        timeout=180,
    )
    created = []
    if result["status"] == "ready":
        for name in (".gitnexus", ".forgenexus"):
            path = project / name
            if path.is_dir() and not path.is_symlink():
                created.append({"path": name, "after_digest": directory_digest(path)})
    result["created_dirs"] = created
    return result


def parse_json_envelope(output: str) -> dict[str, Any] | None:
    for line in reversed(output.splitlines()):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    return None


def docs(project: Path) -> tuple[dict[str, Any], dict[str, Any] | None]:
    init = call_forge(
        ["docs", "init", str(project)],
        project=project,
        required=True,
        stage="docs_init",
    )
    add = call_forge(
        ["docs", "registry", "add", str(project)],
        project=project,
        required=True,
        stage="docs_register",
    )
    envelope = parse_json_envelope(add.get("stdout", ""))
    receipt = None
    if envelope and isinstance(envelope.get("data"), dict):
        data = envelope["data"]
        project_data = data.get("project")
        receipt = {
            "kind": "docs_registry",
            "id": (project_data.get("id") if isinstance(project_data, dict) else None),
            "status": str(data.get("status", "unknown")),
        }
    return init, receipt


def global_runtime_receipt() -> Path:
    return bootstrap_home() / "global-runtime.json"


def ensure_global_runtime(
    policy_value: dict[str, Any],
    root: Path,
) -> dict[str, Any]:
    commit = source_commit(root)
    existing = load_json(global_runtime_receipt(), maximum=512 * 1024)
    clients = list(policy_value["mcp_clients"])
    if (
        existing
        and existing.get("schema") == GLOBAL_SCHEMA
        and existing.get("source_commit") == commit
        and existing.get("status") == "ready"
        and sorted(existing.get("mcp_clients", [])) == sorted(clients)
    ):
        return existing

    components: dict[str, str] = {}
    detail: dict[str, str] = {}
    status = "ready"
    with Lock("global-heavy", timeout=180):
        if os.name == "nt":
            components["runtime_guard"] = "unsupported"
            components["mcp"] = "unsupported"
            status = "degraded"
        else:
            rlg = run(
                [
                    "bash",
                    str(root / "scripts/runtime/runtime-install.sh"),
                    "--link",
                    "--from",
                    str(root),
                ],
                cwd=root,
                required=False,
                stage="runtime_guard",
                timeout=120,
            )
            components["runtime_guard"] = rlg["status"]
            if rlg["status"] != "ready":
                status = "degraded"
                detail["runtime_guard"] = str(rlg.get("detail", "unavailable"))

            if clients:
                flags = [
                    "--codex" if client == "codex" else "--claude-code"
                    for client in clients
                ]
                setup = run(
                    [
                        "bash",
                        str(root / "scripts/mcp/forgewright-mcp-setup.sh"),
                        *flags,
                    ],
                    cwd=root,
                    required=False,
                    stage="mcp_clients",
                    timeout=180,
                )
                components["mcp"] = setup["status"]
                components["mcp_clients"] = ",".join(clients)
                if setup["status"] != "ready":
                    status = "degraded"
                    detail["mcp_clients"] = str(setup.get("detail", "unavailable"))
            else:
                components["mcp"] = "not_requested"

    receipt = {
        "schema": GLOBAL_SCHEMA,
        "status": status,
        "source_commit": commit,
        "forgewright_root": str(root),
        "mcp_clients": clients,
        "components": components,
        "detail": detail,
        "verified_at": now(),
    }
    atomic_json(global_runtime_receipt(), receipt)
    return receipt


def pi_prepare(
    policy_value: dict[str, Any],
    project: Path,
) -> dict[str, Any]:
    if policy_value["pi_policy"] == "disabled":
        return {"status": "disabled"}
    model = policy_value.get("pi_model")
    if model:
        result = call_forge(
            [
                "delegate",
                "on",
                "--worker",
                "pi",
                "--provider",
                "openai-codex",
                "--auth-source",
                "codex",
                "--model",
                model,
            ],
            project=project,
            required=False,
            stage="pi_prepare",
        )
        return {"status": result["status"], "detail": result.get("detail")}
    status = call_forge(
        ["delegate", "status", "--worker", "pi"],
        project=project,
        required=False,
        stage="pi_status",
    )
    return {
        "status": (
            "optional_unconfigured" if status["status"] == "ready" else status["status"]
        ),
        "detail": status.get("detail"),
    }


def initial_state(
    project: Path,
    mode: str,
    commit: str,
) -> dict[str, Any]:
    return {
        "schema": STATE_SCHEMA,
        "mode": mode,
        "status": "pending",
        "source_commit": commit,
        "project_root_digest": root_digest(project),
        "owned_paths": [],
        "external_config_receipts": [],
        "components": {},
        "last_verified_at": None,
        "last_error": None,
    }


def ensure(
    target: str,
    requested_mode: str | None,
    *,
    repair: bool = False,
) -> dict[str, Any]:
    value = policy()
    if not value["enabled"]:
        raise BootstrapError(
            "policy_disabled",
            "global bootstrap policy is disabled",
        )
    project = canonical_project(target)
    enforce_policy_root(project, value)
    root = Path(value["forgewright_root"]).resolve()
    mode = requested_mode or value["mode"]
    if mode not in ("automation", "full"):
        raise BootstrapError(
            "invalid_mode",
            "ensure requires automation or full mode",
        )
    commit = source_commit(root)

    with Lock(f"project-{root_digest(project)}", timeout=180):
        old_state = read_state(project)
        if (
            old_state
            and not repair
            and old_state.get("status") == "ready"
            and MODE_RANK.get(old_state.get("mode"), -1) >= MODE_RANK[mode]
            and old_state.get("source_commit") == commit
        ):
            register_project(project, old_state["mode"], "ready")
            return {
                "status": "ready",
                "changed": False,
                "project": str(project),
                "state": old_state,
            }

        with HostCapacityLease(project) as capacity:
            state = initial_state(project, mode, commit)
            if old_state:
                state["owned_paths"] = list(old_state.get("owned_paths", []))
                state["external_config_receipts"] = list(
                    old_state.get("external_config_receipts", [])
                )
            state["status"] = "bootstrapping"
            write_state(project, state)
            register_project(project, mode, "bootstrapping")
            before = snapshot(project)

            try:
                call_forge(
                    ["init", str(project)],
                    project=project,
                    required=True,
                    stage="project_init",
                )
                call_forge(
                    ["onboard", str(project)],
                    project=project,
                    required=True,
                    stage="project_onboard",
                )
                state["owned_paths"] = merge_receipts(
                    state["owned_paths"],
                    ownership(before, project, "project_init"),
                )
                before = snapshot(project)
                fault("project_init")

                state["components"]["execution_policy"] = ensure_policy_file(
                    root, project
                )
                state["owned_paths"] = merge_receipts(
                    state["owned_paths"],
                    ownership(before, project, "policy_seed"),
                )
                before = snapshot(project)
                fault("policy_seed")

                with capacity.heavy():
                    with Lock("global-heavy", timeout=180):
                        index = gitnexus(project)
                state["components"]["gitnexus"] = index["status"]
                for created in index.get("created_dirs", []):
                    receipt = {
                        "kind": "project_directory",
                        "path": created["path"],
                        "status": "created",
                        "after_digest": created["after_digest"],
                    }
                    if not any(
                        item.get("kind") == "project_directory"
                        and item.get("path") == receipt["path"]
                        for item in state["external_config_receipts"]
                    ):
                        state["external_config_receipts"].append(receipt)
                fault("index")

                with Lock("docs-registry", timeout=120):
                    docs_result, docs_receipt = docs(project)
                state["components"]["docs"] = docs_result["status"]
                if docs_receipt and not any(
                    x.get("kind") == "docs_registry"
                    and x.get("id") == docs_receipt.get("id")
                    for x in state["external_config_receipts"]
                ):
                    state["external_config_receipts"].append(docs_receipt)
                state["owned_paths"] = merge_receipts(
                    state["owned_paths"],
                    ownership(before, project, "docs"),
                )
                before = snapshot(project)
                fault("docs")

                delegation = call_forge(
                    ["delegate", "status"],
                    project=project,
                    required=False,
                    stage="delegate_status",
                )
                state["components"]["delegation"] = delegation["status"]
                fault("delegate_status")

                if mode == "full":
                    with capacity.heavy(wait_seconds=180):
                        global_receipt = ensure_global_runtime(value, root)
                    state["components"]["global_runtime"] = global_receipt["status"]
                    pi = pi_prepare(value, project)
                    state["components"]["pi"] = str(pi["status"])
                    fault("full_runtime")

                component_degraded = any(
                    component in {"degraded", "unavailable", "unsupported"}
                    for component in state["components"].values()
                )
                drift = ownership_issues(project, state)
                if drift:
                    state["components"]["ownership"] = "degraded"
                    state["components"]["ownership_issues"] = ",".join(drift[:16])
                state["status"] = "degraded" if component_degraded or drift else "ready"
                state["last_verified_at"] = now()
                state["last_error"] = None
                write_state(project, state)
                register_project(project, mode, state["status"])
                return {
                    "status": state["status"],
                    "changed": True,
                    "project": str(project),
                    "mode": mode,
                    "state": state,
                }
            except Exception as error:
                state["status"] = "rolling_back"
                state["last_error"] = str(error)[:2000]
                try:
                    write_state(project, state)
                except Exception:
                    pass
                rollback = restore_receipts(
                    project,
                    state.get("owned_paths", []),
                )
                rollback.extend(
                    restore_directory_receipts(
                        project,
                        state.get("external_config_receipts", []),
                    )
                )
                state["status"] = "blocked"
                state["last_verified_at"] = now()
                state["components"]["rollback"] = "completed"
                state["rollback"] = rollback
                try:
                    write_state(project, state)
                except Exception:
                    pass
                register_project(project, mode, "blocked")
                if isinstance(error, BootstrapError):
                    raise BootstrapError(
                        error.code,
                        str(error),
                        stage=error.stage,
                    ) from error
                raise BootstrapError(
                    "bootstrap_failed",
                    str(error),
                ) from error


def ownership_issues(project: Path, state: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    for item in state.get("owned_paths", []):
        path = project / item["path"]
        if not path.exists():
            issues.append(f"owned_missing:{item['path']}")
            continue
        try:
            _safe_existing_file(path)
        except BootstrapError:
            issues.append(f"owned_unsafe:{item['path']}")
            continue
        if sha256_bytes(path.read_bytes()) != item["after_sha256"]:
            issues.append(f"owned_modified:{item['path']}")
    for item in state.get("external_config_receipts", []):
        if item.get("kind") != "project_directory":
            continue
        path = project / str(item.get("path", ""))
        if not path.is_dir() or path.is_symlink():
            issues.append(f"owned_directory_missing:{item.get('path')}")
            continue
        try:
            if directory_digest(path) != item.get("after_digest"):
                issues.append(f"owned_directory_modified:{item.get('path')}")
        except BootstrapError:
            issues.append(f"owned_directory_unsafe:{item.get('path')}")
    return issues


def verify(target: str) -> dict[str, Any]:
    value = policy()
    project = canonical_project(target)
    enforce_policy_root(project, value)
    state = read_state(project)
    if not state:
        return {
            "status": "unmanaged",
            "project": str(project),
            "ok": False,
        }
    commit = source_commit(Path(value["forgewright_root"]))
    issues: list[str] = []
    if state["source_commit"] != commit:
        issues.append("source_changed")
    if state["status"] not in {"ready", "degraded"}:
        issues.append(f"state_{state['status']}")
    issues.extend(ownership_issues(project, state))
    return {
        "status": "ready" if not issues else "degraded",
        "project": str(project),
        "ok": not issues,
        "issues": issues,
        "state": state,
    }


def disable(
    target: str,
    *,
    keep_profile: bool,
) -> dict[str, Any]:
    project = canonical_project(target)
    state = read_state(project)
    if not state:
        unregister_project(project)
        return {
            "status": "unmanaged",
            "project": str(project),
            "changed": False,
        }
    receipts = list(state.get("owned_paths", []))
    if keep_profile:
        receipts = [
            item
            for item in receipts
            if item["path"]
            not in {
                ".forgewright/project.json",
                ".forgewright/project-profile.json",
            }
        ]
    actions = restore_receipts(project, receipts)
    actions.extend(
        restore_directory_receipts(
            project,
            state.get("external_config_receipts", []),
        )
    )

    for receipt in state.get("external_config_receipts", []):
        if receipt.get("kind") == "docs_registry" and receipt.get("status") == "added":
            try:
                call_forge(
                    [
                        "docs",
                        "registry",
                        "remove",
                        str(receipt.get("id") or project),
                    ],
                    project=project,
                    required=False,
                    stage="docs_unregister",
                )
            except BootstrapError:
                pass

    state_path(project).unlink(missing_ok=True)
    unregister_project(project)
    return {
        "status": "disabled",
        "project": str(project),
        "changed": True,
        "keep_profile": keep_profile,
        "rollback": actions,
        "shared_runtime_preserved": True,
    }


def explain(
    target: str,
    mode: str | None,
) -> dict[str, Any]:
    value = policy()
    project = canonical_project(target)
    enforce_policy_root(project, value)
    desired = mode or value["mode"]
    current = read_state(project)
    stages = [
        "project_init",
        "project_onboard",
        "policy_seed",
        "gitnexus_index",
        "docs_register",
        "delegate_status",
    ]
    if desired == "full":
        stages += [
            "shared_runtime_guard",
            "shared_mcp",
            "pi_readiness",
        ]
    return {
        "status": "plan",
        "project": str(project),
        "desired_mode": desired,
        "current_state": current["status"] if current else "unmanaged",
        "stages": stages,
        "will_not_touch": [
            "project source files outside Forgewright-owned bootstrap paths",
            "credentials",
            "billing",
            "deploy/publish state",
            "branch protection",
        ],
        "shared_runtime": desired == "full",
        "submodule_required": False,
    }


def status(target: str) -> dict[str, Any]:
    project = canonical_project(target)
    state = read_state(project)
    return {
        "project": str(project),
        "status": state["status"] if state else "unmanaged",
        "mode": state["mode"] if state else "plugin",
        "state": state,
        "submodule_required": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in (
        "ensure",
        "repair",
        "verify",
        "disable",
        "explain",
        "status",
    ):
        cmd = sub.add_parser(name)
        cmd.add_argument("target", nargs="?", default=".")
        if name in {"ensure", "repair", "explain"}:
            cmd.add_argument("--mode", choices=("automation", "full"))
        if name == "disable":
            cmd.add_argument("--keep-profile", action="store_true")

    args = parser.parse_args()
    try:
        if args.command == "ensure":
            result = ensure(args.target, args.mode)
        elif args.command == "repair":
            result = ensure(args.target, args.mode, repair=True)
        elif args.command == "verify":
            result = verify(args.target)
        elif args.command == "disable":
            result = disable(
                args.target,
                keep_profile=args.keep_profile,
            )
        elif args.command == "explain":
            result = explain(args.target, args.mode)
        else:
            result = status(args.target)
        print(
            json.dumps(
                {"ok": True, "data": result, "error": None},
                ensure_ascii=False,
            )
        )
        return 0
    except BootstrapError as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "data": {"stage": error.stage},
                    "error": {
                        "code": error.code,
                        "message": str(error),
                    },
                },
                ensure_ascii=False,
            )
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
