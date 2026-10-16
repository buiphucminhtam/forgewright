#!/usr/bin/env python3
"""Compare a frozen local corpus against a real MemoryDB implementation."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import sqlite3
import statistics
import subprocess
import sys
import tempfile
import time


def evaluate(source, fixture):
    source = source.resolve()
    spec = importlib.util.spec_from_file_location("evaluated_memory", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    dataset = json.loads(fixture.read_text())
    os.environ["MEM0_PROJECT_ID"] = "memory-retrieval-eval"
    for flag in (
        "MEM0_DISABLED",
        "FORGEWRIGHT_SKIP_MEM0",
        "FORGEWRIGHT_SESSION",
        "FORGEWRIGHT_SESSION_ID",
    ):
        os.environ.pop(flag, None)
    with tempfile.TemporaryDirectory(prefix="forgewright-memory-eval-") as directory:
        db = module.MemoryDB(str(Path(directory) / ".forgewright/memory.db"))
        ids = {
            item["id"]: db.add(item["text"], category=item["category"])["id"]
            for item in dataset["records"]
        }
        reciprocal = []
        recall = []
        unrelated = []
        observations = []
        for item in dataset["queries"]:
            found = [row["id"] for row in db.search(item["query"], limit=3)]
            expected = [ids[key] for key in item["expected"]]
            if expected:
                recall.append(len(set(found) & set(expected)) / len(expected))
                reciprocal.append(
                    next(
                        (
                            1 / (index + 1)
                            for index, value in enumerate(found)
                            if value in expected
                        ),
                        0,
                    )
                )
            else:
                unrelated.append(bool(found))
            observations.append(
                {"query": item["query"], "expected": expected, "found": found}
            )
        start = time.perf_counter()
        for number in range(1000 - len(ids)):
            db.add(
                f"archive fixture item {number} unrelated background record",
                category="reference",
            )
        population_ms = (time.perf_counter() - start) * 1000
        timings = []
        fts_timings = []
        for _ in range(40):
            start = time.perf_counter()
            db.search("Phaser Signal", limit=3)
            timings.append((time.perf_counter() - start) * 1000)
            start = time.perf_counter()
            db.memory_search("Phaser", limit=3)
            fts_timings.append((time.perf_counter() - start) * 1000)

        def percentile(values):
            return sorted(values)[int(0.95 * (len(values) - 1))]

        cold = []
        for _ in range(5):
            start = time.perf_counter()
            result = subprocess.run(
                [sys.executable, str(source), "search", "Phaser", "--limit", "3"],
                cwd=directory,
                env={
                    **os.environ,
                    "FORGEWRIGHT_WORKSPACE": directory,
                    "MEM0_DB_PATH": db.db_path,
                },
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode or "Phaser" not in result.stdout:
                raise RuntimeError("cold_process_did_not_retrieve_expected_memory")
            cold.append((time.perf_counter() - start) * 1000)
        return {
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "fixture_sha256": hashlib.sha256(fixture.read_bytes()).hexdigest(),
            "runtime": {
                "python": sys.version.split()[0],
                "sqlite": sqlite3.sqlite_version,
                "platform": platform.platform(),
            },
            "scope": dataset["scope"],
            "query_count": len(observations),
            "positive_queries": len(recall),
            "unrelated_queries": len(unrelated),
            "recall_at_3": statistics.mean(recall),
            "mrr": statistics.mean(reciprocal),
            "unrelated_injection_rate": statistics.mean(unrelated),
            "population_to_1000_ms": round(population_ms, 2),
            "warm_search_p50_ms": round(statistics.median(timings), 3),
            "warm_search_p95_ms": round(percentile(timings), 3),
            "warm_fts_p95_ms": round(percentile(fts_timings), 3),
            "cold_cli_search_p50_ms": round(statistics.median(cold), 3),
            "cold_cli_search_max_ms": round(max(cold), 3),
            "cold_process_samples": len(cold),
            "measurements": 40,
            "total_records": db.count(),
            "queries": observations,
            "limitations": [
                "Synthetic fixed corpus; no production recall or player-benefit claim",
                "Warm local API timing excludes provider/model and cold process costs",
            ],
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument(
        "--fixture", type=Path, default=Path(__file__).with_name("retrieval.json")
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = evaluate(args.source, args.fixture)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {key: value for key, value in result.items() if key != "queries"},
            ensure_ascii=False,
        )
    )
