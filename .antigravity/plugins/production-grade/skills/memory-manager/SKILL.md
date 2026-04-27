---
name: memory-manager
description: >
  Persistent project memory using SQLite + FTS5 + BM25.
  Fast, zero dependencies (stdlib only), production-ready.
  Progressive disclosure with 3 layers (compact/index/detailed).
---

# Memory Manager Skill

> **Purpose:** Give the AI agent persistent, searchable project memory — store decisions,
> blockers, session summaries, and query them semantically across sessions.

## Architecture

| Component | Technology | Notes |
|-----------|------------|-------|
| **Database** | SQLite + FTS5 | WAL mode, crash-safe, concurrent reads |
| **Search** | BM25 ranking | FTS5 full-text search |
| **Token Optimization** | 3-layer progressive disclosure | 15/60/200 tokens per result |

> **Zero dependencies.** Only stdlib + SQLite (built into Python). No API key needed.

### Progressive Disclosure Layers

| Layer | Command | Tokens/Result | When Used |
|-------|---------|---------------|-----------|
| **L1: Compact Index** | `index <query>` | ~15 | Always first — quick overview |
| **L2: FTS Search** | `search <query>` | ~60 | Top matches get details |
| **L3: Full Detail** | `get <id>` | ~200 | On-demand for specific items |

### Token Savings vs Old Systems

- Search: **800 → 200 tokens** (75% reduction)
- Index: ~15 tokens/result (new capability)
- Timeline: ~60 tokens/result (new capability)

## When to Use

- **Session start** — auto-retrieve project context instead of re-reading entire codebase
- **Before answering** — query memory with task keywords for relevant decisions/blockers
- **After completing work** — store what was done, decisions made, blockers found
- **Periodic** — refresh project identity when major changes happen

## Memory Model

Category weights for search relevance and GC prioritization:

| Category | Weight | Examples |
|----------|--------|----------|
| **decisions** | 10 | "Chose PostgreSQL because..." |
| **architecture** | 8 | "Using Next.js + Prisma" |
| **blockers** | 7 | "Waiting on API key" |
| **session** | 6 | "Session completed: built auth" |
| **tasks** | 5 | "BUILD complete: 142 tests pass" |
| **conversation** | 4 | Auto-generated summaries |
| **general** | 4 | User-added notes |
| **git-activity** | 3 | Recent commits |
| **ingested** | 2 | Project file summaries |

## CLI Commands

Primary CLI: `scripts/mem0-v2.py`

```bash
# Setup (first time)
python3 scripts/mem0-v2.py setup

# Add a memory
python3 scripts/mem0-v2.py add "Decided to use JWT + refresh tokens for auth" --category decisions

# Search with BM25 ranking
python3 scripts/mem0-v2.py search "authentication flow" --limit 5

# Layer 1: Compact index (always first)
python3 scripts/mem0-v2.py index "project" --limit 30

# Layer 3: Full detail on demand
python3 scripts/mem0-v2.py get 123

# List all (with optional category filter)
python3 scripts/mem0-v2.py list --category decisions --limit 20

# Stats - memory statistics
python3 scripts/mem0-v2.py stats

# Garbage collection (value-weighted)
python3 scripts/mem0-v2.py gc --max-obs 200

# Migrate from old systems
python3 scripts/mem0-v2.py migrate  # JSONL → SQLite
python3 scripts/migrate-chroma-to-sqlite.py  # ChromaDB → SQLite
```

## Python API

```python
import sys
sys.path.insert(0, 'scripts')
from mem0_v2 import MemoryDB, get_db

# Initialize
db = get_db()

# Add memory
result = db.add("Decided to use JWT for auth", category="decisions")

# Search (backward compatible)
results = db.search("authentication", limit=5)

# Layer 1: Compact index
index = db.memory_index("project", limit=30)

# Layer 3: Full detail
obs = db.memory_get(123)

# List by category
memories = db.list_all(category="decisions", limit=10)

# Stats
stats = db.stats()

# GC
removed = db.gc(max_obs=200)
```

## Token Optimization Strategy

### When to Retrieve

1. **Always** at session start — search with project name + request keywords, limit to top-5
2. **Before complex tasks** — search with task keywords, limit to top-3
3. **At gate decisions** — fetch relevant decisions/blockers

### Token Budget

- Retrieval output: max **500 tokens** (configurable)
- Total memory injection per prompt: **800 tokens** ceiling
- Use Layer 1 (index) first for overview, upgrade to Layer 2/3 as needed

## Safety

### Secret Redaction

The CLI automatically redacts patterns matching:
- API keys (`sk-*`, `key-*`, Bearer tokens)
- Passwords, secrets, tokens (configurable regex)
- Database connection strings with credentials

### .memignore

Create `.memignore` at project root to exclude files/folders from ingestion.

### Opt-out

```bash
# Set env var to disable all memory operations
export MEM0_DISABLED=true
```

## Configuration

```bash
# Project namespace (auto-detected from git)
MEM0_PROJECT_ID=my-project

# Limits
MEM0_MAX_TOKENS=500               # max tokens per retrieval
MEM0_MAX_OBS=200                  # max observations before GC

# Safety
MEM0_REDACT_SECRETS=true          # auto-redact API keys, passwords
MEM0_DISABLED=false                # set true to skip all ops
```

## Integration with Forgewright Pipeline

### Active Lifecycle Hooks

The orchestrator calls memory-manager at specific lifecycle points:

| Hook | Trigger | Memory Command |
|------|---------|---------------|
| `SESSION_START` | Pipeline begins | `search "<project> <keywords>" --limit 5` |
| `TURN_CLOSE` | After every user request | `add "REQ:... | DONE:... | OPEN:..." --category session` |
| `PHASE_COMPLETE` | After DEFINE/BUILD/HARDEN/SHIP | `add "Phase [name]: [summary]" --category tasks` |
| `GATE_DECISION` | After Gate 1/2/3 | `add "Gate [N] [decision]: [feedback]" --category decisions` |
| `SESSION_END` | Pipeline completes | `add "Session completed: [summary]" --category session` |
| `ERROR` | Task failure | `add "BLOCKER: [task] failed: [details]" --category blockers` |

### Context Integration with Project Profile

Memory works alongside `.forgewright/project-profile.json`:
- **Project Profile** = structural facts (stack, health, patterns) — always loaded
- **Memory** = semantic facts (decisions, blockers, progress) — searched with FTS5
- Together they provide full project context without re-scanning

### BA Integration

When the Business Analyst skill completes:
- BA outputs (`ba-package.md`, requirements register) are referenced by memory
- PM reads BA package directly — memory stores the decision "BA validated requirements"
- Gate 1 stores BRD approval decision for future sessions

### Manual Usage

Any skill can invoke memory commands directly:
```bash
# Before starting work
python3 scripts/mem0-v2.py search "current task" --limit 3

# After completing work
python3 scripts/mem0-v2.py add "Completed: auth module with JWT + refresh tokens" --category decisions
```

## File Layout

```
forgewright/
├── skills/memory-manager/
│   └── SKILL.md              ← this file
├── scripts/
│   ├── mem0-v2.py            ← PRIMARY CLI (SQLite + FTS5)
│   ├── mem0-cli.py           ← DEPRECATED (TF-IDF + JSONL)
│   ├── local_memory.py       ← DEPRECATED (ChromaDB + embeddings)
│   ├── migrate-chroma-to-sqlite.py  ← Migration helper
│   └── ...
└── .forgewright/
    ├── memory.db             ← PRIMARY storage (SQLite + FTS5)
    ├── memory.db-wal         ← WAL journal
    ├── memory.db-shm         ← Shared memory
    ├── memory.jsonl          ← Legacy storage (read-only, migrate then delete)
    ├── memory_db/            ← DEPRECATED ChromaDB storage
    └── project-profile.json  ← project fingerprint (committed)
```

## Dependencies

**Zero external dependencies.** Only Python stdlib + SQLite (built-in).

| Package | Purpose | Install |
|---------|---------|---------|
| None | Everything is built-in | — |

## Migration

### From JSONL (mem0-cli.py)

```bash
python3 scripts/mem0-v2.py migrate
```

### From ChromaDB (local_memory.py)

```bash
python3 scripts/migrate-chroma-to-sqlite.py
```

### Verify Migration

```bash
python3 scripts/mem0-v2.py stats
```

## Deprecated Systems

### mem0-cli.py (JSONL + TF-IDF)

- **Status:** DEPRECATED
- **Reason:** No indexing, unbounded file growth, O(n) search
- **Action:** Migrate data then disable

```bash
# Migrate first, then disable
export MEM0_DISABLED=true
```

### local_memory.py (ChromaDB + embeddings)

- **Status:** DEPRECATED
- **Reason:** Heavy dependencies (~500MB), slow startup (model loading)
- **Action:** Migrate data then disable

```bash
# Migrate first, then disable
export LOCAL_MEMORY_DISABLED=true
```

## RRF Fusion (Future)

The system supports Reciprocal Rank Fusion for hybrid search combining:
- FTS5 + BM25 results
- (Future) Vector search results

```python
# Example: Merge rankings from multiple sources
results = db.rrf_merge(list1, list2, list3)
```

## Observation Links (Advanced)

Link related observations:

```sql
-- Related concepts
-- Contradicting decisions
-- Superseded approaches
-- Extended implementations
```

## Session Tracking (Advanced)

Track sessions across the memory system:

```python
# Sessions table for cross-session tracking
# - request_summary
# - completed_tasks
# - next_steps
# - notes
```
