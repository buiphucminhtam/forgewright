from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ROADMAP = ROOT / "docs" / "active-roadmap.md"
ADR = ROOT / "docs" / "adr" / "ADR-009-live-routing-evidence.md"


def test_roadmap_uses_zero_cost_provider_native_policy() -> None:
    roadmap = ROADMAP.read_text(encoding="utf-8")
    assert "## Provider-Native Routing Policy" in roadmap
    assert "one provider adapter" in roadmap
    assert "paid hosted execution is not required" in roadmap
    assert "GitHub Actions" not in roadmap
    assert "hosted execution remain" not in roadmap
    assert "GPT-5.6 Luna" not in roadmap
    assert "GPT-5.6 Terra" not in roadmap
    assert "GPT-5.6 Sol" not in roadmap


def test_provider_adapter_owns_ecosystem_specific_behavior() -> None:
    adr = ADR.read_text(encoding="utf-8")
    assert "one selected provider ecosystem" in adr
    assert "model names to core routing logic" in adr
    assert "cross-provider services are neither required" in adr
    assert (
        "cannot satisfy live evidence by signing only the fields it just produced"
        in adr
    )


def test_repository_has_no_hosted_workflow_definitions() -> None:
    workflow_root = ROOT / ".github" / "workflows"
    assert not list(workflow_root.rglob("*.yml"))
    assert not list(workflow_root.rglob("*.yaml"))
