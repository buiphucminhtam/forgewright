"""Exercise the owner-enabled project hooks through their exact shell commands."""

import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import tomllib

import pytest


ROOT = Path(__file__).resolve().parents[2]


def run_hook(workspace, event, **environment):
    config = tomllib.loads((ROOT / ".codex/config.toml").read_text())
    handler = next(
        hook
        for group in config["hooks"][event]
        for hook in group["hooks"]
        if "native_hook.py" in hook["command"]
    )
    env = {
        key: value
        for key, value in os.environ.items()
        if key
        not in {
            "FORGEWRIGHT_MEMORY_QUERY",
            "FORGEWRIGHT_MEMORY_CAPTURE",
            "MEM0_DISABLED",
            "FORGEWRIGHT_SKIP_MEM0",
        }
    }
    payload = {
        "hook_event_name": event,
        "session_id": "opt-in-config-test",
        "turn_id": "selected-summary",
        "cwd": str(workspace),
        "last_assistant_message": "```forgewright-memory\n"
        '{"kind":"decision","scope":"project","summary":"Native memory lifecycle resource canary"}\n```',
    }
    result = subprocess.run(
        ["bash", "-c", handler["command"]],
        cwd=workspace,
        env={**env, **environment},
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=8,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.fixture
def workspace(tmp_path):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    (tmp_path / "scripts").symlink_to(ROOT / "scripts", target_is_directory=True)
    return tmp_path


def test_owner_enabled_config_captures_and_retrieves(workspace):
    assert "captured" in run_hook(workspace, "Stop").get("systemMessage", "")
    context = run_hook(workspace, "SessionStart")["hookSpecificOutput"][
        "additionalContext"
    ]
    assert "canary" in context and "mem0:" in context
    assert len(context) <= 2000


@pytest.mark.parametrize(
    "flag", ["MEM0_DISABLED", "FORGEWRIGHT_SKIP_MEM0", "FORGEWRIGHT_MEMORY_CAPTURE"]
)
def test_explicit_capture_disable_wins(workspace, flag):
    value = "0" if flag == "FORGEWRIGHT_MEMORY_CAPTURE" else "1"
    assert run_hook(workspace, "Stop", **{flag: value}) == {"continue": True}
    assert not (workspace / ".forgewright/memory.db").exists()


def test_explicit_empty_query_disables_config_default(workspace):
    run_hook(workspace, "Stop")
    assert run_hook(workspace, "SessionStart", FORGEWRIGHT_MEMORY_QUERY="") == {
        "continue": True
    }


@pytest.mark.parametrize("variant", ["opt-in", "legacy", "forced", "extra", "timeout"])
def test_memory_registration_accepts_only_reviewed_commands(tmp_path, variant):
    sys.path.insert(0, str(ROOT / "scripts/lite"))
    from pytest_receipts import (
        runtime_bundle_descriptor,
        verify_workspace_canonical_bundle,
    )

    lite = tmp_path / "scripts/lite"
    lite.mkdir(parents=True)
    for name in ["stop-gate.sh", *runtime_bundle_descriptor()["modules"]]:
        shutil.copyfile(ROOT / "scripts/lite" / name, lite / name)
    (tmp_path / ".codex").mkdir()
    config = (ROOT / ".codex/config.toml").read_text()
    prefix = 'FORGEWRIGHT_MEMORY_CAPTURE="${FORGEWRIGHT_MEMORY_CAPTURE-1}" '
    assert prefix in config
    if variant == "legacy":
        config = config.replace(prefix, "")
    elif variant == "forced":
        config = config.replace(prefix, "FORGEWRIGHT_MEMORY_CAPTURE=1 ")
    elif variant == "extra":
        config = config.replace(prefix, "UNREVIEWED_SETTING=1 " + prefix)
    elif variant == "timeout":
        config = config.replace("timeout = 3", "timeout = 300")
    (tmp_path / ".codex/config.toml").write_text(config)
    errors = verify_workspace_canonical_bundle(tmp_path)
    if variant in {"legacy", "opt-in"}:
        assert errors == []
    else:
        assert len(errors) == 1 and "Stop registration" in errors[0]
