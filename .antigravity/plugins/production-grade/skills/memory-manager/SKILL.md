---
name: memory-manager
description: >
  Persistent project memory using JSONL (git-committed). TF-IDF search,
  markdown-aware chunking, value-weighted GC. Stores decisions, architecture,
  blockers, and task status for cross-session continuity.
---

# Memory Manager Skill

> **Purpose:** Give the AI agent persistent, searchable project memory so it
> doesn't re-discover the same context every session. Retrieve only what's
> relevant, compress the rest.

## When to Use

- **Session start** — auto-retrieve project context instead of re-reading entire codebase
- **Before answering** — query memory with task keywords for relevant decisions/blockers
- **After completing work** — store what was done, decisions made, blockers found
- **Periodic** — refresh project identity when major changes happen

## Memory Model

| Category | Examples | Weight (GC) |
|----------|----------|-------------|
| **decisions** | "Chose PostgreSQL because..." | 10 |
| **architecture** | "Using Next.js + Prisma + PostgreSQL" | 8 |
| **project** | "Forgewright v7.1 — 47 skills, 19 modes" | 8 |
| **blockers** | "Waiting on API key from vendor" | 7 |
| **session** | "Session completed: built auth module" | 6 |
| **tasks** | "BUILD complete: 3 services, 142 tests pass" | 5 |
| **conversation** | Extracted facts from summarized files | 4 |
| **general** | User-added notes | 4 |
| **git-activity** | Recent commit summaries | 3 |
| **ingested** | Chunked README/docs sections | 2 |

## CLI Commands

All commands use `scripts/mem0-cli.py`:

```bash
# Search memory — TF-IDF with cosine similarity
python3 scripts/mem0-cli.py search "authentication flow" --limit 5

# Add a memory manually
python3 scripts/mem0-cli.py add "Decided to use JWT + refresh tokens for auth" --category decisions

# Refresh project state — replaces old ingested data with current reality
python3 scripts/mem0-cli.py refresh

# Ingest files — markdown-aware chunking with section context
python3 scripts/mem0-cli.py ingest README.md VISION.md

# Ingest from recent git history
python3 scripts/mem0-cli.py ingest-git --days 7

# Summarize file — extracts structured facts (key-value, decisions, blockers)
python3 scripts/mem0-cli.py summarize path/to/conversation.md

# List all memories (with optional category filter)
python3 scripts/mem0-cli.py list --category decisions

# Delete a specific memory
python3 scripts/mem0-cli.py delete <memory_id>

# Export all memories to markdown
python3 scripts/mem0-cli.py export > project-memory.md

# Stats: memory count, file size, token estimate, categories
python3 scripts/mem0-cli.py stats

# Garbage collection — value-weighted (category × recency)
python3 scripts/mem0-cli.py gc --max-memories 200
```

## Search — How It Works

Search uses **TF-IDF (Term Frequency × Inverse Document Frequency)** with **cosine similarity** — all Python stdlib, zero external dependencies.

```
Query: "authentication JWT"
→ Tokenize → Compute TF-IDF vectors → Cosine similarity against all memories
→ Return top-N ranked results
```

**Advantages over keyword search:**
- Matches semantic relevance, not just keyword overlap
- Rare terms (e.g., "JWT") get higher weight than common terms
- Better results for paraphrased or related concepts

## Token Optimization Strategy

### When to Retrieve
1. **Always** at session start — search with project name + request keywords, limit to top-5
2. **Before complex tasks** — search with task keywords, limit to top-3
3. **At gate decisions** — fetch relevant decisions/blockers

### Token Budget
- Retrieval output: max **500 tokens** (configurable via `MEM0_MAX_TOKENS`)
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
- Set `MEM0_DISABLED=true` to skip all memory operations

## Configuration

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

The orchestrator calls memory-manager at specific lifecycle points. All hooks are wired with exact CLI commands in `skills/_shared/protocols/session-lifecycle.md`:

| Hook | Trigger | Memory Command |
|------|---------|---------------|
| `SESSION_START` | Pipeline begins | `search "<project> <keywords>" --limit 5` |
| `PHASE_COMPLETE` | After DEFINE/BUILD/HARDEN/SHIP | `add "Phase [name]: [summary]" --category tasks` |
| `GATE_DECISION` | After Gate 1/2/3 | `add "Gate [N] [decision]: [feedback]" --category decisions` |
| `SESSION_END` | Pipeline completes | `add "Session completed: [summary]" --category session` + `refresh` |
| `ERROR` | Task failure/escalation | `add "BLOCKER: [task] failed: [details]" --category blockers` |

### Context Integration with Project Profile

Memory works alongside `.forgewright/project-profile.json`:
- **Project Profile** = structural facts (stack, health, patterns) — always loaded
- **Memory** = temporal facts (decisions, blockers, progress) — searched contextually
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
python3 scripts/mem0-cli.py search "current task" --limit 3 --format compact

# After completing work
python3 scripts/mem0-cli.py add "Completed: auth module with JWT + refresh tokens" --category decisions
```

## Garbage Collection — Value-Weighted

GC scores each entry: `category_weight × recency_factor`, then prunes lowest-scored:

| Category | Weight | Rationale |
|----------|--------|-----------|
| decisions | 10 | Most valuable — architecture choices persist |
| architecture | 8 | Stack identity rarely changes |
| project | 8 | Core project facts |
| blockers | 7 | Active impediments need attention |
| session | 6 | Recent work history |
| tasks | 5 | Phase completion status |
| conversation | 4 | Summarized context |
| general | 4 | User notes |
| git-activity | 3 | Easily re-ingested |
| ingested | 2 | Easily re-ingested from source files |

Recency factor: today=1.0, 30 days ago=0.7, 90+ days ago=0.1.

## File Layout

```
forgewright/
├── skills/memory-manager/
│   └── SKILL.md              ← this file
├── scripts/
│   └── mem0-cli.py           ← CLI tool (TF-IDF, JSONL, zero deps)
├── .memignore                ← exclusion patterns
└── .forgewright/
    ├── memory.jsonl          ← source of truth (committed to git)
    ├── project-profile.json  ← project fingerprint (committed)
    ├── code-conventions.md   ← detected patterns (committed)
    ├── session-log.json      ← session history (gitignored)
    └── .gitignore            ← auto-generated
```
