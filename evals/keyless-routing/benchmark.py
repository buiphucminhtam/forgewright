#!/usr/bin/env python3
"""Frozen synthetic holdout + Python warm/public CLI cold measurements.

Uses stdlib only, a fresh consumer config, and socket audit denial. This measures
routing overhead on the observed host; it does not certify Pi or total host RAM.
"""

import hashlib
import json
import math
import os
from pathlib import Path
import platform
import resource
import statistics
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
# Repository imports follow the explicit package root for standalone execution.
from scripts.runtime.local_routing import ExactRoutingCache  # noqa: E402
from scripts.runtime.skill_routing import route_skills  # noqa: E402


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def p95(values):
    return sorted(values)[math.ceil(len(values) * 0.95) - 1]


def rss_bytes(who):
    value = resource.getrusage(who).ru_maxrss
    return value if sys.platform == "darwin" else value * 1024


def summary(samples):
    return {
        "count": len(samples),
        "p50_ms": statistics.median(samples),
        "p95_ms": p95(samples),
        "max_ms": max(samples),
    }


def main():
    here = Path(__file__).resolve().parent
    digest = sha(here / "holdout.jsonl")
    assert digest == (here / "holdout.sha256").read_text().strip(), "holdout changed"
    rows = [
        json.loads(line) for line in (here / "holdout.jsonl").read_text().splitlines()
    ]

    def deny_socket(event, args):
        if event.startswith("socket."):
            raise RuntimeError("benchmark outbound blocked by Python audit hook")

    sys.addaudithook(deny_socket)
    report = {
        "corpus_sha256": digest,
        "corpus_size": len(rows),
        "labels": "synthetic author-labeled; no independent human labeling; same author wrote rules",
        "implementation_sha256": {
            str(p.relative_to(ROOT)): sha(p)
            for p in [
                ROOT / "scripts/runtime/local_routing.py",
                ROOT / "scripts/runtime/skill_routing.py",
            ]
        },
        "host": {
            "platform": platform.platform(),
            "python": sys.version,
            "machine": platform.machine(),
        },
        "network": "socket audit denial in Python parent/children; no cloud keys in child environment",
        "scope": "routing only; no model, Pi worker, host admission, idle CPU or total-host RAM claim",
    }
    with tempfile.TemporaryDirectory(prefix="keyless-routing-") as work:
        consumer = Path(work)
        (consumer / ".forgewright").mkdir()
        (consumer / ".forgewright/skills-config.json").write_bytes(
            (ROOT / ".forgewright/skills-config.json").read_bytes()
        )
        guard = consumer / "guard"
        guard.mkdir()
        (guard / "sitecustomize.py").write_text(
            "import sys\ndef audit(event,args):\n    if event.startswith('socket.'):\n        raise RuntimeError('outbound blocked')\nsys.addaudithook(audit)\n"
        )
        env = {
            "PATH": os.environ.get("PATH", ""),
            "PYTHONPATH": str(guard),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        predictions = []
        for row in rows:
            result = route_skills(prompt=row["prompt"], project_root=consumer)
            predictions.append(
                dict(
                    id=row["id"],
                    label=row["label"],
                    expected=row["expected_mode"],
                    actual=result["mode"],
                    status=result["status"],
                    reason=result["routing"]["reason"],
                )
            )
        routed = [r for r in predictions if r["actual"] is not None]
        correct = sum(
            r["expected"] == r["actual"] and r["status"] == "ok" for r in routed
        )
        report["evaluation"] = {
            "routed": len(routed),
            "correct_routes": correct,
            "precision": correct / len(routed) if routed else 0,
            "coverage": len(routed) / len(rows),
            "precision_denominator": "non-abstained automatic selections",
            "coverage_denominator": "all inputs including ambiguity and out-of-scope",
            "abstain": len(rows) - len(routed),
            "errors": sum(r["status"] != "ok" for r in predictions),
            "predictions": predictions,
        }
        cache = ExactRoutingCache()
        samples = []
        for i in range(1000):
            begin = time.perf_counter_ns()
            result = route_skills(
                prompt=rows[i % len(rows)]["prompt"], project_root=consumer, cache=cache
            )
            samples.append((time.perf_counter_ns() - begin) / 1e6)
            assert result["status"] == "ok"
        report["warm"] = dict(
            summary(samples),
            cache_entries=len(cache),
            includes_config_and_catalog_validation=True,
            samples_ms=samples,
        )
        samples_uncached = []
        for i in range(1000):
            begin = time.perf_counter_ns()
            result = route_skills(
                prompt=rows[i % len(rows)]["prompt"], project_root=consumer
            )
            samples_uncached.append((time.perf_counter_ns() - begin) / 1e6)
            assert result["status"] == "ok"
        report["warm_without_cache"] = dict(
            summary(samples_uncached), samples_ms=samples_uncached
        )
        cold = []
        argv = [
            sys.executable,
            str(ROOT / "scripts/runtime/skill_routing.py"),
            "--project-root",
            str(consumer),
            "--prompt",
            "Viết kiểm thử đơn vị",
        ]
        for _ in range(30):
            begin = time.perf_counter_ns()
            proc = subprocess.run(
                argv, cwd=consumer, env=env, capture_output=True, text=True, timeout=10
            )
            cold.append((time.perf_counter_ns() - begin) / 1e6)
            assert proc.returncode == 0, proc.stdout + proc.stderr
            assert json.loads(proc.stdout)["mode"] == "test"
        report["cold_python_host"] = dict(summary(cold), samples_ms=cold)
        report["memory"] = {
            "python_benchmark_process_peak_rss_bytes": rss_bytes(resource.RUSAGE_SELF),
            "python_children_peak_rss_bytes": rss_bytes(resource.RUSAGE_CHILDREN),
            "ru_maxrss_native_unit": "bytes" if sys.platform == "darwin" else "KiB",
            "semantics": "process high-water RSS, not incremental router allocation; child high-water is not sum; excludes Pi/models/build/browser",
        }
        # Optional Node host mirrors the consumer process-spawn boundary without
        # importing an SDK or touching CLI implementation files.
        node_script = """const {spawnSync}=require('node:child_process');
const samples=[];
for(let i=0;i<30;i++) { const t=process.hrtime.bigint();
 const r=spawnSync(process.argv[1],process.argv.slice(2),{encoding:'utf8',env:process.env});
 samples.push(Number(process.hrtime.bigint()-t)/1e6);
 if(r.status!==0 || JSON.parse(r.stdout).mode!=='test') throw Error(r.stderr||r.stdout);
}
console.log(JSON.stringify({samples_ms:samples,node_version:process.version,node_host_peak_rss_bytes:process.resourceUsage().maxRSS*1024}));"""
        import shutil

        node = shutil.which("node")
        if node:
            proc = subprocess.run(
                [node, "-e", node_script, *argv],
                cwd=consumer,
                env=env,
                capture_output=True,
                text=True,
                timeout=60,
            )
            assert proc.returncode == 0, proc.stdout + proc.stderr
            node_result = json.loads(proc.stdout)
            report["cold_node_host"] = dict(
                summary(node_result["samples_ms"]), **node_result
            )
        else:
            report["cold_node_host"] = {"status": "unavailable"}
    checks = {
        "precision_ge_95pct": report["evaluation"]["precision"] >= 0.95,
        "coverage_ge_60pct": report["evaluation"]["coverage"] >= 0.60,
        "warm_p95_le_50ms": report["warm"]["p95_ms"] <= 50
        and report["warm_without_cache"]["p95_ms"] <= 50,
        "cold_p95_le_300ms": report["cold_python_host"]["p95_ms"] <= 300
        and report.get("cold_node_host", {}).get("p95_ms", float("inf")) <= 300,
    }
    report["requirements"] = checks
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else here / "results.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {
                key: value
                for key, value in report.items()
                if key
                not in {
                    "evaluation",
                    "warm",
                    "warm_without_cache",
                    "cold_node_host",
                    "cold_python_host",
                }
            },
            ensure_ascii=False,
        )
    )
    print(
        json.dumps(
            {
                "evaluation": {
                    k: v for k, v in report["evaluation"].items() if k != "predictions"
                },
                "latency": {
                    name: {k: v for k, v in report[name].items() if k != "samples_ms"}
                    for name in (
                        "warm",
                        "warm_without_cache",
                        "cold_python_host",
                        "cold_node_host",
                    )
                },
            }
        )
    )
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
