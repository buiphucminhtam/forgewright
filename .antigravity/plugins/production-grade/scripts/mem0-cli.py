#!/usr/bin/env python3
"""
Forgewright Memory Manager CLI — persistent project memory, git-versioned.

Storage:
  .forgewright/memory.jsonl  — source of truth, committed to git (compact, human-readable)

Usage:
    python3 mem0-cli.py search <query> [--limit N] [--format compact|full]
    python3 mem0-cli.py add <text> [--category <cat>]
    python3 mem0-cli.py ingest <file1> [file2 ...] [--chunk-size N]
    python3 mem0-cli.py ingest-git [--days N]
    python3 mem0-cli.py summarize <file>
    python3 mem0-cli.py refresh
    python3 mem0-cli.py list [--category <cat>] [--limit N]
    python3 mem0-cli.py delete <memory_id>
    python3 mem0-cli.py export [--format md|json]
    python3 mem0-cli.py stats
    python3 mem0-cli.py gc [--max-memories N]
    python3 mem0-cli.py setup

Env vars:
    MEM0_PROJECT_ID      project namespace (default: auto from git)
    MEM0_MAX_TOKENS      max tokens per retrieval (default: 500)
    MEM0_MAX_MEMORIES    max memories before GC (default: 200)
    MEM0_REDACT_SECRETS  true|false (default: true)
    MEM0_DISABLED        true to skip all ops
"""

import os
import re
import sys
import json
import math
import hashlib
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from collections import Counter

# ── Constants ──
FORGEWRIGHT_DIR = ".forgewright"
MEMORY_LOG = os.path.join(FORGEWRIGHT_DIR, "memory.jsonl")
MEMIGNORE_FILE = ".memignore"
MAX_MEMORIES_DEFAULT = 200

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

# Category weights for value-weighted GC (higher = more valuable to keep)
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


# ── Helpers ──

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

def make_id(text):
    """Generate short deterministic ID from content."""
    return hashlib.sha256(text.encode()).hexdigest()[:12]

def tokenize(text):
    """Simple word tokenizer — lowercase, strip punctuation, split on whitespace."""
    text = re.sub(r"[^\w\s]", " ", text.lower())
    words = text.split()
    # Remove very short words and common stop words
    stop = {"the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
            "have", "has", "had", "do", "does", "did", "will", "would", "could",
            "should", "may", "might", "shall", "can", "need", "dare", "ought",
            "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
            "as", "into", "through", "during", "before", "after", "above", "below",
            "between", "out", "off", "over", "under", "again", "further", "then",
            "once", "here", "there", "when", "where", "why", "how", "all", "each",
            "every", "both", "few", "more", "most", "other", "some", "such", "no",
            "not", "only", "own", "same", "so", "than", "too", "very", "just",
            "because", "but", "and", "or", "if", "this", "that", "it", "its"}
    return [w for w in words if len(w) > 1 and w not in stop]


# ── TF-IDF Search Engine ──

class TFIDFSearch:
    """Lightweight TF-IDF search using Python stdlib only."""

    def __init__(self, documents):
        """Build TF-IDF index from list of (id, text) tuples."""
        self.doc_ids = []
        self.doc_tfs = []
        self.df = Counter()
        self.n_docs = len(documents)

        for doc_id, text in documents:
            self.doc_ids.append(doc_id)
            tokens = tokenize(text)
            tf = Counter(tokens)
            # Normalize TF
            max_freq = max(tf.values()) if tf else 1
            tf = {t: c / max_freq for t, c in tf.items()}
            self.doc_tfs.append(tf)
            # Update document frequency
            for term in set(tokens):
                self.df[term] += 1

    def search(self, query, limit=5):
        """Return top-N document IDs scored by TF-IDF cosine similarity."""
        if self.n_docs == 0:
            return []

        query_tokens = tokenize(query)
        if not query_tokens:
            return []

        # Compute query TF-IDF vector
        query_tf = Counter(query_tokens)
        max_qf = max(query_tf.values())
        query_vec = {}
        for term, freq in query_tf.items():
            tf = freq / max_qf
            idf = math.log((self.n_docs + 1) / (self.df.get(term, 0) + 1)) + 1
            query_vec[term] = tf * idf

        # Score each document
        scores = []
        for i, doc_tf in enumerate(self.doc_tfs):
            # Compute doc TF-IDF for query terms
            dot_product = 0
            doc_norm_sq = 0
            for term in query_vec:
                doc_tfidf = doc_tf.get(term, 0) * (math.log((self.n_docs + 1) / (self.df.get(term, 0) + 1)) + 1)
                dot_product += query_vec[term] * doc_tfidf
                doc_norm_sq += doc_tfidf ** 2

            # Cosine similarity
            query_norm = math.sqrt(sum(v ** 2 for v in query_vec.values()))
            doc_norm = math.sqrt(doc_norm_sq) if doc_norm_sq > 0 else 0
            if query_norm > 0 and doc_norm > 0:
                score = dot_product / (query_norm * doc_norm)
            else:
                score = 0

            # Boost: exact substring match
            if query.lower() in " ".join(tokenize(self.doc_ids[i])):
                score += 0.1

            if score > 0.01:
                scores.append((score, self.doc_ids[i]))

        scores.sort(key=lambda x: -x[0])
        return [doc_id for _, doc_id in scores[:limit]]


# ── Markdown-Aware Chunking ──

def chunk_markdown(text, max_chars=3000):
    """Split text on markdown headers first, then by size. Each chunk carries section context."""
    sections = []
    current_header = ""
    current_lines = []

    for line in text.split("\n"):
        if re.match(r"^#{1,3}\s+", line):
            # Save previous section
            if current_lines:
                content = "\n".join(current_lines)
                sections.append((current_header, content))
            current_header = line.strip()
            current_lines = []
        else:
            current_lines.append(line)

    # Last section
    if current_lines:
        content = "\n".join(current_lines)
        sections.append((current_header, content))

    # Now split oversized sections
    chunks = []
    for header, content in sections:
        if len(content) <= max_chars:
            prefix = f"[Section: {header}]\n" if header else ""
            text_chunk = prefix + content.strip()
            if text_chunk.strip():
                chunks.append(text_chunk)
        else:
            # Sub-split by paragraphs
            paragraphs = content.split("\n\n")
            current_chunk = f"[Section: {header}]\n" if header else ""
            for para in paragraphs:
                if len(current_chunk) + len(para) > max_chars and current_chunk.strip():
                    chunks.append(current_chunk.strip())
                    current_chunk = f"[Section: {header} cont.]\n"
                current_chunk += para + "\n\n"
            if current_chunk.strip():
                chunks.append(current_chunk.strip())

    return chunks if chunks else [text[:max_chars]]


# ── Structured Extraction ──

def extract_structured_facts(text, source_name=""):
    """Extract structured facts from text instead of storing raw dumps."""
    facts = []
    lines = text.split("\n")

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped or line_stripped.startswith("#"):
            continue

        # Extract key-value patterns (e.g., "Language: TypeScript")
        kv_match = re.match(r"^[\-\*]?\s*\*?\*?([A-Za-z\s]+)\*?\*?\s*[:—–]\s*(.+)", line_stripped)
        if kv_match:
            key = kv_match.group(1).strip()
            val = kv_match.group(2).strip()
            if len(val) > 10 and len(val) < 500:
                facts.append(f"{key}: {val}")
            continue

        # Extract decision patterns
        if re.search(r"(?i)(decided|chose|selected|using|switched to|migrated to)", line_stripped):
            if 20 < len(line_stripped) < 500:
                facts.append(f"Decision: {line_stripped}")
            continue

        # Extract blocker patterns
        if re.search(r"(?i)(blocked|waiting|stuck|issue|problem|bug|error|fail)", line_stripped):
            if 20 < len(line_stripped) < 500:
                facts.append(f"Blocker: {line_stripped}")
            continue

        # Extract architecture patterns
        if re.search(r"(?i)(architecture|stack|framework|database|api|service|endpoint)", line_stripped):
            if 20 < len(line_stripped) < 500:
                facts.append(f"Architecture: {line_stripped}")

    return facts


# ── JSONL Memory Store ──

class MemoryStore:
    """
    File-based memory store using JSONL format.
    Each line: {"id": "...", "memory": "...", "category": "...", "created": "...", "source": "..."}
    """

    def __init__(self, path=MEMORY_LOG):
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)

    def _load(self):
        if not Path(self.path).exists():
            return []
        entries = []
        for line in Path(self.path).read_text().splitlines():
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        return entries

    def _save(self, entries):
        with open(self.path, "w") as f:
            for e in entries:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")

    def add(self, text, category="general", source="manual"):
        text = redact_secrets(text)
        mid = make_id(text + datetime.now().isoformat())
        entry = {
            "id": mid,
            "memory": text,
            "category": category,
            "source": source,
            "created": datetime.now().isoformat(timespec="seconds"),
        }
        entries = self._load()

        # Dedup: skip if normalized text already exists
        new_normalized = re.sub(r"\s+", " ", text.strip().lower())
        for e in entries:
            existing_normalized = re.sub(r"\s+", " ", e["memory"].strip().lower())
            if existing_normalized == new_normalized:
                return e  # already exists

        entries.append(entry)
        self._save(entries)
        return entry

    def search(self, query, limit=5):
        """TF-IDF based search with cosine similarity scoring."""
        entries = self._load()
        if not entries:
            return []

        # Build TF-IDF index
        documents = [(e["id"], e.get("memory", "")) for e in entries]
        engine = TFIDFSearch(documents)
        result_ids = engine.search(query, limit=limit)

        # Return entries in scored order
        id_to_entry = {e["id"]: e for e in entries}
        return [id_to_entry[rid] for rid in result_ids if rid in id_to_entry]

    def get_all(self, category=None):
        entries = self._load()
        if category:
            entries = [e for e in entries if e.get("category", "").lower() == category.lower()]
        return entries

    def delete(self, memory_id):
        entries = self._load()
        entries = [e for e in entries if e["id"] != memory_id]
        self._save(entries)

    def delete_by_source_prefix(self, prefix):
        """Delete all entries whose source starts with prefix."""
        entries = self._load()
        before = len(entries)
        entries = [e for e in entries if not e.get("source", "").startswith(prefix)]
        self._save(entries)
        return before - len(entries)

    def delete_by_category(self, category):
        """Delete all entries with given category."""
        entries = self._load()
        before = len(entries)
        entries = [e for e in entries if e.get("category", "") != category]
        self._save(entries)
        return before - len(entries)

    def gc(self, max_memories=None):
        """Value-weighted garbage collection: prune lowest-value entries."""
        max_m = max_memories or int(os.environ.get("MEM0_MAX_MEMORIES", MAX_MEMORIES_DEFAULT))
        entries = self._load()
        if len(entries) <= max_m:
            return 0

        # Keep pinned, score the rest
        pinned = [e for e in entries if e.get("pinned")]
        unpinned = [e for e in entries if not e.get("pinned")]

        # Score each entry: category_weight × recency_factor
        now = datetime.now()
        scored = []
        for e in unpinned:
            cat = e.get("category", "general")
            weight = CATEGORY_WEIGHTS.get(cat, 3)

            # Recency: entries from today=1.0, 30 days ago=0.3, 90+ days ago=0.1
            try:
                created = datetime.fromisoformat(e.get("created", now.isoformat()))
                age_days = (now - created).days
            except Exception:
                age_days = 30
            recency = max(0.1, 1.0 - (age_days / 100))

            score = weight * recency
            scored.append((score, e))

        # Sort by score descending, keep top entries
        scored.sort(key=lambda x: -x[0])
        keep = max_m - len(pinned)
        removed = len(scored) - keep
        if removed > 0:
            kept = [e for _, e in scored[:keep]]
            self._save(pinned + kept)
        return max(0, removed)

    def count(self):
        return len(self._load())

    def size_bytes(self):
        p = Path(self.path)
        return p.stat().st_size if p.exists() else 0


# ── Commands ──

def get_store():
    return MemoryStore()


def cmd_search(args):
    if len(args) < 1:
        print("Usage: mem0-cli.py search <query> [--limit N] [--format compact|full]")
        return
    query = args[0]
    limit = 5
    fmt = "compact"
    for i, a in enumerate(args[1:], 1):
        if a == "--limit" and i + 1 < len(args): limit = int(args[i + 1])
        if a == "--format" and i + 1 < len(args): fmt = args[i + 1]

    store = get_store()
    results = store.search(query, limit=limit)
    if not results:
        print("No memories found.")
        return
    if fmt == "compact":
        for m in results:
            cat = f"[{m.get('category', '')}] " if m.get("category") else ""
            mem_text = m["memory"].replace("\n", " ")[:200]
            print(f"  • {cat}{mem_text}")
    else:
        print(json.dumps(results, indent=2, default=str))


def cmd_add(args):
    if len(args) < 1:
        print("Usage: mem0-cli.py add <text> [--category <cat>]")
        return
    text = args[0]
    category = "general"
    for i, a in enumerate(args[1:], 1):
        if a == "--category" and i + 1 < len(args): category = args[i + 1]
    store = get_store()
    entry = store.add(text, category=category)
    print(f"✅ Memory added [{entry['id']}] ({category})")


def cmd_ingest(args):
    if len(args) < 1:
        print("Usage: mem0-cli.py ingest <file1> [file2 ...]")
        return
    chunk_size = 3000
    files = []
    i = 0
    while i < len(args):
        if args[i] == "--chunk-size" and i + 1 < len(args):
            chunk_size = int(args[i + 1]); i += 2
        else:
            files.append(args[i]); i += 1

    ignore_patterns = load_memignore()
    store = get_store()
    total = 0

    for filepath in files:
        path = Path(filepath)
        if not path.exists():
            print(f"  ⚠️ {filepath} not found"); continue
        if should_ignore(filepath, ignore_patterns):
            print(f"  ⏭️ {filepath} ignored (.memignore)"); continue

        content = path.read_text(errors="replace")
        content = redact_secrets(content)

        # Use markdown-aware chunking for .md files, plain for others
        if path.suffix.lower() in (".md", ".markdown"):
            chunks = chunk_markdown(content, chunk_size)
        else:
            chunks = _chunk_plain(content, chunk_size)

        for j, chunk in enumerate(chunks):
            src = f"{path.name}" + (f" §{j+1}/{len(chunks)}" if len(chunks) > 1 else "")
            store.add(chunk, category="ingested", source=src)
            total += 1

        print(f"  📄 {filepath}: {len(chunks)} chunk(s)")

    print(f"\n✅ Ingested {total} chunk(s) from {len(files)} file(s)")


def _chunk_plain(text, max_chars=3000):
    """Fallback chunker for non-markdown files."""
    lines = text.split("\n")
    chunks, current, current_len = [], [], 0
    for line in lines:
        if current_len + len(line) > max_chars and current:
            chunks.append("\n".join(current))
            current, current_len = [line], len(line)
        else:
            current.append(line)
            current_len += len(line)
    if current:
        chunks.append("\n".join(current))
    return chunks


def cmd_ingest_git(args):
    days = 7
    for i, a in enumerate(args):
        if a == "--days" and i + 1 < len(args): days = int(args[i + 1])

    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    try:
        log = subprocess.check_output(
            ["git", "log", f"--since={since}", "--pretty=format:%h %s", "--no-merges"],
            text=True, stderr=subprocess.DEVNULL
        ).strip()
    except subprocess.CalledProcessError:
        print("❌ Not a git repo"); return

    if not log:
        print(f"No commits in last {days} days."); return

    commits = log.split("\n")
    store = get_store()

    # Remove old git-activity entries and replace
    store.delete_by_category("git-activity")

    summary = f"{len(commits)} commits (last {days}d):\n" + "\n".join(f"  {c}" for c in commits[:30])
    if len(commits) > 30:
        summary += f"\n  ... +{len(commits) - 30} more"
    store.add(summary, category="git-activity", source="git-log")
    print(f"✅ Ingested {len(commits)} commits (replaced old git activity)")


def cmd_summarize(args):
    """Extract structured facts from a file instead of storing raw text."""
    if len(args) < 1:
        print("Usage: mem0-cli.py summarize <file>"); return
    path = Path(args[0])
    if not path.exists():
        print(f"❌ {args[0]} not found"); return

    content = redact_secrets(path.read_text(errors="replace"))

    # Extract structured facts
    facts = extract_structured_facts(content, path.name)
    store = get_store()

    if facts:
        # Store each fact as a compact memory
        for fact in facts[:20]:  # Cap at 20 facts per file
            store.add(fact, category="conversation", source=f"summarize:{path.name}")
        print(f"✅ Extracted {min(len(facts), 20)} facts from {path.name}")
    else:
        # Fallback: markdown-aware chunking
        chunks = chunk_markdown(content, 2000)
        for chunk in chunks[:5]:  # Cap at 5 chunks
            store.add(chunk, category="conversation", source=f"summarize:{path.name}")
        print(f"✅ Summarized {path.name}: {min(len(chunks), 5)} chunk(s) (no structured facts found)")


def cmd_refresh(args):
    """Re-ingest project state — replaces old ingested data with current reality."""
    store = get_store()

    # Remove all old ingested entries
    removed = store.delete_by_source_prefix("README.md")
    removed += store.delete_by_source_prefix("AGENTS.md")
    removed += store.delete_by_source_prefix("refresh:")
    removed += store.delete_by_category("ingested")
    if removed:
        print(f"  🗑️ Removed {removed} old ingested entries")

    # Remove stale project/architecture entries from old manual ingestion
    old_entries = store.get_all()
    stale_ids = []
    for e in old_entries:
        if e.get("source") == "manual" and e.get("category") in ("project", "architecture", "tasks"):
            # Check if it references old counts
            mem = e.get("memory", "")
            if any(old in mem for old in ["17+", "18 ", "46 ", "13 modes", "18 modes"]):
                stale_ids.append(e["id"])
    for sid in stale_ids:
        store.delete(sid)
    if stale_ids:
        print(f"  🗑️ Removed {len(stale_ids)} stale entries")

    # Read VERSION
    version = "unknown"
    if Path("VERSION").exists():
        version = Path("VERSION").read_text().strip()

    # Read key facts from AGENTS.md
    agents_facts = []
    if Path("AGENTS.md").exists():
        content = Path("AGENTS.md").read_text()
        # Extract skill count
        skill_match = re.search(r"(\d+)\s*(AI\s+)?skills?", content)
        mode_match = re.search(r"(\d+)\s*modes?", content)
        if skill_match:
            agents_facts.append(f"Total skills: {skill_match.group(1)}")
        if mode_match:
            agents_facts.append(f"Total modes: {mode_match.group(1)}")

    # Read key facts from README.md
    readme_facts = []
    if Path("README.md").exists():
        content = Path("README.md").read_text()
        # Extract pipeline description
        pipe_match = re.search(r"DEFINE\s*→\s*BUILD\s*→\s*HARDEN\s*→\s*SHIP\s*→\s*SUSTAIN", content)
        if pipe_match:
            readme_facts.append("Pipeline: DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → GROW")

    # Store refreshed project identity
    store.add(
        f"Project: Forgewright v{version} — Production-grade AI pipeline orchestrator",
        category="project", source="refresh:identity"
    )
    store.add(
        f"Architecture: skills/ directory with SKILL.md per skill, orchestrator at production-grade, "
        f"phases at production-grade/phases/. {', '.join(agents_facts)}",
        category="architecture", source="refresh:architecture"
    )
    store.add(
        "Pipeline: DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → GROW. "
        "3 approval gates. 4 engagement modes: Express, Standard, Thorough, Meticulous",
        category="architecture", source="refresh:pipeline"
    )
    store.add(
        "Storage: memory.jsonl (JSONL, git-committed). Search: TF-IDF with cosine similarity. "
        "GC: value-weighted by category × recency",
        category="architecture", source="refresh:memory"
    )

    # Ingest README in structured chunks (not raw dump)
    if Path("README.md").exists():
        content = Path("README.md").read_text()
        chunks = chunk_markdown(content, 2000)
        for j, chunk in enumerate(chunks[:8]):  # Cap at 8 most important chunks
            store.add(chunk, category="ingested", source=f"refresh:README §{j+1}")
        print(f"  📄 README.md: {min(len(chunks), 8)} structured chunks")

    # Ingest git activity
    try:
        log = subprocess.check_output(
            ["git", "log", "--since=30 days ago", "--pretty=format:%h %s", "--no-merges", "-20"],
            text=True, stderr=subprocess.DEVNULL
        ).strip()
        if log:
            store.delete_by_category("git-activity")
            store.add(log, category="git-activity", source="refresh:git")
            print(f"  📋 Git: recent commits ingested")
    except Exception:
        pass

    print(f"\n✅ Memory refreshed for Forgewright v{version}")
    print(f"   Total memories: {store.count()} | Size: {store.size_bytes():,} bytes")


def cmd_list(args):
    limit = 20
    category = None
    for i, a in enumerate(args):
        if a == "--limit" and i + 1 < len(args): limit = int(args[i + 1])
        if a == "--category" and i + 1 < len(args): category = args[i + 1]

    store = get_store()
    entries = store.get_all(category=category)
    if not entries:
        print("No memories stored."); return

    for i, m in enumerate(entries[:limit]):
        cat = f"[{m.get('category', '')}]" if m.get("category") else ""
        mem_text = m["memory"].replace("\n", " ")[:120]
        print(f"  [{m['id']}] {cat} {mem_text}")
    if len(entries) > limit:
        print(f"  ... +{len(entries) - limit} more")
    print(f"\nTotal: {len(entries)}")


def cmd_delete(args):
    if len(args) < 1:
        print("Usage: mem0-cli.py delete <memory_id>"); return
    get_store().delete(args[0])
    print(f"✅ Deleted {args[0]}")


def cmd_export(args):
    fmt = "md"
    for i, a in enumerate(args):
        if a == "--format" and i + 1 < len(args): fmt = args[i + 1]

    store = get_store()
    pid = get_project_id()
    entries = store.get_all()

    if fmt == "json":
        print(json.dumps(entries, indent=2, default=str))
    else:
        print(f"# Project Memory: {pid}")
        print(f"_Exported: {datetime.now().isoformat(timespec='seconds')}_\n")
        cats = {}
        for m in entries:
            cat = m.get("category", "general")
            cats.setdefault(cat, []).append(m)
        for cat, mems in sorted(cats.items()):
            print(f"\n## {cat.title()}")
            for m in mems:
                mem_text = m["memory"].replace("\n", " ")[:200]
                print(f"- **[{m['id']}]** {mem_text}")
        print(f"\n---\nTotal: {len(entries)} memories | {store.size_bytes():,} bytes")


def cmd_stats(args):
    store = get_store()
    pid = get_project_id()
    entries = store.get_all()
    total_chars = sum(len(m.get("memory", "")) for m in entries)

    print(f"📊 Memory Stats for '{pid}'")
    print(f"  Memories: {len(entries)}")
    print(f"  File size: {store.size_bytes():,} bytes")
    print(f"  Approx tokens: {total_chars // 4:,}")
    print(f"  Max before GC: {os.environ.get('MEM0_MAX_MEMORIES', MAX_MEMORIES_DEFAULT)}")

    cats = {}
    for m in entries:
        cat = m.get("category", "general")
        cats[cat] = cats.get(cat, 0) + 1
    if cats:
        print("  Categories:")
        for cat, count in sorted(cats.items(), key=lambda x: -x[1]):
            weight = CATEGORY_WEIGHTS.get(cat, 3)
            print(f"    {cat}: {count} (weight: {weight})")


def cmd_gc(args):
    max_m = None
    for i, a in enumerate(args):
        if a == "--max-memories" and i + 1 < len(args): max_m = int(args[i + 1])
    store = get_store()
    removed = store.gc(max_memories=max_m)
    print(f"✅ GC complete: removed {removed} old memories (kept {store.count()})")


def cmd_setup(args):
    print("🔧 Forgewright Memory Manager Setup\n")
    os.makedirs(FORGEWRIGHT_DIR, exist_ok=True)
    print(f"  ✅ {FORGEWRIGHT_DIR}/ ready")

    if not Path(MEMIGNORE_FILE).exists():
        Path(MEMIGNORE_FILE).write_text(
            "# Exclude from memory ingestion\n.env\n.env.*\nsecrets/\ncredentials/\n"
            "**/node_modules/**\n**/.git/**\n*.log\n"
        )
        print(f"  ✅ {MEMIGNORE_FILE} created")

    if not Path(MEMORY_LOG).exists():
        Path(MEMORY_LOG).touch()
        print(f"  ✅ {MEMORY_LOG} initialized")

    print(f"\n✅ Setup complete! Run 'mem0-cli.py refresh' to ingest project state.")
    print(f"   Search: TF-IDF (cosine similarity) | GC: value-weighted | Max: {MAX_MEMORIES_DEFAULT}")


# ── Main ──

COMMANDS = {
    "search": cmd_search, "add": cmd_add, "ingest": cmd_ingest,
    "ingest-git": cmd_ingest_git, "summarize": cmd_summarize,
    "refresh": cmd_refresh,
    "list": cmd_list, "delete": cmd_delete, "export": cmd_export,
    "stats": cmd_stats, "gc": cmd_gc, "setup": cmd_setup,
}

def main():
    if is_disabled(): return
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__); print("Commands:", ", ".join(COMMANDS.keys())); return
    cmd = sys.argv[1]
    if cmd not in COMMANDS:
        print(f"Unknown: {cmd}\nAvailable: {', '.join(COMMANDS.keys())}"); sys.exit(1)
    COMMANDS[cmd](sys.argv[2:])

if __name__ == "__main__":
    main()
