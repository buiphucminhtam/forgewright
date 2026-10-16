"""Native wire-format boundary, using real isolated memory processes."""

import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tomllib

import pytest

ROOT = Path(__file__).resolve().parents[2]
HOOK = ROOT / "scripts/memory/native_hook.py"


@pytest.fixture(autouse=True)
def isolated_adapter_configuration(monkeypatch):
    for key in ("FORGEWRIGHT_MEMORY_QUERY", "FORGEWRIGHT_MEMORY_CAPTURE"):
        monkeypatch.delenv(key, raising=False)


def invoke(workspace, event="SessionStart", session="chat-a", env=None, **fields):
    return subprocess.run(
        [sys.executable, str(HOOK), "--workspace", str(workspace)],
        input=json.dumps(
            {
                "hook_event_name": event,
                "session_id": session,
                "cwd": str(workspace),
                **fields,
            }
        ),
        env={**os.environ, **(env or {})},
        capture_output=True,
        text=True,
        timeout=8,
    )


def capture(workspace, summary="Nebulacanary chosen engine Phaser 4", **kwargs):
    payload = {"kind": "task-close", "summary": summary, **kwargs.pop("payload", {})}
    return invoke(
        workspace,
        "Stop",
        env={"FORGEWRIGHT_MEMORY_CAPTURE": "1"},
        turn_id=kwargs.pop("turn_id", "native-turn-1"),
        last_assistant_message="Public result.\n```forgewright-memory\n"
        + json.dumps(payload)
        + "\n```",
        **kwargs,
    )


def packet(result):
    assert result.returncode == 0, result.stderr
    value = json.loads(result.stdout)
    assert value.get("continue") is True
    assert len(result.stdout.encode()) <= 8192
    return value.get("hookSpecificOutput", {}).get("additionalContext", "")


def test_native_capture_replay_and_fresh_session_context(tmp_path):
    first = capture(tmp_path, payload={"scope": "project"})
    packet(first)
    assert "captured" in first.stdout
    duplicate = capture(tmp_path, payload={"scope": "project"})
    assert "duplicate" in duplicate.stdout
    result = invoke(
        tmp_path,
        session="fresh-native-chat",
        env={"FORGEWRIGHT_MEMORY_QUERY": "Nebulacanary"},
    )
    text = packet(result)
    assert "Phaser 4" in text and "mem0:1" in text and "Untrusted memory" in text
    assert len(text) <= 2000
    with sqlite3.connect(tmp_path / ".forgewright/memory.db") as connection:
        assert (
            connection.execute("select count(*) from capture_events").fetchone()[0] == 1
        )


def test_private_native_session_overrides_inherited_aliases(tmp_path):
    assert "captured" in capture(tmp_path).stdout
    overrides = {
        "FORGEWRIGHT_MEMORY_QUERY": "Nebulacanary",
        "FORGEWRIGHT_SESSION": "chat-a",
        "FORGEWRIGHT_SESSION_ID": "chat-a",
    }
    assert packet(invoke(tmp_path, session="foreign-chat", env=overrides)) == ""
    assert "Phaser 4" in packet(invoke(tmp_path, env=overrides))
    foreign_project = tmp_path / "another-project"
    foreign_project.mkdir()
    assert packet(invoke(foreign_project, env=overrides)) == ""


@pytest.mark.parametrize("flag", ["MEM0_DISABLED", "FORGEWRIGHT_SKIP_MEM0"])
def test_disabled_hook_does_not_initialize(tmp_path, monkeypatch, flag):
    monkeypatch.setenv(flag, "1")
    assert packet(capture(tmp_path)) == ""
    assert (
        packet(invoke(tmp_path, env={"FORGEWRIGHT_MEMORY_QUERY": "Nebulacanary"})) == ""
    )
    assert not (tmp_path / ".forgewright").exists()


@pytest.mark.parametrize(
    "fields",
    [
        {"session_id": ""},
        {"session_id": "../foreign"},
        {"cwd": "/"},
        {"turn_id": ""},
        {"stop_hook_active": True},
        {"last_assistant_message": "Raw conversation must never be stored"},
        {"last_assistant_message": "```forgewright-memory\nnot JSON\n```"},
    ],
)
def test_invalid_capture_never_creates_store(tmp_path, fields):
    native = {
        "session_id": "chat-a",
        "cwd": str(tmp_path),
        "turn_id": "turn-1",
        "last_assistant_message": '```forgewright-memory\n{"kind":"decision","summary":"fact"}\n```',
        **fields,
    }
    session = native.pop("session_id")
    assert (
        packet(
            invoke(
                tmp_path,
                "Stop",
                session,
                env={"FORGEWRIGHT_MEMORY_CAPTURE": "1"},
                **native,
            )
        )
        == ""
    )
    assert not (tmp_path / ".forgewright").exists()


def test_capture_opt_in_and_query_are_independent(tmp_path):
    result = invoke(
        tmp_path,
        "Stop",
        turn_id="turn-1",
        last_assistant_message='```forgewright-memory\n{"kind":"decision","summary":"fact"}\n```',
    )
    packet(result)
    assert not (tmp_path / ".forgewright").exists()
    assert "captured" in capture(tmp_path).stdout
    assert packet(invoke(tmp_path)) == ""


def test_secret_replay_conflict_and_stale_source(tmp_path):
    import hashlib

    source = tmp_path / "engine.txt"
    source.write_text("Phaser 4")
    secret = "sk-" + "X" * 24
    first = capture(
        tmp_path,
        "Nebulacanary " + secret,
        payload={
            "scope": "project",
            "source_refs": [
                {
                    "path": "engine.txt",
                    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                }
            ],
        },
    )
    assert "captured" in first.stdout and secret not in first.stdout
    assert "captured" not in capture(tmp_path, "changed summary").stdout
    text = packet(invoke(tmp_path, env={"FORGEWRIGHT_MEMORY_QUERY": "Nebulacanary"}))
    assert "Nebulacanary" in text and secret not in text
    source.write_text("Three.js")
    assert (
        packet(invoke(tmp_path, env={"FORGEWRIGHT_MEMORY_QUERY": "Nebulacanary"})) == ""
    )


def test_legacy_storage_is_not_migrated(tmp_path):
    database = tmp_path / ".forgewright/memory.db"
    database.parent.mkdir()
    with sqlite3.connect(database) as connection:
        connection.execute("create table old_data(id integer)")
    original = database.read_bytes()
    packet(capture(tmp_path))
    assert "captured" not in capture(tmp_path).stdout
    assert (
        packet(invoke(tmp_path, env={"FORGEWRIGHT_MEMORY_QUERY": "Nebulacanary"})) == ""
    )
    assert database.read_bytes() == original


def test_timeout_is_fail_open_without_raw_diagnostics(tmp_path, monkeypatch, capsys):
    spec = importlib.util.spec_from_file_location("native_hook_test", HOOK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def timeout(*args, **kwargs):
        assert kwargs["timeout"] <= 2
        raise subprocess.TimeoutExpired(
            args[0], kwargs["timeout"], stderr="private data"
        )

    monkeypatch.setattr(module.subprocess, "run", timeout)
    monkeypatch.setenv("FORGEWRIGHT_MEMORY_QUERY", "Nebulacanary")
    response = module.handle(
        {
            "hook_event_name": "SessionStart",
            "session_id": "chat-a",
            "cwd": str(tmp_path),
        },
        tmp_path,
    )
    assert response == {"continue": True}
    assert capsys.readouterr() == ("", "")


def test_shared_store_foreign_workspace_cannot_read_project_facts(tmp_path):
    import hashlib

    assert "captured" in capture(tmp_path, payload={"scope": "project"}).stdout
    foreign = tmp_path / "foreign"
    foreign.mkdir()
    overrides = {
        "FORGEWRIGHT_MEMORY_QUERY": "Nebulacanary",
        "MEM0_DB_PATH": str(tmp_path / ".forgewright/memory.db"),
        "MEM0_PROJECT_ID": "workspace:"
        + hashlib.sha256(str(tmp_path).encode()).hexdigest()[:24],
        "FORGEWRIGHT_WORKSPACE": str(tmp_path),
    }
    assert packet(invoke(foreign, env=overrides)) == ""


def test_missing_cwd_cannot_fall_back_to_process_directory(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("native_hook_missing_cwd", HOOK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FORGEWRIGHT_MEMORY_QUERY", "Nebulacanary")

    def unexpected(*args, **kwargs):
        pytest.fail("missing native cwd must not invoke storage")

    monkeypatch.setattr(module.subprocess, "run", unexpected)
    assert module.handle(
        {"hook_event_name": "SessionStart", "session_id": "chat-a"}, tmp_path
    ) == {"continue": True}


def test_oversized_native_input_is_rejected_before_capture(tmp_path):
    result = capture(tmp_path, "Nebulacanary " + "x" * (256 * 1024))
    assert packet(result) == ""
    assert not (tmp_path / ".forgewright").exists()


def test_native_config_preserves_policy_and_optional_memory_handlers():
    config = tomllib.loads((ROOT / ".codex/config.toml").read_text())
    for event in ("SessionStart", "Stop"):
        handlers = [h for group in config["hooks"][event] for h in group["hooks"]]
        memory = [h for h in handlers if "native_hook.py" in h["command"]]
        policy = [h for h in handlers if "native_hook.py" not in h["command"]]
        assert len(memory) == len(policy) == 1
        assert memory[0]["timeout"] == 3


def test_continuity_override_cannot_move_native_checkpoint(tmp_path, monkeypatch):
    foreign = tmp_path / "foreign-ledger"
    monkeypatch.setenv("FORGEWRIGHT_CONTINUITY_ROOT", str(foreign))
    assert "captured" in capture(tmp_path).stdout
    assert not foreign.exists()
    assert list((tmp_path / ".forgewright/runtime/continuity").rglob("*.json"))


def test_real_busy_checkpoint_writer_deadline_and_recovery(tmp_path):
    import time

    assert "captured" in capture(tmp_path).stdout
    lock_path = next(
        (tmp_path / ".forgewright/runtime/continuity").rglob(".writer.lock")
    )
    with lock_path.open("r+") as lock:
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        started = time.monotonic()
        timed_out = capture(tmp_path, "Blockedcanary", turn_id="native-turn-2")
        assert packet(timed_out) == "" and "captured" not in timed_out.stdout
        assert time.monotonic() - started < 4
    # The timed-out child must release SQLite's write transaction as well.
    recovered = capture(tmp_path, "Blockedcanary", turn_id="native-turn-2")
    assert "captured" in recovered.stdout


def test_expired_fact_is_not_injected_and_unicode_output_remains_bounded(tmp_path):
    assert "captured" in capture(tmp_path, "Nebulacanary " + "🌙" * 3000).stdout
    result = invoke(tmp_path, env={"FORGEWRIGHT_MEMORY_QUERY": "Nebulacanary"})
    text = packet(result)
    assert "Untrusted memory" in text and "mem0:1" in text
    with sqlite3.connect(tmp_path / ".forgewright/memory.db") as connection:
        connection.execute("update observations set expires_at_epoch=1")
    assert (
        packet(invoke(tmp_path, env={"FORGEWRIGHT_MEMORY_QUERY": "Nebulacanary"})) == ""
    )
