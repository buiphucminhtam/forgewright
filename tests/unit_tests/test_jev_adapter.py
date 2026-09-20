from scripts.runtime.jev_adapter import JevSkillRouterAdapter


def test_jev_adapter_default_off():
    adapter = JevSkillRouterAdapter(enabled=False)
    res = adapter.route_candidate(
        task_intent="Fix race in db", candidates=["software-engineer", "debugger"]
    )
    assert res.status == "disabled"
    assert res.selected_skill is None
    assert "default-off" in res.reason


def test_jev_adapter_unpinned_version_rejected():
    adapter = JevSkillRouterAdapter(
        enabled=True, api_key="sk-test", model_version="jev-latest", budget_usd=1.0
    )
    res = adapter.route_candidate(
        task_intent="Fix race in db", candidates=["software-engineer", "debugger"]
    )
    assert res.status == "fallback"
    assert "not in approved pinned versions" in res.reason


def test_jev_adapter_budget_limit():
    adapter = JevSkillRouterAdapter(
        enabled=True, api_key="sk-test", model_version="jev-1.13.0", budget_usd=0.0
    )
    res = adapter.route_candidate(
        task_intent="Fix race in db", candidates=["software-engineer", "debugger"]
    )
    assert res.status == "budget_exceeded"


def test_jev_adapter_abstain():
    adapter = JevSkillRouterAdapter(
        enabled=True, api_key="sk-test", model_version="jev-1.13.0", budget_usd=1.0
    )
    mock = {"choice": "NONE", "confidence": 0.95, "cost_usd": 0.00004}
    res = adapter.route_candidate(
        task_intent="Make coffee",
        candidates=["software-engineer", "debugger"],
        simulator_response=mock,
    )
    assert res.status == "abstain"
    assert res.selected_skill is None


def test_jev_adapter_low_confidence_fallback():
    adapter = JevSkillRouterAdapter(
        enabled=True,
        api_key="sk-test",
        model_version="jev-1.13.0",
        budget_usd=1.0,
        confidence_threshold=0.85,
    )
    mock = {"choice": "debugger", "confidence": 0.62, "cost_usd": 0.00004}
    res = adapter.route_candidate(
        task_intent="Something seems slow",
        candidates=["software-engineer", "debugger"],
        simulator_response=mock,
    )
    assert res.status == "fallback"
    assert res.selected_skill is None
    assert "below threshold" in res.reason


def test_jev_adapter_successful_selection():
    adapter = JevSkillRouterAdapter(
        enabled=True,
        api_key="sk-test",
        model_version="jev-1.13.0",
        budget_usd=1.0,
        confidence_threshold=0.85,
    )
    mock = {"choice": "debugger", "confidence": 0.94, "cost_usd": 0.00004}
    res = adapter.route_candidate(
        task_intent="Trace exit 124 in test worker",
        candidates=["software-engineer", "debugger"],
        simulator_response=mock,
    )
    assert res.status == "selected"
    assert res.selected_skill == "debugger"
    assert res.confidence == 0.94


def test_route_skills_with_jev_integration(monkeypatch, tmp_path):
    from scripts.runtime.skill_routing import route_skills
    from scripts.runtime import jev_adapter

    # Requirement amendment FW-KEYLESS-PI-20260920: the owner explicitly
    # replaced cloud-Jev routing with free local System-1 routing. Historical
    # flags must not turn the new default path into a paid/network dependency.
    monkeypatch.setenv("FORGEWRIGHT_JEV_ENABLED", "true")
    monkeypatch.setenv("TYPESAFE_API_KEY", "sk-test")
    monkeypatch.setenv("FORGEWRIGHT_JEV_BUDGET_USD", "1.0")

    # A call is a regression, even if the provider would return a valid choice.
    calls = []

    def mock_route_candidate(self, task_intent, candidates, simulator_response=None):
        calls.append(task_intent)
        raise AssertionError("Default keyless routing must not call cloud Jev")

    monkeypatch.setattr(
        jev_adapter.JevSkillRouterAdapter, "route_candidate", mock_route_candidate
    )

    res = route_skills(prompt="Some weird ambiguous request without keywords")
    assert res["status"] == "ok"
    assert res["mode"] is None
    assert res["source"] == "local-rules"
    assert res["routing"]["status"] == "abstain"
    assert calls == []

    selected = route_skills(prompt="Viết kiểm thử đơn vị")
    assert selected["status"] == "ok"
    assert selected["mode"] == "test"
    assert selected["source"] == "local-rules"
    assert selected["routing"]["backend"] == "python-stdlib"
    assert calls == []
