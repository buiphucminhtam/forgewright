"""Resumable handoff and checkpoint verification protocol."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from copy import deepcopy
from pathlib import Path, PurePosixPath
from typing import Any, Mapping, Sequence

import sys

try:
    from scripts.lite.evidence_common import worktree_fingerprint, read_evidence_bytes
except ImportError:
    _root = str(Path(__file__).resolve().parents[2])
    if _root not in sys.path:
        sys.path.insert(0, _root)
    from scripts.lite.evidence_common import worktree_fingerprint, read_evidence_bytes

RESUMABLE_HANDOFF_SCHEMA = "forgewright-resumable-handoff/v1"

_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


class HandoffError(ValueError):
    """Raised when a handoff checkpoint is stale, tampered, or invalid."""


def _canonical(value: Mapping[str, Any]) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _digest(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _id(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _SAFE_ID_RE.fullmatch(value):
        raise HandoffError(f"{field} must be a safe non-empty identifier")
    return value


def _sha(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _SHA_RE.fullmatch(value):
        raise HandoffError(f"{field} must be a full lowercase Git SHA-1")
    return value


def _bounded_strings(
    values: Sequence[str], field: str, maximum: int = 512
) -> list[str]:
    if not isinstance(values, (list, tuple)) or len(values) > 64:
        raise HandoffError(f"{field} must be a bounded sequence")
    if any(
        not isinstance(value, str) or not value.strip() or len(value) > maximum
        for value in values
    ):
        raise HandoffError(f"{field} contains invalid text")
    return list(values)


def _scope_paths(values: Sequence[str]) -> list[str]:
    result = _bounded_strings(values, "changed_scope", 1024)
    for value in result:
        path = PurePosixPath(value)
        if (
            path.is_absolute()
            or "\\\\" in value
            or "\u0000" in value
            or any(part in {".", ".."} for part in path.parts)
        ):
            raise HandoffError("changed_scope must contain safe relative paths")
    if len(set(result)) != len(result):
        raise HandoffError("changed_scope contains duplicates")
    return sorted(result)


def _workspace_identity(workspace: Path) -> str:
    return hashlib.sha256(
        str(workspace.resolve(strict=True)).encode("utf-8")
    ).hexdigest()


def _verify_artifact_refs(
    workspace: Path, references: Sequence[Mapping[str, str]], hashes: Sequence[str]
) -> list[dict[str, str]]:
    if not isinstance(references, (list, tuple)) or len(references) > 64:
        raise HandoffError("verifier references must be a bounded sequence")
    if not isinstance(hashes, (list, tuple)) or not 1 <= len(hashes) <= 64:
        raise HandoffError("verifier hashes must be a bounded non-empty sequence")
    if any(
        not isinstance(value, str) or not _DIGEST_RE.fullmatch(value)
        for value in hashes
    ) or len(set(hashes)) != len(hashes):
        raise HandoffError("malformed or duplicate verifier hashes")
    validated: list[dict[str, str]] = []
    seen_paths: set[str] = set()
    for reference in references:
        if not isinstance(reference, Mapping) or set(reference) != {"path", "sha256"}:
            raise HandoffError("verifier reference requires exactly path and sha256")
        path = reference["path"]
        expected_hash = reference["sha256"]
        if (
            not isinstance(path, str)
            or not path
            or len(path) > 1024
            or path in seen_paths
            or "\\" in path
        ):
            raise HandoffError("invalid or duplicate verifier reference path")
        if not isinstance(expected_hash, str) or not _DIGEST_RE.fullmatch(
            expected_hash
        ):
            raise HandoffError("malformed verifier reference hash")
        try:
            payload = read_evidence_bytes(workspace, path, max_bytes=4 * 1024 * 1024)
        except (ValueError, OSError) as error:
            raise HandoffError("missing or unsafe verifier artifact") from error
        if hashlib.sha256(payload).hexdigest() != expected_hash:
            raise HandoffError("verifier artifact hash mismatch")
        seen_paths.add(path)
        validated.append({"path": path, "sha256": expected_hash})
    if validated and sorted(item["sha256"] for item in validated) != sorted(hashes):
        raise HandoffError("verifier reference set does not match bound hashes")
    return sorted(validated, key=lambda item: item["path"])


def compile_resumable_handoff(
    workspace: Path,
    *,
    project_id: str,
    goal_id: str,
    plan_digest: str,
    base_sha: str,
    head_sha: str,
    source_verifier_sha256s: Sequence[str],
    changed_scope: Sequence[str] = (),
    unresolved_risks: Sequence[str] = (),
    next_action: str = "audit",
    source_verifier_refs: Sequence[Mapping[str, str]] = (),
) -> dict[str, Any]:
    workspace = workspace.resolve(strict=True)
    project_id = _id(project_id, "project_id")
    goal_id = _id(goal_id, "goal_id")
    changed_scope = _scope_paths(changed_scope)
    unresolved_risks = _bounded_strings(unresolved_risks, "unresolved_risks")
    if (
        not isinstance(next_action, str)
        or not next_action.strip()
        or len(next_action) > 256
    ):
        raise HandoffError("next_action must be non-empty bounded text")
    if not isinstance(plan_digest, str) or not _DIGEST_RE.fullmatch(plan_digest):
        raise HandoffError("plan_digest must be lowercase SHA-256")
    base_sha = _sha(base_sha, "base_sha")
    head_sha = _sha(head_sha, "head_sha")

    if (
        not isinstance(source_verifier_sha256s, (list, tuple))
        or not 1 <= len(source_verifier_sha256s) <= 64
    ):
        raise HandoffError("source_verifier_sha256s must be a non-empty sequence")
    for index, v_sha in enumerate(source_verifier_sha256s):
        if not isinstance(v_sha, str) or not _DIGEST_RE.fullmatch(v_sha):
            raise HandoffError(
                f"source_verifier_sha256s[{index}] must be a lowercase 64-hex SHA-256"
            )

    if len(set(source_verifier_sha256s)) != len(source_verifier_sha256s):
        raise HandoffError("duplicate verifier hashes")
    references = _verify_artifact_refs(
        workspace, source_verifier_refs, source_verifier_sha256s
    )
    tree_fp = worktree_fingerprint(workspace)

    core = {
        "schema": RESUMABLE_HANDOFF_SCHEMA,
        "binding": {
            "project_id": project_id,
            "goal_id": goal_id,
            "plan_digest": plan_digest,
            "base_sha": base_sha,
            "head_sha": head_sha,
            "tree_fingerprint": tree_fp,
            "workspace_identity": _workspace_identity(workspace),
        },
        "source_verifier_sha256s": sorted(list(source_verifier_sha256s)),
        "source_verifier_refs": references,
        "changed_scope": sorted(list(changed_scope)),
        "unresolved_risks": list(unresolved_risks),
        "next_action": next_action,
        "tool_authority": False,  # Checkpoints cannot grant tool authority!
        "requires_workspace_regrounding": True,
    }
    return {**core, "digest": _digest(core)}


def validate_resume_checkpoint(
    workspace: Path,
    checkpoint: Mapping[str, Any],
    *,
    expected_project_id: str | None = None,
    expected_goal_id: str | None = None,
    expected_plan_digest: str | None = None,
) -> dict[str, Any]:
    if (
        not isinstance(checkpoint, Mapping)
        or checkpoint.get("schema") != RESUMABLE_HANDOFF_SCHEMA
    ):
        raise HandoffError("schema mismatch")

    digest = checkpoint.get("digest")
    if not isinstance(digest, str) or not _DIGEST_RE.fullmatch(digest):
        raise HandoffError("malformed checkpoint digest")
    core = {k: deepcopy(v) for k, v in checkpoint.items() if k != "digest"}
    if _digest(core) != digest:
        raise HandoffError("checkpoint digest tampered or corrupt")

    if checkpoint.get("tool_authority") is not False:
        raise HandoffError("checkpoint cannot grant tool authority")
    if checkpoint.get("requires_workspace_regrounding") is not True:
        raise HandoffError("checkpoint cannot disable workspace regrounding")
    allowed = {
        "schema",
        "binding",
        "source_verifier_sha256s",
        "source_verifier_refs",
        "changed_scope",
        "unresolved_risks",
        "next_action",
        "tool_authority",
        "requires_workspace_regrounding",
        "digest",
    }
    if set(checkpoint) != allowed:
        raise HandoffError("checkpoint has unknown or missing fields")
    _scope_paths(checkpoint["changed_scope"])
    _bounded_strings(checkpoint["unresolved_risks"], "unresolved_risks")
    if (
        not isinstance(checkpoint["next_action"], str)
        or not checkpoint["next_action"].strip()
        or len(checkpoint["next_action"]) > 256
    ):
        raise HandoffError("invalid next_action")
    binding = checkpoint.get("binding", {})
    if not isinstance(binding, Mapping) or set(binding) != {
        "project_id",
        "goal_id",
        "plan_digest",
        "base_sha",
        "head_sha",
        "tree_fingerprint",
        "workspace_identity",
    }:
        raise HandoffError(
            "checkpoint binding missing or unsupported; recompile checkpoint"
        )
    _id(binding["project_id"], "project_id")
    _id(binding["goal_id"], "goal_id")
    _sha(binding["base_sha"], "base_sha")
    _sha(binding["head_sha"], "head_sha")
    if not isinstance(binding["plan_digest"], str) or not _DIGEST_RE.fullmatch(
        binding["plan_digest"]
    ):
        raise HandoffError("invalid checkpoint plan digest")
    if binding["workspace_identity"] != _workspace_identity(workspace):
        raise HandoffError("checkpoint belongs to a different physical workspace")
    if expected_project_id and binding.get("project_id") != expected_project_id:
        raise HandoffError(
            f"wrong project: expected {expected_project_id}, got {binding.get('project_id')}"
        )

    if expected_goal_id and binding.get("goal_id") != expected_goal_id:
        raise HandoffError(
            f"wrong goal: expected {expected_goal_id}, got {binding.get('goal_id')}"
        )

    if expected_plan_digest and binding.get("plan_digest") != expected_plan_digest:
        raise HandoffError(
            f"stale plan: expected {expected_plan_digest}, got {binding.get('plan_digest')}"
        )

    # Verify head commit
    try:
        current_head = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=workspace, text=True, timeout=5
        ).strip()
    except Exception as error:
        raise HandoffError(f"failed to check workspace git head: {error}") from error

    if binding.get("head_sha") != current_head:
        raise HandoffError(
            f"head mismatch: checkpoint head {binding.get('head_sha')} != current HEAD {current_head}"
        )

    # Recompute tree fingerprint to detect same-HEAD dirty drift
    current_tree_fp = worktree_fingerprint(workspace)
    if binding.get("tree_fingerprint") != current_tree_fp:
        raise HandoffError("stale checkpoint: dirty-tree drift detected at same HEAD")

    references = _verify_artifact_refs(
        workspace,
        checkpoint.get("source_verifier_refs", ()),
        checkpoint.get("source_verifier_sha256s", ()),
    )
    # Matching bytes establish artifact integrity, not acceptance or reviewer identity.
    # A legacy hash-only checkpoint remains useful context, never fresh PASS evidence.
    return {
        **deepcopy(dict(checkpoint)),
        "source_verifier_refs": references,
        "evidence_status": "BYTES_VERIFIED" if references else "UNVERIFIED",
        "requires_verifier_rerun": True,
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Compile or validate resumable handoff checkpoints."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    compile_p = subparsers.add_parser(
        "compile", help="Compile a resumable handoff checkpoint."
    )
    compile_p.add_argument("--workspace", type=Path, default=Path.cwd())
    compile_p.add_argument("--project-id", required=True)
    compile_p.add_argument("--goal-id", required=True)
    compile_p.add_argument("--plan-digest", required=True)
    compile_p.add_argument("--base-sha", required=True)
    compile_p.add_argument("--head-sha", required=True)
    compile_p.add_argument("--source-verifiers", nargs="+", required=True)
    compile_p.add_argument(
        "--verifier-refs", help="JSON string or file path for artifact refs"
    )
    compile_p.add_argument("--changed-scope", nargs="*", default=[])
    compile_p.add_argument("--unresolved-risks", nargs="*", default=[])
    compile_p.add_argument("--next-action", default="audit")
    compile_p.add_argument(
        "--output", type=Path, help="Output file path (defaults to stdout)"
    )

    validate_p = subparsers.add_parser("validate", help="Validate a resume checkpoint.")
    validate_p.add_argument("--workspace", type=Path, default=Path.cwd())
    validate_p.add_argument("--checkpoint", type=Path, required=True)
    validate_p.add_argument("--expected-project-id")
    validate_p.add_argument("--expected-goal-id")
    validate_p.add_argument("--expected-plan-digest")

    args = parser.parse_args(argv)

    if args.command == "compile":
        refs = ()
        if args.verifier_refs:
            if Path(args.verifier_refs).exists():
                refs = json.loads(Path(args.verifier_refs).read_text(encoding="utf-8"))
            else:
                refs = json.loads(args.verifier_refs)

        try:
            checkpoint = compile_resumable_handoff(
                workspace=args.workspace,
                project_id=args.project_id,
                goal_id=args.goal_id,
                plan_digest=args.plan_digest,
                base_sha=args.base_sha,
                head_sha=args.head_sha,
                source_verifier_sha256s=args.source_verifiers,
                changed_scope=args.changed_scope,
                unresolved_risks=args.unresolved_risks,
                next_action=args.next_action,
                source_verifier_refs=refs,
            )
        except (HandoffError, ValueError) as err:
            print(f"Compile failed: {err}", file=sys.stderr)
            return 1

        rendered = json.dumps(checkpoint, indent=2, ensure_ascii=False)
        if args.output:
            args.output.write_text(rendered + chr(10), encoding="utf-8")
        else:
            print(rendered)
        return 0

    elif args.command == "validate":
        try:
            cp_data = json.loads(args.checkpoint.read_text(encoding="utf-8"))
            result = validate_resume_checkpoint(
                workspace=args.workspace,
                checkpoint=cp_data,
                expected_project_id=args.expected_project_id,
                expected_goal_id=args.expected_goal_id,
                expected_plan_digest=args.expected_plan_digest,
            )
        except (HandoffError, ValueError, OSError) as err:
            print(f"Validation failed: {err}", file=sys.stderr)
            return 1

        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
