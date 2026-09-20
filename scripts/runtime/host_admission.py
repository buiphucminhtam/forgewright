"""Caller-owned admission over shared resource transactions; no job execution."""

from pathlib import Path
import re
from host_admission_store import AdmissionError, MAX_PER_PROJECT, MAX_QUEUE
from host_resources import MIB, MemorySnapshot as MemorySnapshot
from host_scheduler import HostScheduler

SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")


class HostAdmission(HostScheduler):
    def enqueue(
        self,
        *,
        job_id,
        token,
        project_root,
        run_id,
        owner_pid,
        kind="worker",
        memory_mib=256,
        parent_lease_id=None,
    ):
        if (
            not isinstance(job_id, str)
            or not SAFE_ID.fullmatch(job_id)
            or not isinstance(run_id, str)
            or not SAFE_ID.fullmatch(run_id)
        ):
            raise AdmissionError("invalid-job")
        if (
            kind not in {"worker", "heavy"}
            or type(memory_mib) is not int
            or not 64 <= memory_mib <= 8192
        ):
            raise AdmissionError("invalid-resource-request")
        hashed_token = self.token_digest(token)
        identity = self.inspector(owner_pid)
        if not identity:
            raise AdmissionError("owner-unavailable")
        project = Path(project_root).resolve(strict=True)
        if (
            not project.is_dir()
            or project == Path.home().resolve()
            or project == Path(project.anchor)
        ):
            raise AdmissionError("invalid-project")
        project = str(project)
        with self.transaction():
            self.refresh()
            if self.connection.execute(
                "SELECT 1 FROM jobs WHERE id=?", (job_id,)
            ).fetchone():
                raise AdmissionError("duplicate-job")
            count = self.connection.execute(
                "SELECT COUNT(*) FROM jobs WHERE state!='released'"
            ).fetchone()[0]
            project_count = self.connection.execute(
                "SELECT COUNT(*) FROM jobs WHERE state!='released' AND project=?",
                (project,),
            ).fetchone()[0]
            if count >= MAX_QUEUE or project_count >= MAX_PER_PROJECT:
                raise AdmissionError("queue-full")
            if kind == "heavy":
                parent = self.connection.execute(
                    "SELECT * FROM jobs WHERE id=?", (parent_lease_id,)
                ).fetchone()
                if (
                    not parent
                    or parent["kind"] != "worker"
                    or parent["state"] != "active"
                    or parent["pid"] != owner_pid
                    or parent["identity"] != identity
                    or parent["project"] != project
                    or parent["run_id"] != run_id
                ):
                    raise AdmissionError("invalid-parent")
            elif parent_lease_id is not None:
                raise AdmissionError("invalid-parent")
            now = self.now()
            values = (
                job_id,
                hashed_token,
                project,
                run_id,
                kind,
                owner_pid,
                identity,
                memory_mib * MIB,
                parent_lease_id,
                now,
                now,
            )
            self.connection.execute(
                "INSERT INTO jobs(id,token_digest,project,run_id,kind,pid,identity,memory_bytes,parent_id,state,created,touched) VALUES(?,?,?,?,?,?,?,?,?,'queued',?,?)",
                values,
            )
            self.schedule()
            return self.describe(job_id)

    def poll(self, job_id, token, owner_pid):
        with self.transaction():
            row = self.owned(job_id, token, owner_pid)
            if row["state"] == "queued":
                self.refresh()
                self.schedule()
            self.connection.execute(
                "UPDATE jobs SET touched=? WHERE id=?", (self.now(), job_id)
            )
            return self.describe(job_id)

    def release(self, job_id, token, owner_pid, *, quiescent=True):
        if type(quiescent) is not bool:
            raise AdmissionError("invalid-quiescence")
        with self.transaction():
            row = self.owned(job_id, token, owner_pid)
            if row["state"] == "quarantined" and quiescent:
                raise AdmissionError("reconciliation-required")
            children = self.connection.execute(
                "SELECT id FROM jobs WHERE parent_id=? AND state IN ('active','quarantined')",
                (job_id,),
            ).fetchall()
            if children and quiescent:
                raise AdmissionError("children-active")
            state = (
                "released"
                if quiescent or row["state"] in {"queued", "released"}
                else "quarantined"
            )
            reason = "" if state == "released" else "quiescence-unconfirmed"
            self.connection.execute(
                "UPDATE jobs SET state=?,reason=?,touched=? WHERE id=?",
                (state, reason, self.now(), job_id),
            )
            if state == "quarantined":
                self.connection.execute(
                    "UPDATE jobs SET state='quarantined',reason='parent-uncertain',touched=? WHERE parent_id=? AND state='active'",
                    (self.now(), job_id),
                )
            self.connection.execute(
                "UPDATE jobs SET state='released',reason='parent-closed',touched=? WHERE parent_id=? AND state='queued'",
                (self.now(), job_id),
            )
            return self.describe(job_id)
