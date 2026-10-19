"""One-shot native event→profile→supervisor bindings; no execution or grants.

Private local records prevent accidental replay/mixups. They do not authenticate
a hostile same-user writer or substitute for actual native delivery evidence.
"""

import fcntl
import json
import os
from itertools import islice
import re
import time
import uuid

from host_job_profiles import private_dir, private_read, digest

SCHEMA = "forgewright-native-job-request/v1"
MAX_NATIVE_REQUESTS = 4096


def issue(home, project, payload, profile, expected, enrollment, *, lesson_context=""):
    from resource_enrollment import locked, registry, validate_binding, EnrollmentError

    with locked(home):
        current = registry(home).get(str(project))
        if not current or any(
            current.get(k) != enrollment.get(k)
            for k in (
                "phase",
                "mode",
                "nonce",
                "profiles",
                "config_sha256",
                "code_sha256",
                "source_root",
            )
        ):
            raise EnrollmentError("native-enrollment-changed")
        validate_binding(current)
        return _issue_locked(home, project, payload, profile, expected, current,
                             lesson_context=lesson_context)


def _issue_locked(home, project, payload, profile, expected, enrollment, *, lesson_context=""):
    from resource_enrollment import atomic_private, EnrollmentError, operator_disabled

    if operator_disabled(home, str(project)):
        raise EnrollmentError("operator-disabled")
    if not isinstance(lesson_context, str) or len(lesson_context) > 2000:
        raise EnrollmentError("invalid-native-context-observation")

    native = {key: payload.get(key) for key in ("session_id", "turn_id", "tool_use_id")}
    if any(
        not isinstance(value, str) or not 1 <= len(value) <= 128
        for value in native.values()
    ):
        raise EnrollmentError("native-event-binding-missing")
    folder = private_dir(home / "native-requests")
    if (
        sum(1 for _ in islice(folder.glob("*.json"), MAX_NATIVE_REQUESTS))
        >= MAX_NATIVE_REQUESTS
    ):
        raise EnrollmentError("history-maintenance-required")
    identifier = uuid.uuid4().hex
    context = {
        "schema": SCHEMA,
        "request_id": identifier,
        "native": native,
        "physical_workspace": str(project),
        "profile": profile["id"],
        "profile_digest": expected,
        "command_sha256": digest(profile["command"].encode()),
        "invocation_sha256": digest(str(payload.get("tool_input", {}).get("command", "")).encode()),
        "lesson_context_sha256": digest(lesson_context.encode()),
        "lesson_context_chars": len(lesson_context),
        "nonce": enrollment["nonce"],
        "code_sha256": enrollment["code_sha256"],
        "config_sha256": enrollment["config_sha256"],
        "issued_at": time.time(),
    }
    atomic_private(
        folder / (identifier + ".json"),
        (json.dumps({"context": context, "state": "issued"}) + "\n").encode(),
    )
    return context


def claim(
    home,
    request_id,
    *,
    project,
    profile,
    profile_digest,
    job_id,
    owner_pid,
    owner_identity,
):
    from resource_enrollment import (
        atomic_private,
        registry,
        validate_binding,
        EnrollmentError,
        locked,
        operator_disabled,
    )

    if not isinstance(request_id, str) or not re.fullmatch(r"[0-9a-f]{32}", request_id):
        raise EnrollmentError("invalid-native-request")
    folder = private_dir(home / "native-requests")
    path = folder / (request_id + ".json")
    fd = os.open(
        folder / (request_id + ".lock"), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600
    )
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with locked(home):
            if operator_disabled(home, str(project)):
                raise EnrollmentError("operator-disabled")
            value = json.loads(private_read(path))
            context = value["context"]
            enrollment = registry(home)[str(project)]
            validate_binding(enrollment)
            if (
                value["state"] != "issued"
                or context.get("schema") != SCHEMA
                or context.get("request_id") != request_id
                or context.get("physical_workspace") != str(project)
                or context.get("profile") != profile
                or context.get("profile_digest") != profile_digest
                or context.get("nonce") != enrollment["nonce"]
                or context.get("code_sha256") != enrollment["code_sha256"]
                or context.get("config_sha256") != enrollment["config_sha256"]
                or not 0 <= time.time() - context.get("issued_at", 0) <= 300
            ):
                raise EnrollmentError("native-request-used-or-stale")
            context.update(
                job_id=job_id, owner_pid=owner_pid, owner_identity=owner_identity
            )
            value.update(context=context, state="claimed")
            atomic_private(path, (json.dumps(value) + "\n").encode())
            return context
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise EnrollmentError("native-request-unavailable") from error
    finally:
        os.close(fd)
