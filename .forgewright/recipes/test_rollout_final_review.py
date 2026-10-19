"""Focused task-owned review/permission regressions; no live authority writes."""

import copy
from contextlib import nullcontext
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def inputs(tmp_path, monkeypatch):
    module = load(
        "rollout_review_fixture", Path(__file__).with_name("rollout-final-review-v2.py")
    )
    report = tmp_path / "report.md"
    report.write_bytes(b"Actual independent findings.\n")
    decision_path = tmp_path / "decision.json"
    monkeypatch.setattr(module, "DECISION", decision_path)
    raw = b"actual pending evidence"
    record = {"tree_sha": "TREE:" + "a" * 64, "turn": "actual-turn"}
    decision = {
        "schema": "forgewright-independent-review-decision/v1",
        "reviewer_id": "independent",
        "approved": True,
        "report_sha256": hashlib.sha256(report.read_bytes()).hexdigest(),
        "evidence_sha256": hashlib.sha256(raw).hexdigest(),
        **record,
    }
    import re

    def demand(value, reason):
        if not value:
            raise RuntimeError(reason)

    controller = SimpleNamespace(
        REVIEWER="independent",
        REPORT=report,
        SHA=re.compile("[a-f0-9]{64}"),
        digest=lambda value: hashlib.sha256(value).hexdigest(),
        demand=demand,
        read=lambda path, limit: path.read_bytes(),
    )
    return (
        module,
        controller,
        SimpleNamespace(approve=True, reviewer_id="independent"),
        record,
        raw,
        decision,
        decision_path,
    )


def test_actual_report_and_exact_evidence_are_required(inputs):
    module, controller, args, record, raw, decision, path = inputs
    path.write_text(json.dumps(decision))
    assert module.review_inputs(controller, args, record, raw)


def test_rejects_different_records_with_identical_tree_and_turn(inputs):
    module, controller, _, record, _, _, _ = inputs
    original_record = {**record, "output_sha256": "a" * 64}
    changed_record = {**record, "output_sha256": "b" * 64}
    original = json.dumps(original_record).encode()
    controller.FINAL = Path("pending.json")
    controller.ROOT = Path(".")
    controller.read = lambda path, *limits: original
    common = SimpleNamespace(read_evidence_json=lambda *args, **kwargs: changed_record)
    with pytest.raises(RuntimeError, match="changed during read"):
        module.pending_snapshot(controller, common)


def test_rejects_late_pending_change_without_clobbering_it(inputs):
    module, controller, _, record, _, _, _ = inputs
    record["reviewer"] = {"status": "pending"}
    original = json.dumps(record).encode()
    changed = original + b"\n"
    controller.FINAL = Path("pending.json")
    writes = []
    controller.read = lambda path, *limits: changed
    controller.write = lambda *args: writes.append(args)
    with pytest.raises(RuntimeError, match="changed before approval"):
        module.prepare_approval(controller, record, original)
    assert record["reviewer"]["status"] == "pending"
    assert controller.read(controller.FINAL) == changed
    assert writes == []


def test_exact_pending_snapshot_can_be_approved(inputs):
    module, controller, _, record, _, _, _ = inputs
    record["reviewer"] = {"status": "pending"}
    original = json.dumps(record).encode()
    controller.FINAL = Path("pending.json")
    controller.ROOT = Path(".")
    controller.read = lambda path, *limits: original
    common = SimpleNamespace(
        read_evidence_json=lambda *args, **kwargs: copy.deepcopy(record)
    )
    snapshot, parsed = module.pending_snapshot(controller, common)
    module.prepare_approval(controller, parsed, snapshot)
    assert parsed["reviewer"]["status"] == "independent-approved"


@pytest.mark.parametrize(
    "damage",
    [
        "unapproved",
        "reviewer",
        "caller",
        "flag",
        "digest",
        "tree",
        "turn",
        "report",
        "report-type",
        "extra",
        "missing",
        "empty",
    ],
)
def test_rejects_unbound_or_missing_review(inputs, damage):
    module, controller, args, record, raw, decision, path = inputs
    if damage == "unapproved":
        decision["approved"] = False
    elif damage == "reviewer":
        decision["reviewer_id"] = "implementer"
    elif damage == "caller":
        args.reviewer_id = "implementer"
    elif damage == "flag":
        args.approve = False
    elif damage == "digest":
        decision["evidence_sha256"] = "0" * 64
    elif damage == "tree":
        decision["tree_sha"] = "TREE:" + "b" * 64
    elif damage == "turn":
        decision["turn"] = "stale-turn"
    elif damage == "report":
        decision["report_sha256"] = "0" * 64
    elif damage == "report-type":
        decision["report_sha256"] = None
    elif damage == "extra":
        decision["unrecognized"] = True
    elif damage == "missing":
        controller.REPORT.unlink()
    else:
        controller.REPORT.write_bytes(b"")
    path.write_text(json.dumps(decision))
    with pytest.raises((RuntimeError, FileNotFoundError)):
        module.review_inputs(controller, args, record, raw)


@pytest.mark.parametrize(
    "damage", ["valid", "digest", "late_digest", "enforcement", "canary"]
)
def test_retirement_only_contracts_known_preparation_permissions(
    tmp_path, monkeypatch, damage
):
    controller = load(
        "rollout_retirement_fixture",
        ROOT
        / ".forgewright/verify/resource-rollout-completion/validation-controller.py",
    )
    monkeypatch.setattr(controller, "ROOT", tmp_path)
    profiles = {
        "native-canary": "canary-digest",
        "cli-build": "cli-digest",
        "unrelated": "other-digest",
        "rollout-result-read-v3": "95832eb03f174f322d060899de934ad49441a6052f8305209a5a5f3453f10a47",
        "rollout-result-read-v4": "9ecae491eadf27b0fd8301eb13ec70af2a120f6585d0420d25f3083fd3d1c647",
        "rollout-inspection-v1": "f82a2509816161df95598f75f080b59bbf21ab35d3e25f7d1736f03d9e770965",
        "rollout-result-read-v5": "7405ad07a856ef8ccd9e491604b12bc9c4b1499e9f2c2bc95bb5ad55098e9a30",
        "rollout-docs-v1": "62428ca3dad4a7157526c1e0937494a6fcb90c2c17039a2d06708d71c2e91088",
    }
    if damage == "digest":
        profiles["rollout-result-read-v3"] = "changed"
    if damage == "late_digest":
        profiles["rollout-docs-v1"] = "changed"
    value = {
        "mode": "enforce",
        "phase": "enforce",
        "enforcement_verified": True,
        "profiles": profiles,
        "canary_profile": "native-canary",
        "native_proof": {"job_id": "preserved-proof"},
    }
    if damage == "enforcement":
        value["enforcement_verified"] = False
    if damage == "canary":
        value["canary_profile"] = "rollout-result-read-v3"
    initial = {str(tmp_path): value, "foreign": {"profiles": {"foreign": "kept"}}}
    saved = []
    deployed = SimpleNamespace(
        locked=lambda home: nullcontext(),
        registry=lambda home: copy.deepcopy(initial),
        validate_binding=lambda entry: None,
        save=lambda home, values: saved.append(values),
    )
    if damage != "valid":
        with pytest.raises(RuntimeError):
            controller.retire_preparation_profiles(tmp_path, deployed)
        assert saved == []
    else:
        assert sorted(
            controller.retire_preparation_profiles(tmp_path, deployed)
        ) == sorted(
            [
                "rollout-result-read-v3",
                "rollout-result-read-v4",
                "rollout-inspection-v1",
                "rollout-result-read-v5",
                "rollout-docs-v1",
            ]
        )
        assert saved[0][str(tmp_path)]["profiles"] == {
            k: profiles[k] for k in ("native-canary", "cli-build", "unrelated")
        }
        assert saved[0][str(tmp_path)]["native_proof"] == value["native_proof"]
        assert saved[0]["foreign"] == initial["foreign"]
