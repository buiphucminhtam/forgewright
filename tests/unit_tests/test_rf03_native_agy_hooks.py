"""RF03 tests for native Antigravity (AGY) hook execution, capability probing, and explicit route status."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _find_bash() -> str:
    if os.name == "nt":
        for base in filter(None, (os.environ.get("ProgramFiles"), os.environ.get("ProgramW6432"))):
            cand = Path(base) / "Git" / "bin" / "bash.exe"
            if cand.is_file():
                return str(cand)
    return shutil.which("bash") or "/bin/bash"


BASH = _find_bash()


def test_antigravity_pre_tool_and_stop_hooks_execute_from_agents_subdir():
    hooks_cfg = json.loads((ROOT / ".agents/hooks.json").read_text(encoding="utf-8"))["forgewright-policy"]
    pre_cmd = hooks_cfg["PreToolUse"][0]["hooks"][0]["command"]
    stop_cmd = hooks_cfg["Stop"][0]["command"]
    agents_dir = ROOT / ".agents"

    # 1. Safe read_file allowed when invoked from .agents/ (how agy.exe invokes hooks)
    allow_payload = {
        "conversationId": "rf03-test",
        "modelName": "gemini-4-argon-medium",
        "stepIdx": 1,
        "toolCall": {"name": "read_file", "args": {"Path": str(ROOT / "package.json")}},
        "workspacePaths": [str(ROOT)],
    }
    res_allow = subprocess.run(
        [BASH, "-c", pre_cmd],
        cwd=str(agents_dir),
        input=json.dumps(allow_payload),
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert res_allow.returncode == 0, res_allow.stderr
    assert json.loads(res_allow.stdout)["decision"] == "allow"

    # 2. Destructive command denied when invoked from .agents/
    deny_payload = {
        "conversationId": "rf03-test",
        "modelName": "gemini-4-argon-medium",
        "stepIdx": 2,
        "toolCall": {"name": "run_command", "args": {"command": "rm -rf /tmp/forbidden"}},
        "workspacePaths": [str(ROOT)],
    }
    res_deny = subprocess.run(
        [BASH, "-c", pre_cmd],
        cwd=str(agents_dir),
        input=json.dumps(deny_payload),
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert res_deny.returncode == 0, res_deny.stderr
    assert json.loads(res_deny.stdout)["decision"] == "deny"

    # 3. Stop hook runs from .agents/ and returns continue=true
    res_stop = subprocess.run(
        [BASH, "-c", stop_cmd],
        cwd=str(agents_dir),
        input=json.dumps({"terminationReason": "NO_TOOL_CALL", "fullyIdle": True}),
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert res_stop.returncode == 0, res_stop.stderr
    assert json.loads(res_stop.stdout) == {"continue": True}


def test_runtime_hooks_installer_probes_host_capabilities():
    res = subprocess.run(
        [BASH, str(ROOT / "scripts/runtime/runtime-hooks-install.sh"), "--probe-capabilities"],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert res.returncode == 0, res.stderr
    report = json.loads(res.stdout)
    assert report["schema"] == "forgewright-host-hook-capabilities/v1"
    agy = report["hosts"]["agy"]
    assert agy["model_loop_owner"] == "native-host"
    assert agy["observation_status"] == "version_detected_only"
    assert agy["observed_events"] == []
    assert agy["supported_events"] == []
    assert agy["hook_cwd_behavior"] == "unverified_without_canary"
    assert set(agy["documented_events"]) >= {
        "PreInvocation",
        "PreToolUse",
        "PostToolUse",
        "PostInvocation",
        "Stop",
    }


def test_runtime_hooks_installer_probe_records_observed_canary_capabilities(tmp_path: Path):
    canary_file = tmp_path / "agy-canary.json"
    canary_file.write_text(
        json.dumps(
            {
                "observed_events": ["PreToolUse", "Stop"],
                "observed_cwd_behavior": "hooks.json parent directory (.agents/)",
            }
        ),
        encoding="utf-8",
    )
    env = os.environ.copy()
    env["FORGEWRIGHT_AGY_CANARY_RECEIPT"] = str(canary_file)
    res = subprocess.run(
        [BASH, str(ROOT / "scripts/runtime/runtime-hooks-install.sh"), "--probe-capabilities"],
        cwd=str(ROOT),
        env=env,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert res.returncode == 0, res.stderr
    agy = json.loads(res.stdout)["hosts"]["agy"]
    assert agy["observation_status"] == "observed_from_canary"
    assert agy["observed_events"] == ["PreToolUse", "Stop"]
    assert agy["supported_events"] == ["PreToolUse", "Stop"]
    assert agy["hook_cwd_behavior"] == "hooks.json parent directory (.agents/)"


def test_clean_consumer_installer_and_doctor_distribute_and_wire_antigravity_stop_hook(tmp_path: Path):
    def _git_bash_path(p: Path) -> str:
        posix = p.resolve().as_posix()
        if os.name == "nt" and len(posix) >= 3 and posix[1:3] == ":/":
            return f"/{posix[0].lower()}{posix[2:]}"
        return posix

    home = tmp_path / "consumer-home"
    framework = home / ".forgewright"
    (home / ".gemini" / "config").mkdir(parents=True)
    user_hooks_file = home / ".gemini" / "config" / "hooks.json"
    user_hooks_file.write_text(
        json.dumps({"userCustomHook": {"Stop": [{"type": "command", "command": "echo keep-user"}]}}),
        encoding="utf-8",
    )
    env = os.environ.copy()
    env.update(
        {
            "HOME": _git_bash_path(home),
            "FORGEWRIGHT_DIR": _git_bash_path(framework),
            "FORGEWRIGHT_SOURCE_DIR": _git_bash_path(ROOT),
        }
    )
    inst = subprocess.run(
        [
            BASH,
            str(ROOT / "scripts/bootstrap/forgewright-install.sh"),
            "--profile",
            "minimal",
            "--yes",
            "--skip-mcp",
            "--skip-skills",
            "--skip-config",
        ],
        cwd=str(ROOT),
        env=env,
        text=True,
        capture_output=True,
        timeout=45,
        check=False,
    )
    assert inst.returncode == 0, (inst.stdout, inst.stderr)
    stop_script = framework / "scripts/lite/antigravity-stop-hook.sh"
    assert stop_script.is_file()
    hooks_data = json.loads(user_hooks_file.read_text(encoding="utf-8"))
    assert "userCustomHook" in hooks_data
    policy = hooks_data["forgewright-policy"]
    assert any("antigravity-stop-hook.sh" in h.get("command", "") for h in policy.get("Stop", []))

    # Remove Stop entry and verify hook doctor detects and repairs it in the consumer home
    policy["Stop"] = []
    user_hooks_file.write_text(json.dumps(hooks_data), encoding="utf-8")
    doc = subprocess.run(
        [BASH, str(ROOT / "scripts/hooks/forgewright-hook-doctor.sh"), "--quick", "--fix"],
        cwd=str(ROOT),
        env=env,
        text=True,
        capture_output=True,
        timeout=45,
        check=False,
    )
    assert doc.returncode in (0, 1), (doc.stdout, doc.stderr)
    repaired = json.loads(user_hooks_file.read_text(encoding="utf-8"))["forgewright-policy"]
    assert any("antigravity-stop-hook.sh" in h.get("command", "") for h in repaired.get("Stop", []))


def test_standalone_runtime_hooks_installer_manages_and_verifies_agy_stop_hook(tmp_path: Path):
    reg_file = tmp_path / "agy-hooks.json"
    reg_file.write_text(
        json.dumps({"customUserHook": {"Stop": [{"type": "command", "command": "echo keep"}]}}),
        encoding="utf-8",
    )
    gate_dummy = tmp_path / "runtime-pretool-gate.sh"
    stop_dummy = tmp_path / "antigravity-stop-hook.sh"
    gate_dummy.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    stop_dummy.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    env = os.environ.copy()
    env["FORGEWRIGHT_RLG_GATE"] = str(gate_dummy)
    env["FORGEWRIGHT_AGY_STOP"] = str(stop_dummy)
    script = str(ROOT / "scripts/runtime/runtime-hooks-install.sh")

    # 1. Install wires both PreToolUse and Stop under forgewright-runtime-guard while preserving customUserHook
    for _ in range(2):
        inst = subprocess.run(
            [BASH, script, "--install", "--platform", "agy", "--agy-hooks", str(reg_file)],
            cwd=str(ROOT),
            env=env,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )
        assert inst.returncode == 0, (inst.stdout, inst.stderr)
    data = json.loads(reg_file.read_text(encoding="utf-8"))
    assert "customUserHook" in data
    guard = data["forgewright-runtime-guard"]
    assert len(guard.get("PreToolUse", [])) == 1
    assert len(guard.get("Stop", [])) == 1
    assert "antigravity-stop-hook.sh" in guard["Stop"][0]["command"]

    # 2. Verify succeeds when both PreToolUse and Stop are present
    ver_ok = subprocess.run(
        [BASH, script, "--verify", "--platform", "agy", "--agy-hooks", str(reg_file)],
        cwd=str(ROOT),
        env=env,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert ver_ok.returncode == 0, (ver_ok.stdout, ver_ok.stderr)
    assert "n/a" not in ver_ok.stdout

    # 3. Deleting Stop causes --verify --platform agy to fail (exit != 0)
    del guard["Stop"]
    reg_file.write_text(json.dumps(data), encoding="utf-8")
    ver_fail = subprocess.run(
        [BASH, script, "--verify", "--platform", "agy", "--agy-hooks", str(reg_file)],
        cwd=str(ROOT),
        env=env,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert ver_fail.returncode != 0

    # 4. Uninstall removes only forgewright-runtime-guard and preserves customUserHook
    uninst = subprocess.run(
        [BASH, script, "--uninstall", "--platform", "agy", "--agy-hooks", str(reg_file)],
        cwd=str(ROOT),
        env=env,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert uninst.returncode == 0, (uninst.stdout, uninst.stderr)
    after_uninst = json.loads(reg_file.read_text(encoding="utf-8"))
    assert "forgewright-runtime-guard" not in after_uninst
    assert "customUserHook" in after_uninst
