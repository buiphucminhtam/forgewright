#!/usr/bin/env python3
"""Minimal worker and reviewer context packets bound to PLAN_LOCKED state."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import stat
import subprocess
import sys
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
    # Task paths are repository-relative names, never Git pathspec expressions.
    # `--literal-pathspecs` is a global Git option and must precede the subcommand.
    # Apply it consistently to every path-scoped view so a task path such as
    # `:(top)**`, `:(glob)**`, `*.py`, or `:(exclude)foo` cannot silently widen
    # a bounded task review.
    literal_prefix = ["--literal-pathspecs"] if review_scope == "task" else []
    changed_paths = [
        line
        for line in _git(
            root,
            [
                *literal_prefix,
                "diff",
                "--name-only",
                "--no-ext-diff",
                range_,
                *path_args,
            ],
        ).splitlines()
        if line
    ]
    commits = [
        line
        for line in _git(
            root,
            [
                *literal_prefix,
                "log",
                "--format=%H%x09%s",
                range_,
                *path_args,
            ],
            maximum=128 * 1024,
        ).splitlines()
        if line
    ]
    diff_stat = _git(
        root,
        [*literal_prefix, "diff", "--stat", "--no-ext-diff", range_, *path_args],
        maximum=128 * 1024,
    )
    diff = _git(
        root,
        [*literal_prefix, "diff", "--no-ext-diff", "--no-color", range_, *path_args],
    )
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


# ─── Supplemental Missing-Context Protocol (E3) ───────────────────

SUPPLEMENTAL_REQUEST_SCHEMA = "forgewright-supplemental-context-request/v1"
SUPPLEMENTAL_RESPONSE_SCHEMA = "forgewright-supplemental-context-response/v1"
MAX_RETRIEVAL_ROUNDS = 3
MAX_SUPPLEMENTAL_ROUNDS = MAX_RETRIEVAL_ROUNDS
MAX_SUPPLEMENTAL_FACTS = 8
MAX_SUPPLEMENTAL_BYTES = 64 * 1024  # 64 KiB aggregate budget
MAX_EXCERPT_CHARS = 16 * 1024
ALLOWED_FACT_KINDS = frozenset({"code", "contract", "test", "decision", "verifier"})


def create_supplemental_request(
    *,
    goal_id: str,
    plan_digest: str,
    task_id: str,
    scope_id: str,
    base_sha: str,
    round_index: int,
    missing_facts: Sequence[Mapping[str, Any]],
    current_revision: str | None = None,
) -> dict[str, Any]:
    if type(round_index) is not int or round_index < 1:
        raise ContextPacketError("round_index must be a positive integer")
    if round_index > MAX_RETRIEVAL_ROUNDS:
        raise ContextPacketError(
            f"retrieval round exceeds maximum allowed ({MAX_RETRIEVAL_ROUNDS})"
        )

    goal_id = _id(goal_id, "goal_id")
    task_id = _id(task_id, "task_id")
    scope_id = _id(scope_id, "scope_id")
    base_sha = _sha(base_sha, "base_sha")
    if not isinstance(plan_digest, str) or not _DIGEST_RE.fullmatch(plan_digest):
        raise ContextPacketError("plan_digest must be lowercase SHA-256")

    binding: dict[str, Any] = {
        "goal_id": goal_id,
        "plan_digest": plan_digest,
        "task_id": task_id,
        "scope_id": scope_id,
        "base_sha": base_sha,
    }
    if current_revision is not None:
        binding["current_revision"] = _sha(current_revision, "current_revision")

    if not isinstance(missing_facts, (list, tuple)) or not missing_facts:
        raise ContextPacketError("missing_facts must be a non-empty sequence")
    if len(missing_facts) > MAX_SUPPLEMENTAL_FACTS:
        raise ContextPacketError(
            f"missing_facts exceeds {MAX_SUPPLEMENTAL_FACTS} items"
        )

    validated_facts: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, fact in enumerate(missing_facts):
        if not isinstance(fact, Mapping):
            raise ContextPacketError(f"missing_facts[{index}] must be a mapping")
        allowed_keys = {"fact_id", "kind", "target_path", "reason", "mandatory"}
        unknown = set(fact) - allowed_keys
        if unknown:
            raise ContextPacketError(
                f"missing_facts[{index}] has unknown key(s): {sorted(unknown)}"
            )
        fact_id = _id(fact.get("fact_id"), f"missing_facts[{index}].fact_id")
        if fact_id in seen_ids:
            raise ContextPacketError(f"duplicate fact_id: {fact_id}")
        seen_ids.add(fact_id)

        kind = fact.get("kind")
        if kind not in ALLOWED_FACT_KINDS:
            raise ContextPacketError(
                f"missing_facts[{index}].kind must be one of {sorted(ALLOWED_FACT_KINDS)}"
            )

        target_path = _repo_path(
            _text(
                fact.get("target_path"),
                f"missing_facts[{index}].target_path",
                maximum=1024,
            ),
            f"missing_facts[{index}].target_path",
        )
        reason = _text(
            fact.get("reason"), f"missing_facts[{index}].reason", maximum=256
        )
        mandatory = fact.get("mandatory", True)
        if type(mandatory) is not bool:
            raise ContextPacketError("mandatory must be a boolean")

        validated_facts.append(
            {
                "fact_id": fact_id,
                "kind": kind,
                "target_path": target_path,
                "reason": reason,
                "mandatory": mandatory,
            }
        )

    core = {
        "schema": SUPPLEMENTAL_REQUEST_SCHEMA,
        "binding": binding,
        "round_index": round_index,
        "missing_facts": validated_facts,
    }
    return {**core, "digest": _digest(core)}


def capture_context_snapshot(root: Path) -> dict[str, str]:
    """Capture trusted physical workspace and exact current source state, not request data."""
    root = root.resolve(strict=True)
    try:
        from scripts.lite.evidence_common import worktree_fingerprint
    except ImportError:
        try:
            from lite.evidence_common import worktree_fingerprint
        except ImportError as error:
            raise ContextPacketError(
                "context fingerprint verifier unavailable"
            ) from error

    def head() -> str:
        try:
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as error:
            raise ContextPacketError("current revision unavailable") from error
        if result.returncode != 0 or not _SHA_RE.fullmatch(result.stdout.strip()):
            raise ContextPacketError("current revision unavailable")
        return result.stdout.strip()

    before = head()
    tree = worktree_fingerprint(root)
    if head() != before:
        raise ContextPacketError("revision changed during context snapshot")
    return {
        "workspace_sha256": hashlib.sha256(str(root).encode("utf-8")).hexdigest(),
        "head_sha": before,
        "tree_fingerprint": tree,
    }


def verify_context_snapshot(packet: Mapping[str, Any], root: Path) -> None:
    """A supplemental packet cannot authorize dispatch using stale or unbound context."""
    recorded = packet.get("runtime_context_binding")
    if not isinstance(recorded, Mapping) or set(recorded) != {
        "workspace_sha256",
        "head_sha",
        "tree_fingerprint",
    }:
        raise ContextPacketError(
            "supplemental runtime context binding missing or malformed"
        )
    if dict(recorded) != capture_context_snapshot(root):
        raise ContextPacketError("supplemental context workspace or source changed")
    if packet.get("binding", {}).get("base_sha") != recorded["head_sha"]:
        raise ContextPacketError("supplemental context base revision mismatch")
    core = {key: deepcopy(value) for key, value in packet.items() if key != "digest"}
    if packet.get("digest") != _digest(core):
        raise ContextPacketError("supplemental worker packet digest mismatch")


def _safe_read_regular_file(
    root: Path,
    target: str,
    allowed_norm: Sequence[str],
    read_limit: int,
) -> tuple[str, str, dict[str, Any], bytes]:
    """Read regular file within allowed scopes safely on supported platforms using descriptor pinning."""
    if sys.platform not in ("darwin", "linux"):
        raise ContextPacketError(
            f"unsupported platform: {sys.platform} (supported: darwin, linux)"
        )

    in_scope = any(
        target == allowed or target.startswith(allowed + "/")
        for allowed in allowed_norm
    )
    if not in_scope:
        return ("inaccessible", "outside_authorized_scope", {"path": target}, b"")

    file_path = root / target
    try:
        real_file = file_path.resolve()
        if (real_file != root and root not in real_file.parents) or not any(
            real_file == root / scope or root / scope in real_file.parents
            for scope in allowed_norm
        ):
            return ("inaccessible", "symlink_escape_denied", {"path": target}, b"")
    except (OSError, RuntimeError):
        return ("inaccessible", "path_resolution_failed", {"path": target}, b"")

    if not file_path.exists():
        return ("no_match", "file_not_found", {"path": target}, b"")

    parts = target.strip("/").split("/")
    open_fds = []
    try:
        if not hasattr(os, "O_DIRECTORY") or not hasattr(os, "O_NOFOLLOW"):
            raise ContextPacketError("secure descriptor reads unavailable")
        curr_fd = os.open(str(root), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        open_fds.append(curr_fd)
        for part in parts[:-1]:
            next_fd = os.open(
                part,
                os.O_RDONLY
                | getattr(os, "O_DIRECTORY", 0)
                | getattr(os, "O_NOFOLLOW", 0),
                dir_fd=curr_fd,
            )
            open_fds.append(next_fd)
            st = os.fstat(next_fd)
            if not stat.S_ISDIR(st.st_mode):
                return ("inaccessible", "read_error", {"path": target}, b"")
            curr_fd = next_fd

        leaf = parts[-1]
        file_fd = os.open(
            leaf,
            os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0),
            dir_fd=curr_fd,
        )
        open_fds.append(file_fd)
        st = os.fstat(file_fd)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
            return ("inaccessible", "read_error", {"path": target}, b"")
        chunks: list[bytes] = []
        remaining = read_limit + 1
        while remaining:
            chunk = os.read(file_fd, min(remaining, 16 * 1024))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        content_bytes = b"".join(chunks)
        st2 = os.fstat(file_fd)
        if (st.st_ino, st.st_dev, st.st_size, st.st_mtime_ns, st.st_ctime_ns) != (
            st2.st_ino,
            st2.st_dev,
            st2.st_size,
            st2.st_mtime_ns,
            st2.st_ctime_ns,
        ):
            return ("inaccessible", "read_error", {"path": target}, b"")
        return ("ok", "", {"path": target}, content_bytes)
    except OSError as err:
        if getattr(err, "errno", None) in (62, 40):  # ELOOP
            return ("inaccessible", "symlink_escape_denied", {"path": target}, b"")
        return ("inaccessible", "read_error", {"path": target}, b"")
    finally:
        for fd in reversed(open_fds):
            try:
                os.close(fd)
            except OSError:
                pass


def _validate_request_semantics(request: Mapping[str, Any]) -> dict[str, Any]:
    """Unified strict inbound request validator for both stateless and session ingress."""
    if (
        not isinstance(request, Mapping)
        or request.get("schema") != SUPPLEMENTAL_REQUEST_SCHEMA
    ):
        raise ContextPacketError("request schema mismatch")

    digest = request.get("digest")
    if not isinstance(digest, str) or not _DIGEST_RE.fullmatch(digest):
        raise ContextPacketError("malformed request digest")
    core = {k: deepcopy(v) for k, v in request.items() if k != "digest"}
    if _digest(core) != digest:
        raise ContextPacketError("request digest mismatch")

    # A matching digest is not semantic validation or authorization.
    if set(request) != {"schema", "binding", "round_index", "missing_facts", "digest"}:
        raise ContextPacketError("request has unknown or missing fields")
    binding = request.get("binding")
    if not isinstance(binding, Mapping):
        raise ContextPacketError("request binding must be a mapping")
    round_index = request.get("round_index")
    if (
        type(round_index) is not int
        or isinstance(round_index, bool)
        or round_index <= 0
    ):
        raise ContextPacketError("round_index must be a positive integer")
    if round_index > MAX_SUPPLEMENTAL_ROUNDS:
        raise ContextPacketError("round_index exceeds maximum allowed rounds")
    try:
        normalized = create_supplemental_request(
            **dict(binding),
            round_index=round_index,
            missing_facts=request.get("missing_facts"),
        )
    except (TypeError, KeyError) as error:
        raise ContextPacketError("request fields are invalid") from error
    if normalized != request:
        raise ContextPacketError("request fields are not canonical")
    return normalized


def retrieve_supplemental_context(
    root: Path,
    request: Mapping[str, Any],
    *,
    allowed_scope_paths: Sequence[str],
    cumulative_bytes: int = 0,
    byte_budget: int = MAX_SUPPLEMENTAL_BYTES,
    already_retrieved_paths: Sequence[str] = (),
) -> dict[str, Any]:
    normalized = _validate_request_semantics(request)
    round_index = normalized["round_index"]
    binding = normalized["binding"]

    if (
        type(cumulative_bytes) is not int
        or isinstance(cumulative_bytes, bool)
        or cumulative_bytes < 0
    ):
        raise ContextPacketError("cumulative_bytes must be a nonnegative integer")
    if (
        type(byte_budget) is not int
        or isinstance(byte_budget, bool)
        or not 0 <= byte_budget <= MAX_SUPPLEMENTAL_BYTES
    ):
        raise ContextPacketError("byte_budget exceeds the allowed range")
    if cumulative_bytes > byte_budget:
        raise ContextPacketError("cumulative_bytes exceeds the allowed budget")
    root = root.resolve()
    if binding.get("current_revision") is not None:
        try:
            revision = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as error:
            raise ContextPacketError("current revision unavailable") from error
        if (
            revision.returncode != 0
            or revision.stdout.strip() != binding["current_revision"]
        ):
            raise ContextPacketError("current revision mismatch or unavailable")
    allowed_norm = _paths(
        list(allowed_scope_paths), "allowed_scope_paths", allow_empty=False
    )
    already_retrieved_paths = _paths(
        list(already_retrieved_paths), "already_retrieved_paths"
    )

    seen_paths = set(already_retrieved_paths)
    current_consumed = 0
    excerpts: list[dict[str, Any]] = []
    has_unresolved_mandatory = False

    for fact in request["missing_facts"]:
        fact_id = fact["fact_id"]
        target = fact["target_path"]
        mandatory = fact["mandatory"]

        # Deduplication check: cannot claim a repeated path was provided if content is absent
        if target in seen_paths:
            file_path = root / target
            if not file_path.exists() or not file_path.is_file():
                excerpts.append(
                    {
                        "fact_id": fact_id,
                        "status": "no_match",
                        "reason": "file_not_found",
                        "provenance": {"path": target},
                        "content": "",
                    }
                )
                if mandatory:
                    has_unresolved_mandatory = True
                continue
            excerpts.append(
                {
                    "fact_id": fact_id,
                    "status": "complete",
                    "reason": "deduplicated_already_present",
                    "provenance": {"path": target},
                    "content": "",
                }
            )
            continue

        read_limit = min(
            MAX_EXCERPT_CHARS, byte_budget - cumulative_bytes - current_consumed
        )
        status, reason, prov, content_bytes = _safe_read_regular_file(
            root, target, allowed_norm, read_limit
        )

        if status != "ok":
            excerpts.append(
                {
                    "fact_id": fact_id,
                    "status": status,
                    "reason": reason,
                    "provenance": prov,
                    "content": "",
                }
            )
            if mandatory:
                has_unresolved_mandatory = True
            continue

        # Check byte budget
        remaining_budget = byte_budget - (cumulative_bytes + current_consumed)
        if (
            len(content_bytes) > remaining_budget
            or len(content_bytes) > MAX_EXCERPT_CHARS
        ):
            excerpts.append(
                {
                    "fact_id": fact_id,
                    "status": "insufficient",
                    "reason": "budget_exceeded",
                    "provenance": {"path": target, "total_bytes": len(content_bytes)},
                    "content": "",
                }
            )
            if mandatory:
                has_unresolved_mandatory = True
            continue

        # Strict UTF-8 decode: reject malformed text rather than replacement character expansion
        try:
            content_str = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            excerpts.append(
                {
                    "fact_id": fact_id,
                    "status": "inaccessible",
                    "reason": "malformed_utf8_encoding",
                    "provenance": {"path": target},
                    "content": "",
                }
            )
            if mandatory:
                has_unresolved_mandatory = True
            continue

        content_sha = hashlib.sha256(content_bytes).hexdigest()
        current_consumed += len(content_bytes)
        seen_paths.add(target)

        excerpts.append(
            {
                "fact_id": fact_id,
                "status": "complete",
                "provenance": {
                    "path": target,
                    "sha256": content_sha,
                    "byte_count": len(content_bytes),
                },
                "as_data_only": True,
                "content": content_str,
            }
        )

    total_cumulative = cumulative_bytes + current_consumed
    is_blocked = has_unresolved_mandatory or total_cumulative > byte_budget
    status = "BLOCKED_CONTEXT" if is_blocked else "READY"

    response_core = {
        "schema": SUPPLEMENTAL_RESPONSE_SCHEMA,
        "binding": deepcopy(request["binding"]),
        "round_index": round_index,
        "status": status,
        "stats": {
            "cumulative_bytes": total_cumulative,
            "byte_budget": byte_budget,
            "remaining_bytes": max(0, byte_budget - total_cumulative),
            "estimated_tokens": math.ceil(total_cumulative / 4),
        },
        "excerpts": excerpts,
    }
    return {**response_core, "digest": _digest(response_core)}


def attach_supplemental_context(
    packet: Mapping[str, Any],
    response: Mapping[str, Any],
) -> dict[str, Any]:
    if not isinstance(packet, Mapping) or packet.get("schema") != WORKER_PACKET_SCHEMA:
        raise ContextPacketError("packet schema mismatch")
    if (
        not isinstance(response, Mapping)
        or response.get("schema") != SUPPLEMENTAL_RESPONSE_SCHEMA
    ):
        raise ContextPacketError("response schema mismatch")

    # Verify bindings match
    p_bind = packet.get("binding", {})
    r_bind = response.get("binding", {})
    for k in ("goal_id", "plan_digest", "task_id", "scope_id", "base_sha"):
        if p_bind.get(k) != r_bind.get(k):
            raise ContextPacketError(f"binding mismatch on {k}")

    res_digest = response.get("digest")
    if not isinstance(res_digest, str) or not _DIGEST_RE.fullmatch(res_digest):
        raise ContextPacketError("malformed response digest")
    core = {k: deepcopy(v) for k, v in response.items() if k != "digest"}
    if _digest(core) != res_digest:
        raise ContextPacketError("response digest mismatch")

    # Validate response semantics
    status = response.get("status")
    if status not in ("READY", "BLOCKED_CONTEXT"):
        raise ContextPacketError(f"invalid response status: {status}")

    round_index = response.get("round_index")
    if (
        type(round_index) is not int
        or isinstance(round_index, bool)
        or not 1 <= round_index <= MAX_SUPPLEMENTAL_ROUNDS
    ):
        raise ContextPacketError("response round_index out of bounds")

    stats = response.get("stats")
    stat_keys = {
        "cumulative_bytes",
        "byte_budget",
        "remaining_bytes",
        "estimated_tokens",
    }
    if not isinstance(stats, Mapping) or set(stats) != stat_keys:
        raise ContextPacketError(
            "response stats must contain the exact accounting fields"
        )
    if any(type(stats[key]) is not int or stats[key] < 0 for key in stat_keys):
        raise ContextPacketError("response accounting must use nonnegative integers")
    if not stats["cumulative_bytes"] <= stats["byte_budget"] <= MAX_SUPPLEMENTAL_BYTES:
        raise ContextPacketError("response cumulative byte budget exceeded")
    if stats["remaining_bytes"] != stats["byte_budget"] - stats[
        "cumulative_bytes"
    ] or stats["estimated_tokens"] != math.ceil(stats["cumulative_bytes"] / 4):
        raise ContextPacketError("response accounting fields disagree")

    # Validate each delivered excerpt content against its provenance hash/bytes
    excerpts = response.get("excerpts", [])
    if (
        not isinstance(excerpts, (list, tuple))
        or len(excerpts) > MAX_SUPPLEMENTAL_FACTS * MAX_SUPPLEMENTAL_ROUNDS
    ):
        raise ContextPacketError("response excerpts must be a bounded sequence")
    delivered_bytes = 0
    allowed_paths = packet.get("scope", {}).get("paths", [])
    for index, excerpt in enumerate(excerpts):
        if not isinstance(excerpt, Mapping):
            raise ContextPacketError(f"response excerpt[{index}] must be a mapping")
        if excerpt.get("status") == "complete":
            prov = excerpt.get("provenance")
            if not isinstance(prov, Mapping):
                raise ContextPacketError(
                    f"complete excerpt[{index}] missing provenance mapping"
                )
            content_val = excerpt.get("content", "")
            if not isinstance(content_val, str):
                raise ContextPacketError(
                    f"complete excerpt[{index}] content must be a string"
                )
            content_bytes = content_val.encode("utf-8")
            if hashlib.sha256(content_bytes).hexdigest() != prov.get("sha256"):
                raise ContextPacketError(
                    f"excerpt[{index}] content does not match provenance sha256"
                )
            if (
                type(prov.get("byte_count")) is not int
                or len(content_bytes) != prov["byte_count"]
            ):
                raise ContextPacketError(
                    f"excerpt[{index}] content length does not match provenance byte_count"
                )
            if len(content_bytes) > MAX_EXCERPT_CHARS:
                raise ContextPacketError("excerpt exceeds its byte limit")
            path = _repo_path(
                _text(prov.get("path"), "excerpt.path", maximum=1024), "excerpt.path"
            )
            if not any(
                path == allowed or path.startswith(allowed + "/")
                for allowed in allowed_paths
            ):
                raise ContextPacketError("excerpt is outside the worker read scope")
            if excerpt.get("as_data_only") is not True:
                raise ContextPacketError(
                    f"complete excerpt[{index}] must have as_data_only: True"
                )
            delivered_bytes += len(content_bytes)
        elif (
            excerpt.get("status") not in {"no_match", "inaccessible", "insufficient"}
            or excerpt.get("content", "") != ""
        ):
            raise ContextPacketError("non-complete excerpt cannot carry usable content")
    if delivered_bytes > stats["cumulative_bytes"]:
        raise ContextPacketError("delivered context exceeds accounted cumulative bytes")

    result = deepcopy(dict(packet))
    result["supplemental_context"] = deepcopy(response)
    if response["status"] == "BLOCKED_CONTEXT":
        result["blocked"] = True
        result["status"] = "BLOCKED_CONTEXT"
    else:
        result["blocked"] = False
        result["status"] = "READY"

    if "stats" in result:
        res_bytes = response.get("stats", {}).get("cumulative_bytes", 0)
        result["stats"]["supplemental_bytes"] = res_bytes
        result["stats"]["total_bytes"] = result["stats"]["context_bytes"] + res_bytes
        result["stats"]["estimated_tokens"] = math.ceil(
            result["stats"]["total_bytes"] / 4
        )

    return {
        **result,
        "digest": _digest({k: v for k, v in result.items() if k != "digest"}),
    }


class ParentRetrievalSession:
    """Parent-owned multi-round retrieval session bound to workspace identity.

    Tracks round, cumulative UTF8 bytes, prior delivered excerpts/provenance,
    and immutable missing-fact requirements across requests. Rejects request reset or replay.
    """

    def __init__(
        self,
        workspace: Path,
        *,
        goal_id: str,
        task_id: str,
        scope_id: str,
        plan_digest: str,
        base_sha: str,
        allowed_scope_paths: Sequence[str],
        current_revision: str | None = None,
        tree_fingerprint: str | None = None,
        byte_budget: int = MAX_SUPPLEMENTAL_BYTES,
        max_rounds: int = MAX_SUPPLEMENTAL_ROUNDS,
    ) -> None:
        self.workspace = Path(workspace).resolve()
        self.goal_id = _id(goal_id, "goal_id")
        self.task_id = _id(task_id, "task_id")
        self.scope_id = _id(scope_id, "scope_id")
        if not isinstance(plan_digest, str) or not _DIGEST_RE.fullmatch(plan_digest):
            raise ContextPacketError("plan_digest must be lowercase SHA-256")
        self.plan_digest = plan_digest
        self.base_sha = _sha(base_sha, "base_sha")
        self.current_revision = current_revision
        self.tree_fingerprint = tree_fingerprint
        self.allowed_scope_paths = _paths(
            list(allowed_scope_paths), "allowed_scope_paths", allow_empty=False
        )
        if (
            type(byte_budget) is not int
            or isinstance(byte_budget, bool)
            or not 0 <= byte_budget <= MAX_SUPPLEMENTAL_BYTES
        ):
            raise ContextPacketError("byte_budget out of range")
        self.byte_budget = byte_budget
        if (
            type(max_rounds) is not int
            or isinstance(max_rounds, bool)
            or not 1 <= max_rounds <= MAX_SUPPLEMENTAL_ROUNDS
        ):
            raise ContextPacketError("max_rounds out of range")
        self.max_rounds = max_rounds

        self.current_round: int = 0
        self.cumulative_bytes: int = 0
        self._delivered_excerpts: dict[str, dict[str, Any]] = {}
        self._seen_request_digests: set[str] = set()
        self._unresolved_mandatory_requirements: dict[str, dict[str, Any]] = {}
        self.status: str = "INITIAL"

    def handle_request(self, request: Mapping[str, Any]) -> dict[str, Any]:
        normalized = _validate_request_semantics(request)
        digest = request["digest"]

        if digest in self._seen_request_digests:
            raise ContextPacketError(
                "request replay detected: request digest already processed"
            )

        binding = normalized["binding"]
        if (
            binding.get("goal_id") != self.goal_id
            or binding.get("plan_digest") != self.plan_digest
            or binding.get("task_id") != self.task_id
            or binding.get("scope_id") != self.scope_id
            or binding.get("base_sha") != self.base_sha
        ):
            raise ContextPacketError(
                "request binding does not match parent session binding"
            )

        round_index = normalized["round_index"]
        expected_round = self.current_round + 1
        if round_index != expected_round:
            raise ContextPacketError(
                f"round_index must be strictly sequential (expected {expected_round}, got {round_index})"
            )

        # Check observed workspace git HEAD against both session and request revisions
        if (
            self.current_revision is not None
            or binding.get("current_revision") is not None
        ):
            try:
                revision = subprocess.run(
                    ["git", "rev-parse", "HEAD"],
                    cwd=self.workspace,
                    capture_output=True,
                    text=True,
                    timeout=5,
                    check=False,
                )
            except (OSError, subprocess.SubprocessError) as error:
                raise ContextPacketError("current revision unavailable") from error
            if revision.returncode != 0:
                raise ContextPacketError("current revision unavailable")
            actual_head = revision.stdout.strip()

            if self.current_revision is not None:
                if self.current_revision != actual_head:
                    raise ContextPacketError(
                        f"session current_revision {self.current_revision} does not match workspace git HEAD {actual_head}"
                    )

            req_current_rev = binding.get("current_revision")
            if req_current_rev is not None:
                if req_current_rev != actual_head:
                    raise ContextPacketError(
                        f"request current_revision {req_current_rev} does not match workspace git HEAD {actual_head}"
                    )
                if (
                    self.current_revision is not None
                    and req_current_rev != self.current_revision
                ):
                    raise ContextPacketError(
                        "request current_revision does not match session current_revision"
                    )

        if round_index > self.max_rounds:
            raise ContextPacketError("retrieval session round budget exhausted")
        if self.tree_fingerprint is not None:
            if (
                capture_context_snapshot(self.workspace)["tree_fingerprint"]
                != self.tree_fingerprint
            ):
                raise ContextPacketError(
                    "dirty tree drift detected during retrieval session"
                )

        excerpts: list[dict[str, Any]] = []
        current_consumed = 0

        for fact in normalized["missing_facts"]:
            fact_id = fact["fact_id"]
            target = fact["target_path"]
            mandatory = fact["mandatory"]

            if mandatory:
                self._unresolved_mandatory_requirements[target] = deepcopy(fact)

            if target in self._delivered_excerpts:
                # Deliver the previously retrieved full content and provenance to worker
                item = deepcopy(self._delivered_excerpts[target])
                item["reason"] = "deduplicated_already_present"
                item["fact_id"] = fact_id
                excerpts.append(item)
                if mandatory:
                    self._unresolved_mandatory_requirements.pop(target, None)
                continue

            remaining_budget = self.byte_budget - (
                self.cumulative_bytes + current_consumed
            )
            read_limit = min(MAX_EXCERPT_CHARS, max(0, remaining_budget))
            status, reason, prov, content_bytes = _safe_read_regular_file(
                self.workspace, target, self.allowed_scope_paths, read_limit
            )

            if status != "ok":
                excerpts.append(
                    {
                        "fact_id": fact_id,
                        "status": status,
                        "reason": reason,
                        "provenance": prov,
                        "content": "",
                    }
                )
                continue

            if (
                len(content_bytes) > remaining_budget
                or len(content_bytes) > MAX_EXCERPT_CHARS
            ):
                excerpts.append(
                    {
                        "fact_id": fact_id,
                        "status": "insufficient",
                        "reason": "budget_exceeded",
                        "provenance": {
                            "path": target,
                            "total_bytes": len(content_bytes),
                        },
                        "content": "",
                    }
                )
                continue

            # Strict UTF-8 decode
            try:
                content_str = content_bytes.decode("utf-8")
            except UnicodeDecodeError:
                excerpts.append(
                    {
                        "fact_id": fact_id,
                        "status": "inaccessible",
                        "reason": "malformed_utf8_encoding",
                        "provenance": {"path": target},
                        "content": "",
                    }
                )
                continue

            content_sha = hashlib.sha256(content_bytes).hexdigest()
            current_consumed += len(content_bytes)

            delivered_item = {
                "fact_id": fact_id,
                "status": "complete",
                "provenance": {
                    "path": target,
                    "sha256": content_sha,
                    "byte_count": len(content_bytes),
                },
                "as_data_only": True,
                "content": content_str,
            }
            excerpts.append(delivered_item)
            self._delivered_excerpts[target] = deepcopy(delivered_item)
            if mandatory:
                self._unresolved_mandatory_requirements.pop(target, None)

        # Each response is a complete bounded view for a newly dispatched worker.
        # Retain prior content rather than replacing it with only the newest round.
        combined = {
            target: deepcopy(item) for target, item in self._delivered_excerpts.items()
        }
        for item in excerpts:
            combined[item["provenance"]["path"]] = deepcopy(item)
        excerpts = list(combined.values())
        self.cumulative_bytes += current_consumed
        self.current_round = round_index
        self._seen_request_digests.add(digest)

        is_blocked = (
            bool(self._unresolved_mandatory_requirements)
            or self.cumulative_bytes > self.byte_budget
        )
        self.status = "BLOCKED_CONTEXT" if is_blocked else "READY"

        response_core = {
            "schema": SUPPLEMENTAL_RESPONSE_SCHEMA,
            "binding": deepcopy(request["binding"]),
            "round_index": round_index,
            "status": self.status,
            "stats": {
                "cumulative_bytes": self.cumulative_bytes,
                "byte_budget": self.byte_budget,
                "remaining_bytes": max(0, self.byte_budget - self.cumulative_bytes),
                "estimated_tokens": math.ceil(self.cumulative_bytes / 4),
            },
            "excerpts": excerpts,
        }
        return {**response_core, "digest": _digest(response_core)}
