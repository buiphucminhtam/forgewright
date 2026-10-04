"""Exercise installed memory hooks with isolated user state and hostile names."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def memory_hook(tmp_path):
    sandbox_home = tmp_path / "user"
    project = tmp_path / "project"
    script = tmp_path / "runtime/scripts/memory/memory-session.sh"
    sandbox_home.mkdir()
    project.mkdir()
    script.parent.mkdir(parents=True)
    shutil.copy2(ROOT / "scripts/memory/memory-session.sh", script)
    subprocess.run(["git", "init", "-q", str(project)], check=True)
    env = {**os.environ, "HOME": str(sandbox_home), "MEMORY_CHECKPOINT_INTERVAL": "3"}
    state = sandbox_home / ".forgewright/sessions/current-session.json"
    return script, project, env, state


def invoke(fixture, command):
    script, project, env, _ = fixture
    return subprocess.run(
        ["bash", str(script), command],
        cwd=project,
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
    )


def test_first_tick_initializes_clean_json(memory_hook):
    result = invoke(memory_hook, "tick")
    assert result.returncode == 0, result.stderr
    data = json.loads(memory_hook[3].read_text())
    assert data["message_count"] == 1
    assert data["checkpoints"] == []


def test_first_checkpoint_initializes_clean_json(memory_hook):
    result = invoke(memory_hook, "checkpoint")
    assert result.returncode == 0, result.stderr
    data = json.loads(memory_hook[3].read_text())
    assert data["message_count"] == 0
    assert len(data["checkpoints"]) == 1
    assert data["checkpoints"][0]["reason"] == "manual"


def test_checkpoint_preserves_quoted_summary_data(memory_hook):
    assert invoke(memory_hook, "start").returncode == 0
    (_, project, _, state) = memory_hook
    (project / "a'quoted\\filename\n.txt").write_text("user content")
    status = subprocess.check_output(
        ["git", "status", "--short"], cwd=project, text=True
    )
    expected_summary = "files_changed:" + status.replace("\n", " ")
    data = json.loads(state.read_text())
    data["message_count"] = 2
    state.write_text(json.dumps(data))
    result = invoke(memory_hook, "checkpoint")
    assert result.returncode == 0, result.stderr
    saved = json.loads(state.read_text())
    assert saved["message_count"] == 0
    assert len(saved["checkpoints"]) == 1
    assert saved["checkpoints"][0]["summary"] == expected_summary
    assert saved["session_id"] == data["session_id"]


def test_start_serializes_remote_project_name(memory_hook):
    (_, project, _, state) = memory_hook
    subprocess.run(
        ["git", "remote", "add", "origin", 'https://example.invalid/a"quoted.git'],
        cwd=project,
        check=True,
    )
    result = invoke(memory_hook, "start")
    assert result.returncode == 0, result.stderr
    assert json.loads(state.read_text())["project"] == 'a"quoted'


@pytest.mark.parametrize("command", ["tick", "checkpoint"])
@pytest.mark.parametrize(
    "bad_state", [b"\n", b'{"message_count":"invalid","checkpoints":[]}']
)
def test_invalid_state_fails_without_overwriting(memory_hook, command, bad_state):
    state = memory_hook[3]
    state.parent.mkdir(parents=True)
    state.write_bytes(bad_state)
    result = invoke(memory_hook, command)
    assert result.returncode != 0
    assert state.read_bytes() == bad_state


def test_interval_checkpoint_preserves_previous_entries(memory_hook):
    assert invoke(memory_hook, "start").returncode == 0
    first_checkpoint = None
    for index in range(6):
        result = invoke(memory_hook, "tick")
        assert result.returncode == 0, result.stderr
        if index == 2:
            first_checkpoint = json.loads(memory_hook[3].read_text())["checkpoints"][0]
    saved = json.loads(memory_hook[3].read_text())
    assert saved["message_count"] == 0
    assert len(saved["checkpoints"]) == 2
    assert saved["checkpoints"][0] == first_checkpoint
    assert all(row["reason"] == "interval:3" for row in saved["checkpoints"])


def test_tick_preserves_large_checkpoint_history_without_sigpipe(memory_hook):
    assert invoke(memory_hook, "start").returncode == 0
    state = memory_hook[3]
    data = json.loads(state.read_text())
    data["checkpoints"] = [{"id": "previous", "summary": "x" * 200_000}]
    state.write_text(json.dumps(data))
    result = invoke(memory_hook, "tick")
    assert result.returncode == 0, result.stderr
    saved = json.loads(state.read_text())
    assert saved["message_count"] == 1
    assert saved["checkpoints"] == data["checkpoints"]
