from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_json(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def test_portable_and_harness_manifests_share_identity_and_version():
    package = load_json("package.json")
    portable = load_json("plugin.json")
    codex = load_json(".codex-plugin/plugin.json")
    claude = load_json(".claude-plugin/plugin.json")

    # Binding the Agent Plugins schema masks native hooks in the supported host.
    # This changes the packaging adapter, not any consent/behavioral oracle.
    assert "$schema" not in portable
    assert {portable["name"], codex["name"], claude["name"]} == {"forgewright"}
    assert {portable["version"], codex["version"], claude["version"]} == {
        package["version"]
    }
    assert codex["skills"] == "./skills/"
    assert codex["hooks"] == "./hooks/hooks.json"
    assert "mcpServers" not in codex
    assert portable["repository"] == "https://github.com/buiphucminhtam/forgewright"


def test_codex_and_claude_marketplaces_point_to_the_same_plugin_root():
    codex = load_json(".agents/plugins/marketplace.json")
    claude = load_json(".claude-plugin/marketplace.json")

    assert codex["name"] == claude["name"] == "forgewright-marketplace"
    [codex_plugin] = codex["plugins"]
    [claude_plugin] = claude["plugins"]
    assert codex_plugin["name"] == claude_plugin["name"] == "forgewright"
    assert codex_plugin["source"] == {"source": "local", "path": "./"}
    assert codex_plugin["policy"]["installation"] == "AVAILABLE"
    assert codex_plugin["policy"]["authentication"] in {"ON_INSTALL", "ON_USE"}
    assert claude_plugin["source"] == "./"
    assert claude_plugin["version"] == load_json("package.json")["version"]


def test_plugin_entry_skill_and_specialist_tree_are_discoverable():
    entry = ROOT / "skills/forgewright/SKILL.md"
    assert entry.is_file()
    text = entry.read_text(encoding="utf-8")
    assert text.startswith("---\nname: forgewright\n")
    assert "description:" in text

    skills = sorted(ROOT.glob("skills/*/SKILL.md"))
    public = [path for path in skills if not path.parent.name.startswith("_")]
    assert len(public) >= 80
    assert ROOT / "skills/debugger/SKILL.md" in public
    assert ROOT / "skills/software-engineer/SKILL.md" in public
    assert ROOT / "skills/code-reviewer/SKILL.md" in public


def test_plugin_defaults_to_lazy_skills_with_only_bounded_pretool_bootstrap_hook():
    codex = load_json(".codex-plugin/plugin.json")
    hooks = load_json("hooks/hooks.json")
    assert codex["skills"] == "./skills/"
    assert codex["hooks"] == "./hooks/hooks.json"
    assert "mcpServers" not in codex
    assert set(hooks["hooks"]) == {"PreToolUse"}
    [group] = hooks["hooks"]["PreToolUse"]
    assert group["matcher"] == "*"
    [hook] = group["hooks"]
    assert hook["type"] == "command"
    assert hook["command"] == 'node "${CLAUDE_PLUGIN_ROOT}/hooks/auto-bootstrap.mjs"'
    assert 1 <= hook["timeout"] <= 310
    assert (ROOT / "hooks/auto-bootstrap.mjs").is_file()
    assert not (ROOT / "hooks/session-start.sh").exists()


def test_plugin_manifests_do_not_embed_machine_paths_or_secrets():
    paths = [
        "plugin.json",
        ".codex-plugin/plugin.json",
        ".claude-plugin/plugin.json",
        ".claude-plugin/marketplace.json",
        ".agents/plugins/marketplace.json",
        "skills/forgewright/SKILL.md",
        "hooks/hooks.json",
        "hooks/auto-bootstrap.mjs",
    ]
    forbidden = [
        re.compile(r"/Users/"),
        re.compile(r"/home/[^$]"),
        re.compile(r"[A-Za-z]:\\\\"),
        re.compile(r"sk-[A-Za-z0-9]"),
        re.compile(r"TYPESAFE_API_KEY"),
    ]
    for relative in paths:
        text = (ROOT / relative).read_text(encoding="utf-8")
        for pattern in forbidden:
            assert not pattern.search(text), f"{relative} contains {pattern.pattern}"


def test_static_plugin_verifier_needs_no_codex_or_claude_cli(tmp_path: Path):
    script = ROOT / "scripts/ci/verify-plugin-distribution.py"
    result = subprocess.run(
        [sys.executable, str(script), "--static", "--root", str(ROOT)],
        cwd=ROOT,
        env={"PATH": "/usr/bin:/bin", "HOME": str(tmp_path)},
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["status"] == "pass"
    assert report["mode"] == "static"
    assert report["skills_first"] is True
    assert report["auto_bootstrap_hook"] == "hooks/auto-bootstrap.mjs"
    assert report["session_start_hook"] is False
    assert report["automatic_mcp"] is False
    capability = load_json("docs/capability-maturity.json")
    plugin = next(
        row
        for row in capability["capabilities"]
        if row["id"] == "agent-plugin-distribution"
    )
    assert plugin["verification_command"].endswith("--static")


def test_release_has_isolated_plugin_install_verifier():
    script = ROOT / "scripts/ci/verify-plugin-distribution.py"
    assert script.is_file()
    text = script.read_text(encoding="utf-8")
    assert "TemporaryDirectory" in text
    assert "CODEX_HOME" in text
    assert re.search(r'"plugin",\s*"install"', text)
    assert re.search(r'"plugin",\s*"add"', text)
    assert "forgewright@forgewright-marketplace" in text
    assert load_json("package.json")["scripts"]["verify:plugins"].endswith("--install")


def test_plugin_installation_does_not_require_mcp_or_host_dependencies():
    """The installable layer is skills-first plus one consent-gated local hook.

    The repository still contains a richer local MCP runtime, but plugin discovery
    must not advertise or start it until the global bootstrap policy opts in.
    """
    codex = load_json(".codex-plugin/plugin.json")
    portable = load_json("plugin.json")
    assert "mcpServers" not in codex
    assert "extensions" not in portable
    assert "dependencies" not in load_json(".claude-plugin/plugin.json")
