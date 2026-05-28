#!/usr/bin/env python3
"""run_tests.py — Memory System test suite runner with aggregation."""
import subprocess, re, os, sys
from pathlib import Path

tests = [
    ("memory-retrieve",      "bash", ["tests/memory-system/test-memory-retrieve.sh"]),
    ("checkpoint-extract",    "bash", ["tests/memory-system/test-checkpoint-extract.sh"]),
    ("memory-suggest",        "bash", ["tests/memory-system/test-memory-suggest.sh"]),
    ("convention-indexer",   "bash", ["tests/memory-system/test-convention-indexer.sh"]),
    ("memory-hygiene",       "bash", ["tests/memory-system/test-memory-hygiene.sh"]),
    ("memory-middleware",    "bash", ["tests/memory-system/test-memory-middleware.sh"]),
    ("mem0-v2 (Python)",     "python3", ["tests/memory-system/test_mem0_v2.py"]),
]

total = 0; passed = 0
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print("  Memory System Test Suite")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

for name, cmd, args in tests:
    r = subprocess.run([cmd] + args, capture_output=True, text=True,
                       cwd=Path(__file__).parent.parent.parent)
    out = r.stdout + r.stderr

    if cmd == "python3":
        m = re.search(r"Ran (\d+) tests", out)
        a = int(m.group(1)) if m else 0
        b = a
        ok = "OK" in out
    else:
        m = re.search(r"Results: (\d+)/(\d+) passed", out)
        a = int(m.group(1)) if m else 0
        b = int(m.group(2)) if m else 0
        ok = a == b

    status = "✅" if ok else "⚠️"
    print(f"  {status} {name}: {a}/{b} passed")
    total += b; passed += a

pct = 100 * passed // total if total else 0
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print(f"  TOTAL: {passed}/{total} passed ({pct}%)")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
sys.exit(0 if passed == total else 1)
