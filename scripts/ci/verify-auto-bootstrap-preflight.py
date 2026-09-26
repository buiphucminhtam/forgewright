#!/usr/bin/env python3
"""Measure real installed-launcher preflight in a disposable, unauthenticated home."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lite"))
from evidence_common import worktree_fingerprint  # noqa: E402


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(directory: Path) -> dict[str, str]:
    return {
        str(path.relative_to(directory)): "directory" if path.is_dir() else sha256(path)
        for path in sorted(directory.rglob("*"))
    }


def invoke(command: list[str], env: dict[str, str], cwd: Path) -> dict:
    result = subprocess.run(
        command, env=env, cwd=cwd, capture_output=True, timeout=30, check=False
    )
    if result.returncode:
        raise RuntimeError(
            f"command exit {result.returncode}: {result.stderr.decode(errors='replace')}"
        )
    payload = json.loads(result.stdout)
    if not payload.get("ok"):
        raise RuntimeError(f"CLI envelope rejected: {payload}")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default=shutil.which("node"))
    parser.add_argument("--samples", type=int, default=40)
    parser.add_argument("--threshold-ms", type=float, default=50.0)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT
        / ".forgewright/runtime/auto-bootstrap-completion/preflight-final-bound.json",
    )
    args = parser.parse_args()
    if args.samples < 20 or not args.node or args.threshold_ms <= 0:
        parser.error(
            "require an available Node, at least 20 samples and a positive threshold"
        )
    node = Path(args.node).resolve(strict=True)
    entry = ROOT / "src/cli/dist/bootstrap-entry.js"
    full_entry = ROOT / "src/cli/dist/index.js"
    if not entry.is_file() or not full_entry.is_file():
        parser.error("build the current CLI before measuring preflight")
    git = shutil.which("git")
    if not git:
        parser.error("Git is required")
    before_tree = worktree_fingerprint(ROOT)
    evidence: dict = {
        "kind": "installed_launcher_preflight_benchmark",
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "workspace": str(ROOT),
        "verifier": str(Path(__file__).relative_to(ROOT)),
        "verifier_sha256": sha256(Path(__file__)),
        "node": str(node),
        "threshold_ms": args.threshold_ms,
        "percentile_method": "nearest rank ceil(0.95*n)",
        "scope": "Local installed-launcher process startup and read-only bootstrap decision",
        "limitations": [
            "Local reference runtime only; no universal host guarantee.",
            "First sample is included; no unmeasured launcher warmup and no OS cache reset.",
            "This does not execute an authenticated Codex/Claude prompt.",
        ],
    }
    try:
        with tempfile.TemporaryDirectory(prefix="fw-preflight-reference-") as temporary:
            profile = Path(temporary).resolve()
            home = profile / "home"
            home.mkdir(mode=0o700)
            project = profile / "project"
            env = {
                "PATH": str(node.parent)
                + os.pathsep
                + os.environ.get("PATH", os.defpath),
                "HOME": str(home),
                "XDG_CONFIG_HOME": str(home / ".config"),
                "CODEX_HOME": str(home / ".codex"),
                "CLAUDE_CONFIG_DIR": str(home / ".claude"),
                "FORGEWRIGHT_BOOTSTRAP_HOME": str(home / ".config/forgewright"),
                "FORGEWRIGHT_BOOTSTRAP_PYTHON": sys.executable,
                "TMPDIR": str(profile),
            }
            evidence["node_version"] = subprocess.check_output(
                [str(node), "--version"],
                text=True,
                env=env,
                cwd=project.parent,
                timeout=15,
            ).strip()
            subprocess.run([git, "init", "-q", str(project)], env=env, check=True)
            before_project = snapshot(project)
            before_home = snapshot(home)
            disabled = invoke(
                [
                    str(node),
                    str(entry),
                    "--json",
                    "bootstrap",
                    "preflight",
                    str(project),
                ],
                env,
                project,
            )
            if disabled["data"]["action"] != "none" or snapshot(home) != before_home:
                raise RuntimeError(
                    "default-off preflight mutated home or requested bootstrap"
                )
            evidence["default_off_noop"] = True
            evidence["default_off_home_unchanged"] = True
            policy_result = invoke(
                [
                    str(node),
                    str(full_entry),
                    "--json",
                    "bootstrap",
                    "policy",
                    "set",
                    "--mode",
                    "full",
                    "--auto",
                    "on",
                    "--mcp-clients",
                    "codex,claude-code",
                    "--pi-policy",
                    "disabled",
                    "--forgewright-root",
                    str(ROOT),
                    "--allow-root",
                    str(profile),
                ],
                env,
                project,
            )
            launcher = Path(policy_result["data"]["launcher"])
            policy = Path(policy_result["data"]["path"])
            bound = {
                str(path): sha256(path)
                for path in (launcher, policy, entry, full_entry)
            }
            if str(entry) not in launcher.read_text():
                raise RuntimeError(
                    "installed launcher does not use the built light entry"
                )
            before_home = snapshot(home)
            command = [str(launcher), "--json", "bootstrap", "preflight", str(project)]
            samples: list[float] = []
            outputs: list[str] = []
            for _ in range(args.samples):
                start = time.perf_counter()
                payload = invoke(command, env, project)
                samples.append((time.perf_counter() - start) * 1000)
                if (
                    payload["data"]["action"] != "ensure"
                    or payload["data"]["state"] != "unmanaged"
                ):
                    raise RuntimeError(
                        "full-opt-in unmanaged project did not request ensure"
                    )
                outputs.append(
                    hashlib.sha256(
                        json.dumps(payload, sort_keys=True).encode()
                    ).hexdigest()
                )
            p95 = sorted(samples)[math.ceil(len(samples) * 0.95) - 1]
            unchanged = before_project == snapshot(project) and before_home == snapshot(
                home
            )
            if not unchanged or bound != {
                str(path): sha256(path)
                for path in (launcher, policy, entry, full_entry)
            }:
                raise RuntimeError(
                    "read-only preflight changed project, home or bound runtime files"
                )
            evidence.update(
                {
                    "artifacts_sha256": bound,
                    "launcher_bytes": launcher.read_text(),
                    "command": command,
                    "command_env_overrides": env,
                    "samples_ms": samples,
                    "p50_ms": statistics.median(samples),
                    "p95_ms": p95,
                    "first_sample_ms": samples[0],
                    "met": p95 < args.threshold_ms,
                    "project_and_home_unchanged": unchanged,
                    "parsed_output_sha256": outputs,
                }
            )
        evidence["temporary_profile_reclaimed"] = not profile.exists()
        evidence["tree_sha"] = worktree_fingerprint(ROOT)
        if before_tree != evidence["tree_sha"]:
            raise RuntimeError("workspace tree changed during benchmark")
        evidence["status"] = "passed" if evidence["met"] else "failed"
    except (
        OSError,
        ValueError,
        RuntimeError,
        KeyError,
        subprocess.SubprocessError,
    ) as error:
        evidence.update(status="failed", error=str(error))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2) + "\n")
    print(
        json.dumps(
            {
                key: evidence[key]
                for key in (
                    "status",
                    "p50_ms",
                    "p95_ms",
                    "first_sample_ms",
                    "tree_sha",
                    "error",
                )
                if key in evidence
            }
        )
    )
    return 0 if evidence["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
