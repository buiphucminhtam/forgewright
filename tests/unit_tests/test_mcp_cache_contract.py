"""Execute current MCP cache TypeScript in one native Node process, no browser."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def test_native_mcp_cache_contract():
    result = subprocess.run(
        ["node", "--test", "mcp/src/middleware/byte-cache.contract.mjs"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=40,
    )
    print(result.stdout)
    assert result.returncode == 0, result.stdout + result.stderr
