#!/usr/bin/env python3
"""Bounded project footprint report; names classify candidates, never ownership."""

import argparse
import json
import math
from pathlib import Path
import shutil
import stat
import time

from project_storage import StorageError, disk_limits, measure_tree

GENERATED = {
    "node_modules",
    ".next",
    ".nuxt",
    "dist",
    "build",
    "out",
    ".turbo",
    ".parcel-cache",
    ".vite",
    "target",
    "Library",
    "Temp",
    "Logs",
    ".godot",
    ".import",
    "playwright-report",
    "test-results",
    "coverage",
    ".gradle",
    "Pods",
    "DerivedData",
    "build-jobs",
}


def report_project(root, *, host_budget=None, max_entries=100000):
    root = Path(root).resolve(strict=True)
    directories = {}

    def attribute(relative, info):
        if not (stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode)):
            return
        parts = Path(relative).parts
        selected = None
        for i, part in enumerate(parts[:-1]):
            if part in GENERATED:
                selected = "/".join(parts[: i + 1])
                break
        if selected is not None:
            if selected not in directories and len(directories) >= 512:
                raise StorageError("storage-classification-incomplete")
            directories[selected] = directories.get(selected, 0) + info.st_size

    base = {
        "project": str(root),
        "complete": False,
        "total_bytes": None,
        "total_mb": None,
        "verdict": "UNVERIFIED",
        "directories": [],
        "ownership": "observation-only",
    }
    try:
        limits = disk_limits(root, host_budget)
        usage = measure_tree(root, max_entries=max_entries, visitor=attribute)
        total = usage["bytes"]
        verdict = (
            "BLOCK"
            if total >= limits["project_bytes"]
            else ("WARN" if total >= limits["warn_bytes"] else "OK")
        )
        return {
            **base,
            "schema": "forgewright-project-disk/v2",
            "complete": True,
            "total_bytes": total,
            "total_mb": math.ceil(total / 1024**2),
            "allocated_bytes": usage["allocated_bytes"],
            "entries": usage["entries"],
            "warn_mb": limits["warn_bytes"] // 1024**2,
            "block_mb": limits["project_bytes"] // 1024**2,
            "volume": {
                "device": usage["device"],
                "free_bytes": shutil.disk_usage(root).free,
            },
            "verdict": verdict,
            "directories": [
                {"path": p, "bytes": size, "ownership": "unmanaged-candidate"}
                for p, size in sorted(
                    directories.items(), key=lambda item: item[1], reverse=True
                )
            ],
            "limitations": [
                "Logical and allocated totals are not unique APFS extents or guaranteed reclaimable bytes",
                "Directory names do not authorize deletion; legacy builds/caches require reviewed ownership",
            ],
        }
    except (StorageError, OSError) as error:
        return {
            **base,
            "reason": str(error)
            if isinstance(error, StorageError)
            else "disk-unavailable",
        }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, action="append", default=[])
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args(argv)
    roots = args.root
    if not roots:
        from runtime_registry import rlg_home

        index = rlg_home() / "projects.index"
        if index.is_file():
            if index.stat().st_size > 65536:
                raise SystemExit("project-index-too-large")
            roots = [
                Path(line.split("\t", 1)[1])
                for line in index.read_text().splitlines()
                if "\t" in line
            ]
    if len(roots) > 32:
        raise SystemExit("project-report-limit")
    projects = [
        report_project(p) for p in dict.fromkeys(p.resolve(strict=True) for p in roots)
    ]
    worst = max(
        (
            {"OK": 0, "WARN": 1, "BLOCK": 2, "UNVERIFIED": 3}[p["verdict"]]
            for p in projects
        ),
        default=0,
    )
    result = {
        "schema": "forgewright-disk-budget/v2",
        "generated_at": time.time(),
        "worst": worst,
        "projects": projects,
    }
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for project in projects:
            print(
                f"{project['verdict']:10} {project['project']} {project['total_mb']} MiB (complete={project['complete']})"
            )
            for row in project["directories"][:8]:
                print(
                    f"  {math.ceil(row['bytes'] / 1024**2):6} MiB  {row['path']} [{row['ownership']}]"
                )
    return 2 if worst >= 2 else (1 if worst and args.strict else 0)


if __name__ == "__main__":
    raise SystemExit(main())
