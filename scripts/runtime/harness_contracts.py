#!/usr/bin/env python3
"""Static contracts and immutable boundary guards for Harness2 adaptation."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import PurePosixPath
import re
import unicodedata
from typing import Any

CONTRACT_SCHEMA = "forgewright-harness-contract/v1"
CANDIDATE_SCHEMA = "forgewright-harness-candidate/v1"
PROBE_SCHEMA = "forgewright-harness-probe/v1"
TRANSFER_SCHEMA = "forgewright-harness-transfer/v1"

ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
JOB_ID_RE = re.compile(r"^job-[0-9a-f]{32}$")

ALLOWED_SURFACES = frozenset({
    "skill_overlay",
    "recipe_parameters",
    "tool_routing_hint",
    "bounded_context",
    "script_proposal",
})

IMMUTABLE_PREFIXES = (
    "kernel/",
    "skills/_shared/protocols/",
    "tests/",
    "schemas/",
)

IMMUTABLE_EXACT_PATHS = frozenset({
    "AGENTS.md",
    "CLAUDE.md",
    ".forgewright/execution-policy.yaml",
    "scripts/runtime/host_admission.py",
    "scripts/runtime/host_job_runner.py",
    "scripts/runtime/resource_enrollment.py",
    "scripts/hooks/resource_admission.py",
    "scripts/lite/verify_gate.py",
    "scripts/lite/evidence_common.py",
    "scripts/lite/stop_gate.py",
    "scripts/lite/rule-validator.py",
    "scripts/runtime/harness_contracts.py",
    "scripts/runtime/harness_adaptation.py",
    "scripts/runtime/harness_transfer.py",
    "scripts/eval/harness_adaptation_eval.py",
})

MAX_RECORD_BYTES = 262144


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, val in pairs:
        if key in result:
            raise HarnessContractError(f"duplicate-json-key:{key}")
        if isinstance(val, str) and not unicodedata.is_normalized("NFC", val):
            raise HarnessContractError(f"non-nfc-string:{key}")
        result[key] = val
    return result


def load_record(raw: bytes) -> dict[str, Any]:
    if not isinstance(raw, (bytes, bytearray)) or len(raw) == 0 or len(raw) > MAX_RECORD_BYTES:
        raise HarnessContractError("record-size-out-of-bounds")
    try:
        text = bytes(raw).decode("utf-8")
    except UnicodeDecodeError as err:
        raise HarnessContractError("invalid-utf8-record") from err
    if not unicodedata.is_normalized("NFC", text):
        raise HarnessContractError("non-nfc-record")
    try:
        parsed = json.loads(text, object_pairs_hook=_reject_duplicate_keys)
    except json.JSONDecodeError as err:
        raise HarnessContractError("malformed-json-record") from err
    if not isinstance(parsed, dict):
        raise HarnessContractError("record-must-be-object")
    return parsed


class HarnessContractError(ValueError):
    """Raised when a Harness2 contract, candidate, probe, or transfer is invalid."""


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _require_id(value: Any, field: str) -> str:
    if not isinstance(value, str) or not ID_RE.fullmatch(value):
        raise HarnessContractError(f"invalid-{field}")
    return value


def _require_sha256(value: Any, field: str) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise HarnessContractError(f"invalid-{field}")
    return value


def _normalize_relpath(raw: Any, field: str) -> str:
    if not isinstance(raw, str) or not raw or len(raw) > 256 or chr(0) in raw or chr(92) in raw:
        raise HarnessContractError(f"invalid-{field}")
    pure = PurePosixPath(raw)
    if pure.is_absolute() or ".." in pure.parts or "." in pure.parts or not pure.parts:
        raise HarnessContractError(f"unsafe-{field}")
    return pure.as_posix()


def assert_mutable_path_allowed(relpath: str) -> str:
    normalized = _normalize_relpath(relpath, "touched-path")
    if normalized in IMMUTABLE_EXACT_PATHS:
        raise HarnessContractError(f"immutable-path-violation:{normalized}")
    for prefix in IMMUTABLE_PREFIXES:
        if normalized.startswith(prefix):
            raise HarnessContractError(f"immutable-prefix-violation:{normalized}")
    return normalized


def compute_candidate_digest(candidate: dict[str, Any]) -> str:
    payload = copy.deepcopy(candidate)
    payload.pop("candidate_digest", None)
    return sha256_hex(canonical_bytes(payload))


def validate_contract(contract: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(contract, dict):
        raise HarnessContractError("invalid-contract-type")
    required = {
        "schema",
        "contract_id",
        "workspace",
        "operation",
        "platform",
        "model_family",
        "toolchain_digest",
        "baseline_profile",
        "baseline_digest",
        "acceptance_ids",
        "negative_path_ids",
        "oracle_digest",
        "budget",
    }
    if set(contract.keys()) != required or contract.get("schema") != CONTRACT_SCHEMA:
        raise HarnessContractError("invalid-contract-schema")
    _require_id(contract["contract_id"], "contract_id")
    if not isinstance(contract["workspace"], str) or not contract["workspace"].strip():
        raise HarnessContractError("invalid-workspace")
    _require_id(contract["operation"], "operation")
    _require_id(contract["platform"], "platform")
    _require_id(contract["model_family"], "model_family")
    _require_sha256(contract["toolchain_digest"], "toolchain_digest")
    _require_id(contract["baseline_profile"], "baseline_profile")
    _require_sha256(contract["baseline_digest"], "baseline_digest")
    _require_sha256(contract["oracle_digest"], "oracle_digest")

    for key in ("acceptance_ids", "negative_path_ids"):
        items = contract.get(key)
        if not isinstance(items, list) or not 1 <= len(items) <= 32 or len(set(items)) != len(items):
            raise HarnessContractError(f"invalid-{key}")
        for item in items:
            _require_id(item, key)

    budget = contract.get("budget")
    budget_keys = {
        "max_initial_candidates",
        "max_composed_candidates",
        "max_total_rollouts",
        "max_memory_mib",
        "max_scratch_bytes",
        "timeout_seconds",
    }
    if not isinstance(budget, dict) or set(budget.keys()) != budget_keys:
        raise HarnessContractError("invalid-budget")
    if any(type(v) is not int for v in budget.values()):
        raise HarnessContractError("invalid-budget-types")
    if not (1 <= budget["max_initial_candidates"] <= 2):
        raise HarnessContractError("budget-initial-candidates-out-of-range")
    if not (0 <= budget["max_composed_candidates"] <= 1):
        raise HarnessContractError("budget-composed-candidates-out-of-range")
    if not (1 <= budget["max_total_rollouts"] <= 5):
        raise HarnessContractError("budget-total-rollouts-out-of-range")
    if not (64 <= budget["max_memory_mib"] <= 8192):
        raise HarnessContractError("budget-memory-out-of-range")
    if not (0 <= budget["max_scratch_bytes"] <= 536870912):
        raise HarnessContractError("budget-scratch-out-of-range")
    if not (1 <= budget["timeout_seconds"] <= 1800):
        raise HarnessContractError("budget-timeout-out-of-range")
    return contract


def validate_candidate(contract: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    validate_contract(contract)
    if not isinstance(candidate, dict):
        raise HarnessContractError("invalid-candidate-type")
    required = {
        "schema",
        "candidate_id",
        "contract_id",
        "origin",
        "parent_candidate_ids",
        "proposer_id",
        "surfaces",
        "touched_paths",
        "oracle_digest",
        "candidate_digest",
    }
    if set(candidate.keys()) != required or candidate.get("schema") != CANDIDATE_SCHEMA:
        raise HarnessContractError("invalid-candidate-schema")
    _require_id(candidate["candidate_id"], "candidate_id")
    if candidate["contract_id"] != contract["contract_id"]:
        raise HarnessContractError("candidate-contract-mismatch")
    origin = candidate.get("origin")
    if origin not in {"baseline", "proposed", "composed", "transferred"}:
        raise HarnessContractError("invalid-candidate-origin")
    parents = candidate.get("parent_candidate_ids")
    if not isinstance(parents, list) or len(parents) > 2 or len(set(parents)) != len(parents):
        raise HarnessContractError("invalid-parent-candidates")
    for pid in parents:
        _require_id(pid, "parent_candidate_id")
    if origin == "baseline" and len(parents) != 0:
        raise HarnessContractError("baseline-cannot-have-parents")
    if origin == "composed" and len(parents) != 2:
        raise HarnessContractError("composed-candidate-requires-two-parents")
    _require_id(candidate["proposer_id"], "proposer_id")

    if candidate.get("oracle_digest") != contract["oracle_digest"]:
        raise HarnessContractError("oracle-digest-mismatch")

    surfaces = candidate.get("surfaces")
    if not isinstance(surfaces, dict) or not set(surfaces.keys()).issubset(ALLOWED_SURFACES):
        raise HarnessContractError("disallowed-candidate-surface")

    if "skill_overlay" in surfaces:
        overlay = assert_mutable_path_allowed(surfaces["skill_overlay"])
        if not overlay.startswith("skills/"):
            raise HarnessContractError("skill-overlay-outside-skills-root")

    if "recipe_parameters" in surfaces:
        params = surfaces["recipe_parameters"]
        if not isinstance(params, dict) or len(params) > 16:
            raise HarnessContractError("invalid-recipe-parameters")
        for k, v in params.items():
            _require_id(k, "recipe-parameter-key")
            if type(v) not in (str, int, float, bool):
                raise HarnessContractError("invalid-recipe-parameter-value")
            if isinstance(v, str) and len(v) > 256:
                raise HarnessContractError("recipe-parameter-string-too-long")

    if "tool_routing_hint" in surfaces:
        hint = surfaces["tool_routing_hint"]
        if not isinstance(hint, str) or not 1 <= len(hint) <= 256:
            raise HarnessContractError("invalid-tool-routing-hint")

    if "bounded_context" in surfaces:
        ctx = surfaces["bounded_context"]
        if not isinstance(ctx, str) or len(ctx) > 2000:
            raise HarnessContractError("bounded-context-exceeds-2000-chars")

    if "script_proposal" in surfaces:
        script_rel = assert_mutable_path_allowed(surfaces["script_proposal"])
        if not script_rel.startswith(".forgewright/candidates/"):
            raise HarnessContractError("script-proposal-must-stay-in-candidates-quarantine")

    touched = candidate.get("touched_paths")
    if not isinstance(touched, list) or len(touched) > 32 or len(set(touched)) != len(touched):
        raise HarnessContractError("invalid-touched-paths")
    for p in touched:
        assert_mutable_path_allowed(p)

    expected_digest = compute_candidate_digest(candidate)
    if candidate.get("candidate_digest") != expected_digest:
        raise HarnessContractError("candidate-digest-mismatch")
    return candidate


def validate_probe(
    contract: dict[str, Any], candidate: dict[str, Any], probe: dict[str, Any]
) -> dict[str, Any]:
    validate_candidate(contract, candidate)
    if not isinstance(probe, dict):
        raise HarnessContractError("invalid-probe-type")
    required = {
        "schema",
        "probe_id",
        "contract_id",
        "candidate_id",
        "candidate_digest",
        "job_id",
        "state",
        "exit_code",
        "leases_released",
        "storage_quiescent",
        "passed_acceptance_ids",
        "passed_negative_path_ids",
        "failed_checks",
        "duration_ms",
        "tokens_used",
        "mutation_verified",
        "oracle_digest",
    }
    if set(probe.keys()) != required or probe.get("schema") != PROBE_SCHEMA:
        raise HarnessContractError("invalid-probe-schema")
    _require_id(probe["probe_id"], "probe_id")
    if probe["contract_id"] != contract["contract_id"]:
        raise HarnessContractError("probe-contract-mismatch")
    if probe["candidate_id"] != candidate["candidate_id"]:
        raise HarnessContractError("probe-candidate-mismatch")
    if probe["candidate_digest"] != candidate["candidate_digest"]:
        raise HarnessContractError("probe-candidate-digest-mismatch")
    if not isinstance(probe["job_id"], str) or not JOB_ID_RE.fullmatch(probe["job_id"]):
        raise HarnessContractError("invalid-probe-job-id")
    if probe["state"] not in {"quiescent", "cancelled", "quarantined", "rejected"}:
        raise HarnessContractError("invalid-probe-state")
    if type(probe["exit_code"]) is not int:
        raise HarnessContractError("invalid-probe-exit-code")
    if type(probe["leases_released"]) is not bool or type(probe["storage_quiescent"]) is not bool:
        raise HarnessContractError("invalid-probe-release-flags")
    if type(probe["mutation_verified"]) is not bool:
        raise HarnessContractError("invalid-probe-mutation-flag")
    if type(probe["duration_ms"]) is not int or probe["duration_ms"] < 0:
        raise HarnessContractError("invalid-probe-duration")
    if type(probe["tokens_used"]) is not int or probe["tokens_used"] < 0:
        raise HarnessContractError("invalid-probe-tokens")
    if probe["oracle_digest"] != contract["oracle_digest"]:
        raise HarnessContractError("probe-oracle-digest-mismatch")
    for key in ("passed_acceptance_ids", "passed_negative_path_ids", "failed_checks"):
        items = probe.get(key)
        if not isinstance(items, list) or len(set(items)) != len(items):
            raise HarnessContractError(f"invalid-{key}")
        for item in items:
            _require_id(item, key)
    if not set(probe["passed_acceptance_ids"]).issubset(contract["acceptance_ids"]):
        raise HarnessContractError("probe-unknown-acceptance-id")
    if not set(probe["passed_negative_path_ids"]).issubset(contract["negative_path_ids"]):
        raise HarnessContractError("probe-unknown-negative-path-id")
    return probe


def validate_transfer(contract: dict[str, Any], transfer: dict[str, Any]) -> dict[str, Any]:
    validate_contract(contract)
    if not isinstance(transfer, dict):
        raise HarnessContractError("invalid-transfer-type")
    required = {
        "schema",
        "transfer_id",
        "index_key",
        "source_contract_id",
        "winning_candidate",
        "winning_probe_id",
        "evidence_ref",
        "review_ref",
        "reviewer_id",
        "implementer_id",
        "stage",
        "offline_replay_passed",
        "canary_trials",
        "canary_failures",
    }
    if set(transfer.keys()) != required or transfer.get("schema") != TRANSFER_SCHEMA:
        raise HarnessContractError("invalid-transfer-schema")
    _require_id(transfer["transfer_id"], "transfer_id")
    if transfer["source_contract_id"] != contract["contract_id"]:
        raise HarnessContractError("transfer-contract-mismatch")
    validate_candidate(contract, transfer["winning_candidate"])
    _require_id(transfer["winning_probe_id"], "winning_probe_id")
    _require_id(transfer["reviewer_id"], "reviewer_id")
    _require_id(transfer["implementer_id"], "implementer_id")
    if transfer["reviewer_id"] == transfer["implementer_id"]:
        raise HarnessContractError("transfer-self-review-forbidden")
    index_key = transfer.get("index_key")
    key_fields = {"operation", "failure_class", "toolchain_digest", "platform", "model_family"}
    if not isinstance(index_key, dict) or set(index_key.keys()) != key_fields:
        raise HarnessContractError("invalid-transfer-index-key")
    _require_id(index_key["operation"], "index_operation")
    _require_id(index_key["failure_class"], "index_failure_class")
    _require_sha256(index_key["toolchain_digest"], "index_toolchain_digest")
    _require_id(index_key["platform"], "index_platform")
    _require_id(index_key["model_family"], "index_model_family")
    if transfer["stage"] not in {"context-only", "promoted", "demoted"}:
        raise HarnessContractError("invalid-transfer-stage")
    if type(transfer["offline_replay_passed"]) is not bool:
        raise HarnessContractError("invalid-transfer-replay-flag")
    if transfer["stage"] == "promoted" and not transfer["offline_replay_passed"]:
        raise HarnessContractError("promoted-transfer-requires-offline-replay")
    if (
        type(transfer["canary_trials"]) is not int
        or transfer["canary_trials"] < 0
        or type(transfer["canary_failures"]) is not int
        or transfer["canary_failures"] < 0
    ):
        raise HarnessContractError("invalid-transfer-canary-counts")
    return transfer
