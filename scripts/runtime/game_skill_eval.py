#!/usr/bin/env python3
"""Fresh repeated game-contract verification, explicitly ineligible for promotion.

This executes the independent game validator against raw artifacts. Arm labels
do not run agents; this is an adapter/contract experiment, never live skill gain.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def evaluate_contract(
    *, contract, reference, candidate, current_build, repeats=3, timeout=10
):
    if type(repeats) is not int or not 1 <= repeats <= 5:
        raise ValueError("repeats must be between 1 and 5")
    paths = [Path(path).resolve() for path in (contract, reference, candidate)]

    def artifacts():
        rows = []
        for path in paths:
            if not path.is_file() or path.stat().st_size > 2 * 1024 * 1024:
                raise ValueError("bounded raw game artifacts required")
            rows.append(
                {
                    "path": str(path),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                }
            )
        return rows

    frozen = artifacts()
    runs = []
    status = "PASS"
    command = [
        "node",
        str(ROOT / "scripts/runtime/game-reference.mjs"),
        *(str(p) for p in paths),
        current_build,
    ]
    for arm in ("baseline", "current", "candidate"):
        for repeat in range(repeats):
            if artifacts() != frozen:
                status = "UNVERIFIED"
                break
            started = time.perf_counter_ns()
            try:
                process = subprocess.run(
                    command,
                    text=True,
                    capture_output=True,
                    timeout=timeout,
                    check=False,
                )
                result = json.loads(process.stdout)
                outcome = result.get("status")
                expected_exit = {"PASS": 0, "FAIL": 1, "UNVERIFIED": 2}.get(outcome)
                if expected_exit is None or process.returncode != expected_exit:
                    outcome = "UNVERIFIED"
            except (OSError, ValueError, subprocess.SubprocessError):
                outcome = "UNVERIFIED"
            runs.append(
                {
                    "arm": arm,
                    "repeat": repeat,
                    "execution_id": str(uuid.uuid4()),
                    "cache": "disabled",
                    "status": outcome,
                    "wall_ms": (time.perf_counter_ns() - started) / 1_000_000,
                }
            )
            if outcome != "PASS":
                status = outcome
            if outcome == "UNVERIFIED":
                break
        if status == "UNVERIFIED":
            break
    if artifacts() != frozen:
        status = "UNVERIFIED"
    return {
        "schema": "forgewright-game-skill-contract/v1",
        "evaluation_kind": "contract-replay",
        "status": status,
        "promotion_eligible": False,
        "hold_reason": "no live agent-quality evidence",
        "model_calls": 0,
        "actual_verifier_calls": len(runs),
        "runs": runs,
        "artifacts": frozen,
        "independent_provider_samples": False,
        "limitations": [
            "arms are repeated contract validators over the same captures, not agent variants",
            "verifier wall time is not model latency or token cost",
            "human game quality unmeasured",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("contract", "reference", "candidate", "current-build"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    report = evaluate_contract(
        contract=args.contract,
        reference=args.reference,
        candidate=args.candidate,
        current_build=args.current_build,
        repeats=args.repeats,
    )
    encoded = json.dumps(report, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(encoded)
    print(encoded, end="")
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
