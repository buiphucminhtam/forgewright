#!/usr/bin/env python3
"""Deterministic, provider-neutral policy for bounded parallel orchestration."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


HIGH_RISK = {"security", "schema", "public-api", "concurrency"}
STOP_CONDITIONS = [
    "duplicate_findings",
    "scope_covered",
    "same_blocker_twice",
    "advisory_token_budget",
    "deadline_cap",
]


class PolicyError(ValueError):
    """Raised when a policy request is structurally invalid."""


def _positive_int(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise PolicyError(f"{name} must be a positive integer")
    return value


def _nonnegative_int(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise PolicyError(f"{name} must be a non-negative integer")
    return value


def _scopes(request: dict[str, Any]) -> list[dict[str, Any]]:
    scopes = request.get("scopes", [])
    if not isinstance(scopes, list) or not all(
        isinstance(scope, dict) for scope in scopes
    ):
        raise PolicyError("scopes must be an array of objects")
    seen: set[str] = set()
    for scope in scopes:
        scope_id = scope.get("id")
        paths = scope.get("paths")
        risks = scope.get("risk_signals", [])
        if not isinstance(scope_id, str) or not scope_id or scope_id in seen:
            raise PolicyError("scope ids must be unique non-empty strings")
        if (
            not isinstance(paths, list)
            or not paths
            or not all(isinstance(path, str) and path for path in paths)
        ):
            raise PolicyError(f"scope {scope_id} paths must be non-empty strings")
        if not isinstance(risks, list) or not all(
            isinstance(signal, str) for signal in risks
        ):
            raise PolicyError(f"scope {scope_id} risk_signals must be strings")
        seen.add(scope_id)
    return scopes


def _role(scope: dict[str, Any], *, disagreement: bool, mechanical: bool) -> str:
    if mechanical:
        return "scout"
    normalized = {
        signal.lower().replace("_", "-").replace(" ", "-")
        for signal in scope.get("risk_signals", [])
    }
    if disagreement or normalized & HIGH_RISK:
        return "expert"
    return "builder"


def decide_orchestration(request: dict[str, Any]) -> dict[str, Any]:
    """Return a deterministic worker/reviewer decision without calling a provider."""
    if not isinstance(request, dict):
        raise PolicyError("request must be an object")
    if request.get("hard_token_cap") is True:
        raise PolicyError("hard token cap is unavailable for the AGY runtime")
    scopes = _scopes(request)
    limits = request.get("limits", {})
    if not isinstance(limits, dict):
        raise PolicyError("limits must be an object")
    if limits.get("hard_token_cap") is True:
        raise PolicyError("hard token cap is unavailable for the AGY runtime")
    concurrency = _nonnegative_int(limits.get("concurrency", 1), "limits.concurrency")
    remaining = _nonnegative_int(
        limits.get("remaining_token_budget", 1), "limits.remaining_token_budget"
    )
    per_worker = _positive_int(
        limits.get("worker_token_budget", 1), "limits.worker_token_budget"
    )
    deadline_ms = _positive_int(limits.get("deadline_ms", 30_000), "limits.deadline_ms")
    budget_slots = remaining // per_worker
    reviewer_requested = request.get("independent_review") is True
    reviewer_reserved_budget_slots = 1 if reviewer_requested else 0
    if reviewer_reserved_budget_slots > budget_slots:
        raise PolicyError("insufficient token budget for requested independent review")
    worker_budget_slots = budget_slots - reviewer_reserved_budget_slots
    mechanical = request.get("mechanical_inventory") is True
    disagreement = request.get("disagreement") is True

    selected: list[dict[str, Any]] = []
    reason = "no_parallel_benefit"
    if request.get("task_size") == "small":
        reason = "small_task"
    elif request.get("serial") is True:
        reason = "serial_dependency"
    elif mechanical:
        if scopes and concurrency >= 1 and worker_budget_slots >= 1:
            selected = scopes[:1]
            reason = "mechanical_inventory"
        else:
            reason = "insufficient_capacity"
    else:
        independent = [scope for scope in scopes if scope.get("independent") is True]
        cap = min(len(independent), concurrency, worker_budget_slots, 3)
        if cap >= 2:
            selected = independent[:cap]
            reason = "independent_scopes"
        elif independent:
            reason = "parallel_minimum_not_met"

    workers = [
        {
            "id": f"worker-{index + 1}",
            "scope_id": scope["id"],
            "paths": list(scope["paths"]),
            "role": _role(scope, disagreement=disagreement, mechanical=mechanical),
            "token_budget": per_worker,
            "token_budget_enforcement": "advisory",
            "deadline_ms": deadline_ms,
            "recursive_spawn": False,
        }
        for index, scope in enumerate(selected)
    ]

    reviewer = None
    if reviewer_requested:
        reviewer = {
            "role": "expert",
            "token_budget": per_worker,
            "token_budget_enforcement": "advisory",
            "packet": {
                "requirements": deepcopy(request.get("requirements", "")),
                "diff": deepcopy(request.get("diff", "")),
                "raw_evidence": deepcopy(request.get("raw_evidence", [])),
            },
            "recursive_spawn": False,
        }

    return {
        "version": 1,
        "task_id": request.get("task_id", "task"),
        "decision_reason": reason,
        "worker_count": len(workers),
        "workers": workers,
        "reviewer": reviewer,
        "token_budget_enforcement": "advisory",
        "stop_conditions": list(STOP_CONDITIONS),
        "caps": {
            "scope_count": len(scopes),
            "concurrency": concurrency,
            "budget_slots": budget_slots,
            "worker_budget_slots": worker_budget_slots,
            "reviewer_reserved_budget_slots": reviewer_reserved_budget_slots,
            "hard_worker_cap": 3,
        },
    }
