#!/usr/bin/env python3
"""Bounded, journaled installer for auto-bootstrap shared runtime assets."""

from __future__ import annotations

import ctypes
import errno
import hashlib
import json
import os
import platform
import re
import shutil
import stat
import uuid
from pathlib import Path
from typing import Any, Callable


ASSET_SCHEMA = "forgewright-shared-runtime-assets/v1"
OWNER_NAME = ".forgewright-auto-bootstrap-owner.json"
RLG_FILES = (
    "INSTALLED_FROM",
    "MODE",
    "leases.jsonl",
    "port-allowlist.txt",
    "projects.index",
)
RLG_DIRECTORIES = ("locks", "logs")
MAX_TREE_ENTRIES = 100_000
MAX_TREE_BYTES = 2 * 1024 * 1024 * 1024


class SharedRuntimeError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def shared_runtime_receipt_digest(receipt: dict[str, Any]) -> str:
    return _digest(json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode())


def _file_digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            value.update(chunk)
    return value.hexdigest()


def _fsync_directory(path: Path) -> None:
    if os.name == "nt":
        return
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _safe_directory(path: Path, *, allow_missing: bool = True) -> None:
    path = path.absolute()
    for candidate in [*reversed(path.parents), path]:
        try:
            info = candidate.lstat()
        except FileNotFoundError:
            if allow_missing:
                continue
            raise SharedRuntimeError(
                "runtime_asset_missing", f"missing path: {candidate}"
            )
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise SharedRuntimeError(
                "unsafe_runtime_path", f"unsafe directory: {candidate}"
            )
    if path.exists() and hasattr(os, "getuid") and path.stat().st_uid != os.getuid():
        raise SharedRuntimeError("unsafe_runtime_path", f"foreign directory: {path}")


def _safe_managed_root(path: Path, *, allow_missing: bool = False) -> None:
    _safe_directory(path, allow_missing=allow_missing)
    if not path.exists():
        return
    info = path.stat()
    if hasattr(os, "getuid") and info.st_uid != os.getuid():
        raise SharedRuntimeError("unsafe_runtime_path", f"foreign managed root: {path}")
    if os.name != "nt" and info.st_mode & 0o022:
        raise SharedRuntimeError(
            "unsafe_runtime_path", f"writable managed root: {path}"
        )


def _safe_regular(path: Path) -> None:
    _safe_directory(path.parent)
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise SharedRuntimeError("unsafe_runtime_path", f"unsafe file: {path}")


def _ensure_directory(path: Path) -> None:
    _safe_directory(path)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    _safe_directory(path, allow_missing=False)


def _tree_digest(path: Path) -> str:
    _safe_directory(path, allow_missing=False)
    digest = hashlib.sha256()
    entries = 0
    total = 0
    for item in sorted(path.rglob("*"), key=lambda value: value.as_posix()):
        info = item.lstat()
        relative = item.relative_to(path).as_posix().encode()
        entries += 1
        if entries > MAX_TREE_ENTRIES:
            raise SharedRuntimeError(
                "runtime_tree_too_large", "runtime tree entry bound exceeded"
            )
        if stat.S_ISDIR(info.st_mode):
            kind = b"d"
            payload = b""
        elif stat.S_ISLNK(info.st_mode):
            kind = b"l"
            payload = os.fsencode(os.readlink(item))
        elif stat.S_ISREG(info.st_mode) and info.st_nlink == 1:
            kind = b"f"
            total += info.st_size
            if total > MAX_TREE_BYTES:
                raise SharedRuntimeError(
                    "runtime_tree_too_large", "runtime tree byte bound exceeded"
                )
            payload = _file_digest(item).encode()
        else:
            raise SharedRuntimeError(
                "unsafe_runtime_path", f"unsafe runtime member: {item}"
            )
        mode = f"{stat.S_IMODE(info.st_mode):o}".encode()
        digest.update(kind + b"\0" + relative + b"\0" + mode + b"\0" + payload + b"\n")
    return digest.hexdigest()


def _rename_no_replace(source: Path, destination: Path) -> None:
    _safe_directory(destination.parent)
    if os.path.lexists(destination):
        raise SharedRuntimeError(
            "runtime_asset_conflict", f"preserving existing path: {destination}"
        )
    system = platform.system()
    if system == "Darwin":
        libc = ctypes.CDLL(None, use_errno=True)
        rename = getattr(libc, "renamex_np", None)
        if rename is None:
            raise SharedRuntimeError(
                "unsupported_atomic_publish", "renamex_np unavailable"
            )
        result = rename(os.fsencode(source), os.fsencode(destination), 0x00000004)
    elif system == "Linux":
        libc = ctypes.CDLL(None, use_errno=True)
        rename = getattr(libc, "renameat2", None)
        if rename is None:
            raise SharedRuntimeError(
                "unsupported_atomic_publish", "renameat2 unavailable"
            )
        result = rename(-100, os.fsencode(source), -100, os.fsencode(destination), 1)
    elif system == "Windows":
        try:
            os.rename(source, destination)
        except FileExistsError as error:
            raise SharedRuntimeError(
                "runtime_asset_conflict", f"preserving existing path: {destination}"
            ) from error
        result = 0
    else:
        raise SharedRuntimeError(
            "unsupported_atomic_publish", f"unsupported platform: {system}"
        )
    if result != 0:
        number = ctypes.get_errno()
        if number in {errno.EEXIST, errno.ENOTEMPTY}:
            raise SharedRuntimeError(
                "runtime_asset_conflict", f"preserving existing path: {destination}"
            )
        raise SharedRuntimeError(
            "runtime_publish_failed",
            f"cannot publish {destination}: {os.strerror(number)}",
        )
    _fsync_directory(destination.parent)


def _publish_directory_no_replace(source: Path, destination: Path) -> None:
    _safe_directory(source, allow_missing=False)
    _rename_no_replace(source, destination)


def _publish_file_no_replace(source: Path, destination: Path, temporary: Path) -> None:
    _safe_regular(source)
    _safe_directory(destination.parent)
    if temporary.parent != destination.parent or os.path.lexists(temporary):
        raise SharedRuntimeError(
            "runtime_recovery_required", "unsafe runtime publication temp"
        )
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError as error:
        raise SharedRuntimeError(
            "runtime_recovery_required", f"runtime publication temp exists: {temporary}"
        ) from error
    try:
        os.fchmod(descriptor, stat.S_IMODE(source.stat().st_mode))
        with source.open("rb") as source_handle, os.fdopen(descriptor, "wb") as target:
            shutil.copyfileobj(source_handle, target)
            target.flush()
            os.fsync(target.fileno())
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
    try:
        _rename_no_replace(temporary, destination)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _publish_empty_directory(destination: Path) -> None:
    _safe_directory(destination.parent)
    try:
        destination.mkdir(mode=0o700)
    except FileExistsError as error:
        raise SharedRuntimeError(
            "runtime_asset_conflict", f"preserving existing path: {destination}"
        ) from error
    _fsync_directory(destination.parent)


def _asset_matches(asset: dict[str, Any]) -> bool:
    path = Path(asset["path"])
    kind = asset["kind"]
    try:
        if kind == "directory":
            return (
                path.is_dir()
                and not path.is_symlink()
                and _tree_digest(path) == asset["digest"]
            )
        if kind == "file":
            _safe_regular(path)
            return (
                path.is_file()
                and _file_digest(path) == asset["digest"]
                and stat.S_IMODE(path.stat().st_mode) == asset["mode"]
            )
        if kind == "empty_directory":
            return path.is_dir() and not path.is_symlink() and not any(path.iterdir())
    except (OSError, SharedRuntimeError):
        return False
    return False


def _remove_owned_asset(asset: dict[str, Any]) -> str:
    path = Path(asset["path"])
    temporary = Path(asset["temp_path"]) if asset.get("temp_path") else None
    if temporary is not None and os.path.lexists(temporary):
        info = temporary.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise SharedRuntimeError(
                "runtime_recovery_required", "unsafe runtime publication temp"
            )
        temporary.unlink()
        _fsync_directory(temporary.parent)
    tombstone = Path(asset["tombstone"])
    if os.path.lexists(path) and os.path.lexists(tombstone):
        raise SharedRuntimeError(
            "runtime_recovery_required", "runtime asset and tombstone both exist"
        )
    if os.path.lexists(path):
        _rename_no_replace(path, tombstone)
    elif not os.path.lexists(tombstone):
        return "already_missing"
    if _asset_matches({**asset, "path": str(tombstone)}):
        if asset["kind"] == "directory":
            shutil.rmtree(tombstone)
        elif asset["kind"] == "empty_directory":
            tombstone.rmdir()
        else:
            tombstone.unlink()
        _fsync_directory(tombstone.parent)
        return "removed"
    if not os.path.lexists(path):
        try:
            _rename_no_replace(tombstone, path)
        except SharedRuntimeError as error:
            raise SharedRuntimeError(
                "runtime_asset_drift",
                f"modified shared runtime asset preserved in tombstone: {tombstone}",
            ) from error
    raise SharedRuntimeError(
        "runtime_asset_drift", f"modified shared runtime asset preserved: {path}"
    )


def _prior_asset(asset: dict[str, Any], path: Path) -> dict[str, Any]:
    value = {
        "kind": asset["kind"],
        "path": str(path),
        "digest": asset["before_digest"],
    }
    if asset["kind"] == "file":
        value["mode"] = asset["before_mode"]
    return value


def _cleanup_migration_backup(asset: dict[str, Any]) -> str:
    backup = Path(asset["backup"])
    cleanup = backup.parent / f".{backup.name}.cleanup"
    return _remove_owned_asset(
        {
            **_prior_asset(asset, backup),
            "tombstone": str(cleanup),
        }
    )


def _rollback_migrated_asset(asset: dict[str, Any]) -> str:
    path = Path(asset["path"])
    backup = Path(asset["backup"])
    if os.path.lexists(path):
        if _asset_matches(asset):
            _remove_owned_asset(asset)
        elif not os.path.lexists(backup) and _asset_matches(_prior_asset(asset, path)):
            return "already_restored"
        else:
            raise SharedRuntimeError(
                "runtime_asset_drift",
                f"modified migrated runtime asset preserved: {path}",
            )
    if not os.path.lexists(backup):
        raise SharedRuntimeError(
            "runtime_recovery_required", f"missing prior runtime backup: {backup}"
        )
    if not _asset_matches(_prior_asset(asset, backup)):
        raise SharedRuntimeError(
            "runtime_asset_drift", f"modified prior runtime backup preserved: {backup}"
        )
    _rename_no_replace(backup, path)
    return "restored"


def _validate_source(root: Path, *, need_mcp: bool) -> None:
    _safe_directory(root, allow_missing=False)
    required = [
        root / "scripts/runtime/runtime-install.sh",
        root / "scripts/runtime/runtime-common.sh",
        root / "scripts/lite/runtime-pretool-gate.sh",
    ]
    if need_mcp:
        required.extend(
            [
                root / "scripts/lite/policy-check.sh",
                root / "scripts/lite/telemetry.sh",
                root / "mcp/package.json",
                root / "mcp/package-lock.json",
                root / "mcp/tsconfig.json",
                root / "mcp/src/index.ts",
                root / "skills",
            ]
        )
    for path in required:
        if path.name in {"skills"}:
            _safe_directory(path, allow_missing=False)
        else:
            _safe_regular(path)
            if not path.is_file():
                raise SharedRuntimeError(
                    "runtime_source_incomplete", f"missing source asset: {path}"
                )
    if need_mcp:
        _validate_copy_source_tree(root / "mcp/src")
        _validate_copy_source_tree(root / "skills")


def _validate_copy_source_tree(path: Path) -> None:
    _safe_directory(path, allow_missing=False)
    for member in path.rglob("*"):
        info = member.lstat()
        if stat.S_ISDIR(info.st_mode):
            continue
        if (
            stat.S_ISLNK(info.st_mode)
            or not stat.S_ISREG(info.st_mode)
            or info.st_nlink != 1
        ):
            raise SharedRuntimeError(
                "unsafe_runtime_source", f"unsupported source tree member: {member}"
            )


def _clean_environment(
    home: Path, extra: dict[str, str] | None = None
) -> dict[str, str]:
    allowed = (
        "PATH",
        "TMPDIR",
        "TMP",
        "TEMP",
        "SYSTEMROOT",
        "COMSPEC",
        "PATHEXT",
        "LANG",
        "LC_ALL",
    )
    result = {key: os.environ[key] for key in allowed if os.environ.get(key)}
    result["HOME"] = str(home)
    result["NO_COLOR"] = "1"
    result.update(extra or {})
    return result


def _run_checked(
    runner: Callable[..., dict[str, Any]],
    argv: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    stage: str,
    timeout: float = 300,
) -> None:
    result = runner(
        argv,
        cwd=cwd,
        env=env,
        timeout=timeout,
        required=True,
        stage=stage,
        inherit_env=False,
    )
    if result.get("status") != "ready":
        raise SharedRuntimeError("runtime_adapter_failed", f"{stage} did not complete")


def _receipt_structure_issues(receipt: Any) -> list[str]:
    if (
        not isinstance(receipt, dict)
        or set(receipt)
        != {
            "schema",
            "transaction_id",
            "source_root",
            "source_commit",
            "rlg",
            "mcp",
            "assets",
        }
        or receipt.get("schema") != ASSET_SCHEMA
        or re.fullmatch(r"[0-9a-f]{32}", str(receipt.get("transaction_id", ""))) is None
        or re.fullmatch(r"[0-9a-f]{40}", str(receipt.get("source_commit", ""))) is None
        or type(receipt.get("rlg")) is not bool
        or type(receipt.get("mcp")) is not bool
        or not isinstance(receipt.get("assets"), list)
        or not (receipt.get("rlg") or receipt.get("mcp"))
    ):
        return ["shared_runtime_asset_receipt_invalid"]
    try:
        source_root = Path(receipt["source_root"])
    except TypeError:
        return ["shared_runtime_asset_receipt_invalid"]
    if (
        not source_root.is_absolute()
        or Path(os.path.abspath(source_root)) != source_root
    ):
        return ["shared_runtime_asset_receipt_invalid"]
    expected_names: set[str] = set()
    if receipt["rlg"]:
        expected_names.update({"rlg_scripts", "rlg:INSTALLED_FROM"})
    if receipt["mcp"]:
        expected_names.update(
            {
                "policy_guard:policy-check.sh",
                "policy_guard:telemetry.sh",
                "source_skills",
                "mcp_server",
            }
        )
    names = {
        asset.get("name") for asset in receipt["assets"] if isinstance(asset, dict)
    }
    if names != expected_names or len(receipt["assets"]) != len(expected_names):
        return ["shared_runtime_asset_receipt_invalid"]
    paths: set[str] = set()
    for asset in receipt["assets"]:
        if not isinstance(asset, dict):
            return ["shared_runtime_asset_receipt_invalid"]
        kind = asset.get("kind")
        expected_keys = {"kind", "name", "path", "digest"}
        if kind == "file":
            expected_keys.add("mode")
        try:
            path = Path(asset["path"])
        except (KeyError, TypeError):
            return ["shared_runtime_asset_receipt_invalid"]
        if (
            set(asset) != expected_keys
            or kind not in {"directory", "file"}
            or not path.is_absolute()
            or Path(os.path.abspath(path)) != path
            or asset["path"] in paths
            or re.fullmatch(r"[0-9a-f]{64}", str(asset.get("digest", ""))) is None
            or (
                kind == "file"
                and (
                    type(asset.get("mode")) is not int
                    or not 0 <= asset["mode"] <= 0o777
                )
            )
        ):
            return ["shared_runtime_asset_receipt_invalid"]
        paths.add(asset["path"])
    return []


def _validate_progress(value: Any, progress_path: Path) -> dict[str, Any]:
    if (
        not isinstance(value, dict)
        or value.get("schema") != ASSET_SCHEMA
        or re.fullmatch(r"[0-9a-f]{32}", str(value.get("transaction_id", ""))) is None
        or value.get("status")
        not in {"running", "committed", "completed", "rolling_back", "rolled_back"}
        or value.get("operation") not in {"install", "migrate", "repair"}
        or not isinstance(value.get("assets"), list)
        or not isinstance(value.get("stage_root"), str)
        or type(value.get("need_rlg")) is not bool
        or type(value.get("need_mcp")) is not bool
        or not isinstance(value.get("project_transaction_id"), str)
        or re.fullmatch(r"[0-9a-f]{64}", str(value.get("project_root_digest", "")))
        is None
    ):
        raise SharedRuntimeError(
            "runtime_recovery_required", "invalid shared runtime journal"
        )
    transaction_id = value["transaction_id"]
    try:
        home = Path(value["home"])
        rlg_home = Path(value["rlg_home"])
        source_root = Path(value["source_root"])
    except (KeyError, TypeError) as error:
        raise SharedRuntimeError(
            "runtime_recovery_required", "invalid shared runtime roots"
        ) from error
    for candidate in (home, rlg_home, source_root, progress_path):
        if not candidate.is_absolute() or Path(os.path.abspath(candidate)) != candidate:
            raise SharedRuntimeError(
                "runtime_recovery_required", "non-normalized shared runtime path"
            )
    stage = Path(value["stage_root"])
    expected = progress_path.parent / f"shared-runtime-stage-{transaction_id}"
    if stage != expected:
        raise SharedRuntimeError(
            "runtime_recovery_required", "unsafe shared runtime stage binding"
        )
    expected_assets: dict[str, dict[str, str]] = {}

    def expected_asset(name: str, kind: str, path: Path, source: Path) -> None:
        expected_assets[name] = {
            "kind": kind,
            "path": str(path),
            "source": str(source),
            "tombstone": str(
                path.parent / f".{path.name}.forgewright-rollback-{transaction_id}"
            ),
        }
        if kind == "file":
            expected_assets[name]["temp_path"] = str(
                path.parent / f".{path.name}.forgewright-{transaction_id}.tmp"
            )

    if value["need_rlg"]:
        expected_asset(
            "rlg_scripts",
            "directory",
            home / ".forgewright/scripts/runtime",
            stage / "home/.forgewright/scripts/runtime",
        )
        rlg_files = (
            ("INSTALLED_FROM",)
            if value["operation"] in {"migrate", "repair"}
            else RLG_FILES
        )
        for name in rlg_files:
            expected_asset(f"rlg:{name}", "file", rlg_home / name, stage / "rlg" / name)
        for name in (
            () if value["operation"] in {"migrate", "repair"} else RLG_DIRECTORIES
        ):
            expected_asset(
                f"rlg:{name}",
                "empty_directory",
                rlg_home / name,
                stage / "rlg" / name,
            )
    if value["need_mcp"]:
        for name in ("policy-check.sh", "telemetry.sh"):
            expected_asset(
                f"policy_guard:{name}",
                "file",
                home / ".forgewright/scripts/lite" / name,
                stage / "lite" / name,
            )
        expected_asset(
            "source_skills",
            "directory",
            home / ".forgewright/skills",
            stage / "skills",
        )
        expected_asset(
            "mcp_server",
            "directory",
            home / ".forgewright/mcp-server",
            stage / "mcp-server",
        )
    if not expected_assets:
        raise SharedRuntimeError(
            "runtime_recovery_required", "empty shared runtime transaction"
        )
    if value["assets"] and {
        asset.get("name") for asset in value["assets"] if isinstance(asset, dict)
    } != set(expected_assets):
        raise SharedRuntimeError(
            "runtime_recovery_required", "shared runtime asset set mismatch"
        )
    prior_by_name: dict[str, dict[str, Any]] = {}
    if value["operation"] in {"migrate", "repair"}:
        prior_receipt = value.get("prior_receipt")
        if (
            not isinstance(prior_receipt, dict)
            or value.get("prior_receipt_sha256")
            != shared_runtime_receipt_digest(prior_receipt)
            or _receipt_structure_issues(prior_receipt)
        ):
            raise SharedRuntimeError(
                "runtime_recovery_required", "invalid prior shared runtime receipt"
            )
        prior_by_name = {asset["name"]: asset for asset in prior_receipt["assets"]}
    seen: set[str] = set()
    for asset in value["assets"]:
        expected_value = (
            expected_assets.get(asset.get("name")) if isinstance(asset, dict) else None
        )
        if (
            not isinstance(asset, dict)
            or expected_value is None
            or any(asset.get(key) != expected_value[key] for key in expected_value)
            or asset["path"] in seen
        ):
            raise SharedRuntimeError(
                "runtime_recovery_required", "invalid shared runtime asset"
            )
        seen.add(asset["path"])
        if (
            asset["kind"] in {"directory", "file"}
            and re.fullmatch(r"[0-9a-f]{64}", str(asset.get("digest", ""))) is None
        ):
            raise SharedRuntimeError(
                "runtime_recovery_required", "invalid shared runtime digest"
            )
        if asset["kind"] == "file" and (
            type(asset.get("mode")) is not int or not 0 <= asset["mode"] <= 0o777
        ):
            raise SharedRuntimeError(
                "runtime_recovery_required", "invalid shared runtime file mode"
            )
        if (
            value["operation"] in {"migrate", "repair"}
            and asset.get("before_digest") is not None
        ):
            if (
                asset["kind"] not in {"directory", "file"}
                or re.fullmatch(r"[0-9a-f]{64}", str(asset["before_digest"])) is None
                or asset.get("backup")
                != str(
                    Path(asset["path"]).parent
                    / f".{Path(asset['path']).name}.forgewright-prior-{transaction_id}"
                )
                or (
                    asset["kind"] == "file"
                    and (
                        type(asset.get("before_mode")) is not int
                        or not 0 <= asset["before_mode"] <= 0o777
                    )
                )
            ):
                raise SharedRuntimeError(
                    "runtime_recovery_required", "invalid prior shared runtime asset"
                )
        prior = prior_by_name.get(asset["name"])
        if prior is not None:
            prior_missing = asset.get("prior_missing") is True
            if prior_missing:
                if value["operation"] != "repair" or any(
                    key in asset for key in ("before_digest", "before_mode", "backup")
                ):
                    raise SharedRuntimeError(
                        "runtime_recovery_required",
                        "invalid missing prior runtime binding",
                    )
            elif (
                asset.get("before_digest") != prior.get("digest")
                or asset.get("before_mode") != prior.get("mode")
                or not isinstance(asset.get("backup"), str)
            ):
                raise SharedRuntimeError(
                    "runtime_recovery_required",
                    "prior runtime journal binding mismatch",
                )
    return value


def begin_shared_runtime(
    *,
    root: Path,
    home: Path,
    rlg_home: Path,
    progress_path: Path,
    source_commit: str,
    need_rlg: bool,
    need_mcp: bool,
    project_transaction_id: str,
    project_root_digest: str,
    write_json: Callable[[Path, dict[str, Any]], None],
    operation: str = "install",
    prior_receipt: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _validate_source(root, need_mcp=need_mcp)
    _safe_managed_root(home)
    _safe_managed_root(progress_path.parent)
    _safe_managed_root(rlg_home, allow_missing=True)
    token = uuid.uuid4().hex
    value = {
        "schema": ASSET_SCHEMA,
        "transaction_id": token,
        "status": "running",
        "operation": operation,
        "source_root": str(root),
        "source_commit": source_commit,
        "need_rlg": need_rlg,
        "need_mcp": need_mcp,
        "project_transaction_id": project_transaction_id,
        "project_root_digest": project_root_digest,
        "home": str(home),
        "rlg_home": str(rlg_home),
        "stage_root": str(progress_path.parent / f"shared-runtime-stage-{token}"),
        "assets": [],
    }
    if operation not in {"install", "migrate", "repair"}:
        raise SharedRuntimeError(
            "runtime_recovery_required", "invalid shared runtime operation"
        )
    if operation in {"migrate", "repair"}:
        if prior_receipt is None or _receipt_structure_issues(prior_receipt):
            raise SharedRuntimeError(
                "runtime_asset_drift", "prior shared runtime is not exact"
            )
        if operation == "migrate" and verify_shared_runtime(prior_receipt):
            raise SharedRuntimeError(
                "runtime_asset_drift", "prior shared runtime is not exact"
            )
        if operation == "repair":
            for asset in prior_receipt["assets"]:
                path = Path(asset["path"])
                if os.path.lexists(path) and not _asset_matches(asset):
                    raise SharedRuntimeError(
                        "runtime_asset_drift",
                        f"modified shared runtime asset is preserved: {path}",
                    )
        value["prior_receipt"] = prior_receipt
        value["prior_receipt_sha256"] = shared_runtime_receipt_digest(prior_receipt)
    write_json(progress_path, value)
    return value


def install_shared_runtime(
    transaction: dict[str, Any],
    *,
    progress_path: Path,
    runner: Callable[..., dict[str, Any]],
    write_json: Callable[[Path, dict[str, Any]], None],
) -> dict[str, Any]:
    transaction = _validate_progress(transaction, progress_path)
    root = Path(transaction["source_root"])
    home = Path(transaction["home"])
    rlg_home = Path(transaction["rlg_home"])
    operation = transaction["operation"]
    need_rlg = transaction.get("need_rlg") is True
    need_mcp = transaction["need_mcp"]
    _validate_source(root, need_mcp=need_mcp)
    _safe_directory(home, allow_missing=False)
    _safe_directory(rlg_home)
    stage = Path(transaction["stage_root"])
    if os.path.lexists(stage):
        raise SharedRuntimeError(
            "runtime_recovery_required", "shared runtime stage already exists"
        )
    stage.mkdir(mode=0o700)
    _safe_managed_root(stage)
    owner = {
        "schema": ASSET_SCHEMA,
        "transaction_id": transaction["transaction_id"],
    }
    owner_path = stage / OWNER_NAME
    owner_payload = (json.dumps(owner, sort_keys=True) + "\n").encode()
    owner_descriptor = os.open(owner_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(owner_descriptor, "wb") as owner_handle:
        owner_handle.write(owner_payload)
        owner_handle.flush()
        os.fsync(owner_handle.fileno())
    _fsync_directory(stage)

    staged_home = stage / "home"
    staged_home.mkdir()
    assets: list[dict[str, Any]] = []
    if need_rlg:
        staged_rlg = stage / "rlg"
        staged_target = staged_home / ".forgewright/scripts/runtime"
        staged_rlg.mkdir()
        env = _clean_environment(
            staged_home,
            {
                "FORGEWRIGHT_RLG_HOME": str(staged_rlg),
                "FORGEWRIGHT_RLG_TARGET": str(staged_target),
            },
        )
        installer = root / "scripts/runtime/runtime-install.sh"
        _run_checked(
            runner,
            [
                "bash",
                str(installer),
                "--link",
                "--from",
                str(root),
                "--target",
                str(staged_target),
            ],
            cwd=root,
            env=env,
            stage="shared_runtime_rlg_stage",
        )
        _run_checked(
            runner,
            ["bash", str(installer), "--verify", "--quiet"],
            cwd=root,
            env=env,
            stage="shared_runtime_rlg_verify",
            timeout=30,
        )

        final_target = home / ".forgewright/scripts/runtime"
        install_record = staged_rlg / "INSTALLED_FROM"
        try:
            record = json.loads(install_record.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise SharedRuntimeError(
                "runtime_stage_invalid", "invalid staged RLG receipt"
            ) from error
        if (
            record.get("target") != str(staged_target)
            or not isinstance(record.get("files"), list)
            or not record["files"]
        ):
            raise SharedRuntimeError(
                "runtime_stage_invalid", "staged RLG receipt mismatch"
            )
        record["target"] = str(final_target)
        install_record.write_text(
            json.dumps(record, separators=(",", ":")) + "\n", encoding="utf-8"
        )

        assets.append(
            {
                "kind": "directory",
                "name": "rlg_scripts",
                "path": str(final_target),
                "digest": _tree_digest(staged_target),
                "source": str(staged_target),
            }
        )
        rlg_files = (
            ("INSTALLED_FROM",) if operation in {"migrate", "repair"} else RLG_FILES
        )
        for name in rlg_files:
            source = staged_rlg / name
            _safe_regular(source)
            if not source.is_file():
                raise SharedRuntimeError(
                    "runtime_stage_invalid", f"missing staged RLG member: {name}"
                )
            assets.append(
                {
                    "kind": "file",
                    "name": f"rlg:{name}",
                    "path": str(rlg_home / name),
                    "digest": _file_digest(source),
                    "mode": stat.S_IMODE(source.stat().st_mode),
                    "source": str(source),
                }
            )
        for name in () if operation in {"migrate", "repair"} else RLG_DIRECTORIES:
            source = staged_rlg / name
            if not source.is_dir() or source.is_symlink() or any(source.iterdir()):
                raise SharedRuntimeError(
                    "runtime_stage_invalid", f"unsafe staged RLG directory: {name}"
                )
            assets.append(
                {
                    "kind": "empty_directory",
                    "name": f"rlg:{name}",
                    "path": str(rlg_home / name),
                    "source": str(source),
                }
            )

    if need_mcp:
        staged_mcp = stage / "mcp-server"
        staged_skills = stage / "skills"
        staged_lite = stage / "lite"
        staged_mcp.mkdir()
        staged_lite.mkdir()
        for name in ("policy-check.sh", "telemetry.sh"):
            shutil.copy2(root / "scripts/lite" / name, staged_lite / name)
        for name in ("package.json", "package-lock.json", "tsconfig.json"):
            shutil.copy2(root / "mcp" / name, staged_mcp / name)
        shutil.copytree(root / "mcp/src", staged_mcp / "src", symlinks=False)
        shutil.copytree(root / "skills", staged_skills, symlinks=False)
        npm_env = _clean_environment(staged_home)
        _run_checked(
            runner,
            ["npm", "ci", "--silent", "--ignore-scripts", "--no-audit", "--no-fund"],
            cwd=staged_mcp,
            env=npm_env,
            stage="shared_runtime_mcp_dependencies",
            timeout=600,
        )
        _run_checked(
            runner,
            ["npm", "run", "build", "--silent"],
            cwd=staged_mcp,
            env=npm_env,
            stage="shared_runtime_mcp_build",
            timeout=300,
        )
        required = (
            staged_mcp / "src/index.ts",
            staged_mcp / "build/runtime/tool-execution-gateway.js",
            staged_mcp / "node_modules/.bin/tsx",
        )
        if not all(path.is_file() for path in required):
            raise SharedRuntimeError(
                "runtime_stage_invalid", "staged MCP runtime is incomplete"
            )
        owner_path = staged_mcp / OWNER_NAME
        mcp_owner = {
            "schema": ASSET_SCHEMA,
            "transaction_id": transaction["transaction_id"],
            "path": str(home / ".forgewright/mcp-server"),
            "source_root": str(root),
            "source_commit": transaction["source_commit"],
            "lockfile_sha256": _file_digest(staged_mcp / "package-lock.json"),
        }
        owner_path.write_text(
            json.dumps(mcp_owner, sort_keys=True) + "\n", encoding="utf-8"
        )
        _fsync_directory(staged_mcp)
        assets.extend(
            [
                *[
                    {
                        "kind": "file",
                        "name": f"policy_guard:{name}",
                        "path": str(home / ".forgewright/scripts/lite" / name),
                        "digest": _file_digest(staged_lite / name),
                        "mode": stat.S_IMODE((staged_lite / name).stat().st_mode),
                        "source": str(staged_lite / name),
                    }
                    for name in ("policy-check.sh", "telemetry.sh")
                ],
                {
                    "kind": "directory",
                    "name": "source_skills",
                    "path": str(home / ".forgewright/skills"),
                    "digest": _tree_digest(staged_skills),
                    "source": str(staged_skills),
                },
                {
                    "kind": "directory",
                    "name": "mcp_server",
                    "path": str(home / ".forgewright/mcp-server"),
                    "digest": _tree_digest(staged_mcp),
                    "source": str(staged_mcp),
                },
            ]
        )

    prior_by_name = {
        asset["name"]: asset
        for asset in transaction.get("prior_receipt", {}).get("assets", [])
    }
    for asset in assets:
        destination = Path(asset["path"])
        asset["tombstone"] = str(
            destination.parent
            / f".{destination.name}.forgewright-rollback-{transaction['transaction_id']}"
        )
        if asset["kind"] == "file":
            asset["temp_path"] = str(
                destination.parent
                / f".{destination.name}.forgewright-{transaction['transaction_id']}.tmp"
            )
        prior = prior_by_name.get(asset["name"])
        if prior is not None:
            if prior.get("kind") != asset["kind"] or prior.get("path") != asset["path"]:
                raise SharedRuntimeError(
                    "runtime_asset_drift",
                    f"prior shared runtime asset is not exact: {destination}",
                )
            if os.path.lexists(destination):
                if not _asset_matches(prior):
                    raise SharedRuntimeError(
                        "runtime_asset_drift",
                        f"prior shared runtime asset is not exact: {destination}",
                    )
                asset["before_digest"] = prior["digest"]
                if asset["kind"] == "file":
                    asset["before_mode"] = prior["mode"]
                asset["backup"] = str(
                    destination.parent
                    / f".{destination.name}.forgewright-prior-{transaction['transaction_id']}"
                )
            elif operation != "repair":
                raise SharedRuntimeError(
                    "runtime_asset_drift",
                    f"prior shared runtime asset is missing: {destination}",
                )
            else:
                asset["prior_missing"] = True
        for candidate in (
            Path(asset["tombstone"]),
            *([Path(asset["temp_path"])] if asset.get("temp_path") else []),
            *([Path(asset["backup"])] if asset.get("backup") else []),
        ):
            if os.path.lexists(candidate):
                raise SharedRuntimeError(
                    "runtime_asset_conflict", f"preserving existing path: {candidate}"
                )
        if prior is None and os.path.lexists(destination):
            raise SharedRuntimeError(
                "runtime_asset_conflict", f"preserving existing path: {destination}"
            )
    transaction["assets"] = assets
    write_json(progress_path, transaction)
    for asset in assets:
        destination = Path(asset["path"])
        _ensure_directory(destination.parent)
        if asset.get("backup"):
            _rename_no_replace(destination, Path(asset["backup"]))
            asset["prior_moved"] = True
            write_json(progress_path, transaction)
        if asset["kind"] == "directory":
            _publish_directory_no_replace(Path(asset["source"]), destination)
        elif asset["kind"] == "file":
            _publish_file_no_replace(
                Path(asset["source"]), destination, Path(asset["temp_path"])
            )
        elif asset["kind"] == "empty_directory":
            _publish_empty_directory(destination)
        asset["published"] = True
        write_json(progress_path, transaction)

    steady_names = {
        "rlg_scripts",
        "rlg:INSTALLED_FROM",
        "policy_guard:policy-check.sh",
        "policy_guard:telemetry.sh",
        "source_skills",
        "mcp_server",
    }
    receipt = {
        "schema": ASSET_SCHEMA,
        "transaction_id": transaction["transaction_id"],
        "source_root": str(root),
        "source_commit": transaction["source_commit"],
        "rlg": need_rlg,
        "mcp": need_mcp,
        "assets": [
            {
                key: value
                for key, value in asset.items()
                if key
                not in {
                    "source",
                    "published",
                    "temp_path",
                    "tombstone",
                    "before_digest",
                    "before_mode",
                    "backup",
                    "prior_moved",
                    "prior_cleaned",
                    "prior_missing",
                }
            }
            for asset in assets
            if asset["name"] in steady_names
        ],
    }
    transaction["receipt"] = receipt
    if stage.exists():
        shutil.rmtree(stage)
        _fsync_directory(stage.parent)
    if operation in {"migrate", "repair"}:
        transaction["status"] = "committed"
        write_json(progress_path, transaction)
        for asset in assets:
            if asset.get("backup"):
                _cleanup_migration_backup(asset)
                asset["prior_cleaned"] = True
                write_json(progress_path, transaction)
    transaction["status"] = "completed"
    write_json(progress_path, transaction)
    return receipt


def verify_shared_runtime(receipt: Any) -> list[str]:
    structural_issues = _receipt_structure_issues(receipt)
    if structural_issues:
        return structural_issues
    issues: list[str] = []
    for asset in receipt["assets"]:
        if not isinstance(asset, dict) or not _asset_matches(asset):
            name = (
                asset.get("name", "unknown") if isinstance(asset, dict) else "unknown"
            )
            issues.append(f"shared_runtime_asset_missing_or_drift:{name}")
    return issues


def assert_runtime_quiescent(
    *,
    root: Path,
    home: Path,
    rlg_home: Path,
    runner: Callable[..., dict[str, Any]],
) -> None:
    lease_root = home / ".forgewright/runtime/mcp-leases"
    if lease_root.exists():
        _safe_managed_root(lease_root)
        for path in lease_root.iterdir():
            _safe_regular(path)
            if not path.is_file() or path.suffix != ".json":
                raise SharedRuntimeError(
                    "runtime_not_quiescent", f"unrecognized MCP lease state: {path}"
                )
            try:
                lease = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as error:
                raise SharedRuntimeError(
                    "runtime_not_quiescent", f"invalid MCP lease state: {path}"
                ) from error
            if (
                not isinstance(lease, dict)
                or lease.get("schema") != "forgewright-mcp-lifecycle-lease/v1"
                or lease.get("status") != "closed"
            ):
                raise SharedRuntimeError(
                    "runtime_not_quiescent", f"active or untrusted MCP lease: {path}"
                )
    checked = runner(
        [
            "python3",
            str(root / "scripts/runtime/runtime_registry.py"),
            "list",
            "--state",
            "open",
            "--json",
        ],
        cwd=root,
        env=_clean_environment(
            home,
            {"FORGEWRIGHT_RLG_HOME": str(rlg_home)},
        ),
        timeout=30,
        required=False,
        stage="shared_runtime_quiescence",
        inherit_env=False,
    )
    try:
        leases = json.loads(checked.get("stdout", ""))
    except (TypeError, ValueError) as error:
        raise SharedRuntimeError(
            "runtime_not_quiescent", "RLG lease quiescence could not be verified"
        ) from error
    if checked.get("status") != "ready" or not isinstance(leases, list) or leases:
        raise SharedRuntimeError(
            "runtime_not_quiescent", "active or untrusted RLG leases block migration"
        )


def recover_shared_runtime(
    *,
    progress_path: Path,
    expected_project_transaction_id: str | None,
    expected_project_root_digest: str | None,
    expected_home: Path | None,
    expected_rlg_home: Path | None,
    expected_source_root: Path | None,
    expected_prior_receipt_sha256: str | None,
    load_json: Callable[[Path], dict[str, Any] | None],
    write_json: Callable[[Path, dict[str, Any]], None],
) -> list[dict[str, str]] | None:
    raw = load_json(progress_path)
    if raw is None:
        return None
    if isinstance(raw, dict) and raw.get("status") == "completed":
        receipt = raw.get("receipt")
        if _receipt_structure_issues(receipt) or verify_shared_runtime(receipt):
            raise SharedRuntimeError(
                "runtime_recovery_required",
                "completed shared runtime receipt is invalid or drifted",
            )
        return []
    transaction = _validate_progress(raw, progress_path)
    if transaction["status"] == "rolled_back":
        return []
    if (
        expected_home is None
        or expected_rlg_home is None
        or expected_source_root is None
        or transaction["home"] != str(expected_home)
        or transaction["rlg_home"] != str(expected_rlg_home)
        or transaction["source_root"] != str(expected_source_root)
    ):
        raise SharedRuntimeError(
            "runtime_recovery_required",
            "shared runtime roots lack independent recovery authority",
        )
    _safe_managed_root(expected_home)
    _safe_managed_root(progress_path.parent)
    _safe_managed_root(expected_rlg_home, allow_missing=True)
    if transaction["operation"] in {"migrate", "repair"} and (
        expected_prior_receipt_sha256 is None
        or transaction.get("prior_receipt_sha256") != expected_prior_receipt_sha256
    ):
        raise SharedRuntimeError(
            "runtime_recovery_required",
            "prior runtime receipt lacks independent recovery authority",
        )
    if expected_project_transaction_id is not None and (
        transaction.get("project_transaction_id") != expected_project_transaction_id
        or transaction.get("project_root_digest") != expected_project_root_digest
    ):
        raise SharedRuntimeError(
            "runtime_recovery_required", "unbound shared runtime transaction"
        )
    if transaction["status"] == "committed":
        actions: list[dict[str, str]] = []
        for asset in transaction["assets"]:
            if asset.get("backup"):
                actions.append(
                    {
                        "path": asset["backup"],
                        "status": _cleanup_migration_backup(asset),
                    }
                )
                write_json(progress_path, transaction)
        transaction["status"] = "completed"
        write_json(progress_path, transaction)
        return actions
    transaction["status"] = "rolling_back"
    write_json(progress_path, transaction)
    actions: list[dict[str, str]] = []
    for asset in reversed(transaction["assets"]):
        status = (
            _rollback_migrated_asset(asset)
            if asset.get("before_digest") is not None
            else _remove_owned_asset(asset)
        )
        actions.append({"path": asset["path"], "status": status})
        write_json(progress_path, transaction)
    stage = Path(transaction["stage_root"])
    if stage.exists():
        if stage.is_symlink() or not stage.is_dir():
            raise SharedRuntimeError(
                "runtime_recovery_required", "unsafe shared runtime stage"
            )
        owner_path = stage / OWNER_NAME
        if any(stage.iterdir()) and (
            not owner_path.is_file()
            or json.loads(owner_path.read_text(encoding="utf-8"))
            != {"schema": ASSET_SCHEMA, "transaction_id": transaction["transaction_id"]}
        ):
            raise SharedRuntimeError(
                "runtime_recovery_required", "shared runtime stage ownership mismatch"
            )
        shutil.rmtree(stage)
        _fsync_directory(stage.parent)
    transaction["status"] = "rolled_back"
    write_json(progress_path, transaction)
    return actions
