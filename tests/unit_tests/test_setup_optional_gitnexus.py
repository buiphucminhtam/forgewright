"""The ledger fixture supports the installer's optional GitNexus command."""

import os
from pathlib import Path
import re
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("available", [False, True], ids=["absent", "present"])
@pytest.mark.parametrize(
    "preload_installer", [False, True], ids=["fresh-shell", "after-round8"]
)
def test_ledger_fixture_resolves_optional_gitnexus_under_errexit(
    tmp_path, available, preload_installer
):
    suite = (ROOT / "tests/setup/test-forgewright-mcp-setup.sh").read_text()
    ledger = suite.split("test_ledger() {", 1)[1]
    assignments = re.findall(r"^\s*(gitnexus_path=.*)$", ledger, re.MULTILINE)
    assert len(assignments) == 1

    binary_directory = tmp_path / "bin"
    binary_directory.mkdir()
    executable = binary_directory / "gitnexus"
    if available:
        executable.write_text("#!/bin/sh\nexit 0\n")
        executable.chmod(0o755)
    home = tmp_path / "home"
    home.mkdir()
    preload = 'source "$1"\n' if preload_installer else ""
    script = (
        "set -e\n"
        + preload
        + 'PATH="$2"\nSCRIPT_DIR="$3"\n'
        + assignments[0]
        + '\nprintf "%s\\n" "$gitnexus_path"\n'
    )
    result = subprocess.run(
        [
            shutil.which("bash"),
            "-c",
            script,
            "optional-gitnexus-fixture",
            str(ROOT / "scripts/mcp/forgewright-mcp-setup.sh"),
            str(binary_directory),
            str(ROOT / "scripts/mcp"),
        ],
        cwd=ROOT,
        env={**os.environ, "HOME": str(home)},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.strip() == (str(executable) if available else "gitnexus")
