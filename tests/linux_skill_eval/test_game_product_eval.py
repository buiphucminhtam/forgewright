"""Synthetic contract checks only; no consumer/player/business evidence is issued."""

import copy
import hashlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/runtime"))
import game_product_eval as product  # noqa: E402
from .test_skill_eval_verify import registry as make_registry  # noqa: E402


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


@pytest.fixture
def sample(tmp_path):
    registry, manifest, runs, _ = make_registry(tmp_path)
    shared = {key: digest(key) for key in product.PAIR_BINDINGS}
    arms = {}
    for arm in ("current", "candidate"):
        run = next(run for run in runs if run.record["arm"] == arm)
        instructions = json.loads((run.output_dir / "manifest.json").read_bytes())[
            "instruction_manifest"
        ]
        instruction_digest = hashlib.sha256(
            json.dumps(
                {"instruction_manifest": instructions},
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            ).encode()
        ).hexdigest()
        output = digest(arm + " output")
        arms[arm] = {
            **shared,
            "run_id": run.run_id,
            "instruction_manifest_digest": instruction_digest,
            "host_manifest_digest": run.manifest_digest,
            "output_tree_digest": output,
            "rendered_build_digest": None,
            "authorized_output_tree_digests": [output],
        }
    return (
        {
            "schema": "product-eval-plan/v1",
            "task_id": "original-minimal-task",
            "consumer_id": "original-fixture",
            "registry_plan_digest": manifest.digest,
            **shared,
            "arms": arms,
            "requested_axes": list(product.PRODUCT_AXES),
            "primary_novice_measure": None,
            "baseline_defects": [],
        },
        registry,
        runs,
    )


def evaluate(sample, refs=()):
    plan, registry, _ = sample
    return product.evaluate_product_evidence(
        plan, registry=registry, observation_refs=refs
    )


def test_missing_render_metric_is_unverified_not_fallback(sample):
    result = evaluate(sample)
    assert result["axes"]["render"]["status"] == "UNVERIFIED"
    assert result["axes"]["render"]["measurements"] == {}
    assert result["scoped_task"]["status"] == "UNVERIFIED"
    assert not result["comparative_improvement"]


@pytest.mark.parametrize("field", product.PAIR_BINDINGS)
def test_different_consumer_baselines_or_protected_rules_cannot_be_paired(
    sample, field
):
    plan, _, _ = sample
    plan["arms"]["candidate"][field] = digest("different")
    with pytest.raises(ValueError, match=field):
        product.validate_product_plan(plan)


def test_authorized_different_arm_output_trees_can_be_paired(sample):
    plan, _, _ = sample
    validated = product.validate_product_plan(plan)
    assert (
        validated["arms"]["current"]["output_tree_digest"]
        != validated["arms"]["candidate"]["output_tree_digest"]
    )
    assert evaluate(sample)["pairing"]["status"] == "VALID"
    plan["arms"]["candidate"]["authorized_output_tree_digests"] = [digest("other")]
    with pytest.raises(ValueError, match="authorized"):
        product.validate_product_plan(plan)


@pytest.mark.parametrize("label", ("observed", "human", "business"))
def test_relabelled_model_or_fixture_observation_has_no_trusted_receipt(sample, label):
    _, _, runs = sample
    forged = json.dumps(
        {
            "source_class": label,
            "observer": "independent-human",
            "run_id": runs[-1].run_id,
            "value": 1,
        }
    )
    result = evaluate(sample, (forged, runs[-1].run_id))
    assert len(result["rejected_observations"]) == 2
    assert not result["accepted_agent_decisions"]
    assert all(axis["status"] == "UNVERIFIED" for axis in result["axes"].values())
    with pytest.raises(ValueError, match="reference"):
        evaluate(sample, ({"source_class": label},))


def test_synthetic_human_or_business_observation_cannot_certify_outcome(sample):
    plan, _, _ = sample
    result = evaluate(sample, ("synthetic-human-perfect", "synthetic-revenue-positive"))
    assert result["axes"]["player_comprehension"]["status"] == "UNVERIFIED"
    assert result["axes"]["business"]["status"] == "UNVERIFIED"
    assert result["readiness"]["status"] == "UNVERIFIED"
    plan["observations"] = [{"source_class": "human", "value": 100}]
    with pytest.raises(ValueError, match="fields"):
        product.validate_product_plan(plan)


def test_comprehension_does_not_pass_native_or_revenue_axes(sample):
    plan, _, _ = sample
    plan["requested_axes"] = ["player_comprehension"]
    result = evaluate(sample)
    assert result["axes"]["native"]["status"] == "UNVERIFIED"
    assert result["axes"]["business"]["status"] == "UNVERIFIED"
    assert not result["axes"]["native"]["requested"]
    assert result["readiness"]["status"] == "UNVERIFIED"


def test_second_exposure_cannot_be_primary_novice_measure(sample):
    plan, _, _ = sample
    plan["primary_novice_measure"] = {
        "endpoint": "independently perform mechanic",
        "role": "player",
        "assignments": [
            {"participant_id": "fixture-person", "arm": "current", "exposure_number": 1}
        ],
    }
    product.validate_product_plan(plan)
    plan["primary_novice_measure"]["assignments"][0]["exposure_number"] = 2
    with pytest.raises(ValueError, match="first exposure"):
        product.validate_product_plan(plan)
    plan["primary_novice_measure"]["assignments"][0]["exposure_number"] = 1
    plan["primary_novice_measure"]["assignments"].append(
        {"participant_id": "fixture-person", "arm": "candidate", "exposure_number": 1}
    )
    with pytest.raises(ValueError, match="participant"):
        product.validate_product_plan(plan)


def test_out_of_scope_baseline_defect_remains_in_readiness_verdict(sample):
    plan, _, _ = sample
    defect = {
        "id": "fixture-unimplemented-mode",
        "source": "original-fixture:1",
        "reproduction_status": "not-reproduced",
        "impact": "mode unreachable",
        "owner": "fixture-owner",
        "disposition": "out-of-scope",
    }
    plan["baseline_defects"] = [defect]
    result = evaluate(sample)
    assert result["readiness"]["baseline_defects"] == [defect]
    assert result["readiness"]["status"] == "UNVERIFIED"
    plan["baseline_defects"][0]["reproduction_status"] = "reproduced"
    result = evaluate(sample)
    assert result["readiness"]["status"] == "FAIL"
    assert result["scoped_task"]["status"] == "UNVERIFIED"


def test_real_agent_decision_receipt_cannot_be_attached_to_unrelated_arm(
    tmp_path, sample, monkeypatch
):
    # Test-only simulated host issuance from the verifier contract fixture. This
    # does not produce observed product evidence or a real human receipt.
    registry, manifest, runs, _ = make_registry(
        tmp_path / "other", eligible=True, monkeypatch=monkeypatch
    )
    plan = copy.deepcopy(sample[0])
    plan["registry_plan_digest"] = manifest.digest
    candidate = next(run for run in runs if run.record["arm"] == "candidate")
    receipt = registry.resolve_observation(
        candidate.run_id, plan_digest=manifest.digest
    )
    assert receipt is not None
    result = product.evaluate_product_evidence(
        plan, registry=registry, observation_refs=[candidate.run_id]
    )
    assert not result["accepted_agent_decisions"]
    assert (
        result["rejected_observations"][0]["reason"]
        == "run/source/host manifest binding mismatch"
    )
    row = plan["arms"]["candidate"]
    row.update(
        run_id=receipt.run_id,
        instruction_manifest_digest=receipt.source_digest,
        host_manifest_digest=receipt.build_digest,
    )
    result = product.evaluate_product_evidence(
        plan, registry=registry, observation_refs=[candidate.run_id]
    )
    assert result["accepted_agent_decisions"][0]["capabilities"] == ["agent-decision"]
    assert all(axis["status"] == "UNVERIFIED" for axis in result["axes"].values())
    # Host metadata does not supply a rendered build digest.
    assert row["rendered_build_digest"] is None
    (candidate.output_dir / "raw.stdout").write_text("changed")
    result = product.evaluate_product_evidence(
        plan, registry=registry, observation_refs=[candidate.run_id]
    )
    assert not result["accepted_agent_decisions"]


def test_plan_rejects_untyped_or_spoofed_registry(sample):
    plan, _, _ = sample
    with pytest.raises(ValueError, match="TrustedRunRegistry"):
        product.evaluate_product_evidence(
            plan, registry={"trusted": True}, observation_refs=[]
        )
    plan["arms"]["candidate"]["observer"] = "spoofed-independent-observer"
    with pytest.raises(ValueError, match="fields"):
        product.validate_product_plan(plan)
