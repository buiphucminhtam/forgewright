#!/usr/bin/env python3
"""Minimal worker and reviewer context packets bound to PLAN_LOCKED state."""

from __future__ import annotations

import hashlib
import json
import math
import re
import subprocess
from copy import deepcopy
from pathlib import Path, PurePosixPath
from typing import Any, Mapping, Sequence

try:
    from .execution_contract import ExecutionContractError, verify_locked_contract
except ImportError:  # pragma: no cover - direct runtime import path
    from runtime.execution_contract import (
        ExecutionContractError,
        verify_locked_contract,
    )

WORKER_PACKET_SCHEMA = "forgewright-worker-packet/v1"
REVIEW_PACKET_SCHEMA = "forgewright-review-package/v1"
REVIEW_SCOPES = ("task", "branch", "release")
CROSS_CUTTING_RISKS = frozenset(
    {
        "public_contract",
        "shared_state",
        "schema",
        "security_boundary",
        "concurrency",
        "migration",
        "release",
    }
)
MAX_LIST_ITEMS = 64
MAX_TEXT_CHARS = 4096
MAX_DIFF_BYTES = 512 * 1024
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


class ContextPacketError(ValueError):
    """Raised when a context packet is unsafe, stale, or too broad."""


def _canonical(value: Mapping[str, Any]) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _digest(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _id(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _SAFE_ID_RE.fullmatch(value):
        raise ContextPacketError(f"{field} must be a safe non-empty identifier")
    return value


def _sha(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _SHA_RE.fullmatch(value):
        raise ContextPacketError(f"{field} must be a full lowercase Git SHA-1")
    return value


def _text(value: Any, field: str, *, maximum: int = MAX_TEXT_CHARS) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContextPacketError(f"{field} must be a non-empty string")
    value = value.strip()
    if len(value) > maximum:
        raise ContextPacketError(f"{field} exceeds {maximum} characters")
    return value


def _list(value: Any, field: str, *, allow_empty: bool = True) -> list[str]:
    if not isinstance(value, list) or len(value) > MAX_LIST_ITEMS:
        raise ContextPacketError(
            f"{field} must contain at most {MAX_LIST_ITEMS} strings"
        )
    result: list[str] = []
    seen: set[str] = set()
    for index, item in enumerate(value):
        item = _text(item, f"{field}[{index}]", maximum=1024)
        if item in seen:
            raise ContextPacketError(f"{field} must not contain duplicates")
        seen.add(item)
        result.append(item)
    if not allow_empty and not result:
        raise ContextPacketError(f"{field} must not be empty")
    return result


def _repo_path(value: str, field: str) -> str:
    if "\\" in value:
        raise ContextPacketError(f"{field} must use repository-relative POSIX paths")
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or not path.parts
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise ContextPacketError(f"{field} must be a safe repository-relative path")
    return str(path)


def _paths(value: Any, field: str, *, allow_empty: bool = True) -> list[str]:
    return [
        _repo_path(item, f"{field}[{index}]")
        for index, item in enumerate(_list(value, field, allow_empty=allow_empty))
    ]


def _skill(value: Any) -> dict[str, str] | None:
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {"name", "path"}:
        raise ContextPacketError("skill must contain exactly name and path")
    name = _id(value["name"], "skill.name")
    path = _repo_path(_text(value["path"], "skill.path", maximum=256), "skill.path")
    expected = {f"skills/{name}/SKILL.md", f"skills/{name}/LITE.md"}
    if path not in expected:
        raise ContextPacketError(f"skill.path must be one of {sorted(expected)}")
    return {"name": name, "path": path}


def compile_worker_packet(
    *,
    goal_id: str,
    task_id: str,
    scope_id: str,
    base_sha: str,
    execution_contract: Mapping[str, Any],
    paths: Sequence[str],
    skill: Mapping[str, Any] | None = None,
    interfaces: Sequence[str] = (),
    decisions: Sequence[str] = (),
    verifier_refs: Sequence[str] = (),
    constraints: Sequence[str] = (),
    specialist_checks: Sequence[str] = (),
) -> dict[str, Any]:
    try:
        contract = verify_locked_contract(dict(execution_contract))
    except ExecutionContractError as error:
        raise ContextPacketError(str(error)) from error
    goal_id = _id(goal_id, "goal_id")
    task_id = _id(task_id, "task_id")
    scope_id = _id(scope_id, "scope_id")
    base_sha = _sha(base_sha, "base_sha")
    if scope_id not in contract["scope_ids"]:
        raise ContextPacketError("scope_id is not bound by PLAN_LOCKED")
    scope_paths = _paths(list(paths), "paths", allow_empty=False)
    core = {
        "schema": WORKER_PACKET_SCHEMA,
        "binding": {
            "goal_id": goal_id,
            "plan_digest": contract["digest"],
            "task_id": task_id,
            "scope_id": scope_id,
            "base_sha": base_sha,
        },
        "objective": contract["objective"],
        "acceptance": deepcopy(contract["acceptance_criteria"]),
        "out_of_scope": deepcopy(contract["out_of_scope"]),
        "scope": {"id": scope_id, "paths": scope_paths},
        "skill": _skill(dict(skill) if skill is not None else None),
        "interfaces": _list(list(interfaces), "interfaces"),
        "decisions": _list(list(decisions), "decisions"),
        "verifier_refs": _paths(list(verifier_refs), "verifier_refs"),
        "constraints": _list(list(constraints), "constraints"),
        "specialist_checks": _list(list(specialist_checks), "specialist_checks"),
    }
    context_bytes = len(_canonical(core))
    result = {
        **core,
        "stats": {
            "context_bytes": context_bytes,
            "estimated_tokens": math.ceil(context_bytes / 4),
        },
    }
    return {**result, "digest": _digest(result)}


def worker_dispatch_view(packet: Mapping[str, Any]) -> dict[str, Any]:
    """Return the exact worker-visible packet with parent accounting removed."""
    if not isinstance(packet, Mapping) or packet.get("schema") != WORKER_PACKET_SCHEMA:
        raise ContextPacketError("worker packet schema mismatch")
    core = {
        key: deepcopy(value)
        for key, value in packet.items()
        if key not in {"stats", "digest"}
    }
    return {**core, "digest": _digest(core)}


def verify_worker_packet(
    packet: Mapping[str, Any],
    *,
    goal_id: str,
    plan_digest: str,
    task_id: str,
    base_sha: str,
) -> dict[str, Any]:
    if not isinstance(packet, Mapping) or packet.get("schema") != WORKER_PACKET_SCHEMA:
        raise ContextPacketError("worker packet schema mismatch")
    digest = packet.get("digest")
    if not isinstance(digest, str) or not _DIGEST_RE.fullmatch(digest):
        raise ContextPacketError("worker packet digest is malformed")
    core = {key: deepcopy(value) for key, value in packet.items() if key != "digest"}
    if _digest(core) != digest:
        raise ContextPacketError("worker packet digest mismatch")
    expected = {
        "goal_id": _id(goal_id, "goal_id"),
        "plan_digest": plan_digest,
        "task_id": _id(task_id, "task_id"),
        "base_sha": _sha(base_sha, "base_sha"),
    }
    if not _DIGEST_RE.fullmatch(plan_digest):
        raise ContextPacketError("plan_digest must be lowercase SHA-256")
    binding = packet.get("binding")
    if not isinstance(binding, Mapping):
        raise ContextPacketError("worker packet binding missing")
    for field, value in expected.items():
        if binding.get(field) != value:
            raise ContextPacketError(f"stale worker packet binding: {field}")
    return dict(packet)


def _git(root: Path, args: Sequence[str], *, maximum: int = MAX_DIFF_BYTES) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=root,
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )
    if result.returncode != 0:
        raise ContextPacketError(
            f"git {' '.join(args[:3])} failed: {result.stderr[-1000:].strip()}"
        )
    encoded = result.stdout.encode("utf-8")
    if len(encoded) > maximum:
        raise ContextPacketError(
            f"review material exceeds {maximum} bytes; store it as a separately verified artifact"
        )
    return result.stdout


def _commit_exists(root: Path, sha: str) -> None:
    result = subprocess.run(
        ["git", "cat-file", "-e", f"{sha}^{{commit}}"],
        cwd=root,
        capture_output=True,
        timeout=5,
        check=False,
    )
    if result.returncode != 0:
        raise ContextPacketError(f"unknown Git commit: {sha}")


def resolve_review_scope(
    requested: str,
    *,
    planned_final: bool,
    cross_cutting_risks: Sequence[str],
) -> dict[str, Any]:
    if requested not in REVIEW_SCOPES:
        raise ContextPacketError(f"review_scope must be one of {REVIEW_SCOPES}")
    risks = _list(list(cross_cutting_risks), "cross_cutting_risks")
    unknown = sorted(set(risks) - CROSS_CUTTING_RISKS)
    if unknown:
        raise ContextPacketError(f"unknown cross-cutting review risk(s): {unknown}")
    if requested == "task":
        reason = "bounded_task"
    elif planned_final:
        reason = "planned_final_review"
    elif risks:
        reason = "cross_cutting_risk:" + ",".join(sorted(risks))
    else:
        raise ContextPacketError(
            f"widening review scope to {requested} requires planned_final=true "
            "or a named cross-cutting risk"
        )
    return {"scope": requested, "reason": reason, "cross_cutting_risks": risks}


def compile_review_package(
    root: Path,
    *,
    base_sha: str,
    head_sha: str,
    review_scope: str,
    planned_final: bool = False,
    cross_cutting_risks: Sequence[str] = (),
    task_paths: Sequence[str] = (),
    goal_id: str | None = None,
    plan_digest: str | None = None,
    acceptance: Sequence[str] = (),
    verification_refs: Sequence[str] = (),
) -> dict[str, Any]:
    root = root.resolve()
    base_sha = _sha(base_sha, "base_sha")
    head_sha = _sha(head_sha, "head_sha")
    _commit_exists(root, base_sha)
    _commit_exists(root, head_sha)
    ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", base_sha, head_sha],
        cwd=root,
        capture_output=True,
        timeout=5,
        check=False,
    )
    if ancestor.returncode != 0:
        raise ContextPacketError("base_sha must be an ancestor of head_sha")
    scope = resolve_review_scope(
        review_scope,
        planned_final=planned_final,
        cross_cutting_risks=cross_cutting_risks,
    )
    paths = _paths(list(task_paths), "task_paths")
    if review_scope == "task" and not paths:
        raise ContextPacketError("task review requires explicit task_paths")
    path_args = ["--", *paths] if review_scope == "task" else []
    range_ = f"{base_sha}..{head_sha}"
    changed_paths = [
        line
        for line in _git(
            root, ["diff", "--name-only", "--no-ext-diff", range_, *path_args]
        ).splitlines()
        if line
    ]
    commits = [
        line
        for line in _git(
            root,
            ["log", "--format=%H%x09%s", range_],
            maximum=128 * 1024,
        ).splitlines()
        if line
    ]
    diff_stat = _git(
        root,
        ["diff", "--stat", "--no-ext-diff", range_, *path_args],
        maximum=128 * 1024,
    )
    diff = _git(root, ["diff", "--no-ext-diff", "--no-color", range_, *path_args])
    binding: dict[str, Any] = {"base_sha": base_sha, "head_sha": head_sha}
    if goal_id is not None:
        binding["goal_id"] = _id(goal_id, "goal_id")
    if plan_digest is not None:
        if not isinstance(plan_digest, str) or not _DIGEST_RE.fullmatch(plan_digest):
            raise ContextPacketError("plan_digest must be lowercase SHA-256")
        binding["plan_digest"] = plan_digest
    core = {
        "schema": REVIEW_PACKET_SCHEMA,
        "scope": scope,
        "binding": binding,
        "acceptance": _list(list(acceptance), "acceptance"),
        "verification_refs": _paths(list(verification_refs), "verification_refs"),
        "changed_paths": changed_paths,
        "commits": commits,
        "diff_stat": diff_stat,
        "diff": diff,
    }
    packet_bytes = len(_canonical(core))
    result = {
        **core,
        "stats": {
            "package_bytes": packet_bytes,
            "estimated_tokens": math.ceil(packet_bytes / 4),
            "changed_path_count": len(changed_paths),
            "commit_count": len(commits),
        },
    }
    return {**result, "digest": _digest(result)}
