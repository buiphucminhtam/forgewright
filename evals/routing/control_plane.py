#!/usr/bin/env python3
"""Fail-closed shadow, canary, rollout, and review gates for model routing."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import math
import os
import re
from collections import Counter
from dataclasses import asdict
from pathlib import Path
from typing import Any

import corpus as corpus_source


TIER_RANK = {"scout": 0, "builder": 1, "expert": 2}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REQUIRED_METADATA = (
    "cost_unit",
    "provider",
    "model",
    "resolved_snapshot",
    "verifier_fingerprint",
    "baseline_run_id",
    "candidate_run_id",
)


def sign_evidence(evidence: dict[str, Any], key: bytes) -> str:
    """Return an HMAC over the canonical envelope, excluding its signature field."""
    if len(key) < 32:
        raise ValueError("attestation key must contain at least 32 bytes")
    unsigned = {
        name: value
        for name, value in evidence.items()
        if name != "attestation_hmac_sha256"
    }
    payload = json.dumps(
        unsigned,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return hmac.new(key, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _verify_attestation(evidence: dict[str, Any], key: bytes | None) -> None:
    if key is None:
        raise ValueError("a trust-anchored attestation key is required")
    signature = evidence.get("attestation_hmac_sha256")
    if not isinstance(signature, str) or SHA256_RE.fullmatch(signature) is None:
        raise ValueError("attestation_hmac_sha256 must be a lowercase SHA-256 digest")
    try:
        expected = sign_evidence(evidence, key)
    except (TypeError, ValueError) as error:
        raise ValueError(f"evidence cannot be canonically attested: {error}") from error
    if not hmac.compare_digest(signature, expected):
        raise ValueError("evidence attestation is invalid")


def corpus_fingerprint() -> str:
    """Use the corpus-native fingerprint when available, otherwise freeze its payload."""
    native = getattr(corpus_source, "corpus_fingerprint", None)
    if callable(native):
        return str(native())
    payload = json.dumps(
        [asdict(task) for task in corpus_source.build_corpus()],
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _common(evidence: object) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    if not isinstance(evidence, dict):
        raise ValueError("evidence must be an object")
    if evidence.get("schema_version") != 1:
        raise ValueError("schema_version must be 1")
    for field in REQUIRED_METADATA:
        if not isinstance(evidence.get(field), str) or not evidence[field].strip():
            raise ValueError(f"{field} is required")
    if evidence.get("execution_mode") != "live":
        raise ValueError("execution_mode must be live")
    if evidence.get("corpus_fingerprint") != corpus_fingerprint():
        raise ValueError("corpus_fingerprint does not match the frozen corpus")
    mode = evidence.get("mode")
    if mode not in {"shadow", "canary", "rollout"}:
        raise ValueError(f"unsupported mode: {mode}")
    records = evidence.get("records")
    if not isinstance(records, list) or not all(
        isinstance(item, dict) for item in records
    ):
        raise ValueError("records must be an array of objects")
    tasks = {task.id: task for task in corpus_source.build_corpus()}
    ids = [record.get("task_id") for record in records]
    if any(task_id not in tasks for task_id in ids):
        raise ValueError("records contain an unknown task_id")
    if len(ids) != len(set(ids)):
        raise ValueError("records contain duplicate task_id values")
    return mode, records, tasks


def _require_exact_corpus(records: list[dict[str, Any]], tasks: dict[str, Any]) -> None:
    if {record["task_id"] for record in records} != set(tasks):
        raise ValueError("records must cover the exact frozen corpus")


def _validate_baseline(record: dict[str, Any]) -> None:
    if (
        not isinstance(record.get("execution_id"), str)
        or not record["execution_id"].strip()
    ):
        raise ValueError("execution_id is required")
    for field in (
        "input_sha256",
        "baseline_output_sha256",
        "candidate_output_sha256",
        "verifier_result_sha256",
    ):
        if (
            not isinstance(record.get(field), str)
            or SHA256_RE.fullmatch(record[field]) is None
        ):
            raise ValueError(f"{field} must be a lowercase SHA-256 digest")
    if record.get("baseline_tier") != "expert":
        raise ValueError("baseline must be strong-model-only")
    if record.get("baseline_verifier_passed") is not True:
        raise ValueError("baseline verifier must pass for every task")
    if (
        not isinstance(record.get("baseline_cost"), (int, float))
        or not math.isfinite(record["baseline_cost"])
        or record["baseline_cost"] <= 0
    ):
        raise ValueError("baseline_cost must be positive")
    if record.get("selected_tier") not in TIER_RANK:
        raise ValueError("selected_tier is invalid")


def _shadow(records: list[dict[str, Any]], tasks: dict[str, Any]) -> dict[str, Any]:
    _require_exact_corpus(records, tasks)
    for record in records:
        _validate_baseline(record)
        if (
            not isinstance(record.get("predicted_cost"), (int, float))
            or not math.isfinite(record["predicted_cost"])
            or record["predicted_cost"] < 0
        ):
            raise ValueError("predicted_cost must be non-negative")
    correct = sum(
        record["selected_tier"] == tasks[record["task_id"]].expected_tier
        for record in records
    )
    under_routed = sum(
        TIER_RANK[record["selected_tier"]]
        < TIER_RANK[tasks[record["task_id"]].expected_tier]
        for record in records
    )
    baseline_cost = sum(float(record["baseline_cost"]) for record in records)
    predicted_cost = sum(float(record["predicted_cost"]) for record in records)
    precision = correct / len(records)
    return {
        "route_precision": precision,
        "under_routed": under_routed,
        "baseline_cost": baseline_cost,
        "predicted_cost": predicted_cost,
        "predicted_savings_rate": (baseline_cost - predicted_cost) / baseline_cost,
        "canary_eligible": precision >= 0.98
        and under_routed == 0
        and predicted_cost <= baseline_cost,
    }


def _canary(records: list[dict[str, Any]], tasks: dict[str, Any]) -> dict[str, Any]:
    if len(records) != max(1, len(tasks) // 10):
        raise ValueError("canary must contain exactly 10% of the frozen corpus")
    selected_categories = Counter(
        tasks[record["task_id"]].category for record in records
    )
    corpus_categories = {task.category for task in tasks.values()}
    if set(selected_categories) != corpus_categories or any(
        count != 1 for count in selected_categories.values()
    ):
        raise ValueError("canary must represent every corpus category exactly once")
    for record in records:
        _validate_baseline(record)
        if not isinstance(record.get("candidate_verifier_passed"), bool):
            raise ValueError("candidate_verifier_passed must be boolean")
        if not isinstance(record.get("safety_regression"), bool):
            raise ValueError("safety_regression must be boolean")
    category_drops: dict[str, float] = {}
    for category in {tasks[record["task_id"]].category for record in records}:
        selected = [
            record
            for record in records
            if tasks[record["task_id"]].category == category
        ]
        baseline_rate = sum(
            record["baseline_verifier_passed"] for record in selected
        ) / len(selected)
        candidate_rate = sum(
            record["candidate_verifier_passed"] for record in selected
        ) / len(selected)
        category_drops[category] = max(0.0, baseline_rate - candidate_rate)
    return {
        "canary_share": len(records) / len(tasks),
        "category_quality_drops": category_drops,
        "safety_regressions": sum(record["safety_regression"] for record in records),
        "canary_passed": max(category_drops.values(), default=0.0) <= 0.02
        and not any(record["safety_regression"] for record in records),
    }


def _rollout(records: list[dict[str, Any]], tasks: dict[str, Any]) -> dict[str, Any]:
    _require_exact_corpus(records, tasks)
    for record in records:
        _validate_baseline(record)
        if record.get("initial_tier") not in TIER_RANK:
            raise ValueError("initial_tier is invalid")
        if not isinstance(record.get("escalation_count"), int) or isinstance(
            record["escalation_count"], bool
        ):
            raise ValueError("escalation_count must be an integer")
        for field in (
            "verifier_passed",
            "safety_regression",
            "escalated",
            "re_escalated",
            "independent_review",
            "review_found_defect",
        ):
            if not isinstance(record.get(field), bool):
                raise ValueError(f"{field} must be boolean")
        for field in ("review_cost", "avoided_defect_cost"):
            if (
                not isinstance(record.get(field), (int, float))
                or not math.isfinite(record[field])
                or record[field] < 0
            ):
                raise ValueError(f"{field} must be non-negative")
        if record["re_escalated"] and not record["escalated"]:
            raise ValueError("re_escalated requires escalated")
        tier_delta = (
            TIER_RANK[record["selected_tier"]] - TIER_RANK[record["initial_tier"]]
        )
        if tier_delta < 0:
            raise ValueError("selected_tier cannot be lower than initial_tier")
        if record["escalation_count"] != tier_delta:
            raise ValueError("escalation_count must equal the tier transition")
        if record["escalated"] != (tier_delta >= 1):
            raise ValueError("escalated must reflect the tier transition")
        if record["re_escalated"] != (tier_delta == 2):
            raise ValueError("re_escalated must reflect a two-tier transition")
        has_review_evidence = (
            record["review_found_defect"]
            or record["review_cost"] > 0
            or record["avoided_defect_cost"] > 0
        )
        if has_review_evidence and not record["independent_review"]:
            raise ValueError("review evidence requires independent_review")
        if (
            record["independent_review"]
            and record["avoided_defect_cost"] <= record["review_cost"]
        ):
            raise ValueError(
                "avoided_defect_cost must exceed review_cost for each independent review"
            )
    total = len(records)
    non_expert_share = (
        sum(record["initial_tier"] != "expert" for record in records) / total
    )
    escalation_rate = sum(record["escalated"] for record in records) / total
    re_escalation_rate = sum(record["re_escalated"] for record in records) / total
    reviewed = [record for record in records if record["independent_review"]]
    defects = sum(record["review_found_defect"] for record in reviewed)
    review_cost = sum(float(record["review_cost"]) for record in reviewed)
    avoided_cost = sum(float(record["avoided_defect_cost"]) for record in reviewed)
    review_gate = {
        "reviewed": len(reviewed),
        "review_precision": defects / len(reviewed) if reviewed else 0.0,
        "review_cost": review_cost,
        "avoided_defect_cost": avoided_cost,
        "marginal_value_positive": all(
            record["avoided_defect_cost"] > record["review_cost"] for record in reviewed
        ),
    }
    rollout_passed = (
        non_expert_share >= 0.70
        and 0.10 <= escalation_rate <= 0.25
        and re_escalation_rate <= 0.05
        and all(record["verifier_passed"] for record in records)
        and not any(record["safety_regression"] for record in records)
        and not any(
            TIER_RANK[record["selected_tier"]]
            < TIER_RANK[tasks[record["task_id"]].expected_tier]
            for record in records
        )
        and review_gate["marginal_value_positive"]
    )
    return {
        "non_expert_share": non_expert_share,
        "escalation_rate": escalation_rate,
        "re_escalation_rate": re_escalation_rate,
        "review_gate": review_gate,
        "rollout_passed": rollout_passed,
    }


def evaluate_control_plane(
    evidence: object, attestation_key: bytes | None = None
) -> dict[str, Any]:
    mode, records, tasks = _common(evidence)
    report = {
        "schema_version": 1,
        "mode": mode,
        "corpus_fingerprint": corpus_fingerprint(),
    }
    if mode == "shadow":
        report.update(_shadow(records, tasks))
    elif mode == "canary":
        report.update(_canary(records, tasks))
    else:
        report.update(_rollout(records, tasks))
    _verify_attestation(evidence, attestation_key)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args()
    try:
        key_value = os.environ.get("FORGEWRIGHT_ROUTING_EVIDENCE_KEY")
        key = key_value.encode("utf-8") if key_value is not None else None
        report = evaluate_control_plane(
            json.loads(args.evidence.read_text(encoding="utf-8")), key
        )
    except (OSError, json.JSONDecodeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(report, indent=2, sort_keys=True))
    gate = report.get(
        "canary_eligible",
        report.get("canary_passed", report.get("rollout_passed", False)),
    )
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
