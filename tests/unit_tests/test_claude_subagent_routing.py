import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[2]
RESOLVER = ROOT / "scripts" / "runtime" / "claude-subagent-routing.py"
CONFIG = ROOT / ".production-grade.yaml"
TEMPLATE = ROOT / "skills" / "_shared" / "templates" / "production-grade.yaml.tmpl"
AGENTS = ROOT / "agents"
ALL_CAPS = {
    "models": ["haiku", "sonnet", "opus", "fable"],
    "agent_types": [
        "forgewright:forgewright-scout",
        "forgewright:forgewright-builder",
        "forgewright:forgewright-expert",
        "forgewright:forgewright-planner",
        "forgewright:forgewright-reviewer",
        "general-purpose",
    ],
}
EXPECTED = {
    "scout": ("forgewright-scout", "haiku"),
    "builder": ("forgewright-builder", "sonnet"),
    "expert": ("forgewright-expert", "opus"),
    "planner": ("forgewright-planner", "fable"),
    "reviewer": ("forgewright-reviewer", "fable"),
}
ROLE_TIERS = ("planner", "reviewer")
EDIT_TOOLS = {"Edit", "Write", "NotebookEdit", "MultiEdit"}


def _resolver():
    spec = importlib.util.spec_from_file_location("claude_subagent_routing", RESOLVER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n")
    return yaml.safe_load(text.split("---\n", 2)[1])


def _config() -> dict:
    return yaml.safe_load(CONFIG.read_text(encoding="utf-8"))


@pytest.mark.parametrize("source", [CONFIG, TEMPLATE])
def test_claude_tier_config_maps_each_tier_to_agent_and_alias(source: Path) -> None:
    tiers = yaml.safe_load(source.read_text(encoding="utf-8"))["subagents"]["claude"][
        "tiers"
    ]
    assert {
        tier: (entry["agent"], entry["model"]) for tier, entry in tiers.items()
    } == EXPECTED


@pytest.mark.parametrize("tier", sorted(EXPECTED))
def test_tier_agent_definitions_pin_the_configured_model(tier: str) -> None:
    agent, model = EXPECTED[tier]
    meta = _frontmatter(AGENTS / f"{agent}.md")
    assert meta["name"] == agent
    assert meta["model"] == model
    assert len(meta["description"]) > 80


def test_scout_agent_has_no_shell_or_write_tools() -> None:
    meta = _frontmatter(AGENTS / "forgewright-scout.md")
    tools = {tool.strip() for tool in meta["tools"].split(",")}
    assert tools == {"Read", "Grep", "Glob"}


def test_expert_description_names_hard_signals() -> None:
    description = _frontmatter(AGENTS / "forgewright-expert.md")["description"].lower()
    for signal in (
        "security",
        "schema",
        "concurrency",
        "payment",
        "migration",
        "review",
    ):
        assert signal in description


@pytest.mark.parametrize("tier", sorted(EXPECTED))
def test_resolver_emits_verified_namespaced_agent_and_model(tier: str) -> None:
    result = _resolver().resolve_routing(_config(), ALL_CAPS, tier=tier)
    agent, model = EXPECTED[tier]
    assert result["agent_args"] == {
        "subagent_type": f"forgewright:{agent}",
        "model": model,
    }
    assert result["model_selection"] == "verified"


def test_resolver_never_emits_unadvertised_model_or_agent() -> None:
    caps = {"models": ["opus"], "agent_types": ["general-purpose"]}
    result = _resolver().resolve_routing(_config(), caps, tier="scout")
    assert result["agent_args"] == {"subagent_type": "general-purpose"}
    assert result["model_selection"] == "provider-managed"


def test_resolver_rejects_ambiguous_namespaced_agents() -> None:
    caps = {"models": [], "agent_types": ["a:forgewright-scout", "b:forgewright-scout"]}
    result = _resolver().resolve_routing(_config(), caps, tier="scout")
    assert "subagent_type" not in result["agent_args"]


@pytest.mark.parametrize("caps", [None, {}, {"models": "haiku"}, {"models": [1]}, []])
def test_resolver_missing_or_malformed_capabilities_inherit_parent(
    caps: object,
) -> None:
    result = _resolver().resolve_routing(_config(), caps, tier="builder")
    assert result["agent_args"] == {}
    assert result["model_selection"] == "provider-managed"


def test_resolver_rejects_unknown_tier() -> None:
    with pytest.raises(ValueError):
        _resolver().resolve_routing(_config(), ALL_CAPS, tier="genius")


def test_resolver_cli_outputs_agent_args() -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(RESOLVER),
            "--tier",
            "expert",
            "--capabilities-json",
            json.dumps(ALL_CAPS),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    assert json.loads(result.stdout)["agent_args"] == {
        "subagent_type": "forgewright:forgewright-expert",
        "model": "opus",
    }


def test_model_tier_protocol_documents_claude_routing() -> None:
    text = (ROOT / "skills" / "_shared" / "protocols" / "model-tier.md").read_text(
        encoding="utf-8"
    )
    assert "## Native Claude Code Configuration" in text
    assert "scripts/runtime/claude-subagent-routing.py" in text
    for agent, model in EXPECTED.values():
        assert agent in text and f"`{model}`" in text


def test_plugin_agents_resolve_end_to_end_from_shipped_files() -> None:
    """Advertise exactly what the shipped plugin provides and route every tier."""
    plugin = json.loads(
        (ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8")
    )["name"]
    shipped = {path.stem: _frontmatter(path) for path in AGENTS.glob("*.md")}
    caps = {
        "models": sorted({meta["model"] for meta in shipped.values()}),
        "agent_types": [f"{plugin}:{name}" for name in shipped] + ["general-purpose"],
    }
    for tier in sorted(EXPECTED):
        result = subprocess.run(
            [
                sys.executable,
                str(RESOLVER),
                "--tier",
                tier,
                "--capabilities-json",
                json.dumps(caps),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        args = json.loads(result.stdout)["agent_args"]
        agent = args["subagent_type"].split(":", 1)[1]
        assert shipped[agent]["model"] == args["model"] == EXPECTED[tier][1]


def _policy_high_risk() -> set[str]:
    from scripts.runtime.orchestration_policy import HIGH_RISK

    return set(HIGH_RISK)


def _escalate_hard_bullets() -> list[str]:
    text = (ROOT / "kernel" / "ESCALATE.md").read_text(encoding="utf-8")
    section = text.split("## HARD Signals", 1)[1].split("\nOtherwise", 1)[0]
    bullets: list[str] = []
    for line in section.splitlines():
        if line.startswith("- "):
            bullets.append(line[2:].strip())
        elif line.startswith("  ") and bullets:
            bullets[-1] += " " + line.strip()
    assert len(bullets) >= 8
    return bullets


def test_every_escalate_hard_bullet_floors_tier_at_expert() -> None:
    """Driven from kernel wording so the floor cannot drift from ESCALATE.md."""
    resolver = _resolver()
    for bullet in _escalate_hard_bullets():
        assert resolver.select_tier("scout", [bullet])["tier"] == "expert", bullet


def test_hard_signals_cover_orchestration_high_risk() -> None:
    resolver = _resolver()
    for token in sorted(_policy_high_risk()):
        assert resolver.select_tier("scout", [token])["tier"] == "expert", token


HARD_PHRASES = [
    "receipt validation",
    "in-app purchase",
    "IAP",
    "Payment",
    "public interface",
    "public_api",
    "export contract",
    "schema change",
    "repeated verification failure",
    "independent evidence disagrees",
    "guardrail DENY",
    "policy WARN",
    "process termination",
    "security-sensitive",
    "permission boundary",
    "database migration",
    "irreversible release path",
    "locking order",
]


@pytest.mark.parametrize("phrase", HARD_PHRASES)
@pytest.mark.parametrize("requested", ["scout", "builder", None])
def test_hard_signal_floors_tier_at_expert(phrase: str, requested: str | None) -> None:
    result = _resolver().resolve_routing(
        _config(), ALL_CAPS, tier=requested, risk_signals=[phrase]
    )
    assert result["tier"] == "expert"
    assert result["agent_args"]["subagent_type"] == "forgewright:forgewright-expert"
    assert result["hard_signals"]


def test_hard_floor_cannot_be_lowered_even_when_mechanical() -> None:
    result = _resolver().resolve_routing(
        _config(), ALL_CAPS, tier="scout", risk_signals=["checkout"], mechanical=True
    )
    assert (result["tier"], result["escalated"]) == ("expert", True)


def test_tier_selection_without_hard_signals_stays_cheap() -> None:
    select = _resolver().select_tier
    assert select(None, [], mechanical=True)["tier"] == "scout"
    assert select(None, ["ui-copy"])["tier"] == "builder"
    assert select("scout", ["docs"])["tier"] == "scout"
    assert select("expert", [])["tier"] == "expert"


def test_resolver_cli_applies_hard_floor() -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(RESOLVER),
            "--tier",
            "scout",
            "--risk-signal",
            "Payment",
            "--capabilities-json",
            json.dumps(ALL_CAPS),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    out = json.loads(result.stdout)
    assert out["tier"] == "expert" and out["agent_args"]["model"] == "opus"


@pytest.mark.parametrize(
    "agent,tools",
    [
        (
            "forgewright-planner",
            {"Read", "Grep", "Glob", "Bash", "WebSearch", "WebFetch"},
        ),
        ("forgewright-reviewer", {"Read", "Grep", "Glob", "Bash"}),
    ],
)
def test_role_agents_have_exact_tools_without_edit_tools(
    agent: str, tools: set[str]
) -> None:
    meta = _frontmatter(AGENTS / f"{agent}.md")
    granted = {tool.strip() for tool in meta["tools"].split(",")}
    assert granted == tools
    assert not granted & EDIT_TOOLS


def test_role_agent_descriptions_scope_planning_and_review() -> None:
    planner = _frontmatter(AGENTS / "forgewright-planner.md")["description"].lower()
    for term in (
        "plan_locked",
        "architecture",
        "game design",
        "never edits",
        "quick work stays",
    ):
        assert term in planner, term
    reviewer = _frontmatter(AGENTS / "forgewright-reviewer.md")["description"].lower()
    for term in ("independent", "review-2", "different model", "never edits"):
        assert term in reviewer, term
    for sibling in ("forgewright-expert", "forgewright-builder", "forgewright-scout"):
        text = _frontmatter(AGENTS / f"{sibling}.md")["description"]
        assert "forgewright-reviewer" in text and "forgewright-planner" in text, sibling
        assert "independent HARD review — use forgewright-expert" not in text, sibling


@pytest.mark.parametrize("role", ROLE_TIERS)
@pytest.mark.parametrize("phrase", ["Payment", "schema change", "security-sensitive"])
def test_hard_signal_keeps_requested_role_tier(role: str, phrase: str) -> None:
    result = _resolver().resolve_routing(
        _config(), ALL_CAPS, tier=role, risk_signals=[phrase]
    )
    assert result["tier"] == role
    assert result["tier_floor"] == "expert"
    assert result["hard_signals"]
    assert result["escalated"] is False
    assert result["agent_args"] == {
        "subagent_type": f"forgewright:forgewright-{role}",
        "model": "fable",
    }


@pytest.mark.parametrize("role", ROLE_TIERS)
def test_role_tier_is_kept_when_mechanical(role: str) -> None:
    assert _resolver().select_tier(role, [], mechanical=True)["tier"] == role


def test_role_tiers_are_never_chosen_implicitly() -> None:
    select = _resolver().select_tier
    for signals, mechanical in (
        ([], False),
        ([], True),
        (["Payment"], False),
        (["docs"], True),
    ):
        assert select(None, signals, mechanical=mechanical)["tier"] not in ROLE_TIERS
    for requested in ("scout", "builder", "expert"):
        assert select(requested, ["checkout"])["tier"] == "expert"


def test_role_tier_without_advertised_fable_inherits_parent_model() -> None:
    caps = {"models": ["haiku", "sonnet", "opus"], "agent_types": ["general-purpose"]}
    result = _resolver().resolve_routing(_config(), caps, tier="planner")
    assert result["agent_args"] == {"subagent_type": "general-purpose"}
    assert result["model_selection"] == "provider-managed"
    assert any("'fable' not advertised" in reason for reason in result["reasons"])


NO_FABLE_CAPS = [
    {"models": ["haiku", "sonnet", "opus"], "agent_types": ["general-purpose"]},
    {
        "models": ["haiku", "sonnet", "opus"],
        "agent_types": [
            "forgewright:forgewright-expert",
            "forgewright:forgewright-planner",
            "forgewright:forgewright-reviewer",
            "general-purpose",
        ],
    },
]


@pytest.mark.parametrize("role", ROLE_TIERS)
@pytest.mark.parametrize("caps_index", range(len(NO_FABLE_CAPS)))
def test_hard_role_tier_without_fable_falls_back_to_expert(
    role: str, caps_index: int
) -> None:
    caps = NO_FABLE_CAPS[caps_index]
    result = _resolver().resolve_routing(
        _config(), caps, tier=role, risk_signals=["Payment"]
    )
    assert result["tier"] == "expert"
    assert result["requested_tier"] == role
    assert result["escalated"] is True
    assert result["agent_args"]["model"] == "opus"
    assert result["model_selection"] == "verified"
    assert any("using the expert tier" in reason for reason in result["reasons"])
    scout = _resolver().resolve_routing(
        _config(), caps, tier="scout", risk_signals=["Payment"]
    )
    assert result["agent_args"] == scout["agent_args"]


def test_hard_role_tier_fallback_via_cli() -> None:
    caps = NO_FABLE_CAPS[1]
    result = subprocess.run(
        [
            sys.executable,
            str(RESOLVER),
            "--tier",
            "reviewer",
            "--risk-signal",
            "Payment",
            "--capabilities-json",
            json.dumps(caps),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    out = json.loads(result.stdout)
    assert out["tier"] == "expert" and out["escalated"] is True
    assert out["agent_args"] == {
        "subagent_type": "forgewright:forgewright-expert",
        "model": "opus",
    }


def test_resolver_cli_accepts_role_tiers() -> None:
    for role in ROLE_TIERS:
        result = subprocess.run(
            [
                sys.executable,
                str(RESOLVER),
                "--tier",
                role,
                "--risk-signal",
                "Payment",
                "--capabilities-json",
                json.dumps(ALL_CAPS),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        out = json.loads(result.stdout)
        assert out["tier"] == role
        assert out["agent_args"] == {
            "subagent_type": f"forgewright:forgewright-{role}",
            "model": "fable",
        }
    rejected = subprocess.run(
        [sys.executable, str(RESOLVER), "--tier", "genius"],
        capture_output=True,
        text=True,
    )
    assert rejected.returncode != 0 and "invalid choice" in rejected.stderr


def test_kernel_routes_planning_and_review_to_role_tiers() -> None:
    solve = (ROOT / "kernel" / "SOLVE.md").read_text(encoding="utf-8")
    assert (
        "planning goes to the `planner` role tier and independent review to `reviewer`"
        in solve
    )
    for generated in ("CLAUDE.md", "AGENTS.md", "GEMINI.md"):
        text = (ROOT / generated).read_text(encoding="utf-8")
        assert "planning goes to the `planner` role tier" in text, generated


EXPECTED_EFFORT = {
    "scout": "low",
    "builder": "medium",
    "expert": "high",
    "planner": "high",
    "reviewer": "high",
}
CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"]


@pytest.mark.parametrize("source", [CONFIG, TEMPLATE])
def test_claude_tier_config_sets_effort_matching_codex(source: Path) -> None:
    subagents = yaml.safe_load(source.read_text(encoding="utf-8"))["subagents"]
    claude = {
        tier: entry["effort"] for tier, entry in subagents["claude"]["tiers"].items()
    }
    codex = {
        tier: entry["reasoning_effort"]
        for tier, entry in subagents["codex"]["tiers"].items()
    }
    assert claude == EXPECTED_EFFORT
    assert claude == codex


@pytest.mark.parametrize("tier", sorted(EXPECTED))
def test_tier_agent_definitions_pin_the_configured_effort(tier: str) -> None:
    agent, _ = EXPECTED[tier]
    meta = _frontmatter(AGENTS / f"{agent}.md")
    assert meta["effort"] == EXPECTED_EFFORT[tier]
    assert meta["effort"] in CLAUDE_EFFORTS


@pytest.mark.parametrize("tier", sorted(EXPECTED))
def test_resolver_emits_advertised_effort(tier: str) -> None:
    caps = {**ALL_CAPS, "efforts": CLAUDE_EFFORTS}
    result = _resolver().resolve_routing(_config(), caps, tier=tier)
    agent, model = EXPECTED[tier]
    assert result["agent_args"] == {
        "subagent_type": f"forgewright:{agent}",
        "model": model,
        "effort": EXPECTED_EFFORT[tier],
    }
    assert result["effort_selection"] == "verified"
    assert result["configured"]["effort"] == EXPECTED_EFFORT[tier]


def test_resolver_never_substitutes_an_unadvertised_effort() -> None:
    caps = {**ALL_CAPS, "efforts": ["low", "medium"]}
    result = _resolver().resolve_routing(_config(), caps, tier="expert")
    assert "effort" not in result["agent_args"]
    assert result["agent_args"]["model"] == "opus"
    assert result["effort_selection"] == "provider-managed"
    assert any("effort 'high' not advertised" in reason for reason in result["reasons"])


@pytest.mark.parametrize(
    "efforts", [None, "high", "medium", [1], [""], ["medium", 1], ["MEDIUM"]]
)
def test_resolver_malformed_or_missing_efforts_inherit_parent(efforts: object) -> None:
    caps = dict(ALL_CAPS)
    if efforts is not None:
        caps["efforts"] = efforts
    result = _resolver().resolve_routing(_config(), caps, tier="builder")
    assert "effort" not in result["agent_args"]
    assert result["effort_selection"] == "provider-managed"


def test_role_tier_hard_fallback_carries_expert_effort() -> None:
    config = _config()
    tiers = config["subagents"]["claude"]["tiers"]
    tiers["expert"] = {**tiers["expert"], "effort": "xhigh"}
    tiers["planner"] = {**tiers["planner"], "effort": "max"}
    caps = {
        **ALL_CAPS,
        "models": ["haiku", "sonnet", "opus"],
        "efforts": CLAUDE_EFFORTS,
    }
    result = _resolver().resolve_routing(
        config, caps, tier="planner", risk_signals=["schema migration"]
    )
    assert result["tier"] == "expert"
    assert result["agent_args"]["effort"] == "xhigh"
    assert result["configured"]["effort"] == "xhigh"


def test_role_tier_hard_fallback_reasons_have_no_duplicates() -> None:
    caps = {
        "models": ["haiku", "sonnet", "opus"],
        "agent_types": ALL_CAPS["agent_types"],
    }
    result = _resolver().resolve_routing(
        _config(), caps, tier="planner", risk_signals=["schema migration"]
    )
    assert result["tier"] == "expert"
    assert (
        "efforts capability missing or malformed; passing no effort"
        in result["reasons"]
    )
    assert len(result["reasons"]) == len(set(result["reasons"]))


def test_resolver_resolves_effort_independently_of_model() -> None:
    caps = {**ALL_CAPS, "models": [], "efforts": CLAUDE_EFFORTS}
    result = _resolver().resolve_routing(_config(), caps, tier="builder")
    assert result["agent_args"] == {
        "subagent_type": "forgewright:forgewright-builder",
        "effort": "medium",
    }
    assert result["model_selection"] == "provider-managed"
    assert result["effort_selection"] == "verified"


def test_resolver_cli_emits_effort_from_shipped_frontmatter() -> None:
    shipped = {path.stem: _frontmatter(path) for path in AGENTS.glob("*.md")}
    caps = {
        **ALL_CAPS,
        "efforts": sorted({meta["effort"] for meta in shipped.values()}),
    }
    for tier in sorted(EXPECTED):
        result = subprocess.run(
            [
                sys.executable,
                str(RESOLVER),
                "--tier",
                tier,
                "--capabilities-json",
                json.dumps(caps),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        args = json.loads(result.stdout)["agent_args"]
        agent = args["subagent_type"].split(":", 1)[1]
        assert shipped[agent]["effort"] == args["effort"] == EXPECTED_EFFORT[tier]


def test_model_tier_protocol_documents_claude_effort() -> None:
    text = (ROOT / "skills" / "_shared" / "protocols" / "model-tier.md").read_text(
        encoding="utf-8"
    )
    section = text.split("## Native Claude Code Configuration", 1)[1].split("\n## ", 1)[
        0
    ]
    assert "| Effort |" in section
    assert "effort_selection: verified" in section
    for tier, (agent, model) in EXPECTED.items():
        assert (
            f"| `{tier}` | `{agent}` | `{model}` | `{EXPECTED_EFFORT[tier]}` |"
            in section
        )
