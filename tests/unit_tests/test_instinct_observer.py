"""Tests for E1: Instinct Observer, Project Isolation, and Observable Hooks."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OBSERVER_MJS = REPO_ROOT / ".forgewright" / "instincts" / "observer.mjs"
HOOK_SH = REPO_ROOT / "scripts" / "hooks" / "forgewright-instinct-hook.sh"


def run_node(code: str, env: dict[str, str] | None = None) -> str:
    run_env = os.environ.copy()
    if env:
        run_env.update(env)
    res = subprocess.run(
        ["node", "-e", code],
        cwd=REPO_ROOT,
        env=run_env,
        capture_output=True,
        text=True,
        check=True,
    )
    return res.stdout.strip()


def test_observer_executable_exists():
    assert OBSERVER_MJS.exists(), f"built observer.mjs must exist at {OBSERVER_MJS}"
    assert HOOK_SH.exists(), f"hook script must exist at {HOOK_SH}"


def test_project_id_basename_collision():
    code = """
    import { getProjectId } from './.forgewright/instincts/observer.mjs';
    const id1 = getProjectId('/tmp/path_alpha/my_project');
    const id2 = getProjectId('/tmp/path_beta/my_project');
    console.log(JSON.stringify({ id1, id2, different: id1 !== id2 }));
    """
    output = json.loads(run_node(code))
    assert output["different"] is True, f"Project IDs collided: {output}"
    assert "my_project" in output["id1"]
    assert "my_project" in output["id2"]
    assert output["id1"] != output["id2"]


def test_project_id_credential_sanitization(tmp_path: Path):
    git_dir = tmp_path / "repo_with_creds"
    git_dir.mkdir()
    subprocess.run(["git", "init"], cwd=git_dir, capture_output=True, check=True)
    subprocess.run(
        [
            "git",
            "remote",
            "add",
            "origin",
            "https://token_user:super_secret_token@github.com/myorg/myrepo.git",
        ],
        cwd=git_dir,
        capture_output=True,
        check=True,
    )
    code = f"""
    import {{ getProjectId }} from './.forgewright/instincts/observer.mjs';
    const id = getProjectId('{git_dir}');
    console.log(id);
    """
    project_id = run_node(code)
    assert "super_secret_token" not in project_id
    assert "token_user" not in project_id
    assert "myorg_myrepo" in project_id


def test_session_isolation_across_projects(tmp_path: Path):
    proj1 = tmp_path / "proj1"
    proj2 = tmp_path / "proj2"
    proj1.mkdir()
    proj2.mkdir()

    code = f"""
    import {{ getSessionState, observeToolCall, resetSessions }} from './.forgewright/instincts/observer.mjs';
    resetSessions();
    const s1 = getSessionState('shared-session', '{proj1}');
    s1.toolSequence.push('tool_in_proj1');
    const s2 = getSessionState('shared-session', '{proj2}');
    console.log(JSON.stringify({{ s1Seq: s1.toolSequence, s2Seq: s2.toolSequence }}));
    """
    output = json.loads(run_node(code))
    assert output["s1Seq"] == ["tool_in_proj1"]
    assert output["s2Seq"] == []


def test_failed_outcome_rejection(tmp_path: Path):
    code = f"""
    import {{ observeToolCall, getSessionState, getHookHealth, resetSessions, initObserver }} from './.forgewright/instincts/observer.mjs';
    resetSessions();
    initObserver({{ enabled: true }});
    const event = {{
        toolName: 'execute_sql',
        arguments: {{ query: 'SELECT 1' }},
        sessionId: 'session-fail',
        timestamp: new Date().toISOString(),
        success: false
    }};
    const res = await observeToolCall(event, '{tmp_path}');
    const session = getSessionState('session-fail', '{tmp_path}');
    const health = getHookHealth('{tmp_path}');
    console.log(JSON.stringify({{ res, seqLen: session.toolSequence.length, health }}));
    """
    output = json.loads(run_node(code))
    assert output["seqLen"] == 0, (
        "Failed tool call must NOT be added to session sequence"
    )
    assert output["res"]["pattern"] is None
    assert output["health"]["lastSkipReason"] == "failed_outcome"
    assert output["health"]["counters"]["skipped"] >= 1


def test_self_observation_rejection(tmp_path: Path):
    code = f"""
    import {{ observeToolCall, getHookHealth, resetSessions, initObserver }} from './.forgewright/instincts/observer.mjs';
    resetSessions();
    initObserver({{ enabled: true }});
    const event = {{
        toolName: 'observeToolCall',
        arguments: {{ internal: true }},
        sessionId: 'session-self',
        timestamp: new Date().toISOString(),
        success: true
    }};
    const res = await observeToolCall(event, '{tmp_path}');
    const health = getHookHealth('{tmp_path}');
    console.log(JSON.stringify({{ res, health }}));
    """
    output = json.loads(run_node(code))
    assert output["res"]["pattern"] is None
    assert output["health"]["lastSkipReason"] == "self_observation"


def test_malformed_event_rejection(tmp_path: Path):
    code = f"""
    import {{ observeToolCall, getHookHealth, resetSessions, initObserver }} from './.forgewright/instincts/observer.mjs';
    resetSessions();
    initObserver({{ enabled: true }});
    const event = {{
        toolName: '',
        arguments: {{}},
        sessionId: '',
        timestamp: new Date().toISOString(),
        success: true
    }};
    const res = await observeToolCall(event, '{tmp_path}');
    const health = getHookHealth('{tmp_path}');
    console.log(JSON.stringify({{ res, health }}));
    """
    output = json.loads(run_node(code))
    assert output["res"]["pattern"] is None
    assert output["health"]["lastSkipReason"] == "malformed_event"


def test_oversized_event_rejection(tmp_path: Path):
    code = f"""
    import {{ observeToolCall, getHookHealth, resetSessions, initObserver }} from './.forgewright/instincts/observer.mjs';
    resetSessions();
    initObserver({{ enabled: true }});
    const largePayload = 'a'.repeat(70000);
    const event = {{
        toolName: 'read_giant_file',
        arguments: {{ data: largePayload }},
        sessionId: 'session-oversized',
        timestamp: new Date().toISOString(),
        success: true
    }};
    const res = await observeToolCall(event, '{tmp_path}');
    const health = getHookHealth('{tmp_path}');
    console.log(JSON.stringify({{ res, health }}));
    """
    output = json.loads(run_node(code))
    assert output["res"]["pattern"] is None
    assert output["health"]["lastSkipReason"] == "oversized_event"


def test_context_cache_ttl_and_isolation(tmp_path: Path):
    p1 = tmp_path / "projA"
    p2 = tmp_path / "projB"
    p1.mkdir()
    p2.mkdir()
    (p1 / "package.json").write_text(json.dumps({"dependencies": {"react": "^18.0.0"}}))
    (p2 / "package.json").write_text(
        json.dumps({"dependencies": {"express": "^4.18.0"}})
    )

    code = f"""
    import {{ detectProjectContext }} from './.forgewright/instincts/observer.mjs';
    const c1 = detectProjectContext('{p1}');
    const c2 = detectProjectContext('{p2}');
    const c1_cached = detectProjectContext('{p1}');
    console.log(JSON.stringify({{ c1, c2, c1_cached }}));
    """
    output = json.loads(run_node(code))
    assert output["c1"]["framework"] == "react"
    assert output["c2"]["framework"] == "express"
    assert output["c1_cached"]["framework"] == "react"


def test_hook_script_end_to_end_smoke(tmp_path: Path):
    env = dict(
        os.environ,
        FORGEWRIGHT_WORKSPACE=str(tmp_path),
        FORGEWRIGHT_INSTINCTS_ENABLED="1",
    )
    res_status = subprocess.run(
        [str(HOOK_SH), "status"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    assert "Hook State:   unregistered" in res_status.stdout

    res_obs = subprocess.run(
        [str(HOOK_SH), "observe", "Read", '{"path": "README.md"}', "true"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    assert res_obs.returncode == 0

    res_health = subprocess.run(
        [str(HOOK_SH), "health"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    health = json.loads(res_health.stdout)
    assert health["state"] in {"registered", "running"}
    assert health["counters"]["observed"] >= 1
    assert health["counters"]["processed"] >= 1


def test_hook_default_off_no_write(tmp_path: Path):
    env = dict(os.environ, FORGEWRIGHT_WORKSPACE=str(tmp_path))
    env.pop("FORGEWRIGHT_INSTINCTS_ENABLED", None)
    res = subprocess.run(
        [str(HOOK_SH), "observe", "Read", '{"path": "README.md"}', "true"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    assert res.returncode == 0
    health_file = tmp_path / ".forgewright" / "instincts" / "health.json"
    assert not health_file.exists()


def test_hook_feature_flag_disabled(tmp_path: Path):
    env = dict(
        os.environ,
        FORGEWRIGHT_WORKSPACE=str(tmp_path),
        FORGEWRIGHT_INSTINCTS_ENABLED="0",
    )
    res = subprocess.run(
        [str(HOOK_SH), "observe", "Read", '{"path": "README.md"}', "true"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    assert res.returncode == 0
    health_file = tmp_path / ".forgewright" / "instincts" / "health.json"
    assert not health_file.exists()


def test_missing_executable_reports_unsupported(tmp_path: Path):
    env = dict(
        os.environ,
        FORGEWRIGHT_WORKSPACE=str(tmp_path),
        PATH="/usr/bin:/bin",
    )
    script = HOOK_SH.read_text().replace(
        'REPO_INSTINCTS_DIR="$(cd "${SCRIPT_DIR}/../../.forgewright/instincts" 2>/dev/null && pwd || echo "")"',
        'REPO_INSTINCTS_DIR="/nonexistent"',
    )
    fake_hook = tmp_path / "fake_hook.sh"
    fake_hook.write_text(script)
    fake_hook.chmod(0o755)

    res = subprocess.run(
        [str(fake_hook), "health"], env=env, capture_output=True, text=True, check=True
    )
    health = json.loads(res.stdout)
    assert health["state"] == "unsupported"
    assert health["lastSkipReason"] == "missing_executable"


def test_special_character_path(tmp_path: Path):
    special_dir = tmp_path / "special dir @ # $ [test]"
    special_dir.mkdir()
    code = f"""
    import {{ getProjectId, detectProjectContext }} from './.forgewright/instincts/observer.mjs';
    const id = getProjectId('{special_dir}');
    console.log(id);
    """
    project_id = run_node(code)
    assert len(project_id) > 0
    assert not any(c in project_id for c in [" ", "@", "#", "$", "[", "]"])


def test_unwritable_storage_handled_gracefully(tmp_path: Path):
    code = """
    import { observeToolCall, getHookHealth, resetSessions, initObserver } from './.forgewright/instincts/observer.mjs';
    resetSessions();
    initObserver({ enabled: true });
    const event = {
        toolName: 'read_file',
        arguments: { path: 'foo.ts' },
        sessionId: 'session-unwritable',
        timestamp: new Date().toISOString(),
        success: true
    };
    const res = await observeToolCall(event, '/proc/nonexistent/unwritable');
    const health = getHookHealth();
    console.log(JSON.stringify({ res, health }));
    """
    output = json.loads(run_node(code))
    assert output["res"]["pattern"] is None
