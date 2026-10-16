#!/usr/bin/env python3
"""Run real isolated pytest cases and derive counts from its JUnit receipt."""

from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="memory-lane-") as directory:
    report = Path(directory) / "junit.xml"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            *sys.argv[1:],
            "--junitxml",
            str(report),
        ],
        cwd=ROOT,
        timeout=120,
    )
    try:
        cases = list(ET.parse(report).iter("testcase"))
        executed = [case for case in cases if case.find("skipped") is None]
        passed = sum(
            case.find("failure") is None and case.find("error") is None
            for case in executed
        )
        print(
            f"Results: {passed}/{len(executed)} passed; skipped={len(cases) - len(executed)}"
        )
    except (OSError, ET.ParseError):
        raise SystemExit(1)
    raise SystemExit(
        result.returncode
        if result.returncode
        else 0
        if executed and passed == len(executed)
        else 1
    )
