#!/usr/bin/env python3
"""Goal/plan-bound transient runtime state and failure classification."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Mapping

BINDING_SCHEMA = "forgewright-plan-runtime-binding/v1"
FAILURE_SCHEMA = "forgewright-failure-classification/v1"
FAILURE_CLASSES = (
    "hypothesis_wrong",
    "implementation_wrong",
    "environment_wrong",
    "architecture_wrong",
)
FAILURE_REPLAN_TRIGGER = {
    "hypothesis_wrong": "material_assumption_invalidated",
    "implementation_wrong": None,
    "environment_wrong": "material_assumption_invalidated",
    "architecture_wrong": "material_risk_discovered",
}
_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_ARTIFACT_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,95}\.json$")


class PlanRuntimeError(ValueError):
    """Raised when transient state is stale, unsafe, or not owned by a plan."""


def _id(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _ID_RE.fullmatch(value):
        raise PlanRuntimeError(f"{field} must be a safe identifier")
    return value


def _digest(value: Any) -> str:
    if not isinstance(value, str) or not _DIGEST_RE.fullmatch(value):
        raise PlanRuntimeError("plan_digest must be lowercase SHA-256")
    return value


def _sha(value: Any) -> str:
    if not isinstance(value, str) or not _SHA_RE.fullmatch(value):
        raise PlanRuntimeError("base_sha must be a full lowercase Git SHA-1")
    return value


def _runtime_root(workspace: Path) -> Path:
    workspace = workspace.resolve()
    root = workspace / ".forgewright" / "runtime" / "goals"
    root.mkdir(parents=True, exist_ok=True)
    if root.is_symlink():
        raise PlanRuntimeError("runtime goals root must not be a symlink")
    return root


def state_dir(workspace: Path, goal_id: str, plan_digest: str) -> Path:
    goal_id = _id(goal_id, "goal_id")
    plan_digest = _digest(plan_digest)
    return _runtime_root(workspace) / goal_id / plan_digest


def _binding(
    *, goal_id: str, plan_digest: str, base_sha: str, owner: str
) -> dict[str, str]:
    return {
        "schema": BINDING_SCHEMA,
        "goal_id": _id(goal_id, "goal_id"),
        "plan_digest": _digest(plan_digest),
        "base_sha": _sha(base_sha),
        "owner": _id(owner, "owner"),
    }


def _load_binding(path: Path) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size > 16 * 1024:
        raise PlanRuntimeError("plan runtime binding is missing or unbounded")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise PlanRuntimeError("plan runtime binding is invalid JSON") from error
    if not isinstance(value, dict) or value.get("schema") != BINDING_SCHEMA:
        raise PlanRuntimeError("plan runtime binding schema mismatch")
    return value


def initialize(
    workspace: Path,
    *,
    goal_id: str,
    plan_digest: str,
    base_sha: str,
    owner: str,
) -> Path:
    expected = _binding(
        goal_id=goal_id, plan_digest=plan_digest, base_sha=base_sha, owner=owner
    )
    target = state_dir(workspace, goal_id, plan_digest)
    goal_root = target.parent
    goal_root.mkdir(parents=True, exist_ok=True)
    if goal_root.is_symlink():
        raise PlanRuntimeError("goal runtime directory must not be a symlink")
    target.mkdir(exist_ok=True)
    if target.is_symlink():
        raise PlanRuntimeError("plan runtime directory must not be a symlink")
    binding_path = target / "binding.json"
    if binding_path.exists():
        if _load_binding(binding_path) != expected:
            raise PlanRuntimeError("existing plan runtime binding does not match")
    else:
        tmp = target / f".binding.{os.getpid()}.tmp"
        tmp.write_text(json.dumps(expected, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(tmp, binding_path)
    return target


def assert_binding(
    workspace: Path,
    *,
    goal_id: str,
    plan_digest: str,
    base_sha: str,
    owner: str,
) -> Path:
    expected = _binding(
        goal_id=goal_id, plan_digest=plan_digest, base_sha=base_sha, owner=owner
    )
    target = state_dir(workspace, goal_id, plan_digest)
    if target.is_symlink():
        raise PlanRuntimeError("plan runtime directory must not be a symlink")
    if _load_binding(target / "binding.json") != expected:
        raise PlanRuntimeError("stale or foreign plan runtime binding")
    return target


def write_artifact(
    workspace: Path,
    *,
    goal_id: str,
    plan_digest: str,
    base_sha: str,
    owner: str,
    name: str,
    value: Mapping[str, Any],
) -> Path:
    if not _ARTIFACT_RE.fullmatch(name) or name == "binding.json":
        raise PlanRuntimeError(
            "runtime artifact name must be a safe non-binding JSON filename"
        )
    target = assert_binding(
        workspace,
        goal_id=goal_id,
        plan_digest=plan_digest,
        base_sha=base_sha,
        owner=owner,
    )
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    if len(encoded.encode("utf-8")) > 1024 * 1024:
        raise PlanRuntimeError("runtime artifact exceeds 1 MiB")
    tmp = target / f".{name}.{os.getpid()}.tmp"
    tmp.write_text(encoded, encoding="utf-8")
    os.replace(tmp, target / name)
    return target / name


def cleanup(
    workspace: Path,
    *,
    goal_id: str,
    plan_digest: str,
    base_sha: str,
    owner: str,
) -> bool:
    target = assert_binding(
        workspace,
        goal_id=goal_id,
        plan_digest=plan_digest,
        base_sha=base_sha,
        owner=owner,
    )
    goal_root = target.parent
    shutil.rmtree(target)
    try:
        goal_root.rmdir()
    except OSError:
        pass
    return True


def classify_failure(
    kind: str,
    *,
    evidence: str,
    next_action: str,
    attempts: int,
) -> dict[str, Any]:
    if kind not in FAILURE_CLASSES:
        raise PlanRuntimeError(f"failure kind must be one of {FAILURE_CLASSES}")
    if not isinstance(attempts, int) or isinstance(attempts, bool) or attempts < 1:
        raise PlanRuntimeError("attempts must be a positive integer")
    for value, field in ((evidence, "evidence"), (next_action, "next_action")):
        if not isinstance(value, str) or not value.strip() or len(value) > 2048:
            raise PlanRuntimeError(f"{field} must be a bounded non-empty string")
    trigger = FAILURE_REPLAN_TRIGGER[kind]
    return {
        "schema": FAILURE_SCHEMA,
        "class": kind,
        "attempts": attempts,
        "evidence": evidence.strip(),
        "next_action": next_action.strip(),
        "replan_trigger": trigger,
        "same_approach_forbidden": attempts >= 2,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    def binding_args(command: argparse.ArgumentParser) -> None:
        command.add_argument("--workspace", type=Path, required=True)
        command.add_argument("--goal-id", required=True)
        command.add_argument("--plan-digest", required=True)
        command.add_argument("--base-sha", required=True)
        command.add_argument("--owner", required=True)

    init = sub.add_parser("init")
    binding_args(init)
    status = sub.add_parser("status")
    binding_args(status)
    clean = sub.add_parser("cleanup")
    binding_args(clean)
    failure = sub.add_parser("failure")
    failure.add_argument("--kind", choices=FAILURE_CLASSES, required=True)
    failure.add_argument("--evidence", required=True)
    failure.add_argument("--next-action", required=True)
    failure.add_argument("--attempts", type=int, required=True)

    args = parser.parse_args()
    if args.command == "failure":
        print(
            json.dumps(
                classify_failure(
                    args.kind,
                    evidence=args.evidence,
                    next_action=args.next_action,
                    attempts=args.attempts,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    kwargs = {
        "goal_id": args.goal_id,
        "plan_digest": args.plan_digest,
        "base_sha": args.base_sha,
        "owner": args.owner,
    }
    if args.command == "init":
        path = initialize(args.workspace, **kwargs)
        print(json.dumps({"status": "initialized", "path": str(path)}))
    elif args.command == "status":
        path = assert_binding(args.workspace, **kwargs)
        print(json.dumps({"status": "bound", "path": str(path)}))
    else:
        cleanup(args.workspace, **kwargs)
        print(json.dumps({"status": "cleaned"}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PlanRuntimeError as error:
        print(f"plan-runtime: {error}", file=sys.stderr)
        raise SystemExit(2)
