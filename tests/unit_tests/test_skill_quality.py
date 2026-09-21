from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/runtime/skill_quality.py"


def module():
    spec = importlib.util.spec_from_file_location("skill_quality", MODULE_PATH)
    assert spec and spec.loader
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def scenario(
    id_: str,
    *,
    trigger: bool = True,
    pressure: bool = False,
    critical: bool = False,
) -> dict:
    return {
        "schema": "forgewright-skill-eval-scenario/v1",
        "id": id_,
        "skill": "debugger",
        "prompt": f"scenario {id_}",
        "should_trigger": trigger,
        "required_events": ["reproduce"] if trigger else [],
        "forbidden_events": ["guess_fix"],
        "pressure_tags": ["deadline"] if pressure else [],
        "rationalization_traps": ["skip_repro"],
        "critical": critical,
    }


def result(id_: str, variant: str, *, good: bool = True, context: int = 1000) -> dict:
    return {
        "schema": "forgewright-skill-eval-result/v1",
        "scenario_id": id_,
        "skill": "debugger",
        "variant": variant,
        "triggered": True,
        "events": ["reproduce"] if good else ["guess_fix"],
        "rationalizations": [] if good else ["skip_repro"],
        "unnecessary_actions": [],
        "tool_calls": 2,
        "context_bytes": context,
        "wall_ms": 20,
        "abstained": False,
    }


def negative_result(id_: str, variant: str, *, good: bool = True) -> dict:
    return {
        "schema": "forgewright-skill-eval-result/v1",
        "scenario_id": id_,
        "skill": "debugger",
        "variant": variant,
        "triggered": False if good else True,
        "events": [],
        "rationalizations": [],
        "unnecessary_actions": [],
        "tool_calls": 0,
        "context_bytes": 100,
        "wall_ms": 1,
        "abstained": good,
    }


def test_promotion_requires_behavior_or_efficiency_improvement():
    m = module()
    scenarios = [
        m.validate_scenario(scenario("pressure", pressure=True)),
        m.validate_scenario(scenario("negative", trigger=False)),
    ]
    rows = []
    for arm in ("baseline", "current"):
        rows.extend(
            [
                m.validate_result(result("pressure", arm)),
                m.validate_result(negative_result("negative", arm)),
            ]
        )
    rows.extend(
        [
            m.validate_result(result("pressure", "candidate", context=800)),
            m.validate_result(negative_result("negative", "candidate")),
        ]
    )
    report = m.build_report(scenarios, rows)
    assert report["promotion"]["promotion_allowed"] is True
    assert report["promotion"]["efficiency_improved"] is True
    assert report["arms"]["candidate"]["pressure_success_rate"] == 1.0


def test_candidate_forbidden_or_rationalization_regression_blocks_promotion():
    m = module()
    scenarios = [
        m.validate_scenario(scenario("critical", pressure=True, critical=True))
    ]
    rows = [
        m.validate_result(result("critical", "baseline", good=False)),
        m.validate_result(result("critical", "current", good=True)),
        m.validate_result(result("critical", "candidate", good=False, context=1)),
    ]
    report = m.build_report(scenarios, rows)
    assert report["promotion"]["promotion_allowed"] is False
    assert "critical_forbidden_behavior" in report["promotion"]["blockers"]
    assert "regression:rationalization_rate" in report["promotion"]["blockers"]


def test_results_must_map_exactly_once_to_scenarios():
    m = module()
    scenarios = [m.validate_scenario(scenario("one"))]
    rows = [
        m.validate_result(result("one", "current")),
        m.validate_result(result("extra", "current")),
    ]
    with pytest.raises(m.SkillQualityError, match="map exactly once"):
        m.score_variant(scenarios, rows, "current")


def test_schema_rejects_unknown_fields_and_nontrigger_required_events():
    m = module()
    invalid = scenario("x")
    invalid["surprise"] = True
    with pytest.raises(m.SkillQualityError, match="unknown fields"):
        m.validate_scenario(invalid)
    invalid = scenario("x", trigger=False)
    invalid["required_events"] = ["reproduce"]
    with pytest.raises(m.SkillQualityError, match="non-trigger"):
        m.validate_scenario(invalid)


def test_runner_contract_executes_three_arms_without_provider_dependency(
    tmp_path: Path,
):
    m = module()
    scenario_path = tmp_path / "scenarios.jsonl"
    scenario_path.write_text(json.dumps(scenario("pressure", pressure=True)) + "\n")
    runner = tmp_path / "runner.py"
    runner.write_text(
        "import json,sys\n"
        "r=json.load(sys.stdin)\n"
        "candidate=r['variant']=='candidate'\n"
        "print(json.dumps({'triggered':True,'events':['reproduce'],'rationalizations':[],"
        "'unnecessary_actions':[],'tool_calls':2,'context_bytes':700 if candidate else 1000,"
        "'wall_ms':10,'abstained':False}))\n"
    )
    results, report = m.evaluate(
        [m.validate_scenario(scenario("pressure", pressure=True))],
        [sys.executable, str(runner)],
        current_skill=None,
        candidate_skill=None,
    )
    assert [row["variant"] for row in results] == ["baseline", "current", "candidate"]
    assert report["promotion"]["promotion_allowed"] is True


def test_repository_debugger_pressure_corpus_is_valid_and_balanced():
    m = module()
    rows = m.read_jsonl(
        ROOT / "evals/skills/debugger/scenarios.jsonl", m.validate_scenario
    )
    assert len(rows) >= 6
    assert any(row["pressure_tags"] for row in rows)
    assert any(row["critical"] for row in rows)
    assert any(not row["should_trigger"] for row in rows)
    assert all(row["skill"] == "debugger" for row in rows)


def test_candidate_promotion_is_bound_to_evaluated_bytes(tmp_path: Path):
    m = module()
    scenarios = [m.validate_scenario(scenario("pressure", pressure=True))]
    rows = [
        m.validate_result(result("pressure", "baseline", context=1200)),
        m.validate_result(result("pressure", "current", context=1000)),
        m.validate_result(result("pressure", "candidate", context=700)),
    ]
    candidate = tmp_path / "candidate.md"
    candidate.write_text(
        "---\nname: debugger\ndescription: Use when debugging.\n---\n# Candidate\n"
    )
    current = tmp_path / "current.md"
    current.write_text("current\n")
    report = m.bind_skill_artifacts(
        m.build_report(scenarios, rows),
        current_skill=current,
        candidate_skill=candidate,
    )
    root = tmp_path / "repo"
    target = root / "skills/debugger/LITE.md"
    target.parent.mkdir(parents=True)
    target.write_text("old\n")
    promoted = m.promote_candidate(
        root=root, report=report, candidate=candidate, target=target
    )
    assert promoted == target.resolve()
    assert target.read_bytes() == candidate.read_bytes()

    candidate.write_text("changed after evaluation\n")
    with pytest.raises(m.SkillQualityError, match="differ from evaluated"):
        m.promote_candidate(
            root=root, report=report, candidate=candidate, target=target
        )


def test_hold_report_cannot_promote_even_when_candidate_digest_matches(tmp_path: Path):
    m = module()
    scenarios = [m.validate_scenario(scenario("one"))]
    rows = [
        m.validate_result(result("one", "baseline")),
        m.validate_result(result("one", "current")),
        m.validate_result(result("one", "candidate")),
    ]
    candidate = tmp_path / "candidate.md"
    candidate.write_text("candidate\n")
    report = m.bind_skill_artifacts(
        m.build_report(scenarios, rows), current_skill=None, candidate_skill=candidate
    )
    root = tmp_path / "repo"
    target = root / "skills/debugger/LITE.md"
    target.parent.mkdir(parents=True)
    target.write_text("old\n")
    with pytest.raises(m.SkillQualityError, match="not allowed"):
        m.promote_candidate(
            root=root, report=report, candidate=candidate, target=target
        )
    assert target.read_text() == "old\n"


def test_report_promotion_and_artifact_binding_fail_closed_on_tamper(tmp_path: Path):
    m = module()
    scenarios = [m.validate_scenario(scenario("one"))]
    rows = [
        m.validate_result(result("one", "baseline", context=1200)),
        m.validate_result(result("one", "current", context=1000)),
        m.validate_result(result("one", "candidate", context=700)),
    ]
    candidate = tmp_path / "candidate.md"
    candidate.write_text("candidate\n")
    report = m.bind_skill_artifacts(
        m.build_report(scenarios, rows), current_skill=None, candidate_skill=candidate
    )
    report["promotion"]["promotion_allowed"] = False
    with pytest.raises(m.SkillQualityError, match="promotion result mismatch"):
        m.verify_report(report)


def test_legacy_skill_upgrader_stages_candidate_instead_of_overwriting_live_skill():
    text = (ROOT / "scripts/lite/upgrade-skills.py").read_text(encoding="utf-8")
    assert '"skill-candidates", skill' in text
    assert "0 promoted" in text
    assert "skill_quality.py" in text and "promote" in text
    assert 'with open(lite_path, "w")' not in text


def test_cli_hold_returns_nonzero_for_no_measured_improvement(tmp_path: Path):
    scenarios = tmp_path / "scenarios.jsonl"
    scenarios.write_text(json.dumps(scenario("one")) + "\n")
    runner = tmp_path / "runner.py"
    runner.write_text(
        "import json,sys\njson.load(sys.stdin)\n"
        "print(json.dumps({'triggered':True,'events':['reproduce'],'rationalizations':[],"
        "'unnecessary_actions':[],'tool_calls':2,'context_bytes':1000,'wall_ms':10,'abstained':False}))\n"
    )
    proc = subprocess.run(
        [
            sys.executable,
            str(MODULE_PATH),
            "run",
            "--scenarios",
            str(scenarios),
            "--runner",
            sys.executable,
            str(runner),
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 2
    report = json.loads(proc.stdout)
    assert report["promotion"]["blockers"] == ["no_measured_improvement"]
