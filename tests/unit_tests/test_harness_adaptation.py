# ruff: noqa: E402
"""Unit, contract, hostile-fixture, and 5-Arm evaluation tests for Harness2 adaptation."""

from __future__ import annotations

import copy
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/runtime"))
sys.path.insert(0, str(ROOT / "scripts/eval"))

from harness_contracts import (
    CONTRACT_SCHEMA,
    PROBE_SCHEMA,
    HarnessContractError,
    assert_mutable_path_allowed,
    compute_candidate_digest,
    load_record,
    sha256_hex,
    validate_candidate,
)
from harness_adaptation import (
    HarnessController,
    HarnessProposer,
    HarnessVerifierSelector,
    make_candidate,
)
from harness_transfer import (
    promote_transfer_candidate,
    record_canary_outcome,
    retrieve_transfer_candidates,
    stage_transfer_candidate,
)
from harness_adaptation_eval import run_five_arm_evaluation


@pytest.fixture
def sample_contract(tmp_path: Path) -> dict:
    return {
        "schema": CONTRACT_SCHEMA,
        "contract_id": "test-contract-v1",
        "workspace": str(tmp_path),
        "operation": "typecheck",
        "platform": "darwin",
        "model_family": "gpt-6-astra",
        "toolchain_digest": sha256_hex(b"toolchain-v1"),
        "baseline_profile": "typecheck-v1",
        "baseline_digest": sha256_hex(b"baseline-v1"),
        "acceptance_ids": ["acc-1", "acc-2"],
        "negative_path_ids": ["neg-1"],
        "oracle_digest": sha256_hex(b"oracle-v1"),
        "budget": {
            "max_initial_candidates": 2,
            "max_composed_candidates": 1,
            "max_total_rollouts": 4,
            "max_memory_mib": 256,
            "max_scratch_bytes": 16777216,
            "timeout_seconds": 60,
        },
    }


def test_schema_file_is_valid_draft_2020_12():
    schema_path = ROOT / "schemas/harness-adaptation.v1.schema.json"
    data = json.loads(schema_path.read_text())
    assert data["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert set(data["$defs"].keys()) >= {"contract", "candidate", "probe", "transfer"}


@pytest.mark.parametrize(
    "forbidden_path",
    [
        "kernel/ENTRY.md",
        "kernel/VERIFY.md",
        "skills/_shared/protocols/guardrail.md",
        ".forgewright/execution-policy.yaml",
        "scripts/runtime/host_admission.py",
        "scripts/runtime/host_job_runner.py",
        "scripts/runtime/harness_contracts.py",
        "scripts/runtime/harness_adaptation.py",
        "scripts/runtime/harness_transfer.py",
        "scripts/eval/harness_adaptation_eval.py",
        "scripts/lite/verify_gate.py",
        "scripts/lite/evidence_common.py",
        "tests/unit_tests/test_harness_adaptation.py",
        "../outside.py",
        "/abs/path.py",
    ],
)
def test_immutable_boundary_blocks_protected_and_unsafe_paths(sample_contract, forbidden_path):
    with pytest.raises(HarnessContractError):
        assert_mutable_path_allowed(forbidden_path)
    with pytest.raises(HarnessContractError):
        make_candidate(
            sample_contract,
            candidate_id="bad-cand",
            origin="proposed",
            proposer_id="proposer",
            surfaces={"skill_overlay": "skills/debugger/LITE.md"},
            touched_paths=[forbidden_path],
        )


def test_load_record_rejects_duplicate_keys_and_oversized_payloads():
    raw_dup = b'{"a": 1, "a": 2}'
    with pytest.raises(HarnessContractError, match="duplicate-json-key"):
        load_record(raw_dup)
    with pytest.raises(HarnessContractError, match="record-size-out-of-bounds"):
        load_record(b"x" * 300000)


def test_oracle_weakening_and_duplicate_candidates_rejected(sample_contract):
    cand = make_candidate(
        sample_contract,
        candidate_id="cand-1",
        origin="proposed",
        proposer_id="proposer",
        surfaces={"bounded_context": "valid context"},
        touched_paths=["scripts/runtime/project_recipe.py"],
    )
    tampered = copy.deepcopy(cand)
    tampered["oracle_digest"] = sha256_hex(b"weakened-oracle")
    tampered["candidate_digest"] = compute_candidate_digest(tampered)
    with pytest.raises(HarnessContractError, match="oracle-digest-mismatch"):
        validate_candidate(sample_contract, tampered)

    proposer = HarnessProposer()
    spec = {
        "origin": "proposed",
        "surfaces": {"bounded_context": "identical"},
        "touched_paths": ["scripts/runtime/project_recipe.py"],
    }
    with pytest.raises(HarnessContractError, match="duplicate-candidate-harness"):
        proposer.propose_candidates(sample_contract, [spec, spec])


def test_within_task_composer_merges_complementary_candidates_and_wins(sample_contract):
    def runner(contract, candidate, scratch_dir):
        assert scratch_dir.is_dir()
        params = candidate["surfaces"].get("recipe_parameters", {})
        passed_acc = []
        failed = []
        if params.get("part_a"):
            passed_acc.append("acc-1")
        else:
            failed.append("fail-a")
        if params.get("part_b"):
            passed_acc.append("acc-2")
        else:
            failed.append("fail-b")
        all_ok = len(passed_acc) == 2
        return {
            "schema": PROBE_SCHEMA,
            "probe_id": f"probe-{candidate['candidate_id']}",
            "contract_id": contract["contract_id"],
            "candidate_id": candidate["candidate_id"],
            "candidate_digest": candidate["candidate_digest"],
            "job_id": "job-" + sha256_hex(candidate["candidate_id"].encode())[:32],
            "state": "quiescent",
            "exit_code": 0,
            "leases_released": True,
            "storage_quiescent": True,
            "passed_acceptance_ids": passed_acc,
            "passed_negative_path_ids": ["neg-1"],
            "failed_checks": [] if all_ok else failed,
            "duration_ms": 500,
            "tokens_used": 600,
            "mutation_verified": all_ok,
            "oracle_digest": contract["oracle_digest"],
        }

    controller = HarnessController(sample_contract, runner)
    proposals = [
        {
            "candidate_id": "cand-a",
            "origin": "proposed",
            "surfaces": {"recipe_parameters": {"part_a": True}, "bounded_context": "fix A"},
            "touched_paths": ["scripts/runtime/project_recipe.py"],
        },
        {
            "candidate_id": "cand-b",
            "origin": "proposed",
            "surfaces": {"recipe_parameters": {"part_b": True}, "bounded_context": "fix B"},
            "touched_paths": ["scripts/runtime/project_storage.py"],
        },
    ]
    result = controller.run_within_task_loop(proposals, enable_compose=True)
    assert result["verified_pass"] is True
    assert result["selected_origin"] == "composed"
    assert result["composed_candidate"]["parent_candidate_ids"] == ["cand-a", "cand-b"]
    assert result["rollouts_used"] == 4


def test_lexicographic_gate_ties_break_to_baseline_when_benefit_below_15_percent(sample_contract):
    proposer = HarnessProposer()
    base_cand = proposer.baseline_candidate(sample_contract)
    cand = make_candidate(
        sample_contract,
        candidate_id="cand-marginal",
        origin="proposed",
        proposer_id="proposer",
        surfaces={"recipe_parameters": {"minor": True}},
        touched_paths=["scripts/runtime/project_recipe.py"],
    )
    base_probe = {
        "schema": PROBE_SCHEMA,
        "probe_id": "probe-base",
        "contract_id": sample_contract["contract_id"],
        "candidate_id": base_cand["candidate_id"],
        "candidate_digest": base_cand["candidate_digest"],
        "job_id": "job-" + "1" * 32,
        "state": "quiescent",
        "exit_code": 0,
        "leases_released": True,
        "storage_quiescent": True,
        "passed_acceptance_ids": ["acc-1", "acc-2"],
        "passed_negative_path_ids": ["neg-1"],
        "failed_checks": [],
        "duration_ms": 1000,
        "tokens_used": 1000,
        "mutation_verified": True,
        "oracle_digest": sample_contract["oracle_digest"],
    }
    # Only 5% token reduction (< 15% threshold) -> must tie-break to baseline!
    cand_probe = {
        **base_probe,
        "probe_id": "probe-cand",
        "candidate_id": cand["candidate_id"],
        "candidate_digest": cand["candidate_digest"],
        "job_id": "job-" + "2" * 32,
        "tokens_used": 950,
    }
    decision = HarnessVerifierSelector.select_winner(
        sample_contract,
        base_cand,
        base_probe,
        {cand["candidate_id"]: cand},
        [cand_probe],
    )
    assert decision["selected_origin"] == "baseline"
    assert decision["reason"] == "tie-break-to-baseline"


def test_two_stage_transfer_promotion_and_canary_auto_demotion(sample_contract, tmp_path):
    cand = make_candidate(
        sample_contract,
        candidate_id="cand-winner",
        origin="composed",
        proposer_id="proposer",
        surfaces={"recipe_parameters": {"part_a": True, "part_b": True}, "bounded_context": "composed lesson"},
        touched_paths=["scripts/runtime/project_recipe.py"],
        parent_candidate_ids=["cand-a", "cand-b"],
    )
    staged = stage_transfer_candidate(
        tmp_path,
        sample_contract,
        transfer_id="transfer-1",
        failure_class="typecheck-drift",
        winning_candidate=cand,
        winning_probe_id="probe-winner",
        evidence_ref=".forgewright/verify/turn-1.json",
        review_ref=".forgewright/verify/review-2.json",
        reviewer_id="astra-reviewer",
        implementer_id="astra-implementer",
    )
    assert staged["stage"] == "context-only"
    # Unpromoted entry is not returned by promoted retrieval
    empty = retrieve_transfer_candidates(
        tmp_path,
        operation="typecheck",
        toolchain_digest=sample_contract["toolchain_digest"],
        platform="darwin",
        model_family="gpt-6-astra",
    )
    assert empty["status"] == "empty"

    # Self-review is rejected
    with pytest.raises(HarnessContractError, match="transfer-self-review-forbidden"):
        stage_transfer_candidate(
            tmp_path,
            sample_contract,
            transfer_id="transfer-bad",
            failure_class="typecheck-drift",
            winning_candidate=cand,
            winning_probe_id="probe-winner",
            evidence_ref=".forgewright/verify/turn-1.json",
            review_ref=".forgewright/verify/review-2.json",
            reviewer_id="same-actor",
            implementer_id="same-actor",
        )

    # Promote after offline replay + independent review-2
    promoted = promote_transfer_candidate(
        tmp_path,
        sample_contract,
        "transfer-1",
        replay_verifier=lambda c: c["candidate_id"] == "cand-winner",
        independent_review_approved=True,
    )
    assert promoted["stage"] == "promoted"

    # Cross-model retrieval succeeds within budget
    found = retrieve_transfer_candidates(
        tmp_path,
        operation="typecheck",
        toolchain_digest=sample_contract["toolchain_digest"],
        platform="darwin",
        model_family="gpt-6.1-sol",
        include_cross_model=True,
    )
    assert found["status"] == "retrieved"
    assert found["chars"] <= 2000
    assert len(found["items"]) == 1

    # Target-model canary failure automatically demotes entry
    demoted = record_canary_outcome(tmp_path, "transfer-1", succeeded=False, max_failures=1)
    assert demoted["stage"] == "demoted"
    after_demote = retrieve_transfer_candidates(
        tmp_path,
        operation="typecheck",
        toolchain_digest=sample_contract["toolchain_digest"],
        platform="darwin",
        model_family="gpt-6.1-sol",
    )
    assert after_demote["status"] == "empty"


def test_five_arm_evaluation_suite_passes_promotion_gate(tmp_path):
    report = run_five_arm_evaluation(tmp_path)
    assert report["promotion_gate_passed"] is True
    arms = report["arms"]
    assert arms["Arm_C_Within_Task_Compose"]["pass_rate"] - arms["Arm_E_Equal_Budget_Retry"]["pass_rate"] >= 0.10
    assert arms["Arm_D_Full_Harness2_Transfer"]["pass_rate"] - arms["Arm_E_Equal_Budget_Retry"]["pass_rate"] >= 0.10
    assert report["token_reduction_d_vs_c"] >= 0.25
