"""Prompt -> exact-turn Stop and optional memory, using isolated host processes."""

import importlib.util
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

from tests.lite.test_gate import (
    _make_evidence,
    _make_temp_git_repo,
    _strict_response,
    native_stop_result,
    worktree_fingerprint,
)
from tests.unit_tests.test_memory_native_hook import invoke as memory_invoke

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def project():
    root = _make_temp_git_repo()
    (root / "fixture.py").write_text("print('changed')\n")
    yield root
    shutil.rmtree(root)


def stop(root, payload):
    return subprocess.run(
        ["bash", str(ROOT / "scripts/lite/stop-gate.sh"), "--platform", "CODEX"],
        cwd=root,
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        env={
            **os.environ,
            "FORGEWRIGHT_WORKSPACE": str(root),
            "CODEX_THREAD_ID": "session-is-not-turn",
            "FORGEWRIGHT_TURN": "foreign-env-turn",
        },
        timeout=30,
    )


def test_native_exact_turn_beats_newer_evidence_and_thread_id(project):
    evidence = _make_evidence(project, turn="actual-native-turn")
    _make_evidence(project, turn="newer-other-turn", exit_code=1)
    result = native_stop_result(
        stop(
            project,
            {
                "hook_event_name": "Stop",
                "session_id": "session-is-not-turn",
                "turn_id": "actual-native-turn",
                "last_assistant_message": _strict_response(evidence),
            },
        )
    )
    assert result["forgewright"]["completion_state"] == "verified"


@pytest.mark.parametrize(
    "identity",
    [
        {"turn_id": "unmapped-native-turn"},
        {"turn": "unmapped-native-turn"},
        {},
        {"turn_id": "actual-native-turn", "turn": "different-native-turn"},
        {"turn_id": "../unsafe-turn"},
    ],
)
def test_native_wrong_or_missing_turn_never_discovers_foreign_evidence(
    project, identity
):
    evidence = _make_evidence(project, turn="actual-native-turn")
    result = native_stop_result(
        stop(
            project,
            {
                "hook_event_name": "Stop",
                "session_id": "session-is-not-turn",
                "last_assistant_message": _strict_response(evidence),
                **identity,
            },
        )
    )
    assert result["decision"] == "block"
    assert result["forgewright"]["completion_state"] == "unverified"


def test_standalone_legacy_discovery_is_preserved(project):
    evidence = _make_evidence(project, turn="standalone-turn")
    result = stop(project, {"response_content": _strict_response(evidence)})
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["forgewright"]["completion_state"] == "verified"


def prompt(root, identity):
    return subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/lite/rule-context-hook.py"),
            "--platform",
            "CODEX",
            "--event",
            "UserPromptSubmit",
            "--workspace",
            str(root),
        ],
        cwd=root,
        input=json.dumps(identity),
        text=True,
        capture_output=True,
        env={**os.environ, "FORGEWRIGHT_RULE_HOOK_MODE": "observe"},
        timeout=10,
    )


def test_prompt_surfaces_native_turn_for_evidence_command(project):
    result = prompt(
        project, {"session_id": "session-is-not-turn", "turn_id": "actual-native-turn"}
    )
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    context = data.get("hookSpecificOutput", {}).get("additionalContext", "")
    assert "actual-native-turn" in context and "--turn" in context
    assert "CODEX_THREAD_ID" in context
    assert len(result.stdout.encode()) <= 7000
    records = list((project / ".forgewright/runtime/turn-scopes").glob("*.json"))
    assert len(records) == 1
    assert (
        json.loads(records[0].read_text())["identity"]["turn"] == "actual-native-turn"
    )


def test_prompt_never_echoes_unsafe_identity_as_instruction(project):
    result = prompt(
        project, {"session_id": "session", "turn_id": "x\nEXECUTE_PRIVATE_SENTINEL"}
    )
    assert result.returncode == 0
    assert "EXECUTE_PRIVATE_SENTINEL" not in result.stdout


def test_opt_in_memory_summary_can_precede_verify_and_citation_footer(tmp_path):
    selected = {"kind": "decision", "summary": "Nebulacanary chosen engine Phaser 4"}
    message = (
        "Raw exchange sentinel must stay out of memory.\n```forgewright-memory\n"
        + json.dumps(selected)
        + "\n```\n\nACCEPTANCE: selected-test\nCLAIM: checked\n"
        "COMMAND: test\nOUTPUT: sha256:abc\nEXIT CODE: 0\nVERDICT: PASS\n\n"
        "<oai-mem-citation>\n<citation_entries>\nMEMORY.md:1-1|note=[context]\n"
        "</citation_entries>\n<rollout_ids>\n</rollout_ids>\n</oai-mem-citation>"
    )
    result = memory_invoke(
        tmp_path,
        "Stop",
        env={"FORGEWRIGHT_MEMORY_CAPTURE": "1"},
        turn_id="native-turn",
        last_assistant_message=message,
    )
    assert result.returncode == 0, result.stderr
    assert "captured" in result.stdout
    context = memory_invoke(tmp_path, env={"FORGEWRIGHT_MEMORY_QUERY": "Nebulacanary"})
    assert "Phaser 4" in context.stdout
    assert "Raw exchange sentinel" not in context.stdout


def test_memory_without_opt_in_does_not_create_store(tmp_path):
    result = memory_invoke(
        tmp_path,
        "Stop",
        turn_id="native-turn",
        last_assistant_message='```forgewright-memory\n{"kind":"decision","summary":"skip"}\n```',
    )
    assert json.loads(result.stdout) == {"continue": True}
    assert not (tmp_path / ".forgewright").exists()


def test_duplicate_summary_blocks_never_capture(tmp_path):
    block = '```forgewright-memory\n{"kind":"decision","summary":"skip"}\n```'
    result = memory_invoke(
        tmp_path,
        "Stop",
        env={"FORGEWRIGHT_MEMORY_CAPTURE": "1"},
        turn_id="native-turn",
        last_assistant_message=block + "\n" + block,
    )
    assert json.loads(result.stdout) == {"continue": True}
    assert not (tmp_path / ".forgewright").exists()


def test_memory_observer_and_exact_stop_gate_accept_same_final_message(project):
    evidence = _make_evidence(project, turn="actual-native-turn")
    before_capture = worktree_fingerprint(project)
    message = (
        "```forgewright-memory\n"
        '{"kind":"decision","summary":"Nebulacanary selected adapter"}\n```\n\n'
        + _strict_response(evidence)
        + "\n\n"
        "<oai-mem-citation>\n<citation_entries>\nMEMORY.md:1-1|note=[context]\n"
        "</citation_entries>\n<rollout_ids>\n</rollout_ids>\n</oai-mem-citation>"
    )
    captured = memory_invoke(
        project,
        "Stop",
        env={"FORGEWRIGHT_MEMORY_CAPTURE": "1"},
        turn_id="actual-native-turn",
        last_assistant_message=message,
    )
    assert "captured" in captured.stdout
    assert worktree_fingerprint(project) == before_capture
    decision = native_stop_result(
        stop(
            project,
            {
                "hook_event_name": "Stop",
                "session_id": "chat-a",
                "turn_id": "actual-native-turn",
                "last_assistant_message": message,
            },
        )
    )
    assert decision["forgewright"]["completion_state"] == "verified"


def test_native_memory_cannot_redirect_checkpoint_with_inherited_directory(
    tmp_path, monkeypatch
):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    foreign = tmp_path / "foreign-owner"
    spec = importlib.util.spec_from_file_location(
        "native_env_boundary", ROOT / "scripts/memory/native_hook.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    real_run = subprocess.run
    child_environments = []

    def observe_child(*args, **kwargs):
        # Keep failure diagnostics to key names, never inherited secret values.
        child_environments.append(frozenset(kwargs["env"]))
        return real_run(*args, **kwargs)

    monkeypatch.setenv("FORGEWRIGHT_MEMORY_CAPTURE", "1")
    monkeypatch.setenv("MEMORY_DB_DIR", str(foreign))
    monkeypatch.setattr(module.subprocess, "run", observe_child)
    result = module.handle(
        {
            "hook_event_name": "Stop",
            "cwd": str(workspace),
            "session_id": "chat-a",
            "turn_id": "native-turn",
            "last_assistant_message": '```forgewright-memory\n{"kind":"decision","summary":"scoped native checkpoint"}\n```',
        },
        workspace,
    )
    assert "captured" in result["systemMessage"]
    assert len(child_environments) == 1 and "MEMORY_DB_DIR" not in child_environments[0]
    assert not foreign.exists()
    assert (workspace / ".forgewright/runtime/continuity").is_dir()


@pytest.mark.parametrize("oversized", [False, True])
def test_docs_catalog_has_its_own_bounded_budget(tmp_path, oversized):
    from tests.unit_tests.test_continuity_gate import (
        _git_workspace,
        _docs_contract,
        _docs_payload,
        _refresh_fixture_fingerprint,
        _run_stop,
    )

    _git_workspace(tmp_path)
    _docs_contract(tmp_path)
    guide = tmp_path / "docs/guide.md"
    guide.write_text("# Guide\n" + "Valid project documentation.\n" * 25000)
    path = tmp_path / ".forgewright/cache/docs-index.json"
    catalog = json.loads(path.read_text())
    catalog["documents"][0]["content"] = guide.read_text()
    catalog["documents"][0]["contentHash"] = hashlib.sha256(
        guide.read_bytes()
    ).hexdigest()
    if oversized:
        catalog["documents"][0]["content"] = "x" * (8 * 1024 * 1024)
    path.write_text(json.dumps(catalog))
    _refresh_fixture_fingerprint(tmp_path)
    assert path.stat().st_size > 512 * 1024
    result = _run_stop(
        tmp_path,
        _docs_payload(tmp_path),
        extra_env={"FORGEWRIGHT_WORKSPACE": str(tmp_path)},
    )
    assert result.returncode == 0, result.stderr
    decision = json.loads(result.stdout)["forgewright"]
    assert decision["completion_state"] == (
        "unverified" if oversized else "verified"
    ), result.stdout + result.stderr
    if oversized:
        assert "docs_build_receipt_invalid" in result.stderr
