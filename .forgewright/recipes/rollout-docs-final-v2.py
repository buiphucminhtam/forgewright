"""Fixed Docs Hub checks; run only as an owned finite recipe."""

import hashlib
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
IMPLEMENTATION = Path(
    "/Users/buiphucminhtam/.codex/worktrees/host-resource-control/forgewright"
)
NODE = "/opt/homebrew/Cellar/node/26.7.0/bin/node"
CLI = IMPLEMENTATION / "src/cli/dist/index.js"
CLI_SHA256 = "fd72ffa7ca5b21aeb5c0b3f284de58a4eda79bdc3e1b9e2842455b0263511108"


def main():
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(IMPLEMENTATION / "scripts/runtime"))
    from project_recipe import require_managed

    require_managed(ROOT)
    if (
        CLI.is_symlink()
        or CLI.stat().st_size > 4 * 1024**2
        or hashlib.sha256(CLI.read_bytes()).hexdigest() != CLI_SHA256
    ):
        raise RuntimeError("reviewed CLI bundle changed")
    output = Path(os.environ["FORGEWRIGHT_OUTPUT_DIR"]) / "docs-hub"
    commands = [
        [
            NODE,
            str(CLI),
            "docs",
            "build",
            str(ROOT),
            "--strict",
            "--output",
            str(output),
            "--json",
        ],
        [NODE, str(CLI), "docs", "doctor", str(ROOT), "--strict", "--json"],
        [NODE, str(CLI), "docs", "gate", str(ROOT), "--worktree", "--json"],
    ]
    for command in commands:
        result = subprocess.run(command, cwd=ROOT, timeout=60, check=False)
        if result.returncode:
            return (
                result.returncode if result.returncode > 0 else 128 - result.returncode
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
