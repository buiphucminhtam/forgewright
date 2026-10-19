#!/usr/bin/env python3
"""Bounded admission/process observation. No ownership adoption or execution.

`managed-owner` means an exact live lease owner, not its entire process tree.
Unmatched descendants and foreign applications remain outside this coverage.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil

from host_admission import HostAdmission
from host_resources import command, inspect_process


def authority_identity(home, canonical=None):
    canonical = canonical or Path.home() / ".forgewright/runtime/admission"
    resolved = Path(home).resolve()
    return {
        "id": hashlib.sha256(os.fsencode(resolved)).hexdigest(),
        "override": resolved != Path(canonical).resolve(),
        "path": str(resolved),
    }


def correlate_processes(jobs, processes):
    result = []
    for process in processes:
        identity = process.get("identity")
        matches = [
            j
            for j in jobs
            if identity
            and j["pid"] == process["pid"]
            and j["identity"] == identity
            and j["state"] in {"active", "quarantined"}
        ]
        result.append(
            {
                "pid": process["pid"],
                "identity": identity,
                "rss_bytes": process.get("rss_bytes"),
                "cpu_percent": process.get("cpu_percent"),
                "coverage": "managed-owner"
                if matches
                else ("unmanaged" if identity else "unknown"),
                "leases": [j["id"] for j in matches],
                "projects": sorted({j["project"] for j in matches}),
                "reservation_bytes": sum(j["memory_bytes"] for j in matches),
            }
        )
    return result


def process_observations(limit=64):
    # Never read argv, environment, credentials or another session's transcript.
    rows = []
    for line in command(["/bin/ps", "-ax", "-o", "pid=,rss=,pcpu="]).splitlines():
        parts = line.split()
        if len(parts) == 3:
            try:
                rows.append(
                    dict(
                        pid=int(parts[0]),
                        rss_bytes=int(parts[1]) * 1024,
                        cpu_percent=float(parts[2]),
                    )
                )
            except ValueError:
                continue
    rows.sort(key=lambda r: r["rss_bytes"], reverse=True)
    for row in rows[:limit]:
        row["identity"] = inspect_process(row["pid"])
    return rows[:limit]


def snapshot(home=None, volume=None):
    canonical = Path.home() / ".forgewright/runtime/admission"
    home = Path(
        home or os.environ.get("FORGEWRIGHT_ADMISSION_HOME") or canonical
    ).expanduser()
    admission = HostAdmission(home)
    try:
        status = admission.status()
        with admission.transaction():
            jobs = [
                dict(r)
                for r in admission.connection.execute(
                    "SELECT * FROM jobs WHERE state!='released'"
                )
            ]
        try:
            processes = correlate_processes(jobs, process_observations())
            process_error = None
        except (OSError, ValueError):
            processes, process_error = [], "sensor-unavailable"
        target = Path(volume or Path.cwd()).resolve(strict=True)
        try:
            disk = {
                "path": str(target),
                "device": target.stat().st_dev,
                "free_bytes": shutil.disk_usage(target).free,
            }
        except OSError:
            disk = {"path": str(target), "free_bytes": None}
        return {
            "schema": "forgewright-host-inventory/v1",
            "authority": authority_identity(home),
            "admission": status,
            "processes": processes,
            "process_error": process_error,
            "disk": disk,
            "coverage": "exact-owner-only; top-64-rss; no OS isolation",
        }
    finally:
        admission.close()


if __name__ == "__main__":
    print(json.dumps(snapshot(), indent=2))
