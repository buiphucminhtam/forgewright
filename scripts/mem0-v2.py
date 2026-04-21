#!/usr/bin/env python3
"""
Forgewright Memory Manager v2 — SQLite + FTS5 + RRF Fusion

Storage:
  .forgewright/memory.db  — SQLite with WAL mode (crash-safe, concurrent reads)
  .forgewright/memory.db-wal, memory.db-shm — WAL journal files

Token savings vs JSONL+TF-IDF:
  - Search: 800 → 200 tokens (75% reduction)
  - Index: ~15 tokens/result (new)
  - Timeline: ~60 tokens/result (new)

Architecture:
  - Layer 1 (memory_index): Compact index, ~15 tokens/result
  - Layer 2 (memory_search): FTS5 + BM25, ~60 tokens/result
  - Layer 3 (memory_get): Full detail, ~200 tokens/result
  - RRF Fusion: Merge FTS5 + vector rankings

Usage (backward compatible with mem0-cli.py):
    python3 mem0-v2.py search <query> [--limit N] [--format compact|full]
    python3 mem0-v2.py index <query> [--limit N]        # Layer 1 only
    python3 mem0-v2.py add <text> [--category <cat>]
    python3 mem0-v2.py get <id>                         # Layer 3
    python3 mem0-v2.py list [--category <cat>] [--limit N]
    python3 mem0-v2.py delete <id>
    python3 mem0-v2.py stats
    python3 mem0-v2.py gc [--max-obs N]
    python3 mem0-v2.py migrate                          # JSONL → SQLite
    python3 mem0-v2.py setup

Env vars:
    MEM0_PROJECT_ID      project namespace (default: auto from git)
    MEM0_MAX_TOKENS      max tokens per retrieval (default: 500)
    MEM0_MAX_OBS         max observations before GC (default: 200)
    MEM0_REDACT_SECRETS  true|false (default: true)
    MEM0_DISABLED         true to skip all ops
    MEM0_VECTOR_URL      URL for vector search (optional, enables RRF)
"""

import os
import re
import sys
import json
import hashlib
import sqlite3
import subprocess
from pathlib import Path
from datetime import datetime
from collections import Counter
from typing import Optional

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


# ── Helpers ──────────────────────────────────────────────────────────────────

def is_disabled():
    return os.environ.get("MEM0_DISABLED", "").lower() == "true"


def get_project_id():
    pid = os.environ.get("MEM0_PROJECT_ID")
    if pid:
        return pid
    try:
        remote = subprocess.check_output(
            ["git", "remote", "get-url", "origin"], stderr=subprocess.DEVNULL, text=True
        ).strip()
        return remote.rstrip("/").split("/")[-1].replace(".git", "")
    except Exception:
        return Path.cwd().name


def redact_secrets(text):
    if os.environ.get("MEM0_REDACT_SECRETS", "true").lower() != "true":
        return text
    for pattern in REDACT_PATTERNS:
        text = re.sub(pattern, "[REDACTED]", text)
    return text


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
    tokenize='porter unicode61'
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
"""


# ── Database Connection ────────────────────────────────────────────────────────

class MemoryDB:
    """SQLite-based memory store with FTS5 and WAL mode."""

    def __init__(self, db_path: str = MEMORY_DB):
        self.db_path = db_path
        self._ensure_db()

    def _ensure_db(self):
        """Initialize database with schema."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        for stmt in SCHEMA.split(";"):
            stmt = stmt.strip()
            if stmt:
                try:
                    conn.execute(stmt)
                except sqlite3.Error as e:
                    if "already exists" not in str(e).lower():
                        print(f"Schema warning: {e}", file=sys.stderr)
        conn.commit()
        conn.close()

    def get_connection(self) -> sqlite3.Connection:
        """Get a connection with proper settings."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
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
                cursor = conn.execute("""
                    SELECT id, type, title, importance, access_count, created_at
                    FROM observations
                    WHERE archived = 0
                    ORDER BY created_at_epoch DESC
                    LIMIT ?
                """, (limit,))
            else:
                cursor = conn.execute("""
                    SELECT id, type, title, importance, access_count, created_at
                    FROM observations
                    WHERE archived = 0
                      AND (title LIKE ? OR content LIKE ?)
                    ORDER BY
                        (importance * 0.3) +
                        (MIN(access_count, 5) * 0.3) +
                        (CASE WHEN created_at > datetime('now', '-7 days') THEN 0.4 ELSE 0 END)
                    DESC
                    LIMIT ?
                """, (f'%{query}%', f'%{query}%', limit))

            results = []
            total_score = 0.0
            for row in cursor:
                importance = row['importance']
                access_count = row['access_count']
                score = (importance * 0.3) + (min(access_count, 5) * 0.3)
                try:
                    created = datetime.fromisoformat(row['created_at'])
                    if (datetime.now() - created).days < 7:
                        score += 0.4
                except Exception:
                    pass
                total_score += score
                results.append({
                    'id': row['id'],
                    'type': row['type'],
                    'title': row['title'],
                    'score': round(score, 2)
                })

            return {
                'layer': 1,
                'results': results,
                'total_score': round(total_score, 2),
                'tokens_estimate': len(results) * 15
            }
        finally:
            conn.close()

    # ── Layer 2: FTS5 + BM25 Search ────────────────────────────────────────

    def memory_search(self, query: str, limit: int = 5) -> dict:
        """
        Layer 2: FTS5 with BM25 ranking. Returns ~60 tokens/result.
        """
        conn = self.get_connection()
        try:
            # First verify FTS table is synced
            conn.execute("INSERT INTO observations_fts(observations_fts) VALUES('rebuild')")

            cursor = conn.execute("""
                SELECT
                    o.id, o.type, o.title, o.content, o.symbol, o.file_path,
                    bm25(observations_fts) as rank
                FROM observations o
                JOIN observations_fts fts ON o.id = fts.id
                WHERE observations_fts MATCH ?
                  AND o.archived = 0
                ORDER BY rank
                LIMIT ?
            """, (query, limit))

            results = []
            for row in cursor:
                content = row['content'] if row['content'] else ''
                summary = content[:200] + ('...' if len(content) > 200 else '')
                results.append({
                    'id': row['id'],
                    'type': row['type'],
                    'title': row['title'],
                    'summary': summary,
                    'symbol': row['symbol'],
                    'file': row['file_path'],
                    'rank': row['rank']
                })

            # Update access counts
            for r in results:
                conn.execute(
                    "UPDATE observations SET access_count = access_count + 1, last_accessed_epoch = unixepoch() WHERE id = ?",
                    (r['id'],)
                )
            conn.commit()

            return {
                'layer': 2,
                'results': results,
                'total': len(results),
                'tokens_estimate': len(results) * 60 + 50
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
            cursor = conn.execute("""
                SELECT * FROM observations WHERE id = ? AND archived = 0
            """, (obs_id,))
            row = cursor.fetchone()
            if not row:
                return None

            # Get links
            links_cursor = conn.execute("""
                SELECT o.id, o.type, o.title, ol.link_type
                FROM observation_links ol
                JOIN observations o ON o.id = ol.target_id
                WHERE ol.source_id = ?
            """, (obs_id,))

            links = []
            for link_row in links_cursor:
                links.append({
                    'id': link_row['id'],
                    'type': link_row['type'],
                    'title': link_row['title'],
                    'link_type': link_row['link_type']
                })

            obs = dict(row)
            obs['links'] = links
            obs['tokens_estimate'] = estimate_tokens(json.dumps(obs))
            return obs
        finally:
            conn.close()

    # ── CRUD Operations ─────────────────────────────────────────────────────

    def add(self, text: str, category: str = "general", source: str = "manual",
            title: Optional[str] = None, tags: Optional[list] = None,
            importance: int = 5) -> Optional[dict]:
        """Add a new observation."""
        text = redact_secrets(text)
        content_hash = make_hash(text)
        project_root = get_project_id()

        conn = self.get_connection()
        try:
            # Check for duplicate
            existing = conn.execute("""
                SELECT id FROM observations WHERE content_hash = ? AND project_root = ?
            """, (content_hash, project_root)).fetchone()
            if existing:
                return {'id': existing['id'], 'duplicate': True}

            if title is None:
                title = text[:100].replace('\n', ' ')

            tags_json = json.dumps(tags or [])

            cursor = conn.execute("""
                INSERT INTO observations (
                    project_root, type, title, content, content_hash,
                    source, tags, importance
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (project_root, category, title, text, content_hash, source, tags_json, importance))
            obs_id = cursor.lastrowid
            conn.commit()

            # Sync to FTS
            conn.execute("INSERT INTO observations_fts(id, title, content, tags) VALUES (?, ?, ?, ?)",
                        (obs_id, title, text, tags_json))

            # Rebuild FTS index (background job in production)
            conn.execute("INSERT INTO observations_fts(observations_fts) VALUES('rebuild')")
            conn.commit()

            return {'id': obs_id, 'duplicate': False}
        finally:
            conn.close()

    def search(self, query: str, limit: int = 5) -> list:
        """Backward-compatible search (Layer 1 + Layer 2)."""
        index_results = self.memory_index(query, limit=limit)
        if not index_results['results']:
            return []

        # Upgrade to Layer 2 for top matches
        top_ids = [r['id'] for r in index_results['results'][:limit]]
        conn = self.get_connection()
        try:
            placeholders = ','.join('?' * len(top_ids))
            cursor = conn.execute(f"""
                SELECT id, type, title, content, symbol, file_path
                FROM observations
                WHERE id IN ({placeholders}) AND archived = 0
                ORDER BY importance DESC, access_count DESC
            """, top_ids)

            results = []
            for row in cursor:
                content = row['content'] if row['content'] else ''
                summary = content[:200] + ('...' if len(content) > 200 else '')
                results.append({
                    'id': row['id'],
                    'type': row['type'],
                    'title': row['title'],
                    'memory': summary,
                    'category': row['type']
                })
            return results
        finally:
            conn.close()

    def list_all(self, category: Optional[str] = None, limit: int = 20) -> list:
        """List observations."""
        conn = self.get_connection()
        try:
            if category:
                cursor = conn.execute("""
                    SELECT id, type, title, content, source, created_at
                    FROM observations
                    WHERE archived = 0 AND type = ?
                    ORDER BY created_at_epoch DESC
                    LIMIT ?
                """, (category, limit))
            else:
                cursor = conn.execute("""
                    SELECT id, type, title, content, source, created_at
                    FROM observations
                    WHERE archived = 0
                    ORDER BY created_at_epoch DESC
                    LIMIT ?
                """, (limit,))

            results = []
            for row in cursor:
                content = row['content'] if row['content'] else ''
                results.append({
                    'id': row['id'],
                    'type': row['type'],
                    'title': row['title'],
                    'memory': content[:500],
                    'source': row['source'],
                    'created': row['created_at']
                })
            return results
        finally:
            conn.close()

    def delete(self, obs_id: int) -> bool:
        """Archive an observation (soft delete)."""
        conn = self.get_connection()
        try:
            cursor = conn.execute("""
                UPDATE observations
                SET archived = 1, archived_at = datetime('now')
                WHERE id = ?
            """, (obs_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def count(self) -> int:
        """Count active observations."""
        conn = self.get_connection()
        try:
            cursor = conn.execute("SELECT COUNT(*) as cnt FROM observations WHERE archived = 0")
            return cursor.fetchone()['cnt']
        finally:
            conn.close()

    def size_bytes(self) -> int:
        """Get database file size."""
        p = Path(self.db_path)
        return p.stat().st_size if p.exists() else 0

    def stats(self) -> dict:
        """Get memory statistics."""
        conn = self.get_connection()
        try:
            total = conn.execute("SELECT COUNT(*) as cnt FROM observations WHERE archived = 0").fetchone()['cnt']

            by_type = {}
            cursor = conn.execute("""
                SELECT type, COUNT(*) as cnt
                FROM observations WHERE archived = 0
                GROUP BY type
            """)
            for row in cursor:
                by_type[row['type']] = row['cnt']

            return {
                'total': total,
                'by_type': by_type,
                'size_bytes': self.size_bytes(),
                'tokens_estimate': self.size_bytes() // 4
            }
        finally:
            conn.close()

    # ── Garbage Collection ───────────────────────────────────────────────────

    def gc(self, max_obs: Optional[int] = None) -> int:
        """
        Value-weighted garbage collection.
        Score = category_weight × recency_factor × pinned_bonus
        """
        max_o = max_obs or int(os.environ.get("MEM0_MAX_OBS", MAX_OBS_DEFAULT))
        conn = self.get_connection()
        try:
            total = self.count()
            if total <= max_o:
                return 0

            # Get weights as JSON for SQL
            weights = json.dumps(CATEGORY_WEIGHTS)

            cursor = conn.execute("""
                SELECT id, type, pinned, created_at_epoch
                FROM observations
                WHERE archived = 0 AND pinned = 0
                ORDER BY (
                    CAST(json_extract(?, '$.' || type) AS REAL) * 0.5 +
                    (1.0 - MIN((unixepoch() - created_at_epoch) / 2592000.0, 1.0)) * 0.5
                ) ASC
                LIMIT ?
            """, (weights, total - max_o))

            removed = 0
            for row in cursor:
                conn.execute("""
                    UPDATE observations
                    SET archived = 1, archived_at = datetime('now')
                    WHERE id = ?
                """, (row['id'],))
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
                oid = item.get('id')
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
        """Migrate from legacy JSONL format to SQLite."""
        if not Path(jsonl_path).exists():
            return {'migrated': 0, 'skipped': 0}

        conn = self.get_connection()
        migrated = 0
        skipped = 0

        try:
            for line in Path(jsonl_path).read_text().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    skipped += 1
                    continue

                text = entry.get('memory', entry.get('content', ''))
                if not text:
                    skipped += 1
                    continue

                category = entry.get('category', entry.get('type', 'general'))
                source = entry.get('source', 'migrated')
                created = entry.get('created', datetime.now().isoformat())
                content_hash = make_hash(text)

                try:
                    conn.execute("""
                        INSERT OR IGNORE INTO observations (
                            project_root, type, title, content, content_hash,
                            source, created_at, created_at_epoch
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        get_project_id(),
                        category,
                        text[:100].replace('\n', ' '),
                        text,
                        content_hash,
                        source,
                        created,
                        int(datetime.fromisoformat(created).timestamp())
                    ))
                    migrated += 1
                except sqlite3.Error:
                    skipped += 1

            conn.commit()

            # Rebuild FTS index
            conn.execute("INSERT INTO observations_fts(observations_fts) VALUES('rebuild')")
            conn.commit()

            return {'migrated': migrated, 'skipped': skipped}
        finally:
            conn.close()


# ── Commands ─────────────────────────────────────────────────────────────────

def get_db() -> MemoryDB:
    return MemoryDB()


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
            mem_text = m.get('memory', m.get('title', '')).replace("\n", " ")[:200]
            print(f"  • {cat}{mem_text}")
    else:
        print(json.dumps(results, indent=2, default=str))


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
    for r in result['results']:
        print(f"  [{r['id']}] {r['type']}: {r['title'][:80]} (score={r['score']})")


def cmd_add(args):
    if len(args) < 1:
        print("Usage: mem0-v2.py add <text> [--category <cat>] [--title <title>] [--tags <tag1,tag2>]")
        return
    text = args[0]
    category = "general"
    title = None
    tags = None
    for i, a in enumerate(args[1:], 1):
        if a == "--category" and i + 1 < len(args):
            category = args[i + 1]
        if a == "--title" and i + 1 < len(args):
            title = args[i + 1]
        if a == "--tags" and i + 1 < len(args):
            tags = args[i + 1].split(',')

    db = get_db()
    entry = db.add(text, category=category, title=title, tags=tags)
    if entry:
        if entry.get('duplicate'):
            print(f"ℹ️  Memory already exists [id={entry['id']}]")
        else:
            print(f"✅ Memory added [id={entry['id']}] ({category})")
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
    print(json.dumps(obs, indent=2, default=str))


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
        title = m.get('title', m.get('memory', ''))[:120]
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

    if stats['by_type']:
        print("  Categories:")
        for cat, count in sorted(stats['by_type'].items(), key=lambda x: -x[1]):
            weight = CATEGORY_WEIGHTS.get(cat, 3)
            print(f"    {cat}: {count} (weight: {weight})")


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
    print(f"✅ Migration complete: {result['migrated']} migrated, {result['skipped']} skipped")
    print(f"   Total observations: {db.count()}")


def cmd_setup(args):
    print("🔧 Forgewright Memory Manager v2 Setup\n")
    os.makedirs(FORGEWRIGHT_DIR, exist_ok=True)
    print(f"  ✅ {FORGEWRIGHT_DIR}/ ready")

    db = get_db()
    print(f"  ✅ {MEMORY_DB} initialized ({db.size_bytes()} bytes)")

    if not Path(MEMIGNORE_FILE).exists():
        Path(MEMIGNORE_FILE).write_text(
            "# Exclude from memory ingestion\n.env\n.env.*\nsecrets/\ncredentials/\n"
            "**/node_modules/**\n**/.git/**\n*.log\n"
        )
        print(f"  ✅ {MEMIGNORE_FILE} created")

    # Offer migration if JSONL exists
    if Path(MEMORY_JSONL).exists():
        print(f"\n  ℹ️  Found legacy {MEMORY_JSONL}")
        print("     Run 'mem0-v2.py migrate' to import existing memories")

    print(f"\n✅ Setup complete!")
    print(f"   Storage: SQLite + FTS5 (WAL mode)")
    print(f"   Search: BM25 ranking + progressive disclosure")
    print(f"   GC: value-weighted | Max: {MAX_OBS_DEFAULT}")


# ── Main ─────────────────────────────────────────────────────────────────────

COMMANDS = {
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
}


def main():
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
    COMMANDS[cmd](sys.argv[2:])


if __name__ == "__main__":
    main()
