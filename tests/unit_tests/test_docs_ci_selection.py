"""Both aggregate gates must enforce the same selected documentation changeset."""

import os
from pathlib import Path
import re
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    "script", ["run-required-checks.sh", "verify-orchestration-efficiency.sh"]
)
@pytest.mark.parametrize(
    ("explicit", "remote", "ahead", "expected"),
    [
        ("reviewed-base", False, False, ["--base-ref", "reviewed-base"]),
        ("reviewed base", True, True, ["--base-ref", "reviewed base"]),
        ("", True, True, ["--base-ref", "origin/main"]),
        ("", True, False, ["--worktree"]),
        ("", False, False, ["--worktree"]),
    ],
)
@pytest.mark.parametrize("gate_exit", [0, 23])
def test_documentation_scope_and_failure_propagation(
    tmp_path, script, explicit, remote, ahead, expected, gate_exit
):
    source = (ROOT / "scripts/ci" / script).read_text()
    helper = ROOT / "scripts/ci/docs-continuity.sh"
    if 'source "$root/scripts/ci/docs-continuity.sh"' in source:
        selector = helper.read_text()
    else:
        selector = source
    function = re.search(r"^run_docs_continuity\(\) \{\n.*?^\}", selector, re.M | re.S)
    assert function, "Aggregate lacks the canonical documentation selector"
    invocation = re.search(
        r"^run_(?:required docs-continuity|check docs-gate) (run_docs_continuity[^\n]*)$",
        source.replace("\\\n", ""),
        re.M,
    )
    assert invocation, "Aggregate does not call its documentation selector"
    # Execute the actual selector. Only external Git observations and CLI are
    # substituted, so no build/test workload or repository mutation is required.
    shim = """
git() {
  case "$1" in
    rev-parse) return "$REMOTE_EXIT" ;;
    diff) return "$DIFF_EXIT" ;;
    *) return 99 ;;
  esac
}
capture() { printf '%s\\n' "$@" > "$CAPTURE"; return "$GATE_EXIT"; }
node() { capture "$@"; }
npm() { capture "$@"; }
"""
    capture = tmp_path / "argv"
    result = subprocess.run(
        [
            "bash",
            "-c",
            "set -euo pipefail\n" + shim + function[0] + "\n" + invocation[1],
        ],
        env={
            **os.environ,
            "FORGEWRIGHT_DOCS_BASE_REF": explicit,
            "REMOTE_EXIT": "0" if remote else "1",
            "DIFF_EXIT": "1" if ahead else "0",
            "GATE_EXIT": str(gate_exit),
            "CAPTURE": str(capture),
        },
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == gate_exit, result.stderr
    argv = capture.read_text().splitlines()
    start = argv.index("docs")
    assert argv[:start] == (
        ["src/cli/dist/index.js"]
        if script == "run-required-checks.sh"
        else ["--prefix", "src/cli", "exec", "--", "tsx", "src/cli/src/index.ts"]
    )
    assert argv[start:] == ["docs", "gate", ".", *expected, "--json"]
