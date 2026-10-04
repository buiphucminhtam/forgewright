"""Transactional application of the pure host capacity policy."""

from host_admission_store import AdmissionError, AdmissionStore, MAX_QUEUE
from host_capacity import select_jobs
from host_resources import MIB
from dataclasses import replace
import os
import math
import resource
import sys
import time


class HostScheduler(AdmissionStore):
    def pressure(self):
        sample = self.sensor()
        if sample.source != "darwin-vm-stat+memorystatus":
            self.set_meta("estimate_previous_valid", 0)
        if (
            sample.pressure not in {"normal", "warning", "critical", "unknown"}
            or sample.total_bytes < 0
            or sample.available_bytes < 0
            or sample.reclaimable_estimate_bytes < 0
            or (sample.swap_total_bytes is not None and sample.swap_total_bytes < 0)
            or (
                sample.load_ratio is not None
                and (not math.isfinite(sample.load_ratio) or sample.load_ratio < 0)
            )
        ):
            self.set_meta("estimate_previous_valid", 0)
            raise AdmissionError("telemetry-invalid")
        now = self.now()
        if sample.load_ratio is not None and sample.load_ratio >= 1.0:
            self.set_meta("load_blocked_until", now + 15)
        estimated = sample.source == "darwin-vm-stat+memorystatus"
        if estimated:
            previous_at = self.meta("swap_sample_at")
            previous_swap = self.meta("swap_sample_bytes")
            elapsed = now - previous_at
            swap_rate = self.meta("swap_rate")
            if (
                previous_at
                and 1 <= elapsed <= 30
                and sample.swap_total_bytes is not None
                and sample.swap_total_bytes >= previous_swap
            ):
                swap_rate = (sample.swap_total_bytes - previous_swap) / elapsed
            valid = (
                sample.swap_total_bytes is not None
                and sample.load_ratio is not None
                and sample.load_ratio < 1.0
                and sample.pressure in {"normal", "warning"}
            )
            reset_observation = (
                not valid
                or not self.meta("estimate_previous_valid")
                or not previous_at
                or now < previous_at
                or now - previous_at > 30
                or sample.swap_total_bytes < previous_swap
                or (
                    sample.pressure == "warning"
                    and not self.meta("estimate_was_warning")
                )
            )
            if reset_observation:
                self.set_meta("estimate_quiet_since", now)
                self.set_meta("swap_window_at", now)
                self.set_meta("swap_window_bytes", sample.swap_total_bytes or 0)
                swap_rate = -1
            self.set_meta("swap_rate", swap_rate)
            self.set_meta("estimate_previous_valid", int(valid))
            self.set_meta("estimate_was_warning", int(sample.pressure == "warning"))
            if (
                reset_observation
                or not previous_at
                or now - previous_at >= 1
                or now < previous_at
            ):
                self.set_meta("swap_sample_at", now)
                self.set_meta("swap_sample_bytes", sample.swap_total_bytes or 0)
            ready = valid and now - self.meta("estimate_quiet_since") >= 15
            window_elapsed = now - self.meta("swap_window_at")
            average_rate = 0
            if valid and 0 < window_elapsed <= 30:
                average_rate = (
                    max(0, sample.swap_total_bytes - self.meta("swap_window_bytes"))
                    / window_elapsed
                )
            elif window_elapsed > 30:
                self.set_meta("swap_window_at", now)
                self.set_meta("swap_window_bytes", sample.swap_total_bytes or 0)
            # Swap I/O is not allocated RAM. This projection is a conservative
            # reserve against uncertain cache reclaimability, not an OS metric.
            swap_reserve = math.ceil(max(0, swap_rate, average_rate) * 15)
            self.set_meta("swap_reserve_bytes", swap_reserve)
            # Warning restricts concurrency and increases headroom; it is not
            # a permanent veto. Require fresh non-critical/low-load observations.
            # Monotonic swap activity spends cache credit instead of vetoing it.
            if not ready:
                self.set_meta("blocked_until", now)
                return sample, 1, True
            sample = replace(
                sample,
                immediate_bytes=sample.available_bytes,
                available_bytes=min(
                    sample.total_bytes,
                    sample.available_bytes
                    + max(0, sample.reclaimable_estimate_bytes - swap_reserve),
                ),
            )
        if (
            sample.pressure in {"critical", "unknown"}
            or sample.available_bytes < sample.headroom
        ):
            self.set_meta("blocked_until", now + 15)
        if sample.pressure != "normal":
            self.set_meta("restricted_until", now + 15)
        paused = (
            now < self.meta("blocked_until")
            or now < self.meta("load_blocked_until")
            or sample.total_bytes <= 0
        )
        cap = min(
            sample.worker_limit,
            1 if estimated or now < self.meta("restricted_until") else 2,
        )
        return sample, cap, paused

    def schedule(self):
        sample, capacity, paused = self.pressure()
        if paused:
            reason = (
                "host-load"
                if self.now() < self.meta("load_blocked_until")
                else "insufficient-memory"
                if sample.pressure in {"normal", "warning"}
                and sample.available_bytes < sample.headroom
                else "memory-pressure"
            )
            self.connection.execute(
                "UPDATE jobs SET reason=? WHERE state='queued'", (reason,)
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
                "load_ratio": sample.load_ratio,
                "availableMiB": sample.available_bytes // MIB,
                "immediateMiB": (
                    sample.immediate_bytes
                    if sample.immediate_bytes is not None
                    else sample.available_bytes
                )
                // MIB,
                "reclaimableEstimateMiB": sample.reclaimable_estimate_bytes // MIB,
                "swapCumulativeBytes": sample.swap_total_bytes,
                "swapReserveMiB": int(self.meta("swap_reserve_bytes") // MIB),
                "swapBytesPerSecond": self.meta("swap_rate")
                if sample.swap_total_bytes is not None and self.meta("swap_rate") >= 0
                else None,
                "headroomMiB": sample.headroom // MIB,
                "memoryUncertainty": "discounted-file-cache"
                if sample.source == "darwin-vm-stat+memorystatus"
                else "os-estimate",
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
