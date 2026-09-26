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
import re
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import uuid
import threading
import tomllib
from contextvars import ContextVar
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable

_RUNTIME_DIR = Path(__file__).resolve().parent
if str(_RUNTIME_DIR) not in sys.path:
    sys.path.insert(0, str(_RUNTIME_DIR))
from host_admission import AdmissionError, HostAdmission  # noqa: E402
from host_resources import inspect_process  # noqa: E402
from shared_runtime_adapter import (  # noqa: E402
    SharedRuntimeError,
    assert_runtime_quiescent,
    begin_shared_runtime,
    install_shared_runtime,
    recover_shared_runtime,
    shared_runtime_receipt_digest,
    verify_shared_runtime,
)

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
BOOTSTRAP_ADMISSION_WAIT_SECONDS = 60.0
PROJECT_DIRS = (".gitnexus", ".forgenexus")
DISABLED_SCHEMA = "forgewright-bootstrap-disabled/v1"
_TRANSACTION: ContextVar[Any] = ContextVar("bootstrap_transaction", default=None)
_DEADLINE: ContextVar[float | None] = ContextVar("bootstrap_deadline", default=None)
_RUNTIME_UPDATE_ALLOWED: ContextVar[bool] = ContextVar(
    "bootstrap_runtime_update_allowed", default=False
)


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
        result = Path(explicit).expanduser().absolute()
        _safe_path(result, directory=True)
        return result
    xdg = os.environ.get("XDG_CONFIG_HOME", "").strip()
    if xdg:
        result = Path(xdg).expanduser().absolute() / "forgewright"
        _safe_path(result, directory=True)
        return result
    result = Path.home() / ".config" / "forgewright"
    _safe_path(result, directory=True)
    return result


def _safe_existing_file(path: Path, maximum: int = MAX_STATE_BYTES) -> None:
    _safe_path(path)
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


def _safe_path(path: Path, *, directory: bool = False) -> None:
    """Application-level checks, not an OS sandbox against same-user races."""
    path = path.absolute()
    for part in [*reversed(path.parents), path]:
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        is_dir = stat.S_ISDIR(info.st_mode)
        if (
            stat.S_ISLNK(info.st_mode)
            or (part != path and not is_dir)
            or (part == path and directory and not is_dir)
            or (not is_dir and (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1))
        ):
            raise BootstrapError("unsafe_state_path", f"unsafe path: {part}")


def _project_path(project: Path, relative: str, *, directory: bool = False) -> Path:
    allowed = PROJECT_DIRS if directory else PROJECT_FILES
    if not isinstance(relative, str) or relative not in allowed:
        raise BootstrapError(
            "unsafe_receipt", "receipt path is outside bootstrap scope"
        )
    _safe_path(project, directory=True)
    enforce_policy_root(project, policy())
    path = project / relative
    if directory:
        _safe_path(path, directory=True)
    else:
        _safe_existing_file(path)
    return path


def _hash(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _validate_receipts(
    receipts: Any, project: Path | None = None
) -> list[dict[str, Any]]:
    if not isinstance(receipts, list):
        raise BootstrapError("invalid_receipt", "receipts must be a list")
    seen = set()
    for item in receipts:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            raise BootstrapError("invalid_receipt", "invalid receipt object")
        if item["path"] not in PROJECT_FILES or item["path"] in seen:
            raise BootstrapError("unsafe_receipt", "unsafe or duplicate receipt path")
        seen.add(item["path"])
        if not _hash(item.get("project_root_digest")) or (
            project is not None and item["project_root_digest"] != root_digest(project)
        ):
            raise BootstrapError("foreign_receipt", "receipt root binding mismatch")
        if (
            type(item.get("before_exists")) is not bool
            or not isinstance(item.get("stage"), str)
            or (
                item.get("after_sha256") is not None and not _hash(item["after_sha256"])
            )
            or "after_sha256" not in item
        ):
            raise BootstrapError("invalid_receipt", "invalid receipt types/hash")
        if item["before_exists"]:
            if not isinstance(item.get("before_base64"), str):
                raise BootstrapError(
                    "invalid_receipt", "before payload must be base64 text"
                )
            try:
                data = base64.b64decode(item["before_base64"], validate=True)
            except (KeyError, ValueError, TypeError) as error:
                raise BootstrapError(
                    "invalid_receipt", "invalid before payload"
                ) from error
            if len(data) > MAX_STATE_BYTES or sha256_bytes(data) != item.get(
                "before_sha256"
            ):
                raise BootstrapError("invalid_receipt", "before payload/hash mismatch")
        elif (
            item.get("before_sha256") is not None
            or item.get("before_base64") is not None
        ):
            raise BootstrapError(
                "invalid_receipt", "absent before payload must be null"
            )
    return receipts


def _validate_external(
    receipts: Any, project: Path | None = None
) -> list[dict[str, Any]]:
    if not isinstance(receipts, list):
        raise BootstrapError("invalid_receipt", "external receipts must be a list")
    seen = set()
    for item in receipts:
        if not isinstance(item, dict):
            raise BootstrapError("invalid_receipt", "invalid external receipt")
        if not _hash(item.get("project_root_digest")) or (
            project is not None and item["project_root_digest"] != root_digest(project)
        ):
            raise BootstrapError(
                "foreign_receipt", "external receipt root binding mismatch"
            )
        if item.get("kind") == "project_directory":
            if (
                item.get("path") not in PROJECT_DIRS
                or not _hash(item.get("after_digest"))
                or item.get("path") in seen
            ):
                raise BootstrapError("unsafe_receipt", "invalid directory receipt")
            seen.add(item["path"])
        elif item.get("kind") == "docs_registry":
            if item.get("status") not in {
                "added",
                "updated",
                "unchanged",
                "existing",
                "unknown",
            } or (item.get("id") is not None and not isinstance(item["id"], str)):
                raise BootstrapError("invalid_receipt", "invalid Docs receipt")
        else:
            raise BootstrapError("invalid_receipt", "unknown external receipt kind")
    return receipts


def _validate_state(project: Path, value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("schema") != STATE_SCHEMA:
        raise BootstrapError("invalid_state", "project bootstrap state schema mismatch")
    if value.get("project_root_digest") != root_digest(project):
        raise BootstrapError(
            "foreign_state", "project bootstrap receipt belongs to another root"
        )
    required = {
        "schema",
        "mode",
        "status",
        "source_commit",
        "project_root_digest",
        "owned_paths",
        "external_config_receipts",
        "components",
        "last_verified_at",
        "last_error",
    }
    if not required.issubset(value) or set(value) - required - {"rollback"}:
        raise BootstrapError("invalid_state", "bootstrap state fields mismatch")
    if "rollback" in value and (
        not isinstance(value["rollback"], list)
        or not all(
            isinstance(x, dict)
            and isinstance(x.get("path"), str)
            and isinstance(x.get("status"), str)
            for x in value["rollback"]
        )
    ):
        raise BootstrapError("invalid_state", "invalid rollback report")
    if (
        not isinstance(value.get("mode"), str)
        or value["mode"] not in MODES
        or not isinstance(value.get("status"), str)
        or value["status"]
        not in {
            "pending",
            "bootstrapping",
            "ready",
            "degraded",
            "rolling_back",
            "blocked",
        }
        or not isinstance(value.get("source_commit"), str)
        or re.fullmatch(r"[0-9a-f]{40}", value["source_commit"]) is None
        or not isinstance(value.get("components"), dict)
        or not all(
            isinstance(k, str) and isinstance(v, str)
            for k, v in value["components"].items()
        )
        or any(
            value.get(k) is not None and not isinstance(value[k], str)
            for k in ("last_verified_at", "last_error")
        )
    ):
        raise BootstrapError("invalid_state", "invalid bootstrap state fields")
    _validate_receipts(value.get("owned_paths"), project)
    _validate_external(value.get("external_config_receipts"), project)
    return value


def load_json(path: Path, *, maximum: int = MAX_STATE_BYTES) -> dict[str, Any] | None:
    _safe_existing_file(path, maximum)
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
    _safe_existing_file(path)
    payload = (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode()
    if len(payload) > MAX_STATE_BYTES:
        raise BootstrapError("state_too_large", f"state exceeds bound: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
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
    if (
        not isinstance(value, dict)
        or set(value) != required
        or value.get("schema") != POLICY_SCHEMA
    ):
        raise BootstrapError(
            "invalid_policy", "bootstrap policy fields/schema mismatch"
        )
    if (
        any(type(value[k]) is not bool for k in ("enabled", "auto", "auto_update"))
        or any(
            not isinstance(value[k], str)
            for k in (
                "mode",
                "forgewright_root",
                "pi_policy",
                "created_at",
                "updated_at",
            )
        )
        or (value["pi_model"] is not None and not isinstance(value["pi_model"], str))
        or any(
            not isinstance(value[k], list)
            for k in ("allowed_roots", "deny_roots", "mcp_clients")
        )
    ):
        raise BootstrapError("invalid_policy", "bootstrap policy field types invalid")
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
    if len(set(value["mcp_clients"])) != len(value["mcp_clients"]) or not all(
        Path(x).is_absolute() and "\x00" not in x
        for x in [
            value["forgewright_root"],
            *value["allowed_roots"],
            *value["deny_roots"],
        ]
    ):
        raise BootstrapError(
            "invalid_policy", "policy roots must be absolute; clients unique"
        )
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
    path = path.resolve()
    # Ancestor detection keeps disposable .git fixtures valid; real repositories
    # additionally use git's worktree-aware toplevel resolution.
    for candidate in (path, *path.parents):
        if (candidate / ".git").exists():
            result = subprocess.run(
                ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
                capture_output=True,
                text=True,
                timeout=3,
                check=False,
            )
            if result.returncode == 0:
                return Path(result.stdout.strip()).resolve()
            return candidate
    return path


def _under(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def enforce_policy_root(project: Path, value: dict[str, Any]) -> None:
    validate_policy(value)
    project = project.resolve()
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
    return _validate_state(project, value)


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
    if os.name != "nt":
        # A reaped leader says nothing about descendants holding its pipes.
        settled = _drain_owned_process_group(process)
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            return False
        return settled or _posix_process_group_gone(process.pid)
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
    except PermissionError:
        return False
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        process.poll()  # Reap an exited leader before checking group liveness.
        try:
            os.killpg(process.pid, 0)
        except ProcessLookupError:
            return True
        except PermissionError:
            return False
        time.sleep(0.02)
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        return True
    except PermissionError:
        return False
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        process.poll()
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
    inherit_env: bool = True,
) -> dict[str, Any]:
    deadline = _DEADLINE.get()
    if deadline is not None:
        timeout = min(timeout, deadline - time.monotonic())
        if timeout <= 0:
            raise BootstrapError(
                "operation_timeout", "bootstrap operation deadline exceeded"
            )
    merged_env = {**os.environ, **(env or {})} if inherit_env else dict(env or {})
    creationflags = (
        getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) if os.name == "nt" else 0
    )
    _record_process(spawn_pending=True)
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
        _record_process(spawn_pending=False)
        if required:
            raise BootstrapError(
                "adapter_failed",
                f"{stage}: cannot run {' '.join(argv)}",
                stage=stage,
            ) from error
        return {"status": "unavailable", "detail": str(error)}
    tracking = _TRANSACTION.get()
    process_record = {"pid": process.pid, "identity": None, "quiescent": False}
    handlers = {}
    if threading.current_thread() is threading.main_thread():

        def interrupted(signum, _frame):
            raise BootstrapError(
                "operation_interrupted",
                f"bootstrap interrupted by signal {signum}",
                stage=stage,
            )

        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            handlers[sig] = signal.signal(sig, interrupted)
    try:
        if tracking is not None:
            process_record["identity"] = inspect_process(process.pid)
            tracking[1]["processes"].append(process_record)
            _record_process(spawn_pending=False)
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired as error:
            # Ignore further termination signals during the bounded cleanup.
            for sig in handlers:
                signal.signal(sig, signal.SIG_IGN)
            if not _terminate_owned_process_tree(process):
                raise BootstrapError(
                    "adapter_cleanup_unconfirmed",
                    f"{stage}: timed out; process cleanup unconfirmed",
                    stage=stage,
                ) from error
            process_record["quiescent"] = True
            if required:
                raise BootstrapError(
                    "adapter_timeout", f"{stage}: timeout after {timeout}s", stage=stage
                ) from error
            return {"status": "degraded", "detail": f"timeout after {timeout}s"}
        if not _drain_owned_process_group(process):
            raise BootstrapError(
                "adapter_cleanup_unconfirmed",
                f"{stage}: process group did not settle after exit",
                stage=stage,
            )
        process_record["quiescent"] = True
        if process.returncode != 0:
            if required:
                raise BootstrapError(
                    "adapter_failed",
                    f"{stage}: adapter exited {process.returncode}",
                    stage=stage,
                )
            return {
                "status": "degraded",
                "exit_code": process.returncode,
                "detail": f"{stage}: adapter exited {process.returncode}",
            }
        return {"status": "ready", "stdout": stdout[-4000:]}
    except BaseException as error:
        for sig in handlers:
            signal.signal(sig, signal.SIG_IGN)
        # Avoid a second cleanup attempt once a timeout/normal drain established
        # uncertainty. The caller must retain recovery evidence and quarantine.
        if isinstance(error, BootstrapError) and error.code in {
            "adapter_timeout",
            "adapter_cleanup_unconfirmed",
        }:
            raise
        if not _terminate_owned_process_tree(process):
            raise BootstrapError(
                "adapter_cleanup_unconfirmed",
                "interrupted adapter cleanup unconfirmed",
                stage=stage,
            ) from error
        process_record["quiescent"] = True
        raise
    finally:
        for sig, handler in handlers.items():
            signal.signal(sig, handler)
        for pipe in (process.stdout, process.stderr):
            if pipe is not None:
                pipe.close()
        if tracking is not None:
            try:
                _record_process()
            except BaseException as error:
                if not process_record["quiescent"]:
                    raise BootstrapError(
                        "adapter_cleanup_unconfirmed",
                        "process cleanup and journal persistence unconfirmed",
                        stage=stage,
                    ) from error
                raise


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
    result = run(
        [*cli_entry(), "--json", *args],
        cwd=project,
        env=env,
        timeout=180,
        required=required,
        stage=stage,
    )
    if result["status"] == "ready":
        envelope = parse_json_envelope(result.get("stdout", ""))
        pi_status = (
            args == ["delegate", "status", "--worker", "pi"]
            and isinstance(envelope, dict)
            and envelope.get("worker") == "pi"
            and type(envelope.get("ready")) is bool
            and type(envelope.get("enabled")) is bool
        )
        if not envelope or (envelope.get("ok") is not True and not pi_status):
            if required:
                raise BootstrapError(
                    "adapter_failed",
                    f"{stage}: missing or unsuccessful JSON result",
                    stage=stage,
                )
            return {"status": "degraded", "detail": f"{stage}: unverified JSON result"}
    return result


def snapshot(project: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for relative in PROJECT_FILES:
        path = _project_path(project, relative)
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
        path = _project_path(project, relative)
        _validate_receipts(
            [
                {
                    "path": relative,
                    "stage": stage,
                    "project_root_digest": root_digest(project),
                    "before_exists": previous.get("exists"),
                    "before_sha256": previous.get("sha256"),
                    "before_base64": previous.get("base64"),
                    "after_sha256": None,
                }
            ]
        )
        if path.exists():
            _safe_existing_file(path)
            current_sha = sha256_bytes(path.read_bytes())
        else:
            current_sha = None
        if current_sha == previous["sha256"]:
            continue
        receipts.append(
            {
                "path": relative,
                "project_root_digest": root_digest(project),
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


def _fsync_directory(path: Path) -> None:
    try:
        descriptor = os.open(path, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    except OSError:
        # Some supported filesystems cannot fsync a directory.  The rename is
        # still atomic; keep the durable journal for recovery.
        pass


def _directory_file_manifest(path: Path) -> dict[str, str]:
    """Return the exact owned regular-file set before directory cleanup."""
    _safe_path(path, directory=True)
    manifest: dict[str, str] = {}
    for child in sorted(path.rglob("*"), key=lambda item: item.as_posix()):
        _safe_path(child)
        if child.is_dir():
            continue
        if not child.is_file():
            raise BootstrapError("unsafe_directory", f"unsafe rollback tree: {child}")
        relative = child.relative_to(path).as_posix()
        manifest[relative] = sha256_bytes(child.read_bytes())
    return manifest


def _directory_rollback_journal(project: Path) -> Path:
    home = bootstrap_home()
    if _under(home.resolve(), project.resolve()):
        raise BootstrapError(
            "unsafe_ownership_store",
            "directory rollback store must be outside the project",
        )
    path = home / "directory-rollbacks" / f"{root_digest(project)}.json"
    _safe_existing_file(path)
    for part in (home, path.parent, path):
        if part.exists():
            info = part.stat()
            if hasattr(os, "getuid") and (
                info.st_uid != os.getuid() or info.st_mode & 0o022
            ):
                raise BootstrapError(
                    "unsafe_ownership_store",
                    f"directory rollback store is not user-owned: {part}",
                )
    return path


def _cleanup_directory_tombstone(project: Path, record: dict[str, Any]) -> str:
    """Remove only unchanged, journaled files from an atomically renamed tree."""
    journal = _directory_rollback_journal(project)
    if (
        record.get("schema") != "forgewright-directory-rollback/v1"
        or record.get("project_root_digest") != root_digest(project)
        or record.get("path") not in PROJECT_DIRS
        or not isinstance(record.get("tombstone"), str)
        or not isinstance(record.get("files"), dict)
    ):
        raise BootstrapError("recovery_required", "invalid directory rollback journal")
    path = _project_path(project, record["path"], directory=True)
    tombstone = path.with_name(record["tombstone"])
    if tombstone.parent != path.parent or not tombstone.name.startswith(
        f".{path.name}.forgewright-rollback-"
    ):
        raise BootstrapError("recovery_required", "unsafe directory rollback tombstone")
    if not tombstone.exists():
        # A missing tombstone cannot prove that the old tree was completely
        # removed: a crash (or an external actor) could have removed it after
        # the durable rename.  Keep the journal as the recovery signal rather
        # than silently classifying this as a completed rollback.
        return "recovery_required"
    _safe_path(tombstone, directory=True)
    resolved_tombstone = tombstone.resolve()
    for relative, expected in sorted(record["files"].items(), reverse=True):
        if not isinstance(relative, str) or not _hash(expected):
            raise BootstrapError(
                "recovery_required", "invalid directory rollback manifest"
            )
        relative_path = Path(relative)
        if (
            relative_path.is_absolute()
            or not relative_path.parts
            or any(part in {".", ".."} for part in relative_path.parts)
            or relative_path.as_posix() != relative
        ):
            raise BootstrapError(
                "recovery_required", "unsafe directory rollback member"
            )
        candidate = tombstone / relative_path
        if not _under(candidate.resolve(), resolved_tombstone):
            raise BootstrapError(
                "recovery_required", "unsafe directory rollback member"
            )
        if not candidate.exists():
            continue
        _safe_existing_file(candidate)
        if sha256_bytes(candidate.read_bytes()) != expected:
            return "user_modified_preserved"
        candidate.unlink()
        _fsync_directory(candidate.parent)
    for directory in sorted(
        tombstone.rglob("*"), key=lambda item: len(item.parts), reverse=True
    ):
        _safe_path(directory)
        if directory.is_dir():
            try:
                directory.rmdir()
            except OSError:
                return "user_modified_preserved"
    try:
        tombstone.rmdir()
    except OSError:
        return "user_modified_preserved"
    _fsync_directory(tombstone.parent)
    journal.unlink(missing_ok=True)
    _fsync_directory(journal.parent)
    return "removed"


def restore_directory_receipts(
    project: Path, receipts: Iterable[dict[str, Any]]
) -> list[dict[str, str]]:
    receipts = _validate_external(list(receipts), project)
    _authorize_receipts(project, receipts, external=True)
    for item in receipts:
        if item["kind"] == "project_directory":
            path = _project_path(project, item["path"], directory=True)
            if path.exists():
                directory_digest(path)
    actions: list[dict[str, str]] = []
    for item in reversed(receipts):
        if item.get("kind") != "project_directory":
            continue
        path = project / str(item.get("path", ""))
        if not path.exists():
            record = load_json(_directory_rollback_journal(project))
            if record is not None and record.get("path") == item.get("path"):
                actions.append(
                    {
                        "path": str(item.get("path")),
                        "status": _cleanup_directory_tombstone(project, record),
                    }
                )
                continue
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
        # Renaming the owned tree out of its public location is atomic on this
        # filesystem.  Do that before any recursive cleanup: a power loss can
        # then be recovered from the retained, trusted tombstone rather than
        # leaving a partially removed project directory that looks like user
        # drift on the next repair.
        tombstone = path.with_name(
            f".{path.name}.forgewright-rollback-{uuid.uuid4().hex}"
        )
        _safe_path(path.parent, directory=True)
        _safe_path(tombstone)
        manifest = _directory_file_manifest(path)
        record = {
            "schema": "forgewright-directory-rollback/v1",
            "project_root_digest": root_digest(project),
            "path": str(item["path"]),
            "after_digest": item["after_digest"],
            "tombstone": tombstone.name,
            "files": manifest,
        }
        journal = _directory_rollback_journal(project)
        atomic_json(journal, record)
        os.replace(path, tombstone)
        _fsync_directory(path.parent)
        actions.append(
            {
                "path": str(item.get("path")),
                "status": _cleanup_directory_tombstone(project, record),
            }
        )
    return actions


def restore_receipts(
    project: Path, receipts: Iterable[dict[str, Any]]
) -> list[dict[str, str]]:
    receipts = _validate_receipts(list(receipts), project)
    _authorize_receipts(project, receipts)
    for item in receipts:
        _project_path(project, item["path"])
    actions: list[dict[str, str]] = []
    for item in reversed(receipts):
        path = _project_path(project, item["path"])
        current_sha = None
        if path.exists():
            try:
                _safe_existing_file(path)
            except BootstrapError:
                actions.append({"path": item["path"], "status": "unsafe_skip"})
                continue
            current_sha = sha256_bytes(path.read_bytes())
        if current_sha == item["before_sha256"]:
            actions.append({"path": item["path"], "status": "already_restored"})
            continue
        if current_sha != item["after_sha256"]:
            actions.append({"path": item["path"], "status": "user_modified_skip"})
            continue
        if item["before_exists"]:
            data = base64.b64decode(item["before_base64"])
            _atomic_bytes(
                path,
                data,
                expected_before_sha256=current_sha,
            )
            actions.append({"path": item["path"], "status": "restored"})
        else:
            path.unlink(missing_ok=True)
            actions.append({"path": item["path"], "status": "removed"})
    return actions


def admission_home() -> Path:
    explicit = os.environ.get("FORGEWRIGHT_ADMISSION_HOME", "").strip()
    result = (
        Path(explicit).expanduser().absolute()
        if explicit
        else Path.home() / ".forgewright/runtime/admission"
    )
    _safe_path(result, directory=True)
    return result


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
        if time.monotonic() >= min(deadline, _DEADLINE.get() or deadline):
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
        self.worker_id = "bootstrap-worker-" + uuid.uuid4().hex
        self.worker_token = uuid.uuid4().hex + uuid.uuid4().hex
        self.owner_identity = inspect_process(self.owner_pid)
        if not _hash(self.owner_identity):
            raise BootstrapError(
                "host_identity_unavailable",
                "bootstrap worker identity could not be recorded",
            )
        self.run_id = "bootstrap-" + uuid.uuid4().hex
        self.worker_state = "intent"
        self.uncertain = False
        self.worker_released = False
        self.transaction_project: Path | None = None
        self.transaction_journal: dict[str, Any] | None = None

    def __enter__(self):
        try:
            self.admission = _open_host_admission()
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
            self.worker_state = "active"
            self._persist_lease(self.worker_record())
            return self
        except BaseException as error:
            if self.admission is not None:
                self.admission.close()
            if isinstance(error, AdmissionError):
                raise BootstrapError(
                    "host_admission_unavailable", str(error)
                ) from error
            raise

    @contextmanager
    def heavy(self, *, wait_seconds: float | None = None):
        if not self.admission or not self.worker_id or not self.worker_token:
            raise BootstrapError(
                "host_lease_missing", "bootstrap worker lease is not active"
            )
        heavy_id = "bootstrap-heavy-" + uuid.uuid4().hex
        heavy_token = uuid.uuid4().hex + uuid.uuid4().hex
        record = self._lease_record(
            heavy_id, heavy_token, kind="heavy", parent_id=self.worker_id
        )
        self._persist_lease(record)
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
            record["state"] = "active"
            self._persist_lease(record)
            yield
        except AdmissionError as error:
            raise BootstrapError("host_admission_unavailable", str(error)) from error
        except BootstrapError as error:
            if error.code == "adapter_cleanup_unconfirmed":
                self.mark_uncertain()
            raise
        finally:
            try:
                released = self.admission.release(
                    heavy_id,
                    heavy_token,
                    self.owner_pid,
                    quiescent=not self.uncertain,
                )
                record["state"] = released["state"]
            except AdmissionError:
                self.uncertain = True
                record["state"] = "uncertain"
            self._persist_lease(record)

    def _lease_record(
        self,
        lease_id: str,
        token: str,
        *,
        kind: str,
        parent_id: str | None,
    ) -> dict[str, Any]:
        if not _hash(self.owner_identity):
            raise BootstrapError(
                "host_identity_unavailable", "bootstrap owner identity is missing"
            )
        return {
            "id": lease_id,
            "token": token,
            "kind": kind,
            "owner_pid": self.owner_pid,
            "owner_identity": self.owner_identity,
            "parent_id": parent_id,
            "state": self.worker_state if kind == "worker" else "intent",
        }

    def worker_record(self) -> dict[str, Any]:
        if not self.worker_id or not self.worker_token:
            raise BootstrapError("host_lease_missing", "worker lease is unavailable")
        return self._lease_record(
            self.worker_id, self.worker_token, kind="worker", parent_id=None
        )

    def bind_transaction(self, project: Path, journal: dict[str, Any]) -> None:
        self.transaction_project = project
        self.transaction_journal = journal

    def _persist_lease(self, record: dict[str, Any]) -> None:
        if self.transaction_project is None or self.transaction_journal is None:
            return
        leases = self.transaction_journal.setdefault("admission_leases", [])
        leases[:] = [item for item in leases if item.get("id") != record["id"]]
        leases.append(dict(record))
        atomic_json(_journal_path(self.transaction_project), self.transaction_journal)

    def mark_uncertain(self) -> None:
        self.uncertain = True

    def release_worker(self) -> None:
        if self.worker_released:
            return
        if not self.admission or not self.worker_id or not self.worker_token:
            raise BootstrapError(
                "host_lease_missing", "bootstrap worker lease is not active"
            )
        try:
            row = self.admission.release(
                self.worker_id,
                self.worker_token,
                self.owner_pid,
                quiescent=not self.uncertain,
            )
        except AdmissionError as error:
            self.uncertain = True
            raise BootstrapError(
                "host_quiescence_unconfirmed",
                "bootstrap host capacity could not be safely released",
            ) from error
        if row.get("state") != "released":
            self.uncertain = True
            raise BootstrapError(
                "host_quiescence_unconfirmed",
                "bootstrap host capacity release was not confirmed",
            )
        self.worker_released = True
        self.worker_state = "released"
        self._persist_lease(self.worker_record())

    def __exit__(self, exc_type, exc, _tb):
        if (
            isinstance(exc, BootstrapError)
            and exc.code == "adapter_cleanup_unconfirmed"
        ):
            self.uncertain = True
        release_error = None
        if self.admission:
            try:
                self.release_worker()
            except BootstrapError as error:
                release_error = error
            finally:
                self.admission.close()
        if release_error is not None and exc is None:
            raise release_error
        if self.uncertain and exc is None:
            raise BootstrapError(
                "host_quiescence_unconfirmed",
                "bootstrap host capacity could not be safely released",
            )
        return False


class Lock:
    def __init__(self, name: str, timeout: float = 120.0):
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", name):
            raise BootstrapError("unsafe_lock", "invalid lock name")
        home = bootstrap_home()
        _safe_path(home / "locks", directory=True)
        (home / "locks").mkdir(parents=True, exist_ok=True)
        self.path = home / "locks" / f"{name}.lock"
        self.timeout = timeout
        self.fd: int | None = None
        self.token = uuid.uuid4().hex
        self.identity = None

    def __enter__(self):
        deadline = time.monotonic() + self.timeout
        while True:
            _safe_existing_file(self.path)
            try:
                self.fd = os.open(
                    self.path,
                    os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                    0o600,
                )
                os.write(
                    self.fd,
                    json.dumps(
                        {"pid": os.getpid(), "started_at": now(), "token": self.token}
                    ).encode(),
                )
                os.fsync(self.fd)
                info = os.fstat(self.fd)
                self.identity = (info.st_dev, info.st_ino)
                return self
            except FileExistsError:
                stale = False
                try:
                    observed = self.path.lstat()
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
                    # The exclusive create becomes visible before owner JSON is
                    # fully written. Never reclaim a fresh unparsable lock.
                    stale = False  # Malformed ownership is never deletion authority.
                if stale:
                    try:
                        current = self.path.lstat()
                        if (current.st_dev, current.st_ino) == (
                            observed.st_dev,
                            observed.st_ino,
                        ):
                            self.path.unlink()
                    except FileNotFoundError:
                        pass
                    continue
                if time.monotonic() >= min(deadline, _DEADLINE.get() or deadline):
                    raise BootstrapError(
                        "bootstrap_busy", f"bootstrap lock busy: {self.path}"
                    )
                time.sleep(0.1)

    def __exit__(self, *_args):
        try:
            info = self.path.lstat()
            if (info.st_dev, info.st_ino) == self.identity:
                value = load_json(self.path)
                if value and value.get("token") == self.token:
                    self.path.unlink()
        except (FileNotFoundError, BootstrapError):
            pass
        finally:
            if self.fd is not None:
                os.close(self.fd)
                self.fd = None


def write_state(project: Path, state: dict[str, Any]) -> None:
    _validate_state(project, state)
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
    target = _project_path(project, ".forgewright/execution-policy.yaml")
    _safe_existing_file(source)
    if target.exists():
        _safe_existing_file(target)
        status = "preserved"
    else:
        if not source.is_file():
            raise BootstrapError(
                "policy_source_missing",
                f"execution policy source missing: {source}",
                stage="policy_seed",
            )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
        status = "created"
    if _execution_policy_issue(project) is not None:
        raise BootstrapError(
            "execution_policy_invalid",
            "execution policy is missing, unreadable, empty, or malformed",
            stage="policy_seed",
        )
    return status


def directory_digest(path: Path) -> str:
    _safe_path(path, directory=True)
    hasher = hashlib.sha256()
    files = 0
    total = 0
    for child in sorted(path.rglob("*"), key=lambda item: item.as_posix()):
        relative = child.relative_to(path).as_posix().encode()
        hasher.update(relative + b"\\0")
        _safe_path(child)
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


def _index_issues(project: Path) -> list[str]:
    # Installed GitNexus repo-manager uses gitnexus.json, legacy meta.json only
    # when the primary is absent, and a LadybugDB file named lbug (not kuzu).
    path = _project_path(project, ".gitnexus", directory=True)
    try:
        metadata_path = path / "gitnexus.json"
        _safe_existing_file(metadata_path)
        if not metadata_path.exists():
            metadata_path = path / "meta.json"
        metadata = load_json(metadata_path)
        if (
            not metadata
            or metadata.get("repoPath") != str(project)
            or not isinstance(metadata.get("lastCommit"), str)
            or not isinstance(metadata.get("indexedAt"), str)
            or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T.+Z", metadata["indexedAt"])
            or not isinstance(metadata.get("stats"), dict)
            or any(
                type(metadata["stats"].get(k)) is not int or metadata["stats"][k] < 0
                for k in ("files", "nodes", "edges")
            )
        ):
            return ["gitnexus_metadata_invalid"]
        graph = metadata.get("capabilities", {}).get("graph", {})
        if graph and graph.get("status") != "available":
            return ["gitnexus_graph_unavailable"]
        database = path / "lbug"
        _safe_path(database)
        if not database.is_file() or database.stat().st_size == 0:
            return ["gitnexus_database_missing"]
        # Metadata/filesystem readiness, not a native database integrity test.
        with database.open("rb") as handle:
            if not handle.read(1):
                return ["gitnexus_database_unreadable"]
    except (BootstrapError, OSError, TypeError, AttributeError):
        return ["gitnexus_index_unsafe_or_invalid"]
    return []


def _execution_policy_issue(project: Path) -> str | None:
    """Validate with the same bounded parser used by the execution guard."""
    try:
        policy_path = _project_path(project, ".forgewright/execution-policy.yaml")
        _safe_existing_file(policy_path)
        checker = _RUNTIME_DIR.parent / "lite" / "policy-check.sh"
        _safe_existing_file(checker)
        bash = shutil.which("bash")
        if not bash or not checker.is_file():
            return "execution_policy_invalid"
        result = run(
            [bash, str(checker), "get", "mode"],
            cwd=_RUNTIME_DIR.parents[1],
            env={
                "FORGEWRIGHT_WORKSPACE": str(project),
                "FORGEWRIGHT_POLICY_FILE": str(policy_path),
            },
            timeout=15,
            required=False,
            stage="policy_validate",
        )
    except (BootstrapError, OSError):
        return "execution_policy_invalid"
    return None if result["status"] == "ready" else "execution_policy_invalid"


def _bootstrap_json_issue(project: Path, relative: str) -> str | None:
    """Check the wire contracts emitted by the project init/onboard CLI."""
    try:
        value = load_json(_project_path(project, relative))
    except BootstrapError:
        return f"required_invalid:{relative}"
    if value is None or value.get("schema_version") != 1:
        return f"required_invalid:{relative}"
    if relative == ".forgewright/project-profile.json":
        facts = value.get("facts")
        if not isinstance(facts, dict) or any(
            not isinstance(facts.get(key), expected)
            for key, expected in (
                ("git_present", bool),
                ("package_json_present", bool),
                ("lockfiles", list),
            )
        ):
            return f"required_invalid:{relative}"
    return None


def _docs_readiness_issue(project: Path) -> str | None:
    """Use the CLI's schema and semantic docs validator without mutating files."""
    try:
        result = call_forge(
            ["docs", "doctor", str(project)],
            project=project,
            required=False,
            stage="docs_validate",
        )
    except BootstrapError:
        return "docs_assets_invalid"
    return None if result["status"] == "ready" else "docs_assets_invalid"


def _readiness_issues(
    project: Path, *, validate_preserved_docs: bool = False
) -> list[str]:
    issues = []
    # .production-grade.yaml is an optional legacy seed, not a required asset.
    for relative in PROJECT_FILES[:-1]:
        try:
            path = _project_path(project, relative)
            if not path.is_file() or path.stat().st_size == 0:
                issues.append(f"required_missing:{relative}")
            elif relative.endswith(".json"):
                load_json(path)
        except (BootstrapError, OSError):
            issues.append(f"required_invalid:{relative}")
    for relative in (
        ".forgewright/project.json",
        ".forgewright/project-profile.json",
    ):
        issue = _bootstrap_json_issue(project, relative)
        if issue is not None and issue not in issues:
            issues.append(issue)
    policy_issue = _execution_policy_issue(project)
    if policy_issue is not None:
        issues.append(policy_issue)
    if validate_preserved_docs and not any(
        issue.startswith("required_") for issue in issues
    ):
        docs_issue = _docs_readiness_issue(project)
        if docs_issue is not None:
            issues.append(docs_issue)
    issues.extend(_index_issues(project))
    try:
        if _docs_entry_digest(project) is None:
            issues.append("docs_registration_missing")
    except BootstrapError:
        issues.append("docs_registration_invalid")
    return issues


def gitnexus(project: Path) -> dict[str, Any]:
    existing = [
        name
        for name in PROJECT_DIRS
        if _project_path(project, name, directory=True).exists()
    ]
    if existing:
        issues = _index_issues(project)
        return {
            "status": "degraded" if issues else "ready",
            "detail": ",".join(issues) if issues else "preserved_existing_index",
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
        for name in PROJECT_DIRS:
            path = project / name
            if path.is_dir() and not path.is_symlink():
                created.append({"path": name, "after_digest": directory_digest(path)})
        issues = _index_issues(project)
        if issues:
            result.update(status="degraded", detail=",".join(issues))
    result["created_dirs"] = created
    return result


def parse_json_envelope(output: str) -> dict[str, Any] | None:
    for line in [output, *reversed(output.splitlines())]:
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    return None


def docs(project: Path) -> tuple[dict[str, Any], dict[str, Any] | None]:
    with Lock("docs-registry", timeout=5):
        return _docs_under_lock(project)


def _docs_under_lock(project: Path) -> tuple[dict[str, Any], dict[str, Any] | None]:
    _preflight_project(project)
    init = {"status": "ready"}
    if not (project / ".forgewright/docs-manifest.json").exists():
        init = call_forge(
            ["docs", "init", str(project)],
            project=project,
            required=True,
            stage="docs_init",
        )
    if any(x["root"] == str(project) for x in _docs_registry()["projects"]):
        return init, None  # Preserve pre-existing registry metadata on repair.
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
            "project_root_digest": root_digest(project),
            "id": (project_data.get("id") if isinstance(project_data, dict) else None),
            "status": str(data.get("status", "unknown")),
            "after_digest": _docs_entry_digest(project),
        }
    return init, receipt


def global_runtime_receipt() -> Path:
    return bootstrap_home() / "global-runtime.json"


def _client_path(client: str) -> Path:
    if client == "codex":
        selected = os.environ.get("CODEX_HOME", "").strip()
        home = Path(selected).expanduser() if selected else Path.home() / ".codex"
        if not home.is_absolute():
            raise BootstrapError("unsafe_state_path", "CODEX_HOME must be absolute")
        return Path(os.path.abspath(home)) / "config.toml"
    if client == "claude-code":
        selected = os.environ.get("CLAUDE_CONFIG_DIR", "").strip()
        if selected:
            home = Path(selected).expanduser()
            if not home.is_absolute():
                raise BootstrapError(
                    "unsafe_state_path", "CLAUDE_CONFIG_DIR must be absolute"
                )
            return Path(os.path.abspath(home)) / ".claude.json"
        return Path.home() / ".claude.json"
    raise BootstrapError("invalid_policy", "unsupported MCP client")


def _mcp_entry() -> dict[str, Any]:
    server = Path.home() / ".forgewright/mcp-server"
    return {
        "command": str(server / "node_modules/.bin/tsx"),
        "args": [str(server / "src/index.ts")],
    }


def _client_document(client: str) -> tuple[Path, bytes, dict[str, Any]]:
    path = _client_path(client)
    _safe_existing_file(path)
    raw = path.read_bytes() if path.exists() else b""
    try:
        doc = (
            tomllib.loads(raw.decode())
            if client == "codex"
            else json.loads(raw.decode() or "{}")
        )
    except (ValueError, UnicodeError) as error:
        raise BootstrapError(
            "invalid_client_config", f"cannot parse {client} config"
        ) from error
    key = "mcp_servers" if client == "codex" else "mcpServers"
    if not isinstance(doc, dict) or not isinstance(doc.get(key, {}), dict):
        raise BootstrapError("invalid_client_config", f"invalid {client} MCP config")
    return path, raw, doc


def _client_progress_path() -> Path:
    home = bootstrap_home()
    path = home / "runtime-progress.json"
    _safe_existing_file(path)
    for part in (home, path):
        if part.exists() and hasattr(os, "getuid"):
            info = part.stat()
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                raise BootstrapError(
                    "unsafe_ownership_store", "runtime journal must be user-owned"
                )
    tracking = _TRANSACTION.get()
    if tracking is not None and _under(home.resolve(), tracking[0].resolve()):
        raise BootstrapError(
            "unsafe_ownership_store", "runtime journal must be outside the project"
        )
    return path


def _shared_runtime_progress_path() -> Path:
    home = bootstrap_home()
    path = home / "shared-runtime-assets-progress.json"
    _safe_existing_file(path)
    for part in (home, path):
        if part.exists() and hasattr(os, "getuid"):
            info = part.stat()
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                raise BootstrapError(
                    "unsafe_ownership_store",
                    "shared runtime journal must be user-owned",
                )
    tracking = _TRANSACTION.get()
    if tracking is not None and _under(home.resolve(), tracking[0].resolve()):
        raise BootstrapError(
            "unsafe_ownership_store",
            "shared runtime journal must be outside the project",
        )
    return path


def _new_client_transaction() -> dict[str, Any]:
    prior = load_json(_client_progress_path())
    if prior and prior.get("status") not in {"completed", "rolled_back"}:
        raise BootstrapError(
            "recovery_required", "shared runtime config recovery required"
        )
    value = {
        "schema": "forgewright-runtime-progress/v2",
        "transaction_id": uuid.uuid4().hex,
        "status": "running",
        "clients": [],
    }
    tracking = _TRANSACTION.get()
    if tracking is not None:
        value["project_transaction_id"] = tracking[1]["transaction_id"]
        value["project_root_digest"] = root_digest(tracking[0])
    atomic_json(_client_progress_path(), value)
    if tracking is not None:
        _record_process(global_runtime_transaction_id=value["transaction_id"])
    return value


def _json_client_insertion(raw: bytes, doc: dict[str, Any], entry: dict[str, Any]):
    """Insert owned JSON bytes without persisting a copy of user configuration."""
    encoded = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
    if not raw.strip():
        addition = ('{"mcpServers":{"forgewright":' + encoded + "}}\n").encode()
        return raw + addition, len(raw), addition
    text = raw.decode()
    decoder = json.JSONDecoder()
    position = text.index("{") + 1
    found = None
    seen = set()
    while position < len(text):
        while text[position].isspace():
            position += 1
        if text[position] == "}":
            break
        key, position = decoder.raw_decode(text, position)
        if key in seen:
            raise BootstrapError("invalid_client_config", "duplicate client config key")
        seen.add(key)
        while text[position].isspace():
            position += 1
        position += 1  # colon, already validated by json.loads
        while text[position].isspace():
            position += 1
        if key == "mcpServers":
            found = position + 1
        _, position = decoder.raw_decode(text, position)
        while position < len(text) and text[position].isspace():
            position += 1
        if text[position] == "}":
            break
        position += 1  # comma
    if found is None:
        offset = len(text[: text.index("{") + 1].encode())
        addition = (
            '"mcpServers":{"forgewright":' + encoded + "}" + ("," if doc else "")
        ).encode()
    else:
        offset = len(text[:found].encode())
        addition = (
            '"forgewright":' + encoded + ("," if doc["mcpServers"] else "")
        ).encode()
    payload = raw[:offset] + addition + raw[offset:]
    candidate = json.loads(payload)
    if candidate["mcpServers"]["forgewright"] != entry:
        raise BootstrapError(
            "invalid_client_config", "client insertion could not be verified"
        )
    return payload, offset, addition


def _configure_client(
    client: str, transaction: dict[str, Any] | None = None
) -> dict[str, Any]:
    _client_path(client)  # Reject unknown clients before even creating a lock.
    if transaction is None:
        with Lock("global-heavy", timeout=5):
            transaction = _new_client_transaction()
            try:
                receipt = _configure_client(client, transaction)
                transaction["status"] = "completed"
                atomic_json(_client_progress_path(), transaction)
                return receipt
            except Exception:
                _rollback_clients(transaction)
                raise
    with Lock(f"mcp-client-{client}", timeout=5):
        return _configure_client_locked(client, transaction)


def _configure_client_locked(
    client: str, transaction: dict[str, Any]
) -> dict[str, Any]:
    path, raw, doc = _client_document(client)
    tracking = _TRANSACTION.get()
    if tracking is not None and _under(path.absolute(), tracking[0].resolve()):
        raise BootstrapError(
            "unsafe_state_path",
            "global MCP client config must be outside the active project",
        )
    key = "mcp_servers" if client == "codex" else "mcpServers"
    expected = _mcp_entry()
    insertion_offset = len(raw)
    insertion = b""
    existing = doc.get(key, {}).get("forgewright")
    if existing is not None:
        if not _entry_matches(existing, expected):
            raise BootstrapError(
                "client_config_conflict",
                f"preserving existing {client} Forgewright config",
            )
        payload = raw
    elif client == "codex":
        # Append only; preserve every existing byte, including comments and keys.
        payload = (
            raw
            + (
                "\n[mcp_servers.forgewright]\ncommand = "
                + json.dumps(expected["command"])
                + "\nargs = "
                + json.dumps(expected["args"])
                + "\n"
            ).encode()
        )
        try:
            candidate = tomllib.loads(payload.decode())
        except ValueError as error:
            raise BootstrapError(
                "client_config_conflict", "cannot safely append Codex MCP table"
            ) from error
        if candidate[key]["forgewright"] != expected:
            raise BootstrapError(
                "client_config_conflict", "Codex MCP table verification failed"
            )
        insertion = payload[len(raw) :]
    else:
        payload, insertion_offset, insertion = _json_client_insertion(
            raw, doc, expected
        )
    receipt = {
        "client": client,
        "before_exists": path.exists(),
        "before_sha256": sha256_bytes(raw) if path.exists() else None,
        "after_sha256": sha256_bytes(payload),
        "changed": payload != raw,
    }
    # Only our inserted bytes enter the trusted journal. Existing client config
    # may contain credentials and is never copied into a bootstrap receipt.
    intent = {
        **receipt,
        "path": str(path.absolute()),
        "entry": expected,
        "insertion_offset": insertion_offset,
        "insertion_base64": base64.b64encode(insertion).decode(),
        "created_container": key not in doc,
        "status": "pending",
    }
    transaction["clients"].append(intent)
    atomic_json(_client_progress_path(), transaction)
    if payload != raw:
        _atomic_bytes(path, payload, expected_before_sha256=receipt["before_sha256"])
    if path.read_bytes() != payload:
        raise BootstrapError(
            "client_config_unconfirmed", "selected MCP config write not verified"
        )
    intent["status"] = "applied"
    atomic_json(_client_progress_path(), transaction)
    return receipt


def _atomic_bytes(
    path: Path, payload: bytes, *, expected_before_sha256: str | None
) -> None:
    _safe_existing_file(path)
    if len(payload) > MAX_STATE_BYTES:
        raise BootstrapError("state_too_large", "config exceeds safety bound")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".bootstrap-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        _safe_existing_file(path)
        current = sha256_bytes(path.read_bytes()) if path.exists() else None
        if current != expected_before_sha256:
            raise BootstrapError(
                "client_config_drift",
                "config changed before replacement; preserving user write",
            )
        # Portable replace is not atomic CAS with an uncooperative external
        # writer. This detects drift through the last preimage check; the client
        # lock serializes all cooperating Forgewright writers.
        os.replace(name, path)
        if os.name != "nt":
            directory_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        Path(name).unlink(missing_ok=True)


def _rollback_clients(transaction: dict[str, Any]) -> list[dict[str, str]]:
    if transaction.get("schema") != "forgewright-runtime-progress/v2" or not isinstance(
        transaction.get("clients"), list
    ):
        raise BootstrapError(
            "recovery_required",
            "legacy runtime journal requires manual runtime verification",
        )
    if len(transaction["clients"]) > 2 or not isinstance(
        transaction.get("transaction_id"), str
    ):
        raise BootstrapError(
            "recovery_required", "invalid runtime transaction identity"
        )
    seen = set()
    for item in transaction["clients"]:
        if (
            not isinstance(item, dict)
            or item.get("client") not in {"codex", "claude-code"}
            or item["client"] in seen
        ):
            raise BootstrapError("recovery_required", "invalid runtime client receipt")
        seen.add(item["client"])
        if (
            type(item.get("changed")) is not bool
            or type(item.get("before_exists")) is not bool
            or not _hash(item.get("after_sha256"))
            or (item["before_exists"] and not _hash(item.get("before_sha256")))
            or (not item["before_exists"] and item.get("before_sha256") is not None)
            or not isinstance(item.get("entry"), dict)
            or not isinstance(item.get("path"), str)
            or not Path(item["path"]).is_absolute()
        ):
            raise BootstrapError(
                "recovery_required", "malformed runtime client ownership"
            )
    transaction["status"] = "rolling_back"
    atomic_json(_client_progress_path(), transaction)
    actions = []
    for item in reversed(transaction["clients"]):
        client = item.get("client")
        selected_path = _client_path(client).absolute()
        path = Path(item["path"])
        if selected_path != path:
            raise BootstrapError(
                "recovery_required",
                "selected MCP config home changed; refusing redirected rollback",
            )
        _safe_existing_file(path)
        with Lock(f"mcp-client-{client}", timeout=5):
            path, raw, doc = _client_document(client)
            current = sha256_bytes(raw) if path.exists() else None
            if not item.get("changed") or current == item.get("before_sha256"):
                status = "already_restored"
            else:
                key = "mcp_servers" if client == "codex" else "mcpServers"
                entry = doc.get(key, {}).get("forgewright")
                if entry is None:
                    status = "already_missing"
                elif entry != item.get("entry"):
                    raise BootstrapError(
                        "recovery_required",
                        "modified MCP entry preserved; manual runtime reconciliation required",
                    )
                else:
                    try:
                        inserted = base64.b64decode(
                            item["insertion_base64"], validate=True
                        )
                        offset = item["insertion_offset"]
                    except (ValueError, KeyError, TypeError) as error:
                        raise BootstrapError(
                            "recovery_required", "invalid runtime rollback intent"
                        ) from error
                    if not inserted or type(offset) is not int or offset < 0:
                        raise BootstrapError(
                            "recovery_required", "invalid runtime rollback insertion"
                        )
                    if current == item.get("after_sha256"):
                        if raw[offset : offset + len(inserted)] != inserted:
                            raise BootstrapError(
                                "recovery_required", "runtime rollback bytes mismatch"
                            )
                        restored = raw[:offset] + raw[offset + len(inserted) :]
                        if sha256_bytes(restored) != (
                            item.get("before_sha256") or sha256_bytes(b"")
                        ):
                            raise BootstrapError(
                                "recovery_required",
                                "runtime rollback preimage mismatch",
                            )
                    elif raw.count(inserted) == 1:
                        restored = raw.replace(inserted, b"", 1)
                        try:
                            candidate = (
                                tomllib.loads(restored.decode())
                                if client == "codex"
                                else json.loads(restored.decode())
                            )
                        except (ValueError, UnicodeError) as error:
                            raise BootstrapError(
                                "recovery_required",
                                "MCP insertion cannot be removed without user edits",
                            ) from error
                        if "forgewright" in candidate.get(key, {}):
                            raise BootstrapError(
                                "recovery_required", "MCP ownership no longer matches"
                            )
                    else:
                        raise BootstrapError(
                            "recovery_required",
                            "MCP config drift cannot be safely reconciled",
                        )
                    if not item["before_exists"] and not restored:
                        _safe_existing_file(path)
                        if sha256_bytes(path.read_bytes()) != current:
                            raise BootstrapError(
                                "client_config_drift", "config changed during rollback"
                            )
                        path.unlink()
                    else:
                        _atomic_bytes(path, restored, expected_before_sha256=current)
                    status = "restored"
            item["status"] = "rolled_back"
            actions.append({"client": client, "status": status})
            atomic_json(_client_progress_path(), transaction)
    transaction["status"] = "rolled_back"
    atomic_json(_client_progress_path(), transaction)
    return actions


def recover_global_runtime(
    project: Path | None = None, journal: dict[str, Any] | None = None
) -> list[dict[str, str]]:
    """Explicit recovery of journal-owned client and shared runtime mutations."""
    with Lock("global-heavy", timeout=5):
        transaction = load_json(_client_progress_path())
        actions: list[dict[str, str]] = []
        if transaction:
            if project is not None:
                recorded_id = (
                    journal.get("global_runtime_transaction_id") if journal else None
                )
                terminal = transaction.get("status") in {"completed", "rolled_back"}
                if not (terminal and recorded_id is None) and (
                    not journal
                    or not isinstance(recorded_id, str)
                    or transaction.get("project_root_digest") != root_digest(project)
                    or transaction.get("project_transaction_id")
                    != journal.get("transaction_id")
                    or transaction.get("transaction_id") != recorded_id
                ):
                    raise BootstrapError(
                        "recovery_required",
                        "unbound shared transaction; manual runtime verification required",
                    )
            if transaction.get("status") not in {"completed", "rolled_back"}:
                actions.extend(_rollback_clients(transaction))
        try:
            asset_actions = recover_shared_runtime(
                progress_path=_shared_runtime_progress_path(),
                expected_project_transaction_id=(
                    journal.get("transaction_id")
                    if project is not None and journal is not None
                    else None
                ),
                expected_project_root_digest=(
                    root_digest(project) if project is not None else None
                ),
                expected_home=(
                    Path(journal["global_runtime_asset_home"])
                    if project is not None
                    and journal is not None
                    and isinstance(journal.get("global_runtime_asset_home"), str)
                    else None
                ),
                expected_rlg_home=(
                    Path(journal["global_runtime_asset_rlg_home"])
                    if project is not None
                    and journal is not None
                    and isinstance(journal.get("global_runtime_asset_rlg_home"), str)
                    else None
                ),
                expected_source_root=(
                    Path(journal["global_runtime_asset_source_root"])
                    if project is not None
                    and journal is not None
                    and isinstance(journal.get("global_runtime_asset_source_root"), str)
                    else None
                ),
                expected_prior_receipt_sha256=(
                    journal.get("global_runtime_prior_asset_receipt_sha256")
                    if project is not None and journal is not None
                    else None
                ),
                load_json=load_json,
                write_json=atomic_json,
            )
        except SharedRuntimeError as error:
            raise BootstrapError(error.code, str(error)) from error
        if asset_actions is not None:
            if (
                project is not None
                and journal is not None
                and journal.get("global_runtime_asset_transaction_id") is not None
            ):
                asset_transaction = load_json(_shared_runtime_progress_path())
                if (
                    not asset_transaction
                    or asset_transaction.get("transaction_id")
                    != journal["global_runtime_asset_transaction_id"]
                ):
                    raise BootstrapError(
                        "recovery_required",
                        "shared runtime asset transaction identity mismatch",
                    )
            actions.extend(asset_actions)
        if not transaction and asset_actions is None:
            if (
                project is not None
                and journal is not None
                and journal.get("global_runtime_transaction_id") is None
                and journal.get("global_runtime_asset_transaction_id") is None
                and all(
                    isinstance(journal.get(key), str)
                    for key in (
                        "global_runtime_asset_home",
                        "global_runtime_asset_rlg_home",
                        "global_runtime_asset_source_root",
                    )
                )
            ):
                return actions
            raise BootstrapError(
                "recovery_required",
                "missing journal; manual runtime verification required",
            )
        return actions


def _entry_matches(entry: Any, expected: dict[str, Any]) -> bool:
    return (
        isinstance(entry, dict)
        and entry.get("command") == expected["command"]
        and entry.get("args") == expected["args"]
        and entry.get("enabled", True) is True
        and entry.get("disabled", False) is False
    )


def _runtime_issues(value: dict[str, Any], receipt: dict[str, Any] | None) -> list[str]:
    issues = []
    if (
        not receipt
        or receipt.get("schema") != GLOBAL_SCHEMA
        or receipt.get("status") != "ready"
    ):
        return ["shared_runtime_not_ready"]
    if (
        receipt.get("mcp_clients") != value["mcp_clients"]
        or receipt.get("forgewright_root") != value["forgewright_root"]
    ):
        issues.append("shared_runtime_policy_drift")
    if receipt.get("source_commit") != source_commit(Path(value["forgewright_root"])):
        issues.append("shared_runtime_source_drift")
    asset_receipt = receipt.get("asset_receipt")
    if asset_receipt is not None:
        if (
            not isinstance(asset_receipt, dict)
            or asset_receipt.get("source_root") != value["forgewright_root"]
            or asset_receipt.get("source_commit") != receipt.get("source_commit")
        ):
            issues.append("shared_runtime_asset_binding_drift")
        else:
            issues.extend(verify_shared_runtime(asset_receipt))
    if value["mcp_clients"] and (
        not isinstance(asset_receipt, dict) or asset_receipt.get("mcp") is not True
    ):
        issues.append("shared_mcp_assets_unverified")
    records = receipt.get("config_receipts", [])
    if not isinstance(records, list):
        return issues + ["shared_runtime_config_receipts_invalid"]
    for client in value["mcp_clients"]:
        try:
            path, raw, doc = _client_document(client)
            key = "mcp_servers" if client == "codex" else "mcpServers"
            entry = doc.get(key, {}).get("forgewright")
            if not _entry_matches(entry, _mcp_entry()):
                issues.append(f"mcp_config_missing_or_drift:{client}")
            if not any(
                isinstance(x, dict)
                and x.get("client") == client
                and x.get("after_sha256") == sha256_bytes(raw)
                for x in records
            ):
                issues.append(f"mcp_receipt_drift:{client}")
        except BootstrapError:
            issues.append(f"mcp_config_unsafe:{client}")
    guard = receipt.get("guard_receipt")
    guard_path = (
        Path(
            os.environ.get(
                "FORGEWRIGHT_RLG_HOME", str(Path.home() / ".forgewright/runtime")
            )
        )
        / "INSTALLED_FROM"
    )
    try:
        _safe_existing_file(guard_path)
        if (
            not isinstance(guard, dict)
            or not guard_path.exists()
            or sha256_bytes(guard_path.read_bytes()) != guard.get("sha256")
        ):
            issues.append("shared_runtime_guard_missing_or_drift")
        else:
            checked = run(
                [
                    "bash",
                    str(
                        Path(value["forgewright_root"])
                        / "scripts/runtime/runtime-install.sh"
                    ),
                    "--verify",
                    "--quiet",
                ],
                cwd=Path(value["forgewright_root"]),
                required=False,
                timeout=5,
                stage="runtime_verify",
            )
            if checked["status"] != "ready":
                issues.append("shared_runtime_guard_unverified")
    except BootstrapError:
        issues.append("shared_runtime_guard_unsafe")
    if value["mcp_clients"]:
        expected = _mcp_entry()
        if (
            not Path(expected["command"]).is_file()
            or not Path(expected["args"][0]).is_file()
        ):
            issues.append("shared_mcp_assets_missing")
    return issues


def ensure_global_runtime(
    policy_value: dict[str, Any],
    root: Path,
    *,
    allow_runtime_update: bool | None = None,
) -> dict[str, Any]:
    if allow_runtime_update is None:
        allow_runtime_update = _RUNTIME_UPDATE_ALLOWED.get()
    validate_policy(policy_value)
    if root.resolve() != Path(policy_value["forgewright_root"]).resolve():
        raise BootstrapError("foreign_runtime", "runtime root differs from policy")
    commit = source_commit(root)
    with Lock("global-heavy", timeout=5):
        progress = load_json(bootstrap_home() / "runtime-progress.json")
        if progress and progress.get("status") not in {"completed", "rolled_back"}:
            raise BootstrapError(
                "recovery_required", "shared runtime config recovery required"
            )
        asset_progress = load_json(_shared_runtime_progress_path())
        if asset_progress and asset_progress.get("status") not in {
            "completed",
            "rolled_back",
        }:
            raise BootstrapError(
                "recovery_required", "shared runtime asset recovery required"
            )
        existing = load_json(global_runtime_receipt())
        if (
            existing
            and existing.get("source_commit") == commit
            and not _runtime_issues(policy_value, existing)
        ):
            return existing
        receipt = {
            "schema": GLOBAL_SCHEMA,
            "status": "degraded",
            "source_commit": commit,
            "forgewright_root": str(root),
            "mcp_clients": policy_value["mcp_clients"],
            "config_receipts": [],
            "components": {},
            "verified_at": now(),
            "shared_runtime_preserved": True,
        }
        guard_path = (
            Path(
                os.environ.get(
                    "FORGEWRIGHT_RLG_HOME", str(Path.home() / ".forgewright/runtime")
                )
            )
            / "INSTALLED_FROM"
        )
        _safe_existing_file(guard_path)
        expected = _mcp_entry()
        entry_files_exist = (
            Path(expected["command"]).is_file() and Path(expected["args"][0]).is_file()
        )
        need_rlg = not guard_path.exists()
        need_mcp = bool(policy_value["mcp_clients"]) and not entry_files_exist
        asset_receipt = None
        if (
            asset_progress
            and asset_progress.get("status") == "completed"
            and isinstance(asset_progress.get("receipt"), dict)
        ):
            asset_receipt = asset_progress["receipt"]
        assets_ready = bool(
            asset_receipt
            and asset_receipt.get("mcp") is True
            and not verify_shared_runtime(asset_receipt)
        )
        migration_needed = bool(
            asset_receipt
            and (
                asset_receipt.get("source_root") != str(root)
                or asset_receipt.get("source_commit") != commit
                or (need_rlg and asset_receipt.get("rlg") is not True)
                or (need_mcp and asset_receipt.get("mcp") is not True)
            )
        )
        repair_needed = bool(
            asset_receipt
            and any(
                isinstance(asset, dict)
                and isinstance(asset.get("path"), str)
                and Path(asset["path"]).is_absolute()
                and not os.path.lexists(asset["path"])
                for asset in asset_receipt.get("assets", [])
            )
        )
        install_needed = (need_rlg or need_mcp) and asset_receipt is None
        if install_needed or (
            (migration_needed or repair_needed) and allow_runtime_update
        ):
            if not policy_value["enabled"] or policy_value["mode"] != "full":
                # Automation and plugin hooks only observe shared prerequisites.
                pass
            else:
                tracking = _TRANSACTION.get()
                if tracking is None:
                    raise BootstrapError(
                        "runtime_transaction_required",
                        "full shared runtime installation requires an active project transaction",
                    )
                rlg_home = Path(
                    os.environ.get(
                        "FORGEWRIGHT_RLG_HOME",
                        str(Path.home() / ".forgewright/runtime"),
                    )
                ).expanduser()
                if not rlg_home.is_absolute():
                    raise BootstrapError(
                        "unsafe_runtime_path", "FORGEWRIGHT_RLG_HOME must be absolute"
                    )
                try:
                    operation = (
                        "repair"
                        if repair_needed
                        else "migrate"
                        if migration_needed
                        else "install"
                    )
                    install_rlg = (
                        bool(asset_receipt.get("rlg")) or need_rlg
                        if operation in {"migrate", "repair"} and asset_receipt
                        else need_rlg
                    )
                    install_mcp = (
                        bool(asset_receipt.get("mcp")) or need_mcp
                        if operation in {"migrate", "repair"} and asset_receipt
                        else need_mcp
                    )
                    if operation in {"migrate", "repair"}:
                        if operation == "migrate" and verify_shared_runtime(
                            asset_receipt
                        ):
                            raise BootstrapError(
                                "runtime_asset_drift",
                                "owned shared runtime drift blocks migration",
                            )
                        assert_runtime_quiescent(
                            root=root,
                            home=Path.home(),
                            rlg_home=Path(os.path.abspath(rlg_home)),
                            runner=run,
                        )
                    _record_process(
                        global_runtime_asset_home=str(Path.home()),
                        global_runtime_asset_rlg_home=str(
                            Path(os.path.abspath(rlg_home))
                        ),
                        global_runtime_asset_source_root=str(root),
                        **(
                            {
                                "global_runtime_prior_asset_receipt_sha256": shared_runtime_receipt_digest(
                                    asset_receipt
                                )
                            }
                            if operation in {"migrate", "repair"} and asset_receipt
                            else {}
                        ),
                    )
                    asset_transaction = begin_shared_runtime(
                        root=root,
                        home=Path.home(),
                        rlg_home=Path(os.path.abspath(rlg_home)),
                        progress_path=_shared_runtime_progress_path(),
                        source_commit=commit,
                        need_rlg=install_rlg,
                        need_mcp=install_mcp,
                        project_transaction_id=tracking[1]["transaction_id"],
                        project_root_digest=root_digest(tracking[0]),
                        write_json=atomic_json,
                        operation=operation,
                        prior_receipt=(
                            asset_receipt
                            if operation in {"migrate", "repair"}
                            else None
                        ),
                    )
                    _record_process(
                        global_runtime_asset_transaction_id=asset_transaction[
                            "transaction_id"
                        ]
                    )
                    asset_receipt = install_shared_runtime(
                        asset_transaction,
                        progress_path=_shared_runtime_progress_path(),
                        runner=run,
                        write_json=atomic_json,
                    )
                except SharedRuntimeError as error:
                    raise BootstrapError(error.code, str(error)) from error
                receipt["asset_receipt"] = asset_receipt
                _safe_existing_file(guard_path)
                assets_ready = bool(
                    asset_receipt.get("mcp") is True
                    and not verify_shared_runtime(asset_receipt)
                )
        elif asset_receipt is not None:
            receipt["asset_receipt"] = asset_receipt
        if guard_path.exists():
            receipt["guard_receipt"] = {"sha256": sha256_bytes(guard_path.read_bytes())}
        transaction = _new_client_transaction()
        try:
            for client in policy_value["mcp_clients"]:
                if assets_ready:
                    receipt["config_receipts"].append(
                        _configure_client(client, transaction)
                    )
            receipt["status"] = "ready"
            issues = _runtime_issues(policy_value, receipt)
            receipt["status"] = "degraded" if issues else "ready"
            receipt["issues"] = issues
            atomic_json(global_runtime_receipt(), receipt)
            transaction["status"] = "completed"
            atomic_json(_client_progress_path(), transaction)
        except Exception:
            _rollback_clients(transaction)
            raise
        return receipt


def pi_prepare(
    policy_value: dict[str, Any],
    project: Path,
) -> dict[str, Any]:
    if policy_value["pi_policy"] == "disabled":
        return {"status": "disabled"}
    # Enabling Pi also creates runtime directories beyond PROJECT_FILES. Project
    # bootstrap therefore observes existing configuration; explicit delegation
    # setup remains a separate operation with its own ownership contract.
    status = call_forge(
        ["delegate", "status", "--worker", "pi"],
        project=project,
        required=False,
        stage="pi_status",
    )
    if status["status"] != "ready":
        return {"status": status["status"], "detail": status.get("detail")}
    model = policy_value.get("pi_model")
    if not model:
        return {"status": "optional_unconfigured"}
    result = parse_json_envelope(status.get("stdout", "")) or {}
    ready = (
        result.get("ready") is True
        and result.get("enabled") is True
        and result.get("model") == model
    )
    return {
        "status": "ready" if ready else "degraded",
        "detail": "existing_pi_configuration"
        if ready
        else "explicit_pi_setup_required",
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


def tombstone_path(project: Path) -> Path:
    return bootstrap_home() / "disabled" / f"{root_digest(project)}.json"


def _journal_path(project: Path) -> Path:
    # Repository configuration and a public root hash cannot confer ownership.
    home = bootstrap_home()
    if _under(home.resolve(), project.resolve()):
        raise BootstrapError(
            "unsafe_ownership_store", "ownership store must be outside the project"
        )
    path = home / "transactions" / f"{root_digest(project)}.json"
    _safe_existing_file(path)
    for part in (home, path.parent, path):
        if part.exists():
            info = part.stat()
            if hasattr(os, "getuid") and (
                info.st_uid != os.getuid() or info.st_mode & 0o022
            ):
                raise BootstrapError(
                    "unsafe_ownership_store",
                    f"ownership store is not user-owned: {part}",
                )
    return path


def _validate_admission_leases(value: Any, journal: dict[str, Any]) -> None:
    if value is None:
        return  # Legacy journals remain manual-reconciliation only.
    if (
        not isinstance(value, list)
        or not isinstance(journal.get("run_id"), str)
        or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", journal["run_id"]) is None
    ):
        raise BootstrapError(
            "recovery_required", "admission lease evidence is malformed"
        )
    seen = set()
    for item in value:
        if (
            not isinstance(item, dict)
            or set(item)
            != {
                "id",
                "token",
                "kind",
                "owner_pid",
                "owner_identity",
                "parent_id",
                "state",
            }
            or not isinstance(item.get("id"), str)
            or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", item["id"]) is None
            or item["id"] in seen
            or not isinstance(item.get("token"), str)
            or re.fullmatch(r"[0-9a-f]{64}", item["token"]) is None
            or item.get("kind") not in {"worker", "heavy"}
            or type(item.get("owner_pid")) is not int
            or item["owner_pid"] <= 0
            or not _hash(item.get("owner_identity"))
            or (
                item.get("parent_id") is not None
                and not isinstance(item["parent_id"], str)
            )
            or item.get("state")
            not in {"intent", "active", "released", "quarantined", "uncertain"}
        ):
            raise BootstrapError(
                "recovery_required", "admission lease evidence is malformed"
            )
        if item["kind"] == "worker" and item["parent_id"] is not None:
            raise BootstrapError(
                "recovery_required", "worker lease parent evidence is malformed"
            )
        seen.add(item["id"])
    workers = [item for item in value if item["kind"] == "worker"]
    if len(workers) != 1 or any(
        item["kind"] == "heavy" and item["parent_id"] != workers[0]["id"]
        for item in value
    ):
        raise BootstrapError(
            "recovery_required", "admission lease hierarchy is malformed"
        )


def _read_journal(project: Path) -> dict[str, Any] | None:
    value = load_json(_journal_path(project))
    if value is not None:
        if (
            value.get("schema") != "forgewright-bootstrap-transaction/v1"
            or value.get("project_root_digest") != root_digest(project)
            or value.get("status")
            not in {"running", "completed", "rolled_back", "recovery_required"}
        ):
            raise BootstrapError(
                "recovery_required",
                "invalid or foreign transaction journal requires recovery",
            )
        if not isinstance(value.get("transaction_id"), str) or not re.fullmatch(
            r"[0-9a-f]{32}", value["transaction_id"]
        ):
            raise BootstrapError(
                "recovery_required",
                "legacy journal lacks transaction identity; manual ownership review required",
            )
        _validate_receipts(value.get("owned_paths"), project)
        _validate_external(value.get("external_config_receipts"), project)
        _validate_admission_leases(value.get("admission_leases"), value)
        for key in ("ownership", "prior_state"):
            if value.get(key) is not None:
                _validate_state(project, value[key])
    return value


def _receipt_key(item: dict[str, Any]) -> dict[str, Any]:
    # Docs ids are descriptive only: cleanup always uses the canonical root.
    return {
        k: v
        for k, v in item.items()
        if not (item.get("kind") == "docs_registry" and k == "id")
    }


def _authorize_receipts(
    project: Path, receipts: list[dict[str, Any]], *, external: bool = False
) -> None:
    if not receipts:
        return
    journal = _read_journal(project)
    key = "external_config_receipts" if external else "owned_paths"
    trusted = (
        []
        if journal is None
        else journal[key] + (journal.get("ownership") or {}).get(key, [])
    )
    if any(
        _receipt_key(item) not in [_receipt_key(x) for x in trusted]
        for item in receipts
    ):
        raise BootstrapError(
            "untrusted_ownership",
            "receipt has no matching global transaction ownership",
        )


def _trusted_state(
    project: Path, state: dict[str, Any], journal: dict[str, Any] | None
) -> None:
    trusted = (journal or {}).get("ownership")
    if trusted is None:
        raise BootstrapError(
            "untrusted_ownership", "project state has no global ownership receipt"
        )
    for key in ("owned_paths", "external_config_receipts"):
        if [_receipt_key(x) for x in state[key]] != [
            _receipt_key(x) for x in trusted[key]
        ]:
            raise BootstrapError(
                "untrusted_ownership", "project receipts differ from global ownership"
            )
        state[key] = json.loads(json.dumps(trusted[key]))


@contextmanager
def _track_transaction(project: Path, journal: dict[str, Any]):
    token = _TRANSACTION.set((project, journal))
    try:
        yield
    finally:
        _TRANSACTION.reset(token)


def _record_process(**fields: Any) -> None:
    tracking = _TRANSACTION.get()
    if tracking is not None:
        project, journal = tracking
        journal.update(fields)
        atomic_json(_journal_path(project), journal)


def _transaction_uncertain(
    journal: dict[str, Any], error: BaseException | None = None
) -> bool:
    return bool(
        journal.get("spawn_pending")
        or journal.get("cleanup_uncertain")
        or any(not p.get("quiescent") for p in journal.get("processes", []))
        or (
            isinstance(error, BootstrapError)
            and error.code == "adapter_cleanup_unconfirmed"
        )
    )


def _recovery_quiescence(project: Path, journal: dict[str, Any]) -> bool:
    owner = journal.get("owner")
    processes = journal.get("processes")
    if (
        not isinstance(owner, dict)
        or type(owner.get("pid")) is not int
        or not _hash(owner.get("identity"))
        or not isinstance(processes, list)
    ):
        raise BootstrapError(
            "recovery_required",
            "process identity evidence missing; manual quiescence review required",
        )
    if journal.get("spawn_pending"):
        raise BootstrapError(
            "recovery_required",
            "interrupted process launch has no recorded identity; manual process reconciliation required",
        )
    if not journal.get("settled"):
        try:
            os.kill(owner["pid"], 0)
        except ProcessLookupError:
            pass
        except OSError as error:
            raise BootstrapError(
                "recovery_required", "owner quiescence cannot be established"
            ) from error
        else:
            raise BootstrapError(
                "recovery_required",
                "recorded transaction owner is still a live process",
            )
    for process in processes:
        if not isinstance(process, dict):
            raise BootstrapError(
                "recovery_required", "recorded process evidence is malformed"
            )
        if process.get("quiescent") is True:
            continue
        pid = process.get("pid")
        if type(pid) is not int or pid <= 0 or not _hash(process.get("identity")):
            raise BootstrapError(
                "recovery_required", "recorded process identity is unconfirmed"
            )
        # A live child need not still lead its original process group. The
        # absence of PGID == pid alone does not establish process quiescence.
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            pass
        except OSError as error:
            raise BootstrapError(
                "recovery_required", "recorded process quiescence cannot be established"
            ) from error
        else:
            raise BootstrapError(
                "recovery_required", "recorded child is still a live process"
            )
        if os.name == "nt" or not _posix_process_group_gone(pid):
            raise BootstrapError(
                "recovery_required",
                "recorded process group quiescence unconfirmed; manual reconciliation required",
            )
    # Reconcile only leases carrying exact durable authority from this trusted
    # project journal. Legacy/unknown reservations remain manual.
    run_id = journal.get("run_id")
    if run_id:
        admission = _open_host_admission()
        try:
            rows = admission.connection.execute(
                "SELECT * FROM jobs WHERE run_id=? AND project=?",
                (run_id, str(project)),
            ).fetchall()
            for row in rows:
                if (
                    row["state"] != "released"
                    and admission.inspector(row["pid"]) == row["identity"]
                ):
                    raise BootstrapError(
                        "recovery_required", "transaction process lease is still live"
                    )
            pending = [row for row in rows if row["state"] != "released"]
            if not pending:
                return True
            evidence = journal.get("admission_leases")
            if not isinstance(evidence, list):
                return False
            by_id = {item["id"]: item for item in evidence}
            for row in pending:
                item = by_id.get(row["id"])
                if not item or any(
                    (
                        row["kind"] != item["kind"],
                        row["pid"] != item["owner_pid"],
                        row["identity"] != item["owner_identity"],
                        row["parent_id"] != item["parent_id"],
                    )
                ):
                    return False
            for row in sorted(pending, key=lambda item: item["kind"] == "worker"):
                item = by_id[row["id"]]
                try:
                    admission.reconcile_quarantined(
                        job_id=item["id"],
                        token=item["token"],
                        project_root=str(project),
                        run_id=run_id,
                        owner_pid=item["owner_pid"],
                        owner_identity=item["owner_identity"],
                    )
                except AdmissionError as error:
                    raise BootstrapError(
                        "recovery_required",
                        "transaction capacity reconciliation failed",
                    ) from error
            rows = admission.connection.execute(
                "SELECT state FROM jobs WHERE run_id=? AND project=?",
                (run_id, str(project)),
            ).fetchall()
            return all(row["state"] == "released" for row in rows)
        finally:
            admission.close()
    return True


def _recover(
    project: Path, journal: dict[str, Any] | None
) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
    if journal is None:
        raise BootstrapError(
            "recovery_required",
            "missing global journal; manual ownership and quiescence review required",
        )
    leases_released = _recovery_quiescence(project, journal)
    actions = []
    # Without an after receipt, a changed effect may belong to the user. Preserve
    # it and relinquish that path rather than blessing its current hash as ours.
    stage = journal.get("stage")
    if stage == "full_runtime" and journal.get("shared_runtime_preserved"):
        actions.extend(recover_global_runtime(project, journal))
    if stage and stage != "disable":
        before = journal.get("before")
        if not isinstance(before, dict) or set(before) != set(PROJECT_FILES):
            raise BootstrapError(
                "recovery_required",
                "stage before snapshot missing; manual effect reconciliation required",
            )
        changed = {x["path"] for x in ownership(before, project, "recovery")}
        for name in changed:
            actions.append({"path": name, "status": "ambiguous_preserved"})
        journal["owned_paths"] = [
            x for x in journal["owned_paths"] if x["path"] not in changed
        ]
        prior = journal.get("prior_state")
        if prior:
            prior["owned_paths"] = [
                x for x in prior["owned_paths"] if x["path"] not in changed
            ]
        before_dirs = journal.get("before_dirs")
        if not isinstance(before_dirs, dict) or set(before_dirs) != set(PROJECT_DIRS):
            raise BootstrapError(
                "recovery_required",
                "directory before evidence missing; manual reconciliation required",
            )
        for name in PROJECT_DIRS:
            if not before_dirs[name] and (project / name).exists():
                actions.append({"path": name, "status": "ambiguous_preserved"})
                journal["external_config_receipts"] = [
                    x
                    for x in journal["external_config_receipts"]
                    if x.get("path") != name
                ]
        if stage == "docs" and _docs_entry_digest(project) is not None:
            known = any(
                x.get("kind") == "docs_registry"
                for x in journal["external_config_receipts"]
            )
            before_rows = [
                x
                for x in journal.get("docs_before", {}).get("projects", [])
                if x.get("root") == str(project)
            ]
            before_digest = (
                sha256_bytes(json.dumps(before_rows[0], sort_keys=True).encode())
                if len(before_rows) == 1
                else None
            )
            if not known and _docs_entry_digest(project) != before_digest:
                actions.append(
                    {"path": "docs_registry", "status": "ambiguous_preserved"}
                )
        # Persist relinquished authority before retryable destructive effects.
        journal["stage"] = None
        journal["recovery_preserved"] = actions
        atomic_json(_journal_path(project), journal)
    actions = (
        list(journal.get("rollback", []))
        if journal["status"] == "rolled_back"
        else list(journal.get("recovery_preserved", actions))
    )
    if journal["status"] != "rolled_back":
        journal.update(
            owner={"pid": os.getpid(), "identity": inspect_process(os.getpid())},
            settled=False,
            processes=[],
            spawn_pending=False,
            cleanup_uncertain=False,
        )
        atomic_json(_journal_path(project), journal)
        try:
            with _track_transaction(project, journal):
                actions += restore_receipts(project, journal["owned_paths"])
                actions += restore_directory_receipts(
                    project, journal["external_config_receipts"]
                )
                for receipt in journal["external_config_receipts"]:
                    if (
                        receipt.get("kind") == "docs_registry"
                        and receipt.get("status") == "added"
                    ):
                        if _docs_entry_digest(project) not in {
                            None,
                            receipt.get("after_digest"),
                        }:
                            actions.append(
                                {
                                    "path": "docs_registry",
                                    "status": "user_modified_skip",
                                }
                            )
                        else:
                            actions.append(
                                _remove_docs(project, receipt.get("after_digest"))
                            )
        except BaseException as error:
            journal["settled"] = not _transaction_uncertain(journal, error)
            atomic_json(_journal_path(project), journal)
            raise
        journal["settled"] = True
    prior = None if stage == "disable" else journal.get("prior_state")
    state = json.loads(json.dumps(prior)) if prior else None
    preserved = any(
        x["status"] in {"ambiguous_preserved", "user_modified_skip", "unsafe_skip"}
        for x in actions
    )
    if preserved or not leases_released:
        state = state or initial_state(
            project, journal.get("mode", "automation"), journal["source_commit"]
        )
        state["status"] = "degraded"
        state["components"]["recovery"] = "degraded"
        state["last_error"] = (
            "Ambiguous/user-modified effects preserved; explicit repair required."
            if leases_released
            else "Project reconciled; host leases remain reserved. Manual host admission reconciliation required."
        )
    journal.update(
        status="rolled_back",
        stage=None,
        ownership=state,
        prior_state=state,
        owned_paths=[],
        external_config_receipts=[],
        rollback=actions,
    )
    atomic_json(_journal_path(project), journal)
    if state:
        write_state(project, state)
    else:
        state_path(project).unlink(missing_ok=True)
    return state, actions


def _read_tombstone(project: Path) -> dict[str, Any] | None:
    value = load_json(tombstone_path(project))
    if value is not None and (
        set(value) != {"schema", "project_root_digest", "disabled_at"}
        or value.get("schema") != DISABLED_SCHEMA
        or value.get("project_root_digest") != root_digest(project)
        or not isinstance(value.get("disabled_at"), str)
    ):
        raise BootstrapError("invalid_tombstone", "invalid project disabled tombstone")
    return value


def _preflight_project(project: Path) -> None:
    snapshot(project)
    _safe_existing_file(state_path(project))
    for name in PROJECT_DIRS:
        path = _project_path(project, name, directory=True)
        if path.exists():
            directory_digest(path)


def _docs_registry_path() -> Path:
    return (
        Path(os.environ.get("FORGEWRIGHT_HOME", str(Path.home() / ".forgewright")))
        / "docs-hub/projects.json"
    )


def _docs_registry() -> dict[str, Any]:
    value = load_json(_docs_registry_path()) or {"schema_version": 1, "projects": []}
    if (
        value.get("schema_version") != 1
        or not isinstance(value.get("projects"), list)
        or not all(
            isinstance(x, dict)
            and isinstance(x.get("root"), str)
            and Path(x["root"]).is_absolute()
            and isinstance(x.get("id"), str)
            for x in value["projects"]
        )
    ):
        raise BootstrapError("invalid_registry", "Docs registry is malformed")
    return value


def _docs_entry_digest(project: Path) -> str | None:
    rows = [x for x in _docs_registry()["projects"] if x["root"] == str(project)]
    if len(rows) > 1:
        raise BootstrapError("invalid_registry", "duplicate Docs project roots")
    return sha256_bytes(json.dumps(rows[0], sort_keys=True).encode()) if rows else None


def _remove_docs(project: Path, expected_digest: str | None = None) -> dict[str, str]:
    with Lock("docs-registry", timeout=5):
        # The CLI accepts id OR root. Check its ambiguous id match before passing
        # the canonical root, never a project-state-supplied registry id.
        value = _docs_registry()
        if any(
            x["id"] == str(project) and x["root"] != str(project)
            for x in value["projects"]
        ):
            raise BootstrapError(
                "unsafe_registry", "Docs root collides with another project's id"
            )
        current_digest = _docs_entry_digest(project)
        if current_digest is not None and current_digest != expected_digest:
            raise BootstrapError(
                "registry_cleanup_unconfirmed",
                "preserving modified or unreceipted Docs entry",
            )
        journal = _read_journal(project)
        trusted = (
            []
            if journal is None
            else journal["external_config_receipts"]
            + (journal.get("ownership") or {}).get("external_config_receipts", [])
        )
        if not _hash(expected_digest) or not any(
            x.get("kind") == "docs_registry"
            and x.get("status") == "added"
            and x.get("after_digest") == expected_digest
            for x in trusted
        ):
            raise BootstrapError(
                "untrusted_ownership", "Docs receipt has no matching global ownership"
            )
        if current_digest is None:
            return {"path": "docs_registry", "status": "already_missing"}
        result = call_forge(
            ["docs", "registry", "remove", str(project)],
            project=project,
            required=True,
            stage="docs_unregister",
        )
        if result["status"] != "ready" or any(
            x["root"] == str(project) for x in _docs_registry()["projects"]
        ):
            raise BootstrapError(
                "registry_cleanup_unconfirmed", "Docs removal unconfirmed"
            )
    return {"path": "docs_registry", "status": "removed"}


@contextmanager
def _operation_budget(seconds: float = 90):
    # CLI supervisor must allow this budget plus cleanup grace (at least 15s).
    token = _DEADLINE.set(time.monotonic() + seconds)
    try:
        yield
    finally:
        _DEADLINE.reset(token)


def ensure(
    target: str,
    requested_mode: str | None,
    *,
    repair: bool = False,
    auto: bool = False,
) -> dict[str, Any]:
    if type(auto) is not bool or type(repair) is not bool:
        raise BootstrapError("invalid_arguments", "auto/repair must be boolean")
    value = policy()
    if not value["enabled"] or (auto and not value["auto"]):
        raise BootstrapError("policy_disabled", "global bootstrap policy is disabled")
    project = canonical_project(target)
    enforce_policy_root(project, value)
    root = Path(value["forgewright_root"]).resolve()
    mode = requested_mode or value["mode"]
    if mode not in ("automation", "full"):
        raise BootstrapError("invalid_mode", "ensure requires automation or full mode")
    commit = source_commit(root)
    with _operation_budget(), Lock(f"project-{root_digest(project)}", timeout=5):
        _journal_path(project)
        _preflight_project(project)
        preserved_docs = any(
            _project_path(project, relative).exists()
            for relative in (
                ".forgewright/docs-manifest.json",
                "docs/project-state.json",
            )
        )
        disabled = _read_tombstone(project)
        if disabled is not None and auto:
            raise BootstrapError("project_disabled", "project is disabled")
        old_state = read_state(project)
        journal = _read_journal(project)
        if (
            (journal and journal.get("status") not in {"completed", "rolled_back"})
            or (
                journal
                and journal["status"] == "rolled_back"
                and (auto or old_state is None)
            )
            or (
                old_state
                and old_state["status"] in {"bootstrapping", "rolling_back", "blocked"}
            )
        ):
            if not repair or auto:
                raise BootstrapError(
                    "recovery_required",
                    "bootstrap recovery required; no automatic retry",
                )
            old_state, recovery = _recover(project, journal)
            journal = _read_journal(project)
            if (
                old_state
                and old_state.get("components", {}).get("recovery") == "degraded"
            ):
                return {
                    "status": "degraded",
                    "ok": False,
                    "changed": True,
                    "project": str(project),
                    "state": old_state,
                    "recovery": recovery,
                }
        if old_state and MODE_RANK[old_state["mode"]] > MODE_RANK[mode]:
            mode = old_state["mode"]
        if old_state:
            _trusted_state(project, old_state, journal)
            drift = ownership_issues(project, old_state)
            if drift:
                old_state["status"] = "degraded"
                old_state["components"]["ownership"] = "degraded"
                old_state["components"]["ownership_issues"] = ",".join(drift[:16])
                write_state(project, old_state)
                return {
                    "status": "degraded",
                    "ok": False,
                    "changed": False,
                    "project": str(project),
                    "state": old_state,
                }
            if (
                not repair
                and old_state["status"] == "ready"
                and MODE_RANK[old_state["mode"]] >= MODE_RANK[mode]
                and old_state["source_commit"] == commit
            ):
                checked = verify(str(project))
                if checked["ok"] or (
                    not auto and checked.get("issues") == ["project_disabled"]
                ):
                    if not auto:
                        tombstone_path(project).unlink(missing_ok=True)
                    return {
                        "status": "ready",
                        "ok": True,
                        "changed": False,
                        "project": str(project),
                        "state": old_state,
                    }
                return {**checked, "changed": False}
            if auto and old_state["status"] != "ready":
                raise BootstrapError(
                    "recovery_required", "degraded bootstrap requires explicit repair"
                )

        capacity = HostCapacityLease(
            project, wait_seconds=BOOTSTRAP_ADMISSION_WAIT_SECONDS
        )
        state = initial_state(project, mode, commit)
        if old_state:
            state["owned_paths"] = list(old_state["owned_paths"])
            state["external_config_receipts"] = list(
                old_state["external_config_receipts"]
            )
        journal = {
            "schema": "forgewright-bootstrap-transaction/v1",
            "project_root_digest": root_digest(project),
            "status": "running",
            "stage": None,
            "owned_paths": [],
            "external_config_receipts": [],
            "prior_state": old_state,
            "ownership": old_state,
            "transaction_id": uuid.uuid4().hex,
            "mode": mode,
            "source_commit": commit,
            "owner": {"pid": os.getpid(), "identity": inspect_process(os.getpid())},
            "run_id": capacity.run_id,
            "admission_leases": [capacity.worker_record()],
            "processes": [],
            "spawn_pending": False,
            "settled": False,
            "started_at": now(),
        }
        atomic_json(_journal_path(project), journal)
        capacity.bind_transaction(project, journal)
        with capacity:
            state["status"] = "bootstrapping"
            write_state(project, state)

            @contextmanager
            def stage(name: str):
                before = snapshot(project)
                before_dirs = {n: (project / n).exists() for n in PROJECT_DIRS}
                journal.update(stage=name, before=before, before_dirs=before_dirs)
                atomic_json(_journal_path(project), journal)
                try:
                    with _track_transaction(project, journal):
                        yield
                except BaseException as error:
                    if _transaction_uncertain(journal, error):
                        journal["cleanup_uncertain"] = True
                    raise
                finally:
                    # Even a failed adapter can have changed files. If collection
                    # itself fails the running journal remains recovery-required.
                    delta = ownership(before, project, name)
                    journal["owned_paths"] = merge_receipts(
                        journal["owned_paths"], delta
                    )
                    state["owned_paths"] = merge_receipts(state["owned_paths"], delta)
                    if name == "docs" and "docs_before" in journal:
                        journal["docs_after_digest"] = _docs_entry_digest(project)
                        if (
                            journal["docs_after_digest"]
                            and not any(
                                x["root"] == str(project)
                                for x in journal["docs_before"]["projects"]
                            )
                            and not any(
                                x.get("kind") == "docs_registry"
                                for x in journal["external_config_receipts"]
                            )
                        ):
                            receipt = {
                                "kind": "docs_registry",
                                "project_root_digest": root_digest(project),
                                "status": "added",
                                "after_digest": journal["docs_after_digest"],
                            }
                            journal["external_config_receipts"].append(receipt)
                            state["external_config_receipts"].append(receipt)
                    for n in PROJECT_DIRS:
                        if not before_dirs[n] and (project / n).exists():
                            item = {
                                "kind": "project_directory",
                                "path": n,
                                "project_root_digest": root_digest(project),
                                "status": "created",
                                "after_digest": directory_digest(project / n),
                            }
                            journal["external_config_receipts"].append(item)
                            state["external_config_receipts"].append(item)
                    journal["stage"] = None
                    atomic_json(_journal_path(project), journal)
                    write_state(project, state)

            try:
                with stage("project_init"):
                    if not (project / ".forgewright/project.json").exists():
                        call_forge(
                            ["init", str(project)],
                            project=project,
                            required=True,
                            stage="project_init",
                        )
                with stage("project_onboard"):
                    if not (project / ".forgewright/project-profile.json").exists():
                        call_forge(
                            ["onboard", str(project)],
                            project=project,
                            required=True,
                            stage="project_onboard",
                        )
                fault("project_init")
                with stage("policy_seed"):
                    state["components"]["execution_policy"] = ensure_policy_file(
                        root, project
                    )
                fault("policy_seed")
                with (
                    stage("index"),
                    capacity.heavy(wait_seconds=BOOTSTRAP_ADMISSION_WAIT_SECONDS),
                    Lock("global-heavy", timeout=5),
                ):
                    index = gitnexus(project)
                    state["components"]["gitnexus"] = index["status"]
                fault("index")
                with stage("docs"), Lock("docs-registry", timeout=5):
                    docs_before = _docs_registry()
                    journal["docs_before"] = docs_before
                    atomic_json(_journal_path(project), journal)
                    docs_result, docs_receipt = _docs_under_lock(project)
                    state["components"]["docs"] = docs_result["status"]
                    if docs_receipt and docs_receipt.get("status") == "added":
                        journal["external_config_receipts"].append(docs_receipt)
                        if not any(
                            x.get("kind") == "docs_registry"
                            for x in state["external_config_receipts"]
                        ):
                            state["external_config_receipts"].append(docs_receipt)
                fault("docs")
                with stage("delegate_status"):
                    delegation = call_forge(
                        ["delegate", "status"],
                        project=project,
                        required=False,
                        stage="delegate_status",
                    )
                    state["components"]["delegation"] = delegation["status"]
                fault("delegate_status")
                if mode == "full":
                    with (
                        stage("full_runtime"),
                        capacity.heavy(wait_seconds=BOOTSTRAP_ADMISSION_WAIT_SECONDS),
                    ):
                        journal["shared_runtime_preserved"] = True
                        atomic_json(_journal_path(project), journal)
                        update_token = _RUNTIME_UPDATE_ALLOWED.set(
                            repair or not auto or value["auto_update"]
                        )
                        try:
                            global_receipt = ensure_global_runtime(value, root)
                        finally:
                            _RUNTIME_UPDATE_ALLOWED.reset(update_token)
                        state["components"]["global_runtime"] = global_receipt["status"]
                        state["components"]["pi"] = str(
                            pi_prepare(value, project)["status"]
                        )
                        journal["shared_runtime_preserved"] = True
                    fault("full_runtime")
                live_issues = _readiness_issues(
                    project, validate_preserved_docs=preserved_docs
                )
                if live_issues:
                    state["components"]["readiness"] = "degraded"
                    state["components"]["readiness_issues"] = ",".join(live_issues)
                degraded = bool(_component_issues(state) or live_issues)
                # A ready/completed receipt cannot precede release of the worker
                # reservation that guarded this transaction.  Keep failures in
                # the running journal so explicit recovery can reconcile them.
                capacity.release_worker()
                state["status"] = "degraded" if degraded else "ready"
                state["last_verified_at"] = now()
                register_project(project, mode, state["status"])
                journal.update(status="completed", ownership=state, settled=True)
                atomic_json(_journal_path(project), journal)
                # The project-visible ready state is the final publication.
                # A crash earlier leaves bootstrapping state, so cheap preflight
                # cannot skip the durable transaction recovery boundary.
                if state["status"] == "ready" and not auto:
                    tombstone_path(project).unlink(missing_ok=True)
                write_state(project, state)
                return {
                    "status": state["status"],
                    "ok": state["status"] == "ready",
                    "changed": True,
                    "project": str(project),
                    "mode": mode,
                    "state": state,
                }
            except BaseException as error:
                uncertain = capacity.uncertain or _transaction_uncertain(journal, error)
                if uncertain:
                    capacity.mark_uncertain()
                rollback = []
                completed = False
                try:
                    # Do not reverse uncertain writes or a partially captured stage.
                    if uncertain or journal.get("stage") is not None:
                        raise BootstrapError(
                            "recovery_required",
                            "uncertain adapter effects require recovery",
                        )
                    journal.update(
                        status="recovery_required", settled=False, ownership=old_state
                    )
                    atomic_json(_journal_path(project), journal)
                    with _track_transaction(project, journal):
                        _preflight_project(project)
                        rollback = restore_receipts(project, journal["owned_paths"])
                        rollback.extend(
                            restore_directory_receipts(
                                project, journal["external_config_receipts"]
                            )
                        )
                        docs_added = any(
                            x.get("kind") == "docs_registry"
                            and x.get("status") == "added"
                            for x in journal["external_config_receipts"]
                        )
                        # A registry command may write and then fail before returning.
                        if "docs_before" in journal and not any(
                            x["root"] == str(project)
                            for x in journal["docs_before"]["projects"]
                        ):
                            docs_added = docs_added or any(
                                x["root"] == str(project)
                                for x in _docs_registry()["projects"]
                            )
                        if docs_added:
                            rollback.append(
                                _remove_docs(project, journal.get("docs_after_digest"))
                            )
                        completed = all(
                            x["status"]
                            in {
                                "removed",
                                "restored",
                                "already_missing",
                                "already_restored",
                            }
                            for x in rollback
                        )
                except BaseException as cleanup_error:
                    uncertain = uncertain or _transaction_uncertain(
                        journal, cleanup_error
                    )
                    if uncertain:
                        capacity.mark_uncertain()
                    rollback.append(
                        {
                            "path": "transaction",
                            "status": "recovery_required",
                            "detail": str(cleanup_error)[:500],
                        }
                    )
                state = json.loads(json.dumps(old_state)) if old_state else state
                state["status"] = "blocked"
                state["last_error"] = str(error)[:2000]
                state["components"]["rollback"] = (
                    "completed" if completed else "recovery_required"
                )
                state["rollback"] = rollback
                journal.update(
                    status="rolled_back" if completed else "recovery_required",
                    rollback=rollback,
                    settled=not uncertain,
                    ownership=old_state,
                )
                atomic_json(_journal_path(project), journal)
                write_state(project, state)
                register_project(project, mode, "blocked")
                if isinstance(error, BootstrapError):
                    raise
                raise BootstrapError("bootstrap_failed", str(error)) from error


def ownership_issues(project: Path, state: dict[str, Any]) -> list[str]:
    _validate_state(project, state)
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


def _component_issues(state: dict[str, Any]) -> list[str]:
    required = {"execution_policy", "gitnexus", "docs", "delegation"}
    if state["mode"] == "full":
        required |= {"global_runtime", "pi"}
    accepted = {
        "ready",
        "created",
        "preserved",
        "optional_unconfigured",
        "disabled",
        "not_requested",
    }
    return [
        f"component_{name}_not_ready"
        for name in sorted(required)
        if state["components"].get(name) not in accepted
    ]


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
    journal = _read_journal(project)
    if journal and journal["status"] not in {"completed", "rolled_back"}:
        issues.append("recovery_required")
    if _read_tombstone(project) is not None:
        issues.append("project_disabled")
    if state["source_commit"] != commit:
        issues.append("source_changed")
    if state["status"] != "ready":
        issues.append(f"state_{state['status']}")
    if not value["enabled"]:
        issues.append("policy_disabled")
    _trusted_state(project, state, journal)
    owned_paths = {item["path"] for item in state["owned_paths"]}
    issues.extend(
        _readiness_issues(
            project,
            validate_preserved_docs=not {
                ".forgewright/docs-manifest.json",
                "docs/project-state.json",
            }.issubset(owned_paths),
        )
    )
    issues.extend(_component_issues(state))
    for name, component in state["components"].items():
        if component in {
            "degraded",
            "unavailable",
            "unsupported",
            "blocked",
            "recovery_required",
        }:
            issues.append(f"component_{name}_{component}")
    issues.extend(ownership_issues(project, state))
    if state["mode"] == "full":
        issues.extend(_runtime_issues(value, load_json(global_runtime_receipt())))
    return {
        "status": "ready" if not issues else "degraded",
        "project": str(project),
        "ok": not issues,
        "issues": issues,
        "state": state,
    }


def disable(target: str, *, keep_profile: bool) -> dict[str, Any]:
    if type(keep_profile) is not bool:
        raise BootstrapError("invalid_arguments", "keep_profile must be boolean")
    project = canonical_project(target)
    enforce_policy_root(project, policy())
    with _operation_budget(), Lock(f"project-{root_digest(project)}", timeout=5):
        _journal_path(project)
        _preflight_project(project)
        state = read_state(project)
        journal = _read_journal(project)
        atomic_json(
            tombstone_path(project),
            {
                "schema": DISABLED_SCHEMA,
                "project_root_digest": root_digest(project),
                "disabled_at": now(),
            },
        )
        retry = bool(journal and journal.get("stage") == "disable")
        if journal and journal.get("status") not in {"completed", "rolled_back"}:
            if not retry:
                raise BootstrapError(
                    "recovery_required",
                    "disabled; explicit repair required before cleanup",
                )
            _recovery_quiescence(project, journal)
        if retry and state is None:
            state = journal.get("ownership")
        if not state:
            return {
                "status": "disabled",
                "project": str(project),
                "changed": True,
                "shared_runtime_preserved": True,
            }
        _trusted_state(project, state, journal)
        receipts = list(state["owned_paths"])
        if retry:
            keep_profile = journal["keep_profile"]
        if keep_profile:
            receipts = [
                x
                for x in receipts
                if x["path"]
                not in {
                    ".forgewright/project.json",
                    ".forgewright/project-profile.json",
                }
            ]
        # Disable has no host-capacity reservation. Drop completed bootstrap
        # lease secrets before reusing the journal for this new transaction.
        journal.pop("admission_leases", None)
        # Durable authority remains available after any crash/partial cleanup.
        journal.update(
            status="running",
            stage="disable",
            prior_state=state,
            owned_paths=receipts,
            external_config_receipts=state["external_config_receipts"],
            keep_profile=keep_profile,
            settled=False,
            processes=[],
            spawn_pending=False,
            owner={"pid": os.getpid(), "identity": inspect_process(os.getpid())},
            run_id=None,
        )
        atomic_json(_journal_path(project), journal)
        actions = []
        try:
            with _track_transaction(project, journal):
                actions = restore_receipts(project, receipts)
                actions.extend(
                    restore_directory_receipts(
                        project, state["external_config_receipts"]
                    )
                )
                for receipt in state["external_config_receipts"]:
                    if (
                        receipt.get("kind") == "docs_registry"
                        and receipt.get("status") == "added"
                    ):
                        actions.append(
                            _remove_docs(project, receipt.get("after_digest"))
                        )
                if any(x["status"] == "unsafe_skip" for x in actions):
                    raise BootstrapError(
                        "recovery_required", "disable cleanup unconfirmed"
                    )
                unregister_project(project)
                _safe_existing_file(state_path(project))
                state_path(project).unlink(missing_ok=True)
            terminal = {
                **journal,
                "status": "completed",
                "stage": None,
                "settled": True,
                "ownership": None,
                "prior_state": None,
                "owned_paths": [],
                "external_config_receipts": [],
            }
            atomic_json(_journal_path(project), terminal)
        except BaseException as error:
            state["status"] = "blocked"
            state["last_error"] = str(error)[:2000]
            state["components"]["rollback"] = "recovery_required"
            state["rollback"] = actions
            journal.update(
                status="recovery_required",
                rollback=actions,
                settled=not _transaction_uncertain(journal, error),
            )
            atomic_json(_journal_path(project), journal)
            write_state(project, state)
            raise
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
        if name == "ensure":
            cmd.add_argument("--auto", action="store_true")

    args = parser.parse_args()
    try:
        if args.command == "ensure":
            result = ensure(args.target, args.mode, auto=args.auto)
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
                {
                    "ok": result.get(
                        "ok", result.get("status") not in {"degraded", "blocked"}
                    ),
                    "data": result,
                    "error": None,
                },
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
