from __future__ import annotations

import json
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / ".forgewright" / "execution-policy.yaml"
SEEDER = ROOT / "scripts" / "lite" / "ensure-project-policy.sh"
SETUP_PROJECT = ROOT / "scripts" / "bootstrap" / "setup-project.sh"
SETUP_CLI = ROOT / "scripts" / "bootstrap" / "forgewright-setup.sh"
MCP_SETUP = ROOT / "scripts" / "mcp" / "forgewright-mcp-setup.sh"
DOCTOR = ROOT / "scripts" / "hooks" / "forgewright-hook-doctor.sh"
GATE = ROOT / "scripts" / "lite" / "antigravity-pre-tool-gate.sh"
GIT_LOCAL_ENV_VARS = subprocess.run(
    ("git", "rev-parse", "--local-env-vars"),
    cwd=ROOT,
    text=True,
    capture_output=True,
    check=True,
).stdout.splitlines()


def run(
    *args: str,
    cwd: Path,
    env: dict[str, str] | None = None,
    stdin: str | None = None,
) -> subprocess.CompletedProcess[str]:
    clean_env = os.environ.copy()
    for variable in GIT_LOCAL_ENV_VARS:
        clean_env.pop(variable, None)
    clean_env.update(env or {})
    return subprocess.run(
        args,
        cwd=cwd,
        env=clean_env,
        input=stdin,
        text=True,
        capture_output=True,
        check=False,
    )


def git(cwd: Path, *args: str) -> str:
    result = run("git", *args, cwd=cwd)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def configure_repo(path: Path) -> None:
    git(path, "config", "user.email", "tests@example.com")
    git(path, "config", "user.name", "Tests")


def test_policy_seeder_creates_parent_policy_and_preserves_customization(
    tmp_path: Path,
) -> None:
    assert SEEDER.is_file()
    source = tmp_path / "source"
    target = tmp_path / "target"
    (source / ".forgewright").mkdir(parents=True)
    target.mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)
    unrelated_tmp = tmp_path / "unrelated-tmp"
    unrelated_tmp.mkdir()

    created = run(
        "bash",
        str(SEEDER),
        str(source),
        str(target),
        cwd=target,
        env={"TMPDIR": str(unrelated_tmp)},
    )
    assert created.returncode == 0, created.stderr
    parent_policy = target / ".forgewright" / POLICY.name
    assert parent_policy.read_text(encoding="utf-8") == POLICY.read_text(
        encoding="utf-8"
    )
    assert "created" in created.stdout

    parent_policy.write_text("customized: true\n", encoding="utf-8")
    preserved = run("bash", str(SEEDER), str(source), str(target), cwd=target)
    assert preserved.returncode == 0, preserved.stderr
    assert parent_policy.read_text(encoding="utf-8") == "customized: true\n"
    assert "preserved" in preserved.stdout


def test_policy_seeder_is_atomic_under_concurrent_installers(tmp_path: Path) -> None:
    source = tmp_path / "source"
    target = tmp_path / "target"
    (source / ".forgewright").mkdir(parents=True)
    target.mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)

    def seed() -> subprocess.CompletedProcess[str]:
        return run("bash", str(SEEDER), str(source), str(target), cwd=target)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: seed(), range(8)))

    assert all(result.returncode == 0 for result in results), [
        result.stderr for result in results
    ]
    assert sum("created" in result.stdout for result in results) == 1
    assert sum("preserved" in result.stdout for result in results) == 7
    assert (target / ".forgewright" / POLICY.name).read_bytes() == POLICY.read_bytes()
    assert not list((target / ".forgewright").glob(".execution-policy.yaml.*"))


def test_policy_seeder_installs_cleanup_trap_and_preserves_symlinks(
    tmp_path: Path,
) -> None:
    source_text = SEEDER.read_text(encoding="utf-8")
    assert "trap cleanup EXIT HUP INT TERM" in source_text

    source = tmp_path / "source"
    target = tmp_path / "target"
    (source / ".forgewright").mkdir(parents=True)
    target.mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)
    target_policy_dir = target / ".forgewright"
    target_policy_dir.mkdir()
    parent_policy = target_policy_dir / POLICY.name
    parent_policy.symlink_to(target / "custom-policy.yaml")

    preserved = run("bash", str(SEEDER), str(source), str(target), cwd=target)
    assert preserved.returncode == 0, preserved.stderr
    assert parent_policy.is_symlink()
    assert "preserved" in preserved.stdout


def test_policy_seeder_fails_for_missing_source_or_non_file_destination(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source"
    target = tmp_path / "target"
    source.mkdir()
    target.mkdir()

    missing_source = run("bash", str(SEEDER), str(source), str(target), cwd=target)
    assert missing_source.returncode != 0
    assert not (target / ".forgewright" / POLICY.name).exists()

    (source / ".forgewright").mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)
    destination = target / ".forgewright" / POLICY.name
    destination.mkdir(parents=True)
    conflict = run("bash", str(SEEDER), str(source), str(target), cwd=target)
    assert conflict.returncode != 0
    assert "not a file or symlink" in conflict.stderr


def test_policy_seeder_fails_when_atomic_publication_fails_without_race(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source"
    target = tmp_path / "target"
    fake_bin = tmp_path / "bin"
    (source / ".forgewright").mkdir(parents=True)
    target.mkdir()
    fake_bin.mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)
    fake_ln = fake_bin / "ln"
    fake_ln.write_text("#!/usr/bin/env sh\nexit 1\n", encoding="utf-8")
    fake_ln.chmod(0o755)

    failed = run(
        "bash",
        str(SEEDER),
        str(source),
        str(target),
        cwd=target,
        env={"PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}"},
    )

    assert failed.returncode != 0
    assert "could not publish execution policy" in failed.stderr
    assert not (target / ".forgewright" / POLICY.name).exists()
    assert not list((target / ".forgewright").glob(".execution-policy.yaml.*"))


def test_setup_entrypoints_use_shared_policy_seeder() -> None:
    for script in (SETUP_PROJECT, SETUP_CLI):
        source = script.read_text(encoding="utf-8")
        assert "ensure-project-policy.sh" in source
        assert '"$policy_seeder"' in source


def test_setup_check_finds_submodule_root_and_canonical_mcp_entry(
    tmp_path: Path,
) -> None:
    home = tmp_path / "home"
    project = tmp_path / "project"
    claude_config = home / ".claude.json"
    claude_settings = home / ".claude" / "settings.json"
    project.mkdir()
    claude_settings.parent.mkdir(parents=True)
    canonical_command = str(
        home / ".forgewright" / "mcp-server" / "node_modules" / ".bin" / "tsx"
    )
    canonical_server = str(home / ".forgewright" / "mcp-server" / "src" / "index.ts")
    claude_settings.write_text(json.dumps({"hooks": {"Stop": []}}), encoding="utf-8")
    claude_config.write_text(
        json.dumps(
            {
                "mcpServers": {
                    "forgewright": {
                        "command": canonical_command,
                        "args": [canonical_server],
                    }
                }
            }
        ),
        encoding="utf-8",
    )

    result = run(
        "bash",
        str(SETUP_CLI),
        "--check",
        str(project),
        cwd=project,
        env={"HOME": str(home)},
    )

    assert result.returncode == 0, result.stderr
    assert f"ForgeWright: {ROOT}" in result.stdout
    assert f"MCP Config: Configured ({claude_config})" in result.stdout
    assert "ForgeWright: Not found" not in result.stdout

    claude_settings.write_text(
        json.dumps(
            {"mcpServers": {"forgewright": {"command": "/wrong/file/must/be/ignored"}}}
        ),
        encoding="utf-8",
    )
    claude_config.write_text(json.dumps({"hooks": {"Stop": []}}), encoding="utf-8")
    hook_only = run(
        "bash",
        str(SETUP_CLI),
        "--check",
        str(project),
        cwd=project,
        env={"HOME": str(home)},
    )
    assert hook_only.returncode == 0, hook_only.stderr
    assert "MCP Config: No enabled ForgeWright entry" in hook_only.stdout
    assert "MCP Config: Configured" not in hook_only.stdout

    claude_config.write_text(
        json.dumps(
            {
                "mcpServers": {
                    "forgewright": {
                        "command": canonical_command,
                        "args": [canonical_server],
                        "enabled": False,
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    disabled = run(
        "bash",
        str(SETUP_CLI),
        "--check",
        str(project),
        cwd=project,
        env={"HOME": str(home)},
    )
    assert disabled.returncode == 0, disabled.stderr
    assert "MCP Config: No enabled ForgeWright entry" in disabled.stdout
    assert "MCP Config: Configured" not in disabled.stdout


def test_setup_diagnostics_use_actual_codex_gemini_and_linux_claude_configs(
    tmp_path: Path,
) -> None:
    home = tmp_path / "home"
    project = tmp_path / "project"
    xdg = home / "xdg"
    fake_bin = tmp_path / "bin"
    codex = home / ".codex" / "config.toml"
    gemini = home / ".gemini" / "settings.json"
    gemini_enablement = home / ".gemini" / "mcp-server-enablement.json"
    claude_user = home / ".claude.json"
    linux_claude = xdg / "Claude" / "claude_desktop_config.json"
    zed = xdg / "zed" / "settings.json"
    opencode = xdg / "opencode" / "opencode.json"
    project.mkdir()
    codex.parent.mkdir(parents=True)
    gemini.parent.mkdir(parents=True)
    linux_claude.parent.mkdir(parents=True)
    zed.parent.mkdir(parents=True)
    opencode.parent.mkdir(parents=True)
    fake_bin.mkdir()
    canonical_command = str(
        home / ".forgewright" / "mcp-server" / "node_modules" / ".bin" / "tsx"
    )
    canonical_server = str(home / ".forgewright" / "mcp-server" / "src" / "index.ts")
    claude_user.write_text(
        json.dumps(
            {
                "mcpServers": {
                    "forgewright": {
                        "command": canonical_command,
                        "args": [canonical_server],
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    codex.write_text(
        f'[mcp_servers.forgewright]\nenabled = false\ncommand = "{canonical_command}"\nargs = ["{canonical_server}"]\n',
        encoding="utf-8",
    )
    gemini.write_text(
        json.dumps(
            {
                "mcpServers": {
                    "forgewright": {
                        "command": canonical_command,
                        "args": [canonical_server],
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    gemini_enablement.write_text(
        json.dumps({"forgewright": {"enabled": False}, "other": {"enabled": False}}),
        encoding="utf-8",
    )
    linux_claude.write_text(
        json.dumps(
            {
                "mcpServers": {
                    "forgewright": {
                        "command": canonical_command,
                        "args": [canonical_server],
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    zed.write_text(
        json.dumps(
            {
                "context_servers": {
                    "forgewright": {
                        "command": canonical_command,
                        "args": [canonical_server],
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    opencode.write_text(
        json.dumps(
            {
                "mcp": {
                    "forgewright": {
                        "type": "local",
                        "command": [canonical_command, canonical_server],
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    fake_uname = fake_bin / "uname"
    fake_uname.write_text("#!/usr/bin/env sh\necho Linux\n", encoding="utf-8")
    fake_uname.chmod(0o755)

    result = run(
        "bash",
        str(SETUP_CLI),
        "--diagnose",
        str(project),
        cwd=project,
        env={
            "HOME": str(home),
            "XDG_CONFIG_HOME": str(xdg),
            "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
        },
    )

    assert result.returncode == 0, result.stderr
    assert f"claude-code: enabled ({claude_user})" in result.stdout
    assert f"codex: not configured or disabled ({codex})" in result.stdout
    assert f"gemini: not configured or disabled ({gemini})" in result.stdout
    assert f"claude-desktop: enabled ({linux_claude})" in result.stdout
    assert f"zed: enabled ({zed})" in result.stdout
    assert f"opencode: enabled ({opencode})" in result.stdout
    assert "/.config/google/mcp-cli/config.json" not in result.stdout
    assert "/opencode/config.toml" not in result.stdout
    assert "/opencode/config.json" not in result.stdout


def test_bootstrap_delegates_canonical_mcp_setup_and_manifest_contract(
    tmp_path: Path,
) -> None:
    fw = tmp_path / "forgewright"
    project = tmp_path / "project"
    home = tmp_path / "home"
    xdg = home / "xdg"
    fake_bin = tmp_path / "bin"
    bootstrap = fw / "scripts" / "bootstrap" / SETUP_CLI.name
    canonical = fw / "scripts" / "mcp" / "forgewright-mcp-setup.sh"
    seeder = fw / "scripts" / "lite" / "ensure-project-policy.sh"
    bootstrap.parent.mkdir(parents=True)
    canonical.parent.mkdir(parents=True)
    seeder.parent.mkdir(parents=True)
    project.mkdir()
    home.mkdir()
    fake_bin.mkdir()
    shutil.copy2(SETUP_CLI, bootstrap)
    (fw / "AGENTS.md").write_text("# Fixture\n", encoding="utf-8")
    seeder.write_text(
        "#!/usr/bin/env bash\n"
        'mkdir -p "$2/.forgewright"\n'
        "printf 'safe: true\\n' > \"$2/.forgewright/execution-policy.yaml\"\n"
        "printf 'created:%s\\n' \"$2/.forgewright/execution-policy.yaml\"\n",
        encoding="utf-8",
    )
    canonical.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        'mkdir -p .antigravity "$HOME/.forgewright/mcp-server/src"\n'
        "printf '%s\\n' \"$*\" >> .antigravity/canonical-args.txt\n"
        'node - "$(pwd -P)" "$HOME/.forgewright" "$@" <<\'NODE\'\n'
        "const fs = require('fs');\n"
        "const [workspace, root, ...args] = process.argv.slice(2);\n"
        "const paths = {\n"
        "  '--cursor': ['cursor', `${root}/cursor.json`],\n"
        "  '--claude-code': ['claude_code', `${root}/claude.json`],\n"
        "  '--claude-desktop': ['claude_desktop', `${root}/desktop.json`],\n"
        "  '--codex': ['codex', `${root}/codex.toml`],\n"
        "  '--gemini': ['gemini', `${root}/gemini.json`],\n"
        "  '--antigravity': ['antigravity', `${root}/antigravity.json`],\n"
        "  '--zed': ['zed', `${root}/zed.json`],\n"
        "  '--opencode': ['opencode', `${root}/opencode.jsonc`],\n"
        "};\n"
        "const platforms = Object.fromEntries(args.filter((arg) => paths[arg]).map((arg) => paths[arg]));\n"
        "const server = `${root}/mcp-server/src/index.ts`;\n"
        "const manifest = {manifest_version:'1.0', workspace, "
        "forgewright:{version:'test', canonical:root, server}, "
        "servers:[{name:'forgewright', path:server, enabled:true}], "
        "settings:{workspace_detection:'git-root'}, platforms, "
        "generated_at:'2026-01-01T00:00:00Z'};\n"
        "fs.writeFileSync('.antigravity/mcp-manifest.json', "
        "JSON.stringify(manifest, null, 2) + '\\n');\n"
        "NODE\n",
        encoding="utf-8",
    )
    for script in (bootstrap, canonical, seeder):
        script.chmod(0o755)

    detected_paths = (
        home / ".cursor" / "mcp.json",
        home / ".claude.json",
        xdg / "Claude" / "claude_desktop_config.json",
        home / ".codex" / "config.toml",
        home / ".gemini" / "settings.json",
        home / ".gemini" / "config" / "mcp_config.json",
        xdg / "zed" / "settings.json",
        xdg / "opencode" / "opencode.jsonc",
    )
    for path in detected_paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n" if path.suffix == ".toml" else "{}\n", encoding="utf-8")
    fake_uname = fake_bin / "uname"
    fake_uname.write_text("#!/usr/bin/env sh\necho Linux\n", encoding="utf-8")
    fake_uname.chmod(0o755)

    result = run(
        "bash",
        str(bootstrap),
        str(project),
        cwd=project,
        env={
            "HOME": str(home),
            "XDG_CONFIG_HOME": str(xdg),
            "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
        },
    )

    assert result.returncode == 0, result.stderr
    manifest = json.loads(
        (project / ".antigravity" / "mcp-manifest.json").read_text(encoding="utf-8")
    )
    assert manifest["manifest_version"] == "1.0"
    assert manifest["workspace"] == str(project.resolve())
    assert manifest["forgewright"]["server"].endswith("/mcp-server/src/index.ts")
    delegated = (
        (project / ".antigravity" / "canonical-args.txt")
        .read_text(encoding="utf-8")
        .splitlines()
    )
    expected_flags = [
        "--cursor",
        "--claude-code",
        "--claude-desktop",
        "--codex",
        "--gemini",
        "--antigravity",
        "--zed",
        "--opencode",
    ]
    assert delegated == [" ".join(expected_flags)]
    assert set(manifest["platforms"]) == {
        "cursor",
        "claude_code",
        "claude_desktop",
        "codex",
        "gemini",
        "antigravity",
        "zed",
        "opencode",
    }
    assert "--all" not in delegated
    assert not (project / ".forgewright" / "mcp-server" / "server.ts").exists()
    source = bootstrap.read_text(encoding="utf-8")
    assert ".forgewright/mcp-server/server.ts" not in source
    assert "scripts/mcp/forgewright-mcp-setup.sh" in source
    assert "local client platform_flag" in source
    assert 'claude-desktop) platform_flag="--claude-desktop"' in source


def test_bootstrap_check_and_diagnose_use_client_schemas_and_prefer_jsonc(
    tmp_path: Path,
) -> None:
    fw = tmp_path / "fresh-forgewright"
    bootstrap = fw / "scripts" / "bootstrap" / SETUP_CLI.name
    canonical = fw / "scripts" / "mcp" / MCP_SETUP.name
    home = tmp_path / "home"
    project = tmp_path / "project"
    xdg = home / "xdg"
    fake_bin = tmp_path / "bin"
    cursor = home / ".cursor" / "mcp.json"
    claude = home / ".claude.json"
    codex = home / ".codex" / "config.toml"
    gemini = home / ".gemini" / "settings.json"
    antigravity = home / ".gemini" / "config" / "mcp_config.json"
    zed = xdg / "zed" / "settings.json"
    opencode_json = xdg / "opencode" / "opencode.json"
    opencode_jsonc = xdg / "opencode" / "opencode.jsonc"
    bootstrap.parent.mkdir(parents=True)
    canonical.parent.mkdir(parents=True)
    shutil.copy2(SETUP_CLI, bootstrap)
    shutil.copy2(MCP_SETUP, canonical)
    (fw / "AGENTS.md").write_text("# Fresh fixture\n", encoding="utf-8")
    assert not (fw / "mcp" / "node_modules").exists()
    for path in (cursor, claude, codex, gemini, antigravity, zed, opencode_jsonc):
        path.parent.mkdir(parents=True, exist_ok=True)
    project.mkdir()
    fake_bin.mkdir()
    fake_uname = fake_bin / "uname"
    fake_uname.write_text("#!/usr/bin/env sh\necho Linux\n", encoding="utf-8")
    fake_uname.chmod(0o755)
    canonical_command = str(
        home / ".forgewright" / "mcp-server" / "node_modules" / ".bin" / "tsx"
    )
    canonical_server = str(home / ".forgewright" / "mcp-server" / "src" / "index.ts")
    empty_generic = {"mcpServers": {"forgewright": {"command": "", "args": []}}}
    for path in (cursor, claude, gemini, antigravity):
        path.write_text(json.dumps(empty_generic), encoding="utf-8")
    codex.write_text(
        '[mcp_servers.forgewright]\ncommand = ""\nargs = []\n',
        encoding="utf-8",
    )
    zed.write_text(
        '{\n  // empty Zed entry\n  "context_servers": {\n'
        '    "forgewright": { "command": "", "args": [], },\n  },\n}\n',
        encoding="utf-8",
    )
    opencode_json.write_text('{"conflict":"ignore"}\n', encoding="utf-8")
    opencode_jsonc.write_text(
        '{\n  // active OpenCode JSONC\n  "mcp": {\n'
        '    "forgewright": { "type": "local", "command": [], },\n  },\n}\n',
        encoding="utf-8",
    )

    env = {
        "HOME": str(home),
        "XDG_CONFIG_HOME": str(xdg),
        "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
    }
    check = run("bash", str(bootstrap), "--check", str(project), cwd=project, env=env)
    diagnose = run(
        "bash", str(bootstrap), "--diagnose", str(project), cwd=project, env=env
    )
    assert check.returncode == 0, check.stderr
    assert diagnose.returncode == 0, diagnose.stderr
    assert "MCP Config: Configured" not in check.stdout
    assert "enabled (" not in diagnose.stdout
    assert str(opencode_jsonc) in check.stdout
    assert f"({opencode_json})" not in check.stdout

    zed.write_text(
        '{\n  // preserve Zed status comment\n  "context_servers": {\n'
        f'    "forgewright": {{ "command": {json.dumps(canonical_command)}, '
        f'"args": [{json.dumps(canonical_server)}], }},\n  }},\n}}\n',
        encoding="utf-8",
    )
    opencode_jsonc.write_text(
        '{\n  // preserve OpenCode status comment\n  "mcp": {\n'
        '    "forgewright": { "type": "local", "command": '
        f"[{json.dumps(canonical_command)}, {json.dumps(canonical_server)}], }},\n"
        "  },\n}\n",
        encoding="utf-8",
    )
    configured = run(
        "bash", str(bootstrap), "--diagnose", str(project), cwd=project, env=env
    )
    assert configured.returncode == 0, configured.stderr
    assert f"zed: enabled ({zed})" in configured.stdout
    assert f"opencode: enabled ({opencode_jsonc})" in configured.stdout
    assert "preserve Zed status comment" in zed.read_text(encoding="utf-8")
    assert "preserve OpenCode status comment" in opencode_jsonc.read_text(
        encoding="utf-8"
    )
    assert opencode_json.read_text(encoding="utf-8") == '{"conflict":"ignore"}\n'

    gemini.write_text(
        json.dumps(
            {
                "mcpServers": {
                    "forgewright": {
                        "command": canonical_command,
                        "args": [canonical_server],
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    enablement = home / ".gemini" / "mcp-server-enablement.json"
    enablement.write_text(
        json.dumps({"forgewright": {"enabled": True, "unexpected": True}}),
        encoding="utf-8",
    )
    enabled_state = run(
        "bash", str(bootstrap), "--diagnose", str(project), cwd=project, env=env
    )
    assert enabled_state.returncode == 0, enabled_state.stderr
    assert f"gemini: not configured or disabled ({gemini})" in enabled_state.stdout
    enablement.write_text("{}\n", encoding="utf-8")

    extra_generic = {
        "mcpServers": {
            "forgewright": {
                "command": canonical_command,
                "args": [canonical_server, "--unexpected"],
            }
        }
    }
    for path in (cursor, claude, gemini, antigravity):
        path.write_text(json.dumps(extra_generic), encoding="utf-8")
    codex.write_text(
        "[mcp_servers.forgewright]\n"
        f"command = {json.dumps(canonical_command)}\n"
        f'args = [{json.dumps(canonical_server)}, "--unexpected"]\n',
        encoding="utf-8",
    )
    zed.write_text(
        json.dumps(
            {
                "context_servers": {
                    "forgewright": {
                        "command": canonical_command,
                        "args": [canonical_server, "--unexpected"],
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    opencode_jsonc.write_text(
        json.dumps(
            {
                "mcp": {
                    "forgewright": {
                        "type": "local",
                        "command": [
                            canonical_command,
                            canonical_server,
                            "--unexpected",
                        ],
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    extra = run(
        "bash", str(bootstrap), "--diagnose", str(project), cwd=project, env=env
    )
    assert extra.returncode == 0, extra.stderr
    assert "enabled (" not in extra.stdout

    malformed = '{\n  // unterminated JSONC\n  "mcp": { /* missing end\n}\n'
    opencode_jsonc.write_text(malformed, encoding="utf-8")
    malformed_check = run(
        "bash", str(bootstrap), "--check", str(project), cwd=project, env=env
    )
    assert malformed_check.returncode == 0, malformed_check.stderr
    assert f"No enabled ForgeWright entry ({opencode_jsonc})" in malformed_check.stdout
    assert opencode_jsonc.read_text(encoding="utf-8") == malformed


def test_bootstrap_resolves_topmost_nested_submodule_before_seeding_and_mcp(
    tmp_path: Path,
) -> None:
    inner = tmp_path / "inner"
    inner.mkdir()
    git(inner, "init", "-b", "main")
    configure_repo(inner)
    (inner / "README.md").write_text("inner\n", encoding="utf-8")
    git(inner, "add", ".")
    git(inner, "commit", "-m", "inner fixture")

    middle = tmp_path / "middle"
    middle.mkdir()
    git(middle, "init", "-b", "main")
    configure_repo(middle)
    git(
        middle,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        str(inner),
        "deps/inner",
    )
    git(middle, "commit", "-am", "middle fixture")

    top = tmp_path / "top"
    top.mkdir()
    git(top, "init", "-b", "main")
    configure_repo(top)
    git(
        top,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        str(middle),
        "vendor/middle",
    )
    git(
        top,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "update",
        "--init",
        "--recursive",
    )

    fw = tmp_path / "forgewright"
    home = tmp_path / "home"
    bootstrap = fw / "scripts" / "bootstrap" / SETUP_CLI.name
    canonical = fw / "scripts" / "mcp" / MCP_SETUP.name
    seeder = fw / "scripts" / "lite" / "ensure-project-policy.sh"
    bootstrap.parent.mkdir(parents=True)
    canonical.parent.mkdir(parents=True)
    seeder.parent.mkdir(parents=True)
    home.mkdir()
    shutil.copy2(SETUP_CLI, bootstrap)
    (fw / "AGENTS.md").write_text("# Fixture\n", encoding="utf-8")
    seeder.write_text(
        "#!/usr/bin/env bash\n"
        'mkdir -p "$2/.forgewright"\n'
        "printf 'safe: true\\n' > \"$2/.forgewright/execution-policy.yaml\"\n"
        'printf \'%s\\n\' "$2" > "$HOME/seed-root"\n'
        "printf 'created:%s\\n' \"$2/.forgewright/execution-policy.yaml\"\n",
        encoding="utf-8",
    )
    canonical.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        'printf \'%s\\n\' "$(pwd -P)" > "$HOME/mcp-root"\n'
        "mkdir -p .antigravity\n"
        "printf '{}\\n' > .antigravity/mcp-manifest.json\n",
        encoding="utf-8",
    )
    for script in (bootstrap, canonical, seeder):
        script.chmod(0o755)

    nested = top / "vendor" / "middle" / "deps" / "inner"
    result = run("bash", str(bootstrap), cwd=nested, env={"HOME": str(home)})

    assert result.returncode == 0, result.stderr
    assert (home / "seed-root").read_text(encoding="utf-8").strip() == str(
        top.resolve()
    )
    assert (home / "mcp-root").read_text(encoding="utf-8").strip() == str(top.resolve())
    assert (top / ".forgewright" / "execution-policy.yaml").is_file()
    assert not (nested / ".forgewright" / "execution-policy.yaml").exists()


def test_mcp_setup_resolves_topmost_nested_submodule_superproject(
    tmp_path: Path,
) -> None:
    inner = tmp_path / "inner"
    inner.mkdir()
    git(inner, "init", "-b", "main")
    configure_repo(inner)
    (inner / "README.md").write_text("inner\n", encoding="utf-8")
    git(inner, "add", ".")
    git(inner, "commit", "-m", "inner fixture")

    middle = tmp_path / "middle"
    middle.mkdir()
    git(middle, "init", "-b", "main")
    configure_repo(middle)
    git(
        middle,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        str(inner),
        "deps/inner",
    )
    git(middle, "commit", "-am", "middle fixture")

    top = tmp_path / "top"
    top.mkdir()
    git(top, "init", "-b", "main")
    configure_repo(top)
    git(
        top,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        str(middle),
        "vendor/middle",
    )
    git(
        top,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "update",
        "--init",
        "--recursive",
    )

    nested = top / "vendor" / "middle" / "deps" / "inner"
    home = tmp_path / "home"
    home.mkdir()
    result = run(
        "bash",
        str(MCP_SETUP),
        "--diagnose",
        cwd=nested,
        env={"HOME": str(home)},
    )

    assert result.returncode == 0, result.stderr
    assert f"PROJECT: {top.resolve()}" in result.stdout
    assert f"PROJECT: {middle.resolve()}" not in result.stdout


def test_seeded_parent_policy_allows_safe_antigravity_tool(tmp_path: Path) -> None:
    source = tmp_path / "source"
    parent = tmp_path / "parent"
    (source / ".forgewright").mkdir(parents=True)
    parent.mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)
    seeded = run("bash", str(SEEDER), str(source), str(parent), cwd=parent)
    assert seeded.returncode == 0, seeded.stderr

    payload = json.dumps(
        {
            "workspacePaths": [str(parent)],
            "cwd": str(parent),
            "toolCall": {"name": "list_dir", "args": {"path": str(parent)}},
        }
    )
    gate = run("bash", str(GATE), cwd=parent, stdin=payload)
    assert gate.returncode == 0, gate.stderr
    assert json.loads(gate.stdout)["decision"] == "allow"


def test_hook_doctor_repairs_policy_into_superproject(tmp_path: Path) -> None:
    remote = tmp_path / "forgewright.git"
    git(tmp_path, "init", "--bare", str(remote))

    seed = tmp_path / "seed"
    seed.mkdir()
    git(seed, "init", "-b", "main")
    configure_repo(seed)
    (seed / ".forgewright").mkdir()
    shutil.copy2(POLICY, seed / ".forgewright" / POLICY.name)
    (seed / "scripts" / "hooks").mkdir(parents=True)
    (seed / "scripts" / "lite").mkdir(parents=True)
    shutil.copy2(DOCTOR, seed / "scripts" / "hooks" / DOCTOR.name)
    shutil.copy2(SEEDER, seed / "scripts" / "lite" / SEEDER.name)
    for name in ("forgewright-memory-hook.sh", "memory-session.sh"):
        stub = seed / "scripts" / "hooks" / name
        stub.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
        stub.chmod(0o755)
    git(seed, "add", ".")
    git(seed, "commit", "-m", "fixture")
    git(seed, "remote", "add", "origin", str(remote))
    git(seed, "push", "-u", "origin", "main")

    parent = tmp_path / "parent"
    parent.mkdir()
    git(parent, "init", "-b", "main")
    configure_repo(parent)
    git(
        parent,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        str(remote),
        "vendor/fw",
    )
    git(parent, "commit", "-am", "add submodule")

    home = tmp_path / "home"
    home.mkdir()
    doctor = parent / "vendor" / "fw" / "scripts" / "hooks" / DOCTOR.name
    result = run(
        "bash",
        str(doctor),
        "--quick",
        "--fix",
        cwd=parent,
        env={"HOME": str(home)},
    )

    parent_policy = parent / ".forgewright" / POLICY.name
    assert parent_policy.read_text(encoding="utf-8") == POLICY.read_text(
        encoding="utf-8"
    )
    assert "Fixed: Seeded execution policy into parent workspace" in result.stdout

    parent_policy.write_text("customized: true\n", encoding="utf-8")
    preserved = run(
        "bash",
        str(doctor),
        "--quick",
        "--fix",
        cwd=parent,
        env={"HOME": str(home)},
    )
    assert parent_policy.read_text(encoding="utf-8") == "customized: true\n"
    assert "Parent workspace execution policy exists" in preserved.stdout

    parent_policy.unlink()
    (parent / "vendor" / "fw" / ".forgewright" / POLICY.name).unlink()
    failed = run(
        "bash",
        str(doctor),
        "--quick",
        "--fix",
        cwd=parent,
        env={"HOME": str(home)},
    )
    assert failed.returncode != 0
    assert "Could not seed execution policy into parent workspace" in failed.stdout
