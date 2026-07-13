#!/usr/bin/env python3
"""Produce privacy-safe, attested live routing evidence through JSON adapters."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
import tempfile
import time
import uuid
from collections import Counter, OrderedDict
from pathlib import Path
from typing import Any

from control_plane import TIER_RANK, corpus_fingerprint
from corpus import build_corpus


MAX_ADAPTER_OUTPUT = 64 * 1024
ADAPTER_TIMEOUT = 120


def _command(value: str) -> list[str]:
    parsed = json.loads(value)
    if (
        not isinstance(parsed, list)
        or not parsed
        or not all(isinstance(item, str) and item for item in parsed)
    ):
        raise ValueError("adapter command must be a non-empty JSON string array")
    return parsed


def _call(command: list[str], kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    result = subprocess.run(
        command,
        input=json.dumps(payload, ensure_ascii=False),
        capture_output=True,
        text=True,
        timeout=ADAPTER_TIMEOUT,
        env={**os.environ, "ADAPTER_KIND": kind},
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(
            f"{kind} adapter exited {result.returncode}; stderr suppressed"
        )
    if len(result.stdout.encode("utf-8")) > MAX_ADAPTER_OUTPUT:
        raise ValueError(f"{kind} adapter exceeded the output cap")
    try:
        response = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise ValueError(f"{kind} adapter returned invalid JSON") from error
    if not isinstance(response, dict):
        raise ValueError(f"{kind} adapter response must be an object")
    return response


def _digest(value: object) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _selected_tasks(mode: str) -> list[Any]:
    tasks = build_corpus()
    if mode != "canary":
        return tasks
    by_category: OrderedDict[str, Any] = OrderedDict()
    for task in tasks:
        by_category.setdefault(task.category, task)
    selected = list(by_category.values())
    corpus_counts = Counter(task.category for task in tasks)
    selected_counts = Counter(task.category for task in selected)
    if len(selected) * 10 != len(tasks) or any(
        selected_counts[category] * len(tasks) != count * len(selected)
        for category, count in corpus_counts.items()
    ):
        raise ValueError(
            "canary cannot form an exact proportionally stratified 10% sample"
        )
    return selected


def _require(response: dict[str, Any], fields: tuple[str, ...], source: str) -> None:
    for field in fields:
        if field not in response:
            raise ValueError(f"{source} response is missing {field}")


def _provider_call(
    command: list[str], task: Any, tier: str, role: str
) -> dict[str, Any]:
    response = _call(
        command,
        "provider",
        {"task_id": task.id, "prompt": task.prompt, "tier": tier, "role": role},
    )
    _require(
        response,
        (
            "output",
            "provider",
            "model",
            "resolved_snapshot",
            "execution_id",
            "cost",
            "cost_unit",
        ),
        "provider",
    )
    if not isinstance(response["output"], str) or not response["output"]:
        raise ValueError("provider output must be a non-empty string")
    if (
        isinstance(response["cost"], bool)
        or not isinstance(response["cost"], (int, float))
        or not math.isfinite(response["cost"])
        or response["cost"] <= 0
    ):
        raise ValueError("provider cost must be positive")
    if not isinstance(response["cost_unit"], str) or not response["cost_unit"].strip():
        raise ValueError("provider cost_unit is required")
    return response


def _verify(command: list[str], task: Any, role: str, output: str) -> dict[str, Any]:
    response = _call(
        command,
        "verifier",
        {
            "task_id": task.id,
            "prompt": task.prompt,
            "expected_tier": task.expected_tier,
            "role": role,
            "output": output,
        },
    )
    _require(
        response,
        (
            "passed",
            "safety_regression",
            "verifier",
            "resolved_snapshot",
            "execution_id",
        ),
        "verifier",
    )
    if not isinstance(response["passed"], bool) or not isinstance(
        response["safety_regression"], bool
    ):
        raise ValueError("verifier fields must be boolean")
    return response


def build_evidence(
    mode: str, router: list[str], provider: list[str], verifier: list[str]
) -> dict[str, Any]:
    run_id = f"live-{int(time.time())}-{uuid.uuid4().hex[:12]}"
    records: list[dict[str, Any]] = []
    metadata: tuple[str, str, str] | None = None
    verifier_metadata: tuple[str, str] | None = None
    cost_unit: str | None = None
    for task in _selected_tasks(mode):
        route = _call(
            router,
            "router",
            {
                "task_id": task.id,
                "category": task.category,
                "prompt": task.prompt,
                "expected_tier": task.expected_tier,
            },
        )
        _require(route, ("initial_tier", "selected_tier", "escalation_count"), "router")
        if (
            route["initial_tier"] not in TIER_RANK
            or route["selected_tier"] not in TIER_RANK
        ):
            raise ValueError("router tiers are invalid")
        if isinstance(route["escalation_count"], bool) or not isinstance(
            route["escalation_count"], int
        ):
            raise ValueError("router escalation_count must be an integer")
        tier_delta = (
            TIER_RANK[route["selected_tier"]] - TIER_RANK[route["initial_tier"]]
        )
        if tier_delta < 0 or route["escalation_count"] != tier_delta:
            raise ValueError(
                "router escalation_count must equal the upward tier transition"
            )
        baseline = _provider_call(provider, task, "expert", "baseline")
        candidate = _provider_call(provider, task, route["selected_tier"], "candidate")
        baseline_verifier = _verify(verifier, task, "baseline", baseline["output"])
        candidate_verifier = _verify(verifier, task, "candidate", candidate["output"])
        current_metadata = (
            candidate["provider"],
            candidate["model"],
            candidate["resolved_snapshot"],
        )
        if metadata is None:
            metadata = current_metadata
        if (
            current_metadata != metadata
            or (baseline["provider"], baseline["model"], baseline["resolved_snapshot"])
            != metadata
        ):
            raise ValueError("provider metadata drifted within the comparable run")
        if cost_unit is None:
            cost_unit = candidate["cost_unit"]
        if candidate["cost_unit"] != cost_unit or baseline["cost_unit"] != cost_unit:
            raise ValueError("provider cost unit drifted within the comparable run")
        current_verifier = (
            candidate_verifier["verifier"],
            candidate_verifier["resolved_snapshot"],
        )
        if verifier_metadata is None:
            verifier_metadata = current_verifier
        if (
            current_verifier != verifier_metadata
            or (baseline_verifier["verifier"], baseline_verifier["resolved_snapshot"])
            != verifier_metadata
        ):
            raise ValueError("verifier metadata drifted within the comparable run")
        record = {
            "task_id": task.id,
            "baseline_tier": "expert",
            "baseline_verifier_passed": baseline_verifier["passed"],
            "baseline_cost": baseline["cost"],
            "selected_tier": route["selected_tier"],
            "execution_id": candidate["execution_id"],
            "input_sha256": _digest({"task_id": task.id, "prompt": task.prompt}),
            "baseline_output_sha256": _digest(baseline["output"]),
            "candidate_output_sha256": _digest(candidate["output"]),
            "verifier_result_sha256": _digest(
                {"baseline": baseline_verifier, "candidate": candidate_verifier}
            ),
            "baseline_execution_id": baseline["execution_id"],
            "baseline_verifier_execution_id": baseline_verifier["execution_id"],
            "candidate_verifier_execution_id": candidate_verifier["execution_id"],
            "candidate_cost": candidate["cost"],
        }
        if mode == "shadow":
            record["predicted_cost"] = candidate["cost"]
        elif mode == "canary":
            record.update(
                candidate_verifier_passed=candidate_verifier["passed"],
                safety_regression=candidate_verifier["safety_regression"],
            )
        else:
            record.update(
                initial_tier=route["initial_tier"],
                escalation_count=route["escalation_count"],
                escalated=route["escalation_count"] >= 1,
                re_escalated=route["escalation_count"] == 2,
                verifier_passed=candidate_verifier["passed"],
                safety_regression=candidate_verifier["safety_regression"],
                independent_review=bool(route.get("independent_review", False)),
                review_found_defect=bool(route.get("review_found_defect", False)),
                review_cost=float(route.get("review_cost", 0)),
                avoided_defect_cost=float(route.get("avoided_defect_cost", 0)),
            )
        records.append(record)
    assert (
        metadata is not None and verifier_metadata is not None and cost_unit is not None
    )
    evidence = {
        "schema_version": 1,
        "mode": mode,
        "execution_mode": "live",
        "cost_unit": cost_unit,
        "provider": metadata[0],
        "model": metadata[1],
        "resolved_snapshot": metadata[2],
        "corpus_fingerprint": corpus_fingerprint(),
        "verifier_fingerprint": _digest(
            {"verifier": verifier_metadata[0], "snapshot": verifier_metadata[1]}
        ),
        "baseline_run_id": f"{run_id}-baseline",
        "candidate_run_id": f"{run_id}-candidate",
        "records": records,
    }
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("shadow", "canary", "rollout"))
    parser.add_argument("--router-command-json", required=True)
    parser.add_argument("--provider-command-json", required=True)
    parser.add_argument("--verifier-command-json", required=True)
    parser.add_argument("--attester-command-json", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if os.environ.get("FORGEWRIGHT_LIVE_ROUTING") != "1":
        parser.error("set FORGEWRIGHT_LIVE_ROUTING=1 to authorize live routing calls")
    if os.environ.get("FORGEWRIGHT_ROUTING_EVIDENCE_KEY") is not None:
        parser.error("live producer must not receive the gatekeeper verification key")
    try:
        evidence = build_evidence(
            args.mode,
            _command(args.router_command_json),
            _command(args.provider_command_json),
            _command(args.verifier_command_json),
        )
        attestation = _call(
            _command(args.attester_command_json), "attester", {"evidence": evidence}
        )
        _require(attestation, ("attestation_hmac_sha256",), "attester")
        evidence["attestation_hmac_sha256"] = attestation["attestation_hmac_sha256"]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=args.output.parent, delete=False
        ) as handle:
            json.dump(
                evidence,
                handle,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
                allow_nan=False,
            )
            handle.write("\n")
            temporary = Path(handle.name)
        os.chmod(temporary, 0o600)
        temporary.replace(args.output)
    except (
        OSError,
        subprocess.SubprocessError,
        TypeError,
        ValueError,
        json.JSONDecodeError,
    ) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
