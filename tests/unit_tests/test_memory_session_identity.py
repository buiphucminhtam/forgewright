"""Session state cannot silently replace other conversations or corrupt data."""

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def middleware(tmp_path, monkeypatch):
    monkeypatch.setenv("FORGEWRIGHT_WORKSPACE", str(tmp_path))
    monkeypatch.setenv("MEMORY_DB_DIR", str(tmp_path / "state"))
    spec = importlib.util.spec_from_file_location(
        "session_memory", ROOT / "scripts/memory/memory-middleware.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_two_immediate_sessions_have_distinct_ids_and_keep_both(middleware):
    first = middleware.start_session(request="first")
    second = middleware.start_session(request="second")
    middleware.update_session(summary="update second")
    entries = json.loads(middleware.SESSION_LOG.read_text())["sessions"]
    assert first["session_id"] != second["session_id"]
    assert len(entries) == 2


def test_native_session_selection_never_interrupts_other_chat(middleware, monkeypatch):
    monkeypatch.setenv("FORGEWRIGHT_SESSION", "chat-a")
    first = middleware.start_session(request="first")
    monkeypatch.setenv("FORGEWRIGHT_SESSION", "chat-b")
    middleware.start_session(request="second")
    monkeypatch.setenv("FORGEWRIGHT_SESSION", "chat-a")
    assert middleware.get_current_session()["session_id"] == first["session_id"]
    assert middleware.get_current_session()["request"] == "first"
    assert middleware.get_current_session()["status"] == "in_progress"


def test_corrupt_log_is_not_silently_reset(middleware):
    middleware.SESSION_LOG.parent.mkdir(parents=True)
    middleware.SESSION_LOG.write_text("{broken")
    with pytest.raises((ValueError, RuntimeError)):
        middleware.start_session(request="new")
    assert middleware.SESSION_LOG.read_text() == "{broken"


def test_session_metadata_redacts_secret_before_persistence(middleware):
    secret = "sk-" + "X" * 24
    middleware.start_session(request=secret)
    assert secret not in middleware.SESSION_LOG.read_text()


def test_legacy_checkpoint_uses_canonical_capture_receipt(middleware):
    import sqlite3

    middleware.init_session()
    assert middleware.do_checkpoint("manual")
    path = middleware.WORKSPACE_ROOT / ".forgewright/memory.db"
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM capture_events").fetchone()[0] == 1
    checkpoints = list(
        (middleware.WORKSPACE_ROOT / ".forgewright/runtime/continuity").rglob(
            "checkpoint-*.json"
        )
    )
    assert len(checkpoints) == 1


def test_disabled_legacy_checkpoint_has_no_state_side_effects(middleware, monkeypatch):
    monkeypatch.setenv("MEM0_DISABLED", "true")
    assert middleware.do_checkpoint("manual") is None
    assert not middleware.SESSION_FILE.exists()


@pytest.mark.parametrize("flag", ["FORGEWRIGHT_SESSION", "FORGEWRIGHT_SESSION_ID"])
def test_native_chat_state_files_are_distinct(tmp_path, monkeypatch, flag):
    monkeypatch.setenv("FORGEWRIGHT_WORKSPACE", str(tmp_path))
    paths = []
    for chat in ("native-a", "native-b"):
        monkeypatch.setenv(flag, chat)
        spec = importlib.util.spec_from_file_location(
            chat, ROOT / "scripts/memory/memory-middleware.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.init_session()
        paths.append(module.SESSION_FILE)
    assert paths[0] != paths[1]
    assert json.loads(paths[0].read_text())["session_id"] == "native-a"
