"""Opt-in native metadata exposes the existing decision without changing it."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
PREFIX = "[FORGEWRIGHT-STOP] "


@pytest.fixture
def gate():
    spec = importlib.util.spec_from_file_location(
        "native_diagnostic_gate", ROOT / "scripts/lite/stop_gate.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("mode", ["verified", "unverified", "suppressed", "blocked"])
def test_native_diagnostic_preserves_validation_retry_and_controls(
    gate, monkeypatch, capsys, tmp_path, mode
):
    payload = {
        "hook_event_name": "Stop",
        "last_assistant_message": "private response",
        "files": ["src/code.py"],
    }
    monkeypatch.setattr(
        sys, "argv", ["stop_gate.py", "--platform", "CODEX", "--typed-stop-decision"]
    )
    monkeypatch.setattr(
        gate, "_read_payload", lambda _path: (json.dumps(payload).encode(), False)
    )
    monkeypatch.setattr(gate, "_project_root", lambda: tmp_path)
    monkeypatch.setattr(gate, "_normalize_payload", lambda _root, value: value)
    monkeypatch.setattr(gate, "_files_to_check", lambda *_args: ["src/code.py"])
    monkeypatch.setattr(gate, "_identity", lambda *_args: ({}, "scope"))
    monkeypatch.setattr(gate, "_check_stubs", lambda _files: [])
    continuity = gate.ContinuityResult(
        "unverified" if mode == "unverified" else "off", "private continuity detail"
    )
    monkeypatch.setattr(gate, "check_continuity", lambda *_args, **_kwargs: continuity)
    calls = []

    def retry(_root, _scope, _key, *, record):
        calls.append(("retry", record))
        return (
            mode == "suppressed",
            "retry_budget_exhausted" if mode == "suppressed" else "validation_failed",
        )

    def validator(*_args):
        calls.append(("validate",))
        return mode != "blocked", "private validator output"

    monkeypatch.setattr(gate, "_retry_state", retry)
    monkeypatch.setattr(gate, "_validator_once", validator)
    observations = []
    for enabled in (False, True):
        monkeypatch.setenv("FORGEWRIGHT_STOP_DIAGNOSTICS", "1" if enabled else "0")
        calls.clear()
        code = gate.main()
        captured = capsys.readouterr()
        wire = json.loads(captured.out)
        decision = json.loads(
            next(
                line[len(PREFIX) :]
                for line in captured.err.splitlines()
                if line.startswith(PREFIX)
            )
        )
        if enabled:
            metadata = wire.pop("systemMessage")
            assert len(metadata.encode()) <= 1024
            assert json.loads(metadata) == decision
            assert set(json.loads(metadata)) == {
                "schema",
                "host_action",
                "completion_state",
                "retry_suppressed",
                "reason_code",
            }
            assert "private" not in metadata
        else:
            assert "systemMessage" not in wire
        observations.append((code, wire, decision, list(calls), captured.err))
    assert observations[0] == observations[1]
    assert observations[0][0] == 0
    assert observations[0][3] == (
        [("retry", False)]
        if mode == "suppressed"
        else [("retry", False), ("validate",)]
        + ([("retry", True)] if mode == "blocked" else [])
    )
    decision = observations[0][2]
    assert decision["host_action"] == (
        "request_retry" if mode == "blocked" else "allow_stop"
    )
    assert decision["completion_state"] == (
        "verified" if mode == "verified" else "unverified"
    )
    assert decision["retry_suppressed"] is (mode == "suppressed")


@pytest.mark.parametrize("flag", [None, "0", "true", "1 "])
def test_native_diagnostic_requires_exact_opt_in(gate, monkeypatch, capsys, flag):
    if flag is None:
        monkeypatch.delenv("FORGEWRIGHT_STOP_DIAGNOSTICS", raising=False)
    else:
        monkeypatch.setenv("FORGEWRIGHT_STOP_DIAGNOSTICS", flag)
    assert (
        gate._emit_allow(
            "CODEX", True, "verified", "validation_passed", False, native=True
        )
        == 0
    )
    assert json.loads(capsys.readouterr().out) == {"continue": True}


@pytest.mark.parametrize(
    "platform,typed,native",
    [("CODEX", True, False), ("CODEX", False, True), ("CLAUDE", True, True)],
)
def test_native_diagnostic_does_not_change_other_output_routes(
    gate, monkeypatch, capsys, platform, typed, native
):
    outputs = []
    for flag in ("0", "1"):
        monkeypatch.setenv("FORGEWRIGHT_STOP_DIAGNOSTICS", flag)
        code = gate._emit_allow(
            platform, typed, "verified", "validation_passed", False, native=native
        )
        output = capsys.readouterr()
        outputs.append((code, output.out, output.err))
    assert outputs[0] == outputs[1]


def test_native_diagnostic_bound_never_truncates_json(gate, monkeypatch, capsys):
    monkeypatch.setenv("FORGEWRIGHT_STOP_DIAGNOSTICS", "1")
    assert (
        gate._emit_allow("CODEX", True, "verified", "x" * 2000, False, native=True) == 0
    )
    wire = json.loads(capsys.readouterr().out)
    assert wire == {"continue": True}


@pytest.mark.parametrize("response", ["No code changed.", "CLAIM: incomplete"])
def test_real_native_hook_opt_in_matches_existing_typed_decision(tmp_path, response):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    payload = {
        "hook_event_name": "Stop",
        "session_id": "diagnostic-contract",
        "turn_id": "diagnostic-turn",
        "cwd": str(tmp_path),
        "last_assistant_message": response,
        "files": [],
    }
    result = subprocess.run(
        ["bash", str(ROOT / "scripts/lite/stop-gate.sh"), "--platform", "CODEX"],
        cwd=tmp_path,
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        timeout=30,
        env={
            **os.environ,
            "PYTHONDONTWRITEBYTECODE": "1",
            "FORGEWRIGHT_STOP_DIAGNOSTICS": "1",
            "FORGEWRIGHT_STOP_STATE_DIR": str(tmp_path / "stop-state"),
        },
    )
    assert result.returncode == 0, result.stderr
    wire = json.loads(result.stdout)
    decision = json.loads(
        next(
            line[len(PREFIX) :]
            for line in result.stderr.splitlines()
            if line.startswith(PREFIX)
        )
    )
    assert json.loads(wire.pop("systemMessage")) == decision
    assert wire == (
        {"continue": True}
        if decision["host_action"] == "allow_stop"
        else {"decision": "block", "reason": wire["reason"]}
    )
