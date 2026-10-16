"""Untrusted Git metadata and reasons are JSON data, never Python source."""

import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/runtime/checkpoint-extract.sh"


def test_large_change_list_produces_bounded_valid_checkpoint_json(tmp_path):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    folder = tmp_path / "scripts"
    folder.mkdir()
    for number in range(1000):
        (folder / (f"changed-{number:04d}-" + "long-name-" * 14 + ".py")).write_text(
            "pass\n"
        )
    result = subprocess.run(
        ["bash", str(SCRIPT), "--reason", "test"],
        cwd=tmp_path,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(tmp_path)},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert len(payload["files"]) <= 10
    assert payload["file_counts"]["scripts"] > 0


def test_reason_is_literal_and_cannot_execute_embedded_python(tmp_path):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    reason = "' + str(__import__('pathlib').Path('injected').write_text('bad')) + '"
    result = subprocess.run(
        ["bash", str(SCRIPT), "--reason", reason],
        cwd=tmp_path,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(tmp_path)},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    assert not (tmp_path / "injected").exists()
    assert json.loads(result.stdout)["reason"] == reason
