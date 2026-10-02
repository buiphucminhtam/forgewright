"""Native Codex wire output keeps Forgewright evidence off the host schema."""
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
HOST_KEYS = {"continue", "stopReason", "suppressOutput", "systemMessage", "decision", "reason"}


@pytest.mark.parametrize("response, action", [("No code changed.", "allow_stop"), ("CLAIM: incomplete", "request_retry")])
def test_native_stop_wire_preserves_decision_and_typed_evidence(tmp_path, response, action):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    payload = {"hook_event_name": "Stop", "session_id": "native-contract", "turn_id": "native-turn", "cwd": str(tmp_path), "last_assistant_message": response, "files": []}
    result = subprocess.run(
        ["bash", str(ROOT / "scripts/lite/stop-gate.sh"), "--platform", "CODEX"],
        cwd=tmp_path, input=json.dumps(payload), text=True, capture_output=True,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "FORGEWRIGHT_STOP_STATE_DIR": str(tmp_path / "stop-state")}, timeout=30,
    )
    assert result.returncode == 0, result.stderr
    wire = json.loads(result.stdout)
    assert not set(wire) - HOST_KEYS, wire
    records = [json.loads(line.removeprefix("[FORGEWRIGHT-STOP] ")) for line in result.stderr.splitlines() if line.startswith("[FORGEWRIGHT-STOP] ")]
    assert len(records) == 1
    assert records[0]["host_action"] == action
    if action == "request_retry":
        assert wire["decision"] == "block" and wire["reason"]
        assert records[0]["completion_state"] == "unverified"
    else:
        assert wire["continue"] is True


def test_oversized_native_stop_remains_a_host_parseable_block(tmp_path):
    result = subprocess.run(
        ["bash", str(ROOT / "scripts/lite/stop-gate.sh"), "--platform", "CODEX"],
        cwd=tmp_path, input=json.dumps({"hook_event_name": "Stop", "padding": "x" * (1024 * 1024)}),
        text=True, capture_output=True, timeout=30,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
    )
    assert result.returncode == 0
    wire = json.loads(result.stdout)
    assert not set(wire) - HOST_KEYS
    assert wire["decision"] == "block" and "exceeds" in wire["reason"]
    assert '[FORGEWRIGHT-STOP]' in result.stderr
