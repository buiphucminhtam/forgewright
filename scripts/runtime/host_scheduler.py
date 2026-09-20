"""Transactional application of the pure host capacity policy."""

from host_admission_store import AdmissionError, AdmissionStore, MAX_QUEUE
from host_capacity import select_jobs
from host_resources import MIB
import os
import resource
import sys
import time


class HostScheduler(AdmissionStore):
    def pressure(self):
        sample = self.sensor()
        if (
            sample.pressure not in {"normal", "warning", "critical", "unknown"}
            or sample.total_bytes < 0
            or sample.available_bytes < 0
        ):
            raise AdmissionError("telemetry-invalid")
        now = self.now()
        if sample.pressure == "critical" or sample.available_bytes < sample.headroom:
            self.set_meta("blocked_until", now + 15)
        if sample.pressure != "normal":
            self.set_meta("restricted_until", now + 15)
        paused = now < self.meta("blocked_until") or sample.total_bytes <= 0
        cap = min(sample.worker_limit, 1 if now < self.meta("restricted_until") else 2)
        return sample, cap, paused

    def schedule(self):
        sample, capacity, paused = self.pressure()
        if paused:
            self.connection.execute(
                "UPDATE jobs SET reason='memory-pressure' WHERE state='queued'"
            )
            return
        now = self.now()
        queue = self.connection.execute("""SELECT jobs.*,COALESCE(fairness.last_grant,0) AS service
            FROM jobs LEFT JOIN fairness ON fairness.project=(jobs.kind || ':' || jobs.project)
            WHERE jobs.state='queued' ORDER BY service,jobs.created,jobs.id""").fetchall()
        active = self.connection.execute(
            "SELECT * FROM jobs WHERE state IN ('active','quarantined')"
        ).fetchall()
        grants, cancelled, reasons = select_jobs(sample, queue, active, capacity)
        for job in cancelled:
            self.connection.execute(
                "UPDATE jobs SET state='released',reason='parent-unavailable',touched=? WHERE id=?",
                (now, job),
            )
        for job, reason in reasons.items():
            self.connection.execute(
                "UPDATE jobs SET reason=? WHERE id=?", (reason, job)
            )
        rows = {row["id"]: row for row in queue}
        for job in grants:
            self.connection.execute(
                "UPDATE jobs SET state='active',reason='',granted=?,touched=? WHERE id=? AND state='queued'",
                (now, now, job),
            )
            sequence = self.meta("sequence") + 1
            self.set_meta("sequence", sequence)
            # Separate service history for each resource class; worker admission
            # order must not let one project monopolize the heavy queue.
            fairness_key = rows[job]["kind"] + ":" + rows[job]["project"]
            self.connection.execute(
                "INSERT INTO fairness(project,last_grant) VALUES(?,?) ON CONFLICT(project) DO UPDATE SET last_grant=excluded.last_grant",
                (fairness_key, sequence),
            )

    def status(self):
        with self.transaction():
            self.refresh()
            sample, cap, paused = self.pressure()
            rows = self.connection.execute(
                "SELECT * FROM jobs WHERE state!='released' ORDER BY created LIMIT ?",
                (MAX_QUEUE,),
            ).fetchall()
            return {
                "schema": "forgewright-host-admission/v1",
                "active_workers": sum(
                    r["kind"] == "worker" and r["state"] == "active" for r in rows
                ),
                "active_heavy": sum(
                    r["kind"] == "heavy" and r["state"] == "active" for r in rows
                ),
                "quarantined": sum(r["state"] == "quarantined" for r in rows),
                "queued": sum(r["state"] == "queued" for r in rows),
                "worker_limit": cap,
                "heavy_limit": 1,
                "paused": paused,
                "pressure": sample.pressure,
                "memory_source": sample.source,
                "availableMiB": sample.available_bytes // MIB,
                "reservedMiB": sum(
                    r["memory_bytes"]
                    for r in rows
                    if r["state"] in {"active", "quarantined"}
                )
                // MIB,
                "jobs": [self.describe(r["id"]) for r in rows],
                "coordinator": {
                    "pid": os.getpid(),
                    "cpuSeconds": time.process_time(),
                    "peakRssMiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                    / (MIB if sys.platform == "darwin" else 1024),
                },
            }
