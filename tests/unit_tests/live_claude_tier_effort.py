"""Live checks that Claude Code loads the Forgewright tier agents.

The file name does not match ``python_files = test_*.py``, so default runs never
collect it and no skip is needed. Run it explicitly with a signed-in Claude Code
CLI (``FORGEWRIGHT_CLAUDE_CLI``, ``claude`` on PATH, or the CLI bundled with the
desktop app under ``%APPDATA%\\Claude\\claude-code``)::

    python -m pytest -q tests/unit_tests/live_claude_tier_effort.py

The runtime check reads the installed ``forgewright@forgewright-marketplace``
plugin; the end-to-end check loads this checkout with ``--plugin-dir`` in a
throwaway directory, dispatches the scout agent and spends a few model calls.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[2]
AGENTS = ROOT / "agents"
RESOLVER = ROOT / "scripts" / "runtime" / "claude-subagent-routing.py"
TIERS = ("scout", "builder", "expert", "planner", "reviewer")
PLUGIN_ID = "forgewright@forgewright-marketplace"


def _bundled_cli() -> str | None:
    """Return the newest Claude Code CLI bundled with the desktop app, if any."""
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return None
    candidates = sorted(
        (Path(appdata) / "Claude" / "claude-code").glob("*/*/claude.exe"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return str(candidates[0]) if candidates else None


def _cli() -> str:
    cli = (
        os.environ.get("FORGEWRIGHT_CLAUDE_CLI")
        or shutil.which("claude")
        or _bundled_cli()
    )
    if not cli:
        pytest.fail("no Claude Code CLI found; set FORGEWRIGHT_CLAUDE_CLI")
    return cli


def _frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n")
    return yaml.safe_load(text.split("---\n", 2)[1])


def _shipped() -> dict[str, dict]:
    return {tier: _frontmatter(AGENTS / f"forgewright-{tier}.md") for tier in TIERS}


def _installed_agents_dir() -> Path:
    cache = Path.home() / ".claude" / "plugins" / "cache"
    candidates = sorted(
        (
            path.parent
            for path in cache.rglob("forgewright-scout.md")
            if path.parent.name == "agents"
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        pytest.fail(f"no installed forgewright agents under {cache}")
    return candidates[0]


def test_installed_plugin_agents_pin_shipped_model_and_effort() -> None:
    details = subprocess.run(
        [_cli(), "plugin", "details", PLUGIN_ID],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
        check=False,
    )
    assert details.returncode == 0, details.stderr
    agents_line = next(
        line
        for line in details.stdout.splitlines()
        if line.strip().startswith("Agents")
    )
    for tier in TIERS:
        assert f"forgewright-{tier}" in agents_line

    installed = _installed_agents_dir()
    shipped = _shipped()
    for tier in TIERS:
        meta = _frontmatter(installed / f"forgewright-{tier}.md")
        assert (meta["model"], meta["effort"]) == (
            shipped[tier]["model"],
            shipped[tier]["effort"],
        ), tier

    caps = {
        "models": sorted({meta["model"] for meta in shipped.values()}),
        "agent_types": [f"forgewright:forgewright-{tier}" for tier in TIERS],
        "efforts": ["low", "medium", "high", "xhigh", "max"],
    }
    for tier in TIERS:
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
        assert args == {
            "subagent_type": f"forgewright:forgewright-{tier}",
            "model": shipped[tier]["model"],
            "effort": shipped[tier]["effort"],
        }


def test_headless_session_dispatches_plugin_scout_agent(tmp_path: Path) -> None:
    version = json.loads(
        (ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8")
    )["version"]
    target = (ROOT / ".claude-plugin" / "plugin.json").as_posix()
    prompt = (
        "Use the Agent tool exactly once with subagent_type "
        "'forgewright:forgewright-scout' and ask it to read the file "
        f"{target} and reply with only the value of its version field. "
        "Then reply with only that value."
    )
    result = subprocess.run(
        [
            _cli(),
            "-p",
            prompt,
            "--plugin-dir",
            str(ROOT),
            "--model",
            "haiku",
            "--output-format",
            "stream-json",
            "--verbose",
            "--allowedTools",
            "Agent,Read,Glob,Grep",
            "--add-dir",
            str(ROOT),
            "--max-turns",
            "8",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=480,
        check=False,
    )
    assert result.returncode == 0, result.stderr[-2000:]
    events = [
        json.loads(line) for line in result.stdout.splitlines() if line.startswith("{")
    ]

    dispatched = [
        block
        for event in events
        if event.get("type") == "assistant" and not event.get("parent_tool_use_id")
        for block in event.get("message", {}).get("content", [])
        if block.get("type") == "tool_use"
        and block.get("name") in {"Agent", "Task"}
        and block.get("input", {}).get("subagent_type")
        == "forgewright:forgewright-scout"
    ]
    assert dispatched, "parent never dispatched forgewright:forgewright-scout"

    sub_models = {
        event["message"].get("model", "")
        for event in events
        if event.get("type") == "assistant" and event.get("parent_tool_use_id")
    }
    assert sub_models and all("haiku" in model for model in sub_models), sub_models

    final = next(event for event in reversed(events) if event.get("type") == "result")
    assert final.get("is_error") is False
    assert version in final.get("result", "")
