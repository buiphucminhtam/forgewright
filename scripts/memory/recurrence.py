"""Bounded project-local diagnostics and evidence-qualified, untrusted context.

The caller owns opt-in and host delivery. Nothing here grants execution or
Foundry acceptance/promotion authority. Capture inspects existing evidence; it
never replays verifier commands. Keyless bindings cannot authenticate against a
malicious writer with the same local-user permissions.
"""

from __future__ import annotations

from contextlib import contextmanager, closing
from contextvars import ContextVar
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import stat
import subprocess
import sys
import time
from types import SimpleNamespace

import memory_common

EVENT_BYTES = 8192
MAX_EVENTS = 256
TTL_SECONDS = 86400
CONTEXT_CHARS = 2000
MAX_SOURCE_BYTES = 2 * 1024 * 1024
MAX_METADATA_BYTES = 32768
# Per-call cooperative bounds, shared across SQL, candidate work and file reads.
# Exhaustion is a no-match, not a claim that an input or a job is unsafe.
LOOKUP_TIMEOUT_SECONDS = 0.1
LOOKUP_MAX_READ_BYTES = 8 * 1024 * 1024
LOOKUP_MAX_CANDIDATES = 24
LOOKUP_SQL_MAX_STEPS = 100_000
LOOKUP_SQL_PROGRESS_INTERVAL = 1000
PROJECTION_REF = ".forgewright/runtime/memory/recurrence/diagnostics.json"
PROJECTION_SCHEMA = "forgewright-recurrence-diagnostics/v1"
LESSON_SCHEMA = "forgewright-recurrence-lesson/v1"
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
DIGEST = re.compile(r"[a-f0-9]{64}\Z")
JOB_ID = re.compile(r"job-[a-f0-9]{32}\Z")
POISON = re.compile(
    r"(?:ignore|override|bypass|disregard)\s+(?:(?:all|the|any)\s+)?"
    r"(?:previous|prior|system|developer|safety|guardrail)|"
    r"<\|(?:system|assistant|developer)|\[/?INST\]|"
    r"(?:^|\n)\s*(?:system|developer)\s*:|```",
    re.IGNORECASE,
)
LIMITATION = (
    "Project-local untrusted context only; keyless evidence does not authenticate "
    "reviewer identity against same-user forgery."
)


class RecurrenceError(ValueError):
    """Only stable, non-sensitive diagnostic codes leave this adapter."""


class LookupBudgetExhausted(RecurrenceError):
    """Stop the entire lookup rather than skipping to the next candidate."""


class _LookupBudget:
    def __init__(self):
        self.deadline = time.monotonic() + LOOKUP_TIMEOUT_SECONDS
        self.bytes_left = LOOKUP_MAX_READ_BYTES
        self.candidates_left = LOOKUP_MAX_CANDIDATES
        self.sql_steps_left = LOOKUP_SQL_MAX_STEPS
        self.exhausted = False

    def check(self):
        if self.exhausted or time.monotonic() >= self.deadline:
            self.exhausted = True
            raise LookupBudgetExhausted("lookup-budget-exhausted")

    def charge_bytes(self, count):
        self.check()
        if count > self.bytes_left:
            self.exhausted = True
            raise LookupBudgetExhausted("lookup-budget-exhausted")
        self.bytes_left -= count

    def take_candidate(self):
        self.check()
        if self.candidates_left <= 0:
            self.exhausted = True
            raise LookupBudgetExhausted("lookup-budget-exhausted")
        self.candidates_left -= 1

    def progress(self):
        # SQLite callbacks return nonzero to abort; don't raise into sqlite3.
        self.sql_steps_left -= LOOKUP_SQL_PROGRESS_INTERVAL
        try:
            self.check()
        except LookupBudgetExhausted:
            return 1
        if self.sql_steps_left <= 0:
            self.exhausted = True
            return 1
        return 0


_LOOKUP_BUDGET = ContextVar("recurrence_lookup_budget", default=None)


def _json(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def _digest(value):
    return hashlib.sha256(_json(value)).hexdigest()


def _result(status, *, authority="context-only", **fields):
    return {"status": status, "authority": authority, "promoted": False,
            "allow": True, **fields}


def _reject(error, *, authority="context-only"):
    reason = str(error) if isinstance(error, RecurrenceError) else "recurrence-unavailable"
    return _result("rejected", authority=authority, reason=reason)


def _object(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise RecurrenceError("invalid-fields")
    return value


def _text(value, maximum=2048):
    if (not isinstance(value, str) or not value.strip() or len(value) > maximum
            or any(ord(c) < 32 and c not in "\n\t" for c in value)
            or memory_common.redact(value) != value or POISON.search(value)):
        raise RecurrenceError("unsafe-text")
    return value


def _id(value):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise RecurrenceError("invalid-identifier")
    return _text(value, 128)


def _relative(value):
    _text(value, 1024)
    if (value.startswith("/") or "\\" in value or ":" in value
            or any(part in {"", ".", ".."} for part in value.split("/"))):
        raise RecurrenceError("unsafe-relative-path")
    return value


def _redirected(info):
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0)
        & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x0400)
    )


def _path(root, relative):
    path = root
    for part in _relative(relative).split("/"):
        path = path / part
        try:
            info = path.lstat()
        except FileNotFoundError:
            continue
        if _redirected(info):
            raise RecurrenceError("redirected-path")
    return path


def _workspace(workspace):
    root = Path(workspace).resolve(strict=True)
    if not root.is_dir():
        raise RecurrenceError("invalid-workspace")
    _path(root, ".forgewright")
    return root


def _read(root, relative, maximum):
    budget = _LOOKUP_BUDGET.get()
    if budget is not None:
        budget.check()
    path = _path(root, relative)
    before = path.lstat()
    if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
            or before.st_size > maximum):
        raise RecurrenceError("unsafe-or-oversized-file")
    if budget is not None:
        # Reserve before reading, including one byte to detect file growth.
        budget.charge_bytes(before.st_size + 1)
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
                 | getattr(os, "O_NONBLOCK", 0))
    with os.fdopen(fd, "rb", buffering=0) as stream:
        opened = os.fstat(stream.fileno())
        if ((opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns)
                != (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)):
            raise RecurrenceError("file-changed")
        chunks, remaining = [], before.st_size + 1
        while remaining:
            if budget is not None:
                budget.check()
            chunk = stream.read(min(65536, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        raw = b"".join(chunks)
        after = os.fstat(stream.fileno())
    if (len(raw) > maximum or
            (after.st_size, after.st_mtime_ns) != (opened.st_size, opened.st_mtime_ns)):
        raise RecurrenceError("file-changed")
    if budget is not None:
        budget.check()
    return raw


@contextmanager
def _writer(root):
    """Reuse the continuity lock underlying memory_common.json_transaction.

    Reading the projection ourselves, while holding this same lock, bounds the
    bytes *before* JSON parsing. No environment-selected state directory is used.
    """
    folder = _path(root, str(Path(PROJECTION_REF).parent))
    folder.mkdir(parents=True, mode=0o700, exist_ok=True)
    _path(root, str(Path(PROJECTION_REF).parent))
    with memory_common.continuity._open_writer_lock(folder) as lock:
        deadline = time.monotonic() + 0.25
        while True:
            try:
                if os.name == "nt":
                    lock.seek(0)
                    memory_common.continuity.msvcrt.locking(
                        lock.fileno(), memory_common.continuity.msvcrt.LK_NBLCK, 1)
                else:
                    memory_common.continuity.fcntl.flock(
                        lock.fileno(), memory_common.continuity.fcntl.LOCK_EX
                        | memory_common.continuity.fcntl.LOCK_NB)
                break
            except (OSError, BlockingIOError):
                if time.monotonic() >= deadline:
                    raise RecurrenceError("recurrence-busy") from None
                time.sleep(0.01)
        yield


def _diagnostic(payload):
    if len(_json(payload)) > EVENT_BYTES:
        raise RecurrenceError("event-too-large")
    _object(payload, {"event_id", "session_id", "job_id", "profile", "source",
                      "failure_class", "outcome"})
    for value in payload.values():
        _id(value)
    if not JOB_ID.fullmatch(payload["job_id"]):
        raise RecurrenceError("invalid-job-id")
    if payload["outcome"] not in {"failure", "success", "unknown", "cancelled"}:
        raise RecurrenceError("invalid-diagnostic-outcome")
    return dict(payload)


def record_native_diagnostic(workspace, payload):
    """Record a sanitized diagnostic; caller delivery and acceptance are separate."""
    try:
        if memory_common.disabled():
            return _result("disabled", authority="diagnostic-only")
        event = _diagnostic(payload)
        root = _workspace(workspace)
        now = time.time()
        with _writer(root):
            path = _path(root, PROJECTION_REF)
            state = (json.loads(_read(root, PROJECTION_REF, MAX_EVENTS * EVENT_BYTES + EVENT_BYTES))
                     if path.exists() else {"schema": PROJECTION_SCHEMA,
                                           "workspace": str(root), "events": []})
            _object(state, {"schema", "workspace", "events"})
            if (state["schema"] != PROJECTION_SCHEMA or state["workspace"] != str(root)
                    or not isinstance(state["events"], list) or len(state["events"]) > MAX_EVENTS):
                raise RecurrenceError("invalid-diagnostic-projection")
            retained = []
            for stored in state["events"]:
                _object(stored, {"event", "payload_sha256", "observed_at", "expires_at"})
                normalized = _diagnostic(stored["event"])
                if (stored["payload_sha256"] != _digest(normalized)
                        or any(type(stored[k]) not in (int, float)
                               or not math.isfinite(stored[k]) for k in ("observed_at", "expires_at"))
                        or not 0 < stored["expires_at"] - stored["observed_at"] <= TTL_SECONDS
                        or stored["observed_at"] > now):
                    raise RecurrenceError("invalid-diagnostic-projection")
                if stored["expires_at"] > now:
                    retained.append(stored)
            key = (event["session_id"], event["event_id"])
            previous = next((row for row in retained
                             if (row["event"]["session_id"], row["event"]["event_id"]) == key), None)
            if previous is not None:
                if previous["payload_sha256"] != _digest(event):
                    raise RecurrenceError("event-payload-conflict")
                return _result("duplicate", authority="diagnostic-only", projection_ref=PROJECTION_REF)
            record = {"event": event, "payload_sha256": _digest(event),
                      "observed_at": now, "expires_at": now + TTL_SECONDS}
            if len(_json(record)) > EVENT_BYTES:
                raise RecurrenceError("event-too-large")
            state["events"] = (retained + [record])[-MAX_EVENTS:]
            memory_common.atomic_json(path, state)
        return _result("recorded", authority="diagnostic-only", projection_ref=PROJECTION_REF)
    except (OSError, ValueError, TypeError, KeyError, AttributeError, RuntimeError, OverflowError) as error:
        return _reject(error, authority="diagnostic-only")


def _toolchain(value):
    if not isinstance(value, dict) or not 1 <= len(value) <= 16:
        raise RecurrenceError("invalid-toolchain")
    for key, version in value.items():
        _id(key)
        _text(version, 256)
    return value


def _refs(root, values, *, allow_empty=False):
    if not isinstance(values, list) or not (0 if allow_empty else 1) <= len(values) <= 12:
        raise RecurrenceError("invalid-source-refs")
    paths = set()
    for item in values:
        _object(item, {"path", "sha256"})
        path = _relative(item["path"])
        if (path in paths or not isinstance(item["sha256"], str)
                or not DIGEST.fullmatch(item["sha256"])):
            raise RecurrenceError("invalid-source-binding")
        paths.add(path)
        if hashlib.sha256(_read(root, path, MAX_SOURCE_BYTES)).hexdigest() != item["sha256"]:
            raise RecurrenceError("source-drift")
    return values


def _payload(root, payload):
    if len(_json(payload)) > MAX_METADATA_BYTES:
        raise RecurrenceError("lesson-too-large")
    _object(payload, {"summary", "scope", "signature", "correction", "applicability",
                      "source_refs", "recipe", "acceptance_ids", "ttl_seconds"})
    _text(payload["summary"], 2048)
    _text(payload["correction"], 1024)
    _id(payload["signature"])
    if payload["scope"] not in {"project", "session"}:
        raise RecurrenceError("invalid-lesson-scope")
    if type(payload["ttl_seconds"]) is not int or not 1 <= payload["ttl_seconds"] <= TTL_SECONDS:
        raise RecurrenceError("invalid-lesson-ttl")
    app = _object(payload["applicability"], {"operation", "platform", "toolchain", "lockfiles"})
    _id(app["operation"])
    _id(app["platform"])
    _toolchain(app["toolchain"])
    _refs(root, app["lockfiles"], allow_empty=True)
    _refs(root, payload["source_refs"])
    recipe = _object(payload["recipe"], {"path", "sha256", "review_ref"})
    # Canonicality comes from the reviewed source binding, not a folder name.
    # Generated runtime/candidate material is never a canonical recipe.
    if any(part.casefold() in {".git", ".forgewright"}
           for part in _relative(recipe["path"]).split("/")):
        raise RecurrenceError("recipe-not-canonical")
    _relative(recipe["review_ref"])
    if {"path": recipe["path"], "sha256": recipe["sha256"]} not in payload["source_refs"]:
        raise RecurrenceError("recipe-source-not-bound")
    ids = payload["acceptance_ids"]
    if not isinstance(ids, list) or not 1 <= len(ids) <= 32:
        raise RecurrenceError("invalid-acceptance-ids")
    for value in ids:
        _id(value)
    if len(set(ids)) != len(ids):
        raise RecurrenceError("duplicate-acceptance-ids")
    return json.loads(_json(payload))


def _namespace(root, session=None):
    project = "workspace:" + hashlib.sha256(str(root).encode()).hexdigest()[:24]
    return project if session is None else project + ":session:" + hashlib.sha256(session.encode()).hexdigest()[:24]


def _database(root, *, writable=False, host=False):
    budget = _LOOKUP_BUDGET.get() if not writable and not host else None
    timeout = 0.25
    if budget is not None:
        budget.check()
        timeout = min(timeout, max(0.0, budget.deadline - time.monotonic()))
    relative = "host.sqlite3" if host else ".forgewright/memory.db"
    path = _path(root, relative)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise RecurrenceError("unsafe-database")
    if host and hasattr(os, "getuid") and (info.st_uid != os.getuid() or info.st_mode & 0o077):
        raise RecurrenceError("unsafe-host-database")
    for suffix in ("-wal", "-shm", "-journal"):
        _path(root, relative + suffix)
    conn = sqlite3.connect(path.as_uri() + ("?mode=rw" if writable else "?mode=ro"),
                           uri=True, timeout=timeout)
    try:
        if budget is not None:
            conn.set_progress_handler(budget.progress, LOOKUP_SQL_PROGRESS_INTERVAL)
            budget.check()
        after = path.lstat()
        if (info.st_dev, info.st_ino) != (after.st_dev, after.st_ino):
            raise RecurrenceError("database-changed")
        conn.row_factory = sqlite3.Row
        if not writable:
            conn.execute("PRAGMA query_only=ON")
        if not host and conn.execute("PRAGMA user_version").fetchone()[0] != 2:
            raise RecurrenceError("memory-schema-unavailable")
        return conn
    except Exception:
        conn.close()
        raise


def _evidence(root, relative, payload, *, current=True):
    import evidence_common
    import verify_gate

    relative = _relative(relative)
    if not relative.startswith(".forgewright/verify/"):
        raise RecurrenceError("evidence-outside-verify")
    raw = evidence_common.read_evidence_bytes(root, root / relative)
    evidence = evidence_common.read_evidence_json(root, root / relative)
    if (evidence_common.schema_errors(evidence)
            or evidence_common.phase_errors(evidence, final=True)
            or verify_gate._validate_output(evidence)
            or verify_gate._validate_workspace(evidence, root)
            or verify_gate._validate_hard_requirements(evidence, True, root)
            or verify_gate._validate_chain(evidence, root, current_path=root / relative, hard=True)):
        raise RecurrenceError("unverified-final-evidence")
    if evidence["output_truncated"]:
        raise RecurrenceError("truncated-final-evidence")
    age = (datetime.now(timezone.utc) - evidence_common.parse_timestamp(evidence["timestamp_utc"])).total_seconds()
    if not 0 <= age <= 3600:
        raise RecurrenceError("stale-final-evidence")
    if current and evidence["tree_sha"] != evidence_common.worktree_fingerprint(root):
        raise RecurrenceError("evidence-tree-mismatch")
    if not set(payload["acceptance_ids"]).issubset(evidence_common.acceptance_map(evidence)):
        raise RecurrenceError("acceptance-not-covered")
    review_path, error = evidence_common.resolve_evidence_link(root, evidence["reviewer"]["evidence_ref"])
    if error or review_path != root / payload["recipe"]["review_ref"]:
        raise RecurrenceError("recipe-review-mismatch")
    review_raw = evidence_common.read_evidence_bytes(root, review_path, max_bytes=256 * 1024)
    return evidence, {"path": relative, "sha256": hashlib.sha256(raw).hexdigest()}, {
        "path": payload["recipe"]["review_ref"], "sha256": hashlib.sha256(review_raw).hexdigest()}


def _terminal_job(root, job_id, evidence, session):
    if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
        raise RecurrenceError("invalid-job-id")
    runtime = str(Path(__file__).resolve().parents[1] / "runtime")
    if runtime not in sys.path:
        sys.path.insert(0, runtime)
    from host_job_runner import terminal_release_witness, journal_released

    user = Path.home().resolve(strict=True)
    home = _path(user, ".forgewright/runtime/admission")
    for path in (home, _path(home, "jobs"), _path(home, "jobs/" + job_id + ".json")):
        info = path.lstat()
        if hasattr(os, "getuid") and (info.st_uid != os.getuid() or info.st_mode & 0o077):
            raise RecurrenceError("unsafe-job-journal")
    journal = json.loads(_read(home, "jobs/" + job_id + ".json", 65536))
    child, storage = journal.get("child"), journal.get("storage")
    if (journal.get("schema") != "forgewright-host-job/v1" or journal.get("job_id") != job_id
            or journal.get("physical_workspace") != str(root) or journal.get("state") != "quiescent"
            or type(journal.get("exit_code")) is not int or journal["exit_code"] != 0
            or journal.get("spawn_pending") is not False or journal.get("never_spawned") is True
            or not isinstance(child, dict) or type(child.get("pid")) is not int or child["pid"] <= 0
            or not child.get("identity") or not isinstance(storage, dict)
            or storage.get("quiescent") is not True
            or storage.get("state") not in {"retained", "reclaimed"}
            or storage.get("workspace") != str(root) or storage.get("job_id") != job_id):
        raise RecurrenceError("job-not-successfully-terminal")
    if [lease.get("kind") for lease in journal.get("leases", [])] != ["worker", "heavy"]:
        raise RecurrenceError("job-leases-unconfirmed")
    witness = terminal_release_witness(journal)
    if witness is None or journal.get("terminal_release") != witness:
        raise RecurrenceError("job-release-witness-invalid")
    if journal.get("argv_sha256") != hashlib.sha256(json.dumps(evidence["command"]).encode()).hexdigest():
        raise RecurrenceError("job-evidence-command-mismatch")
    native = journal.get("native_context")
    if native is not None and native.get("native", {}).get("session_id") != session:
        raise RecurrenceError("job-session-mismatch")
    with closing(_database(home, host=True)) as conn:
        if not journal_released(SimpleNamespace(connection=conn), journal):
            raise RecurrenceError("job-leases-unconfirmed")
    return witness["sha256"]


def _source_refs(payload, evidence_ref, review_ref):
    result = {}
    for item in [*payload["source_refs"], *payload["applicability"]["lockfiles"], evidence_ref, review_ref]:
        if item["path"] in result and result[item["path"]] != item["sha256"]:
            raise RecurrenceError("conflicting-source-bindings")
        result[item["path"]] = item["sha256"]
    if len(result) > 16:
        raise RecurrenceError("too-many-source-bindings")
    return [{"path": path, "sha256": digest} for path, digest in sorted(result.items())]


def _flow_payload(selected, binding_hash, refs):
    return {
        "kind": "remember", "summary": selected["summary"] + "\n[Lesson binding: " + binding_hash + "]",
        "scope": selected["scope"], "source_refs": refs,
        "ttl_seconds": selected["ttl_seconds"],
        "next_action": "Untrusted context only; inspect reviewed recipe " + selected["recipe"]["path"],
    }


def _flow_hash(payload):
    # Match the existing memory_flow.capture serialization exactly.
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _capture_flow(root, flow_payload, session, event):
    # Process-local environment changes would race unrelated memory clients.
    # Invoke the existing capture entrypoint with an isolated, pinned child env.
    environment = {key: value for key, value in os.environ.items() if key not in {
        "MEM0_DB_PATH", "MEM0_PROJECT_ID", "MEMORY_DB_DIR", "FORGEWRIGHT_CONTINUITY_ROOT",
        "PYTHONPATH", "PYTHONHOME", "FORGEWRIGHT_WORKSPACE", "FORGEWRIGHT_SESSION",
        "FORGEWRIGHT_SESSION_ID",
    }}
    environment.update(FORGEWRIGHT_WORKSPACE=str(root), FORGEWRIGHT_SESSION=session,
                       FORGEWRIGHT_SESSION_ID=session, PYTHONDONTWRITEBYTECODE="1")
    process = subprocess.run(
        [sys.executable, "-B", str(Path(__file__).with_name("memory_flow.py")),
         "capture", "--session", session, "--event", event],
        input=json.dumps(flow_payload), text=True, capture_output=True,
        cwd=root, env=environment, timeout=15,
    )
    if process.returncode or len(process.stdout.encode()) > 32768:
        raise RecurrenceError("memory-capture-failed")
    result = json.loads(process.stdout)
    if result.get("status") not in {"captured", "duplicate"} or type(result.get("observation_id")) is not int:
        raise RecurrenceError("memory-capture-unconfirmed")
    return result


def capture_verified_lesson(workspace, payload, session, event, evidence_ref, job_id):
    """Project-local context projection; this is not a Foundry accepted outcome.

    The existing capture commits first. Annotation is a second, event-bound
    transaction: interruption may leave an ordinary *unqualified* note, never a
    qualified lesson. A validated retry can finish that annotation.
    """
    try:
        if memory_common.disabled():
            return _result("disabled")
        root, session, event = _workspace(workspace), _id(session), _id(event)
        selected = _payload(root, payload)
        with _writer(root):
            evidence, evidence_source, review_source = _evidence(root, evidence_ref, selected)
            witness = _terminal_job(root, job_id, evidence, session)
            binding = {"workspace": str(root), "session_id": session, "event_id": event,
                       "job_id": job_id, "payload": selected, "evidence": evidence_source,
                       "review": review_source, "terminal_release_sha256": witness}
            binding_hash = _digest(binding)
            refs = _source_refs(selected, evidence_source, review_source)
            flow_payload = _flow_payload(selected, binding_hash, refs)
            result = _capture_flow(root, flow_payload, session, event)
            # Revalidate after the independent capture transaction and before
            # adding qualification metadata. Never rerun the evidence command.
            _payload(root, selected)
            _, evidence_after, review_after = _evidence(root, evidence_ref, selected)
            if (evidence_after != evidence_source or review_after != review_source
                    or _terminal_job(root, job_id, evidence, session) != witness):
                raise RecurrenceError("capture-binding-drift")
            namespace = _namespace(root, session if selected["scope"] == "session" else None)
            expected_flow_hash = _flow_hash(flow_payload)
            with closing(_database(root, writable=True)) as conn:
                conn.execute("BEGIN IMMEDIATE")
                row = conn.execute(
                    "SELECT o.*,c.payload_hash,c.checkpoint_ref FROM capture_events c "
                    "JOIN observations o ON o.id=c.observation_id "
                    "WHERE c.project_root=? AND c.session_id=? AND c.event_id=? AND o.project_root=?",
                    (_namespace(root), session, event, namespace),
                ).fetchone()
                if (row is None or row["id"] != result["observation_id"]
                        or row["payload_hash"] != expected_flow_hash or row["content"] != flow_payload["summary"]
                        or row["archived"] or row["expires_at_epoch"] is None
                        or row["expires_at_epoch"] <= time.time()):
                    raise RecurrenceError("capture-event-binding-mismatch")
                source = json.loads(row["source"])
                if (source.get("schema") != "forgewright-memory-source/v1"
                        or source.get("source_refs") != refs or source.get("session_id") != session
                        or source.get("checkpoint_ref") != row["checkpoint_ref"]):
                    raise RecurrenceError("capture-source-binding-mismatch")
                lesson = {**binding, "schema": LESSON_SCHEMA, "authority": "context-only",
                          "binding_sha256": binding_hash, "expires_at": row["expires_at_epoch"],
                          "content_sha256": hashlib.sha256(row["content"].encode()).hexdigest()}
                lesson["metadata_sha256"] = _digest(lesson)
                if "lesson" in source and source["lesson"] != lesson:
                    raise RecurrenceError("event-payload-conflict")
                if "lesson" not in source:
                    source["lesson"] = lesson
                    serialized = _json(source).decode()
                    if len(serialized.encode()) > MAX_METADATA_BYTES:
                        raise RecurrenceError("lesson-too-large")
                    updated = conn.execute(
                        "UPDATE observations SET source=? WHERE id=? AND project_root=? AND source=?",
                        (serialized, row["id"], namespace, row["source"]),
                    )
                    if updated.rowcount != 1:
                        raise RecurrenceError("capture-source-drift")
                conn.commit()
            return _result(result["status"], observation_id=result["observation_id"],
                           checkpoint_ref=result["checkpoint_ref"], limitations=[LIMITATION])
    except (OSError, ValueError, TypeError, KeyError, AttributeError, RuntimeError, sqlite3.Error,
            subprocess.SubprocessError, ImportError, OverflowError) as error:
        return _reject(error)


def _qualified(root, row, operation, platform, toolchain, session):
    source = json.loads(row["source"])
    if source.get("schema") != "forgewright-memory-source/v1" or not isinstance(source.get("lesson"), dict):
        return None
    lesson = dict(source["lesson"])
    metadata_hash = lesson.pop("metadata_sha256", None)
    if metadata_hash != _digest(lesson):
        return None
    _object(lesson, {"workspace", "session_id", "event_id", "job_id", "payload", "evidence",
                     "review", "terminal_release_sha256", "schema", "authority", "binding_sha256",
                     "expires_at", "content_sha256"})
    if (lesson["schema"] != LESSON_SCHEMA or lesson["authority"] != "context-only"
            or lesson["workspace"] != str(root) or type(lesson["expires_at"]) is not int
            or lesson["expires_at"] <= time.time() or row["expires_at_epoch"] != lesson["expires_at"]
            or lesson["content_sha256"] != hashlib.sha256(row["content"].encode()).hexdigest()):
        return None
    selected = lesson["payload"]
    app = selected["applicability"]
    if app["operation"] != operation or app["platform"] != platform or app["toolchain"] != toolchain:
        return None
    if selected["scope"] == "session" and lesson["session_id"] != session:
        return None
    if row["project_root"] != _namespace(root, lesson["session_id"] if selected["scope"] == "session" else None):
        return None
    _payload(root, selected)
    binding = {key: lesson[key] for key in ("workspace", "session_id", "event_id", "job_id",
                                           "payload", "evidence", "review", "terminal_release_sha256")}
    if lesson["binding_sha256"] != _digest(binding):
        return None
    for item in (lesson["evidence"], lesson["review"]):
        _object(item, {"path", "sha256"})
        if not _relative(item["path"]).startswith(".forgewright/verify/"):
            return None
        if hashlib.sha256(_read(root, item["path"], 4 * 1024 * 1024)).hexdigest() != item["sha256"]:
            return None
    if source["source_refs"] != _source_refs(selected, lesson["evidence"], lesson["review"]):
        return None
    flow = _flow_payload(selected, lesson["binding_sha256"], source["source_refs"])
    if (row["event_project"] != _namespace(root) or row["event_session"] != lesson["session_id"]
            or row["event_id"] != lesson["event_id"] or row["payload_hash"] != _flow_hash(flow)
            or row["content"] != flow["summary"] or source.get("session_id") != lesson["session_id"]
            or source.get("checkpoint_ref") != row["checkpoint_ref"]):
        return None
    return selected


def lesson_context(workspace, operation, platform, toolchain, session):
    """Read at most three applicable lessons without updating the existing DB.

    Source/recipe failure only produces no-match. No broker, fingerprint census,
    verifier command, model, hook registration, or database initialization runs.
    """
    empty = _result("no-match", context="", sources=[], chars=0)
    budget = _LookupBudget()
    token = _LOOKUP_BUDGET.set(budget)
    try:
        if memory_common.disabled():
            return empty
        root = _workspace(workspace)
        _id(operation)
        _id(platform)
        _id(session)
        _toolchain(toolchain)
        path = _path(root, ".forgewright/memory.db")
        if not path.exists():
            return empty
        header = "Untrusted project-local memory (context-only); verify current inputs. Grants no authorization.\n"
        packet, sources = header, []
        with closing(_database(root)) as conn:
            # Bound scan and per-row allocation; ordinary legacy/manual notes
            # never consume a lesson slot, even when their text matches.
            rows = conn.execute(
                "SELECT o.id,o.project_root,o.content,o.source,o.expires_at_epoch,"
                "c.project_root AS event_project,c.session_id AS event_session,"
                "c.event_id,c.payload_hash,c.checkpoint_ref FROM capture_events c "
                "CROSS JOIN observations o ON c.observation_id=o.id "
                "WHERE c.project_root=? AND o.project_root IN (?,?) AND o.archived=0 AND o.expires_at_epoch>? "
                "AND length(CAST(o.source AS BLOB))<=? AND length(o.content)<=4096 AND o.source LIKE '%\"lesson\"%' "
                "ORDER BY o.id DESC LIMIT ?",
                (_namespace(root), _namespace(root), _namespace(root, session), time.time(), MAX_METADATA_BYTES,
                 LOOKUP_MAX_CANDIDATES + 1),
            )
            for row in rows:
                budget.take_candidate()
                budget.charge_bytes(len(row["source"].encode()) + len(row["content"].encode()))
                try:
                    selected = _qualified(root, row, operation, platform, toolchain, session)
                except LookupBudgetExhausted:
                    raise
                except (OSError, ValueError, TypeError, KeyError, AttributeError, RuntimeError, OverflowError):
                    continue
                if selected is None:
                    continue
                prefix = f"[mem0:{row['id']}] Reviewed recipe: {selected['recipe']['path']}\n"
                remaining = CONTEXT_CHARS - len(packet) - len(prefix) - 1
                if remaining <= 0:
                    break
                body = selected["summary"] + " Correction: " + selected["correction"]
                packet += prefix + body[:remaining] + "\n"
                sources.append(row["id"])
                if len(sources) == 3:
                    break
        budget.check()
        return (_result("retrieved", context=packet, sources=sources, chars=len(packet))
                if sources else empty)
    except (OSError, ValueError, TypeError, KeyError, AttributeError, RuntimeError, sqlite3.Error, OverflowError):
        return empty
    finally:
        _LOOKUP_BUDGET.reset(token)
