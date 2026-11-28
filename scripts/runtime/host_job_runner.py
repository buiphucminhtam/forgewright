#!/usr/bin/env python3
"""Supervise explicitly enrolled finite jobs over HostAdmission v1.

This is cooperative containment, not a sandbox. Only reviewed finite profiles
may be enrolled: daemonizing/reusing foreign processes is unsupported. Tokens
stay in private recovery journals. Stdout/stderr stream directly, never buffer.
"""

from __future__ import annotations

from dataclasses import dataclass
import errno
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import threading
import time
import uuid

from host_resources import command, inspect_process
from windows_job_client import WindowsJobClient, CompletionError
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
    if os.name == "nt":
        from windows_processes import NativeProcesses

        return NativeProcesses().snapshot()
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


class AncestorIdentities(dict):
    boundary_birth = None


def _windows_process_identity(pid):
    from windows_processes import NativeProcesses

    raw = NativeProcesses().identity_text(pid)
    birth = int(raw.split("\n", 2)[1]) - 504911232000000000
    return hashlib.sha256(raw.encode()).hexdigest(), birth


def windows_ancestry(table, pid):
    result = AncestorIdentities()
    for _ in range(64):
        if pid in (0, 4):
            # A walk reaching a terminal PID is not proof: UTC rollback can
            # conceal reuse of an intermediate parent PID. Certify every edge.
            return result, _windows_complete_ancestry_proof(table, result)
        if pid in result or pid not in table:
            raise JobError("ancestry-unavailable")
        parent, _group, birth = table[pid]
        if type(birth) is not int or birth <= 0:
            raise JobError("ancestry-unavailable")
        try:
            identity, actual_birth = _windows_process_identity(pid)
        except (OSError, ValueError) as error:
            raise JobError("ancestry-unavailable") from error
        if not identity or actual_birth != birth:
            raise JobError("ancestry-unavailable")
        result[pid] = identity
        result.boundary_birth = birth
        if parent not in (0, 4):
            if parent not in table:
                return result, False
            parent_birth = table[parent][2]
            if type(parent_birth) is not int or parent_birth <= 0:
                raise JobError("ancestry-unavailable")
            if parent_birth > birth:
                return result, False
        pid = parent
    raise JobError("ancestry-unavailable")


def ancestry():
    try:
        table = process_table()
    except (OSError, ValueError) as error:
        raise JobError("ancestry-unavailable") from error
    result, pid = {}, os.getpid()
    if os.name == "nt":
        return windows_ancestry(table, pid)
    for _ in range(64):
        if pid <= 1 or (os.name == "nt" and pid == 4):
            return result, True
        if pid in result or pid not in table:
            raise JobError("ancestry-unavailable")
        identity = inspect_process(pid)
        if not identity:
            raise JobError("ancestry-unavailable")
        result[pid] = identity
        pid = table[pid][0]
    raise JobError("ancestry-unavailable")


@dataclass(frozen=True)
class WindowsLineage:
    pid: int
    parent: int
    identity: str
    boot: int
    sequence: int
    interrupt: int
    unbiased: int


def _windows_read_lineage(native, handle, pid):
    """Same-handle identity and documented native telemetry; no UTC ordering."""
    import ctypes
    from ctypes import wintypes as w

    class Basic(ctypes.Structure):
        _fields_ = [
            ("status", w.LONG),
            ("peb", ctypes.c_void_p),
            ("affinity", ctypes.c_size_t),
            ("priority", w.LONG),
            ("pid", ctypes.c_size_t),
            ("parent", ctypes.c_size_t),
        ]

    class Telemetry(ctypes.Structure):
        _fields_ = (
            [("size", w.ULONG), ("pid", w.ULONG)]
            + [
                (name, ctypes.c_uint64)
                for name in (
                    "key",
                    "utc",
                    "interrupt",
                    "unbiased",
                    "sequence",
                    "session_created",
                )
            ]
            + [
                (name, w.ULONG)
                for name in (
                    "session",
                    "boot",
                    "checksum",
                    "stamp",
                    "sid",
                    "image",
                    "package",
                    "app",
                    "command",
                )
            ]
        )

    # Both information classes are documented. Future/unsupported layouts are
    # uncertainty, never a reason to fall back to wall-clock birth ordering.
    query = ctypes.WinDLL("ntdll").NtQueryInformationProcess
    query.argtypes = [
        w.HANDLE,
        w.ULONG,
        ctypes.c_void_p,
        w.ULONG,
        ctypes.POINTER(w.ULONG),
    ]
    query.restype = w.LONG
    if native.api.WaitForSingleObject(handle, 0) != 258:
        raise ValueError("lineage process not alive")
    basic, size = Basic(), w.ULONG()
    if (
        query(handle, 0, ctypes.byref(basic), ctypes.sizeof(basic), ctypes.byref(size))
        != 0
        or size.value != ctypes.sizeof(basic)
        or basic.pid != pid
    ):
        raise ValueError("lineage basic information unavailable")
    buffer = ctypes.create_string_buffer(65536)
    if query(
        handle, 64, buffer, len(buffer), ctypes.byref(size)
    ) != 0 or not ctypes.sizeof(Telemetry) <= size.value <= len(buffer):
        raise ValueError("lineage telemetry unavailable")
    metadata = Telemetry.from_buffer_copy(buffer)
    birth = native.birth(handle)
    if (
        metadata.size != ctypes.sizeof(Telemetry)
        or metadata.pid != pid
        or metadata.utc != birth
        or not metadata.sequence
        or not metadata.interrupt
        or not metadata.unbiased
    ):
        raise ValueError("lineage telemetry invalid")
    image = ctypes.create_unicode_buffer(32768)
    length = w.DWORD(len(image))
    if (
        not native.api.QueryFullProcessImageNameW(
            handle, 0, image, ctypes.byref(length)
        )
        or not 0 < length.value < len(image)
        or native.api.WaitForSingleObject(handle, 0) != 258
    ):
        raise ValueError("lineage identity unavailable")
    raw = f"{pid}\n{birth + 504911232000000000}\n{image.value}"
    return WindowsLineage(
        pid,
        int(basic.parent),
        hashlib.sha256(raw.encode()).hexdigest(),
        metadata.boot,
        metadata.sequence,
        metadata.interrupt,
        metadata.unbiased,
    )


def _windows_are_siblings(caller, worker, parent):
    """Positive parent-edge proof, not an age-based exemption for a worker."""
    observations = (caller, worker, parent)
    if (
        any(type(value) is not WindowsLineage for value in observations)
        or len({value.pid for value in observations}) != 3
        or any(value.pid <= 4 for value in observations)
        or caller.parent != parent.pid
        or worker.parent != parent.pid
        or parent.parent in (caller.pid, worker.pid)
        or len({value.boot for value in observations}) != 1
        or len({value.sequence for value in observations}) != 3
        or any(value.sequence <= 0 for value in observations)
    ):
        return False
    # The retained parent object must have existed before both children. Two
    # nonadjustable counters reject a recycled parent PID even after UTC rollback.
    # Equality is insufficient at the native counter's resolution. Sequence
    # numbers are used only for identity uniqueness, never ordering.
    return all(
        0 < getattr(parent, field) < getattr(child, field)
        for field in ("interrupt", "unbiased")
        for child in (caller, worker)
    )


def _windows_complete_ancestry_proof(table, ancestors):
    """Certify the entire walked chain through simultaneously held objects."""
    if os.name != "nt" or not ancestors or len(ancestors) > 64:
        return False
    from contextlib import ExitStack
    from windows_processes import NativeProcesses

    try:
        native = NativeProcesses()
        with ExitStack() as stack:
            handles, observations = {}, {}
            for pid, identity in ancestors.items():
                handles[pid] = stack.enter_context(
                    native.process(pid, synchronize=True)
                )
                observed = _windows_read_lineage(native, handles[pid], pid)
                if observed.identity != identity or observed.parent != table[pid][0]:
                    return False
                observations[pid] = observed
            for child in observations.values():
                if child.parent in (0, 4):
                    continue  # Same-handle basic information confirms the terminal edge.
                parent = observations.get(child.parent)
                if (
                    parent is None
                    or parent.boot != child.boot
                    or parent.sequence == child.sequence
                    or not 0 < parent.interrupt < child.interrupt
                    or not 0 < parent.unbiased < child.unbiased
                ):
                    return False
            for pid, handle in handles.items():
                if _windows_read_lineage(native, handle, pid) != observations[pid]:
                    return False
            return True
    except (OSError, ValueError, AttributeError, KeyError):
        return False


def _windows_independent_sibling(worker_pid, worker_identity, caller_identity):
    if (
        os.name != "nt"
        or not caller_identity
        or not worker_identity
        or type(worker_pid) is not int
        or worker_pid <= 4
        or worker_pid == os.getpid()
    ):
        return False
    from contextlib import ExitStack
    from windows_processes import NativeProcesses

    try:
        native = NativeProcesses()
        with ExitStack() as stack:
            caller_pid = os.getpid()
            caller_handle = stack.enter_context(
                native.process(caller_pid, synchronize=True)
            )
            worker_handle = stack.enter_context(
                native.process(worker_pid, synchronize=True)
            )
            caller = _windows_read_lineage(native, caller_handle, caller_pid)
            worker = _windows_read_lineage(native, worker_handle, worker_pid)
            if (
                caller.identity != caller_identity
                or worker.identity != worker_identity
                or caller.parent != worker.parent
                or caller.parent in (0, 4, caller_pid, worker_pid)
            ):
                return False
            parent_handle = stack.enter_context(
                native.process(caller.parent, synchronize=True)
            )
            parent = _windows_read_lineage(native, parent_handle, caller.parent)
            if not _windows_are_siblings(caller, worker, parent):
                return False
            # Hold all three objects until the final observations agree. A
            # disappearing process, API error or close failure invalidates proof.
            for handle, original in (
                (caller_handle, caller),
                (worker_handle, worker),
                (parent_handle, parent),
            ):
                if _windows_read_lineage(native, handle, original.pid) != original:
                    return False
            return True
    except (OSError, ValueError, AttributeError):
        return False


def reject_nested(admission, ancestors, *, complete=True):
    with admission.transaction():
        rows = admission.connection.execute(
            "SELECT pid,identity FROM jobs WHERE kind='worker' AND state!='released'"
        ).fetchall()
        for row in rows:
            if ancestors.get(row["pid"]) == row["identity"]:
                observed = admission.inspector(row["pid"])
                if observed is None:
                    raise JobError("ancestry-unavailable")
                if observed == row["identity"]:
                    raise JobError("nested-worker-unsupported")
        if not complete and rows:
            # Windows creation times are wall-clock values, not monotonic
            # lineage evidence. Clock rollback can make a real ancestor look
            # younger; unresolved unreleased workers must remain blocking.
            for row in rows:
                if not _windows_independent_sibling(
                    row["pid"], row["identity"], ancestors.get(os.getpid())
                ):
                    raise JobError("ancestry-incomplete")


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
    if not stat.S_ISDIR(info.st_mode) or (
        hasattr(os, "getuid") and (info.st_uid != os.getuid() or info.st_mode & 0o077)
    ):
        raise JobError("unsafe-journal")
    target = folder / (record["job_id"] + ".json")
    if os.name == "nt":
        from windows_security import is_private_path

        scripts_root = str(Path(__file__).resolve().parents[1])
        if scripts_root not in sys.path:
            sys.path.insert(0, scripts_root)
        from lite.windows_secure_io import atomic_write_bytes

        try:
            if not is_private_path(home, confidential=True) or not is_private_path(
                folder, confidential=True
            ):
                raise JobError("unsafe-journal")
            if target.exists() and not is_private_path(target, confidential=True):
                raise JobError("unsafe-journal")

            def validate_temporary(_descriptor, path):
                if not is_private_path(path, confidential=True):
                    raise JobError("unsafe-journal")

            deadline = time.monotonic() + 1
            while True:
                try:
                    atomic_write_bytes(
                        home,
                        target,
                        json.dumps(record, separators=(",", ":")).encode(),
                        validate_temporary=validate_temporary,
                    )
                    break
                except OSError as error:
                    # Other pinned readers/writers can briefly deny a rename.
                    # Release every anchor/temp before retrying the full guarded
                    # publication; persistent conflict remains a failed journal.
                    if (
                        getattr(error, "winerror", None) != 32
                        or getattr(error, "__notes__", None)
                        or time.monotonic() >= deadline
                    ):
                        raise
                    time.sleep(0.005 + secrets.randbelow(10) / 1000)
        except (OSError, ValueError) as error:
            raise JobError("unsafe-journal") from error
        return
    temp = folder / (record["job_id"] + "." + uuid.uuid4().hex + ".tmp")
    fd = os.open(
        temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600
    )
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(record, stream, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, target)
        if os.name != "nt":
            directory = os.open(folder, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        temp.unlink(missing_ok=True)


def validate(request):
    if os.name not in {"nt", "posix"} or (
        os.name == "posix" and not Path("/bin/ps").exists()
    ):
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
        if os.name == "nt":
            from host_job_profiles import private_read, ProfileError

            try:
                journal = json.loads(private_read(path, limit=65536))
            except (OSError, ValueError, ProfileError) as error:
                raise StorageError("unsafe-storage-journal") from error
        else:
            descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            with os.fdopen(descriptor, "rb") as stream:
                info = os.fstat(stream.fileno())
                if (
                    not stat.S_ISREG(info.st_mode)
                    or (
                        hasattr(os, "getuid")
                        and (info.st_uid != os.getuid() or info.st_mode & 0o077)
                    )
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


def supervise_windows(process, cancel, deadline, heartbeat):
    """Only a trusted job supervisor can attest native descendant cleanup."""
    channel = getattr(process, "_forgewright_job_cancel", None)
    client = getattr(process, "_forgewright_job_client", None)
    if channel is None or client is None:
        return False, False
    stopped, uncertain, last_heartbeat = False, False, 0.0
    cleanup_deadline = None
    try:
        while True:
            code = process.poll()
            if code is not None:
                try:
                    client.validate(code)
                    return not uncertain, stopped
                except CompletionError:
                    return False, stopped
            now = time.monotonic()
            if cleanup_deadline is None and now - last_heartbeat >= 1:
                try:
                    if heartbeat() is False:
                        stopped = True
                except Exception:
                    uncertain, stopped = True, True
                last_heartbeat = now
            if cancel.is_set() or now >= deadline:
                stopped = True
            if stopped and cleanup_deadline is None:
                channel.close()
                cleanup_deadline = time.monotonic() + 5
            if cleanup_deadline is not None and time.monotonic() >= cleanup_deadline:
                # Killing our helper is last-resort reclamation, never proof
                # that the entire job settled. Keep leases quarantined.
                process.kill()
                process.wait(timeout=2)
                return False, stopped
            time.sleep(0.05)
    except (OSError, subprocess.SubprocessError):
        return False, stopped
    finally:
        channel.close()


def supervise(process, cancel, deadline, heartbeat):
    """Keep birth-bound descendants accounted; recheck before every signal.

    Profiles forbid daemonization. Census catches observed escapes, but cannot
    prove absence of an unobserved double-fork; never enroll those profiles.
    """
    if os.name == "nt" and sys.platform == "win32":
        return supervise_windows(process, cancel, deadline, heartbeat)
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
            except OSError as error:
                # Darwin may return EPERM for an exited, unreaped group.
                # Reap our leader and re-census; never clear prior uncertainty
                # or treat a live/escaped descendant as a successful signal.
                if (
                    sys.platform == "darwin"
                    and error.errno == errno.EPERM
                    and process.poll() is not None
                ):
                    remaining, safe = observe()
                    if remaining or not safe:
                        uncertain = True
                else:
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
                        terminate(getattr(signal, "SIGKILL", signal.SIGTERM))
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
        ancestors, complete = ancestry()
        reject_nested(admission, ancestors, complete=complete)
    except JobError:
        record.update(state="rejected", never_spawned=True, exit_code=125)
        record["terminal_release"] = terminal_release_witness(record)
        write_journal(admission.home, record)
        raise
    job_client = None
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
            argv = request.argv
            if os.name == "nt":
                if (
                    shutil.which(
                        argv[0], path=(child_environment or os.environ).get("PATH")
                    )
                    is None
                ):
                    raise FileNotFoundError("worker executable unavailable")
                job_client = WindowsJobClient(parent=admission.home).prepare()
                argv = job_client.supervisor_argv(argv)
            process = subprocess.Popen(
                argv,
                cwd=cwd,
                start_new_session=os.name != "nt",
                env=child_environment,
                stdin=subprocess.PIPE if os.name == "nt" else None,
                stdout=sys.stdout if os.name == "nt" else None,
                stderr=sys.stderr if os.name == "nt" else None,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
                if os.name == "nt"
                else 0,
            )
            if os.name == "nt":
                process._forgewright_job_cancel = process.stdin
                process._forgewright_job_client = job_client
        except (OSError, CompletionError) as error:
            if job_client is not None:
                job_client.cleanup()
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
        supervision_diagnostics = (
            getattr(process, "_forgewright_supervision_diagnostics", None) or {}
        )
        monitor_finished = True
        uncertain = not quiescent
        if supervision_diagnostics.get(
            "escaped_children"
        ) or not supervision_diagnostics.get("census_complete", True):
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
        if (
            job_client is not None
            and process is not None
            and process.poll() is not None
        ):
            try:
                job_client.cleanup()
            except CompletionError:
                uncertain = True
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
