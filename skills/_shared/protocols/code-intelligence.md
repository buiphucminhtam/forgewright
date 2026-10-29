---
id: code-intelligence
title: Code Intelligence Protocol
summary: Core protocol for code intelligence.
status: deprecated
version: 1.0.0
owners: [core]
triggers: []
used_by: [all]
related: []
supersedes: []
superseded_by: null
---
# Code Intelligence Protocol

**Gives skills deep codebase awareness via knowledge graph analysis. Powered by [GitNexus](https://github.com/gitnexus/GitNexus) — indexes AST relationships, call chains, and functional communities.**

## When Available

Code Intelligence is available when ALL of these are true:
- `gitnexus` CLI is installed (`command -v gitnexus`)
- Project has been indexed (`.gitnexus/` directory exists)
- `project-profile.json` has `code_intelligence.indexed == true`

**If NOT available:** All skills MUST fall back to traditional analysis (grep, find, view_file_outline). Code Intelligence is an **enhancement**, never a hard dependency.

## Available MCP Tools

When Code Intelligence is active, 7 tools are available via the `gitnexus` MCP server:

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `query({query})` | Search codebase by concept, grouped by execution processes | Understanding a feature area, finding related code |
| `context({name})` | 360° view of a symbol — callers, callees, processes | Before modifying any function/class, during code review |
| `impact({target, direction})` | Blast radius analysis with confidence scores | Before architecture changes, before refactoring |
| `detect_changes({scope})` | Pre-commit risk assessment — changed symbols, affected processes | Before committing, during code review |
| `rename({symbol_name, new_name, dry_run})` | Safe multi-file rename with graph + text edits | Refactoring symbols across files |
| `cypher({query})` | Custom graph queries (Cypher language) | Advanced analysis, custom reports |
| `list_repos()` | List all indexed repositories | Multi-repo workflows |

### Tool Parameters

**impact():**
```
impact({
  target: "UserService",     // symbol name
  direction: "upstream",     // upstream (what depends on this) or downstream (what this depends on)
  maxDepth: 3,               // traversal depth (default: 3)
  minConfidence: 0.7,        // filter low-confidence relationships
  relationTypes: ["CALLS", "IMPORTS", "EXTENDS"],  // optional filter
  includeTests: false        // include test files in results
})
```

**context():**
```
context({
  name: "validateUser"  // symbol name — returns incoming/outgoing relationships, processes
})
```

**detect_changes():**
```
detect_changes({
  scope: "all"  // "all" = full diff, or specific path
})
// Returns: changed_count, affected_count, risk_level, affected_processes
```

## Usage Rules for Skills

### 1. Check Before Use

```
IF project-profile.json → code_intelligence.indexed == true:
    Use MCP tools for deep analysis
ELSE:
    Fall back to grep_search, find_by_name, view_file_outline
    Note in output: "Code Intelligence not available — analysis limited to file-level"
```

### 2. Required Usage Points

| Skill | When | Tool | Why |
|-------|------|------|-----|
| **solution-architect** | Before proposing changes | `impact()` | Know blast radius before making ADRs |
| **code-reviewer** | For each modified function | `context()` | 360° view catches missed dependencies |
| **code-reviewer** | Before approving PR | `detect_changes()` | Risk assessment before merge |
| **debugger** | During investigation (Phase 3) | `context()` | Trace call chains without manual search |
| **debugger** | Finding related code | `query()` | Process-grouped search finds execution flows |
| **software-engineer** | Before modifying function | `impact()` upstream | Check what will break |
| **software-engineer** | After implementing changes | `detect_changes()` | Pre-commit safety check |
| **parallel-dispatch** | Defining task boundaries | community clusters | Each community = potential worktree scope |
| **qa-engineer** | Test planning | `impact()` | Identify test coverage gaps from dependency chains |
| **security-engineer** | Data flow tracing | `query()` + `context()` | Trace PII flow through call chains |

### 3. Graceful Degradation

```
IF MCP tool call fails:
    1. Log warning: "Code Intelligence tool failed: [tool_name] — [error]"
    2. Fall back to traditional analysis (grep/find/outline)
    3. Note reduced analysis depth in output
    4. Continue pipeline — NEVER block on CI failure

IF index is stale (>24h old):
    1. Suggest re-indexing: "gitnexus analyze"
    2. Use existing index anyway (stale > nothing)
    3. Flag in output: "⚠ Code Intelligence index may be stale"
```

### 4. Performance Budget

- `query()` and `context()` — fast (<1s), use freely
- `impact()` — moderate (~2-5s for deep traversal), use when needed
- `detect_changes()` — moderate (~3s), use once before commit
- `cypher()` — variable, use sparingly
- `rename()` — slow (writes files), always use `dry_run: true` first

## Task-Driven Index Refresh

The canonical session lifecycle governs indexing. Do not launch analysis at
session start/end, after every commit/push, or merely because the index crossed
an age threshold. An old index is a limited navigation aid, not a blocker.

Refresh only when stale/missing symbols materially impede the requested task
and measured host capacity permits the bounded job. Otherwise use focused
source/caller checks and disclose the index limitation. Preserve required
impact analysis; a missing graph result is UNKNOWN, never proof of no callers.
An explicitly configured IDE indexing service is separate owned runtime; do
not add duplicate background jobs or disable it without checking ownership.

For a justified refresh, use the available installed GitNexus CLI and current
project configuration, observe completion, and reclaim task-owned processes.
If it fails, classify the failure and use the fallback; do not retry on the next
lifecycle tick automatically. Index or provider maintenance is not an acceptance
requirement for an otherwise verifiable bounded task.

## LLM Configuration (Optional)

GitNexus core features (analyze, impact, context, query, detect_changes) work **without any LLM**. The LLM-dependent command:
- `gitnexus wiki` (auto-generate documentation) is **deprecated** in favor of manual file edits (Documentation as Code) synced to Obsidian-based `llm_wiki`.

### Supported Providers

GitNexus uses OpenAI-compatible API format. Configure via environment variables:

**MiniMax (Recommended — cost-effective):**
```bash
export GITNEXUS_LLM_PROVIDER=openai-compatible
export GITNEXUS_LLM_BASE_URL=https://api.minimaxi.chat/v1
export GITNEXUS_LLM_API_KEY=your-minimax-api-key
export GITNEXUS_LLM_MODEL=MiniMax-Text-01
```

**Google Gemini:**
```bash
export GITNEXUS_LLM_PROVIDER=openai-compatible
export GITNEXUS_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
export GITNEXUS_LLM_API_KEY=your-google-ai-studio-key
export GITNEXUS_LLM_MODEL=gemini-2.0-flash
```

**OpenAI:**
```bash
export GITNEXUS_LLM_API_KEY=your-openai-key
export GITNEXUS_LLM_MODEL=gpt-4o-mini
```

> **Tip:** Add these exports to your `~/.zshrc` (macOS) or `~/.bashrc` (Linux) to persist across sessions. The LLM config is **entirely optional** — if not set, only `wiki` features will be unavailable. All MCP tools work without LLM.

## Integration with Existing Protocols

- **session-lifecycle.md:** Task-relevant freshness check; refresh only when needed and measured capacity permits
- **project-onboarding.md:** Phase 1.5 creates the initial index
- **quality-gate.md:** Quality gate can use `detect_changes()` as additional validation signal
- **graceful-failure.md:** All CI tool failures follow graceful failure protocol
- **brownfield-safety.md:** `impact()` analysis feeds into brownfield risk assessment
