"""Exercise actual subprocess capture/restart/context, not mock memory calls."""

import json
import os
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "scripts/memory/mem0-v2.py"


def invoke(workspace, *args, payload=None, env=None):
    return subprocess.run(
        ["python3", str(CORE), *args],
        cwd=workspace,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(workspace), **(env or {})},
        input=json.dumps(payload) if payload is not None else None,
        capture_output=True,
        text=True,
        timeout=20,
    )


def capture(workspace, event="event-1", session="chat-a", **fields):
    return invoke(
        workspace,
        "capture",
        "--session",
        session,
        "--event",
        event,
        payload={
            "kind": "decision",
            "summary": "Use Phaser 4 for the Signal Garden 2D game",
            **fields,
        },
    )


def test_fresh_process_capture_retrieve_has_scoped_citation_and_no_duplicate(tmp_path):
    first = capture(tmp_path, scope="project")
    assert first.returncode == 0, first.stderr
    receipt = json.loads(first.stdout)
    assert receipt["status"] == "captured"
    assert receipt["authority"] == "context-only"
    assert (tmp_path / receipt["checkpoint_ref"]).is_file()
    duplicate = json.loads(capture(tmp_path, scope="project").stdout)
    assert duplicate["status"] == "duplicate"
    assert duplicate["observation_id"] == receipt["observation_id"]
    context = invoke(
        tmp_path, "context", "Phaser", "--session", "new-chat", "--char-cap", "500"
    )
    assert context.returncode == 0, context.stderr
    assert "Phaser 4" in context.stdout
    assert f"mem0:{receipt['observation_id']}" in context.stdout
    assert "untrusted" in context.stdout.lower()
    assert len(context.stdout) <= 500


def test_private_conversation_is_not_visible_to_another_chat(tmp_path):
    result = capture(tmp_path)
    assert result.returncode == 0, result.stderr
    own = invoke(tmp_path, "context", "Phaser", "--session", "chat-a")
    other = invoke(tmp_path, "context", "Phaser", "--session", "chat-b")
    assert "Phaser 4" in own.stdout
    assert other.stdout == ""


def test_replayed_event_with_changed_payload_is_rejected(tmp_path):
    first = capture(tmp_path)
    assert first.returncode == 0
    changed = capture(tmp_path, summary="Overwrite earlier decision")
    assert changed.returncode != 0
    assert json.loads(changed.stdout)["status"] == "degraded"
    own = invoke(tmp_path, "context", "Phaser", "--session", "chat-a")
    assert "Phaser 4" in own.stdout


def test_trivial_and_disabled_events_do_not_initialize_memory(tmp_path):
    result = capture(tmp_path, kind="tick")
    assert result.returncode == 0
    assert json.loads(result.stdout)["status"] == "skipped"
    disabled = invoke(
        tmp_path,
        "capture",
        "--session",
        "chat-a",
        "--event",
        "event-1",
        payload={"kind": "decision", "summary": "ignored"},
        env={"MEM0_DISABLED": "true"},
    )
    assert disabled.returncode == 0
    assert not (tmp_path / ".forgewright").exists()


def test_budget_and_unrelated_legacy_context_cannot_flood_packet(tmp_path):
    bank = tmp_path / ".forgewright/memory-bank"
    (bank / "scenarios").mkdir(parents=True)
    (bank / "scenarios/unrelated.md").write_text("UNRELATED music " * 1000)
    (tmp_path / ".forgewright/session-log.json").write_text(
        json.dumps({"sessions": [{"status": "completed", "summary": "NOISE " * 10000}]})
    )
    result = capture(tmp_path)
    assert result.returncode == 0
    context = subprocess.run(
        ["bash", str(ROOT / "scripts/memory/memory-retrieve.sh"), "astronomynebulazx"],
        cwd=tmp_path,
        env={
            **os.environ,
            "FORGEWRIGHT_WORKSPACE": str(tmp_path),
            "MEM0_MAX_TOKENS": "30",
        },
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert context.returncode == 0
    assert len(context.stdout) <= 120
    assert "NOISE" not in context.stdout and "UNRELATED" not in context.stdout


def test_claimed_authorization_field_rejected_and_no_memory_created(tmp_path):
    result = capture(tmp_path, authorization="push main")
    assert result.returncode != 0
    assert json.loads(result.stdout)["status"] == "degraded"
    assert not (tmp_path / ".forgewright/memory.db").exists()


def test_stale_file_binding_is_not_injected(tmp_path):
    import hashlib

    source = tmp_path / "engine.txt"
    source.write_text("Phaser 4")
    result = capture(
        tmp_path,
        scope="project",
        source_refs=[
            {
                "path": "engine.txt",
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            }
        ],
    )
    assert result.returncode == 0
    source.write_text("Three.js")
    context = invoke(tmp_path, "context", "Phaser", "--session", "new-chat")
    assert context.returncode == 0
    assert context.stdout == ""


@pytest.mark.parametrize("flag", ["MEM0_DISABLED", "FORGEWRIGHT_SKIP_MEM0"])
def test_context_manager_respects_disable_including_legacy_files(tmp_path, flag):
    bank = tmp_path / ".forgewright/memory-bank"
    bank.mkdir(parents=True)
    (bank / "activeContext.md").write_text("MUST-NOT-INJECT")
    result = subprocess.run(
        ["python3", str(ROOT / "scripts/lite/context-manager.py"), "load"],
        cwd=tmp_path,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(tmp_path), flag: "1"},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0
    assert result.stdout == ""


def test_context_manager_consumes_actual_cli_memory(tmp_path):
    assert capture(tmp_path, scope="project").returncode == 0
    result = subprocess.run(
        [
            "python3",
            str(ROOT / "scripts/lite/context-manager.py"),
            "load",
            "--keywords",
            "Phaser",
        ],
        cwd=tmp_path,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(tmp_path)},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    assert "Phaser 4" in result.stdout
    assert "mem0:" in result.stdout
    assert "untrusted" in result.stdout.lower()


def test_superseded_and_expired_decisions_are_not_retrieved(tmp_path):
    import sqlite3

    first = json.loads(capture(tmp_path, scope="project").stdout)
    replacement = capture(
        tmp_path,
        event="replacement",
        scope="project",
        summary="Use Three.js for this revised 3D scene",
        supersedes_id=first["observation_id"],
    )
    assert replacement.returncode == 0, replacement.stdout
    assert invoke(tmp_path, "context", "Phaser", "--session", "new-chat").stdout == ""
    expiring = capture(
        tmp_path,
        event="temporary",
        scope="project",
        summary="Temporary GPU blocker",
        ttl_seconds=60,
    )
    assert expiring.returncode == 0, expiring.stdout
    temporary_id = json.loads(expiring.stdout)["observation_id"]
    with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
        conn.execute(
            "UPDATE observations SET expires_at_epoch=0 WHERE id=?", (temporary_id,)
        )
    assert invoke(tmp_path, "context", "GPU", "--session", "new-chat").stdout == ""


def test_foreign_chat_cannot_supersede_private_decision(tmp_path):
    first = json.loads(capture(tmp_path).stdout)
    foreign = capture(
        tmp_path,
        session="chat-b",
        event="foreign",
        supersedes_id=first["observation_id"],
    )
    assert foreign.returncode != 0
    assert (
        "Phaser" in invoke(tmp_path, "context", "Phaser", "--session", "chat-a").stdout
    )


def test_doctor_distinguishes_acknowledged_capture_from_native_injection(tmp_path):
    assert capture(tmp_path).returncode == 0
    doctor = invoke(tmp_path, "doctor", "--json")
    assert doctor.returncode == 0
    result = json.loads(doctor.stdout)
    assert result["capture"]["status"] == "acknowledged"
    assert result["capture"]["adapter"] == "explicit-cli"
    assert result["injection"]["status"] != "active"


def test_legacy_shell_checkpoint_emits_shared_capture_receipt(tmp_path):
    import sqlite3

    env = {
        **os.environ,
        "FORGEWRIGHT_WORKSPACE": str(tmp_path),
        "FORGEWRIGHT_SESSION": "shell-chat",
    }
    result = subprocess.run(
        ["bash", str(ROOT / "scripts/memory/memory-session.sh"), "checkpoint"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
        assert conn.execute("SELECT count(*) FROM capture_events").fetchone()[0] == 1


def test_context_manager_defaults_to_current_consumer_repo(tmp_path):
    (tmp_path / "src").mkdir()
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    assert capture(tmp_path, scope="project").returncode == 0
    env = {**os.environ}
    env.pop("FORGEWRIGHT_WORKSPACE", None)
    result = subprocess.run(
        [
            "python3",
            str(ROOT / "scripts/lite/context-manager.py"),
            "load",
            "--keywords",
            "Phaser",
        ],
        cwd=tmp_path / "src",
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0
    assert "Phaser 4" in result.stdout


def test_explicit_recapture_refreshes_stale_source_and_archived_note(tmp_path):
    import hashlib
    import sqlite3

    path = tmp_path / "engine.txt"
    path.write_text("Phaser 4")
    refs = [
        {"path": "engine.txt", "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    ]
    first = json.loads(capture(tmp_path, scope="project", source_refs=refs).stdout)
    path.write_text("Phaser 4 remains selected after review")
    refs[0]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    assert (
        capture(
            tmp_path, event="reviewed-again", scope="project", source_refs=refs
        ).returncode
        == 0
    )
    assert "Phaser" in invoke(tmp_path, "context", "Phaser").stdout
    with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
        conn.execute(
            "UPDATE observations SET archived=1 WHERE id=?", (first["observation_id"],)
        )
    assert (
        capture(
            tmp_path, event="remember-again", scope="project", source_refs=refs
        ).returncode
        == 0
    )
    assert "Phaser" in invoke(tmp_path, "context", "Phaser").stdout
