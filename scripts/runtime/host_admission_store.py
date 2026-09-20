"""Private transactional storage for host admission; no execution authority."""

from __future__ import annotations

from contextlib import contextmanager
import hashlib
import hmac
import os
from pathlib import Path
import sqlite3
import stat
import time

from host_resources import MIB, inspect_process, memory_snapshot

SCHEMA = 1
MAX_QUEUE = 128
MAX_PER_PROJECT = 32


class AdmissionError(RuntimeError):
    """Stable public diagnostic code."""


class AdmissionStore:
    def __init__(
        self,
        home=None,
        *,
        sensor=memory_snapshot,
        inspector=inspect_process,
        now=time.time,
    ):
        self.sensor, self.inspector, self.now = sensor, inspector, now
        path = (
            Path(home)
            if home is not None
            else Path.home() / ".forgewright/runtime/admission"
        )
        if path.is_symlink():
            raise AdmissionError("unsafe-state-directory")
        path.mkdir(parents=True, mode=0o700, exist_ok=True)
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
            raise AdmissionError("unsafe-state-directory")
        if hasattr(os, "getuid") and (
            info.st_uid != os.getuid() or info.st_mode & 0o077
        ):
            raise AdmissionError("unsafe-state-directory")
        self.home = path.resolve()
        database = self.home / "host.sqlite3"
        fd = os.open(
            database, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600
        )
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or (
                hasattr(os, "getuid")
                and (info.st_uid != os.getuid() or info.st_mode & 0o077)
            ):
                raise AdmissionError("unsafe-state-database")
        finally:
            os.close(fd)
        self.connection = sqlite3.connect(
            str(database), timeout=2, isolation_level=None
        )
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA busy_timeout=2000")
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=FULL")
        version = self.connection.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, SCHEMA):
            self.close()
            raise AdmissionError("schema-incompatible")
        with self.transaction():
            self.connection.execute(
                "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value REAL NOT NULL)"
            )
            self.connection.execute("""CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,token_digest TEXT NOT NULL,project TEXT NOT NULL,
                run_id TEXT NOT NULL,kind TEXT NOT NULL,pid INTEGER NOT NULL,
                identity TEXT NOT NULL,memory_bytes INTEGER NOT NULL,parent_id TEXT,
                state TEXT NOT NULL,created REAL NOT NULL,touched REAL NOT NULL,
                reason TEXT NOT NULL DEFAULT '',granted REAL)""")
            self.connection.execute(
                "CREATE INDEX IF NOT EXISTS jobs_state ON jobs(state,kind,project)"
            )
            self.connection.execute(
                "CREATE TABLE IF NOT EXISTS fairness(project TEXT PRIMARY KEY,last_grant REAL NOT NULL)"
            )
            self.connection.execute(f"PRAGMA user_version={SCHEMA}")

    def close(self):
        self.connection.close()

    @contextmanager
    def transaction(self):
        try:
            self.connection.execute("BEGIN IMMEDIATE")
        except sqlite3.OperationalError as error:
            raise AdmissionError("admission-lock-timeout") from error
        try:
            yield
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise

    def meta(self, name, default=0.0):
        row = self.connection.execute(
            "SELECT value FROM meta WHERE key=?", (name,)
        ).fetchone()
        return row[0] if row else default

    def set_meta(self, name, value):
        self.connection.execute(
            "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (name, value),
        )

    @staticmethod
    def token_digest(token):
        if not isinstance(token, str) or not 32 <= len(token) <= 256:
            raise AdmissionError("invalid-owner-token")
        return hashlib.sha256(token.encode()).hexdigest()

    def owned(self, job_id, token, owner_pid):
        row = self.connection.execute(
            "SELECT * FROM jobs WHERE id=?", (job_id,)
        ).fetchone()
        digest = self.token_digest(token)
        if (
            not row
            or not hmac.compare_digest(row["token_digest"], digest)
            or row["pid"] != owner_pid
            or self.inspector(owner_pid) != row["identity"]
        ):
            raise AdmissionError("owner-mismatch")
        return row

    def describe(self, job_id):
        row = self.connection.execute(
            "SELECT * FROM jobs WHERE id=?", (job_id,)
        ).fetchone()
        return {
            "id": row["id"],
            "state": row["state"],
            "kind": row["kind"],
            "reason": row["reason"],
            "memoryMiB": row["memory_bytes"] // MIB,
            "parentLeaseId": row["parent_id"],
            "waitMs": max(
                0, round(((row["granted"] or self.now()) - row["created"]) * 1000)
            ),
        }

    def refresh(self):
        now, identities = self.now(), {}
        for row in self.connection.execute(
            "SELECT * FROM jobs WHERE state IN ('active','queued')"
        ).fetchall():
            if row["pid"] not in identities:
                identities[row["pid"]] = self.inspector(row["pid"])
            if identities[row["pid"]] != row["identity"]:
                state = "quarantined" if row["state"] == "active" else "released"
                self.connection.execute(
                    "UPDATE jobs SET state=?,reason='owner-lost',touched=? WHERE id=?",
                    (state, now, row["id"]),
                )
                if state == "quarantined":
                    self.connection.execute(
                        "UPDATE jobs SET state='quarantined',reason='parent-lost',touched=? WHERE parent_id=? AND state='active'",
                        (now, row["id"]),
                    )
        # Bound only terminal history. Never expire live/uncertain reservations.
        if now - self.meta("gc_at") > 60:
            self.connection.execute(
                "DELETE FROM jobs WHERE state='released' AND (touched<? OR id IN (SELECT id FROM jobs WHERE state='released' ORDER BY touched DESC LIMIT -1 OFFSET 256))",
                (now - 86400,),
            )
            self.connection.execute(
                "DELETE FROM fairness WHERE project NOT IN (SELECT kind || ':' || project FROM jobs)"
            )
            self.set_meta("gc_at", now)
