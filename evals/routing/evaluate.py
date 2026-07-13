#!/usr/bin/env python3
"""Evaluate shadow/canary routing decisions against the frozen routing corpus."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

try:
    from .corpus import (
        CORPUS_VERSION,
        RoutingEvalTask,
        build_corpus,
        corpus_fingerprint,
    )
except ImportError:  # Supports direct invocation: python evals/routing/evaluate.py
    from corpus import CORPUS_VERSION, RoutingEvalTask, build_corpus, corpus_fingerprint


TIER_RANK = {"scout": 0, "builder": 1, "expert": 2}
Z_95 = 1.959963984540054


def wilson_interval(successes: int, total: int) -> dict[str, float]:
    """Return a two-sided 95% Wilson score interval for a binomial rate."""
    if total <= 0:
        raise ValueError("Wilson interval total must be positive")
    if successes < 0 or successes > total:
        raise ValueError("Wilson interval successes must be between 0 and total")
    proportion = successes / total
    z_squared = Z_95**2
    denominator = 1 + z_squared / total
    centre = (proportion + z_squared / (2 * total)) / denominator
    margin = (
        Z_95
        * math.sqrt(proportion * (1 - proportion) / total + z_squared / (4 * total**2))
        / denominator
    )
    return {
        "lower": max(0.0, centre - margin),
        "upper": min(1.0, centre + margin),
    }


def _validate_decisions(
    decisions: object, expected: dict[str, RoutingEvalTask]
) -> dict[str, dict[str, Any]]:
    """Validate a complete router output before calculating any metric."""
    if not isinstance(decisions, list):
        raise ValueError("decisions must be a JSON array")

    observed: dict[str, dict[str, Any]] = {}
    for index, decision in enumerate(decisions):
        if not isinstance(decision, dict):
            raise ValueError(f"decision at index {index} must be an object")
        task_id = decision.get("task_id")
        if not isinstance(task_id, str) or task_id not in expected:
            raise ValueError(f"unknown task_id: {task_id}")
        if task_id in observed:
            raise ValueError(f"duplicate task_id: {task_id}")
        tier = decision.get("selected_tier")
        if not isinstance(tier, str) or tier not in TIER_RANK:
            raise ValueError(f"invalid selected_tier for {task_id}: {tier}")
        observed[task_id] = decision

    missing = sorted(set(expected) - set(observed))
    if missing:
        raise ValueError(f"missing routing decisions: {missing}")
    return observed


def evaluate(decisions: object) -> dict[str, object]:
    """Evaluate one complete, local shadow/canary routing decision set."""
    expected = {task.id: task for task in build_corpus()}
    observed = _validate_decisions(decisions, expected)

    correct = 0
    under_routed = 0
    expert_count = 0
    category_stats: dict[str, dict[str, int | float]] = {}
    for task_id, task in expected.items():
        selected = str(observed[task_id]["selected_tier"])
        correct += int(selected == task.expected_tier)
        under_routed += int(TIER_RANK[selected] < TIER_RANK[task.expected_tier])
        expert_count += int(selected == "expert")
        stats = category_stats.setdefault(
            task.category,
            {"total": 0, "correct": 0, "under_routed": 0, "accuracy": 0.0},
        )
        stats["total"] += 1
        stats["correct"] += int(selected == task.expected_tier)
        stats["under_routed"] += int(
            TIER_RANK[selected] < TIER_RANK[task.expected_tier]
        )

    for stats in category_stats.values():
        stats["accuracy"] = stats["correct"] / stats["total"]
        stats["accuracy_ci95"] = wilson_interval(stats["correct"], stats["total"])

    total = len(expected)
    return {
        "total": total,
        "corpus_version": CORPUS_VERSION,
        "corpus_sha256": corpus_fingerprint(),
        "accuracy": correct / total,
        "under_routed": under_routed,
        "expert_share": expert_count / total,
        "non_expert_share": (total - expert_count) / total,
        "categories": category_stats,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("decisions", type=Path)
    parser.add_argument("--min-accuracy", type=float, default=0.95)
    parser.add_argument("--max-under-routed", type=int, default=0)
    args = parser.parse_args()
    if not 0.0 <= args.min_accuracy <= 1.0:
        parser.error("--min-accuracy must be between 0.0 and 1.0")
    if args.max_under_routed < 0:
        parser.error("--max-under-routed must be non-negative")
    try:
        decisions = json.loads(args.decisions.read_text(encoding="utf-8"))
        report = evaluate(decisions)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(report, indent=2, sort_keys=True))
    return int(
        report["accuracy"] < args.min_accuracy
        or report["under_routed"] > args.max_under_routed
    )


if __name__ == "__main__":
    raise SystemExit(main())
