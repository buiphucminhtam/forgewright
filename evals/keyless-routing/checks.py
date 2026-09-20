"""Capture exact local checks and a reversible lexical-boundary mutation.

Run from package root. Does not modify legacy tests or execute a paid provider.
"""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
RECORDS = []


def digest(data):
    return hashlib.sha256(data).hexdigest()


def check(label, argv, expected):
    proc = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, timeout=120)
    output = proc.stdout + proc.stderr
    (OUT / (label + ".txt")).write_text(output)
    RECORDS.append(
        {
            "label": label,
            "command": argv,
            "exit_code": proc.returncode,
            "expected_exit": expected,
            "output_sha256": digest(output.encode()),
        }
    )
    print(label, proc.returncode, output.strip().splitlines()[-1])
    assert proc.returncode == expected, output


def main():
    immutable = [
        ROOT / "tests/unit_tests/test_skill_routing_runtime.py",
        ROOT / "tests/unit_tests/test_jev_adapter.py",
    ]
    before_tests = {str(p.relative_to(ROOT)): digest(p.read_bytes()) for p in immutable}
    source = ROOT / "scripts/runtime/local_routing.py"
    original = source.read_bytes()
    argv = [
        sys.executable,
        "-m",
        "pytest",
        "-q",
        "tests/unit_tests/test_local_routing.py",
    ]
    check("pre-mutation-green", argv, 0)
    try:
        text = original.decode()
        needle = 'return re.search(r"(?<!\\w)" + re.escape(phrase) + r"(?!\\w)", text) is not None'
        assert text.count(needle) == 1
        source.write_text(text.replace(needle, "return phrase in text"))
        check("mutation-red", argv, 1)
    finally:
        source.write_bytes(original)
    assert source.read_bytes() == original
    check("exact-final-green", argv, 0)
    check(
        "legacy-and-new",
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "tests/unit_tests/test_skill_routing_runtime.py",
            "tests/unit_tests/test_local_routing.py",
        ],
        0,
    )
    check(
        "keyless-jev-amendment",
        [sys.executable, "-m", "pytest", "-q", "tests/unit_tests/test_jev_adapter.py"],
        0,
    )
    after_tests = {str(p.relative_to(ROOT)): digest(p.read_bytes()) for p in immutable}
    assert before_tests == after_tests
    report = {
        "checks": RECORDS,
        "mutation": "replace Unicode whole-word boundary match with substring matching",
        "source_restored_sha256": digest(original),
        "unchanged_test_sha256": after_tests,
        "independent_review": "pending parent; no subagents authorized",
        "legacy_jev_amendment": "Owner-approved keyless routing replaces the former cloud fallback; the amended test proves no Jev call and all other adapter assertions stay intact.",
        "missing_test": "test_codex_efficiency_skills.py not present in this checkout",
    }
    (OUT / "checks.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
