#!/usr/bin/env python3
"""Release checks for the opt-in keyless Pi consumer path.

Tiers execute different checks. E2E revalidates a separately observed native
Git-submodule run and runs fresh cancellation/capacity subprocesses. It does
not call a model again or certify performance targets or arbitrary builds.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / ".forgewright/runtime/keyless-pi/acceptance" / uuid.uuid4().hex
CLAIMS = {
    "keyless-routing": "Bounded local EN/VI routing selects configured modes or abstains without a cloud router.",
    "consumer-config": "The explicitly selected Pi worker uses parent configuration and does not become a mandatory core-CLI dependency.",
    "authorized-effects": "Only contract-scoped file effects and immutable verifiers are admitted; foreign changes and cancellation fence writes.",
    "provider-boundary": "Provider selection and existing authorization are explicit; unavailable cost and failed transport are not fabricated or rerouted to paid APIs.",
    "host-capacity": "Cooperating Pi project processes share transactional capacity, owner identity and uncertain-cleanup quarantine.",
    "truthful-completion": "A successful worker result requires final verifier acceptance and confirmed local cleanup, not a flag or SDK installation.",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def command(
    argv: list[str], label: str, *, cwd: Path = ROOT, env=None, timeout=120
) -> subprocess.CompletedProcess:
    result = subprocess.run(
        argv,
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    text = result.stdout + result.stderr
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / (label + ".log")).write_text(text)
    print(
        json.dumps(
            {
                "check": label,
                "argv": argv,
                "exit_code": result.returncode,
                "output_sha256": sha(text.encode()),
            }
        ),
        flush=True,
    )
    assert result.returncode == 0, f"{label}: {text[-4000:]}"
    return result


def public_routing() -> None:
    with tempfile.TemporaryDirectory(prefix="fw-keyless-route-consumer-") as folder:
        root = Path(folder)
        (root / ".forgewright").mkdir()
        (root / ".forgewright/skills-config.json").write_bytes(
            (ROOT / ".forgewright/skills-config.json").read_bytes()
        )
        guard = root / "guard"
        guard.mkdir()
        (guard / "sitecustomize.py").write_text(
            "import sys\ndef guard(event,args):\n if event.startswith('socket.'):\n  raise RuntimeError('network forbidden in local routing')\nsys.addaudithook(guard)\n"
        )
        env = {
            "PATH": os.environ.get("PATH", ""),
            "PYTHONPATH": str(guard),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        for index, (prompt, expected) in enumerate(
            [
                ("Viết kiểm thử đơn vị", "test"),
                ("Review this pull request", "review"),
                ("Something unclear without actionable intent", None),
            ]
        ):
            result = command(
                [
                    sys.executable,
                    str(ROOT / "scripts/runtime/skill_routing.py"),
                    "--project-root",
                    str(root),
                    "--prompt",
                    prompt,
                ],
                f"routing-{index}",
                cwd=root,
                env=env,
            )
            route = json.loads(result.stdout)
            assert route["status"] == "ok" and route["mode"] == expected
            assert route["routing"]["backend"] == "python-stdlib"


def native_consumer(path: Path) -> None:
    assert path.is_file() and path.stat().st_size < 262144, (
        "Bounded actual consumer report required"
    )
    report = json.loads(path.read_text())
    assert report["schema"] == "forgewright-consumer-live/v1"
    assert report["gitSubmodule"] and report["liveProvider"] and report["verified"]
    head = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()
    assert report["candidate"] == head, (
        "Live consumer must use the current committed candidate"
    )
    root = Path(report["root"]).resolve()
    assert (
        str(root).startswith("/private/tmp/fw-pi-submodule-")
        and root.name == "consumer"
    )
    receipt = report["receipt"]
    assert (
        receipt["status"] == "finished"
        and receipt["verified"]
        and receipt["quiescence"] == "confirmed"
    )
    assert (
        receipt["provider"] in {"openai-codex", "local"} and 0 < receipt["turns"] <= 6
    )
    assert all(
        row["requests"] == 1
        and row["transportError"] is None
        and row["costUsd"] is None
        for row in receipt["usage"]
    )
    assert receipt["contractSha256"] == sha((root / "task.json").read_bytes())
    assert (root / "source.mjs").read_text() == report["source"]
    assert (
        report["protectedFilesUnchanged"]
        and report["configUnchangedDuringTask"]
        and report["brokerExited"]
    )
    assert set(report["protectedBefore"]) == {
        "verify.mjs",
        "task.json",
        ".forgewright/active-goal.json",
        "owner-notes.txt",
        ".gitmodules",
    }
    assert re.fullmatch(r"pi-[a-f0-9-]{36}", receipt["runId"])
    for name, expected in report["protectedBefore"].items():
        assert sha((root / name).read_bytes()) == expected, (
            f"Consumer protected bytes changed: {name}"
        )
    gitlink = subprocess.check_output(
        ["git", "ls-files", "--stage", "--", "forgewright"], cwd=root, text=True
    ).strip()
    assert gitlink == report["gitlink"] and gitlink.startswith("160000 " + head)
    assert (
        subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=root / "forgewright", text=True
        ).strip()
        == head
    )
    assert not subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=root / "forgewright", text=True
    ).strip()
    assert any(row["tool"] == "pi_patch_file" for row in receipt["effects"])
    assert any(
        row["id"] == "check"
        and row["exitCode"] == 0
        and row["revision"] == receipt["revision"]
        for row in receipt["verifiers"]
    )
    disk_receipt = (
        root / ".forgewright/runtime/pi-worker" / receipt["runId"] / "receipt.json"
    )
    assert json.loads(disk_receipt.read_text()) == receipt
    assert report["independentVerifier"]["sandbox"] == "darwin-scoped-single-process"
    env = {
        **os.environ,
        "FORGEWRIGHT_WORKSPACE": str(root),
        "FORGEWRIGHT_ADMISSION_HOME": str(root.parent / "host"),
    }
    for key in ["TYPESAFE_API_KEY", "OPENAI_API_KEY", "FORGEWRIGHT_POLICY_FILE"]:
        env.pop(key, None)
    replay = command(
        ["node", str(ROOT / "evals/keyless-routing/replay-verifier.mjs"), str(root)],
        "native-consumer-verifier-replay",
        cwd=root,
        env=env,
        timeout=35,
    )
    assert json.loads(replay.stdout)["sandbox"] == "darwin-scoped-single-process"
    print(
        json.dumps(
            {
                "native_consumer_report_sha256": sha(path.read_bytes()),
                "candidate": head,
                "provider": receipt["provider"],
                "model": receipt["model"],
                "extra_model_calls": 0,
            }
        ),
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tier", choices=["contract", "runtime", "e2e"])
    parser.add_argument("--consumer-report", type=Path)
    args = parser.parse_args()
    if args.tier == "contract":
        command(
            [
                sys.executable,
                "-m",
                "pytest",
                "-q",
                "-p",
                "no:cacheprovider",
                "tests/unit_tests/test_local_routing.py",
                "tests/unit_tests/test_host_admission.py",
                "tests/unit_tests/test_host_process_identity.py",
                "tests/unit_tests/test_jev_adapter.py",
            ],
            "contract-routing-admission",
        )
        command(
            [
                "node",
                "--test",
                "integrations/pi/config-parser.test.mjs",
                "integrations/pi/config-consumer.test.mjs",
                "integrations/pi/worker-runtime.test.mjs",
                "integrations/pi/cli-portable.test.mjs",
                "integrations/pi/activation-regressions.test.mjs",
                "integrations/pi/finalization-regressions.test.mjs",
            ],
            "contract-config-provider-scope",
        )
    elif args.tier == "runtime":
        command(
            ["node", "integrations/pi/run-tests.mjs", "worker"],
            "runtime-public-worker",
            timeout=120,
        )
        public_routing()
    else:
        assert args.consumer_report is not None, (
            "E2E requires the actual committed-submodule report"
        )
        native_consumer(args.consumer_report.resolve())
        command(
            [
                "node",
                "--test",
                "integrations/pi/consumer-cancel.test.mjs",
                "integrations/pi/governor-process.test.mjs",
                "integrations/pi/finalization-regressions.test.mjs",
                "integrations/pi/cli-portable.test.mjs",
            ],
            "e2e-cancel-capacity-finalization",
            timeout=120,
        )
        public_routing()
    print(
        json.dumps(
            {
                "status": "pass",
                "tier": args.tier,
                "acceptance": CLAIMS,
                "limitations": [
                    "Native-run replay is not another provider call or cryptographic billing attestation.",
                    "Local OS verifier coverage is macOS/single-process; no arbitrary build or 4 GiB certification.",
                    "Performance targets and broad P0-P6 production promotion are not certified by these checks.",
                ],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
