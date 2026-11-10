#!/usr/bin/env python3
"""RF05 OpenSpec contract revision & read-only tasks.md projection adapter.

Enforces architectural invariants:
- Requirements and acceptance criteria live in a versioned task contract
  (mapped from OpenSpec proposal/spec_deltas/design).
- Forgewright state repository owns execution state (pending/in_progress/verified/failed).
- tasks.md is a read-only projection of Forgewright execution state; manual
  checkbox edits in tasks.md never override execution state.
- Archiving an OpenSpec change never marks a task accepted without an
  independent verifier receipt for the current contract revision.
- Reviewer packet (Superpowers requesting-code-review protocol) passes only
  requirements, base_sha, head_sha, diff, and raw test evidence — never
  implementer self-certified PASS narratives.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

CONTRACT_SCHEMA = "forgewright-openspec-task-contract/v1"
REVIEW_PACKET_SCHEMA = "forgewright-superpowers-review-packet/v1"


class OpenSpecAdapterError(ValueError):
    """Raised when an OpenSpec contract, state projection, or review packet violates invariants."""


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False
    )


def _sha256(value: Any) -> str:
    raw = value.encode("utf-8") if isinstance(value, str) else _canonical_json(value).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def compile_openspec_contract(
    *,
    change_id: str,
    revision: int,
    proposal: str,
    spec_deltas: Sequence[Mapping[str, Any]],
    design_notes: str = "",
    tasks: Sequence[Mapping[str, Any]],
    previous_contract: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Compile an OpenSpec change into a versioned Forgewright task contract."""
    if not isinstance(change_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,63}", change_id):
        raise OpenSpecAdapterError("invalid change_id")
    if type(revision) is not int or revision < 1:
        raise OpenSpecAdapterError("revision must be a positive integer")
    if previous_contract is not None:
        prev_rev = previous_contract.get("revision")
        if type(prev_rev) is not int or revision != prev_rev + 1:
            raise OpenSpecAdapterError("new contract revision must increment previous revision by 1")
    if not isinstance(proposal, str) or not proposal.strip():
        raise OpenSpecAdapterError("proposal must be non-empty")
    if not isinstance(spec_deltas, Sequence) or not spec_deltas:
        raise OpenSpecAdapterError("at least one spec_delta is required")
    if not isinstance(tasks, Sequence) or not tasks:
        raise OpenSpecAdapterError("at least one task item is required")

    normalized_deltas = []
    for delta in spec_deltas:
        if not isinstance(delta, Mapping):
            raise OpenSpecAdapterError("spec_delta must be an object")
        req_id = str(delta.get("id", "")).strip()
        op = str(delta.get("operation", "MODIFIED")).strip().upper()
        requirement = str(delta.get("requirement", "")).strip()
        acceptance = [str(x).strip() for x in delta.get("acceptance", ()) if str(x).strip()]
        if not req_id or op not in {"ADDED", "MODIFIED", "REMOVED"} or not requirement or not acceptance:
            raise OpenSpecAdapterError(f"invalid spec_delta entry: {delta!r}")
        normalized_deltas.append(
            {
                "id": req_id,
                "operation": op,
                "requirement": requirement,
                "acceptance": acceptance,
            }
        )

    normalized_tasks = []
    seen_task_ids: set[str] = set()
    delta_by_id = {d["id"]: d for d in normalized_deltas}
    for item in tasks:
        if not isinstance(item, Mapping):
            raise OpenSpecAdapterError("task item must be an object")
        tid = str(item.get("id", "")).strip()
        title = str(item.get("title", "")).strip()
        target_paths = [str(p).strip() for p in item.get("target_paths", ()) if str(p).strip()]
        req_ids = [str(r).strip() for r in item.get("requirement_ids", ()) if str(r).strip()]
        if not tid or tid in seen_task_ids or not title or not target_paths:
            raise OpenSpecAdapterError(f"invalid or duplicate task item: {item!r}")
        if any(rid not in delta_by_id for rid in req_ids):
            raise OpenSpecAdapterError(f"task {tid!r} references unknown requirement_ids: {req_ids}")
        seen_task_ids.add(tid)
        bound_deltas = [delta_by_id[rid] for rid in req_ids] if req_ids else normalized_deltas
        normalized_tasks.append(
            {
                "id": tid,
                "title": title,
                "target_paths": target_paths,
                "requirement_ids": req_ids,
                "requirement_digest": _sha256(bound_deltas),
            }
        )

    body = {
        "schema": CONTRACT_SCHEMA,
        "change_id": change_id,
        "revision": revision,
        "previous_contract_digest": previous_contract.get("contract_digest") if previous_contract else None,
        "proposal": proposal.strip(),
        "design_notes": design_notes.strip(),
        "spec_deltas": normalized_deltas,
        "requirements_digest": _sha256(normalized_deltas),
        "tasks": normalized_tasks,
    }
    body["contract_digest"] = _sha256(body)
    return body


def _task_is_currently_verified(
    contract: Mapping[str, Any],
    task: Mapping[str, Any],
    state_entry: Mapping[str, Any],
) -> bool:
    if state_entry.get("status") != "verified" or not state_entry.get("evidence_ref"):
        return False
    expected_req_digest = task.get("requirement_digest") or contract.get("requirements_digest")
    recorded_req_digest = state_entry.get("requirement_digest")
    if not isinstance(recorded_req_digest, str) or recorded_req_digest != expected_req_digest:
        return False
    recorded_rev = state_entry.get("revision")
    if type(recorded_rev) is not int or recorded_rev != contract.get("revision"):
        return False
    return True


def project_tasks_markdown(
    contract: Mapping[str, Any],
    execution_state: Mapping[str, Mapping[str, Any]],
) -> str:
    """Render tasks.md as a read-only projection of Forgewright execution state."""
    if contract.get("schema") != CONTRACT_SCHEMA:
        raise OpenSpecAdapterError("invalid contract schema")
    lines = [
        f"# Tasks Projection — {contract['change_id']} (rev {contract['revision']})",
        f"<!-- contract_digest: {contract['contract_digest']} -->",
        "<!-- READ-ONLY PROJECTION: Execution state is owned by Forgewright CAS repository -->",
        "",
    ]
    for task in contract["tasks"]:
        tid = task["id"]
        state_entry = execution_state.get(tid, {})
        verified = _task_is_currently_verified(contract, task, state_entry)
        mark = "x" if verified else " "
        paths = ", ".join(f"`{p}`" for p in task["target_paths"])
        lines.append(f"- [{mark}] **{tid}**: {task['title']} ({paths})")
    return "\n".join(lines) + "\n"


def reconcile_requirement_revision(
    old_contract: Mapping[str, Any],
    new_contract: Mapping[str, Any],
    execution_state: Mapping[str, Mapping[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Reconcile execution state across a requirement revision without checkbox authority."""
    if new_contract.get("previous_contract_digest") != old_contract.get("contract_digest"):
        raise OpenSpecAdapterError("new contract does not reference old contract digest")
    old_tasks = {t["id"]: t for t in old_contract["tasks"]}
    reconciled: dict[str, dict[str, Any]] = {}
    for task in new_contract["tasks"]:
        tid = task["id"]
        prior = execution_state.get(tid)
        old_task = old_tasks.get(tid)
        if (
            prior
            and old_task is not None
            and old_task == task
            and old_task.get("requirement_digest") == task.get("requirement_digest")
            and _task_is_currently_verified(old_contract, old_task, prior)
        ):
            preserved = dict(prior)
            preserved["revision"] = new_contract["revision"]
            preserved["requirement_digest"] = task["requirement_digest"]
            reconciled[tid] = preserved
        else:
            # Modified task or changed requirement/acceptance requires fresh verification under the new revision
            reconciled[tid] = {
                "status": "pending",
                "evidence_ref": None,
                "revision": new_contract["revision"],
                "requirement_digest": task["requirement_digest"],
            }
    return reconciled


def evaluate_openspec_completion(
    contract: Mapping[str, Any],
    execution_state: Mapping[str, Mapping[str, Any]],
    *,
    openspec_archived: bool = False,
    verifier_receipt: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Determine whether a task contract is accepted. OpenSpec archive alone never certifies acceptance."""
    all_tasks_verified = all(
        _task_is_currently_verified(contract, t, execution_state.get(t["id"], {}))
        for t in contract["tasks"]
    )
    verifier_ok = (
        isinstance(verifier_receipt, Mapping)
        and verifier_receipt.get("terminal_outcome") == "accepted"
        and verifier_receipt.get("verifier", {}).get("passed") is True
        and verifier_receipt.get("verifier", {}).get("independent") is True
        and verifier_receipt.get("config_digest") == contract["contract_digest"]
    )
    accepted = all_tasks_verified and verifier_ok
    return {
        "accepted": accepted,
        "openspec_archived": openspec_archived,
        "all_tasks_verified": all_tasks_verified,
        "independent_verifier_passed": verifier_ok,
        "reason": "accepted" if accepted else (
            "archive_never_substitutes_for_verifier" if openspec_archived and not verifier_ok else "verification_incomplete"
        ),
    }


def build_superpowers_review_packet(
    *,
    contract: Mapping[str, Any],
    base_sha: str,
    head_sha: str,
    diff_text: str,
    evidence_receipts: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Build an isolated reviewer input packet (requirements + base/head + diff + raw evidence only)."""
    if contract.get("schema") != CONTRACT_SCHEMA:
        raise OpenSpecAdapterError("valid task contract required")
    if not base_sha or not head_sha or not isinstance(diff_text, str):
        raise OpenSpecAdapterError("base_sha, head_sha, and diff_text required")
    sanitized_receipts = []
    for rec in evidence_receipts:
        if not isinstance(rec, Mapping):
            raise OpenSpecAdapterError("evidence receipt must be a mapping")
        if "implementer_rationale" in rec or "self_attested_pass" in rec:
            raise OpenSpecAdapterError("implementer narrative/self-attestation forbidden in reviewer packet")
        sanitized_receipts.append(
            {
                "run_id": rec.get("run_id"),
                "commands": rec.get("commands"),
                "terminal_outcome": rec.get("terminal_outcome"),
                "verifier": rec.get("verifier"),
                "evidence_paths": rec.get("evidence_paths"),
                "artifact_digests": rec.get("artifact_digests"),
            }
        )
    return {
        "schema": REVIEW_PACKET_SCHEMA,
        "change_id": contract["change_id"],
        "revision": contract["revision"],
        "contract_digest": contract["contract_digest"],
        "requirements": contract["spec_deltas"],
        "base_sha": base_sha,
        "head_sha": head_sha,
        "diff_sha256": _sha256(diff_text),
        "diff": diff_text,
        "evidence_receipts": sanitized_receipts,
    }
