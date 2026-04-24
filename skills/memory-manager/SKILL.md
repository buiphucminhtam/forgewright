---
name: memory-manager
description: >
  Persistent project memory using ChromaDB + sentence-transformers.
  Fully local, no API key needed. Semantic search with embeddings.
  Falls back to legacy JSONL for simple use cases.
---

# Memory Manager Skill

> **Purpose:** Give the AI agent persistent, searchable project memory — store decisions,
> blockers, session summaries, and query them semantically across sessions.

## Architecture

| Component | Technology | Notes |
|-----------|------------|-------|
| **Vector DB** | ChromaDB | Local, persistent |
| **Embeddings** | sentence-transformers/all-MiniLM-L6-v2 | No API needed |
| **Backup** | JSONL + JSON | Export/archive |

> **No Docker, no API key required.** Everything runs locally.

## When to Use

- **Session start** — auto-retrieve project context instead of re-reading entire codebase
- **Before answering** — query memory with task keywords for relevant decisions/blockers
- **After completing work** — store what was done, decisions made, blockers found
- **Periodic** — refresh project identity when major changes happen

Memory Model — category weights for search relevance:

| Category | Weight | Examples |
|----------|--------|----------|
| **decisions** | 10 | "Chose PostgreSQL because..." |
| **architecture** | 8 | "Using Next.js + Prisma" |
| **blockers** | 7 | "Waiting on API key" |
| **session** | 6 | "Session completed: built auth" |
| **tasks** | 5 | "BUILD complete: 142 tests pass" |
| **general** | 4 | User-added notes |

## CLI Commands

All commands use `scripts/local_memory.py`:

```bash
# Add a memory
python3 scripts/local_memory.py add "Decided to use JWT + refresh tokens for auth" --category decisions

# Search with semantic similarity
python3 scripts/local_memory.py search "authentication flow" --limit 5

# List all memories (with optional category filter)
python3 scripts/local_memory.py list --category decisions

# Stats - memory statistics
python3 scripts/local_memory.py stats

# Clear all memories
python3 scripts/local_memory.py clear

# Health check
python3 scripts/local_memory.py health
```

## Python API

```python
from scripts.local_memory import get_client

# Add memory
client = get_client()
result = client.add("Decided to use JWT for auth", category="decisions")

# Search
results = client.search("authentication", limit=5)

# List by category
memories = client.list(category="decisions", limit=10)

# Stats
stats = client.stats()
```

## Legacy Commands (mem0-cli)

The old `mem0-cli.py` is preserved for backward compatibility:

```bash
# These still work but use the old TF-IDF + JSONL system
python3 scripts/mem0-cli.py search "query" --limit 5
python3 scripts/mem0-cli.py add "text" --category decisions
```

## Token Optimization Strategy

### When to Retrieve
1. **Always** at session start — search with project name + request keywords, limit to top-5
2. **Before complex tasks** — search with task keywords, limit to top-3
3. **At gate decisions** — fetch relevant decisions/blockers

### Token Budget
- Retrieval output: max **500 tokens** (configurable)
- Total memory injection per prompt: **800 tokens** ceiling

## Safety

### Secret Redaction
The CLI automatically redacts patterns matching:
- API keys (`sk-*`, `key-*`, Bearer tokens)
- Passwords, secrets, tokens (configurable regex)
- Database connection strings with credentials

### .memignore
Create `.memignore` at project root to exclude files/folders from ingestion.

### Opt-out
- Set `LOCAL_MEMORY_DISABLED=true` to skip all memory operations

## Configuration

### Graphiti (Primary)

```bash
# LLM Provider (supports: openai, anthropic, gemini, minimax)
GRAPHITI_LLM_PROVIDER=openai
GRAPHITI_API_KEY=sk-...                    # API key for LLM
GRAPHITI_BASE_URL=https://api.openai.com/v1  # Custom endpoint (optional)
GRAPHITI_LLM_MODEL=gpt-4o-mini             # Model to use

# Embedding config
GRAPHITI_EMBED_PROVIDER=openai
GRAPHITI_EMBED_API_KEY=sk-...              # API key for embeddings
GRAPHITI_EMBED_MODEL=text-embedding-3-small

# FalkorDB connection
FALKORDB_HOST=localhost
FALKORDB_PORT=6379

# Graph settings
GRAPHITI_REDACT_SECRETS=true    # Auto-redact API keys, passwords
```

### Legacy (mem0-cli)

```bash
# Storage (JSONL, git-committed)
MEM0_PROJECT_ID=my-project        # namespace for multi-project

# Limits
MEM0_MAX_TOKENS=500               # max tokens per retrieval
MEM0_MAX_MEMORIES=200             # max stored memories before GC

# Safety
MEM0_REDACT_SECRETS=true          # auto-redact API keys, passwords
MEM0_DISABLED=false               # set true to skip all ops
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
- **Memory** = semantic facts (decisions, blockers, progress) — searched with embeddings
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
python3 scripts/local_memory.py search "current task" --limit 3

# After completing work
python3 scripts/local_memory.py add "Completed: auth module with JWT + refresh tokens" --category decisions
```

## File Layout

```
forgewright/
├── skills/memory-manager/
│   └── SKILL.md              ← this file
├── scripts/
│   ├── local_memory.py       ← Primary CLI (ChromaDB + sentence-transformers)
│   ├── mem0-cli.py           ← Legacy CLI (TF-IDF + JSONL)
│   └── ...
└── .forgewright/
    ├── memory_db/            ← ChromaDB storage
    │   ├── chroma.sqlite3
    │   └── memory_backup.json
    ├── memory.jsonl          ← Legacy storage
    └── project-profile.json  ← project fingerprint (committed)
```

## Dependencies

No external services required:

| Package | Purpose | Install |
|---------|---------|---------|
| `chromadb` | Vector database | Already installed |
| `sentence-transformers` | Local embeddings | `pip3 install sentence-transformers` |
| `torch` | ML framework | Auto-installed with sentence-transformers |

Model downloaded on first use (~22MB for all-MiniLM-L6-v2).
