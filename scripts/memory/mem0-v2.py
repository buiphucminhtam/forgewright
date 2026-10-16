#!/usr/bin/env python3
"""
Optional local memory: scoped SQLite/FTS5 and the existing continuity ledger.

Commands include capture, context, read-only doctor, search/index/get/list,
explicit backup/schema migration and retention preview. Stable session/event
IDs and citations preserve context without granting execution authority.
Native automatic host injection and cloud recreation persistence require
separate verification. See skills/memory-manager/SKILL.md.
"""

import os
import re
import sys
import json
import hashlib
import sqlite3
import unicodedata
from contextlib import closing
from pathlib import Path
from datetime import datetime
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
from memory_common import (
    continuity,
    database_path,
    disabled,
    project_id,
    redact,
    session_namespace,
    workspace_root,
)

SCHEMA_VERSION = 2

# ── Constants ─────────────────────────────────────────────────────────────────
FORGEWRIGHT_DIR = ".forgewright"
MEMORY_DB = os.path.join(FORGEWRIGHT_DIR, "memory.db")
MEMORY_JSONL = os.path.join(FORGEWRIGHT_DIR, "memory.jsonl")
MEMIGNORE_FILE = ".memignore"
MAX_OBS_DEFAULT = 200

REDACT_PATTERNS = [
    r"sk-[a-zA-Z0-9]{20,}",
    r"key-[a-zA-Z0-9]{20,}",
    r"Bearer\s+[a-zA-Z0-9\-._~+/]+=*",
    r"(?i)password\s*[:=]\s*['\"]?[^\s'\"]{4,}",
    r"(?i)secret\s*[:=]\s*['\"]?[^\s'\"]{4,}",
    r"(?i)token\s*[:=]\s*['\"]?[^\s'\"]{8,}",
    r"postgres://\S+:\S+@",
    r"mysql://\S+:\S+@",
    r"mongodb(\+srv)?://\S+:\S+@",
]

CATEGORY_WEIGHTS = {
    "decisions": 10,
    "architecture": 8,
    "project": 8,
    "blockers": 7,
    "session": 6,
    "tasks": 5,
    "conversation": 4,
    "general": 4,
    "git-activity": 3,
    "ingested": 2,
}

AUTO_TAG_PATTERNS = [
    # Auth/Security
    (
        r"\b(auth|jwt|oauth|token|credential|password|passphrase|secret|api[_-]?key)\b",
        "auth",
    ),
    # Architecture/Design
    (
        r"\b(architecture|design|pattern|schema|model|structure|layer|component|module|interface)\b",
        "architecture",
    ),
    # Database
    (
        r"\b(sql|database|db|postgres|mysql|mongodb|migration|query|index|table|schema)\b",
        "database",
    ),
    # Performance
    (
        r"\b(performance|speed|optimize|cache|benchmark|profiling|latency|throughput)\b",
        "performance",
    ),
    # API/Integration
    (
        r"\b(api|rest|graphql|webhook|endpoint|http|request|response|integration)\b",
        "api",
    ),
    # Security
    (
        r"\b(security|vulnerable|exploit|injection|xss|csrf|encryption|hash|encrypt)\b",
        "security",
    ),
    # Testing
    (
        r"\b(test|spec|coverage|unittest|pytest|jest|qa|verification|validation)\b",
        "testing",
    ),
    # DevOps/Infra
    (
        r"\b(deploy|docker|kubernetes|ci|cd|pipeline|terraform|infrastructure|cloud|aws|gcp)\b",
        "devops",
    ),
    # Memory/Learning
    (
        r"\b(memory|checkpoint|retrieval|context|session|conversation|history)\b",
        "memory",
    ),
    # Planning/Process
    (
        r"\b(plan|scoring|quality|protocol|process|workflow|pipeline|gate|approval)\b",
        "process",
    ),
    # UI/Frontend
    (
        r"\b(ui|ux|frontend|react|vue|component|style|animation|responsive)\b",
        "frontend",
    ),
    # Game
    (r"\b(unity|unreal|godot|game|sprite|physics|animation|level|scene)\b", "game"),
    # AI/ML
    (r"\b(llm|rag|embedding|vector|notebooklm|nlp|model|train|inference)\b", "ai"),
]


# ── Helpers ──────────────────────────────────────────────────────────────────


def is_disabled():
    return disabled()


def get_project_id():
    return project_id()


def redact_secrets(text):
    return redact(text)


def auto_extract_tags(text: str) -> list:
    """
    Extract semantic tags from text content using pattern matching.
    Returns list of unique tags found in the text.
    """
    found_tags = set()
    text_lower = text.lower()
    for pattern, tag in AUTO_TAG_PATTERNS:
        if re.search(pattern, text_lower):
            found_tags.add(tag)
    return sorted(found_tags)


def make_hash(text):
    """Generate short deterministic hash from content."""
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    return len(text) // 4


def load_memignore():
    patterns = []
    if Path(MEMIGNORE_FILE).exists():
        for line in Path(MEMIGNORE_FILE).read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                patterns.append(line)
    return patterns


def should_ignore(filepath, patterns):
    from fnmatch import fnmatch

    fp = str(filepath)
    for pat in patterns:
        if fnmatch(fp, pat) or fnmatch(Path(fp).name, pat):
            return True
    return False


# ── Database Schema ───────────────────────────────────────────────────────────

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

-- Core observations
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_root TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    why TEXT,
    how_to_apply TEXT,
    symbol TEXT,
    file_path TEXT,
    tags TEXT DEFAULT '[]',
    importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
    relevance_score REAL DEFAULT 1.0,
    access_count INTEGER DEFAULT 0,
    content_hash TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    pinned INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at_epoch INTEGER NOT NULL DEFAULT (unixepoch()),
    last_accessed_epoch INTEGER,
    archived INTEGER DEFAULT 0,
    archived_at TEXT,
    expires_at_epoch INTEGER,
    narrative TEXT,
    facts TEXT,
    concepts TEXT,
    UNIQUE(content_hash, project_root)
);

-- Sessions for cross-session tracking
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_root TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    request_summary TEXT,
    completed_tasks TEXT,
    next_steps TEXT,
    notes TEXT
);

-- Contradiction/relationship links between observations
CREATE TABLE IF NOT EXISTS observation_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER REFERENCES observations(id) ON DELETE CASCADE,
    target_id INTEGER REFERENCES observations(id) ON DELETE CASCADE,
    link_type TEXT CHECK (link_type IN ('related', 'contradicts', 'supersedes', 'extends')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source_id, target_id, link_type)
);

-- FTS5 virtual table with BM25 ranking
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
    id UNINDEXED,
    title,
    content,
    tags,
    narrative,
    facts,
    concepts,
    content='observations',
    content_rowid='id',
    tokenize='porter unicode61 remove_diacritics 2'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project_root);
CREATE INDEX IF NOT EXISTS idx_obs_type ON observations(type);
CREATE INDEX IF NOT EXISTS idx_obs_symbol ON observations(symbol);
CREATE INDEX IF NOT EXISTS idx_obs_hash ON observations(content_hash, project_root);
CREATE INDEX IF NOT EXISTS idx_obs_epoch ON observations(created_at_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_obs_archived ON observations(archived);
CREATE INDEX IF NOT EXISTS idx_links_source ON observation_links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON observation_links(target_id);

CREATE TABLE IF NOT EXISTS capture_events (
    project_root TEXT NOT NULL,
    session_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    observation_id INTEGER NOT NULL REFERENCES observations(id),
    checkpoint_ref TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_root, session_id, event_id)
);

-- Flux Nodes (Layer 2 dynamic graph memory)
CREATE TABLE IF NOT EXISTS flux_nodes (
    id TEXT PRIMARY KEY,
    layer TEXT CHECK(layer IN ('semantic', 'episodic', 'procedural')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    pes_score REAL DEFAULT 0.0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Flux Edges
CREATE TABLE IF NOT EXISTS flux_edges (
    source_id TEXT REFERENCES flux_nodes(id) ON DELETE CASCADE,
    target_id TEXT REFERENCES flux_nodes(id) ON DELETE CASCADE,
    weight REAL DEFAULT 1.0,
    edge_type TEXT NOT NULL DEFAULT 'relates_to',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (source_id, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_flux_node_layer ON flux_nodes(layer);
CREATE INDEX IF NOT EXISTS idx_flux_edges_source ON flux_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_flux_edges_target ON flux_edges(target_id);

-- Procedural Circuits (consolidation of high-performance task execution plans)
CREATE TABLE IF NOT EXISTS procedural_circuits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    pems_score REAL NOT NULL DEFAULT 0.0,
    runs_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


# ── Database Connection ────────────────────────────────────────────────────────


FTS_TRIGGERS = """
CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid,id,title,content,tags,narrative,facts,concepts)
  VALUES(new.id,new.id,new.title,new.content,new.tags,new.narrative,new.facts,new.concepts);
END;
CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts,rowid,id,title,content,tags,narrative,facts,concepts)
  VALUES('delete',old.id,old.id,old.title,old.content,old.tags,old.narrative,old.facts,old.concepts);
END;
CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE OF title,content,tags,narrative,facts,concepts ON observations BEGIN
  INSERT INTO observations_fts(observations_fts,rowid,id,title,content,tags,narrative,facts,concepts)
  VALUES('delete',old.id,old.id,old.title,old.content,old.tags,old.narrative,old.facts,old.concepts);
  INSERT INTO observations_fts(rowid,id,title,content,tags,narrative,facts,concepts)
  VALUES(new.id,new.id,new.title,new.content,new.tags,new.narrative,new.facts,new.concepts);
END;
"""


def install_schema(conn, *, migrate=False, from_project=None, namespace=None):
    schema = "\n".join(
        line for line in SCHEMA.splitlines() if not line.startswith("PRAGMA ")
    )
    cleanup = (
        ""
        if not migrate
        else "DROP TRIGGER IF EXISTS memory_fts_insert; DROP TRIGGER IF EXISTS memory_fts_delete; DROP TRIGGER IF EXISTS memory_fts_update; DROP TABLE IF EXISTS observations_fts;"
    )
    try:
        conn.executescript("BEGIN IMMEDIATE;" + cleanup + schema + FTS_TRIGGERS)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(observations)")}
        if "expires_at_epoch" not in columns:
            conn.execute("ALTER TABLE observations ADD COLUMN expires_at_epoch INTEGER")
        if migrate:
            conn.execute(
                "INSERT INTO observations_fts(rowid,id,title,content,tags,narrative,facts,concepts) SELECT id,id,title,content,tags,narrative,facts,concepts FROM observations"
            )
        if from_project:
            conn.execute(
                "UPDATE observations SET project_root=? WHERE project_root=?",
                (namespace, from_project),
            )
        conn.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


class MemoryDB:
    """SQLite-based memory store with FTS5 and WAL mode."""

    def __init__(self, db_path: str = None, *, namespace: str = None):
        if disabled():
            raise RuntimeError("memory_disabled")
        self.db_path = str(Path(db_path).absolute() if db_path else database_path())
        if continuity._has_symlink_component(Path(self.db_path)):
            raise ValueError("unsafe_memory_database_path")
        session = os.environ.get("FORGEWRIGHT_SESSION") or os.environ.get(
            "FORGEWRIGHT_SESSION_ID"
        )
        self.project_id = namespace or (
            session_namespace(session) if session else get_project_id()
        )
        self.graph_prefix = make_hash(self.project_id) + ":"
        self._ensure_db()

    def _ensure_db(self):
        """New stores initialize once; existing stores require explicit migration."""
        path = Path(self.db_path)
        if path.exists():
            with closing(
                sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=0.5)
            ) as conn:
                if conn.execute("PRAGMA user_version").fetchone()[0] != SCHEMA_VERSION:
                    raise RuntimeError(
                        "memory_schema_migration_required: use migrate-db with backup"
                    )
            return
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        conn = sqlite3.connect(self.db_path, timeout=0.5)
        try:
            os.chmod(self.db_path, 0o600)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=FULL")
            install_schema(conn)
        finally:
            conn.close()

    def get_connection(self) -> sqlite3.Connection:
        """Get a connection with proper settings."""
        conn = sqlite3.connect(self.db_path, timeout=0.5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA synchronous=FULL")
        return conn

    # ── Layer 1: Compact Index ─────────────────────────────────────────────

    def memory_index(self, query: str, limit: int = 30) -> dict:
        """
        Layer 1: Always first. Just titles + categories + importance scores.
        Returns ~15 tokens/result.
        """
        conn = self.get_connection()
        try:
            # Handle empty query: return recent observations
            if not query.strip():
                cursor = conn.execute(
                    """
                    SELECT id, type, title, importance, access_count, created_at
                    FROM observations
                    WHERE archived = 0 AND (expires_at_epoch IS NULL OR expires_at_epoch > unixepoch()) AND project_root = ?
                    ORDER BY created_at_epoch DESC
                    LIMIT ?
                """,
                    (self.project_id, limit),
                )
            else:
                cursor = conn.execute(
                    """
                    SELECT id, type, title, importance, access_count, created_at
                    FROM observations
                    WHERE archived = 0 AND (expires_at_epoch IS NULL OR expires_at_epoch > unixepoch()) AND project_root = ?
                      AND (title LIKE ? OR content LIKE ?)
                    ORDER BY
                        (importance * 0.3) +
                        (MIN(access_count, 5) * 0.3) +
                        (CASE WHEN created_at > datetime('now', '-7 days') THEN 0.4 ELSE 0 END)
                    DESC
                    LIMIT ?
                """,
                    (self.project_id, f"%{query}%", f"%{query}%", limit),
                )

            results = []
            total_score = 0.0
            for row in cursor:
                importance = row["importance"]
                access_count = row["access_count"]
                score = (importance * 0.3) + (min(access_count, 5) * 0.3)
                try:
                    created = datetime.fromisoformat(row["created_at"])
                    if (datetime.now() - created).days < 7:
                        score += 0.4
                except Exception:
                    pass
                total_score += score
                results.append(
                    {
                        "id": row["id"],
                        "type": row["type"],
                        "title": row["title"],
                        "score": round(score, 2),
                    }
                )

            return {
                "layer": 1,
                "results": results,
                "total_score": round(total_score, 2),
                "tokens_estimate": len(results) * 15,
            }
        finally:
            conn.close()

    # ── Layer 2: FTS5 + BM25 Search ────────────────────────────────────────

    def memory_search(self, query: str, limit: int = 5) -> dict:
        """
        Layer 2: FTS5 with BM25 ranking. Returns ~60 tokens/result.
        """
        # Strip combining marks without splitting Vietnamese words. Expand only
        # the stroke-d variant that unicode61 does not normalize itself.
        normalized = "".join(
            c
            for c in unicodedata.normalize("NFKD", query).casefold()
            if not unicodedata.combining(c)
        )
        terms = re.findall(r"\w+", normalized)[:16]
        if not terms:
            return {"layer": 2, "results": [], "total": 0, "tokens_estimate": 0}
        variants = list(
            dict.fromkeys(
                t
                for term in terms
                for t in (term, term.replace("d", "đ"), term.replace("đ", "d"))
            )
        )
        expression = " OR ".join('"' + term + '"' for term in variants)
        conn = self.get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT
                    o.id, o.type, o.title, o.content, o.symbol, o.file_path,
                    bm25(observations_fts) as rank
                FROM observations o
                JOIN observations_fts fts ON o.id = fts.id
                WHERE observations_fts MATCH ?
                  AND o.archived = 0 AND (o.expires_at_epoch IS NULL OR o.expires_at_epoch > unixepoch()) AND o.project_root = ?
                ORDER BY rank * (1.0 + o.importance / 10.0), o.id
                LIMIT ?
            """,
                (expression, self.project_id, limit),
            )

            results = []
            for row in cursor:
                content = row["content"] if row["content"] else ""
                summary = content[:200] + ("..." if len(content) > 200 else "")
                results.append(
                    {
                        "id": row["id"],
                        "type": row["type"],
                        "title": row["title"],
                        "summary": summary,
                        "symbol": row["symbol"],
                        "file": row["file_path"],
                        "rank": row["rank"],
                    }
                )

            return {
                "layer": 2,
                "results": results,
                "total": len(results),
                "tokens_estimate": len(results) * 60 + 50,
            }
        finally:
            conn.close()

    # ── Layer 3: Full Detail ───────────────────────────────────────────────

    def memory_get(self, obs_id: int) -> Optional[dict]:
        """
        Layer 3: Only on explicit request. Full observation + links.
        Returns ~200 tokens/result.
        """
        conn = self.get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT * FROM observations WHERE id = ? AND archived = 0 AND (expires_at_epoch IS NULL OR expires_at_epoch > unixepoch()) AND project_root = ?
            """,
                (obs_id, self.project_id),
            )
            row = cursor.fetchone()
            if not row:
                return None

            # Get links
            links_cursor = conn.execute(
                """
                SELECT o.id, o.type, o.title, ol.link_type
                FROM observation_links ol
                JOIN observations o ON o.id = ol.target_id
                WHERE ol.source_id = ? AND o.project_root = ? AND o.archived = 0 AND (o.expires_at_epoch IS NULL OR o.expires_at_epoch > unixepoch())
            """,
                (obs_id, self.project_id),
            )

            links = []
            for link_row in links_cursor:
                links.append(
                    {
                        "id": link_row["id"],
                        "type": link_row["type"],
                        "title": link_row["title"],
                        "link_type": link_row["link_type"],
                    }
                )

            obs = dict(row)
            obs["links"] = links
            obs["tokens_estimate"] = estimate_tokens(
                json.dumps(obs, ensure_ascii=False)
            )
            return obs
        finally:
            conn.close()

    # ── CRUD Operations ─────────────────────────────────────────────────────

    def add(
        self,
        text: str,
        category: str = "general",
        source: str = "manual",
        title: Optional[str] = None,
        tags: Optional[list] = None,
        importance: int = 5,
        *,
        _connection=None,
    ) -> Optional[dict]:
        """Add a new observation."""
        text = redact_secrets(text)
        content_hash = make_hash(text)
        project_root = self.project_id

        owned = _connection is None
        conn = _connection if _connection is not None else self.get_connection()
        try:
            if owned:
                conn.execute("BEGIN IMMEDIATE")
            # Check for duplicate
            existing = conn.execute(
                """
                SELECT id,archived,expires_at_epoch FROM observations WHERE content_hash = ? AND project_root = ?
            """,
                (content_hash, project_root),
            ).fetchone()
            if existing:
                expired = (
                    existing["expires_at_epoch"] is not None
                    and existing["expires_at_epoch"] <= datetime.now().timestamp()
                )
                try:
                    bound_source = (
                        json.loads(source).get("schema")
                        == "forgewright-memory-source/v1"
                    )
                except (ValueError, AttributeError, TypeError):
                    bound_source = False
                if existing["archived"] or expired or bound_source:
                    conn.execute(
                        "UPDATE observations SET archived=0,archived_at=NULL,expires_at_epoch=CASE WHEN ? THEN NULL ELSE expires_at_epoch END,source=? WHERE id=? AND project_root=?",
                        (
                            bool(existing["archived"] or expired),
                            redact(source),
                            existing["id"],
                            self.project_id,
                        ),
                    )
                    if owned:
                        conn.commit()
                return {"id": existing["id"], "duplicate": True}

            if title is None:
                title = text[:100].replace("\n", " ")
            title = redact_secrets(title)
            source = redact_secrets(source)
            category = redact_secrets(category)

            tags_json = redact_secrets(json.dumps(tags or [], ensure_ascii=False))

            cursor = conn.execute(
                """
                INSERT INTO observations (
                    project_root, type, title, content, content_hash,
                    source, tags, importance
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    project_root,
                    category,
                    title,
                    text,
                    content_hash,
                    source,
                    tags_json,
                    importance,
                ),
            )
            obs_id = cursor.lastrowid
            if owned:
                conn.commit()

            return {"id": obs_id, "duplicate": False}
        finally:
            if owned:
                conn.close()

    def search(self, query: str, limit: int = 5) -> list:
        """Compatibility result shape backed by the same scoped FTS ranking."""
        return [
            {
                "id": row["id"],
                "type": row["type"],
                "category": row["type"],
                "title": row["title"],
                "memory": row["summary"],
            }
            for row in self.memory_search(query, limit)["results"]
        ]

    def list_all(self, category: Optional[str] = None, limit: int = 20) -> list:
        """List observations."""
        conn = self.get_connection()
        try:
            if category:
                cursor = conn.execute(
                    """
                    SELECT id, type, title, content, source, created_at
                    FROM observations
                    WHERE archived = 0 AND (expires_at_epoch IS NULL OR expires_at_epoch > unixepoch()) AND project_root = ? AND type = ?
                    ORDER BY created_at_epoch DESC
                    LIMIT ?
                """,
                    (self.project_id, category, limit),
                )
            else:
                cursor = conn.execute(
                    """
                    SELECT id, type, title, content, source, created_at
                    FROM observations
                    WHERE archived = 0 AND (expires_at_epoch IS NULL OR expires_at_epoch > unixepoch()) AND project_root = ?
                    ORDER BY created_at_epoch DESC
                    LIMIT ?
                """,
                    (self.project_id, limit),
                )

            results = []
            for row in cursor:
                content = row["content"] if row["content"] else ""
                results.append(
                    {
                        "id": row["id"],
                        "type": row["type"],
                        "title": row["title"],
                        "memory": content[:500],
                        "source": row["source"],
                        "created": row["created_at"],
                    }
                )
            return results
        finally:
            conn.close()

    def delete(self, obs_id: int) -> bool:
        """Archive an observation (soft delete)."""
        conn = self.get_connection()
        try:
            cursor = conn.execute(
                """
                UPDATE observations
                SET archived = 1, archived_at = datetime('now')
                WHERE id = ? AND project_root = ?
            """,
                (obs_id, self.project_id),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def count(self) -> int:
        """Count active observations."""
        conn = self.get_connection()
        try:
            cursor = conn.execute(
                "SELECT COUNT(*) as cnt FROM observations WHERE archived = 0 AND (expires_at_epoch IS NULL OR expires_at_epoch > unixepoch()) AND project_root = ?",
                (self.project_id,),
            )
            return cursor.fetchone()["cnt"]
        finally:
            conn.close()

    def size_bytes(self) -> int:
        """Get database file size."""
        return sum(
            path.stat().st_size
            for suffix in ("", "-wal", "-shm")
            if (path := Path(self.db_path + suffix)).exists()
        )

    def stats(self) -> dict:
        """Get memory statistics."""
        conn = self.get_connection()
        try:
            total = conn.execute(
                "SELECT COUNT(*) as cnt FROM observations WHERE archived = 0 AND (expires_at_epoch IS NULL OR expires_at_epoch > unixepoch()) AND project_root = ?",
                (self.project_id,),
            ).fetchone()["cnt"]

            by_type = {}
            cursor = conn.execute(
                """
                SELECT type, COUNT(*) as cnt
                FROM observations WHERE archived = 0 AND (expires_at_epoch IS NULL OR expires_at_epoch > unixepoch()) AND project_root = ?
                GROUP BY type
            """,
                (self.project_id,),
            )
            for row in cursor:
                by_type[row["type"]] = row["cnt"]

            # Graph Layer Stats (TSK-09)
            node_count = conn.execute(
                "SELECT COUNT(*) as cnt FROM flux_nodes WHERE id LIKE ?",
                (self.graph_prefix + "%",),
            ).fetchone()["cnt"]
            edge_count = conn.execute(
                "SELECT COUNT(*) as cnt FROM flux_edges WHERE source_id LIKE ?",
                (self.graph_prefix + "%",),
            ).fetchone()["cnt"]
            by_layer = {}
            layer_cursor = conn.execute(
                "SELECT layer, COUNT(*) as cnt FROM flux_nodes WHERE id LIKE ? GROUP BY layer",
                (self.graph_prefix + "%",),
            )
            for row in layer_cursor:
                by_layer[row["layer"]] = row["cnt"]

            return {
                "total": total,
                "by_type": by_type,
                "graph_nodes": node_count,
                "graph_edges": edge_count,
                "graph_by_layer": by_layer,
                "size_bytes": self.size_bytes(),
                "tokens_estimate": conn.execute(
                    "SELECT coalesce(sum(length(content)),0) FROM observations WHERE archived=0 AND project_root=?",
                    (self.project_id,),
                ).fetchone()[0]
                // 4,
            }
        finally:
            conn.close()

    # ── Garbage Collection ───────────────────────────────────────────────────

    def archive_candidates(
        self, max_obs: Optional[int] = None, *, connection=None
    ) -> list[int]:
        """One scoped, active-row selection shared by preview and archive."""
        max_o = (
            int(os.environ.get("MEM0_MAX_OBS", MAX_OBS_DEFAULT))
            if max_obs is None
            else max_obs
        )
        if type(max_o) is not int or max_o < 0:
            raise ValueError("invalid_retention_limit")
        conn = connection or self.get_connection()
        try:
            total = conn.execute(
                "SELECT count(*) FROM observations WHERE archived=0 AND project_root=? AND (expires_at_epoch IS NULL OR expires_at_epoch > unixepoch())",
                (self.project_id,),
            ).fetchone()[0]
            if total <= max_o:
                return []
            cursor = conn.execute(
                """
                SELECT id, type, pinned, created_at_epoch
                FROM observations
                WHERE archived = 0 AND (expires_at_epoch IS NULL OR expires_at_epoch > unixepoch()) AND pinned = 0 AND project_root = ?
                ORDER BY (
                    COALESCE(CAST(json_extract(?, '$.' || type) AS REAL), 1.0) * 0.5 +
                    (1.0 - MIN((unixepoch() - created_at_epoch) / 2592000.0, 1.0)) * 0.5
                ) ASC, id ASC
                LIMIT ?
            """,
                (self.project_id, json.dumps(CATEGORY_WEIGHTS), total - max_o),
            )
            return [row["id"] for row in cursor]
        finally:
            if connection is None:
                conn.close()

    def gc(self, max_obs: Optional[int] = None) -> int:
        """Archive the exact candidates exposed by retention-preview."""
        conn = self.get_connection()
        try:
            conn.execute("BEGIN IMMEDIATE")
            candidates = self.archive_candidates(max_obs, connection=conn)

            removed = 0
            for obs_id in candidates:
                conn.execute(
                    """
                    UPDATE observations
                    SET archived = 1, archived_at = datetime('now')
                    WHERE id = ? AND project_root = ?
                """,
                    (obs_id, self.project_id),
                )
                removed += 1

            conn.commit()
            return removed
        finally:
            conn.close()

    # ── RRF Fusion (for hybrid search) ──────────────────────────────────────

    def rrf_merge(self, *ranked_lists: list, k: int = 60) -> list:
        """
        Reciprocal Rank Fusion — merge rankings from multiple sources.
        Score = Σ 1/(k + rank)
        """
        scores = {}
        metadata = {}

        for rows in ranked_lists:
            for rank, item in enumerate(rows, start=1):
                oid = item.get("id")
                if oid is None:
                    continue
                scores[oid] = scores.get(oid, 0.0) + 1.0 / (k + rank)
                if oid not in metadata:
                    metadata[oid] = item

        # Sort by fused score
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        return [metadata[oid] for oid, _ in ranked]

    # ── Migration from JSONL ────────────────────────────────────────────────

    def migrate_from_jsonl(self, jsonl_path: str = MEMORY_JSONL) -> dict:
        """Explicit import into this scope; never infer foreign ownership."""
        path = Path(jsonl_path)
        if not path.is_absolute():
            path = workspace_root() / path
        if not path.is_file():
            return {"migrated": 0, "skipped": 0}
        migrated = skipped = 0
        conn = self.get_connection()
        try:
            conn.execute("BEGIN IMMEDIATE")
            for line in path.read_text().splitlines():
                try:
                    entry = json.loads(line)
                    if not isinstance(entry, dict):
                        raise ValueError("invalid_legacy_record")
                    owner = entry.get("project_root", entry.get("project"))
                    if owner and owner != self.project_id:
                        raise ValueError("foreign_legacy_scope")
                    text = entry.get("memory", entry.get("content", ""))
                    if not isinstance(text, str) or not text:
                        raise ValueError("missing_legacy_content")
                    created = entry.get("created")
                    moment = (
                        datetime.fromisoformat(created.replace("Z", "+00:00"))
                        if created
                        else None
                    )
                    result = self.add(
                        text,
                        category=entry.get("category", entry.get("type", "general")),
                        source=entry.get("source", "migrated"),
                        _connection=conn,
                    )
                    if result["duplicate"]:
                        skipped += 1
                    else:
                        if moment:
                            conn.execute(
                                "UPDATE observations SET created_at=?,created_at_epoch=? WHERE id=?",
                                (created, int(moment.timestamp()), result["id"]),
                            )
                        migrated += 1
                except (ValueError, TypeError):
                    skipped += 1
            conn.commit()
            return {"migrated": migrated, "skipped": skipped}
        finally:
            conn.close()

    # ── Layer 2: Relational Graph APIs (FluxMem Integration) ──────────────────

    def add_node(
        self, node_id: str, layer: str, title: str, content: str, pes_score: float = 0.0
    ) -> bool:
        """Add or update a node in the L2 cognitive graph."""
        if redact(node_id) != node_id:
            raise ValueError("unsafe_memory_identifier")
        conn = self.get_connection()
        try:
            conn.execute(
                """
                INSERT INTO flux_nodes (id, layer, title, content, pes_score)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    layer = excluded.layer,
                    title = excluded.title,
                    content = excluded.content,
                    pes_score = excluded.pes_score
            """,
                (
                    self.graph_prefix + node_id,
                    layer,
                    redact_secrets(title),
                    redact_secrets(content),
                    pes_score,
                ),
            )
            conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error adding graph node: {e}", file=sys.stderr)
            return False
        finally:
            conn.close()

    def add_edge(
        self,
        source_id: str,
        target_id: str,
        weight: float = 1.0,
        edge_type: str = "relates_to",
    ) -> bool:
        """Add or update an edge in the L2 cognitive graph."""
        conn = self.get_connection()
        try:
            conn.execute(
                """
                INSERT INTO flux_edges (source_id, target_id, weight, edge_type, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(source_id, target_id, edge_type) DO UPDATE SET
                    weight = excluded.weight,
                    updated_at = datetime('now')
            """,
                (
                    self.graph_prefix + source_id,
                    self.graph_prefix + target_id,
                    weight,
                    redact_secrets(edge_type),
                ),
            )
            conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error adding graph edge: {e}", file=sys.stderr)
            return False
        finally:
            conn.close()

    def decay_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: str = "relates_to",
        factor: float = 0.5,
    ) -> bool:
        """Decay the weight of an edge (used on failure paths)."""
        conn = self.get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT weight FROM flux_edges
                WHERE source_id = ? AND target_id = ? AND edge_type = ?
            """,
                (
                    self.graph_prefix + source_id,
                    self.graph_prefix + target_id,
                    edge_type,
                ),
            )
            row = cursor.fetchone()
            if not row:
                return False
            new_weight = max(0.1, round(row["weight"] * factor, 2))
            conn.execute(
                """
                UPDATE flux_edges
                SET weight = ?, updated_at = datetime('now')
                WHERE source_id = ? AND target_id = ? AND edge_type = ?
            """,
                (
                    new_weight,
                    self.graph_prefix + source_id,
                    self.graph_prefix + target_id,
                    edge_type,
                ),
            )
            conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error decaying edge: {e}", file=sys.stderr)
            return False
        finally:
            conn.close()

    def reinforce_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: str = "relates_to",
        factor: float = 1.2,
    ) -> bool:
        """Reinforce the weight of an edge (used on success paths)."""
        conn = self.get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT weight FROM flux_edges
                WHERE source_id = ? AND target_id = ? AND edge_type = ?
            """,
                (
                    self.graph_prefix + source_id,
                    self.graph_prefix + target_id,
                    edge_type,
                ),
            )
            row = cursor.fetchone()
            if not row:
                return False
            new_weight = min(5.0, round(row["weight"] * factor, 2))
            conn.execute(
                """
                UPDATE flux_edges
                SET weight = ?, updated_at = datetime('now')
                WHERE source_id = ? AND target_id = ? AND edge_type = ?
            """,
                (
                    new_weight,
                    self.graph_prefix + source_id,
                    self.graph_prefix + target_id,
                    edge_type,
                ),
            )
            conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error reinforcing edge: {e}", file=sys.stderr)
            return False
        finally:
            conn.close()

    def get_neighbors(self, node_id: str, limit: int = 10) -> list:
        """Retrieve active neighbors of a node with weights."""
        conn = self.get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT n.id, n.layer, n.title, n.content, n.pes_score, e.weight, e.edge_type
                FROM flux_edges e
                JOIN flux_nodes n ON n.id = e.target_id
                WHERE e.source_id = ?
                ORDER BY e.weight DESC
                LIMIT ?
            """,
                (self.graph_prefix + node_id, limit),
            )

            results = []
            for row in cursor:
                results.append(
                    {
                        "id": row["id"].removeprefix(self.graph_prefix),
                        "layer": row["layer"],
                        "title": row["title"],
                        "content": row["content"],
                        "pes_score": row["pes_score"],
                        "weight": row["weight"],
                        "edge_type": row["edge_type"],
                    }
                )
            return results
        except sqlite3.Error as e:
            print(f"Error getting neighbors: {e}", file=sys.stderr)
            return []
        finally:
            conn.close()

    def save_procedural_circuit(
        self, circuit_id: str, name: str, steps_json: str, pems_score: float
    ) -> bool:
        """Consolidate high-performance procedural workflows."""
        if redact(circuit_id) != circuit_id:
            raise ValueError("unsafe_memory_identifier")
        conn = self.get_connection()
        try:
            conn.execute(
                """
                INSERT INTO procedural_circuits (id, name, steps_json, pems_score, runs_count, created_at)
                VALUES (?, ?, ?, ?, 1, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                    steps_json = excluded.steps_json,
                    pems_score = excluded.pems_score,
                    runs_count = runs_count + 1
            """,
                (
                    self.graph_prefix + circuit_id,
                    redact_secrets(name),
                    redact_secrets(steps_json),
                    pems_score,
                ),
            )
            conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error saving procedural circuit: {e}", file=sys.stderr)
            return False
        finally:
            conn.close()

    def get_procedural_circuit(self, circuit_id: str) -> Optional[dict]:
        """Retrieve established procedural path or circuit."""
        conn = self.get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT id, name, steps_json, pems_score, runs_count, success_count, created_at
                FROM procedural_circuits
                WHERE id = ?
            """,
                (self.graph_prefix + circuit_id,),
            )
            row = cursor.fetchone()
            if row:
                return {
                    "id": row["id"].removeprefix(self.graph_prefix),
                    "name": row["name"],
                    "steps_json": row["steps_json"],
                    "pems_score": row["pems_score"],
                    "runs_count": row["runs_count"],
                    "success_count": row["success_count"],
                    "created_at": row["created_at"],
                }
            return None
        except sqlite3.Error as e:
            print(f"Error getting procedural circuit: {e}", file=sys.stderr)
            return None
        finally:
            conn.close()

    def increment_circuit_success(self, circuit_id: str) -> bool:
        """Increment the success count for a procedural circuit."""
        conn = self.get_connection()
        try:
            conn.execute(
                """
                UPDATE procedural_circuits
                SET success_count = success_count + 1
                WHERE id = ?
            """,
                (self.graph_prefix + circuit_id,),
            )
            conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error incrementing circuit success: {e}", file=sys.stderr)
            return False
        finally:
            conn.close()


# ── Commands ─────────────────────────────────────────────────────────────────


def cmd_doctor(args):
    """Observe storage without initializing it or claiming host activation."""
    path = database_path()
    storage = {"status": "not-configured", "path": str(path)}
    capture = {"status": "disabled" if is_disabled() else "not-configured"}
    if is_disabled():
        storage["status"] = "disabled"
    elif path.is_file():
        try:
            if continuity._has_symlink_component(path):
                raise sqlite3.DatabaseError("unsafe memory path")
            with closing(
                sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=0.2)
            ) as conn:
                conn.execute("PRAGMA query_only=ON")
                version = conn.execute("PRAGMA user_version").fetchone()[0]
                storage["schema_version"] = version
                storage["status"] = (
                    "ready"
                    if conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
                    and version == SCHEMA_VERSION
                    else "migration-required"
                    if version in (0, 1)
                    else "degraded"
                )
                if storage["status"] == "ready":
                    scopes = conn.execute(
                        "SELECT project_root,count(*) FROM capture_events GROUP BY project_root"
                    ).fetchall()
                    base = project_id()
                    acknowledged = sum(
                        row[1]
                        for row in scopes
                        if row[0] == base or row[0].startswith(base + ":session:")
                    )
                    if acknowledged:
                        capture = {
                            "status": "acknowledged",
                            "adapter": "explicit-cli",
                            "events": acknowledged,
                            "native_auto_capture": "unverified",
                        }
        except sqlite3.Error:
            storage["status"] = "degraded"
    status = {
        "schema_version": 1,
        "storage": storage,
        "capture": capture,
        "retrieval": {"status": storage["status"]},
        "injection": {"status": "disabled" if is_disabled() else "unverified"},
        "limitations": [
            "Storage health does not prove host capture or context injection",
            "Cloud recreation persistence is unverified",
        ],
    }
    print(json.dumps(status, ensure_ascii=False))


def get_db() -> MemoryDB:
    return MemoryDB()


def cmd_flow(args):
    from memory_flow import main as flow_main

    raise SystemExit(flow_main([sys.argv[1], *args]))


def cmd_maintenance(args):
    from memory_maintenance import main as maintenance_main

    raise SystemExit(maintenance_main([sys.argv[1], *args]))


def cmd_search(args):
    if len(args) < 1:
        print("Usage: mem0-v2.py search <query> [--limit N] [--format compact|full]")
        return
    query = args[0]
    limit = 5
    fmt = "compact"
    for i, a in enumerate(args[1:], 1):
        if a == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1])
        if a == "--format" and i + 1 < len(args):
            fmt = args[i + 1]

    db = get_db()
    results = db.search(query, limit=limit)
    if not results:
        print("No memories found.")
        return

    if fmt == "compact":
        for m in results:
            cat = f"[{m.get('category', '')}] " if m.get("category") else ""
            mem_text = m.get("memory", m.get("title", "")).replace("\n", " ")[:200]
            print(f"  • {cat}{mem_text}")
    else:
        print(json.dumps(results, indent=2, default=str, ensure_ascii=False))


def cmd_index(args):
    """Layer 1: Compact index only."""
    if len(args) < 1:
        print("Usage: mem0-v2.py index <query> [--limit N]")
        return
    query = args[0]
    limit = 30
    for i, a in enumerate(args[1:], 1):
        if a == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1])

    db = get_db()
    result = db.memory_index(query, limit=limit)
    print(f"Layer 1 Index ({result['tokens_estimate']} tokens est.):")
    for r in result["results"]:
        print(f"  [{r['id']}] {r['type']}: {r['title'][:80]} (score={r['score']})")


def cmd_add(args):
    if len(args) < 1:
        print(
            "Usage: mem0-v2.py add <text> [--category <cat>] [--title <title>] [--tags <tag1,tag2>] [--importance <1-10>]"
        )
        return
    text = args[0]
    category = "general"
    title = None
    tags = None
    importance = 5
    for i, a in enumerate(args[1:], 1):
        if a == "--category" and i + 1 < len(args):
            category = args[i + 1]
        if a == "--title" and i + 1 < len(args):
            title = args[i + 1]
        if a == "--tags" and i + 1 < len(args):
            tags = args[i + 1].split(",")
        if a == "--importance" and i + 1 < len(args):
            importance = max(1, min(10, int(args[i + 1])))

    # Auto-extract tags if none provided
    if tags is None:
        tags = auto_extract_tags(text)

    db = get_db()
    entry = db.add(
        text, category=category, title=title, tags=tags, importance=importance
    )
    if entry:
        if entry.get("duplicate"):
            print(f"ℹ️  Memory already exists [id={entry['id']}]")
        else:
            tag_info = f" tags:{','.join(redact(tags))}" if tags else ""
            print(
                f"✅ Memory added [id={entry['id']}] ({redact(category)}, importance={importance}{tag_info})"
            )
    else:
        print("❌ Failed to add memory")


def cmd_get(args):
    """Layer 3: Full observation detail."""
    if len(args) < 1:
        print("Usage: mem0-v2.py get <id>")
        return
    obs_id = int(args[0])
    db = get_db()
    obs = db.memory_get(obs_id)
    if not obs:
        print(f"Observation {obs_id} not found.")
        return
    print(json.dumps(obs, indent=2, default=str, ensure_ascii=False))


def cmd_list(args):
    limit = 20
    category = None
    for i, a in enumerate(args):
        if a == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1])
        if a == "--category" and i + 1 < len(args):
            category = args[i + 1]

    db = get_db()
    entries = db.list_all(category=category, limit=limit)
    if not entries:
        print("No memories stored.")
        return

    for m in entries:
        cat = f"[{m.get('type', '')}]" if m.get("type") else ""
        title = m.get("title", m.get("memory", ""))[:120]
        print(f"  [{m['id']}] {cat} {title}")
    print(f"\nTotal: {len(entries)}")


def cmd_delete(args):
    if len(args) < 1:
        print("Usage: mem0-v2.py delete <id>")
        return
    obs_id = int(args[0])
    db = get_db()
    if db.delete(obs_id):
        print(f"✅ Deleted observation {obs_id}")
    else:
        print(f"❌ Observation {obs_id} not found")


def cmd_stats(args):
    db = get_db()
    pid = get_project_id()
    stats = db.stats()

    print(f"📊 Memory Stats for '{pid}' (Memory v2)")
    print(f"  Observations: {stats['total']}")
    print(f"  Database size: {stats['size_bytes']:,} bytes")
    print(f"  Tokens (est.): {stats['tokens_estimate']:,}")
    print(f"  Max before GC: {os.environ.get('MEM0_MAX_OBS', MAX_OBS_DEFAULT)}")

    if stats["by_type"]:
        print("  Categories:")
        for cat, count in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
            weight = CATEGORY_WEIGHTS.get(cat, 3)
            print(f"    {cat}: {count} (weight: {weight})")

    # Display Graph Stats (TSK-09)
    print("\n🌐 Cognitive Graph Stats (L2 Memory):")
    print(f"  Graph Nodes: {stats.get('graph_nodes', 0)}")
    print(f"  Graph Edges: {stats.get('graph_edges', 0)}")
    if stats.get("graph_by_layer"):
        print("  By Layer:")
        for layer, count in sorted(
            stats["graph_by_layer"].items(), key=lambda x: -x[1]
        ):
            print(f"    {layer}: {count}")


def cmd_gc(args):
    max_o = None
    for i, a in enumerate(args):
        if a == "--max-obs" and i + 1 < len(args):
            max_o = int(args[i + 1])
    db = get_db()
    removed = db.gc(max_obs=max_o)
    print(f"✅ GC complete: archived {removed} observations (kept {db.count()})")


def cmd_migrate(args):
    db = get_db()
    print("🔄 Migrating from JSONL to SQLite...")
    result = db.migrate_from_jsonl()
    print(
        f"✅ Migration complete: {result['migrated']} migrated, {result['skipped']} skipped"
    )
    print(f"   Total observations: {db.count()}")


def cmd_setup(args):
    print("🔧 Forgewright Memory Manager v2 Setup\n")
    root = workspace_root()

    db = get_db()
    print(f"  ✅ {db.db_path} initialized ({db.size_bytes()} bytes)")

    ignore_path = root / MEMIGNORE_FILE
    if not ignore_path.exists():
        ignore_path.write_text(
            "# Exclude from memory ingestion\n.env\n.env.*\nsecrets/\ncredentials/\n"
            "**/node_modules/**\n**/.git/**\n*.log\n"
        )
        print(f"  ✅ {MEMIGNORE_FILE} created")

    # Offer migration if JSONL exists
    if Path(MEMORY_JSONL).exists():
        print(f"\n  ℹ️  Found legacy {MEMORY_JSONL}")
        print("     Run 'mem0-v2.py migrate' to import existing memories")

    print("\n✅ Setup complete!")
    print("   Storage: SQLite + FTS5 (WAL mode)")
    print("   Search: BM25 ranking + progressive disclosure")
    print(f"   GC: value-weighted | Max: {MAX_OBS_DEFAULT}")


def cmd_graph_add_node(args):
    if len(args) < 4:
        print(
            "Usage: mem0-v2.py graph-add-node <id> <layer> <title> <content> [--pes <score>]"
        )
        return
    node_id = args[0]
    layer = args[1]
    title = args[2]
    content = args[3]
    pes_score = 0.0
    for i, a in enumerate(args[4:], 4):
        if a == "--pes" and i + 1 < len(args):
            pes_score = float(args[i + 1])

    db = get_db()
    if db.add_node(node_id, layer, title, content, pes_score):
        print(f"✅ Node added [id={node_id}] (layer={layer})")
    else:
        print("❌ Failed to add graph node")


def cmd_graph_link(args):
    if len(args) < 2:
        print(
            "Usage: mem0-v2.py graph-link <source_id> <target_id> [--weight <W>] [--type <type>]"
        )
        return
    source_id = args[0]
    target_id = args[1]
    weight = 1.0
    edge_type = "relates_to"
    for i, a in enumerate(args[2:], 2):
        if a == "--weight" and i + 1 < len(args):
            weight = float(args[i + 1])
        if a == "--type" and i + 1 < len(args):
            edge_type = args[i + 1]

    db = get_db()
    if db.add_edge(source_id, target_id, weight, edge_type):
        print(
            f"✅ Edge linked [source={source_id}] ──({edge_type}, weight={weight})──► [target={target_id}]"
        )
    else:
        print("❌ Failed to link edge")


def cmd_graph_decay(args):
    if len(args) < 2:
        print(
            "Usage: mem0-v2.py graph-decay <source_id> <target_id> [--type <type>] [--factor <F>]"
        )
        return
    source_id = args[0]
    target_id = args[1]
    edge_type = "relates_to"
    factor = 0.5
    for i, a in enumerate(args[2:], 2):
        if a == "--type" and i + 1 < len(args):
            edge_type = args[i + 1]
        if a == "--factor" and i + 1 < len(args):
            factor = float(args[i + 1])

    db = get_db()
    if db.decay_edge(source_id, target_id, edge_type, factor):
        print(
            f"✅ Edge decayed [source={source_id}] ──({edge_type})──► [target={target_id}]"
        )
    else:
        print("❌ Failed to decay edge")


def cmd_graph_reinforce(args):
    if len(args) < 2:
        print(
            "Usage: mem0-v2.py graph-reinforce <source_id> <target_id> [--type <type>] [--factor <F>]"
        )
        return
    source_id = args[0]
    target_id = args[1]
    edge_type = "relates_to"
    factor = 1.2
    for i, a in enumerate(args[2:], 2):
        if a == "--type" and i + 1 < len(args):
            edge_type = args[i + 1]
        if a == "--factor" and i + 1 < len(args):
            factor = float(args[i + 1])

    db = get_db()
    if db.reinforce_edge(source_id, target_id, edge_type, factor):
        print(
            f"✅ Edge reinforced [source={source_id}] ──({edge_type})──► [target={target_id}]"
        )
    else:
        print("❌ Failed to reinforce edge")


def cmd_graph_neighbors(args):
    if len(args) < 1:
        print("Usage: mem0-v2.py graph-neighbors <node_id> [--limit N]")
        return
    node_id = args[0]
    limit = 10
    for i, a in enumerate(args[1:], 1):
        if a == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1])

    db = get_db()
    results = db.get_neighbors(node_id, limit)
    if not results:
        print("No neighbors found.")
        return
    print(f"Graph Neighbors for [{node_id}]:")
    for r in results:
        pes_info = f" (PES={r['pes_score']})" if r["pes_score"] > 0 else ""
        print(
            f"  ──({r['edge_type']}, weight={r['weight']})──► [{r['id']}] {r['layer']}{pes_info}: {r['title'][:80]}"
        )


def cmd_graph_save_circuit(args):
    if len(args) < 4:
        print(
            "Usage: mem0-v2.py graph-save-circuit <id> <name> <steps_json> <pems_score>"
        )
        return
    circuit_id, name, steps_json = args[0], args[1], args[2]
    try:
        pems_score = float(args[3])
    except ValueError:
        print("Error: pems_score must be a float")
        return

    db = get_db()
    if db.save_procedural_circuit(circuit_id, name, steps_json, pems_score):
        print(f"✓ Consolidated procedural circuit '{circuit_id}'")
    else:
        print("❌ Failed to save procedural circuit")


def cmd_graph_get_circuit(args):
    if len(args) < 1:
        print("Usage: mem0-v2.py graph-get-circuit <id>")
        return
    circuit_id = args[0]
    db = get_db()
    res = db.get_procedural_circuit(circuit_id)
    if not res:
        print(f"Circuit '{circuit_id}' not found.")
        return
    print(f"Procedural Circuit [{res['id']}]:")
    print(f"  Name:          {res['name']}")
    print(f"  PEMS Score:    {res['pems_score']}")
    print(f"  Runs Count:    {res['runs_count']}")
    print(f"  Success Count: {res['success_count']}")
    print(f"  Created At:    {res['created_at']}")
    print("  Steps JSON:")
    print(res["steps_json"])


def cmd_graph_inc_circuit(args):
    if len(args) < 1:
        print("Usage: mem0-v2.py graph-inc-circuit <id>")
        return
    circuit_id = args[0]
    db = get_db()
    if db.increment_circuit_success(circuit_id):
        print(f"✓ Incremented success for circuit '{circuit_id}'")
    else:
        print("❌ Failed to increment success")


# ── Main ─────────────────────────────────────────────────────────────────────

COMMANDS = {
    "backup": cmd_maintenance,
    "migrate-db": cmd_maintenance,
    "retention-preview": cmd_maintenance,
    "capture": cmd_flow,
    "context": cmd_flow,
    "doctor": cmd_doctor,
    "status": cmd_doctor,
    "search": cmd_search,
    "index": cmd_index,
    "add": cmd_add,
    "get": cmd_get,
    "list": cmd_list,
    "delete": cmd_delete,
    "stats": cmd_stats,
    "gc": cmd_gc,
    "migrate": cmd_migrate,
    "setup": cmd_setup,
    "graph-add-node": cmd_graph_add_node,
    "graph-link": cmd_graph_link,
    "graph-decay": cmd_graph_decay,
    "graph-reinforce": cmd_graph_reinforce,
    "graph-neighbors": cmd_graph_neighbors,
    "graph-save-circuit": cmd_graph_save_circuit,
    "graph-get-circuit": cmd_graph_get_circuit,
    "graph-inc-circuit": cmd_graph_inc_circuit,
}


def main():
    if len(sys.argv) > 1 and sys.argv[1] in {
        "backup",
        "migrate-db",
        "retention-preview",
    }:
        cmd_maintenance(sys.argv[2:])
        return
    if len(sys.argv) > 1 and sys.argv[1] in {"capture", "context"}:
        cmd_flow(sys.argv[2:])
        return
    if len(sys.argv) > 1 and sys.argv[1] in {"doctor", "status"}:
        cmd_doctor(sys.argv[2:])
        return
    if is_disabled():
        return
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        print("Commands:", ", ".join(COMMANDS.keys()))
        return
    cmd = sys.argv[1]
    if cmd not in COMMANDS:
        print(f"Unknown: {cmd}\nAvailable: {', '.join(COMMANDS.keys())}")
        sys.exit(1)
    if (
        cmd in {"search", "index", "get", "list", "stats"}
        and not database_path().is_file()
    ):
        print("No memories found.")
        return
    COMMANDS[cmd](sys.argv[2:])


if __name__ == "__main__":
    main()
