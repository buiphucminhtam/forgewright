#!/usr/bin/env python3
"""Across-Task and Cross-Model Harness2 transfer registry with 2-stage promotion."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import tempfile
import time
from typing import Any, Callable

from harness_contracts import (
    TRANSFER_SCHEMA,
    HarnessContractError,
    canonical_bytes,
    validate_candidate,
    validate_contract,
    validate_transfer,
)

MAX_RETRIEVED_ITEMS = 3
MAX_CONTEXT_CHARS = 2000
MAX_LOOKUP_SECONDS = 0.100
MAX_REGISTRY_BYTES = 2 * 1024 * 1024
REGISTRY_REL_PATH = ".forgewright/runtime/learning/registry.json"


def _registry_path(workspace: Path) -> Path:
    return Path(workspace).resolve() / REGISTRY_REL_PATH


def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    raw = canonical_bytes(data) + b"\x0a"
    if len(raw) > MAX_REGISTRY_BYTES:
        raise HarnessContractError("transfer-registry-exceeds-budget")
    fd, tmp_name = tempfile.mkstemp(prefix=".registry-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def load_registry(workspace: Path) -> dict[str, Any]:
    path = _registry_path(workspace)
    if not path.exists():
        return {"schema": "forgewright-harness-transfer-registry/v1", "entries": []}
    if path.is_symlink() or path.stat().st_size > MAX_REGISTRY_BYTES:
        raise HarnessContractError("unsafe-transfer-registry")
    data = json.loads(path.read_bytes())
    if (
        not isinstance(data, dict)
        or data.get("schema") != "forgewright-harness-transfer-registry/v1"
        or not isinstance(data.get("entries"), list)
    ):
        raise HarnessContractError("invalid-transfer-registry")
    return data


def stage_transfer_candidate(
    workspace: Path,
    contract: dict[str, Any],
    *,
    transfer_id: str,
    failure_class: str,
    winning_candidate: dict[str, Any],
    winning_probe_id: str,
    evidence_ref: str,
    review_ref: str,
    reviewer_id: str,
    implementer_id: str,
) -> dict[str, Any]:
    """Stage 1: Capture winning candidate as context-only before offline replay promotion."""
    validate_contract(contract)
    validate_candidate(contract, winning_candidate)
    if winning_candidate["origin"] == "baseline":
        raise HarnessContractError("baseline-candidate-not-transferable")
    record: dict[str, Any] = {
        "schema": TRANSFER_SCHEMA,
        "transfer_id": transfer_id,
        "index_key": {
            "operation": contract["operation"],
            "failure_class": failure_class,
            "toolchain_digest": contract["toolchain_digest"],
            "platform": contract["platform"],
            "model_family": contract["model_family"],
        },
        "source_contract_id": contract["contract_id"],
        "winning_candidate": copy.deepcopy(winning_candidate),
        "winning_probe_id": winning_probe_id,
        "evidence_ref": evidence_ref,
        "review_ref": review_ref,
        "reviewer_id": reviewer_id,
        "implementer_id": implementer_id,
        "stage": "context-only",
        "offline_replay_passed": False,
        "canary_trials": 0,
        "canary_failures": 0,
    }
    validate_transfer(contract, record)
    registry = load_registry(workspace)
    entries = [e for e in registry["entries"] if e.get("transfer_id") != transfer_id]
    entries.append(record)
    registry["entries"] = entries[-128:]
    _atomic_write_json(_registry_path(workspace), registry)
    return record


def promote_transfer_candidate(
    workspace: Path,
    contract: dict[str, Any],
    transfer_id: str,
    *,
    replay_verifier: Callable[[dict[str, Any]], bool],
    independent_review_approved: bool,
) -> dict[str, Any]:
    """Stage 2: Promote context-only entry to promoted only after offline replay + review-2."""
    if not independent_review_approved:
        raise HarnessContractError("promotion-requires-independent-review-2")
    registry = load_registry(workspace)
    target = None
    for entry in registry["entries"]:
        if entry.get("transfer_id") == transfer_id:
            target = entry
            break
    if target is None:
        raise HarnessContractError("transfer-entry-not-found")
    if target.get("stage") == "demoted":
        raise HarnessContractError("demoted-transfer-cannot-be-promoted")
    if not replay_verifier(target["winning_candidate"]):
        raise HarnessContractError("offline-replay-verification-failed")
    target["offline_replay_passed"] = True
    target["stage"] = "promoted"
    validate_transfer(contract, target)
    _atomic_write_json(_registry_path(workspace), registry)
    return copy.deepcopy(target)


def record_canary_outcome(
    workspace: Path,
    transfer_id: str,
    *,
    succeeded: bool,
    max_failures: int = 1,
) -> dict[str, Any]:
    """Track cross-task/cross-model canary executions and auto-demote on regression."""
    registry = load_registry(workspace)
    for entry in registry["entries"]:
        if entry.get("transfer_id") == transfer_id:
            entry["canary_trials"] = int(entry.get("canary_trials", 0)) + 1
            if not succeeded:
                entry["canary_failures"] = int(entry.get("canary_failures", 0)) + 1
                if entry["canary_failures"] >= max_failures:
                    entry["stage"] = "demoted"
            _atomic_write_json(_registry_path(workspace), registry)
            return copy.deepcopy(entry)
    raise HarnessContractError("transfer-entry-not-found")


def retrieve_transfer_candidates(
    workspace: Path,
    *,
    operation: str,
    toolchain_digest: str,
    platform: str,
    model_family: str,
    failure_class: str | None = None,
    include_cross_model: bool = True,
) -> dict[str, Any]:
    """Bounded lookup (<=3 items, <=2000 chars, <=100ms) for across-task/cross-model transfer."""
    started = time.monotonic()
    try:
        registry = load_registry(workspace)
    except Exception:
        return {"status": "empty", "items": [], "context": "", "chars": 0}

    matched: list[tuple[int, dict[str, Any]]] = []
    for entry in registry.get("entries", []):
        if time.monotonic() - started > MAX_LOOKUP_SECONDS:
            break
        if entry.get("stage") != "promoted" or not entry.get("offline_replay_passed"):
            continue
        key = entry.get("index_key", {})
        if (
            key.get("operation") != operation
            or key.get("toolchain_digest") != toolchain_digest
            or key.get("platform") != platform
        ):
            continue
        if failure_class is not None and key.get("failure_class") != failure_class:
            continue
        same_model = key.get("model_family") == model_family
        if not same_model and not include_cross_model:
            continue
        # Rank exact model match higher than cross-model transfer, and higher net canary success higher.
        score = (100 if same_model else 50) + int(entry.get("canary_trials", 0)) - int(entry.get("canary_failures", 0)) * 50
        matched.append((score, entry))

    matched.sort(key=lambda item: item[0], reverse=True)
    selected = [item[1] for item in matched[:MAX_RETRIEVED_ITEMS]]
    if not selected:
        return {"status": "empty", "items": [], "context": "", "chars": 0}

    lines: list[str] = []
    final_items: list[dict[str, Any]] = []
    for entry in selected:
        cand = entry["winning_candidate"]
        summary = json.dumps(
            {
                "transfer_id": entry["transfer_id"],
                "model_family": entry["index_key"]["model_family"],
                "failure_class": entry["index_key"]["failure_class"],
                "surfaces": cand["surfaces"],
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        candidate_text = chr(10).join([*lines, summary])
        if len(candidate_text) > MAX_CONTEXT_CHARS:
            break
        lines.append(summary)
        final_items.append(copy.deepcopy(entry))

    context_str = chr(10).join(lines)
    return {
        "status": "retrieved" if final_items else "empty",
        "items": final_items,
        "context": context_str,
        "chars": len(context_str),
    }
