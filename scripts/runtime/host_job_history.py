"""Bounded retirement of proven terminal metadata, never artifact data/leases.

Run outside the native hook. The enrollment lock serializes issue/claim/prune;
unknown references, owner observation and storage states always preserve data.
"""

import json
import math
import os
import re
import stat
import subprocess
import time

from host_job_profiles import private_dir, private_read
from host_resources import command
from resource_enrollment import locked, registry

SCAN_LIMIT = 16384
BYTE_LIMIT = 64 * 1024**2
SCAN_SECONDS = 3


def process_ids():
    try:
        values = {
            int(line) for line in command(["/bin/ps", "-ax", "-o", "pid="]).splitlines()
        }
        return values if os.getpid() in values else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def sync_directory(folder):
    descriptor = os.open(folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def valid_timestamp(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def valid_context(value, state):
    if (
        not isinstance(value, dict)
        or value.get("schema") != "forgewright-native-job-request/v1"
        or not valid_timestamp(value.get("issued_at"))
    ):
        return False
    required = {
        "schema",
        "request_id",
        "native",
        "physical_workspace",
        "profile",
        "profile_digest",
        "command_sha256",
        "nonce",
        "code_sha256",
        "config_sha256",
        "issued_at",
    }
    if state == "claimed":
        required |= {"job_id", "owner_pid", "owner_identity"}
    observed = {key for key in ("invocation_sha256", "lesson_context_sha256", "lesson_context_chars") if key in value}
    if (
        set(value) != required | observed
        or (bool("lesson_context_sha256" in observed) != bool("lesson_context_chars" in observed))
        or not isinstance(value.get("native"), dict)
        or set(value["native"]) != {"session_id", "turn_id", "tool_use_id"}
    ):
        return False
    if any(
        not isinstance(v, str) or not 1 <= len(v) <= 128
        for v in value["native"].values()
    ):
        return False
    if any(
        not isinstance(value.get(k), str) or not re.fullmatch(r"[0-9a-f]{64}", value[k])
        for k in ("profile_digest", "command_sha256", "code_sha256", "config_sha256",
                  *[key for key in observed if key.endswith("sha256")])
    ):
        return False
    if "lesson_context_chars" in observed and (
        type(value["lesson_context_chars"]) is not int or not 0 <= value["lesson_context_chars"] <= 2000
    ):
        return False
    return state != "claimed" or (
        type(value.get("owner_pid")) is int
        and value["owner_pid"] > 0
        and isinstance(value.get("owner_identity"), str)
        and bool(re.fullmatch(r"[0-9a-f]{64}", value["owner_identity"]))
    )


def snapshot(home, deadline):
    result = {"jobs": {}, "native-requests": {}, "locks": {}}
    entries = size = 0
    for name in ("jobs", "native-requests"):
        folder = private_dir(home / name)
        with os.scandir(folder) as directory:
            for entry in directory:
                entries += 1
                if entries > SCAN_LIMIT or time.monotonic() > deadline:
                    raise ValueError("history-census-incomplete")
                path = folder / entry.name
                if name == "native-requests" and re.fullmatch(
                    r"[0-9a-f]{32}\.lock", entry.name
                ):
                    result["locks"][entry.name] = private_read(path, 64)
                    continue
                pattern = (
                    r"job-[0-9a-f]{32}\.json"
                    if name == "jobs"
                    else r"[0-9a-f]{32}\.json"
                )
                if not re.fullmatch(pattern, entry.name):
                    # A producer's temporary journal is never retired here.
                    if name == "jobs" and re.fullmatch(
                        r"job-[0-9a-f]{32}\.[0-9a-f]{32}\.tmp", entry.name
                    ):
                        continue
                    raise ValueError("unknown-history-entry")
                raw = private_read(path, 65536)
                size += len(raw)
                if size > BYTE_LIMIT:
                    raise ValueError("history-census-incomplete")
                value = json.loads(raw)
                if not isinstance(value, dict):
                    raise ValueError("malformed-history")
                result[name][path.stem] = (raw, value)
    return result


def unlink_exact(path, raw):
    """Only a private, unchanged metadata leaf in the locked namespace."""
    if private_read(path, max(65536, len(raw))) != raw:
        raise ValueError("history-drift")
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or path.is_symlink():
        raise ValueError("unsafe-history-entry")
    path.unlink()


def collect_history(admission, *, keep_recent=128, limit=128):
    from resource_enrollment import EnrollmentError

    try:
        return _collect_history(admission, keep_recent=keep_recent, limit=limit)
    except EnrollmentError as error:
        if str(error) != "enrollment-busy":
            raise
        return {
            "status": "busy",
            "removed_requests": 0,
            "removed_journals": 0,
            "removed_locks": 0,
        }


def _collect_history(admission, *, keep_recent, limit):
    from host_job_runner import journal_released
    from project_storage import cleanup_absence_confirmed, StorageError

    if (
        type(keep_recent) is not int
        or not 0 <= keep_recent <= 4096
        or type(limit) is not int
        or not 1 <= limit <= 128
    ):
        raise ValueError("invalid-history-bounds")
    home = admission.home
    result = {
        "status": "complete",
        "removed_requests": 0,
        "removed_journals": 0,
        "removed_locks": 0,
    }
    with locked(home):
        deadline = time.monotonic() + SCAN_SECONDS
        try:
            values = snapshot(home, deadline)
            enrollments = registry(home)
            protected_requests, protected_jobs = set(), set()
            for value in enrollments.values():
                for ref in [
                    value.get("native_proof", {}),
                    *[e.get("context", {}) for e in value.get("events", [])],
                ]:
                    if ref.get("request_id"):
                        protected_requests.add(ref["request_id"])
                    if ref.get("job_id"):
                        protected_jobs.add(ref["job_id"])
            requests, journals = values["native-requests"], values["jobs"]
            for identifier, (_, request) in requests.items():
                context = request["context"]
                if (
                    set(request) != {"state", "context"}
                    or not valid_context(context, request.get("state"))
                    or context.get("request_id") != identifier
                    or request.get("state") not in {"issued", "claimed"}
                ):
                    raise ValueError("unknown-request-reference")
                if request["state"] == "claimed" and not re.fullmatch(
                    r"job-[0-9a-f]{32}", context.get("job_id", "")
                ):
                    raise ValueError("unknown-job-reference")
            for identifier, (_, journal) in journals.items():
                if (
                    journal.get("job_id") != identifier
                    or journal.get("schema") != "forgewright-host-job/v1"
                    or not valid_timestamp(journal.get("requested_at"))
                ):
                    raise ValueError("unknown-journal-reference")
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            return dict(result, status="incomplete")

        owners = process_ids()

        def terminal(journal):
            if (
                owners is None
                or type(journal.get("owner_pid")) is not int
                or journal["owner_pid"] in owners
            ):
                return False
            try:
                storage = journal.get("storage")
                if storage:
                    if storage.get(
                        "state"
                    ) != "reclaimed" or not cleanup_absence_confirmed(storage):
                        return False
                return journal_released(admission, journal)
            except (
                OSError,
                ValueError,
                KeyError,
                TypeError,
                AttributeError,
                StorageError,
            ):
                return False

        eligible = []
        now = time.time()
        for identifier, (_, request) in requests.items():
            if time.monotonic() >= deadline:
                return dict(result, status="incomplete")
            context = request["context"]
            if identifier in protected_requests:
                continue
            issued = context.get("issued_at")
            if not isinstance(issued, (int, float)):
                continue
            if request["state"] == "issued" and now - issued > 360:
                eligible.append((issued, identifier))
            elif request["state"] == "claimed":
                entry = journals.get(context["job_id"])
                if (
                    entry
                    and entry[1].get("native_context") == context
                    and context["job_id"] not in protected_jobs
                    and terminal(entry[1])
                ):
                    eligible.append((issued, identifier))
        selected = sorted(eligible, reverse=True)[keep_recent:][:limit]
        for _, identifier in selected:
            if time.monotonic() >= deadline:
                result["status"] = "incomplete"
                break
            unlink_exact(
                home / "native-requests" / (identifier + ".json"),
                requests[identifier][0],
            )
            requests.pop(identifier)
            result["removed_requests"] += 1
        # Request durability is a prerequisite for declaring a journal unreferenced.
        sync_directory(home / "native-requests")
        referenced_jobs = protected_jobs | {
            v[1]["context"]["job_id"]
            for v in requests.values()
            if v[1]["state"] == "claimed"
        }
        eligible = []
        for identifier, (_, journal) in journals.items():
            if time.monotonic() >= deadline:
                return dict(result, status="incomplete")
            if identifier not in referenced_jobs and terminal(journal):
                eligible.append((journal.get("requested_at", 0), identifier))
        remaining = limit - result["removed_requests"]
        for _, identifier in sorted(eligible, reverse=True)[keep_recent:][:remaining]:
            if time.monotonic() >= deadline:
                result["status"] = "incomplete"
                break
            unlink_exact(
                home / "jobs" / (identifier + ".json"), journals[identifier][0]
            )
            result["removed_journals"] += 1
        sync_directory(home / "jobs")
        remaining = limit - result["removed_requests"] - result["removed_journals"]
        for name, raw in values["locks"].items():
            if remaining <= 0:
                break
            if time.monotonic() >= deadline:
                result["status"] = "incomplete"
                break
            identifier = name[:-5]
            if (
                identifier not in requests
                and not (home / "native-requests" / (identifier + ".json")).exists()
            ):
                unlink_exact(home / "native-requests" / name, raw)
                result["removed_locks"] += 1
                remaining -= 1
        sync_directory(home / "native-requests")
    return result
