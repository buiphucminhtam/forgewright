#!/usr/bin/env python3
"""
scripts/runtime/jev_adapter.py
Optional, default-off System-1 model (Jev / TypeSafe) adapter for ambiguous skill routing.
Part of goal FW-CODEX-EFF-20260913 (amendment EFF-20260918, work package EFF-07).

Rules:
1. Default-off: never calls external service unless explicitly enabled.
2. Hard budget limit: budget must be > 0 USD to execute, default 0.0.
3. Pinned version: rejects unpinned 'latest' alias.
4. Schema-locked: strict candidate shortlist, returns Choice with confidence.
5. Fail-safe fallback: timeout, error, low confidence, or abstention always fall back to local router.
6. Zero sensitive data transmission: only generic task intent and skill candidate names.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Sequence

SUPPORTED_PINNED_VERSIONS = frozenset({"jev-1.13.0", "jev-1.12.4"})
DEFAULT_CONFIDENCE_THRESHOLD = 0.85
MAX_INPUT_CHARS = 1000
MAX_TIMEOUT_SECONDS = 0.5


@dataclass(frozen=True)
class JevRoutingDecision:
    status: str  # "selected" | "abstain" | "fallback" | "disabled" | "budget_exceeded"
    selected_skill: str | None
    confidence: float | None
    model_version: str | None
    latency_ms: float
    cost_usd: float
    reason: str


class JevSkillRouterAdapter:
    def __init__(
        self,
        *,
        enabled: bool | None = None,
        api_key: str | None = None,
        model_version: str | None = None,
        budget_usd: float | None = None,
        confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
        timeout_seconds: float = MAX_TIMEOUT_SECONDS,
    ):
        self.enabled = (
            enabled
            if enabled is not None
            else os.getenv("FORGEWRIGHT_JEV_ENABLED", "false").lower() == "true"
        )
        self.api_key = api_key or os.getenv("TYPESAFE_API_KEY", "")
        self.model_version = model_version or os.getenv(
            "FORGEWRIGHT_JEV_VERSION", "jev-1.13.0"
        )

        env_budget = os.getenv("FORGEWRIGHT_JEV_BUDGET_USD", "0.0")
        try:
            self.budget_usd = (
                budget_usd if budget_usd is not None else float(env_budget)
            )
        except ValueError:
            self.budget_usd = 0.0

        self.confidence_threshold = confidence_threshold
        self.timeout_seconds = timeout_seconds
        self.spent_usd = 0.0

    def route_candidate(
        self,
        *,
        task_intent: str,
        candidates: Sequence[str],
        simulator_response: dict[str, Any] | None = None,
    ) -> JevRoutingDecision:
        start_time = time.monotonic()

        if not self.enabled:
            return JevRoutingDecision(
                status="disabled",
                selected_skill=None,
                confidence=None,
                model_version=self.model_version,
                latency_ms=0.0,
                cost_usd=0.0,
                reason="Jev adapter is default-off (FORGEWRIGHT_JEV_ENABLED!=true)",
            )

        if not self.api_key and simulator_response is None:
            return JevRoutingDecision(
                status="disabled",
                selected_skill=None,
                confidence=None,
                model_version=self.model_version,
                latency_ms=0.0,
                cost_usd=0.0,
                reason="Missing TYPESAFE_API_KEY credentials",
            )

        if self.model_version not in SUPPORTED_PINNED_VERSIONS:
            return JevRoutingDecision(
                status="fallback",
                selected_skill=None,
                confidence=None,
                model_version=self.model_version,
                latency_ms=0.0,
                cost_usd=0.0,
                reason=f"Model version {self.model_version!r} not in approved pinned versions",
            )

        if self.budget_usd <= 0.0 or (self.spent_usd >= self.budget_usd):
            return JevRoutingDecision(
                status="budget_exceeded",
                selected_skill=None,
                confidence=None,
                model_version=self.model_version,
                latency_ms=0.0,
                cost_usd=0.0,
                reason=f"Budget constraint: spent {self.spent_usd:.4f} >= budget {self.budget_usd:.4f} USD",
            )

        task_intent.strip()[:MAX_INPUT_CHARS]
        valid_candidates = [c.strip() for c in candidates if c and c.strip()]
        if not valid_candidates:
            return JevRoutingDecision(
                status="fallback",
                selected_skill=None,
                confidence=None,
                model_version=self.model_version,
                latency_ms=0.0,
                cost_usd=0.0,
                reason="Candidate list is empty",
            )

        # Full choice space includes explicit abstention
        list(valid_candidates) + ["NONE", "ESCALATE"]

        # If a mock/simulator response is provided (e.g. for offline evaluation or tests)
        if simulator_response is not None:
            chosen = simulator_response.get("choice")
            conf = float(simulator_response.get("confidence", 0.0))
            call_cost = float(simulator_response.get("cost_usd", 0.00004))
            self.spent_usd += call_cost
            elapsed_ms = (time.monotonic() - start_time) * 1000

            if chosen in ("NONE", "ESCALATE"):
                return JevRoutingDecision(
                    status="abstain",
                    selected_skill=None,
                    confidence=conf,
                    model_version=self.model_version,
                    latency_ms=elapsed_ms,
                    cost_usd=call_cost,
                    reason=f"Model explicitly abstained with choice {chosen}",
                )

            if conf < self.confidence_threshold:
                return JevRoutingDecision(
                    status="fallback",
                    selected_skill=None,
                    confidence=conf,
                    model_version=self.model_version,
                    latency_ms=elapsed_ms,
                    cost_usd=call_cost,
                    reason=f"Confidence {conf:.2f} below threshold {self.confidence_threshold:.2f}",
                )

            if chosen in valid_candidates:
                return JevRoutingDecision(
                    status="selected",
                    selected_skill=chosen,
                    confidence=conf,
                    model_version=self.model_version,
                    latency_ms=elapsed_ms,
                    cost_usd=call_cost,
                    reason=f"Selected candidate {chosen} with confidence {conf:.2f}",
                )

            return JevRoutingDecision(
                status="fallback",
                selected_skill=None,
                confidence=conf,
                model_version=self.model_version,
                latency_ms=elapsed_ms,
                cost_usd=call_cost,
                reason=f"Returned option {chosen!r} not in valid candidate pool",
            )

        # Live provider call with fail-closed exception handling
        try:
            # Here we would invoke httpx / urllib with timeout_seconds.
            # In offline or non-credentialed runs, fail safe to local fallback.
            return JevRoutingDecision(
                status="fallback",
                selected_skill=None,
                confidence=None,
                model_version=self.model_version,
                latency_ms=(time.monotonic() - start_time) * 1000,
                cost_usd=0.0,
                reason="Live provider network calls are disabled in local sandbox; safe fallback active",
            )
        except Exception as err:
            return JevRoutingDecision(
                status="fallback",
                selected_skill=None,
                confidence=None,
                model_version=self.model_version,
                latency_ms=(time.monotonic() - start_time) * 1000,
                cost_usd=0.0,
                reason=f"Provider call failed safely: {err}",
            )
