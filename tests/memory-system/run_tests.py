#!/usr/bin/env python3
"""run_tests.py — Memory System test suite runner with aggregation."""

import subprocess
import re
import os
import shutil
import tempfile
from pathlib import Path

tests = [
    ("memory-retrieve", "bash", ["tests/memory-system/test-memory-retrieve.sh"]),
    ("checkpoint-extract", "bash", ["tests/memory-system/test-checkpoint-extract.sh"]),
    ("memory-suggest", "bash", ["tests/memory-system/test-memory-suggest.sh"]),
    ("convention-indexer", "bash", ["tests/memory-system/test-convention-indexer.sh"]),
    ("memory-hygiene", "bash", ["tests/memory-system/test-memory-hygiene.sh"]),
    ("memory-middleware", "bash", ["tests/memory-system/test-memory-middleware.sh"]),
    (
        "memory-diagnostic",
        "bash",
        ["tests/memory-system/test-export-memory-diagnostic.sh"],
    ),
    ("mem0-v2 (Python)", "python3", ["tests/memory-system/test_mem0_v2.py"]),
]


def main():
    root = Path(__file__).resolve().parents[2]
    with tempfile.TemporaryDirectory(prefix="memory-suite-") as directory:
        fixture = Path(directory)
        for name in ("scripts", "tests", "docs"):
            shutil.copytree(
                root / name,
                fixture / name,
                symlinks=True,
                ignore=shutil.ignore_patterns(
                    "node_modules", "__pycache__", ".pytest_cache", "dist"
                ),
            )
        for name in (
            "README.md",
            "AGENTS.md",
            "package.json",
            ".production-grade.yaml",
            ".memignore",
        ):
            if (root / name).is_file():
                shutil.copy2(root / name, fixture / name)
        (fixture / ".forgewright").mkdir(exist_ok=True)
        for name in ("skills-config.json",):
            if (root / ".forgewright" / name).is_file():
                shutil.copy2(
                    root / ".forgewright" / name, fixture / ".forgewright" / name
                )
        init = subprocess.run(
            ["git", "init", "-q", str(fixture)], capture_output=True, text=True
        )
        if init.returncode:
            return 1
        user = fixture / "isolated-user"
        user.mkdir()
        environment = {
            **{
                key: value
                for key, value in os.environ.items()
                if not key.startswith(("MEM0_", "MEMORY_", "FORGEWRIGHT_SESSION"))
                and key not in {"FORGEWRIGHT_SKIP_MEM0", "FORGEWRIGHT_CONTEXT_SKIP_DB"}
            },
            "HOME": str(user),
            "FORGEWRIGHT_WORKSPACE": str(fixture),
            "FORGEWRIGHT_DIR": str(fixture),
        }
        total = passed = failures = 0
        for name, cmd, args in tests:
            try:
                result = subprocess.run(
                    [cmd, *args],
                    cwd=fixture,
                    env=environment,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
            except (OSError, subprocess.TimeoutExpired):
                failures += 1
                print(f"FAIL {name}: unavailable/deadline")
                continue
            output = result.stdout + result.stderr
            if cmd == "python3":
                match = re.search(r"Ran (\d+) tests", output)
                count = int(match[1]) if match else 0
                skipped = re.search(r"skipped=(\d+)", output)
                count -= int(skipped[1]) if skipped else 0
                valid = bool(re.search(r"^OK(?:\s|$|\()", output, re.MULTILINE))
                valid = valid and not re.search(r"^FAILED", output, re.MULTILINE)
                successful = count if valid else 0
            else:
                match = re.search(r"Results: (\d+)/(\d+) passed", output)
                successful = int(match[1]) if match else 0
                count = int(match[2]) if match else 0
                valid = successful == count
            valid = (
                valid
                and result.returncode == 0
                and count > 0
                and 0 <= successful <= count
            )
            if not valid:
                failures += 1
                print("\n".join(output.splitlines()[-15:]))
            print(
                f"{'PASS' if valid else 'FAIL'} {name}: {successful}/{count}; exit={result.returncode}"
            )
            total += count
            passed += successful
        print(f"TOTAL: {passed}/{total}; failed lanes={failures}")
        return 0 if total and not failures and passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
