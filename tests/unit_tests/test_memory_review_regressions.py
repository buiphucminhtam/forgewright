"""Concrete cross-scope, injection and derived-view failures found in review."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
MEMORY = ROOT / "scripts/memory"


@pytest.fixture(autouse=True)
def isolated_environment(tmp_path, monkeypatch):
    for key in tuple(os.environ):
        if key.startswith(("MEM0_", "MEMORY_", "FORGEWRIGHT_SESSION")):
            monkeypatch.delenv(key)
    monkeypatch.delenv("FORGEWRIGHT_SKIP_MEM0", raising=False)
    monkeypatch.setenv("FORGEWRIGHT_WORKSPACE", str(tmp_path))
    monkeypatch.chdir(tmp_path)


def command(path, *args, payload=None, **environment):
    return subprocess.run(
        ["bash" if path.suffix == ".sh" else sys.executable, str(path), *args],
        env={**os.environ, **environment},
        input=json.dumps(payload) if payload is not None else None,
        capture_output=True,
        text=True,
        timeout=20,
    )


@pytest.fixture
def middleware(tmp_path, monkeypatch):
    monkeypatch.setenv("MEM0_PROJECT_ID", "alpha")
    monkeypatch.setenv("FORGEWRIGHT_SESSION", "chat-a")
    spec = importlib.util.spec_from_file_location(
        "review_middleware", MEMORY / "memory-middleware.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.init_session()
    module.start_session(request="ALPHA-OWN")
    with module.json_transaction(module.SESSION_LOG, {"sessions": []}) as data:
        data["sessions"] += [
            {
                "project_id": "beta",
                "session_id": "chat-a",
                "status": "in_progress",
                "request": "FOREIGN-PROJECT",
                "tasks": {},
            },
            {
                "project_id": "alpha",
                "session_id": "chat-b",
                "status": "in_progress",
                "request": "FOREIGN-CHAT",
                "tasks": {},
            },
        ]
    return module


def test_update_keeps_foreign_project_with_same_session_id(middleware):
    middleware.update_session(current_phase="implementation")
    rows = json.loads(middleware.SESSION_LOG.read_text())["sessions"]
    assert any(
        row.get("project_id") == "beta" and row["session_id"] == "chat-a"
        for row in rows
    )


@pytest.mark.parametrize("view", ["resume", "list"])
def test_legacy_log_views_are_scoped(middleware, monkeypatch, capsys, view):
    capsys.readouterr()
    monkeypatch.setattr(sys, "argv", ["memory-middleware.py", "session-log", view])
    middleware._main_session_log()
    output = capsys.readouterr().out
    assert "FOREIGN-PROJECT" not in output and "FOREIGN-CHAT" not in output
    assert "chat-b" not in output
    assert output.count("chat-a") == 1


def test_active_context_uses_own_project_and_chat(middleware):
    middleware.update_active_context()
    text = middleware.ACTIVE_CONTEXT_FILE.read_text()
    assert "ALPHA-OWN" in text
    assert "FOREIGN" not in text


def test_unselected_chat_is_not_inferred_from_shared_log(middleware, monkeypatch):
    monkeypatch.delenv("FORGEWRIGHT_SESSION")
    middleware._active_session_id = None
    middleware.SESSION_FILE.unlink()
    assert middleware._scoped_sessions(middleware.ensure_session_log()) == []


@pytest.mark.parametrize("flag", ["FORGEWRIGHT_SESSION", "FORGEWRIGHT_SESSION_ID"])
def test_shell_state_and_resume_summary_are_private(tmp_path, flag):
    script = MEMORY / "memory-session.sh"
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    marker = tmp_path / "PRIVATECHATMARKER.txt"
    marker.write_text("synthetic private checkpoint")
    assert command(script, "checkpoint", **{flag: "chat-a"}).returncode == 0
    marker.unlink()
    result = command(script, "resume", **{flag: "chat-b"})
    assert result.returncode == 0, result.stderr
    assert "chat-a" not in result.stdout
    assert "PRIVATECHATMARKER" not in result.stdout
    base = tmp_path / ".forgewright/runtime/memory/sessions"
    assert (
        json.loads((base / "chat-a/current-session.json").read_text())["session_id"]
        == "chat-a"
    )
    assert (
        json.loads((base / "chat-b/current-session.json").read_text())["session_id"]
        == "chat-b"
    )


def test_shell_status_never_interprets_state_path_as_code(tmp_path):
    directory = (
        tmp_path / "x'+(__import__('pathlib').Path('sentinel').touch() or '')+'y"
    )
    script = MEMORY / "memory-session.sh"
    assert command(script, "start", MEMORY_DB_DIR=str(directory)).returncode == 0
    result = command(script, "status", MEMORY_DB_DIR=str(directory))
    assert not (tmp_path / "sentinel").exists()
    assert result.returncode == 0, result.stderr


def test_shell_state_summary_and_cli_output_redact_metadata(tmp_path):
    secret = "sk-" + "X" * 24
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    (tmp_path / (secret + ".txt")).write_text("synthetic")
    result = command(MEMORY / "memory-session.sh", "checkpoint")
    assert result.returncode == 0, result.stderr
    files = list((tmp_path / ".forgewright/runtime/memory").rglob("*.json")) + list(
        (tmp_path / ".forgewright").rglob("*.md")
    )
    assert files
    assert all(secret not in path.read_text() for path in files)
    result = command(
        MEMORY / "mem0-v2.py",
        "add",
        "safe text",
        "--category",
        secret,
        "--tags",
        secret,
    )
    assert result.returncode == 0
    assert secret not in result.stdout


def test_initial_python_summary_is_redacted(middleware):
    secret = "sk-" + "X" * 24
    middleware.append_to_summary("cp-safe", secret, secret)
    assert secret not in middleware.SUMMARY_FILE.read_text()


def test_consolidation_omits_expired_and_stale_source_records(tmp_path):
    source = tmp_path / "engine.txt"
    source.write_text("Phaser 4")
    core = MEMORY / "mem0-v2.py"
    for event, payload in (
        (
            "stale",
            {
                "kind": "decision",
                "scope": "project",
                "summary": "STALEMARKER Phaser",
                "source_refs": [
                    {
                        "path": "engine.txt",
                        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                    }
                ],
            },
        ),
        (
            "expiry",
            {
                "kind": "remember",
                "scope": "project",
                "summary": "EXPIREDMARKER",
                "ttl_seconds": 60,
            },
        ),
    ):
        result = command(
            core, "capture", "--session", "chat-a", "--event", event, payload=payload
        )
        assert result.returncode == 0, result.stdout
    source.write_text("Three.js")
    with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
        conn.execute(
            "UPDATE observations SET expires_at_epoch=0 WHERE content LIKE '%EXPIREDMARKER%'"
        )
    result = command(
        MEMORY / "memory-consolidate.py", "--workspace", str(tmp_path), "--json"
    )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    texts = Path(payload["persona"]).read_text() + "".join(
        Path(p).read_text() for p in payload["scenarios"]
    )
    assert "STALEMARKER" not in texts and "EXPIREDMARKER" not in texts
    assert payload["observations"] == 0


def test_malformed_source_ref_is_structured_failure_without_write(tmp_path):
    result = command(
        MEMORY / "mem0-v2.py",
        "capture",
        "--session",
        "chat-a",
        "--event",
        "bad-ref",
        payload={
            "kind": "decision",
            "summary": "safe",
            "source_refs": [{"path": None, "sha256": "0" * 64}],
        },
    )
    assert result.returncode != 0
    assert json.loads(result.stdout)["status"] == "degraded"
    assert "Traceback" not in result.stderr
    assert not (tmp_path / ".forgewright/memory.db").exists()


def test_retention_preview_matches_actual_gc_on_unchanged_state(tmp_path):
    core = MEMORY / "mem0-v2.py"
    for category, importance in (("decisions", "1"), ("ingested", "10")):
        result = command(
            core,
            "add",
            category + " distinct fact",
            "--category",
            category,
            "--importance",
            importance,
        )
        assert result.returncode == 0
    preview = command(core, "retention-preview", "--max-obs", "1")
    assert preview.returncode == 0, preview.stderr
    expected = json.loads(preview.stdout)["archive_candidate_ids"]
    result = command(core, "gc", "--max-obs", "1")
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
        actual = [
            row[0]
            for row in conn.execute(
                "SELECT id FROM observations WHERE archived=1 ORDER BY id"
            )
        ]
    assert expected == actual


def test_direct_pytest_memory_fixture_cannot_write_external_override(tmp_path):
    external = tmp_path / "external.db"
    seeded = command(
        MEMORY / "mem0-v2.py",
        "add",
        "external synthetic sentinel",
        MEM0_DB_PATH=str(external),
    )
    assert seeded.returncode == 0, seeded.stderr
    before = external.read_bytes()
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            str(ROOT / "tests/unit_tests/test_memory_flow.py")
            + "::test_fresh_process_capture_retrieve_has_scoped_citation_and_no_duplicate",
        ],
        cwd=ROOT,
        env={
            **os.environ,
            "MEM0_DB_PATH": str(external),
            "FORGEWRIGHT_SESSION_LOG": str(tmp_path / "external-log.json"),
        },
        capture_output=True,
        text=True,
        timeout=40,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert external.read_bytes() == before
    assert not (tmp_path / "external-log.json").exists()
