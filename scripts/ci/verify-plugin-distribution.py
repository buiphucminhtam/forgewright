#!/usr/bin/env python3
"""Verify Forgewright plugin discovery/install in isolated Codex and Claude homes."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any


class PluginVerifyError(RuntimeError):
    pass


PLUGIN_JSON_PATHS = (
    "plugin.json",
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".agents/plugins/marketplace.json",
)


def _load_json(root: Path, relative: str) -> dict[str, Any]:
    path = root / relative
    if not path.is_file() or path.stat().st_size > 256 * 1024:
        raise PluginVerifyError(f"bounded plugin JSON required: {relative}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise PluginVerifyError(f"invalid JSON: {relative}") from error
    if not isinstance(value, dict):
        raise PluginVerifyError(f"plugin JSON must be an object: {relative}")
    return value


def verify_static(root: Path) -> dict[str, Any]:
    root = root.resolve()
    package = _load_json(root, "package.json")
    portable = _load_json(root, "plugin.json")
    codex = _load_json(root, ".codex-plugin/plugin.json")
    claude = _load_json(root, ".claude-plugin/plugin.json")
    codex_market = _load_json(root, ".agents/plugins/marketplace.json")
    claude_market = _load_json(root, ".claude-plugin/marketplace.json")

    version = package.get("version")
    if not isinstance(version, str) or not version:
        raise PluginVerifyError("package.json version is missing")
    if (
        portable.get("$schema")
        != "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
    ):
        raise PluginVerifyError("portable plugin schema mismatch")
    if {portable.get("name"), codex.get("name"), claude.get("name")} != {"forgewright"}:
        raise PluginVerifyError("plugin identity mismatch")
    if {portable.get("version"), codex.get("version"), claude.get("version")} != {
        version
    }:
        raise PluginVerifyError("plugin version mismatch")
    if codex.get("skills") != "./skills/":
        raise PluginVerifyError("Codex plugin must discover the shared skills/ tree")
    if codex.get("hooks") != "./hooks/hooks.json":
        raise PluginVerifyError(
            "Codex plugin must bind the canonical bootstrap hook manifest"
        )
    if "mcpServers" in codex:
        raise PluginVerifyError(
            "plugin installation must not advertise local MCP automatically"
        )
    if "dependencies" in claude:
        raise PluginVerifyError(
            "default Claude plugin must not declare host dependencies"
        )

    codex_plugins = codex_market.get("plugins")
    claude_plugins = claude_market.get("plugins")
    if not isinstance(codex_plugins, list) or len(codex_plugins) != 1:
        raise PluginVerifyError("Codex marketplace must expose exactly one plugin")
    if not isinstance(claude_plugins, list) or len(claude_plugins) != 1:
        raise PluginVerifyError("Claude marketplace must expose exactly one plugin")
    codex_entry = codex_plugins[0]
    claude_entry = claude_plugins[0]
    if (
        codex_entry.get("name") != "forgewright"
        or claude_entry.get("name") != "forgewright"
    ):
        raise PluginVerifyError("marketplace plugin identity mismatch")
    if codex_entry.get("source") != {"source": "local", "path": "./"}:
        raise PluginVerifyError("Codex marketplace source must be the repository root")
    if claude_entry.get("source") != "./":
        raise PluginVerifyError("Claude marketplace source must be the repository root")
    if claude_entry.get("version") != version:
        raise PluginVerifyError("Claude marketplace version mismatch")

    entry_skill = root / "skills" / "forgewright" / "SKILL.md"
    if not entry_skill.is_file():
        raise PluginVerifyError("Forgewright plugin entry skill is missing")
    hooks = _load_json(root, "hooks/hooks.json")
    if set(hooks) - {"description", "hooks"}:
        raise PluginVerifyError(
            "plugin hook manifest contains unsupported top-level fields"
        )
    hook_map = hooks.get("hooks")
    if not isinstance(hook_map, dict) or set(hook_map) != {"PreToolUse"}:
        raise PluginVerifyError(
            "default plugin must expose exactly one PreToolUse hook event"
        )
    groups = hook_map.get("PreToolUse")
    if not isinstance(groups, list) or len(groups) != 1:
        raise PluginVerifyError("PreToolUse must contain exactly one group")
    group = groups[0]
    if not isinstance(group, dict) or group.get("matcher") != "*":
        raise PluginVerifyError("auto-bootstrap PreToolUse matcher must be '*'")
    commands = group.get("hooks")
    if not isinstance(commands, list) or len(commands) != 1:
        raise PluginVerifyError(
            "auto-bootstrap PreToolUse must contain exactly one command"
        )
    command = commands[0]
    expected_command = 'node "${PLUGIN_ROOT}/hooks/auto-bootstrap.mjs"'
    if (
        not isinstance(command, dict)
        or command.get("type") != "command"
        or command.get("command") != expected_command
    ):
        raise PluginVerifyError("auto-bootstrap hook command mismatch")
    timeout = command.get("timeout")
    if not isinstance(timeout, int) or not 1 <= timeout <= 310:
        raise PluginVerifyError(
            "auto-bootstrap hook timeout is outside the bounded contract"
        )
    hook_script = root / "hooks" / "auto-bootstrap.mjs"
    if not hook_script.is_file() or hook_script.stat().st_size > 128 * 1024:
        raise PluginVerifyError("bounded auto-bootstrap hook script is missing")
    if (root / "hooks" / "session-start.sh").exists():
        raise PluginVerifyError(
            "default plugin must not inject SessionStart shell context"
        )
    forbidden = ("/Users/", "TYPESAFE_API_KEY", "sk-")
    for relative in PLUGIN_JSON_PATHS + (
        "skills/forgewright/SKILL.md",
        "hooks/hooks.json",
        "hooks/auto-bootstrap.mjs",
    ):
        text = (root / relative).read_text(encoding="utf-8")
        if any(marker in text for marker in forbidden):
            raise PluginVerifyError(f"machine path or credential marker in {relative}")

    return {
        "schema": "forgewright-plugin-verification/v1",
        "status": "pass",
        "mode": "static",
        "root": str(root),
        "version": version,
        "skills_first": True,
        "entry_skill": "skills/forgewright/SKILL.md",
        "auto_bootstrap_hook": "hooks/auto-bootstrap.mjs",
        "session_start_hook": False,
        "automatic_mcp": False,
    }


def run(
    argv: list[str], *, env: dict[str, str], cwd: Path, timeout: int
) -> dict[str, Any]:
    started = time.monotonic()
    try:
        result = subprocess.run(
            argv,
            cwd=cwd,
            env=env,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise PluginVerifyError(f"timeout: {' '.join(argv)}") from error
    record = {
        "argv": argv,
        "exit_code": result.returncode,
        "duration_ms": round((time.monotonic() - started) * 1000),
        "stdout": result.stdout[-8000:],
        "stderr": result.stderr[-4000:],
    }
    if result.returncode != 0:
        raise PluginVerifyError(
            f"command failed ({result.returncode}): {' '.join(argv)}\n"
            f"{result.stderr[-2000:]}"
        )
    return record


def verify(root: Path, *, install: bool) -> dict[str, Any]:
    root = root.resolve()
    codex_bin = shutil.which("codex")
    claude_bin = shutil.which("claude")
    if not codex_bin or not claude_bin:
        raise PluginVerifyError("both codex and claude CLIs are required")
    checks: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="forgewright-plugin-verify-") as folder:
        temp = Path(folder)
        home = temp / "home"
        codex_home = temp / "codex"
        home.mkdir()
        codex_home.mkdir()

        claude_env = {**os.environ, "HOME": str(home)}
        codex_env = {
            **os.environ,
            "HOME": str(home),
            "CODEX_HOME": str(codex_home),
        }

        checks.append(
            run(
                [claude_bin, "plugin", "validate", str(root)],
                env=claude_env,
                cwd=root,
                timeout=30,
            )
        )
        checks.append(
            run(
                [claude_bin, "plugin", "marketplace", "add", str(root)],
                env=claude_env,
                cwd=root,
                timeout=30,
            )
        )
        checks.append(
            run(
                [codex_bin, "plugin", "marketplace", "add", str(root)],
                env=codex_env,
                cwd=root,
                timeout=30,
            )
        )
        codex_list = run(
            [codex_bin, "plugin", "list"],
            env=codex_env,
            cwd=root,
            timeout=30,
        )
        checks.append(codex_list)
        if "forgewright@forgewright-marketplace" not in codex_list["stdout"]:
            raise PluginVerifyError("Codex marketplace did not discover Forgewright")

        installed: dict[str, Any] = {"requested": install}
        if install:
            codex_install = run(
                [codex_bin, "plugin", "add", "forgewright@forgewright-marketplace"],
                env=codex_env,
                cwd=root,
                timeout=90,
            )
            checks.append(codex_install)
            codex_after = run(
                [codex_bin, "plugin", "list"],
                env=codex_env,
                cwd=root,
                timeout=30,
            )
            checks.append(codex_after)
            if "forgewright@forgewright-marketplace" not in codex_after["stdout"]:
                raise PluginVerifyError("Codex installed plugin is not listed")

            claude_install = run(
                [
                    claude_bin,
                    "plugin",
                    "install",
                    "forgewright@forgewright-marketplace",
                    "--scope",
                    "user",
                ],
                env=claude_env,
                cwd=root,
                timeout=120,
            )
            checks.append(claude_install)
            claude_list = run(
                [claude_bin, "plugin", "list"],
                env=claude_env,
                cwd=root,
                timeout=30,
            )
            checks.append(claude_list)
            details = run(
                [
                    claude_bin,
                    "plugin",
                    "details",
                    "forgewright@forgewright-marketplace",
                ],
                env=claude_env,
                cwd=root,
                timeout=30,
            )
            checks.append(details)
            if "forgewright" not in (claude_list["stdout"] + details["stdout"]).lower():
                raise PluginVerifyError("Claude installed plugin is not discoverable")

            claude_cache = home / ".claude" / "plugins" / "cache"
            claude_entry = list(claude_cache.rglob("skills/forgewright/SKILL.md"))
            claude_hook = list(claude_cache.rglob("hooks/auto-bootstrap.mjs"))
            claude_manifest = list(claude_cache.rglob("hooks/hooks.json"))
            if not claude_entry or not claude_hook or not claude_manifest:
                raise PluginVerifyError(
                    "Claude cache is missing the entry skill or auto-bootstrap hook package"
                )
            installed.update(
                {
                    "codex_listed": True,
                    "claude_listed": True,
                    "claude_entry_skill": True,
                    "auto_bootstrap_hook": True,
                    "session_start_hook": False,
                }
            )

    return {
        "schema": "forgewright-plugin-verification/v1",
        "status": "pass",
        "root": str(root),
        "install": installed,
        "checks": [
            {
                "argv": record["argv"],
                "exit_code": record["exit_code"],
                "duration_ms": record["duration_ms"],
            }
            for record in checks
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--static", action="store_true")
    mode.add_argument("--install", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = (
        verify_static(args.root)
        if args.static
        else verify(args.root, install=args.install)
    )
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PluginVerifyError as error:
        print(f"plugin-verification: {error}", file=sys.stderr)
        raise SystemExit(2)
