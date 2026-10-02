from __future__ import annotations

import json
import os
import stat
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
HOOK = ROOT / "hooks/auto-bootstrap.mjs"


def run_hook(tmp_path: Path, payload: dict, *, extra_env: dict[str, str] | None = None):
    env = {
        **os.environ,
        "FORGEWRIGHT_BOOTSTRAP_HOME": str(tmp_path / "bootstrap"),
        "HOME": str(tmp_path / "home"),
        **(extra_env or {}),
    }
    return subprocess.run(
        ["node", str(HOOK)],
        cwd=ROOT,
        env=env,
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )


def install_fake_launcher(tmp_path: Path, preflight_action: str) -> Path:
    launcher = tmp_path / "bootstrap/bin/forge"
    launcher.parent.mkdir(parents=True)
    launcher.write_text(
        "#!/bin/sh\n"
        'printf \'%s\\n\' "$*" >> "$FORGEWRIGHT_HOOK_CALL_LOG"\n'
        'case "$*" in\n'
        "  *'bootstrap preflight'*) "
        f'printf \'%s\\n\' \'{{"ok":true,"data":{{"action":"{preflight_action}"}}}}\' ;;\n'
        "  *'bootstrap ensure'*) "
        'printf \'%s\\n\' \'{"ok":true,"data":{"status":"ready"}}\' ;;\n'
        "  *) printf '%s\\n' '{\"ok\":false,\"data\":null}' ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR)
    return launcher


def test_hook_is_noop_without_global_launcher(tmp_path: Path):
    project = tmp_path / "project"
    project.mkdir()
    result = run_hook(tmp_path, {"cwd": str(project), "hook_event_name": "PreToolUse"})
    assert result.returncode == 0
    assert result.stdout == ""
    assert result.stderr == ""
    assert not (project / ".forgewright").exists()


@pytest.mark.skipif(os.name == "nt", reason="POSIX fake launcher fixture")
def test_hook_runs_preflight_then_auto_ensure_once_for_unmanaged_repo(tmp_path: Path):
    project = tmp_path / "project"
    project.mkdir()
    install_fake_launcher(tmp_path, "ensure")
    log = tmp_path / "calls.log"
    result = run_hook(
        tmp_path,
        {"cwd": str(project), "hook_event_name": "PreToolUse"},
        extra_env={"FORGEWRIGHT_HOOK_CALL_LOG": str(log)},
    )
    assert result.returncode == 0
    calls = log.read_text(encoding="utf-8").splitlines()
    assert len(calls) == 2
    assert "bootstrap preflight" in calls[0]
    assert "bootstrap ensure" in calls[1]
    assert "--auto" in calls[1]


@pytest.mark.skipif(os.name == "nt", reason="POSIX fake launcher fixture")
def test_hook_ready_repo_only_runs_cheap_preflight(tmp_path: Path):
    project = tmp_path / "project"
    project.mkdir()
    install_fake_launcher(tmp_path, "none")
    log = tmp_path / "calls.log"
    result = run_hook(
        tmp_path,
        {"cwd": str(project), "hook_event_name": "PreToolUse"},
        extra_env={"FORGEWRIGHT_HOOK_CALL_LOG": str(log)},
    )
    assert result.returncode == 0
    calls = log.read_text(encoding="utf-8").splitlines()
    assert len(calls) == 1
    assert "bootstrap preflight" in calls[0]


@pytest.mark.skipif(os.name == "nt", reason="POSIX fake launcher fixture")
def test_hook_env_disable_prevents_even_preflight(tmp_path: Path):
    project = tmp_path / "project"
    project.mkdir()
    install_fake_launcher(tmp_path, "ensure")
    log = tmp_path / "calls.log"
    result = run_hook(
        tmp_path,
        {"cwd": str(project), "hook_event_name": "PreToolUse"},
        extra_env={
            "FORGEWRIGHT_HOOK_CALL_LOG": str(log),
            "FORGEWRIGHT_AUTO_BOOTSTRAP_HOOK": "0",
        },
    )
    assert result.returncode == 0
    assert not log.exists()


def test_hook_input_is_bounded_and_invalid_json_is_noop(tmp_path: Path):
    launcher = install_fake_launcher(tmp_path, "ensure") if os.name != "nt" else None
    env = {
        **os.environ,
        "FORGEWRIGHT_BOOTSTRAP_HOME": str(tmp_path / "bootstrap"),
        "HOME": str(tmp_path / "home"),
    }
    if launcher is not None:
        env["FORGEWRIGHT_HOOK_CALL_LOG"] = str(tmp_path / "calls.log")
    result = subprocess.run(
        ["node", str(HOOK)],
        cwd=ROOT,
        env=env,
        input="{" + ("x" * (130 * 1024)),
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 0
    assert not (tmp_path / "calls.log").exists()


@pytest.mark.skipif(os.name == "nt", reason="POSIX fake launcher fixture")
def test_opt_in_diagnostic_identifies_failed_preflight_without_private_output(tmp_path):
    launcher = install_fake_launcher(tmp_path, "ensure")
    launcher.write_text("#!/bin/sh\nprintf 'PRIVATE_OUTPUT_SENTINEL'\nexit 7\n")
    result = run_hook(tmp_path, {"cwd": str(tmp_path), "private_input": "PRIVATE_INPUT_SENTINEL"}, extra_env={"FORGEWRIGHT_BOOTSTRAP_DIAGNOSTICS": "1"})
    assert result.returncode == 0
    wire = json.loads(result.stdout)
    assert set(wire) == {"systemMessage"}
    assert "launcher_nonzero" in wire["systemMessage"]
    assert "PRIVATE_" not in result.stdout
    assert str(tmp_path) not in result.stdout
    assert len(result.stdout) < 2048
    records = [json.loads(line) for line in result.stderr.splitlines()]
    assert records[0]["stage"] == "preflight"
    assert records[0]["reason_code"] == "launcher_nonzero"
    assert records[0]["exit_status"] == 7
    assert records[-1]["reason_code"] == "failed"
    assert "PRIVATE_" not in result.stderr
    assert str(tmp_path) not in result.stderr
    assert len(result.stderr) < 1024
