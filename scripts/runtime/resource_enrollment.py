#!/usr/bin/env python3
"""Reversible Codex resource enrollment. Staging never enables enforcement.

Activation requires current native deny/rewrite evidence and an owned terminal
job receipt. Keyless local records cannot authenticate a hostile same-user writer.
"""

from contextlib import contextmanager
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import sys
import time
import tomllib
import uuid
import ctypes
import stat

from host_job_profiles import private_dir, private_read, load_profile, digest

BEGIN = "# >>> forgewright resource-admission v1 >>>"
END = "# <<< forgewright resource-admission v1 <<<"
ROOT = Path(__file__).resolve().parents[2]


class EnrollmentError(RuntimeError):
    pass


def _exchange(parent, first, second):
    """Keep both revisions and the live config slot present atomically.

    Darwin ABI/RENAME_SWAP=2 verified in the installed Xcode SDK sys/stdio.h.
    Linux uses libc renameat2(RENAME_EXCHANGE=2); absence fails closed.
    """
    library = ctypes.CDLL(None, use_errno=True)
    name = "renameatx_np" if sys.platform == "darwin" else "renameat2"
    function = getattr(library, name, None)
    if function is None:
        raise EnrollmentError("atomic-config-exchange-unavailable")
    function.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    function.restype = ctypes.c_int
    if function(parent, os.fsencode(first), parent, os.fsencode(second), 2) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def _config_at(parent, name):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_size > 1024**2
        ):
            raise EnrollmentError("unsafe-config")
        raw = stream.read(1024**2 + 1)
        return raw, (info.st_dev, info.st_ino)


def publish_config(config, raw, expected_before, *, prepared=None):
    from project_storage import _open_directory

    config = Path(config).absolute()
    parent = _open_directory(config.parent)
    name = ".fw-resource-preserved-" + uuid.uuid4().hex + ".toml"
    try:
        descriptor = os.open(
            name,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
            0o600,
            dir_fd=parent,
        )
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
            identity = (
                os.fstat(stream.fileno()).st_dev,
                os.fstat(stream.fileno()).st_ino,
            )
        publication = {
            "preserved_path": str(config.parent / name),
            "expected_before_sha256": expected_before,
            "desired_sha256": digest(raw),
            "candidate_identity": list(identity),
        }
        if prepared is not None:
            prepared(publication)
        current, _ = _config_at(parent, config.name)
        if digest(current) != expected_before:
            raise EnrollmentError("config-drift")
        _exchange(parent, name, config.name)
        captured, _ = _config_at(parent, name)
        if digest(captured) != expected_before:
            # Exchange is not compare-and-swap. A compensating second exchange
            # can displace a third editor revision even after an identity check.
            # Preserve the captured version and report an unresolved conflict.
            raise EnrollmentError("config-drift-preserved")
        current, current_identity = _config_at(parent, config.name)
        if current_identity != identity or digest(current) != digest(raw):
            raise EnrollmentError("config-drift-preserved")
        os.fsync(parent)
        return publication
    finally:
        os.close(parent)


def code_binding():
    names = ["scripts/hooks/resource_admission.py"] + [
        "scripts/runtime/" + name + ".py"
        for name in (
            "host_jobs",
            "resource_controls",
            "recurrence_adapter",
            "project_recipe",
            "host_job_profiles",
            "host_job_runner",
            "project_storage",
            "runtime_registry",
            "artifact_pins",
            "native_job_requests",
            "project_disk",
            "resource_enrollment",
            "host_inventory",
            "host_job_history",
            "host_resources",
            "host_admission",
            "host_admission_store",
            "host_scheduler",
            "host_capacity",
        )
    ]
    names += [
        "scripts/memory/" + name + ".py"
        for name in (
            "recurrence",
            "memory_common",
            "memory_flow",
            "mem0-v2",
            "continuity",
            "memory_redaction",
        )
    ]
    names += [
        "scripts/lite/" + name + ".py"
        for name in (
            "evidence_common",
            "verify_gate",
            "pytest_receipts",
            "windows_secure_io",
        )
    ]
    return digest(
        json.dumps(
            {name: digest((ROOT / name).read_bytes()) for name in names}, sort_keys=True
        ).encode()
    )


def atomic_private(path, raw, *, private_parent=True):
    if private_parent:
        private_dir(path.parent)
    elif (
        any(p.is_symlink() for p in [path, *path.parents])
        or path.parent.stat().st_uid != os.getuid()
    ):
        raise EnrollmentError("unsafe-config")
    temp = path.parent / (path.name + "." + uuid.uuid4().hex + ".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        from project_storage import _open_directory

        parent = _open_directory(path.parent)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        temp.unlink(missing_ok=True)


@contextmanager
def locked(home):
    private_dir(home)
    fd = os.open(
        home / "enrollment.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600
    )
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    except BlockingIOError as error:
        raise EnrollmentError("enrollment-busy") from error
    finally:
        os.close(fd)


def registry(home):
    path = home / "enrollments.json"
    return json.loads(private_read(path, 65536)) if path.exists() else {}


def save(home, value):
    atomic_private(
        home / "enrollments.json", (json.dumps(value, sort_keys=True) + "\n").encode()
    )


def canary_paths(home, project, nonce):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", nonce):
        raise EnrollmentError("invalid-canary-nonce")
    folder = home / "canary" / digest(os.fsencode(Path(project).resolve()))[:24] / nonce
    private_dir(folder)
    return folder / "denied", folder / "approved"


def publication_verified(config, publication):
    from project_storage import _open_directory

    config = Path(config)
    captured = Path(publication.get("preserved_path", ""))
    if captured.parent != config.parent or not re.fullmatch(
        r"\.fw-resource-preserved-[0-9a-f]{32}\.toml", captured.name
    ):
        return False
    parent = _open_directory(config.parent)
    try:
        current, _ = _config_at(parent, config.name)
        predecessor, _ = _config_at(parent, captured.name)
        return (
            digest(current) == publication["desired_sha256"]
            and digest(predecessor) == publication["expected_before_sha256"]
        )
    finally:
        os.close(parent)


def operator_state(home):
    """Read only the private owner control, independently of enrollment health."""
    path = home / "operator-disable.json"
    if not path.exists():
        return {"schema": "forgewright-resource-operator-disable/v1", "projects": []}
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError("unsafe-operator-disable")
    parent = home.stat()
    if parent.st_uid != os.getuid() or parent.st_mode & 0o077:
        raise ValueError("unsafe-operator-disable")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_mode & 0o022
            or info.st_size > 16384
        ):
            raise ValueError("unsafe-operator-disable")
        value = json.load(stream)
    if (
        value.get("schema") != "forgewright-resource-operator-disable/v1"
        or not isinstance(value.get("projects"), list)
        or len(value["projects"]) > 32
        or any(
            not isinstance(p, str) or not 1 <= len(p) <= 4096 for p in value["projects"]
        )
    ):
        raise ValueError("invalid-operator-disable")
    return value


def operator_disabled(home, project):
    """Owner off keeps existing supervisors' leases and cleanup obligations."""
    return project in operator_state(home)["projects"]


def disable_enrollment(home, project):
    """Stop new native work first; preserve edits and defer unsafe removal."""
    home, project = Path(home), Path(project).resolve(strict=True)
    with locked(home):
        value = operator_state(home)
        if str(project) not in value["projects"]:
            if len(value["projects"]) >= 32:
                raise EnrollmentError("operator-project-limit")
            value["projects"].append(str(project))
        value["reason"] = "Explicit owner operator-off; existing jobs retain ownership"
        atomic_private(
            home / "operator-disable.json",
            (json.dumps(value, sort_keys=True) + "\n").encode(),
        )
    result = {"status": "operator-disabled", "enforcement_verified": False}
    try:
        current = registry(home).get(str(project))
        if current is None:
            return dict(result, config_removal="not-enrolled")
        deactivate_preserving_edits(home, project, current["config"])
        return dict(result, config_removal="removed-preserving-edits")
    except (OSError, ValueError, KeyError, TypeError, EnrollmentError):
        # The durable owner-off is already effective, even if a live lease or
        # unrelated config edit requires later reconciliation. Never release it.
        return dict(result, config_removal="pending-reconciliation")


def stage(home, project, config, profiles, nonce, *, canary_profile=None):
    if not isinstance(profiles, dict) or len(profiles) > 8:
        raise EnrollmentError("invalid-profile-selection")
    if len(profiles) > 1 and canary_profile is None:
        raise EnrollmentError("explicit-canary-profile-required")
    canary_profile = canary_profile or next(iter(profiles), None)
    if canary_profile is not None and canary_profile not in profiles:
        raise EnrollmentError("unknown-canary-profile")
    home, project, config = (
        Path(home),
        Path(project).resolve(strict=True),
        Path(config).absolute(),
    )
    denied, approved = canary_paths(home, project, nonce)
    with locked(home):
        if config.is_symlink() or any(p.is_symlink() for p in config.parents):
            raise EnrollmentError("unsafe-config")
        raw = config.read_bytes() if config.exists() else b""
        try:
            parsed = tomllib.loads(raw.decode())
        except (ValueError, UnicodeError) as error:
            raise EnrollmentError("invalid-config") from error
        if parsed.get("features", {}).get("hooks") is not True:
            raise EnrollmentError("native-hooks-feature-not-enabled")
        values = registry(home)
        key = str(project)
        old = values.get(key)
        if old:
            if old.get("phase") == "conflict":
                raise EnrollmentError("publication-conflict-requires-reconciliation")
            if (
                old["code_sha256"] != code_binding()
                or old["profiles"] != profiles
                or old["nonce"] != nonce
                or old.get("canary_profile") != canary_profile
            ):
                raise EnrollmentError("enrollment-exists-rollback-before-restage")
            if old.get("phase") == "prepared":
                publication = old.get("publication", {})
                if publication and publication_verified(config, publication):
                    old.update(phase="canary", mode="canary")
                    save(home, values)
                    return old
                if digest(raw) == old.get("config_before_sha256") and old.get(
                    "candidate_config"
                ):
                    candidate = private_read(Path(old["candidate_config"]), 1024 * 1024)
                    if digest(candidate) != old["config_sha256"]:
                        raise EnrollmentError("candidate-config-drift")

                    def prepared(publication):
                        old["publication"] = publication
                        save(home, values)

                    publication = publish_or_conflict(
                        home,
                        values,
                        old,
                        config,
                        candidate,
                        old["config_before_sha256"],
                        prepared=prepared,
                    )
                    old.update(publication=publication, phase="canary", mode="canary")
                    save(home, values)
                    return old
                raise EnrollmentError("config-publication-unconfirmed")
            if old["config_sha256"] != digest(raw):
                raise EnrollmentError("enrollment-exists-rollback-before-restage")
            return old
        for name, expected in profiles.items():
            load_profile(home, project, name, expected)
        entry = ROOT / "scripts/hooks/resource_admission.py"
        bootstrap = 'import runpy,sys;sys.argv.pop(0);sys.path.insert(0,sys.argv.pop(0));runpy.run_path(sys.argv[0],run_name="__main__")'
        command = shlex.join(
            [
                sys.executable,
                "-I",
                "-B",
                "-c",
                bootstrap,
                str(entry.parent),
                str(entry),
                "--home",
                str(home),
            ]
        )
        block = (
            "\n"
            + BEGIN
            + '\n[[hooks.PreToolUse]]\nmatcher = "Bash"\n[[hooks.PreToolUse.hooks]]\ntype = "command"\ncommand = '
            + json.dumps(command)
            + "\ntimeout = 3\n"
            + END
            + "\n"
        )
        # One distinct hook covers all explicitly enrolled workspaces. Reuse it
        # for another project only if the exact generated command already exists.
        shared = [v for v in values.values() if v["config"] == str(config)]
        if BEGIN in raw.decode():
            commands = [
                hook.get("command")
                for group in parsed.get("hooks", {}).get("PreToolUse", [])
                for hook in group.get("hooks", [])
            ]
            if (
                command not in commands
                or raw.decode().count(BEGIN) != 1
                or raw.decode().count(END) != 1
                or not shared
                or any(
                    v["config_sha256"] != digest(raw)
                    or v["code_sha256"] != code_binding()
                    for v in shared
                )
            ):
                raise EnrollmentError("hook-marker-mismatch")
            updated = raw
        else:
            updated = raw + block.encode()
        tomllib.loads(updated.decode())
        if shared:
            backup = Path(shared[0]["backup"])
            original_sha = shared[0]["backup_sha256"]
        else:
            backup = home / "enrollment-backups" / (uuid.uuid4().hex + ".toml")
            atomic_private(backup, raw)
            original_sha = digest(raw)
        deny_command = shlex.join(
            [
                sys.executable,
                "-c",
                "from pathlib import Path;Path("
                + repr(str(denied))
                + ').write_text("unexpected")',
            ]
        )
        candidate = home / "enrollment-backups" / (uuid.uuid4().hex + ".candidate.toml")
        atomic_private(candidate, updated)
        value = {
            "schema": "forgewright-resource-enrollment/v1",
            "candidate_config": str(candidate),
            "candidate_sha256": digest(updated),
            "config_before_sha256": digest(raw),
            "mode": "canary",
            "phase": "prepared",
            "nonce": nonce,
            "profiles": profiles,
            "canary_profile": canary_profile,
            "config": str(config),
            "config_sha256": digest(updated),
            "code_sha256": code_binding(),
            "source_root": str(ROOT),
            "backup": str(backup),
            "backup_sha256": original_sha,
            "enforcement_verified": False,
            "events": [],
            "deny_command_sha256": digest(deny_command.encode()),
            "deny_command": deny_command,
            "denied_marker": str(denied),
            "approved_marker": str(approved),
            "staged_at": time.time(),
        }
        # Registry first: an interrupted config write leaves no false activation.
        values[key] = value
        save(home, values)

        def prepared(publication):
            value["publication"] = publication
            value["phase"] = "prepared"
            save(home, values)

        if updated == raw and shared:
            publication = shared[0].get("publication")
        else:
            publication = publish_or_conflict(
                home, values, value, config, updated, digest(raw), prepared=prepared
            )
        value.update(publication=publication, phase="canary")
        save(home, values)
        return value


def validate_binding(value, config=None):
    from project_storage import _open_directory

    path = Path(config or value["config"])
    if value.get("phase") not in {"canary", "enforce"}:
        raise EnrollmentError("enrollment-publication-incomplete")
    parent = _open_directory(path.parent)
    try:
        raw, _ = _config_at(parent, path.name)
    finally:
        os.close(parent)
    if digest(raw) != value["config_sha256"]:
        raise EnrollmentError("config-drift")
    if value.get("restage"):
        _verify_restage(value, path, raw)
    elif value.get("publication") and not publication_verified(
        path, value["publication"]
    ):
        raise EnrollmentError("config-drift-preserved")
    if value["code_sha256"] != code_binding() or value["source_root"] != str(ROOT):
        raise EnrollmentError("code-drift")


def record_canary(home, project, payload, action, *, context=None):
    with locked(home):
        values = registry(home)
        value = values[str(project)]
        validate_binding(value)
        if not all(
            isinstance(payload.get(k), str) and payload[k]
            for k in ("session_id", "turn_id", "tool_use_id")
        ):
            raise EnrollmentError("native-event-binding-missing")
        event = {k: payload[k] for k in ("session_id", "turn_id", "tool_use_id")}
        event.update(action=action, observed_at=time.time())
        event["nonce"] = value["nonce"]
        if context is not None:
            event["context"] = context
        if event["tool_use_id"] not in {e["tool_use_id"] for e in value["events"]}:
            value["events"] = (value["events"] + [event])[-8:]
        save(home, values)


def activate(home, project, config):
    from host_admission import HostAdmission
    from host_job_runner import journal_released

    with locked(home):
        values = registry(home)
        project = Path(project).resolve(strict=True)
        if operator_disabled(home, str(project)):
            raise EnrollmentError("operator-disabled")
        value = values[str(project)]
        validate_binding(value, config)
        denied = [
            event
            for event in value["events"]
            if event.get("action") == "deny" and event.get("nonce") == value["nonce"]
        ]
        approved = [
            event
            for event in value["events"]
            if event.get("action") == "profile-run"
            and event.get("nonce") == value["nonce"]
        ]
        marker = Path(value["approved_marker"])
        if (
            not denied
            or not approved
            or Path(value["denied_marker"]).exists()
            or Path(value["denied_marker"]).is_symlink()
            or not marker.is_file()
            or private_read(marker).decode() != value["nonce"]
        ):
            raise EnrollmentError("native-proof-missing-or-failed")
        matched = None
        admission = HostAdmission(home)
        try:
            for event in approved:
                context = event.get("context", {})
                request_id = context.get("request_id", "")
                if not re.fullmatch(r"[0-9a-f]{32}", request_id):
                    continue
                request = json.loads(
                    private_read(home / "native-requests" / (request_id + ".json"))
                )
                claimed = request.get("context", {})
                job_id = claimed.get("job_id", "")
                if not re.fullmatch(r"job-[0-9a-f]{32}", job_id):
                    continue
                receipt = json.loads(
                    private_read(home / "jobs" / (job_id + ".json"), 65536)
                )
                native = context.get("native", {})
                canary = value.get("canary_profile")
                if (
                    request.get("state") != "claimed"
                    or receipt.get("native_context") != claimed
                    or any(claimed.get(k) != v for k, v in context.items())
                    or native
                    != {
                        key: event.get(key)
                        for key in ("session_id", "turn_id", "tool_use_id")
                    }
                    or not any(
                        d.get("session_id") == native.get("session_id")
                        and d.get("turn_id") == native.get("turn_id")
                        for d in denied
                    )
                    or receipt.get("profile") != canary
                    or context.get("profile") != canary
                    or receipt.get("profile_digest") != value["profiles"].get(canary)
                    or context.get("profile_digest") != value["profiles"].get(canary)
                    or context.get("code_sha256") != value["code_sha256"]
                    or context.get("config_sha256") != value["config_sha256"]
                    or receipt.get("state") != "quiescent"
                    or receipt.get("exit_code") != 0
                    or receipt.get("physical_workspace") != str(project)
                    or receipt.get("requested_at", 0) < value["staged_at"]
                    or not journal_released(admission, receipt)
                ):
                    continue
                profile = load_profile(home, project, canary, value["profiles"][canary])
                if context.get("command_sha256") != digest(profile["command"].encode()):
                    continue
                matched = {"request_id": request_id, "job_id": job_id, "native": native}
                break
        finally:
            admission.close()
        if matched is None:
            raise EnrollmentError("native-proof-terminal-job-missing")
        value.update(
            mode="enforce",
            phase="enforce",
            enforcement_verified=True,
            native_proof=matched,
        )
        save(home, values)
        return value


def require_quiescent_enrollment(home, project):
    from host_admission import HostAdmission
    from host_job_runner import journal_released

    admission = HostAdmission(home) if (home / "host.sqlite3").exists() else None
    try:
        if admission is not None:
            with admission.transaction():
                admission.refresh()
                if admission.connection.execute(
                    "SELECT 1 FROM jobs WHERE project=? AND state!='released' LIMIT 1",
                    (str(project),),
                ).fetchone():
                    raise EnrollmentError("enrollment-jobs-live-or-quarantined")
        for path in (home / "native-requests").glob("*.json"):
            raw_request = private_read(path)
            request = json.loads(raw_request)
            context = request.get("context", {})
            if request.get("state") != "claimed" or context.get(
                "physical_workspace"
            ) != str(project):
                continue
            if admission is None:
                raise EnrollmentError("native-request-state-unconfirmed")
            job = context.get("job_id", "")
            if not re.fullmatch(r"job-[0-9a-f]{32}", job):
                raise EnrollmentError("native-request-state-unconfirmed")
            try:
                raw_receipt = private_read(home / "jobs" / (job + ".json"), 65536)
                receipt = json.loads(raw_receipt)
            except OSError as error:
                raise EnrollmentError("native-request-state-unconfirmed") from error
            never_spawned = (
                receipt.get("never_spawned") is True
                and receipt.get("leases") == []
                and receipt.get("child") is None
                and receipt.get("spawn_pending") is False
                and receipt.get("native_context") == context
            )
            if (
                not never_spawned
                and not journal_released(admission, receipt)
                and not verify_failed_safe_closure(
                    home,
                    project,
                    receipt,
                    context,
                    admission=admission,
                    journal_sha256=digest(raw_receipt),
                    request_sha256=digest(raw_request),
                )
            ):
                raise EnrollmentError("native-request-state-unconfirmed")
    finally:
        if admission is not None:
            admission.close()


def verify_failed_safe_closure(
    home,
    project,
    receipt,
    context,
    *,
    admission=None,
    journal_sha256=None,
    request_sha256=None,
):
    """Verify an explicit failed-safe-closure receipt for a quarantined job.

    This clears only the claimed-request quiescence fence in
    require_quiescent_enrollment; it never satisfies activate() or native_proof.
    """
    from host_admission import HostAdmission

    home = Path(home)
    project = Path(project).resolve(strict=True)
    job_id = receipt.get("job_id", "")
    if (
        not re.fullmatch(r"job-[0-9a-f]{32}", job_id)
        or receipt.get("state") != "quarantined"
        or receipt.get("physical_workspace") != str(project)
        or receipt.get("native_context") != context
        or context.get("job_id") != job_id
        or context.get("physical_workspace") != str(project)
    ):
        return False
    closure_path = home / "reconciliations" / f"{job_id}.json"
    intent_path = home / "reconciliations" / f"{job_id}.intent.json"
    heavy_step_path = home / "reconciliations" / f"{job_id}.step-heavy.json"
    worker_step_path = home / "reconciliations" / f"{job_id}.step-worker.json"
    if not all(p.exists() for p in (closure_path, intent_path, heavy_step_path, worker_step_path)):
        return False
    try:
        closure = json.loads(private_read(closure_path, 65536))
        intent = json.loads(private_read(intent_path, 65536))
        heavy_step = json.loads(private_read(heavy_step_path, 65536))
        worker_step = json.loads(private_read(worker_step_path, 65536))
        if journal_sha256 is None:
            journal_sha256 = digest(
                private_read(home / "jobs" / f"{job_id}.json", 65536)
            )
        req_id = context.get("request_id", "")
        if request_sha256 is None and re.fullmatch(r"[0-9a-f]{32}", req_id):
            request_sha256 = digest(
                private_read(home / "native-requests" / f"{req_id}.json", 65536)
            )
        storage_meta = receipt.get("storage") or {}
        storage_path_str = closure.get("preserve_storage_path")
        if not isinstance(storage_path_str, str) or storage_path_str != storage_meta.get("path"):
            return False
        storage_path = Path(storage_path_str)
        storage_info = storage_path.lstat()
        plan_path_str = closure.get("plan_path")
        if not isinstance(plan_path_str, str):
            return False
        plan_path = Path(plan_path_str)
        if not plan_path.is_absolute() or not plan_path.resolve(strict=False).is_relative_to(project):
            return False
        raw_plan = private_read(plan_path, 65536)
        if digest(raw_plan) != closure.get("plan_sha256"):
            return False
        plan_obj = json.loads(raw_plan)
    except (OSError, ValueError, TypeError):
        return False
    if not stat.S_ISDIR(storage_info.st_mode):
        return False
    expected_dev = closure.get("preserve_storage_device")
    expected_ino = closure.get("preserve_storage_inode")
    if (
        type(expected_dev) is not int
        or type(expected_ino) is not int
        or storage_info.st_dev != expected_dev
        or storage_info.st_ino != expected_ino
        or expected_dev != plan_obj.get("preserve_storage_device")
        or expected_ino != plan_obj.get("preserve_storage_inode")
        or ("device" in storage_meta and storage_meta["device"] != expected_dev)
        or ("inode" in storage_meta and storage_meta["inode"] != expected_ino)
    ):
        return False
    if (
        not isinstance(closure, dict)
        or closure.get("schema") != "forgewright-failed-safe-closure/v1"
        or closure.get("project") != str(project)
        or closure.get("job_id") != job_id
        or closure.get("journal_sha256") != journal_sha256
        or closure.get("native_request_id") != context.get("request_id")
        or closure.get("native_request_sha256") != request_sha256
        or not re.fullmatch(r"[0-9a-f]{64}", str(closure.get("plan_sha256", "")))
        or plan_obj.get("schema") != "forgewright-quarantine-reconcile-plan/v3"
        or plan_obj.get("project") != str(project)
        or plan_obj.get("job_id") != job_id
        or plan_obj.get("journal_sha256") != journal_sha256
        or plan_obj.get("native_request_id") != context.get("request_id")
        or plan_obj.get("native_request_sha256") != request_sha256
        or plan_obj.get("owner_pid") != receipt.get("owner_pid")
        or plan_obj.get("owner_identity") != receipt.get("owner_identity")
        or plan_obj.get("child_pid") != (receipt.get("child") or {}).get("pid")
        or plan_obj.get("child_identity") != (receipt.get("child") or {}).get("identity")
        or plan_obj.get("preserve_storage_path") != storage_path_str
        or closure.get("original_failure_preserved") is not True
        or closure.get("storage_untouched") is not True
        or not isinstance(closure.get("leases"), list)
        or len(closure["leases"]) != 2
        or intent.get("schema") != "forgewright-quarantine-reconcile-intent/v1"
        or intent.get("project") != str(project)
        or intent.get("job_id") != job_id
        or intent.get("plan_path") != plan_path_str
        or intent.get("plan_sha256") != closure.get("plan_sha256")
        or intent.get("journal_sha256") != journal_sha256
        or intent.get("native_request_sha256") != request_sha256
        or intent.get("drain_evidence_path") != closure.get("drain_evidence_path")
        or intent.get("drain_evidence_sha256") != closure.get("drain_evidence_sha256")
        or intent.get("preserve_storage_path") != storage_path_str
        or intent.get("preserve_storage_device") != expected_dev
        or intent.get("preserve_storage_inode") != expected_ino
        or heavy_step.get("schema") != "forgewright-quarantine-reconcile-step/v1"
        or heavy_step.get("job_id") != job_id
        or heavy_step.get("kind") != "heavy"
        or heavy_step.get("plan_sha256") != closure.get("plan_sha256")
        or heavy_step.get("lease") != closure["leases"][0]
        or worker_step.get("schema") != "forgewright-quarantine-reconcile-step/v1"
        or worker_step.get("job_id") != job_id
        or worker_step.get("kind") != "worker"
        or worker_step.get("plan_sha256") != closure.get("plan_sha256")
        or worker_step.get("lease") != closure["leases"][1]
    ):
        return False
    sup_diag = receipt.get("supervision_diagnostics")
    esc_list = sup_diag.get("escaped_children") if isinstance(sup_diag, dict) else None
    diag_valid = (
        isinstance(sup_diag, dict)
        and sup_diag.get("census_complete") is True
        and sup_diag.get("escaped_overflow") is False
        and isinstance(esc_list, list)
        and 1 <= len(esc_list) <= 8
        and all(
            isinstance(e, dict)
            and type(e.get("pid")) is int
            and e["pid"] > 0
            and isinstance(e.get("birth"), str)
            and bool(re.fullmatch(r"[0-9a-f]{64}", e["birth"]))
            for e in esc_list
        )
    )
    if not diag_valid:
        drain_path_str = closure.get("drain_evidence_path")
        drain_sha = closure.get("drain_evidence_sha256")
        if not isinstance(drain_path_str, str) or not isinstance(drain_sha, str):
            return False
        if "drain_evidence_sha256" in plan_obj and plan_obj["drain_evidence_sha256"] != drain_sha:
            return False
        try:
            drain_path = Path(drain_path_str)
            if not drain_path.is_absolute() or not drain_path.resolve(strict=False).is_relative_to(project):
                return False
            raw_drain = private_read(drain_path, 65536)
            if digest(raw_drain) != drain_sha:
                return False
            drain_obj = json.loads(raw_drain)
        except (OSError, ValueError, TypeError):
            return False
        if (
            not isinstance(drain_obj, dict)
            or drain_obj.get("schema") != "forgewright-operator-escape-drain-evidence/v1"
            or drain_obj.get("job_id") != job_id
            or drain_obj.get("journal_sha256") != journal_sha256
            or drain_obj.get("decision") != "drained_verified_by_operator_and_reviewer"
            or not re.fullmatch(r"[0-9a-f]{64}", str(drain_obj.get("reviewer_sha256", "")))
        ):
            return False
    expected_ids = {lease.get("id") for lease in receipt.get("leases", [])}
    if len(expected_ids) != 2 or {
        item.get("id") for item in closure["leases"] if isinstance(item, dict)
    } != expected_ids:
        return False
    if any(item.get("state") != "released" for item in closure["leases"]):
        return False

    own_admission = admission is None
    if own_admission:
        if not (home / "host.sqlite3").exists():
            return False
        admission = HostAdmission(home)
    try:
        rows = admission.connection.execute(
            "SELECT id, project, run_id, kind, state, reason, memory_bytes, pid, identity, parent_id, created, granted FROM jobs WHERE run_id=?",
            (job_id,),
        ).fetchall()
        if len(rows) != 2 or {row["id"] for row in rows} != expected_ids:
            return False
        by_kind = {row["kind"]: dict(row) for row in rows}
        if set(by_kind) != {"worker", "heavy"}:
            return False
        worker = by_kind["worker"]
        heavy = by_kind["heavy"]
        plan_leases = plan_obj.get("leases")
        if not isinstance(plan_leases, list) or len(plan_leases) != 2:
            return False
        plan_by_kind = {item.get("kind"): item for item in plan_leases if isinstance(item, dict)}
        if set(plan_by_kind) != {"worker", "heavy"}:
            return False
        for k, row_data in (("heavy", heavy), ("worker", worker)):
            if (
                not isinstance(row_data.get("created"), (int, float))
                or not isinstance(row_data.get("granted"), (int, float))
                or row_data["memory_bytes"] != plan_by_kind[k].get("memory_bytes")
                or row_data["id"] != plan_by_kind[k].get("id")
                or row_data["parent_id"] != plan_by_kind[k].get("parent_id")
            ):
                return False
            expected_payload = {
                "id": row_data["id"],
                "state": "released",
                "kind": row_data["kind"],
                "reason": "reconciled",
                "memoryMiB": row_data["memory_bytes"] // (1024 * 1024),
                "parentLeaseId": row_data["parent_id"],
                "waitMs": max(0, round((row_data["granted"] - row_data["created"]) * 1000)),
            }
            step_doc = heavy_step if k == "heavy" else worker_step
            closure_idx = 0 if k == "heavy" else 1
            if step_doc.get("lease") != expected_payload or closure["leases"][closure_idx] != expected_payload:
                return False
        return (
            worker["state"] == "released"
            and heavy["state"] == "released"
            and worker["reason"] == "reconciled"
            and heavy["reason"] == "reconciled"
            and worker["project"] == str(project)
            and heavy["project"] == str(project)
            and worker["pid"] == receipt.get("owner_pid")
            and heavy["pid"] == receipt.get("owner_pid")
            and worker["identity"] == receipt.get("owner_identity")
            and heavy["identity"] == receipt.get("owner_identity")
            and worker["parent_id"] is None
            and heavy["parent_id"] == worker["id"]
        )
    finally:
        if own_admission and admission is not None:
            admission.close()


def rollback(home, project, config):
    config = Path(config).absolute()
    with locked(home):
        values = registry(home)
        key = str(Path(project).resolve())
        value = values[key]
        if "restage" in value:
            raise EnrollmentError("restage-requires-preserving-recovery")
        if str(config) != value["config"]:
            raise EnrollmentError("config-path-mismatch")
        if value.get("phase") == "conflict":
            raise EnrollmentError("publication-conflict-requires-reconciliation")
        require_quiescent_enrollment(home, Path(project).resolve(strict=True))
        actual = digest(config.read_bytes())
        if value.get("phase") == "rollback-prepared" and value.get(
            "rollback_publication"
        ):
            if publication_verified(config, value["rollback_publication"]):
                values.pop(key)
                save(home, values)
                return
        if actual != value["config_sha256"]:
            raise EnrollmentError("config-drift")
        raw = private_read(Path(value["backup"]), 1024 * 1024)
        if digest(raw) != value["backup_sha256"]:
            raise EnrollmentError("backup-drift")
        others = [
            v for k, v in values.items() if k != key and v["config"] == str(config)
        ]
        if not others:
            value.update(
                phase="rollback-prepared", mode="inactive", enforcement_verified=False
            )
            save(home, values)

            def prepared(publication):
                value["rollback_publication"] = publication
                save(home, values)

            publish_or_conflict(
                home,
                values,
                value,
                config,
                raw,
                value["config_sha256"],
                prepared=prepared,
            )
        values.pop(key)
        save(home, values)


def owned_block(raw):
    text = raw.decode()
    if text.count(BEGIN) != 1 or text.count(END) != 1:
        raise EnrollmentError("owned-hook-block-unconfirmed")
    start, end = text.index(BEGIN), text.index(END) + len(END)
    if end <= start:
        raise EnrollmentError("owned-hook-block-unconfirmed")
    return text[start:end].encode()


def _preference_transition(candidate, current):
    """The owner recovery contract permits these three exact operations only."""
    before, after = tomllib.loads(candidate.decode()), tomllib.loads(current.decode())
    if owned_block(candidate) != owned_block(current):
        raise EnrollmentError("restage-owned-hook-drift")
    for key in ("model", "model_reasoning_effort"):
        if (
            not isinstance(before.get(key), str)
            or not isinstance(after.get(key), str)
            or not 1 <= len(after[key]) <= 256
        ):
            raise EnrollmentError("restage-preference-transition")
        before.pop(key)
        after.pop(key)
    if not isinstance(before.get("service_tier"), str) or "service_tier" in after:
        raise EnrollmentError("restage-preference-transition")
    before.pop("service_tier")
    if before != after:
        raise EnrollmentError("restage-unrelated-config-drift")


def _verify_restage(value, config, current):
    """Keep publication history immutable; validate the explicit owner transition."""
    transition = value["restage"]
    manifest_raw = private_read(Path(transition["manifest"]), 65536)
    if digest(manifest_raw) != transition["transaction"]:
        raise EnrollmentError("restage-manifest-drift")
    manifest = json.loads(manifest_raw)
    selected = manifest["members"][transition["project"]]
    if (
        value.get("phase") not in {"canary", "enforce"}
        or value.get("mode") != value.get("phase")
        or value.get("recovery_canary") is not True
        or value.get("nonce") != selected["nonce"]
        or value.get("canary_profile") != selected["canary_profile"]
        or not isinstance(value.get("profiles"), dict)
        or not 1 <= len(value["profiles"]) <= 8
        or any(value["profiles"].get(k) != v for k, v in selected["profiles"].items())
        or (value["phase"] == "canary" and value["profiles"] != selected["profiles"])
    ):
        raise EnrollmentError("restage-proof-context-drift")
    previous_raw = private_read(Path(transition["registry"]), 65536)
    if digest(previous_raw) != manifest["registry_sha256"]:
        raise EnrollmentError("restage-history-drift")
    previous = json.loads(previous_raw)[transition["project"]]
    if (
        value.get("publication") != previous.get("publication")
        or value["code_sha256"] != manifest["code_sha256"]
        or digest(current) != manifest["config_sha256"]
    ):
        raise EnrollmentError("restage-binding-drift")
    candidate = private_read(Path(previous["candidate_config"]), 1024**2)
    publication = previous["publication"]
    if (
        digest(candidate) != previous["candidate_sha256"]
        or digest(candidate) != publication["desired_sha256"]
        or digest(private_read(Path(previous["backup"]), 1024**2))
        != previous["backup_sha256"]
        or not publication_verified(
            config, dict(publication, desired_sha256=digest(current))
        )
    ):
        raise EnrollmentError("restage-publication-history-drift")
    _preference_transition(candidate, current)


def restage_shared(home, project, config, manifest_path, expected):
    """Explicit reviewed recovery, never automatic config/code hash adoption.

    Config bytes and historical publications stay unchanged. All shared members
    move atomically to a fenced recovery canary; old native proof is invalid.
    A replay of the same committed transaction preserves new events/activation.
    """
    from host_job_profiles import install_profile, validate_profile

    home, project, config = (
        Path(home),
        Path(project).resolve(strict=True),
        Path(config).absolute(),
    )
    raw_manifest = private_read(Path(manifest_path), 65536)
    if digest(raw_manifest) != expected:
        raise EnrollmentError("reviewed-restage-drift")
    manifest = json.loads(raw_manifest)
    fields = {
        "schema",
        "registry_sha256",
        "config_sha256",
        "prior_code_sha256",
        "code_sha256",
        "members",
    }
    if (
        set(manifest) != fields
        or manifest["schema"] != "forgewright-shared-restage/v1"
        or not isinstance(manifest["members"], dict)
        or not 1 <= len(manifest["members"]) <= 32
        or any(
            not isinstance(manifest[k], str)
            or not re.fullmatch(r"[a-f0-9]{64}", manifest[k])
            for k in fields - {"schema", "members"}
        )
    ):
        raise EnrollmentError("invalid-restage-manifest")
    with locked(home):
        previous_raw = private_read(home / "enrollments.json", 65536)
        values = json.loads(previous_raw)
        members = {k: v for k, v in values.items() if v.get("config") == str(config)}
        if set(members) != set(manifest["members"]) or str(project) not in members:
            raise EnrollmentError("restage-membership-drift")
        current = config.read_bytes()
        if (
            digest(current) != manifest["config_sha256"]
            or code_binding() != manifest["code_sha256"]
        ):
            raise EnrollmentError("restage-config-or-code-drift")
        if all(
            v.get("restage", {}).get("transaction") == expected
            for v in members.values()
        ):
            for v in members.values():
                validate_binding(v)
            return {
                "status": "already-restaged",
                "members": sorted(members),
                "transaction": expected,
            }
        if digest(previous_raw) != manifest["registry_sha256"]:
            raise EnrollmentError("restage-registry-drift")
        updated = json.loads(previous_raw)
        folder = home / "restages" / expected
        pending_profiles = []
        for key, old in members.items():
            chosen = manifest["members"][key]
            if (
                set(chosen)
                != {
                    "nonce",
                    "profiles",
                    "canary_profile",
                    "retired_profiles",
                    "recipe",
                    "recipe_sha256",
                }
                or old.get("phase") not in {"canary", "enforce"}
                or old.get("source_root") != str(ROOT)
                or old.get("code_sha256") != manifest["prior_code_sha256"]
                or operator_disabled(home, key)
            ):
                raise EnrollmentError("restage-member-state-drift")
            profiles, name = chosen["profiles"], chosen["canary_profile"]
            if (
                not isinstance(profiles, dict)
                or not 1 <= len(profiles) <= 8
                or not isinstance(name, str)
                or name not in profiles
                or name in old["profiles"]
                or chosen["nonce"] == old["nonce"]
                or any(
                    old["profiles"].get(k) != v
                    for k, v in profiles.items()
                    if k != name
                )
                or chosen["retired_profiles"]
                != {k: v for k, v in old["profiles"].items() if k not in profiles}
            ):
                raise EnrollmentError("restage-profile-selection-drift")
            recipe_path = Path(chosen["recipe"])
            if (
                recipe_path.is_absolute()
                or ".." in recipe_path.parts
                or recipe_path.parts[:2] != (".forgewright", "recipes")
                or recipe_path.suffix != ".json"
            ):
                raise EnrollmentError("restage-project-recipe-required")
            recipe_raw = private_read(Path(key) / recipe_path, 16384)
            if digest(recipe_raw) != chosen["recipe_sha256"]:
                raise EnrollmentError("restage-recipe-drift")
            recipe = json.loads(recipe_raw)
            if (
                recipe.get("id") != name
                or recipe.get("project") != key
                or validate_profile(recipe).profile_digest != profiles[name]
            ):
                raise EnrollmentError("restage-recipe-binding-drift")
            pending_profiles.append((recipe, profiles[name]))
            for profile, sha in profiles.items():
                if profile != name:
                    load_profile(home, Path(key), profile, sha)
            require_quiescent_enrollment(home, Path(key))
            denied, approved = canary_paths(home, Path(key), chosen["nonce"])
            if any(p.exists() or p.is_symlink() for p in (denied, approved)):
                raise EnrollmentError("restage-marker-already-exists")
            value = updated[key]
            value.update(
                phase="canary",
                mode="canary",
                recovery_canary=True,
                nonce=chosen["nonce"],
                profiles=profiles,
                canary_profile=name,
                config_sha256=manifest["config_sha256"],
                code_sha256=manifest["code_sha256"],
                events=[],
                enforcement_verified=False,
                staged_at=time.time(),
                denied_marker=str(denied),
                approved_marker=str(approved),
                restage={
                    "transaction": expected,
                    "project": key,
                    "manifest": str(folder / "manifest.json"),
                    "registry": str(folder / "registry-before.json"),
                },
            )
            value.pop("native_proof", None)
            command = shlex.join(
                [
                    sys.executable,
                    "-c",
                    "from pathlib import Path;Path("
                    + repr(str(denied))
                    + ').write_text("unexpected")',
                ]
            )
            value.update(
                deny_command=command, deny_command_sha256=digest(command.encode())
            )
            # Check history now, before any registry publication.
            # The private transaction snapshots are written below only after all
            # members and quiescence have passed.
            candidate = private_read(Path(old["candidate_config"]), 1024**2)
            publication = old["publication"]
            if (
                digest(candidate) != old["candidate_sha256"]
                or digest(candidate) != publication["desired_sha256"]
                or digest(private_read(Path(old["backup"]), 1024**2))
                != old["backup_sha256"]
                or not publication_verified(
                    config, dict(publication, desired_sha256=digest(current))
                )
            ):
                raise EnrollmentError("restage-publication-history-drift")
            _preference_transition(candidate, current)
        for filename, raw in {
            "manifest.json": raw_manifest,
            "registry-before.json": previous_raw,
            "config-before.toml": current,
        }.items():
            path = folder / filename
            if path.exists() and private_read(path, 1024**2) != raw:
                raise EnrollmentError("restage-archive-drift")
            if not path.exists():
                atomic_private(path, raw)
        for recipe, sha in pending_profiles:
            if install_profile(home, recipe) != sha:
                raise EnrollmentError("restage-installed-profile-drift")
        if (
            private_read(home / "enrollments.json", 65536) != previous_raw
            or config.read_bytes() != current
            or code_binding() != manifest["code_sha256"]
        ):
            raise EnrollmentError("restage-concurrent-drift")
        save(home, updated)
        return {
            "status": "restaged-canary-only",
            "members": sorted(members),
            "transaction": expected,
            "enforcement_verified": False,
        }


def reconcile_trust(home, project, config):
    """Explicitly bind only the observed owned-hook trusted_hash addition.

    No trust is granted here. Actual native deny/rewrite and exact job evidence
    remain required. Other config edits, code drift and enforcement reject.
    """
    home, project, config = (
        Path(home),
        Path(project).resolve(strict=True),
        Path(config).absolute(),
    )
    with locked(home):
        values = registry(home)
        value = values[str(project)]
        if value.get("phase") != "canary" or value.get("mode") != "canary":
            raise EnrollmentError("trust-reconciliation-canary-only")
        if value["source_root"] != str(ROOT) or value["code_sha256"] != code_binding():
            raise EnrollmentError("code-drift")
        if str(config) != value["config"]:
            raise EnrollmentError("config-scope-mismatch")
        require_quiescent_enrollment(home, project)
        candidate = private_read(Path(value["candidate_config"]), 1024**2)
        if digest(candidate) != value.get("candidate_sha256", value["config_sha256"]):
            raise EnrollmentError("candidate-config-drift")
        before = tomllib.loads(candidate.decode())
        current = config.read_bytes()
        after = tomllib.loads(current.decode())
        owned = tomllib.loads(owned_block(candidate).decode())["hooks"]["PreToolUse"][0]
        groups = before.get("hooks", {}).get("PreToolUse", [])
        indices = [i for i, group in enumerate(groups) if group == owned]
        if len(indices) != 1 or len(owned.get("hooks", [])) != 1:
            raise EnrollmentError("owned-hook-block-unconfirmed")
        key = str(config) + ":pre_tool_use:" + str(indices[0]) + ":0"
        state = after.get("hooks", {}).get("state", {})
        trusted = state.get(key) if isinstance(state, dict) else None
        if (
            not isinstance(trusted, dict)
            or set(trusted) != {"trusted_hash"}
            or not re.fullmatch(r"sha256:[a-f0-9]{64}", trusted.get("trusted_hash", ""))
        ):
            raise EnrollmentError("owned-hook-trust-state-unconfirmed")
        observed_trust = dict(trusted)
        for document in (before, after):
            hooks = document.get("hooks", {})
            states = hooks.get("state", {})
            if not isinstance(states, dict):
                raise EnrollmentError("trust-reconciliation-unrelated-drift")
            states.pop(key, None)
            if not states:
                hooks.pop("state", None)
        if before != after:
            raise EnrollmentError("trust-reconciliation-unrelated-drift")
        publication = dict(value["publication"], desired_sha256=digest(current))
        if not publication_verified(config, publication):
            raise EnrollmentError("config-drift-preserved")
        value.update(
            config_sha256=digest(current),
            publication=publication,
            events=[],
            enforcement_verified=False,
            trust_reconciliation={
                "changed_field": key,
                "from_config_sha256": value["config_sha256"],
                "to_config_sha256": digest(current),
                "observed_trusted_hash": observed_trust["trusted_hash"],
                "observed_at": time.time(),
                "authority": "bookkeeping-only; native canary required",
            },
        )
        save(home, values)
        return value


def deactivate_preserving_edits(home, project, config):
    """Owner control: remove only the exact owned block from current bytes."""
    home, project, config = (
        Path(home),
        Path(project).resolve(strict=True),
        Path(config).absolute(),
    )
    with locked(home):
        values = registry(home)
        key = str(project)
        value = values[key]
        if value["config"] != str(config) or value["source_root"] != str(ROOT):
            raise EnrollmentError("config-scope-mismatch")
        require_quiescent_enrollment(home, project)
        if any(k != key and v["config"] == str(config) for k, v in values.items()):
            raise EnrollmentError(
                "shared-hook-deactivation-requires-coordinated-reconciliation"
            )
        if value.get("deactivation_publication") and publication_verified(
            config, value["deactivation_publication"]
        ):
            values.pop(key)
            save(home, values)
            return
        candidate = private_read(Path(value["candidate_config"]), 1024**2)
        if digest(candidate) != value.get("candidate_sha256", value["config_sha256"]):
            raise EnrollmentError("candidate-config-drift")
        expected_block = owned_block(candidate)
        current = config.read_bytes()
        actual_block = owned_block(current)
        disabled_block = expected_block.replace(
            b'matcher = "Bash"', b'matcher = "^$"', 1
        )
        if actual_block not in (expected_block, disabled_block):
            raise EnrollmentError("owned-hook-block-drift")
        parsed = tomllib.loads(current.decode())
        group = tomllib.loads(actual_block.decode())["hooks"]["PreToolUse"][0]
        groups = parsed.get("hooks", {}).get("PreToolUse", [])
        indices = [i for i, item in enumerate(groups) if item == group]
        if len(indices) != 1 or indices[0] != len(groups) - 1:
            raise EnrollmentError("following-hook-requires-reconciliation")
        updated = current.replace(actual_block, b"", 1)
        after = tomllib.loads(updated.decode())
        parsed["hooks"]["PreToolUse"].pop()
        if parsed["hooks"]["PreToolUse"] == []:
            parsed["hooks"].pop("PreToolUse")
        if not parsed["hooks"]:
            parsed.pop("hooks")
        if parsed != after:
            raise EnrollmentError("deactivation-changes-unrelated-config")
        value.update(
            phase="deactivate-prepared", mode="inactive", enforcement_verified=False
        )
        save(home, values)

        def prepared(publication):
            value["deactivation_publication"] = publication
            save(home, values)

        publish_or_conflict(
            home, values, value, config, updated, digest(current), prepared=prepared
        )
        values.pop(key)
        save(home, values)


def publish_or_conflict(home, values, value, config, raw, expected, *, prepared):
    try:
        return publish_config(config, raw, expected, prepared=prepared)
    except EnrollmentError as error:
        if str(error) in {"config-drift", "config-drift-preserved"}:
            value.update(
                phase="conflict",
                mode="inactive",
                enforcement_verified=False,
                conflict=str(error),
            )
            save(home, values)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--home", type=Path, default=Path.home() / ".forgewright/runtime/admission"
    )
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    commands = parser.add_subparsers(dest="action", required=True)
    staged = commands.add_parser("stage")
    staged.add_argument(
        "--profiles",
        type=Path,
        required=True,
        help="Reviewed JSON mapping profile ID to exact digest",
    )
    staged.add_argument("--nonce", required=True)
    staged.add_argument("--canary-profile")
    commands.add_parser("activate")
    commands.add_parser("rollback")
    commands.add_parser("reconcile-trust")
    restaged = commands.add_parser("restage-shared")
    restaged.add_argument("--manifest", type=Path, required=True)
    restaged.add_argument("--sha256", required=True)
    commands.add_parser("deactivate")
    args = parser.parse_args(argv)
    try:
        if args.action == "stage":
            result = stage(
                args.home,
                args.project,
                args.config,
                json.loads(args.profiles.read_bytes()),
                args.nonce,
                canary_profile=args.canary_profile,
            )
        elif args.action == "restage-shared":
            result = restage_shared(
                args.home, args.project, args.config, args.manifest, args.sha256
            )
        elif args.action == "reconcile-trust":
            result = reconcile_trust(args.home, args.project, args.config)
        elif args.action == "deactivate":
            deactivate_preserving_edits(args.home, args.project, args.config)
            result = {
                "status": "deactivated-preserving-edits",
                "enforcement_verified": False,
            }
        elif args.action == "activate":
            result = activate(args.home, args.project, args.config)
        else:
            rollback(args.home, args.project, args.config)
            result = {"status": "rolled-back", "enforcement_verified": False}
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, ValueError, KeyError, TypeError, EnrollmentError) as error:
        print(
            json.dumps(
                {
                    "error": str(error)
                    if isinstance(error, EnrollmentError)
                    else "enrollment-unavailable"
                }
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
