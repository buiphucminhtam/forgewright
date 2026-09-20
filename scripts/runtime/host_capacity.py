"""Pure selection of resource slots explicitly requested by a local project.

No process spawning, network, execution, privilege changes or credential access.
The caller must hold the shared admission transaction and enforce every denial.
"""

from __future__ import annotations


def select_jobs(sample, queue, active, worker_limit):
    workers = sum(row["kind"] == "worker" for row in active)
    heavy = sum(row["kind"] == "heavy" for row in active)
    reserved = sum(row["memory_bytes"] for row in active)
    projects = {row["project"] for row in active if row["kind"] == "worker"}
    parents = {
        row["id"]
        for row in active
        if row["kind"] == "worker" and row["state"] == "active"
    }
    grants, cancelled, reasons = [], [], {}
    for row in queue:
        if row["kind"] == "worker":
            eligible = workers < worker_limit and row["project"] not in projects
        else:
            if row["parent_id"] not in parents:
                cancelled.append(row["id"])
                continue
            eligible = heavy < 1
        reason = "capacity"
        if sample.available_bytes - reserved - row["memory_bytes"] < sample.headroom:
            eligible, reason = False, "insufficient-memory"
        if not eligible:
            reasons[row["id"]] = reason
            continue
        grants.append(row["id"])
        reserved += row["memory_bytes"]
        if row["kind"] == "worker":
            workers += 1
            projects.add(row["project"])
        else:
            heavy += 1
    return grants, cancelled, reasons
