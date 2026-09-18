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

    # Enable Jev in env
    monkeypatch.setenv("FORGEWRIGHT_JEV_ENABLED", "true")
    monkeypatch.setenv("TYPESAFE_API_KEY", "sk-test")
    monkeypatch.setenv("FORGEWRIGHT_JEV_BUDGET_USD", "1.0")

    # Mock route_candidate
    def mock_route_candidate(self, task_intent, candidates, simulator_response=None):
        return jev_adapter.JevRoutingDecision(
            status="selected",
            selected_skill="test",
            confidence=0.92,
            model_version="jev-1.13.0",
            latency_ms=45.0,
            cost_usd=0.00004,
            reason="Ambiguous prompt routed via mock Jev",
        )

    monkeypatch.setattr(
        jev_adapter.JevSkillRouterAdapter, "route_candidate", mock_route_candidate
    )

    res = route_skills(prompt="Some weird ambiguous request without keywords")
    assert res["status"] == "ok"
    assert res["mode"] == "test"
    assert res["source"] == "jev"
