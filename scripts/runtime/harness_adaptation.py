#!/usr/bin/env python3
"""Within-Task Harness2 adaptation loop: Propose -> Probe -> Compose -> Select.

Enforces three-role separation:
1. HarnessProposer (untrusted candidate generation & bounded synthesis only)
2. HarnessController (contract lock, rollout budget, isolated scratch execution)
3. HarnessVerifierSelector (5-step Lexicographic Gate with baseline tie-break)
"""

from __future__ import annotations

import copy
from pathlib import Path
import tempfile
from typing import Any, Callable

from harness_contracts import (
    CANDIDATE_SCHEMA,
    HarnessContractError,
    compute_candidate_digest,
    validate_candidate,
    validate_contract,
    validate_probe,
)


def make_candidate(
    contract: dict[str, Any],
    *,
    candidate_id: str,
    origin: str,
    proposer_id: str,
    surfaces: dict[str, Any],
    touched_paths: list[str] | None = None,
    parent_candidate_ids: list[str] | None = None,
) -> dict[str, Any]:
    validate_contract(contract)
    record: dict[str, Any] = {
        "schema": CANDIDATE_SCHEMA,
        "candidate_id": candidate_id,
        "contract_id": contract["contract_id"],
        "origin": origin,
        "parent_candidate_ids": list(parent_candidate_ids or []),
        "proposer_id": proposer_id,
        "surfaces": copy.deepcopy(surfaces),
        "touched_paths": list(touched_paths or []),
        "oracle_digest": contract["oracle_digest"],
    }
    record["candidate_digest"] = compute_candidate_digest(record)
    return validate_candidate(contract, record)


class HarnessProposer:
    """Role 1: Generates and composes untrusted harness candidates without execution authority."""

    def __init__(self, proposer_id: str = "harness2-proposer") -> None:
        self.proposer_id = proposer_id

    def baseline_candidate(self, contract: dict[str, Any]) -> dict[str, Any]:
        return make_candidate(
            contract,
            candidate_id=f"{contract['contract_id']}-baseline",
            origin="baseline",
            proposer_id=self.proposer_id,
            surfaces={},
            touched_paths=[],
            parent_candidate_ids=[],
        )

    def propose_candidates(
        self,
        contract: dict[str, Any],
        proposals: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        validate_contract(contract)
        limit = contract["budget"]["max_initial_candidates"]
        if len(proposals) > limit:
            raise HarnessContractError("initial-candidate-budget-exceeded")
        validated: list[dict[str, Any]] = []
        seen_surfaces: set[str] = set()
        for idx, spec in enumerate(proposals):
            cid = spec.get("candidate_id") or f"{contract['contract_id']}-cand-{idx + 1}"
            origin = spec.get("origin", "proposed")
            if origin not in {"proposed", "transferred"}:
                raise HarnessContractError("invalid-initial-candidate-origin")
            candidate = make_candidate(
                contract,
                candidate_id=cid,
                origin=origin,
                proposer_id=spec.get("proposer_id", self.proposer_id),
                surfaces=spec.get("surfaces", {}),
                touched_paths=spec.get("touched_paths", []),
                parent_candidate_ids=spec.get("parent_candidate_ids", []),
            )
            surf_key = compute_candidate_digest({"surfaces": candidate["surfaces"], "touched_paths": candidate["touched_paths"]})
            if surf_key in seen_surfaces:
                raise HarnessContractError("duplicate-candidate-harness")
            seen_surfaces.add(surf_key)
            validated.append(candidate)
        return validated

    def compose_candidate(
        self,
        contract: dict[str, Any],
        candidates_by_id: dict[str, dict[str, Any]],
        probes: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        """Synthesize a single composed candidate when two probes show complementary progress."""
        validate_contract(contract)
        if contract["budget"]["max_composed_candidates"] < 1 or len(probes) < 2:
            return None
        quiescent = [
            p for p in probes
            if p["state"] == "quiescent"
            and p["leases_released"]
            and p["storage_quiescent"]
            and p["oracle_digest"] == contract["oracle_digest"]
        ]
        if len(quiescent) < 2:
            return None

        best_pair: tuple[dict[str, Any], dict[str, Any]] | None = None
        best_union_score = -1
        for i in range(len(quiescent)):
            for j in range(i + 1, len(quiescent)):
                p1, p2 = quiescent[i], quiescent[j]
                acc1, acc2 = set(p1["passed_acceptance_ids"]), set(p2["passed_acceptance_ids"])
                neg1, neg2 = set(p1["passed_negative_path_ids"]), set(p2["passed_negative_path_ids"])
                union_acc = acc1 | acc2
                union_neg = neg1 | neg2
                complementary = (
                    len(union_acc) > max(len(acc1), len(acc2))
                    or len(union_neg) > max(len(neg1), len(neg2))
                    or (set(p1["failed_checks"]) != set(p2["failed_checks"]) and bool(union_acc))
                )
                if complementary:
                    score = len(union_acc) * 100 + len(union_neg) * 10
                    if score > best_union_score:
                        best_union_score = score
                        best_pair = (p1, p2)

        if best_pair is None:
            return None

        p1, p2 = best_pair
        c1 = candidates_by_id[p1["candidate_id"]]
        c2 = candidates_by_id[p2["candidate_id"]]
        s1, s2 = c1["surfaces"], c2["surfaces"]

        merged_surfaces: dict[str, Any] = {}
        # Prefer primary candidate's skill_overlay / tool_routing_hint, falling back to secondary.
        for key in ("skill_overlay", "tool_routing_hint", "script_proposal"):
            if key in s1:
                merged_surfaces[key] = s1[key]
            elif key in s2:
                merged_surfaces[key] = s2[key]

        if "recipe_parameters" in s1 or "recipe_parameters" in s2:
            params = dict(s2.get("recipe_parameters", {}))
            params.update(s1.get("recipe_parameters", {}))
            merged_surfaces["recipe_parameters"] = dict(list(params.items())[:16])

        ctx_parts = [s.strip() for s in (s1.get("bounded_context", ""), s2.get("bounded_context", "")) if s.strip()]
        if ctx_parts:
            deduped: list[str] = []
            for part in ctx_parts:
                if part not in deduped:
                    deduped.append(part)
            merged_surfaces["bounded_context"] = chr(10).join(deduped)[:2000]

        merged_touched = sorted(set(c1["touched_paths"]) | set(c2["touched_paths"]))[:32]
        return make_candidate(
            contract,
            candidate_id=f"{contract['contract_id']}-composed-1",
            origin="composed",
            proposer_id=self.proposer_id,
            surfaces=merged_surfaces,
            touched_paths=merged_touched,
            parent_candidate_ids=[c1["candidate_id"], c2["candidate_id"]],
        )


class HarnessVerifierSelector:
    """Role 3: 5-step Lexicographic Gate with non-regression and baseline tie-break."""

    BENEFIT_THRESHOLD_RATIO = 0.85  # >= 15% reduction in tokens or duration

    @classmethod
    def passes_validity_gate(cls, contract: dict[str, Any], probe: dict[str, Any]) -> bool:
        return (
            probe.get("state") == "quiescent"
            and probe.get("exit_code") == 0
            and probe.get("leases_released") is True
            and probe.get("storage_quiescent") is True
            and probe.get("oracle_digest") == contract["oracle_digest"]
        )

    @classmethod
    def passes_non_regression_gate(cls, contract: dict[str, Any], probe: dict[str, Any]) -> bool:
        if not cls.passes_validity_gate(contract, probe):
            return False
        required_acc = set(contract["acceptance_ids"])
        required_neg = set(contract["negative_path_ids"])
        return (
            required_acc.issubset(probe.get("passed_acceptance_ids", []))
            and required_neg.issubset(probe.get("passed_negative_path_ids", []))
            and len(probe.get("failed_checks", [])) == 0
        )

    @classmethod
    def passes_confidence_gate(cls, contract: dict[str, Any], probe: dict[str, Any]) -> bool:
        return cls.passes_non_regression_gate(contract, probe) and probe.get("mutation_verified") is True

    @classmethod
    def passes_benefit_gate(
        cls,
        contract: dict[str, Any],
        baseline_probe: dict[str, Any],
        candidate_probe: dict[str, Any],
    ) -> bool:
        if not cls.passes_confidence_gate(contract, candidate_probe):
            return False
        # Strict non-regression against baseline-passing cases (cannot swap failures)
        base_acc = set(baseline_probe.get("passed_acceptance_ids", []))
        cand_acc = set(candidate_probe.get("passed_acceptance_ids", []))
        if not base_acc.issubset(cand_acc):
            return False
        # Case 1: Candidate passes strictly more acceptance cases than baseline and passes full confidence gate
        if not cls.passes_confidence_gate(contract, baseline_probe):
            return len(cand_acc) > len(base_acc) or len(candidate_probe.get("passed_negative_path_ids", [])) > len(baseline_probe.get("passed_negative_path_ids", []))
        # Case 2: Equal 100% pass count; require integer >=1500 bps (15%) reduction in tokens or duration
        # and zero baseline metric cannot establish relative savings.
        base_tokens = baseline_probe["tokens_used"]
        base_dur = baseline_probe["duration_ms"]
        if base_tokens <= 0 or base_dur <= 0:
            return False
        cand_tokens = candidate_probe["tokens_used"]
        cand_dur = candidate_probe["duration_ms"]
        token_gain = (10000 * cand_tokens <= 8500 * base_tokens) and (10000 * cand_dur <= 10500 * base_dur)
        dur_gain = (10000 * cand_dur <= 8500 * base_dur) and (10000 * cand_tokens <= 10500 * base_tokens)
        return token_gain or dur_gain

    @classmethod
    def select_winner(
        cls,
        contract: dict[str, Any],
        baseline_candidate: dict[str, Any],
        baseline_probe: dict[str, Any],
        candidates_by_id: dict[str, dict[str, Any]],
        candidate_probes: list[dict[str, Any]],
    ) -> dict[str, Any]:
        validate_probe(contract, baseline_candidate, baseline_probe)
        qualifying: list[dict[str, Any]] = []
        for probe in candidate_probes:
            cand = candidates_by_id[probe["candidate_id"]]
            validate_probe(contract, cand, probe)
            if cls.passes_benefit_gate(contract, baseline_probe, probe):
                qualifying.append(probe)

        if not qualifying:
            baseline_valid = cls.passes_confidence_gate(contract, baseline_probe)
            return {
                "selected_candidate": baseline_candidate,
                "selected_probe": baseline_probe,
                "selected_origin": "baseline",
                "verified_pass": baseline_valid,
                "reason": "tie-break-to-baseline" if baseline_valid else "no-candidate-passed-gates",
            }

        qualifying.sort(
            key=lambda p: (
                len(p["passed_acceptance_ids"]),
                len(p["passed_negative_path_ids"]),
                -p["tokens_used"],
                -p["duration_ms"],
                p["candidate_id"],
            ),
            reverse=True,
        )
        winner_probe = qualifying[0]
        winner_cand = candidates_by_id[winner_probe["candidate_id"]]
        return {
            "selected_candidate": winner_cand,
            "selected_probe": winner_probe,
            "selected_origin": winner_cand["origin"],
            "verified_pass": True,
            "reason": "lexicographic-gate-winner",
        }


class HarnessController:
    """Role 2: Locks contract, bounds rollout count, and runs probes in isolated scratch."""

    def __init__(
        self,
        contract: dict[str, Any],
        probe_runner: Callable[[dict[str, Any], dict[str, Any], Path], dict[str, Any]],
        proposer: HarnessProposer | None = None,
    ) -> None:
        self.contract = copy.deepcopy(validate_contract(contract))
        self._locked_digest = compute_candidate_digest(
            {"contract": self.contract, "candidate_digest": ""}
        )
        self.probe_runner = probe_runner
        self.proposer = proposer or HarnessProposer()
        self.rollouts = 0

    def _verify_contract_locked(self) -> None:
        current_digest = compute_candidate_digest(
            {"contract": self.contract, "candidate_digest": ""}
        )
        if current_digest != self._locked_digest:
            raise HarnessContractError("contract-mutated-during-adaptation")

    def _run_single_probe(self, candidate: dict[str, Any]) -> dict[str, Any]:
        self._verify_contract_locked()
        validate_candidate(self.contract, candidate)
        if self.rollouts >= self.contract["budget"]["max_total_rollouts"]:
            raise HarnessContractError("rollout-budget-exceeded")
        self.rollouts += 1
        workspace = Path(self.contract["workspace"])
        scratch_root = workspace / ".forgewright" / "runtime" / "build-jobs"
        scratch_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="harness2-probe-", dir=scratch_root) as scratch_dir:
            raw_probe = self.probe_runner(self.contract, candidate, Path(scratch_dir))
        probe = validate_probe(self.contract, candidate, raw_probe)
        self._verify_contract_locked()
        return probe

    def run_within_task_loop(
        self,
        initial_proposals: list[dict[str, Any]],
        *,
        enable_compose: bool = True,
    ) -> dict[str, Any]:
        self._verify_contract_locked()
        baseline_cand = self.proposer.baseline_candidate(self.contract)
        baseline_probe = self._run_single_probe(baseline_cand)

        candidates_by_id: dict[str, dict[str, Any]] = {
            baseline_cand["candidate_id"]: baseline_cand
        }
        candidate_probes: list[dict[str, Any]] = []

        proposed = self.proposer.propose_candidates(self.contract, initial_proposals)
        for cand in proposed:
            candidates_by_id[cand["candidate_id"]] = cand
            probe = self._run_single_probe(cand)
            candidate_probes.append(probe)

        composed_cand = None
        if (
            enable_compose
            and self.contract["budget"]["max_composed_candidates"] >= 1
            and self.rollouts < self.contract["budget"]["max_total_rollouts"]
        ):
            composed_cand = self.proposer.compose_candidate(
                self.contract, candidates_by_id, candidate_probes
            )
            if composed_cand is not None:
                candidates_by_id[composed_cand["candidate_id"]] = composed_cand
                composed_probe = self._run_single_probe(composed_cand)
                candidate_probes.append(composed_probe)

        selection = HarnessVerifierSelector.select_winner(
            self.contract,
            baseline_cand,
            baseline_probe,
            candidates_by_id,
            candidate_probes,
        )
        return {
            "contract_id": self.contract["contract_id"],
            "rollouts_used": self.rollouts,
            "baseline_probe": baseline_probe,
            "candidate_probes": candidate_probes,
            "composed_candidate": composed_cand,
            **selection,
        }
