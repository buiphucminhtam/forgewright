#!/usr/bin/env python3
"""Supervise explicitly enrolled finite POSIX jobs over HostAdmission v1.

This is cooperative containment, not a sandbox. Only reviewed finite profiles
may be enrolled: daemonizing/reusing foreign processes is unsupported. Tokens
stay in private recovery journals. Stdout/stderr stream directly, never buffer.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import stat
import subprocess
import threading
import time
import uuid

from host_resources import command, inspect_process
from project_storage import (
    JobStorage,
    StorageError,
    measure_tree,
    preview_cleanup,
    apply_cleanup,
    cleanup_absence_confirmed,
)


class JobError(RuntimeError):
    pass


@dataclass(frozen=True)
class JobRequest:
    project: Path
    cwd: Path
    argv: list[str]
    profile: str
    memory_mib: int
    scratch_bytes: int
    disk_floor_bytes: int
    timeout: float = 1800
    wait_seconds: float = 120
    artifact_policy: dict | None = None
    disk_paths: tuple[Path, ...] = ()
    disk_devices: tuple[int, ...] = ()
    profile_digest: str | None = None
    native_request: str | None = None


def process_table():
    """One batch census; child birth excludes executable so exec stays owned.

    Darwin ps birth is second-resolution, like the existing owner inspector.
    This cooperative guard cannot authenticate a hostile same-user process.
    """
    rows = {}
    raw = command(["/bin/ps", "-ax", "-o", "pid=,ppid=,pgid=,stat=,lstart="])
    lines = [line for line in raw.splitlines() if line.strip()]
    if not lines:
        raise ValueError("empty-ps-output")
    for line in lines:
        parts = line.split()
        if len(parts) != 9:
            raise ValueError("malformed-ps-row")
        pid, parent, group = map(int, parts[:3])
        if not parts[3].startswith("Z"):
            birth = hashlib.sha256(
                (str(pid) + ":" + " ".join(parts[4:])).encode()
            ).hexdigest()
            rows[pid] = (parent, group, birth)
    return rows


def ancestry():
    table, result, pid = process_table(), {}, os.getpid()
    for _ in range(64):
        if pid <= 1:
            return result
        if pid in result or pid not in table:
            raise JobError("ancestry-unavailable")
        identity = inspect_process(pid)
        if not identity:
            raise JobError("ancestry-unavailable")
        result[pid] = identity
        pid = table[pid][0]
    raise JobError("ancestry-unavailable")


def reject_nested(admission, ancestors):
    with admission.transaction():
        rows = admission.connection.execute(
            "SELECT pid,identity FROM jobs WHERE kind='worker' AND state!='released'"
        ).fetchall()
        for row in rows:
            if (
                ancestors.get(row["pid"]) == row["identity"]
                and admission.inspector(row["pid"]) == row["identity"]
            ):
                raise JobError("nested-worker-unsupported")


def check_disk(paths, scratch_bytes, floor_bytes, probe=None, expected_devices=None):
    probe = probe or (lambda p: shutil.disk_usage(p).free)
    devices = set()
    for path in paths:
        try:
            path = Path(path).resolve(strict=True)
            device = path.stat().st_dev
            if (
                expected_devices is not None
                and expected_devices.get(str(path)) != device
            ):
                raise JobError("disk-volume-drift")
            if device in devices:
                continue
            devices.add(device)
            free = probe(path)
            if type(free) is not int or free < 0:
                raise OSError("invalid-disk-sensor")
        except OSError as error:
            raise JobError("disk-unavailable") from error
        if free - scratch_bytes < floor_bytes:
            raise JobError("insufficient-disk")


def write_journal(home, record):
    folder = home / "jobs"
    folder.mkdir(mode=0o700, exist_ok=True)
    info = folder.lstat()
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o077
    ):
        raise JobError("unsafe-journal")
    target = folder / (record["job_id"] + ".json")
    temp = folder / (record["job_id"] + "." + uuid.uuid4().hex + ".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(record, stream, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, target)
        directory = os.open(folder, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temp.unlink(missing_ok=True)


def validate(request):
    if os.name != "posix" or not Path("/bin/ps").exists():
        raise JobError("platform-unavailable")
    if (
        not isinstance(request.argv, list)
        or not request.argv
        or any(not isinstance(v, str) or not v or "\0" in v for v in request.argv)
        or type(request.memory_mib) is not int
        or not 64 <= request.memory_mib <= 8192
        or type(request.scratch_bytes) is not int
        or request.scratch_bytes < 0
        or type(request.disk_floor_bytes) is not int
        or request.disk_floor_bytes < 0
        or not 0 < request.timeout <= 86400
        or not 0 < request.wait_seconds <= 3600
    ):
        raise JobError("invalid-request")
    project, cwd = (
        request.project.resolve(strict=True),
        request.cwd.resolve(strict=True),
    )
    if not cwd.is_dir() or not cwd.is_relative_to(project):
        raise JobError("cwd-outside-project")
    if request.artifact_policy is not None:
        policy = request.artifact_policy
        keys = {
            "schema",
            "scratch_limit_bytes",
            "output_limit_bytes",
            "retained_limit_bytes",
            "retain_generations",
            "ttl_seconds",
            "project_limit_bytes",
        }
        if (
            not isinstance(policy, dict)
            or set(policy) != keys
            or policy.get("schema") != "forgewright-artifact-policy/v1"
            or any(
                type(v) is not int or v < 0 for k, v in policy.items() if k != "schema"
            )
            or not 1 <= policy["retain_generations"] <= 16
            or not 1 <= policy["ttl_seconds"] <= 30 * 86400
            or policy["project_limit_bytes"] <= 0
        ):
            raise JobError("invalid-artifact-policy")
    return project, cwd


def terminal_release_witness(record):
    leases = record.get("leases", [])
    no_spawn = (
        record.get("never_spawned") is True
        and record.get("child") is None
        and record.get("spawn_pending") is False
        and record.get("state") in {"cancelled", "rejected"}
        and [lease.get("kind") for lease in leases]
        in ([], ["worker"], ["worker", "heavy"])
    )
    if (
        record.get("state") not in {"quiescent", "cancelled", "rejected"}
        or record.get("spawn_pending")
        or (not no_spawn and (len(leases) != 2 or record.get("state") == "rejected"))
        or any(lease["state"] != "released" for lease in leases)
        or (record.get("storage") and record["storage"].get("quiescent") is not True)
    ):
        return None
    binding = {
        k: record.get(k)
        for k in (
            "job_id",
            "physical_workspace",
            "profile",
            "profile_digest",
            "owner_pid",
            "owner_identity",
            "argv_sha256",
            "requested_at",
            "child",
            "native_context",
        )
    }
    binding["leases"] = [
        {k: lease[k] for k in ("id", "kind", "state")} for lease in record["leases"]
    ]
    binding["storage_identity"] = {
        k: record.get("storage", {}).get(k)
        for k in ("nonce", "device", "inode", "path")
    }
    raw = json.dumps(binding, sort_keys=True, separators=(",", ":")).encode()
    return {
        "schema": "forgewright-terminal-release/v1",
        "binding": binding,
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def journal_released(admission, journal):
    expected = terminal_release_witness(journal)
    if expected is None or journal.get("terminal_release") != expected:
        return False
    rows = admission.connection.execute(
        "SELECT id,state FROM jobs WHERE run_id=?", (journal["job_id"],)
    ).fetchall()
    ids = {lease["id"] for lease in journal["leases"]}
    # Empty bounded history is accepted ONLY with the exact durable witness;
    # a live/quarantined contradictory row always blocks deletion.
    return all(row["id"] in ids and row["state"] == "released" for row in rows)


def storage_journals(admission, current):
    journals = {}
    for count, path in enumerate((admission.home / "jobs").glob("*.json")):
        if count >= 4096:
            raise StorageError("journal-census-incomplete")
        if path.stem == current["job_id"]:
            continue
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, "rb") as stream:
            info = os.fstat(stream.fileno())
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_uid != os.getuid()
                or info.st_mode & 0o077
                or info.st_size > 65536
            ):
                raise StorageError("unsafe-storage-journal")
            journal = json.load(stream)
        if (
            journal.get("physical_workspace") != current["physical_workspace"]
            or journal.get("profile") != current["profile"]
        ):
            continue
        storage = journal.get("storage")
        if not storage:
            continue
        if (
            storage.get("state") in {"retained", "cleanup_pending"}
            and storage.get("cleanup_intent")
            and journal_released(admission, journal)
            and cleanup_absence_confirmed(storage)
        ):
            storage.update(
                state="reclaimed",
                cleanup_recovery="confirmed-paths-absent",
                observed_reclaimed_bytes=None,
            )
            write_journal(admission.home, journal)
        if storage.get("state") in {"retained", "cleanup_pending", "quarantined"}:
            journals[journal["job_id"]] = journal
    return journals


def prepare_storage_capacity(admission, current, policy):
    from artifact_pins import artifact_lock, pins

    with artifact_lock(current["physical_workspace"]):
        journals = storage_journals(admission, current)
        if not journals:
            return
        if any(
            j["storage"]["state"] in {"cleanup_pending", "quarantined"}
            for j in journals.values()
        ):
            raise JobError("retention-cleanup-unconfirmed")
        charged, evictable = 0, []
        for journal in journals.values():
            storage = journal["storage"]
            size = storage.get(
                "output_bytes", storage.get("cleanup_intent", {}).get("expected_bytes")
            )
            if size is None:
                target = Path(storage.get("pending_path") or storage["path"])
                size = measure_tree(target)["bytes"]
            charged += size
            if (
                storage["state"] == "retained"
                and journal_released(admission, journal)
                and not storage.get("pinned")
                and not pins(storage)
            ):
                evictable.append((storage["created_at"], size))
        count = len(journals) + 1
        charged += policy["output_limit_bytes"]
        # The previous latest may be replaced only AFTER a successful new seal.
        # This feasibility check does not delete it before the build.
        for _, size in sorted(evictable):
            if (
                count <= policy["retain_generations"]
                and charged <= policy["retained_limit_bytes"]
            ):
                break
            count -= 1
            charged -= size
        if (
            count > policy["retain_generations"]
            or charged > policy["retained_limit_bytes"]
        ):
            raise JobError("retention-capacity-protected")


def retain_storage(admission, current, policy):
    """Use the same heavy lifetime and artifact lock as producers/consumers."""
    journals = storage_journals(admission, current)
    records = [current["storage"]] + [
        journal["storage"] for journal in journals.values()
    ]

    def released(job_id):
        return job_id in journals and journal_released(admission, journals[job_id])

    preview = preview_cleanup(
        records,
        max_keep=policy["retain_generations"],
        max_bytes=policy["retained_limit_bytes"],
        released=released,
    )
    for item in preview["items"]:
        single = preview_cleanup(
            [item["record"]],
            max_keep=0,
            max_bytes=0,
            released=released,
            protect_latest=False,
        )
        journal = journals[item["record"]["job_id"]]

        def persist_intent(value):
            journal["storage"] = value
            write_journal(admission.home, journal)

        try:
            apply_cleanup(single, released=released, on_intent=persist_intent)
        except StorageError as error:
            journal["storage"].update(
                state="cleanup_pending", pending_path=error.pending_path
            )
            write_journal(admission.home, journal)
            raise
        journal["storage"]["state"] = "reclaimed"
        write_journal(admission.home, journal)
    if not preview["quota_satisfied"]:
        raise StorageError("retention-quota-unsatisfied")


def revalidate_profile(admission, request):
    if request.profile_digest is None:
        return  # Trusted internal maintenance/library lane; never a native profile.
    from host_job_profiles import load_profile, validate_profile, ProfileError

    try:
        refreshed = validate_profile(
            load_profile(
                admission.home, request.project, request.profile, request.profile_digest
            )
        )
        if refreshed.disk_floor_bytes > request.disk_floor_bytes:
            raise JobError("host-disk-policy-changed")
    except (ProfileError, OSError, ValueError, TypeError, KeyError) as error:
        raise JobError("profile-drift") from error


def supervise(process, cancel, deadline, heartbeat):
    """Keep birth-bound descendants accounted; recheck before every signal.

    Profiles forbid daemonization. Census catches observed escapes, but cannot
    prove absence of an unobserved double-fork; never enroll those profiles.
    """
    known, uncertain, stopped = {}, False, False
    last_heartbeat = 0.0
    cleanup_deadline, kill_sent = None, False
    escaped_records = {}
    escaped_overflow = False
    census_complete = True

    def finish(quiescent_flag, stopped_flag):
        try:
            setattr(
                process,
                "_forgewright_supervision_diagnostics",
                {
                    "escaped_children": list(escaped_records.values()),
                    "escaped_overflow": escaped_overflow,
                    "census_complete": census_complete,
                },
            )
        except Exception:
            pass
        return quiescent_flag, stopped_flag

    def observe():
        nonlocal uncertain, escaped_overflow, census_complete
        table = process_table()
        if not table:
            census_complete = False
            uncertain = True
        descendants = (
            {process.pid}
            | {pid for pid, row in table.items() if row[1] == process.pid}
            | {
                pid
                for pid, birth in known.items()
                if pid in table and table[pid][2] == birth
            }
        )
        for _ in range(64):
            found = {pid for pid, row in table.items() if row[0] in descendants}
            if found <= descendants:
                break
            descendants |= found
        else:
            uncertain = True
        for pid in descendants:
            if pid in table:
                if pid in known and known[pid] != table[pid][2]:
                    uncertain = True
                else:
                    known[pid] = table[pid][2]
        for pid, birth in known.items():
            if pid in table and table[pid][2] == birth and table[pid][1] != process.pid:
                uncertain = True  # Observed child escaped its owned group.
                if pid not in escaped_records:
                    if len(escaped_records) < 8:
                        escaped_records[pid] = {
                            "pid": pid,
                            "ppid": table[pid][0],
                            "pgid": table[pid][1],
                            "birth": birth,
                        }
                    else:
                        escaped_overflow = True
        group = {pid: row for pid, row in table.items() if row[1] == process.pid}
        safe = all(known.get(pid) == row[2] for pid, row in group.items())
        if not safe:
            uncertain = True
        return group, safe

    def terminate(sig):
        nonlocal uncertain
        # Heartbeat/SQLite I/O may have blocked. Never reuse its earlier census
        # as authorization for this signal.
        group, safe = observe()
        if group and safe:
            try:
                os.killpg(process.pid, sig)
            except ProcessLookupError:
                pass
            except OSError:
                uncertain = True

    while True:
        now = time.monotonic()
        try:
            group, _ = observe()
            code = process.poll()
            if code is not None and not group:
                return finish(not uncertain, stopped)
            if now - last_heartbeat >= 1:
                try:
                    if heartbeat() is False:
                        stopped = True
                except Exception:
                    uncertain, stopped = True, True
                last_heartbeat = now
            if cancel.is_set() or now >= deadline:
                stopped = True
            if code is not None or stopped or uncertain:
                if cleanup_deadline is None:
                    cleanup_deadline = now + 2
                    terminate(signal.SIGTERM)
                if now >= cleanup_deadline:
                    if not kill_sent:
                        terminate(signal.SIGKILL)
                        kill_sent = True
                        cleanup_deadline = now + 2
                    else:
                        return finish(False, stopped)
        except (OSError, ValueError, subprocess.SubprocessError):
            census_complete = False
            return finish(False, stopped)
        time.sleep(0.1)


def run_job(admission, request, *, cancel=None):
    project, cwd = validate(request)
    from host_job_history import collect_history

    try:
        history = collect_history(admission)
    except (OSError, ValueError, KeyError, TypeError):
        history = {"status": "incomplete"}
    cancel = cancel or threading.Event()
    job = "job-" + uuid.uuid4().hex
    receipt = {
        "schema": "forgewright-host-job/v1",
        "job_id": job,
        "physical_workspace": str(project),
        "profile": request.profile,
        "profile_digest": request.profile_digest,
        "requested_at": time.time(),
        "state": "cancelled" if cancel.is_set() else "queued",
        "exit_code": None,
        "history_maintenance": history,
    }
    if cancel.is_set() and request.native_request is None:
        return receipt
    owner = os.getpid()
    identity = admission.inspector(owner)
    if not identity:
        raise JobError("owner-unavailable")
    record = {
        **receipt,
        "owner_pid": owner,
        "owner_identity": identity,
        "argv_sha256": hashlib.sha256(json.dumps(request.argv).encode()).hexdigest(),
        "scratch_bytes": request.scratch_bytes,
        "leases": [],
        "spawn_pending": False,
        "child": None,
    }
    if request.native_request is not None:
        from native_job_requests import claim
        from resource_enrollment import EnrollmentError

        try:
            context = claim(
                admission.home,
                request.native_request,
                project=project,
                profile=request.profile,
                profile_digest=request.profile_digest,
                job_id=job,
                owner_pid=owner,
                owner_identity=identity,
            )
        except EnrollmentError as error:
            raise JobError("native-request-unavailable") from error
        record["native_context"] = context
        receipt["native_context"] = context
    if cancel.is_set():
        receipt["state"] = "cancelled"
        record.update(receipt, never_spawned=True)
        record["terminal_release"] = terminal_release_witness(record)
        write_journal(admission.home, record)
        return receipt
    try:
        reject_nested(admission, ancestry())
    except JobError:
        record.update(state="rejected", never_spawned=True, exit_code=125)
        record["terminal_release"] = terminal_release_witness(record)
        write_journal(admission.home, record)
        raise
    uncertain, process, monitor_finished, storage, storage_finished = (
        False,
        None,
        False,
        None,
        False,
    )
    deadline = time.monotonic() + request.wait_seconds
    try:
        disk_paths = [cwd, admission.home, *request.disk_paths]
        expected_devices = {
            str(path.resolve(strict=True)): path.stat().st_dev for path in disk_paths
        }
        if request.disk_devices:
            if len(request.disk_devices) != len(request.disk_paths):
                raise JobError("invalid-volume-declaration")
            expected_devices.update(
                {
                    str(path): device
                    for path, device in zip(request.disk_paths, request.disk_devices)
                }
            )
        for kind, memory in [("worker", 64), ("heavy", request.memory_mib)]:
            if cancel.is_set():
                receipt["state"] = "cancelled"
                return receipt
            lease = {
                "id": job + "-" + kind,
                "token": secrets.token_hex(32),
                "state": "intent",
                "kind": kind,
            }
            record["leases"].append(lease)
            write_journal(admission.home, record)
            row = admission.enqueue(
                job_id=lease["id"],
                token=lease["token"],
                project_root=str(project),
                run_id=job,
                owner_pid=owner,
                kind=kind,
                memory_mib=memory,
                parent_lease_id=record["leases"][0]["id"] if kind == "heavy" else None,
            )
            while row["state"] == "queued":
                if cancel.is_set() or time.monotonic() >= deadline:
                    receipt["state"] = "cancelled"
                    return receipt
                cancel.wait(0.1)
                row = admission.poll(lease["id"], lease["token"], owner)
            if row["state"] != "active":
                raise JobError("admission-closed")
            lease["state"] = "active"
            write_journal(admission.home, record)
        revalidate_profile(admission, request)
        forecast = request.scratch_bytes
        if request.artifact_policy:
            policy = request.artifact_policy
            prepare_storage_capacity(admission, record, policy)
            forecast = max(
                forecast, policy["scratch_limit_bytes"] + policy["output_limit_bytes"]
            )
            usage = measure_tree(project)
            if usage["bytes"] + forecast > policy["project_limit_bytes"]:
                raise JobError("project-disk-budget-exceeded")
        check_disk(
            disk_paths,
            forecast,
            request.disk_floor_bytes,
            expected_devices=expected_devices,
        )
        if cancel.is_set():
            receipt["state"] = "cancelled"
            return receipt
        child_environment = None
        if request.artifact_policy:
            policy = request.artifact_policy
            record["storage"] = {
                "state": "preparing",
                "path": str(project / ".forgewright/runtime/build-jobs" / job),
                "quiescent": True,
            }
            write_journal(admission.home, record)

            def persist_storage_intent(value):
                record["storage"] = dict(
                    value,
                    profile=request.profile,
                    profile_digest=request.profile_digest,
                )
                write_journal(admission.home, record)

            storage = JobStorage(
                project,
                job,
                scratch_limit=policy["scratch_limit_bytes"],
                output_limit=policy["output_limit_bytes"],
                ttl_seconds=policy["ttl_seconds"],
                on_cleanup_intent=persist_storage_intent,
            )
            record["storage"] = dict(
                storage.base,
                profile=request.profile,
                profile_digest=request.profile_digest,
            )
            write_journal(admission.home, record)
            child_environment = {
                **os.environ,
                "TMPDIR": str(storage.scratch),
                "TMP": str(storage.scratch),
                "TEMP": str(storage.scratch),
                "FORGEWRIGHT_OUTPUT_DIR": str(storage.output),
                "FORGEWRIGHT_JOB_ADMISSION_HOME": str(admission.home.resolve()),
            }
        record["spawn_pending"] = True
        write_journal(admission.home, record)
        if cancel.is_set():
            record["spawn_pending"] = False
            receipt["state"] = "cancelled"
            return receipt
        revalidate_profile(admission, request)
        uncertain = True
        try:
            # Inherited streams have bounded supervisor memory and preserve TTY.
            process = subprocess.Popen(
                request.argv, cwd=cwd, start_new_session=True, env=child_environment
            )
        except OSError as error:
            uncertain = False
            record["spawn_pending"] = False
            raise JobError("spawn-failed") from error
        record["child"] = {"pid": process.pid, "identity": inspect_process(process.pid)}
        record["spawn_pending"] = False
        record["state"] = "running"
        write_journal(admission.home, record)

        budget_error = None
        census_failures = 0

        def heartbeat():
            nonlocal budget_error, census_failures
            for lease in record["leases"]:
                if (
                    admission.poll(lease["id"], lease["token"], owner)["state"]
                    != "active"
                ):
                    raise JobError("lease-lost")
            try:
                check_disk(
                    disk_paths,
                    0,
                    request.disk_floor_bytes,
                    expected_devices=expected_devices,
                )
                if storage:
                    storage.check(active=True)
            except (JobError, StorageError) as error:
                if str(error) in {
                    "storage-drift",
                    "storage-census-incomplete",
                    "storage-unavailable",
                }:
                    census_failures += 1
                    if census_failures < 2:
                        return True
                budget_error = str(error)
                return False
            census_failures = 0
            return True

        quiescent, stopped = supervise(
            process, cancel, time.monotonic() + request.timeout, heartbeat
        )
        supervision_diagnostics = getattr(
            process, "_forgewright_supervision_diagnostics", None
        ) or {}
        monitor_finished = True
        uncertain = not quiescent
        if supervision_diagnostics.get("escaped_children") or not supervision_diagnostics.get(
            "census_complete", True
        ):
            receipt["supervision_diagnostics"] = supervision_diagnostics
        receipt.update(
            state="quarantined"
            if uncertain
            else ("cancelled" if stopped else "quiescent"),
            exit_code=process.poll(),
        )
        if budget_error:
            receipt["storage_error"] = budget_error
            receipt["exit_code"] = 125
        if storage:
            from artifact_pins import artifact_lock

            storage_finished = True
            try:
                with artifact_lock(project):
                    try:
                        sealed = storage.finish(
                            quiescent=not uncertain,
                            success=not uncertain
                            and not stopped
                            and process.returncode == 0,
                        )
                        receipt["storage"] = dict(
                            sealed,
                            profile=request.profile,
                            profile_digest=request.profile_digest,
                        )
                    except StorageError as error:
                        receipt["storage"] = dict(
                            record.get("storage", storage.base),
                            quiescent=not uncertain,
                            state="reclaimed" if error.reclaimed else "cleanup_pending",
                            pending_path=error.pending_path,
                        )
                        receipt["storage_error"] = str(error)
                        receipt["exit_code"] = 125
                    record.update(receipt)
                    write_journal(admission.home, record)
                    if receipt["storage"]["state"] == "retained":
                        try:
                            retain_storage(admission, record, request.artifact_policy)
                        except StorageError as error:
                            # Keep the newly sealed generation's ownership when
                            # reclaiming an older generation fails.
                            receipt["storage_error"] = str(error)
                            receipt["exit_code"] = 125
            except StorageError as error:
                # Failure to acquire the lock must not leave a terminal job's
                # owned bytes in the uncharged producer-only "active" state.
                receipt["storage"] = dict(
                    record.get("storage", storage.base),
                    quiescent=not uncertain,
                    state="cleanup_pending",
                    pending_path=error.pending_path,
                )
                receipt.update(storage_error=str(error), exit_code=125)
        return receipt
    finally:
        if uncertain and process is not None and not monitor_finished:
            # On journal/monitor exceptions attempt bounded owned cleanup, but
            # keep uncertainty even if a later group snapshot appears empty.
            cleanup = threading.Event()
            cleanup.set()
            supervise(process, cleanup, time.monotonic(), lambda: None)
        if storage and not storage_finished:
            try:
                receipt["storage"] = storage.finish(
                    quiescent=not uncertain, success=False
                )
            except StorageError as error:
                receipt["storage"] = dict(
                    record.get("storage", storage.base),
                    quiescent=not uncertain,
                    state="cleanup_pending",
                    pending_path=error.pending_path,
                )
        for lease in reversed(record["leases"]):
            try:
                lease["state"] = admission.release(
                    lease["id"], lease["token"], owner, quiescent=not uncertain
                )["state"]
            except Exception:
                uncertain = True
                lease["state"] = "uncertain"
        if uncertain:
            receipt["state"] = "quarantined"
        elif process is None:
            record["never_spawned"] = True
            if receipt["state"] not in {"cancelled", "rejected"}:
                receipt.update(state="rejected", exit_code=125)
            if record.get("storage") and storage is None:
                receipt["storage"] = dict(record["storage"], state="cleanup_pending")
        record.update(receipt)
        record["spawn_pending"] = uncertain and record["spawn_pending"]
        record["terminal_release"] = terminal_release_witness(record)
        write_journal(admission.home, record)
