#!/usr/bin/env python3
"""Reproducible acceptance for the portable plugin + skill-quality upgrade.

This source-release gate does not call a language model. The E2E tier installs
the plugin into isolated Codex/Claude homes and exercises the integrated local
orchestration/context policies.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "forgewright-plugin-skill-quality-acceptance/v1"


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def run(argv: list[str], label: str, *, timeout: int = 180) -> dict[str, object]:
    result = subprocess.run(
        argv,
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    output = result.stdout + result.stderr
    record = {
        "label": label,
        "argv": argv,
        "exit_code": result.returncode,
        "output_sha256": sha256(output),
    }
    print(json.dumps(record, ensure_ascii=False), flush=True)
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed:\n{output[-6000:]}")
    return record


def python() -> str:
    return sys.executable


def contract() -> list[dict[str, object]]:
    return [
        run(
            [python(), "scripts/ci/verify-plugin-distribution.py", "--static"],
            "plugin-static-contract",
        ),
        run(
            [
                python(),
                "-m",
                "pytest",
                "-q",
                "-p",
                "no:cacheprovider",
                "tests/unit_tests/test_plugin_distribution.py",
                "tests/unit_tests/test_skill_quality.py",
                "tests/unit_tests/test_skill_metadata.py",
                "tests/unit_tests/test_context_packets.py",
                "tests/unit_tests/test_plan_runtime.py",
            ],
            "quality-contracts",
        ),
    ]


def runtime() -> list[dict[str, object]]:
    with tempfile.TemporaryDirectory(prefix="fw-skill-metadata-") as folder:
        report = Path(folder) / "metadata.json"
        checks = [
            run(
                [
                    python(),
                    "scripts/runtime/skill_metadata.py",
                    "--root",
                    str(ROOT),
                    "--json",
                ],
                "trigger-metadata-runtime",
            ),
            run(
                [
                    python(),
                    "-m",
                    "pytest",
                    "-q",
                    "-p",
                    "no:cacheprovider",
                    "tests/unit_tests/test_parallel_dispatch_runner.py",
                    "tests/unit_tests/test_orchestration_skill_dispatch.py",
                    "tests/unit_tests/test_context_packets.py",
                    "tests/unit_tests/test_plan_runtime.py",
                    "tests/unit_tests/test_skill_quality.py",
                ],
                "orchestration-runtime",
            ),
        ]
        # Keep the temporary variable intentionally scoped; the command itself
        # emits its report on stdout and must not mutate the repository.
        _ = report
        return checks


def e2e() -> list[dict[str, object]]:
    return [
        run(
            [python(), "scripts/ci/verify-plugin-distribution.py", "--install"],
            "codex-claude-plugin-install",
            timeout=180,
        ),
        run(
            [
                python(),
                "-m",
                "pytest",
                "-q",
                "-p",
                "no:cacheprovider",
                "tests/unit_tests/test_plugin_distribution.py",
                "tests/unit_tests/test_skill_quality.py",
                "tests/unit_tests/test_skill_metadata.py",
                "tests/unit_tests/test_context_packets.py",
                "tests/unit_tests/test_plan_runtime.py",
                "tests/unit_tests/test_parallel_dispatch_runner.py",
                "tests/unit_tests/test_orchestration_skill_dispatch.py",
                "tests/unit_tests/test_elite_skill_contracts.py",
                "tests/unit_tests/test_senior_execution_contract.py",
            ],
            "integrated-e2e-regressions",
            timeout=240,
        ),
        run([python(), "scripts/ci/verify-readme.py"], "readme-e2e"),
        run([python(), "scripts/ci/verify-product-truth.py"], "product-truth-e2e"),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tier", choices=("contract", "runtime", "e2e"))
    args = parser.parse_args()

    checks = {"contract": contract, "runtime": runtime, "e2e": e2e}[args.tier]()
    print(
        json.dumps(
            {
                "schema": SCHEMA,
                "status": "pass",
                "tier": args.tier,
                "checks": checks,
                "claims": [
                    "portable-plugin-distribution",
                    "behavioral-skill-quality",
                    "minimal-worker-context",
                    "scoped-review-package",
                    "plan-scoped-runtime",
                    "debugger-failure-classification",
                ],
                "limitations": [
                    "No real-model quality/token/latency gain is inferred from deterministic fixtures.",
                    "Official hosted marketplace publication is outside this source-release acceptance.",
                    "The default plugin is skills-only and does not imply local MCP or executable hook deployment.",
                ],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"plugin-quality-acceptance: {error}", file=sys.stderr)
        raise SystemExit(1)
