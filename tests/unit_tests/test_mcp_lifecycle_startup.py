"""Exercise the native MCP lifecycle implementation and its lock/signal guards."""

from pathlib import Path
import os
import subprocess

from tests.ci_tools import node_module_file

ROOT = Path(__file__).resolve().parents[2]


def test_native_mcp_startup_contention_and_ownership_contract():
    result = subprocess.run(
        [
            "node",
            node_module_file(ROOT, "mcp", "vitest/vitest.mjs"),
            "run",
            "src/runtime/lifecycle-lease.test.ts",
            "--reporter=basic",
        ],
        cwd=ROOT / "mcp",
        capture_output=True,
        text=True,
        timeout=40,
        env={**os.environ, "FORGEWRIGHT_TEST_WORKERS": "1"},
    )
    assert result.returncode == 0, result.stdout + result.stderr
