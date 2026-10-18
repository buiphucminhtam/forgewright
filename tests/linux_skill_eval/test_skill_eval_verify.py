"""Trust construction tests use local fixture capture; no model is invoked."""

import dataclasses
import hashlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/runtime"))
import skill_eval_host as host  # noqa: E402
import skill_eval_verify as v  # noqa: E402
import skill_quality as q  # noqa: E402


def evaluator(text, facts, case):
    # Independent executed arithmetic: source numerator/denominator, never labels.
    ratio = facts["retained"] / facts["cohort"]
    correct = f"retention={ratio:.2f}" in text
    span = (text,)

    def finding(observed):
        return v.Finding(
            observed, span, "Checked whole decision against cohort calculation"
        )

    return v.Decision(
        finding(True),
        finding(False),
        {"calculate": finding(correct), "invent": finding("invent" in text)},
        {},
        (f"retained/cohort={ratio:.2f}; actual source inputs {facts}",),
    )


def case(case_id="case"):
    return {
        "schema": q.SCENARIO_SCHEMA,
        "id": case_id,
        "skill": "debugger",
        "prompt": "Calculate cohort retention",
        "should_trigger": True,
        "required_events": ["calculate"],
        "forbidden_events": ["invent"],
        "pressure_tags": [],
        "rationalization_traps": [],
        "critical": False,
    }


def setup(tmp_path, cases=None):
    cases = cases or [case()]
    current = tmp_path / "skills/debugger/SKILL.md"
    current.parent.mkdir(parents=True)
    current.write_text("current instruction with more bytes")
    candidate = tmp_path / "candidate.md"
    candidate.write_text("candidate")
    dep = tmp_path / "reference.md"
    dep.write_text("frozen source")
    facts = {c["id"]: {"retained": 20, "cohort": 100} for c in cases}
    oracle = v.freeze_oracle(
        cases,
        source_facts=facts,
        evaluator=evaluator,
        owner="independent-reviewer",
        candidate_author="builder",
        dependencies=(dep,),
    )
    return cases, current, candidate, dep, facts, oracle


def capture(
    tmp_path,
    c,
    arm,
    oracle,
    facts,
    output="retention=0.20",
    instruction=None,
    *,
    model="fixture",
    effort="low",
    extra_sources=(),
    manifest_sources=None,
    repetition=1,
    host_limits=None,
):
    code = (
        "import json; print(json.dumps({'type':'item.completed','item':{'id':'answer','type':'agent_message','text':"
        + repr(output)
        + "}})); print(json.dumps({'type':'turn.completed','usage':{'input_tokens':3,'cached_input_tokens':0,'output_tokens':2}}))"
    )
    sources = (
        ()
        if instruction is None
        else (
            {
                "path": str(instruction),
                "sha256": hashlib.sha256(instruction.read_bytes()).hexdigest(),
                "kind": "instruction",
                "arm": arm,
            },
        )
    )
    sources += tuple(
        {
            "path": str(path),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "kind": "dependency",
            "arm": arm,
        }
        for path in extra_sources
    )
    if manifest_sources is not None:
        sources = tuple(manifest_sources)
    request = host.HostRequest(
        c["id"],
        arm,
        repetition,
        {"prompt": c["prompt"], "source_facts": facts[c["id"]]},
        sources,
        oracle.digest,
        model,
        effort,
        fixture_command=(sys.executable, "-c", code),
    )
    return host.capture_run(
        request,
        output_dir=tmp_path / (c["id"] + arm),
        limits=host_limits or host.HostLimits(wall_seconds=3),
    )


def registry(
    tmp_path,
    *,
    outputs=None,
    cases=None,
    eligible=False,
    monkeypatch=None,
    arm_changes=None,
):
    cases, current, candidate, dep, facts, oracle = setup(tmp_path, cases)
    runs = []
    for c in cases:
        for arm in q.VARIANTS:
            text = (outputs or {}).get(
                (c["id"], arm),
                "retention=0.20" if arm == "candidate" else "retention=unknown",
            )
            runs.append(
                capture(
                    tmp_path,
                    c,
                    arm,
                    oracle,
                    facts,
                    text,
                    None
                    if arm == "baseline"
                    else current
                    if arm == "current"
                    else candidate,
                    **(arm_changes or {}).get(arm, {}),
                )
            )
    if eligible:
        # Test-only simulated host issuance. Production fixture captures always fail
        # eligibility; this replaces the host boundary, never the verifier boundary.
        originals = {r.run_id: r for r in runs}
        runs = [
            dataclasses.replace(
                r,
                success=True,
                promotion_eligible=True,
                record=host._freeze(
                    {
                        **host._plain(r.record),
                        "fixture": False,
                        "success": True,
                        "promotion_eligible": True,
                        "tool_calls": 0,
                    }
                ),
            )
            for r in runs
        ]
        simulated = {r.run_id: r for r in runs}
        native_verify = host.verify_issued_run
        monkeypatch.setattr(
            host,
            "verify_issued_run",
            lambda r, **kw: simulated.get(r.run_id) is r
            and native_verify(originals[r.run_id], **kw),
        )
    manifest = v.freeze_manifest(
        oracle,
        run_manifests={
            (r.record["case_id"], r.record["arm"]): r.manifest_digest for r in runs
        },
        current_skill=current,
        candidate_skill=candidate,
        dependencies=(
            dep,
            *(
                path
                for change in (arm_changes or {}).values()
                for path in change.get("extra_sources", ())
            ),
        ),
    )
    reg = v.TrustedRunRegistry(manifest)
    for r in runs:
        c = next(c for c in cases if c["id"] == r.record["case_id"])
        reg.add(r, v.judge_run(r, case=c, oracle=oracle))
    return reg, manifest, runs, dep


def test_rejects_model_authored_receipt_or_event_labels(tmp_path):
    reg, manifest, runs, _ = registry(
        tmp_path,
        outputs={
            ("case", "candidate"): '{"events":["calculate"],"promotion_allowed":true}'
        },
    )
    report = reg.build_report()
    assert report["arms"]["candidate"]["required_event_compliance"] == 0
    assert (
        reg.resolve_observation('{"eligible":true}', plan_digest=manifest.digest)
        is None
    )
    with pytest.raises(ValueError):
        reg.add(runs[0], {"triggered": True, "events": ["calculate"]})
    with pytest.raises(ValueError):
        v.judge_run(dataclasses.replace(runs[0]), case=case(), oracle=manifest.oracle)


def test_rejects_changed_oracle_dependency_or_duplicate_run(tmp_path):
    reg, manifest, runs, dep = registry(tmp_path)
    with pytest.raises(ValueError, match="duplicate"):
        reg.add(runs[0], v.judge_run(runs[0], case=case(), oracle=manifest.oracle))
    dep.write_text("changed")
    assert not v.verify_observed_report(
        reg.build_report(), registry=reg, manifest=manifest
    )
    with pytest.raises(ValueError, match="oracle|stale"):
        v.judge_run(runs[0], case=case(), oracle=manifest.oracle)


def test_recomputes_report_from_raw_observed_judgments(tmp_path, monkeypatch):
    reg, manifest, runs, _ = registry(tmp_path, eligible=True, monkeypatch=monkeypatch)
    report = reg.build_report()
    assert v.verify_observed_report(report, registry=reg, manifest=manifest)
    forged = json.loads(json.dumps(report))
    forged["arms"]["candidate"]["tool_calls_avg"] = 999
    assert not v.verify_observed_report(forged, registry=reg, manifest=manifest)
    observation = reg.resolve_observation(runs[-1].run_id, plan_digest=manifest.digest)
    assert observation is not None
    assert observation.capabilities == ("agent-decision",)
    assert observation.measurements["submitted_context_bytes"] > 0
    assert reg.resolve_observation(runs[-1].run_id, plan_digest="wrong") is None
    (runs[-1].output_dir / "raw.stdout").write_text("tampered")
    assert not v.verify_observed_report(report, registry=reg, manifest=manifest)


def test_unknown_cost_cannot_establish_efficiency_win(tmp_path, monkeypatch):
    outputs = {("case", arm): "retention=0.20" for arm in q.VARIANTS}
    reg, manifest, _, _ = registry(
        tmp_path, outputs=outputs, eligible=True, monkeypatch=monkeypatch
    )
    report = reg.build_report()
    assert report["promotion"]["efficiency_improved"]
    assert not v.verify_observed_report(report, registry=reg, manifest=manifest)


def test_hidden_case_regression_cannot_be_hidden_by_aggregate_gain(
    tmp_path, monkeypatch
):
    cases = [case(str(i)) for i in range(3)]
    outputs = {
        (str(i), arm): "retention=0.20"
        if (arm == "candidate" and i != 0) or (arm == "current" and i == 0)
        else "unknown"
        for i in range(3)
        for arm in q.VARIANTS
    }
    reg, manifest, _, _ = registry(
        tmp_path, cases=cases, outputs=outputs, eligible=True, monkeypatch=monkeypatch
    )
    report = reg.build_report()
    assert report["promotion"]["quality_improved"]
    assert report["promotion"]["promotion_allowed"]
    assert not v.verify_observed_report(report, registry=reg, manifest=manifest)


def test_fixture_or_contract_replay_never_promotes(tmp_path):
    reg, manifest, runs, _ = registry(tmp_path)
    assert reg.build_report()["arms"]["candidate"]["required_event_compliance"] == 1
    assert not v.verify_observed_report(
        reg.build_report(), registry=reg, manifest=manifest
    )
    assert reg.resolve_observation(runs[-1].run_id, plan_digest=manifest.digest) is None
    with pytest.raises(q.SkillQualityError, match="trusted observed"):
        q.promote_candidate(
            root=tmp_path,
            report=reg.build_report(),
            candidate=manifest.candidate_skill,
            target=manifest.current_skill,
            verify_observed=lambda report: v.verify_observed_report(
                report, registry=reg, manifest=manifest
            ),
        )


def test_oracle_requires_independent_owner_and_exact_source_payload(tmp_path):
    cases, _, _, _, facts, oracle = setup(tmp_path)
    with pytest.raises(ValueError, match="independent"):
        v.freeze_oracle(
            cases,
            source_facts=facts,
            evaluator=evaluator,
            owner="builder",
            candidate_author="builder",
        )
    wrong = dict(facts)
    wrong["case"] = {"retained": 99, "cohort": 100}
    run = capture(tmp_path, cases[0], "current", oracle, wrong)
    with pytest.raises(ValueError, match="payload|source"):
        v.judge_run(run, case=cases[0], oracle=oracle)


def test_receipt_binds_actual_run_source_configuration_and_raw_measurements(
    tmp_path, monkeypatch
):
    reg, manifest, runs, dep = registry(
        tmp_path, eligible=True, monkeypatch=monkeypatch
    )
    baseline = runs[0]
    receipt = reg.resolve_observation(baseline.run_id, plan_digest=manifest.digest)
    actual = json.loads((baseline.output_dir / "manifest.json").read_bytes())
    assert receipt.source_digest == q.canonical_digest(
        {"instruction_manifest": actual["instruction_manifest"]}
    )
    assert receipt.build_digest == baseline.manifest_digest
    assert receipt.raw_artifacts == baseline.record["artifacts"]
    assert (
        receipt.measurements["submitted_context_bytes"]
        == (baseline.output_dir / "payload.json").stat().st_size
    )
    dep.write_text("changed source")
    assert reg.resolve_observation(baseline.run_id, plan_digest=manifest.digest) is None


def bad_span_evaluator(text, facts, case):
    result = evaluator(text, facts, case)
    return dataclasses.replace(
        result, triggered=v.Finding(True, ("never captured",), "unsupported")
    )


def missing_check_evaluator(text, facts, case):
    result = evaluator(text, facts, case)
    return dataclasses.replace(result, events={"calculate": result.events["calculate"]})


def test_oracle_rejects_unobserved_spans_and_unjudged_forbidden_paths(tmp_path):
    cases, _, _, _, facts, _ = setup(tmp_path)
    for index, evaluate in enumerate((bad_span_evaluator, missing_check_evaluator)):
        oracle = v.freeze_oracle(
            cases,
            source_facts=facts,
            evaluator=evaluate,
            owner="reviewer",
            candidate_author="builder",
        )
        run = capture(tmp_path / str(index), cases[0], "baseline", oracle, facts)
        with pytest.raises(ValueError, match="spans|every required/forbidden"):
            v.judge_run(run, case=cases[0], oracle=oracle)


def test_frozen_manifest_binds_verifier_host_and_report_engine_sources(tmp_path):
    _, manifest, _, _ = registry(tmp_path)
    for module in (v, host, q):
        path = str(Path(module.__file__).resolve())
        assert (
            manifest.dependencies[path]
            == hashlib.sha256(Path(path).read_bytes()).hexdigest()
        )


def test_report_retains_each_outcome_raw_span_calculation_and_host_failure(tmp_path):
    reg, _, _, _ = registry(tmp_path)
    observed = reg.build_report()["observed"]["runs"][1]
    assert observed["host_failures"]
    assert observed["promotion_eligible"] is False
    decision = observed["decision"]
    assert decision["events"]["calculate"]["observed"] is True
    assert decision["events"]["invent"]["observed"] is False
    assert decision["events"]["calculate"]["spans"] == ["retention=0.20"]
    assert decision["events"]["calculate"]["diagnosis"]
    assert "retained/cohort=0.20" in decision["evidence"][0]


@pytest.mark.parametrize("change", [{"model": "other-model"}, {"effort": "high"}])
def test_rejects_cross_arm_runtime_configuration_drift(tmp_path, monkeypatch, change):
    with pytest.raises(ValueError, match="comparison|configuration"):
        registry(
            tmp_path,
            eligible=True,
            monkeypatch=monkeypatch,
            arm_changes={"candidate": change},
        )


def test_rejects_candidate_bytes_aliased_into_baseline_context(tmp_path, monkeypatch):
    alias = tmp_path / "shared-guidance.md"
    alias.write_text("candidate")
    with pytest.raises(ValueError, match="comparison|source|context"):
        registry(
            tmp_path,
            eligible=True,
            monkeypatch=monkeypatch,
            arm_changes={"baseline": {"extra_sources": (alias,)}},
        )


def test_rejects_undeclared_candidate_only_dependency(tmp_path, monkeypatch):
    dep = tmp_path / "reference.md"
    with pytest.raises(ValueError, match="comparison|source|context"):
        registry(
            tmp_path,
            eligible=True,
            monkeypatch=monkeypatch,
            arm_changes={"candidate": {"extra_sources": (dep,)}},
        )


@pytest.mark.parametrize(
    "change", [{"host_limits": host.HostLimits(wall_seconds=4)}, {"repetition": 2}]
)
def test_rejects_cross_arm_limits_or_repetition_drift(tmp_path, monkeypatch, change):
    with pytest.raises(ValueError, match="comparison"):
        registry(
            tmp_path,
            eligible=True,
            monkeypatch=monkeypatch,
            arm_changes={"candidate": change},
        )


def test_accepts_only_precapture_oracle_bound_shared_and_dependency_delta_context(
    tmp_path,
):
    cases, current, candidate, dep, facts, original = setup(tmp_path)
    before, after = tmp_path / "old-reference.md", tmp_path / "new-reference.md"
    before.write_text("prior independent reference facts")
    after.write_text("corrected independently sourced reference facts")
    shared = (
        {
            "path": str(dep),
            "sha256": hashlib.sha256(dep.read_bytes()).hexdigest(),
            "kind": "dependency",
            "arm": "shared",
        },
    )
    comparison = v.freeze_comparison(
        current_skill=current,
        candidate_skill=candidate,
        shared_sources=shared,
        dependency_deltas=((before, after),),
    )
    oracle = v.freeze_oracle(
        cases,
        source_facts=facts,
        evaluator=evaluator,
        owner="reviewer",
        candidate_author="builder",
        comparison=comparison,
    )
    assert oracle.digest != original.digest
    runs = [
        capture(
            tmp_path,
            cases[0],
            arm,
            oracle,
            facts,
            manifest_sources=v._plain(comparison.sources[arm]),
        )
        for arm in q.VARIANTS
    ]
    manifest = v.freeze_manifest(
        oracle,
        run_manifests={("case", r.record["arm"]): r.manifest_digest for r in runs},
        current_skill=current,
        candidate_skill=candidate,
    )
    reg = v.TrustedRunRegistry(manifest)
    for run in runs:
        reg.add(run, v.judge_run(run, case=cases[0], oracle=oracle))
    assert reg.build_report()["observed"]["comparison_digest"] == comparison.digest
    assert not v.verify_observed_report(
        reg.build_report(), registry=reg, manifest=manifest
    )
    after.write_text("changed after execution")
    with pytest.raises(ValueError, match="stale oracle|host-issued run identity"):
        v.judge_run(runs[-1], case=cases[0], oracle=oracle)


def test_rejects_shared_candidate_alias_even_when_declared_before_capture(tmp_path):
    _, current, candidate, _, _, _ = setup(tmp_path)
    alias = tmp_path / "innocent-reference.md"
    alias.write_bytes(candidate.read_bytes())
    with pytest.raises(ValueError, match="aliases arm-specific"):
        v.freeze_comparison(
            current_skill=current,
            candidate_skill=candidate,
            shared_sources=(
                {
                    "path": str(alias),
                    "sha256": hashlib.sha256(alias.read_bytes()).hexdigest(),
                    "kind": "dependency",
                    "arm": "shared",
                },
            ),
        )


def test_manifest_binds_owned_process_and_native_adapter_sources(tmp_path):
    reg, manifest, _, _ = registry(tmp_path)
    for name in ("skill_eval_process.py", "skill_eval_app_server.py"):
        path = ROOT / "scripts/runtime" / name
        assert (
            manifest.dependencies[str(path)]
            == hashlib.sha256(path.read_bytes()).hexdigest()
        )


def test_rejects_native_effective_control_capability_drift(tmp_path, monkeypatch):
    original = host._parse

    def parsed(raw, request, sources):
        return {
            **original(raw, request, sources),
            "native_control_digest": "changed-capability"
            if request.arm == "candidate"
            else "same-capability",
        }

    monkeypatch.setattr(host, "_parse", parsed)
    with pytest.raises(ValueError, match="native.*control|capability"):
        registry(tmp_path)
