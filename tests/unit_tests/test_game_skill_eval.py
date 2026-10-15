"""Contract replays exercise validators; they never prove live agent uplift."""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def module():
    spec = importlib.util.spec_from_file_location(
        "game_skill_eval", ROOT / "scripts/runtime/game_skill_eval.py"
    )
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def test_game_role_corpora_include_pressure_and_negative_triggers():
    sys.path.insert(0, str(ROOT / "scripts/runtime"))
    import skill_quality as quality

    for skill in ("game-designer", "game-engineer", "art-director", "qa-engineer"):
        rows = quality.read_jsonl(
            ROOT / f"evals/skills/{skill}/scenarios.jsonl", quality.validate_scenario
        )
        assert any(row["critical"] and row["pressure_tags"] for row in rows)
        assert any(not row["should_trigger"] for row in rows)


def test_contract_repeats_execute_fresh_and_stay_ineligible(tmp_path):
    m = module()
    # This is intentionally a contract fixture, not a model-generated game.
    c = {
        "schema": "game-reference-contract/v1",
        "id": "fixture",
        "referenceBuild": "a" * 64,
        "seed": 7,
        "environment": {},
        "fields": ["score"],
        "tolerances": {},
        "approvedPolish": ["shadow"],
        "inputs": [{"id": "win", "action": "observe"}],
        "expected": [{"id": "win", "state": {"score": 3}}],
    }
    contract = tmp_path / "contract.json"
    contract.write_text(json.dumps(c))
    # The independent Node validator owns canonical hashing, not these labels.
    import hashlib

    def digest(x):
        return hashlib.sha256(
            json.dumps(
                x, sort_keys=True, separators=(",", ":"), ensure_ascii=False
            ).encode()
        ).hexdigest()

    def capture(build):
        return {
            "schema": "game-reference-capture/v1",
            "build": build,
            "seed": 7,
            "environment": {},
            "contractSha256": digest(c),
            "inputSha256": digest(c["inputs"]),
            "observations": c["expected"],
            "quiescence": "confirmed",
            "engineCapability": "observed",
            "playtest": {
                "kind": "automated-public-input",
                "build": build,
                "completed": True,
            },
        }

    ref = tmp_path / "reference.json"
    ref.write_text(json.dumps(capture("a" * 64)))
    cand = tmp_path / "candidate.json"
    cand.write_text(json.dumps(capture("b" * 64)))
    report = m.evaluate_contract(
        contract=contract,
        reference=ref,
        candidate=cand,
        current_build="b" * 64,
        repeats=3,
    )
    assert report["status"] == "PASS"
    assert len({row["execution_id"] for row in report["runs"]}) == 9
    assert report["actual_verifier_calls"] == 9
    assert report["model_calls"] == 0
    assert report["promotion_eligible"] is False
    assert all(row["cache"] == "disabled" for row in report["runs"])
    broken = capture("b" * 64)
    broken["observations"] = [{"id": "win", "state": {"score": 999}}]
    cand.write_text(json.dumps(broken))
    assert (
        m.evaluate_contract(
            contract=contract,
            reference=ref,
            candidate=cand,
            current_build="b" * 64,
            repeats=1,
        )["status"]
        == "FAIL"
    )


def test_contract_report_cannot_promote_even_with_trusted_callback(tmp_path):
    sys.path.insert(0, str(ROOT / "scripts/runtime"))
    import skill_quality as q

    with pytest.raises(q.SkillQualityError, match="contract|synthetic"):
        q.promote_candidate(
            root=tmp_path,
            report={"evaluation_kind": "contract-replay"},
            candidate=tmp_path / "candidate.md",
            target=tmp_path / "skills/debugger/LITE.md",
            verify_observed=lambda _: True,
        )
