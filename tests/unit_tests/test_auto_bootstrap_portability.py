"""Execute the packaged hook command with actual host environment conventions."""

import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.skipif(os.name == "nt", reason="POSIX host command environment")
def test_packaged_hook_uses_claude_compatible_plugin_root(tmp_path):
    command = json.loads((ROOT / "hooks/hooks.json").read_text())["hooks"][
        "PreToolUse"
    ][0]["hooks"][0]["command"]
    env = {
        **os.environ,
        "CLAUDE_PLUGIN_ROOT": str(ROOT),
        "HOME": str(tmp_path),
        "FORGEWRIGHT_BOOTSTRAP_HOME": str(tmp_path / "bootstrap"),
    }
    env.pop("PLUGIN_ROOT", None)
    result = subprocess.run(
        ["sh", "-c", command],
        input=json.dumps({"cwd": str(tmp_path)}),
        text=True,
        capture_output=True,
        env=env,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout == ""
    assert not (tmp_path / ".forgewright").exists()
