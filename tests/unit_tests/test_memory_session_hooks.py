"""Exercise installed memory hooks with isolated user state and hostile names."""

import json
import os
import shlex
import signal
import shutil
import subprocess
import time
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
        ["bash", script.as_posix(), command],
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
    assert not (
        memory_hook[1] / ".forgewright/subagent-context/CONVERSATION_SUMMARY.md"
    ).exists()


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


def slow_json_reader(memory_hook):
    """Widen the real read/modify/write window without changing the hook."""
    script, project, env, state = memory_hook
    shim = project / "bin/python3"
    shim.parent.mkdir()
    python = shlex.quote(Path(shutil.which("python3")).as_posix())
    shim.write_text(
        "#!/usr/bin/env bash\n"
        'if [[ "$1" == "-c" ]]; then\n'
        '  code="$2"; shift 2\n'
        f"  exec {python} -c 'import json,time; original=json.load; "
        "json.load=lambda *a,**k: (lambda d: (time.sleep(0.25),d)[1])(original(*a,**k)); "
        'exec(__import__("sys").argv.pop(1))' + "'" + ' "$code" "$@"\n'
        "fi\n"
        f'exec {python} "$@"\n'
    )
    shim.chmod(0o755)
    env["PATH"] = str(shim.parent) + os.pathsep + env["PATH"]


@pytest.mark.parametrize("command", ["tick", "checkpoint"])
def test_concurrent_commands_preserve_every_update(memory_hook, command):
    assert invoke(memory_hook, "start").returncode == 0
    script, project, env, state = memory_hook
    env["MEMORY_CHECKPOINT_INTERVAL"] = "100"
    before = json.loads(state.read_text())
    slow_json_reader(memory_hook)
    children = [
        subprocess.Popen(
            ["bash", script.as_posix(), command],
            cwd=project,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for _ in range(4)
    ]
    try:
        for child in children:
            _, stderr = child.communicate(timeout=20)
            assert child.returncode == 0, stderr
    finally:
        for child in children:
            if child.poll() is None:
                child.kill()
                child.wait()
    saved = json.loads(state.read_text())
    assert saved["session_id"] == before["session_id"]
    assert saved["message_count"] == (4 if command == "tick" else 0)
    assert len(saved["checkpoints"]) == (4 if command == "checkpoint" else 0)


def test_checkpoint_replaces_complete_private_state_atomically(memory_hook):
    assert invoke(memory_hook, "start").returncode == 0
    state = memory_hook[3]
    state.chmod(0o600)
    before = state.stat()
    with state.open("rb") as old_snapshot:
        result = invoke(memory_hook, "checkpoint")
        assert result.returncode == 0, result.stderr
        previous = json.load(old_snapshot)
    assert previous["checkpoints"] == []
    assert len(json.loads(state.read_text())["checkpoints"]) == 1
    assert state.stat().st_ino != before.st_ino
    assert state.stat().st_mode & 0o777 == 0o600


def test_first_state_is_private(memory_hook):
    assert invoke(memory_hook, "tick").returncode == 0
    assert memory_hook[3].stat().st_mode & 0o777 == 0o600


def test_sourced_command_runs_and_returns_to_caller(memory_hook):
    script, project, env, state = memory_hook
    result = subprocess.run(
        [
            "bash",
            "-c",
            'source "$1" tick; printf "CALLER_CONTINUES\\n"',
            "caller",
            script.as_posix(),
        ],
        cwd=project,
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    assert "CALLER_CONTINUES" in result.stdout
    assert state.exists()
    assert json.loads(state.read_text())["message_count"] == 1


def test_failed_publish_preserves_state_and_removes_temporary(memory_hook):
    assert invoke(memory_hook, "start").returncode == 0
    _, project, env, state = memory_hook
    original = state.read_bytes()
    shim = project / "bin/python3"
    shim.parent.mkdir()
    python = shlex.quote(Path(shutil.which("python3")).as_posix())
    shim.write_text(
        "#!/usr/bin/env bash\n"
        'if [[ "$1" == "-c" ]]; then\n'
        '  code="$2"; shift 2\n'
        f"  exec {python} -c 'import os,sys; "
        'os.replace=lambda *a: (_ for _ in ()).throw(OSError("publish failed")); '
        "exec(sys.argv.pop(1))" + "'" + ' "$code" "$@"\n'
        "fi\n"
        f'exec {python} "$@"\n'
    )
    shim.chmod(0o755)
    env["PATH"] = str(shim.parent) + os.pathsep + env["PATH"]
    result = invoke(memory_hook, "tick")
    assert result.returncode != 0
    assert state.read_bytes() == original
    assert not list(state.parent.glob(".current-session-*"))
    # A failed writer must not leave a lock that prevents the next command.
    env["PATH"] = env["PATH"].split(os.pathsep, 1)[1]
    assert invoke(memory_hook, "tick").returncode == 0
    assert json.loads(state.read_text())["message_count"] == 1


def test_busy_writer_fails_within_hook_deadline_then_recovers(memory_hook):
    assert invoke(memory_hook, "start").returncode == 0
    state = memory_hook[3]
    original = state.read_bytes()
    with state.with_suffix(".lock").open("a+b") as lock:
        if os.name == "nt":
            import msvcrt

            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        started = time.monotonic()
        result = invoke(memory_hook, "tick")
        elapsed = time.monotonic() - started
        assert result.returncode != 0
        assert "writer is busy" in result.stderr
        assert 4.5 <= elapsed < 9
        assert state.read_bytes() == original
    assert invoke(memory_hook, "tick").returncode == 0
    assert json.loads(state.read_text())["message_count"] == 1


def test_concurrent_interval_ticks_preserve_checkpoint_accounting(memory_hook):
    assert invoke(memory_hook, "start").returncode == 0
    script, project, env, state = memory_hook
    env["MEMORY_CHECKPOINT_INTERVAL"] = "2"
    slow_json_reader(memory_hook)
    children = [
        subprocess.Popen(
            ["bash", script.as_posix(), "tick"],
            cwd=project,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for _ in range(4)
    ]
    try:
        for child in children:
            _, stderr = child.communicate(timeout=20)
            assert child.returncode == 0, stderr
    finally:
        for child in children:
            if child.poll() is None:
                child.kill()
                child.wait()
    data = json.loads(state.read_text())
    assert data["message_count"] == 0
    assert len(data["checkpoints"]) == 2
    assert all(cp["reason"] == "interval:2" for cp in data["checkpoints"])


def test_killed_state_writer_releases_lock_without_partial_publish(memory_hook):
    assert invoke(memory_hook, "start").returncode == 0
    script, project, env, state = memory_hook
    original = state.read_bytes()
    marker = project / "writer-ready"
    shim = project / "bin/python3"
    shim.parent.mkdir()
    python = shlex.quote(Path(shutil.which("python3")).as_posix())
    prelude = """import json,os,sys,time
from pathlib import Path
original_load=json.load
def paused_load(*args, **kwargs):
    data=original_load(*args, **kwargs)
    Path(os.environ['MEMORY_TEST_WRITER_READY']).write_text(str(os.getpid()))
    time.sleep(30)
    return data
if 'tick' in sys.argv:
    json.load=paused_load
exec(sys.argv.pop(1))
"""
    shim.write_text(
        "#!/usr/bin/env bash\n"
        'if [[ "$1" == "-c" ]]; then\n'
        '  code="$2"; shift 2\n'
        f'  exec {python} -c {shlex.quote(prelude)} "$code" "$@"\n'
        "fi\n"
        f'exec {python} "$@"\n'
    )
    shim.chmod(0o755)
    env["MEMORY_TEST_WRITER_READY"] = str(marker)
    env["PATH"] = str(shim.parent) + os.pathsep + env["PATH"]
    child = subprocess.Popen(
        ["bash", script.as_posix(), "tick"],
        cwd=project,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        deadline = time.monotonic() + 5
        while (
            not marker.exists() and child.poll() is None and time.monotonic() < deadline
        ):
            time.sleep(0.02)
        assert marker.exists(), "state writer did not reach its read boundary"
        os.kill(int(marker.read_text()), signal.SIGTERM)
        child.communicate(timeout=10)
        assert child.returncode != 0
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
    assert state.read_bytes() == original
    env["PATH"] = env["PATH"].split(os.pathsep, 1)[1]
    assert invoke(memory_hook, "tick").returncode == 0
    assert json.loads(state.read_text())["message_count"] == 1
