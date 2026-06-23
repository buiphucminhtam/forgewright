---
name: memory-manager
description: >
  Persistent project memory using SQLite + FTS5 + BM25.
  Fast, zero dependencies (stdlib only), production-ready.
  Progressive disclosure with 3 layers (compact/index/detailed).
version: 2.0.0
author: forgewright
tags: [memory, sqlite, fts5, persistence, knowledge-base, context]
---

# Memory Manager Skill

> **Identity:** The long-term memory for AI agents. Every decision, blocker, and lesson is preserved across sessions — so context isn't lost when models reset.

## Critical Rules

| Rule | Why It Matters |
|------|---------------|
| **Store AFTER each task** | If you don't save it, it's lost when context resets. Memory is only useful if it's populated. |
| **Query BEFORE starting work** | Don't re-derive context. Query memory first — the answer may already exist. |
| **Redact secrets automatically** | Never store API keys, passwords, or tokens. Auto-redaction prevents credential leaks. |
| **Layer your retrieval** | L1 (compact) first for overview, L2 (search) for details, L3 (full) on-demand. |

---

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                     MEMORY SYSTEM ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────────┐     ┌───────────┐  │
│  │   CLI/API    │ ──▶ │   MemoryDB       │ ──▶ │  SQLite   │  │
│  │  (mem0-v2)  │     │   (Python)       │     │  + FTS5   │  │
│  └──────────────┘     └──────────────────┘     └───────────┘  │
│         │                      │                       │         │
│         │              ┌──────┴───────┐                │         │
│         │              │              │                │         │
│         ▼              ▼              ▼                ▼         │
│  ┌────────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐   │
│  │   add()    │  │  search() │  │   list()  │  │   gc()   │   │
│  │  store obs │  │  BM25 FTS │  │by category│  │ clean up │   │
│  └────────────┘  └───────────┘  └───────────┘  └──────────┘   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  TOKEN BUDGET OPTIMIZATION                 │  │
│  │                                                              │  │
│  │  L1 Index: ~15 tokens/result (overview)                    │  │
│  │  L2 Search: ~60 tokens/result (BM25 ranked)              │  │
│  │  L3 Full: ~200 tokens/result (complete detail)            │  │
│  │                                                              │  │
│  │  Max injection: 500 tokens (configurable)                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Why |
|-----------|------------|-----|
| **Database** | SQLite + FTS5 | WAL mode, crash-safe, concurrent reads, full-text search |
| **Search** | BM25 ranking (FTS5) | Production-grade relevance scoring |
| **Token Optimization** | 3-layer progressive disclosure | 75% token reduction vs naive approach |
| **Dependencies** | Zero (stdlib only) | No API key, no pip install, no external service |

---

## When to Use Memory

### Step 0.5 — Memory Retrieval (MANDATORY on every request)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 0.5 — MEMORY RETRIEVAL (MANDATORY)                          │
├─────────────────────────────────────────────────────────────────────┤
│  Run BEFORE interpreting the user's request:                       │
│                                                                      │
│  1. Extract keywords from the user's request (nouns, verbs)        │
│  2. Run: bash scripts/memory-retrieve.sh "<request>"              │
│     OR:  python3 scripts/mem0-v2.py search "<keywords>" --limit 3│
│  3. Also run: bash scripts/memory-suggest.sh "<request>"        │
│  3. If relevant memories found:                                    │
│     → Inject as MEMORY BLOCK at top of context                   │
│     → Note: "Found N relevant memories from previous sessions"     │
│  4. Also load:                                                    │
│     - .forgewright/subagent-context/CONVERSATION_SUMMARY.md        │
│     - .forgewright/memory-bank/activeContext.md                    │
│     - .forgewright/business-analyst/handoff/ba-package.md (if exists)│
│  5. Log: "✓ Memory retrieval done — N memories loaded"           │
│                                                                      │
│  Max tokens: 500 (configurable via MEM0_MAX_TOKENS)             │
└─────────────────────────────────────────────────────────────────────┘
```

**Evidence-first note:** Every assumption about project history should be verified against mem0 before acting. If mem0 has a memory about a previous decision, cite it. If it contradicts the assumption, update the assumption.

### Session Lifecycle Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| **SESSION_START** | Pipeline begins | Run Step 0.5 — search project context + request keywords |
| **TURN_CLOSE** | After every user request | Store request/done/open summary |
| **PHASE_COMPLETE** | After DEFINE/BUILD/HARDEN/SHIP | Store phase completion summary |
| **GATE_DECISION** | After Gate 1/2/3 | Store gate decision and feedback |
| **SESSION_END** | Pipeline completes | Store final session summary |
| **ERROR** | Task failure | Store blocker details |

### Query Patterns

| Situation | Query Approach |
|-----------|---------------|
| Start new session | `search "<project-name> recent"` |
| Before complex task | `search "<task-keywords>"` |
| Finding decisions | `list --category decisions --limit 10` |
| Checking blockers | `list --category blockers --limit 5` |
| Getting project context | `index "<project-name>" --limit 30` |
| Full detail on item | `get <id>` |

---

## Memory Model

### Category Weights

Categories affect search relevance and GC prioritization:

| Category | Weight | Examples | GC Priority |
|----------|--------|----------|-------------|
| **decisions** | 10 | "Chose PostgreSQL because...", "Architecture decision X" | Low (keep) |
| **architecture** | 8 | "Using Next.js + Prisma", "Service boundaries" | Low (keep) |
| **blockers** | 7 | "Waiting on API key", "Dependency conflict" | Medium |
| **session** | 6 | "Session completed: built auth", "Turn summary" | Medium |
| **tasks** | 5 | "BUILD complete: 142 tests pass" | Medium |
| **conversation** | 4 | Auto-generated conversation summaries | High |
| **general** | 4 | User-added notes | Medium |
| **git-activity** | 3 | Recent commits | High |
| **ingested** | 2 | Project file summaries | High |
| **reference** | 1 | Imported external docs | High (clean up) |

---

## CLI Commands

### Primary CLI: `scripts/mem0-v2.py`

```bash
# ═══════════════════════════════════════════════════════════════
# SETUP
# ═══════════════════════════════════════════════════════════════

# First-time setup (creates database schema)
python3 scripts/mem0-v2.py setup

# ═══════════════════════════════════════════════════════════════
# STORING MEMORIES
# ═══════════════════════════════════════════════════════════════

# Add a memory with category
python3 scripts/mem0-v2.py add "Decided to use JWT + refresh tokens for auth" --category decisions

# Add with tags
python3 scripts/mem0-v2.py add "Migration from REST to GraphQL planned for Q2" --category architecture --tags graphql,rest,migration

# Add with custom ID for linking
python3 scripts/mem0-v2.py add "User authentication via Auth0" --category decisions --id auth-system-001

# Batch add from file
python3 scripts/mem0-v2.py add --batch memories.txt

# ═══════════════════════════════════════════════════════════════
# RETRIEVING MEMORIES (3 LAYERS)
# ═══════════════════════════════════════════════════════════════

# LAYER 1: Compact index (always first)
# ~15 tokens/result — quick overview
python3 scripts/mem0-v2.py index "project context" --limit 30

# LAYER 2: Full-text search (BM25 ranked)
# ~60 tokens/result — detailed matches
python3 scripts/mem0-v2.py search "authentication flow" --limit 5

# LAYER 3: Full detail on demand
# ~200 tokens/result — complete observation
python3 scripts/mem0-v2.py get 123

# ═══════════════════════════════════════════════════════════════
# LISTING & FILTERING
# ═══════════════════════════════════════════════════════════════

# List all memories (paginated)
python3 scripts/mem0-v2.py list --limit 50

# List by category
python3 scripts/mem0-v2.py list --category decisions --limit 20

# List by tag
python3 scripts/mem0-v2.py list --tag authentication --limit 10

# List recent
python3 scripts/mem0-v2.py list --recent 10

# ═══════════════════════════════════════════════════════════════
# STATISTICS & MAINTENANCE
# ═══════════════════════════════════════════════════════════════

# Memory statistics
python3 scripts/mem0-v2.py stats

# Garbage collection (value-weighted)
python3 scripts/mem0-v2.py gc --max-obs 200

# Clean old sessions
python3 scripts/mem0-v2.py gc --category session --older-than 7d

# Export memories
python3 scripts/mem0-v2.py export --format json > memories.json

# ═══════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════

# Search with JSON output (for scripting)
python3 scripts/mem0-v2.py search "auth" --format json

# Get memory count by category
python3 scripts/mem0-v2.py stats --by-category

# Find related memories (by shared tags or context)
python3 scripts/mem0-v2.py related 123 --limit 5
```

### Context Offload Trace CLI: `scripts/memory-trace.py`

Use this when MCP context offload is enabled and a tool result has been stored under `.forgewright/offload/<session>/`.

```bash
# Inspect one tool event and preview its sanitized raw ref
python3 scripts/memory-trace.py trace-node <node_id> --session <session_id>

# List all offloaded events for a session
python3 scripts/memory-trace.py trace-session <session_id>

# Print the Mermaid canvas for a session
python3 scripts/memory-trace.py trace-canvas <session_id>
```

Drill-down workflow:

1. Open `.forgewright/offload/<session_id>/canvas.mmd` or run `trace-canvas`.
2. Pick the node ID from the Mermaid node label.
3. Run `trace-node <node_id> --session <session_id>`.
4. Inspect the referenced sanitized file under `refs/<node_id>.md` only when full detail is needed.

### Scenario and Persona Layers

Use `scripts/memory-consolidate.py` to promote repeated observations, completed sessions, and offload events into stable upper memory layers:

```bash
python3 scripts/memory-consolidate.py
```

Scenario files live at `.forgewright/memory-bank/scenarios/*.md` and use this schema:

```markdown
---
schema: forgewright-memory-scenario/v1
scenario_id: <stable-slug>
generated_at: <iso-8601>
sources:
  - mem0:<observation_id>
  - offload:<session_id>/<node_id>
---

# Scenario: <summary>

## Trigger
<request or situation that should recall this scenario>

## Context
- Session: <session_id>
- Mode: <pipeline mode>

## Successful Pattern
- <repeatable action or decision>

## Evidence
- mem0:<observation_id>
- offload:<session_id>/<node_id>
```

Persona memory lives at `.forgewright/memory-bank/persona.md` and uses this schema:

```markdown
---
schema: forgewright-memory-persona/v1
generated_at: <iso-8601>
sources:
  - mem0:<observation_id>
  - offload:<session_id>/<node_id>
---

# Persona Memory

## Stable Preferences
- <durable user/project preference> [mem0:<observation_id>]

## Project Defaults
- <stable project convention>

## Source References
- mem0:<observation_id>
- offload:<session_id>/<node_id>
```

`scripts/memory-retrieve.sh` loads persona/scenario layers before atom-level mem0 search. Tune caps with `MEM0_PERSONA_TOKENS`, `MEM0_SCENARIO_TOKENS`, `MEM0_SCENARIO_LIMIT`, and `MEM0_MAX_TOKENS`.

### Diagnostic Export

Use `scripts/export-memory-diagnostic.sh` to package a redacted local diagnostic archive:

```bash
bash scripts/export-memory-diagnostic.sh /tmp

# Include sanitized raw offload refs only when explicitly needed
bash scripts/export-memory-diagnostic.sh /tmp --include-raw
```

The default archive includes:

- `manifest.json`
- memory DB stats, not the raw SQLite DB
- persona/scenario files
- session and pipeline metadata
- offload `events.jsonl`, `state.json`, `canvas.mmd`, and session summary metadata
- MCP audit logs when present

Raw offload `refs/*.md` are excluded by default. With `--include-raw`, refs are included after redaction.

---

## Python API

### Quick Start

```python
import sys
sys.path.insert(0, 'scripts')
from mem0_v2 import MemoryDB, get_db

# Initialize (singleton pattern)
db = get_db()

# ═══════════════════════════════════════════════════════════════
# STORING
# ═══════════════════════════════════════════════════════════════

# Add a memory
result = db.add(
    "Decided to use JWT for auth with 15min access token + 7d refresh token",
    category="decisions"
)
print(f"Created memory with ID: {result['id']}")

# Add with tags
result = db.add(
    "GraphQL migration planned for Q2 2024",
    category="architecture",
    tags=["graphql", "rest", "migration"]
)

# Add with custom ID
result = db.add(
    "Auth system chosen: Auth0",
    category="decisions",
    custom_id="auth-system-001"
)

# ═══════════════════════════════════════════════════════════════
# RETRIEVING
# ═══════════════════════════════════════════════════════════════

# Layer 1: Compact index (~15 tokens/result)
index = db.memory_index("forgewright project", limit=30)
for item in index["results"]:
    print(f"ID: {item['id']}, Preview: {item['preview']}")

# Layer 2: Full-text search (~60 tokens/result)
results = db.search("authentication", limit=5)
for result in results["results"]:
    print(f"ID: {result['id']}, Score: {result['score']}, Text: {result['text']}")

# Layer 3: Full detail (~200 tokens/result)
detail = db.memory_get(123)
print(f"Full text: {detail['text']}")
print(f"Metadata: {detail['metadata']}")

# ═══════════════════════════════════════════════════════════════
# LISTING
# ═══════════════════════════════════════════════════════════════

# List all with pagination
memories = db.list_all(category="decisions", limit=10, offset=0)

# List by tag
memories = db.list_all(tag="authentication", limit=10)

# Recent memories
memories = db.list_all(recent=20)

# ═══════════════════════════════════════════════════════════════
# MAINTENANCE
# ═══════════════════════════════════════════════════════════════

# Statistics
stats = db.stats()
print(f"Total memories: {stats['total']}")
print(f"By category: {stats['by_category']}")
print(f"Storage size: {stats['size_mb']}MB")

# Garbage collection
removed = db.gc(max_obs=200)
print(f"Removed {removed['count']} memories")

# Clean by category and age
removed = db.gc(category="session", older_than_days=7)
print(f"Removed {removed['count']} old session memories")

# ═══════════════════════════════════════════════════════════════
# UPDATING & DELETING
# ═══════════════════════════════════════════════════════════════

# Update a memory
db.update(123, text="Updated: Now using RS256 instead of HS256")

# Delete a memory
db.delete(123)

# Delete by category
db.delete(category="reference")
```

---

## Token Optimization Strategy

### Progressive Disclosure Layers

| Layer | Method | Tokens/Result | Use Case |
|-------|--------|---------------|----------|
| **L1: Compact** | `index()` | ~15 | Always first — quick overview |
| **L2: Search** | `search()` | ~60 | Top matches get detail |
| **L3: Full** | `get()` | ~200 | On-demand for specific items |

### Token Budget Management

```python
# Maximum tokens per retrieval (configurable)
MAX_TOKENS = 500

# Retrieval strategy
def smart_retrieve(query: str, max_tokens: int = 500):
    # Step 1: Get compact index (~15 tokens/result)
    overview = db.memory_index(query, limit=30)

    # Step 2: If tokens allow, search for details (~60 tokens/result)
    tokens_used = len(overview["results"]) * 15
    remaining = max_tokens - tokens_used

    if remaining > 60:
        details_needed = remaining // 60
        results = db.search(query, limit=details_needed)
        return merge_results(overview, results)

    return overview

# Always cap at budget
def safe_retrieve(query: str, max_tokens: int = 500):
    results = []
    for layer in ['index', 'search', 'get']:
        if token_budget_exceeded(results, max_tokens):
            break
        layer_results = fetch_layer(layer, query)
        results.extend(layer_results)
    return results
```

### When to Retrieve

| Situation | Approach |
|-----------|----------|
| **Session start** | Search project name + keywords, limit top-5 |
| **Before complex task** | Search task keywords, limit top-3 |
| **At gate decisions** | Fetch relevant decisions/blockers by category |
| **After completing work** | Store summary + decisions |
| **On error** | Store blocker with context |

---

## Safety Features

### Automatic Secret Redaction

The CLI automatically redacts patterns matching:

| Pattern Type | Examples |
|--------------|----------|
| **API Keys** | `sk-*`, `key-*`, `api_key`, `apikey` |
| **Tokens** | `Bearer *`, `token=*`, `jwt.*` |
| **Passwords** | `password=*`, `passwd=*` |
| **Secrets** | `secret=*`, `private_key`, `-----BEGIN RSA PRIVATE KEY-----` |
| **Connection Strings** | `postgres://user:pass@host` |
| **AWS Keys** | `AKIA*`, `aws_secret` |

```python
# What gets redacted
input_text = "API key: sk-1234567890abcdef"
# Output: "API key: [REDACTED]"

# What stays
input_text = "User reported issue with login flow"
# Output: "User reported issue with login flow"
```

### .memignore File

Create `.memignore` at project root to exclude files from ingestion:

```
# Patterns to exclude from memory ingestion
.env
*.log
node_modules/
dist/
build/
.git/
secrets/
credentials.json
```

### Strict Compliance & Forced Enablement

Under the Forgewright Compliance Policy, memory is a **non-negotiable hard constraint** and cannot be disabled. 

If any attempt is made to bypass or disable memory (using `MEM0_DISABLED=true` or `FORGEWRIGHT_SKIP_MEM0=1`), the system will **automatically override the bypass flag to false**, log an enforcement warning, and force-enable the full memory mechanism.


---

## Configuration

### Environment Variables

```bash
# Project namespace (auto-detected from git)
MEM0_PROJECT_ID=my-project

# Token limits
MEM0_MAX_TOKENS=500               # max tokens per retrieval
MEM0_MAX_OBS=200                  # max observations before GC

# Safety
MEM0_REDACT_SECRETS=true          # auto-redact API keys, passwords
MEM0_DISABLED=false                # set true to skip all ops

# Database location
MEM0_DB_PATH=.forgewright/memory.db
```

### Project Config (`mem0.yaml`)

```yaml
# mem0.yaml
project: my-project
database:
  path: .forgewright/memory.db
  wal_mode: true

retrieval:
  max_tokens: 500
  layers:
    index:
      tokens_per_result: 15
      default_limit: 30
    search:
      tokens_per_result: 60
      default_limit: 5
    full:
      tokens_per_result: 200
      default_limit: 3

gc:
  max_observations: 200
  category_weights:
    decisions: 10
    architecture: 8
    blockers: 7
    session: 6
    tasks: 5
    conversation: 4
    general: 4
    git-activity: 3
    ingested: 2
    reference: 1

redaction:
  enabled: true
  patterns:
    - api_key
    - password
    - token
    - secret
    - private_key
```

---

## Integration with Forgewright Pipeline

### Active Lifecycle Integration

```python
# hooks/memory_hooks.py
class MemoryLifecycleHooks:
    """Hooks for automatic memory management"""

    def on_session_start(self, project: str, user_request: str):
        """Query relevant context before starting work"""
        db = get_db()
        context = db.search(f"{project} {user_request}", limit=5)
        return context

    def on_phase_complete(self, phase: str, summary: str):
        """Store phase completion"""
        db = get_db()
        db.add(
            f"Phase {phase} completed: {summary}",
            category="tasks",
            tags=[phase.lower()]
        )

    def on_gate_decision(self, gate: int, decision: str, feedback: str):
        """Store gate decisions"""
        db = get_db()
        db.add(
            f"Gate {gate} decision: {decision}. Feedback: {feedback}",
            category="decisions"
        )

    def on_error(self, task: str, error: str, context: dict):
        """Store blocker details"""
        db = get_db()
        db.add(
            f"BLOCKER: {task} failed: {error}",
            category="blockers",
            metadata=context
        )

    def on_session_end(self, summary: str, tasks_completed: list):
        """Store session summary"""
        db = get_db()
        db.add(
            f"Session completed: {summary}. Tasks: {', '.join(tasks_completed)}",
            category="session"
        )
```

### Session Tracking

```bash
# Check session health
python3 scripts/mem0-v2.py list --category session --recent 5

# Get session summary
python3 scripts/mem0-v2.py search "session" --limit 3
```

---

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
│   └── memory_session.sh     ← Shell helpers
└── .forgewright/
    ├── memory.db             ← PRIMARY storage (SQLite + FTS5)
    ├── memory.db-wal         ← WAL journal
    ├── memory.db-shm         ← Shared memory
    ├── memory.jsonl          ← Legacy storage (read-only, migrate then delete)
    ├── memory_db/            ← DEPRECATED ChromaDB storage
    └── project-profile.json  ← project fingerprint (committed)
```

---

## Migration

### From Old Systems

```bash
# Migrate from JSONL (mem0-cli.py)
python3 scripts/mem0-v2.py migrate

# Migrate from ChromaDB (local_memory.py)
python3 scripts/migrate-chroma-to-sqlite.py

# Verify migration
python3 scripts/mem0-v2.py stats
```

### Migration Verification

```bash
# Check old system disabled
grep -r "mem0-cli\|local_memory" .

# Check new system active
python3 scripts/mem0-v2.py stats

# Compare counts
echo "Old (JSONL):" && wc -l .forgewright/memory.jsonl
echo "New (SQLite):" && python3 scripts/mem0-v2.py list --format json | jq length
```

---

## Deprecated Systems

| System | Status | Migration |
|--------|--------|-----------|
| **mem0-cli.py** | DEPRECATED | Migrate to mem0-v2.py |
| **local_memory.py** | DEPRECATED | Migrate to mem0-v2.py |
| **ChromaDB storage** | DEPRECATED | Migrate to SQLite |

---

## Advanced Features

### RRF Fusion (Future)

Hybrid search combining multiple ranking signals:

```python
# Example: Merge rankings from multiple sources
results = db.rrf_fusion(
    sources=[
        ("fts5_bm25", search_results),
        ("category_boost", weighted_results),
        ("recency", time_decayed_results)
    ],
    weights=[0.6, 0.3, 0.1]
)
```

### Observation Links

Link related observations:

```sql
-- Related concepts
-- Contradicting decisions
-- Superseded approaches
-- Extended implementations
```

### Session Tracking (Advanced)

```python
# Sessions table for cross-session tracking
db.create_session(
    request_summary="Implement user authentication",
    completed_tasks=["auth-flow", "jwt-tokens"],
    next_steps=["add refresh tokens", "implement logout"],
    notes="Using Auth0, JWT with RS256"
)

# Get recent sessions
sessions = db.list_sessions(limit=5)
for session in sessions:
    print(f"{session['date']}: {session['request_summary']}")
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not storing after tasks | Automate via lifecycle hooks. Store after every meaningful action. |
| Querying without budget | Always set `--limit` or `max_tokens`. Avoid unbounded retrieval. |
| Storing secrets | Memory auto-redacts, but avoid manually bypassing. |
| Ignoring GC | Old memories accumulate. Run GC periodically. |
| Using wrong category | Categories affect search relevance. Use consistently. |
| One-time import | Memory only works if populated continuously. Make it a habit. |

---

## Execution Checklist

- [ ] Setup completed (`python3 scripts/mem0-v2.py setup`)
- [ ] Old systems migrated (JSONL, ChromaDB)
- [ ] Lifecycle hooks integrated into orchestrator
- [ ] `.memignore` created if needed
- [ ] MEM0 environment variables configured
- [ ] First memory added (test the system)
- [ ] GC scheduled (weekly or bi-weekly)
