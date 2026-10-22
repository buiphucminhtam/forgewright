"""Finite owner controls. No shell, process launch, or execution authority.

Registration is a local owner review boundary; hashes do not authenticate a
hostile same-user writer. Source/profile validation remains mandatory at launch.
"""
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import subprocess
import time

from host_job_profiles import digest, install_profile, private_read, validate_profile
from project_storage import _open_directory


class ControlError(ValueError):
    pass


def _parts(name):
    if not isinstance(name, str) or not 1 <= len(name) <= 4096 or "\0" in name:
        raise ControlError("invalid-inspection-path")
    path = Path(name)
    if path.is_absolute() or ".." in path.parts:
        raise ControlError("unsafe-inspection-path")
    parts = path.parts
    for i, part in enumerate(parts):
        folded = part.casefold()
        if (folded in {".git", ".ssh", ".codex", ".aws", ".gnupg"}
                or folded == ".env" or folded.startswith(".env.")
                or folded.endswith((".pem", ".key", ".p12"))
                or folded in {"credentials", "id_rsa", "id_ed25519"}
                or (i and parts[i - 1].casefold() == ".forgewright"
                    and folded in {"memory", "memory.db", "memory.db-wal", "memory.db-shm", "runtime", "verify"})):
            raise ControlError("private-inspection-path")
    return parts


def _open(root_fd, parts):
    """Walk from an anchored directory, rejecting symlinks at every hop."""
    descriptor = os.dup(root_fd)
    try:
        for i, part in enumerate(parts):
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
            if i < len(parts) - 1:
                flags |= os.O_DIRECTORY
            child = os.open(part, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _bounded_file(root_fd, parts, limit, *, private=False):
    descriptor = _open(root_fd, parts)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ControlError("inspection-file-budget")
        if private and (info.st_uid != os.getuid() or info.st_mode & 0o077):
            raise ControlError("unsafe-profile-file")
        raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise ControlError("inspection-file-budget")
        return raw


def _integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ControlError("invalid-inspection-budget")
    return value


def inspect_workspace(project, request):
    """Read at most 1 MiB, scan 10,000 entries/2 seconds, emit <=64 KiB."""
    if not isinstance(request, dict) or len(json.dumps(request)) > 8192:
        raise ControlError("invalid-inspection")
    operation = request.get("op")
    allowed = {"read": {"op", "path", "start", "lines"},
               "list": {"op", "path"}, "search": {"op", "path", "query"}}
    if operation not in allowed or set(request) - allowed[operation]:
        raise ControlError("invalid-inspection")
    parts = _parts(request.get("path", "."))
    root = _open_directory(Path(project).resolve(strict=True))
    result = {"authority": "read-only", "op": operation, "truncated": False}
    try:
        if operation == "read":
            start = _integer(request.get("start", 1), 1, 100000)
            count = _integer(request.get("lines", 200), 1, 1000)
            raw = _bounded_file(root, parts, 1024**2)
            lines = raw.decode("utf-8").splitlines(keepends=True)
            text = "".join(lines[start - 1:start - 1 + count])
            encoded = text.encode()
            result.update(text=encoded[:10000].decode("utf-8", errors="ignore"),
                          sha256=digest(raw),
                          truncated=len(encoded) > 10000 or len(lines) >= start + count)
            return result
        query = request.get("query")
        if operation == "search" and (not isinstance(query, str) or not 1 <= len(query) <= 256):
            raise ControlError("invalid-inspection-query")
        pending = [parts]
        entries = []; matches = []; visited = 0; read_bytes = 0; emitted = 0
        deadline = time.monotonic() + 2
        while pending:
            if time.monotonic() > deadline or visited >= 10000 or emitted >= 60000:
                result["truncated"] = True; break
            current = pending.pop()
            descriptor = _open(root, current)
            try:
                info = os.fstat(descriptor)
                if stat.S_ISDIR(info.st_mode):
                    # scandir is incremental; never allocate an unbounded listdir.
                    with os.scandir(descriptor) as scan:
                        for entry in scan:
                            visited += 1
                            if visited > 10000 or time.monotonic() > deadline:
                                result["truncated"] = True; pending.clear(); break
                            candidate = (*current, entry.name)
                            try:
                                _parts(str(Path(*candidate)))
                            except ControlError:
                                continue
                            if entry.is_symlink():
                                continue
                            if operation == "list":
                                emitted += len(json.dumps(entry.name).encode()) + 8
                                if len(entries) >= 1000 or emitted > 60000:
                                    result["truncated"] = True; break
                                entries.append(entry.name)
                            elif entry.name not in {"node_modules", ".venv", "vendor"}:
                                pending.append(candidate)
                                if len(pending) >= 10000:
                                    result["truncated"] = True; break
                elif stat.S_ISREG(info.st_mode) and operation == "search":
                    if info.st_size > 256 * 1024 or read_bytes + info.st_size > 1024**2:
                        result["truncated"] = True; continue
                    raw = _bounded_file(root, current, 256 * 1024)
                    read_bytes += len(raw)
                    if b"\0" in raw:
                        continue
                    for number, line in enumerate(raw.decode("utf-8", errors="replace").splitlines(), 1):
                        if query in line:
                            item = {"path": str(Path(*current)), "line": number, "text": line[:1000]}
                            emitted += len(json.dumps(item).encode())
                            if len(matches) >= 100 or emitted > 60000:
                                result["truncated"] = True; pending.clear(); break
                            matches.append(item)
            finally:
                os.close(descriptor)
            if operation == "list":
                break
        result.update(entries=sorted(entries)) if operation == "list" else result.update(matches=sorted(matches, key=lambda x: (x["path"], x["line"])))
        return result
    except (OSError, UnicodeError) as error:
        raise ControlError("inspection-unavailable") from error
    finally:
        os.close(root)


def register_profile(home, project, filename, expected):
    """Install an exact owner-reviewed project recipe, without launching it."""
    from resource_enrollment import locked, registry, save, validate_binding

    project = Path(project).resolve(strict=True)
    path = Path(filename)
    if path.is_absolute():
        try:
            path = path.relative_to(project)
        except ValueError as error:
            raise ControlError("profile-outside-project") from error
    parts = _parts(str(path))
    if len(parts) < 3 or parts[:2] != (".forgewright", "recipes") or path.suffix != ".json":
        raise ControlError("project-recipe-required")
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ControlError("invalid-profile-sha256")
    root = _open_directory(project)
    try:
        raw = _bounded_file(root, parts, 16384, private=True)
    finally:
        os.close(root)
    if digest(raw) != expected:
        raise ControlError("reviewed-profile-drift")
    value = json.loads(raw)
    if value.get("project") != str(project):
        raise ControlError("profile-project-mismatch")
    validate_profile(value)
    with locked(Path(home)):
        values = registry(Path(home)); enrollment = values.get(str(project))
        if enrollment:
            validate_binding(enrollment)
            if value["id"] not in enrollment["profiles"] and len(enrollment["profiles"]) >= 8:
                raise ControlError("enrollment-profile-limit")
        installed = install_profile(home, value)
        if enrollment:
            enrollment["profiles"][value["id"]] = installed
            save(Path(home), values)
    return {"status": "registered", "profile": value["id"], "digest": installed,
            "executed": False, "enrolled": bool(enrollment)}


def _strict_process_census():
    try:
        proc = subprocess.run(
            ["/bin/ps", "-ax", "-o", "pid=,ppid=,pgid=,stat=,lstart="],
            capture_output=True,
            text=True,
            timeout=4,
            check=True,
            env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "LANG": "C"},
        )
    except (OSError, subprocess.SubprocessError) as error:
        return {"complete": False, "error": type(error).__name__, "rows": {}}
    lines = [line for line in proc.stdout.splitlines() if line.strip()]
    if not lines:
        return {"complete": False, "error": "empty-ps-output", "rows": {}}
    rows = {}
    for line in lines:
        parts = line.split()
        if len(parts) != 9:
            return {"complete": False, "error": "malformed-ps-row", "rows": {}}
        try:
            pid, ppid, pgid = int(parts[0]), int(parts[1]), int(parts[2])
        except ValueError:
            return {"complete": False, "error": "non-integer-ps-ids", "rows": {}}
        birth = digest((str(pid) + ":" + " ".join(parts[4:])).encode())
        rows[pid] = {"ppid": ppid, "pgid": pgid, "stat": parts[3], "birth": birth}
    return {"complete": True, "rows": rows}


def reconcile_quarantined_plan(home, project, plan_file, expected_sha256, *, apply=False):
    """Inspect or apply an owner-reviewed quarantine reconciliation plan."""
    from host_admission import HostAdmission
    from resource_enrollment import atomic_private, code_binding, locked, registry

    home = Path(home)
    project = Path(project).resolve(strict=True)
    if not isinstance(expected_sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise ControlError("invalid-reconcile-plan-sha256")
    candidate = Path(plan_file)
    if not candidate.is_absolute():
        candidate = (project / candidate).resolve(strict=False)
    if not candidate.is_relative_to(project):
        raise ControlError("reconcile-plan-outside-project")
    raw_plan = private_read(candidate, 65536)
    if digest(raw_plan) != expected_sha256:
        raise ControlError("reviewed-reconcile-plan-drift")
    plan = json.loads(raw_plan)
    if (
        not isinstance(plan, dict)
        or plan.get("schema") != "forgewright-quarantine-reconcile-plan/v3"
        or plan.get("project") != str(project)
        or not re.fullmatch(r"job-[0-9a-f]{32}", str(plan.get("job_id", "")))
        or not re.fullmatch(r"[0-9a-f]{32}", str(plan.get("native_request_id", "")))
        or not re.fullmatch(r"[0-9a-f]{64}", str(plan.get("journal_sha256", "")))
        or not re.fullmatch(r"[0-9a-f]{64}", str(plan.get("native_request_sha256", "")))
        or not re.fullmatch(r"[0-9a-f]{64}", str(plan.get("live_code_sha256", "")))
        or not re.fullmatch(r"[0-9a-f]{64}", str(plan.get("config_sha256", "")))
        or type(plan.get("owner_pid")) is not int
        or type(plan.get("child_pid")) is not int
        or not isinstance(plan.get("owner_identity"), str)
        or not isinstance(plan.get("child_identity"), str)
        or not isinstance(plan.get("preserve_storage_path"), str)
        or type(plan.get("preserve_storage_device")) is not int
        or type(plan.get("preserve_storage_inode")) is not int
        or not isinstance(plan.get("leases"), list)
        or len(plan["leases"]) != 2
    ):
        raise ControlError("invalid-reconcile-plan")

    job_id = plan["job_id"]
    req_id = plan.get("native_request_id", "")
    journal_path = home / "jobs" / f"{job_id}.json"
    req_path = home / "native-requests" / f"{req_id}.json"
    if (
        ("journal_path" in plan and Path(plan["journal_path"]) != journal_path)
        or ("native_request_path" in plan and Path(plan["native_request_path"]) != req_path)
    ):
        raise ControlError("reconcile-noncanonical-authority-path")
    reconcile_dir = home / "reconciliations"
    intent_path = reconcile_dir / f"{job_id}.intent.json"
    heavy_step_path = reconcile_dir / f"{job_id}.step-heavy.json"
    worker_step_path = reconcile_dir / f"{job_id}.step-worker.json"
    closure_path = reconcile_dir / f"{job_id}.json"

    def write_once_or_match(path, payload):
        raw = (json.dumps(payload, sort_keys=True) + "\n").encode("utf-8")
        if path.exists():
            if private_read(path, 65536) != raw:
                raise ControlError(f"conflicting-recovery-artifact:{path.name}")
            return digest(raw)
        atomic_private(path, raw)
        return digest(raw)

    def evaluate_state(allow_partial_flag):
        if code_binding() != plan["live_code_sha256"]:
            raise ControlError("reconcile-code-binding-drift")
        enrolled_cfg = registry(home).get(str(project), {}).get("config")
        cfg_path = Path(plan.get("config_path") or enrolled_cfg or (Path.home() / ".codex/config.toml"))
        if enrolled_cfg and cfg_path != Path(enrolled_cfg):
            raise ControlError("reconcile-config-path-mismatch")
        if not cfg_path.is_file() or cfg_path.is_symlink() or digest(cfg_path.read_bytes()) != plan["config_sha256"]:
            raise ControlError("reconcile-config-sha256-drift")
        raw_journal = private_read(journal_path, 128 * 1024)
        raw_req = private_read(req_path, 65536)
        if (
            digest(raw_journal) != plan.get("journal_sha256")
            or digest(raw_req) != plan.get("native_request_sha256")
        ):
            raise ControlError("reconcile-target-artifact-drift")
        journal = json.loads(raw_journal)
        req = json.loads(raw_req)
        child = journal.get("child") or {}
        context = req.get("context") or {}
        if (
            journal.get("state") != "quarantined"
            or journal.get("job_id") != job_id
            or journal.get("physical_workspace") != str(project)
            or journal.get("owner_pid") != plan["owner_pid"]
            or journal.get("owner_identity") != plan["owner_identity"]
            or child.get("pid") != plan["child_pid"]
            or child.get("identity") != plan["child_identity"]
            or journal.get("native_context") != context
            or req.get("state") != "claimed"
            or context.get("job_id") != job_id
            or context.get("physical_workspace") != str(project)
        ):
            raise ControlError("reconcile-target-not-quarantined")

        storage_meta = journal.get("storage") or {}
        storage_path = Path(plan["preserve_storage_path"])
        if str(storage_path) != storage_meta.get("path"):
            raise ControlError("reconcile-storage-path-mismatch")
        storage_info = storage_path.lstat()
        if not stat.S_ISDIR(storage_info.st_mode):
            raise ControlError("reconcile-storage-missing")
        if (
            storage_info.st_dev != plan["preserve_storage_device"]
            or storage_info.st_ino != plan["preserve_storage_inode"]
            or ("device" in storage_meta and storage_meta["device"] != plan["preserve_storage_device"])
            or ("inode" in storage_meta and storage_meta["inode"] != plan["preserve_storage_inode"])
        ):
            raise ControlError("reconcile-storage-identity-drift")

        journal_leases = journal.get("leases")
        if not isinstance(journal_leases, list) or len(journal_leases) != 2:
            raise ControlError("reconcile-journal-leases-invalid")
        j_by_kind = {item.get("kind"): item for item in journal_leases if isinstance(item, dict)}
        p_by_kind = {item.get("kind"): item for item in plan["leases"] if isinstance(item, dict)}
        if set(j_by_kind) != {"worker", "heavy"} or set(p_by_kind) != {"worker", "heavy"}:
            raise ControlError("reconcile-lease-kinds-invalid")
        for k in ("worker", "heavy"):
            pspec = p_by_kind[k]
            jspec = j_by_kind[k]
            if (
                pspec.get("id") != jspec.get("id")
                or type(pspec.get("memory_bytes")) is not int
                or pspec["memory_bytes"] <= 0
                or pspec.get("parent_id") != (None if k == "worker" else p_by_kind["worker"]["id"])
                or not isinstance(jspec.get("token"), str)
                or len(jspec["token"]) < 32
            ):
                raise ControlError(f"reconcile-plan-journal-lease-mismatch:{k}")

        census = _strict_process_census()
        if not census["complete"]:
            return {"status": "unknown", "reason": f"census-incomplete:{census['error']}", "mutated": False}
        rows = census["rows"]
        for keep_pid in plan.get("keep_pids", []):
            if keep_pid not in rows:
                return {"status": "blocked", "reason": f"protected-pid-missing:{keep_pid}", "mutated": False}
        owner_pid = plan["owner_pid"]
        child_pid = plan["child_pid"]
        if owner_pid in rows:
            return {"status": "blocked", "reason": "owner-pid-present-in-census", "mutated": False}
        if child_pid in rows:
            return {"status": "blocked", "reason": "child-pid-present-in-census", "mutated": False}
        survivors = [
            {"pid": pid, "ppid": item["ppid"], "pgid": item["pgid"]}
            for pid, item in rows.items()
            if item["pgid"] == child_pid or item["ppid"] in {owner_pid, child_pid}
        ]
        if survivors:
            return {
                "status": "blocked",
                "reason": "owned-process-or-group-present",
                "survivors": survivors[:8],
                "mutated": False,
            }

        sup_diag = journal.get("supervision_diagnostics")
        drain_sha = plan.get("drain_evidence_sha256")
        drain_file = plan.get("drain_evidence_path")
        resolved_drain_path = None
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
        if diag_valid:
            for esc in esc_list:
                esc_pid = esc.get("pid")
                if esc_pid in rows and rows[esc_pid].get("birth") == esc.get("birth"):
                    return {"status": "blocked", "reason": f"escaped-child-still-present:{esc_pid}", "mutated": False}
        else:
            if not drain_file or not isinstance(drain_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", drain_sha):
                return {
                    "status": "unknown",
                    "reason": "unpersisted-escaped-descendant-history-requires-reviewed-drain-evidence",
                    "mutated": False,
                }
            drain_candidate = Path(drain_file)
            if not drain_candidate.is_absolute():
                drain_candidate = (project / drain_candidate).resolve(strict=False)
            if not drain_candidate.is_relative_to(project):
                return {"status": "blocked", "reason": "drain-evidence-outside-project", "mutated": False}
            resolved_drain_path = str(drain_candidate)
            raw_drain = private_read(drain_candidate, 65536)
            if digest(raw_drain) != drain_sha:
                return {"status": "blocked", "reason": "drain-evidence-sha256-mismatch", "mutated": False}
            drain_obj = json.loads(raw_drain)
            if (
                not isinstance(drain_obj, dict)
                or drain_obj.get("schema") != "forgewright-operator-escape-drain-evidence/v1"
                or drain_obj.get("job_id") != job_id
                or drain_obj.get("journal_sha256") != plan["journal_sha256"]
                or drain_obj.get("decision") != "drained_verified_by_operator_and_reviewer"
                or not re.fullmatch(r"[0-9a-f]{64}", str(drain_obj.get("reviewer_sha256", "")))
            ):
                return {"status": "blocked", "reason": "drain-evidence-contract-mismatch", "mutated": False}

        db_path = home / "host.sqlite3"
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            observed = {}
            expected_leases = {}
            for spec in plan["leases"]:
                row = conn.execute(
                    "SELECT id, project, run_id, kind, state, reason, memory_bytes, pid, identity, parent_id, created, granted FROM jobs WHERE id=?",
                    (spec["id"],),
                ).fetchone()
                if row is None:
                    return {"status": "blocked", "reason": f"missing-lease-row:{spec['id']}", "mutated": False}
                data = dict(row)
                if (
                    data["project"] != str(project)
                    or data["run_id"] != job_id
                    or data["kind"] != spec["kind"]
                    or data["memory_bytes"] != spec["memory_bytes"]
                    or data["pid"] != owner_pid
                    or data["identity"] != plan["owner_identity"]
                    or data["parent_id"] != spec["parent_id"]
                    or not isinstance(data.get("created"), (int, float))
                    or not isinstance(data.get("granted"), (int, float))
                ):
                    return {"status": "blocked", "reason": f"lease-binding-mismatch:{spec['id']}", "mutated": False}
                observed[spec["kind"]] = data
                expected_leases[spec["kind"]] = {
                    "id": data["id"],
                    "state": "released",
                    "kind": data["kind"],
                    "reason": "reconciled",
                    "memoryMiB": data["memory_bytes"] // (1024 * 1024),
                    "parentLeaseId": data["parent_id"],
                    "waitMs": max(0, round((data["granted"] - data["created"]) * 1000)),
                }
        finally:
            conn.close()

        states = (observed["heavy"]["state"], observed["worker"]["state"])
        reasons = (observed["heavy"]["reason"], observed["worker"]["reason"])
        if states == ("quarantined", "quarantined"):
            lease_state = "both_quarantined"
        elif allow_partial_flag and states == ("released", "quarantined") and reasons[0] == "reconciled":
            lease_state = "partial_heavy_released"
        elif allow_partial_flag and states == ("released", "released") and reasons == ("reconciled", "reconciled"):
            lease_state = "both_released"
        else:
            return {"status": "blocked", "reason": f"unexpected-lease-states:{states[0]},{states[1]}", "mutated": False}

        expected_intent = {
            "schema": "forgewright-quarantine-reconcile-intent/v1",
            "project": str(project),
            "job_id": job_id,
            "plan_path": str(candidate),
            "plan_sha256": expected_sha256,
            "journal_sha256": plan["journal_sha256"],
            "native_request_sha256": plan["native_request_sha256"],
            "drain_evidence_path": resolved_drain_path,
            "drain_evidence_sha256": drain_sha,
            "preserve_storage_path": str(storage_path),
            "preserve_storage_device": storage_info.st_dev,
            "preserve_storage_inode": storage_info.st_ino,
        }
        if lease_state in {"partial_heavy_released", "both_released"} and not intent_path.exists():
            return {"status": "blocked", "reason": "partial-or-released-rows-without-prior-intent", "mutated": False}
        expected_intent_raw = (json.dumps(expected_intent, sort_keys=True) + "\n").encode("utf-8")
        if intent_path.exists():
            if private_read(intent_path, 65536) != expected_intent_raw:
                return {"status": "blocked", "reason": "conflicting-existing-intent", "mutated": False}
        for kind, step_path in (("heavy", heavy_step_path), ("worker", worker_step_path)):
            expected_step = {
                "schema": "forgewright-quarantine-reconcile-step/v1",
                "job_id": job_id,
                "kind": kind,
                "plan_sha256": expected_sha256,
                "lease": expected_leases[kind],
            }
            expected_step_raw = (json.dumps(expected_step, sort_keys=True) + "\n").encode("utf-8")
            if step_path.exists():
                if lease_state == "both_quarantined" or (kind == "worker" and lease_state == "partial_heavy_released"):
                    return {"status": "blocked", "reason": f"unexpected-step-artifact-before-release:{kind}", "mutated": False}
                if private_read(step_path, 65536) != expected_step_raw:
                    return {"status": "blocked", "reason": f"conflicting-existing-step:{kind}", "mutated": False}
        expected_closure = {
            "schema": "forgewright-failed-safe-closure/v1",
            "project": str(project),
            "job_id": job_id,
            "journal_sha256": plan["journal_sha256"],
            "native_request_id": req_id,
            "native_request_sha256": plan["native_request_sha256"],
            "plan_path": str(candidate),
            "plan_sha256": expected_sha256,
            "drain_evidence_path": resolved_drain_path,
            "drain_evidence_sha256": drain_sha,
            "preserve_storage_path": str(storage_path),
            "preserve_storage_device": storage_info.st_dev,
            "preserve_storage_inode": storage_info.st_ino,
            "leases": [expected_leases["heavy"], expected_leases["worker"]],
            "original_failure_preserved": True,
            "storage_untouched": True,
        }
        expected_closure_raw = (json.dumps(expected_closure, sort_keys=True) + "\n").encode("utf-8")
        if closure_path.exists():
            if lease_state != "both_released":
                return {"status": "blocked", "reason": "unexpected-closure-receipt-while-leases-unreleased", "mutated": False}
            if private_read(closure_path, 65536) != expected_closure_raw:
                return {"status": "blocked", "reason": "conflicting-existing-closure-receipt", "mutated": False}

        return {
            "status": "eligible",
            "mutated": False,
            "job_id": job_id,
            "lease_state": lease_state,
            "leases": observed,
            "census_size": len(rows),
            "_journal": journal,
            "_expected_intent": expected_intent,
            "_resolved_drain_path": resolved_drain_path,
            "_drain_sha": drain_sha,
            "_storage_dev": storage_info.st_dev,
            "_storage_ino": storage_info.st_ino,
        }

    initial = evaluate_state(allow_partial_flag=bool(apply))
    if not apply or initial["status"] != "eligible":
        return {k: v for k, v in initial.items() if not k.startswith("_")}

    with locked(home):
        recheck = evaluate_state(allow_partial_flag=True)
        if recheck["status"] != "eligible":
            return {k: v for k, v in recheck.items() if not k.startswith("_")}
        journal = recheck["_journal"]
        reconcile_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        write_once_or_match(intent_path, recheck["_expected_intent"])
        leases_by_kind = {item["kind"]: item for item in journal["leases"]}
        admission = HostAdmission(home)
        try:
            released = []
            for kind in ("heavy", "worker"):
                lease = leases_by_kind[kind]
                row = admission.reconcile_quarantined(
                    job_id=lease["id"],
                    token=lease["token"],
                    project_root=str(project),
                    run_id=job_id,
                    owner_pid=plan["owner_pid"],
                    owner_identity=plan["owner_identity"],
                )
                if row.get("state") != "released":
                    raise ControlError(f"reconcile-not-released:{kind}")
                step_path = heavy_step_path if kind == "heavy" else worker_step_path
                write_once_or_match(
                    step_path,
                    {
                        "schema": "forgewright-quarantine-reconcile-step/v1",
                        "job_id": job_id,
                        "kind": kind,
                        "plan_sha256": expected_sha256,
                        "lease": row,
                    },
                )
                released.append(row)
        finally:
            admission.close()

        post_storage = Path(plan.get("preserve_storage_path") or journal.get("storage", {}).get("path", "")).lstat()
        if (
            digest(private_read(journal_path, 128 * 1024)) != plan["journal_sha256"]
            or digest(private_read(req_path, 65536)) != plan["native_request_sha256"]
            or not stat.S_ISDIR(post_storage.st_mode)
            or (post_storage.st_dev, post_storage.st_ino) != (recheck["_storage_dev"], recheck["_storage_ino"])
        ):
            raise ControlError("reconcile-postcheck-artifact-mutated")
        closure = {
            "schema": "forgewright-failed-safe-closure/v1",
            "project": str(project),
            "job_id": job_id,
            "journal_sha256": plan["journal_sha256"],
            "native_request_id": req_id,
            "native_request_sha256": plan["native_request_sha256"],
            "plan_path": str(candidate),
            "plan_sha256": expected_sha256,
            "drain_evidence_path": recheck["_resolved_drain_path"],
            "drain_evidence_sha256": recheck["_drain_sha"],
            "preserve_storage_path": str(plan["preserve_storage_path"]),
            "preserve_storage_device": recheck["_storage_dev"],
            "preserve_storage_inode": recheck["_storage_ino"],
            "leases": released,
            "original_failure_preserved": True,
            "storage_untouched": True,
        }
        closure_sha = write_once_or_match(closure_path, closure)
        return {
            "status": "reconciled",
            "mutated": True,
            "job_id": job_id,
            "closure_receipt": str(closure_path),
            "closure_sha256": closure_sha,
            "leases": released,
        }
