# Forgewright — Roadmap Task Status

> Last updated: 2026-04-21
> Session: Token Efficiency Roadmap Implementation
> Commit: `HEAD` — `feat(memory): Memory v2 SQLite + FTS5 + RRF (P3-T1, I-NEW-3)`

---

## ✅ Completed Tasks

### P1 — Core Token Efficiency Stack

| Task ID | Name | Commit | Notes |
|---------|------|--------|-------|
| **P1-T1** | I-NEW-1.1: Shell Filter native | `31a8dd8` | `scripts/forgewright-shell-filter.sh` — 384 lines, 18 command filters (git, npm, cargo, pytest, ls, grep, tsc, docker, kubectl, curl, etc.). ANSI stripping, structured summaries, per-file diff parsing. macOS awk compatible. Synced to Antigravity plugin. |
| **P1-T2** | I-NEW-1.2: Session Deduplication middleware | `31a8dd8` | `mcp/src/middleware/session-deduplication.ts` + `types.ts` + `chain.ts`. SHA-256 normalized keys, sliding turn/time window (10 turns / 5 min), LRU eviction (500 entries). 25 passing unit tests. Protocol: `skills/_shared/protocols/session-deduplication.md`. |
| **P1-T3** | I-NEW-1.3: RTK Detection in MCP setup | `31a8dd8` | `scripts/forgewright-mcp-setup.sh` — Detects rtk, chop, snip, ctx, tkill at setup time. Writes `.forgewright/settings.env` with `FORGEWRIGHT_SHELL_COMPRESSOR`. Shows compressor in `--check` output. Synced to Antigravity plugin. |
| **P1-T4** | I2: Tool Output Sandboxing middleware | `31a8dd8` | `mcp/src/middleware/tool-sandbox.ts`. ANSI stripping, prompt injection detection, compression (>10KB truncate), structured summaries per tool type. Audit log: `.forgewright/audit/{session}/{turn}/{tool}/{hash}.jsonl`. Protocol: `skills/_shared/protocols/tool-sandbox.md`. |

### P2 — ForgeNexus Code Intelligence (Medium Priority)

| Task ID | Name | Commit | Notes |
|---------|------|--------|-------|
| **P2-T1** | I5: ForgeNexus Outline Mode tool | `c6ab98c` | `forgenexus/src/mcp/outline.ts` + `outline.test.ts`. Pattern-based structural extraction for TS/JS/Python/Go/Rust/Java/C++. Thresholds: >200 lines or >6000 tokens triggers outline mode. Session dedup prevents re-reading. 19 unit tests. Integration: `forgenexus/src/mcp/tools.ts` (outline tool). |
| **P2-T2** | I-NEW-2: ForgeNexus Callee Footer + Session Dedup | `HEAD` | `forgenexus/src/mcp/outline.ts` + `tools.ts`. Extended DedupState to track contextUids separately. Added `checkContextDedup()` function. Context tool shows callee footer (top 5 call targets inline). Session dedup: revisits return "[shown earlier]". 24 passing tests. |

---

## 📋 Remaining Tasks (Priority Order)

### P3 — Memory Engine (High Priority)

| Task ID | Name | Commit | Notes |
|---------|------|--------|-------|
| **P3-T1** | I-NEW-3: Memory Engine v2 (SQLite + FTS5 + RRF) | `HEAD` | `scripts/mem0-v2.py` — SQLite + FTS5 thay thế JSONL + TF-IDF. WAL mode, FTS5 BM25 ranking. 3-layer progressive disclosure: Layer 1 (~15 tokens), Layer 2 (~60 tokens), Layer 3 (~200 tokens). RRF Fusion cho hybrid search. Migration từ JSONL. 30 passing tests. |

### P4 — Conversation Pruning (Medium Priority)

| Task ID | Name | Score | Description |
|---------|------|-------|-------------|
| **P4-T1** | I-NEW-5: DyCP KadaneDial Conversation Pruning | 9.05 | Implement KadaneDial algorithm for conversation context pruning. Deduplicate tool results, purge error-only messages, LLM-driven compression. 50-70% conversation reduction. |

**Key files to read first:**
- `docs/improvement-roadmap-v2.md` §I-NEW-5
- `skills/_shared/protocols/summarization.md`

### P5 — External Tool Integration (Low Priority)

| Task ID | Name | Score | Description |
|---------|------|-------|-------------|
| **P5-T1** | I11: RTK + chop + snip Detection & Integration | 9.35 | Full integration once RTK is installed. Hook `run_shell_filter()` function into tool execution. |
| **P5-T2** | I-NEW-4: Context-Mode Integration (ctx_execute MCP tool) | 9.15 | Add `ctx_execute` MCP tool to ForgeNexus MCP server. Sandbox code execution, return structured summary. |
| **P5-T3** | I-NEW-6: Token-Savior MCP Integration | 9.00 | Integrate Token-Savior's structured navigation (97% reduction) and persistent memory (SQLite + vector embeddings). |

**Key files to read first:**
- `forgenexus/src/mcp/tools.ts`
- `mcp/src/index.ts`
- `docs/improvement-roadmap-v2.md` §I-NEW-4, §I-NEW-6

---

## 📁 Key Files Reference

### Implemented in This Session

| File | Purpose |
|------|---------|
| `scripts/forgewright-shell-filter.sh` | Shell output filter (main) |
| `.antigravity/plugins/production-grade/scripts/forgewright-shell-filter.sh` | Shell filter (Antigravity plugin copy) |
| `scripts/forgewright-mcp-setup.sh` | MCP setup with RTK detection + settings |
| `.antigravity/plugins/production-grade/scripts/forgewright-mcp-setup.sh` | MCP setup (Antigravity plugin copy) |
| `mcp/src/middleware/types.ts` | Shared middleware types (ToolContext, MiddlewareResult, etc.) |
| `mcp/src/middleware/session-deduplication.ts` | Session dedup middleware (4b) |
| `mcp/src/middleware/session-deduplication.test.ts` | 25 unit tests for session dedup |
| `mcp/src/middleware/chain.ts` | Middleware chain orchestrator |
| `mcp/src/middleware/tool-sandbox.ts` | Tool output sandbox middleware (4c) |
| `skills/_shared/protocols/session-deduplication.md` | Session dedup protocol doc |
| `skills/_shared/protocols/tool-sandbox.md` | Tool sandbox protocol doc |
| `skills/_shared/protocols/shell-filter.md` | Shell filter protocol doc |
| `skills/production-grade/middleware/05-session-deduplication.md` | Session dedup middleware spec |
| `skills/production-grade/middleware/06-tool-sandbox.md` | Tool sandbox middleware spec |
| `forgenexus/src/mcp/outline.ts` | Outline mode: structural file extraction + session dedup |
| `forgenexus/src/mcp/outline.test.ts` | 24 unit tests for outline + context dedup |
| `forgenexus/src/mcp/tools.ts` | Added `outline` + `context` tools with callee footer |
| `scripts/mem0-v2.py` | Memory v2: SQLite + FTS5 + RRF (thay thế mem0-cli.py) |
| `scripts/mem0-v2.test.py` | 30 unit tests cho Memory v2 |

### Project Intelligence

| File | Purpose |
|------|---------|
| `docs/improvement-roadmap-v2.md` | Full roadmap with scores, implementation details |
| `skills/_shared/protocols/middleware-chain.md` | Middleware chain protocol (13 steps) |
| `forgenexus/src/` | ForgeNexus code intelligence engine |
| `mcp/src/` | Global MCP server |

---

## 🔄 How to Resume

1. Read `docs/TASK-STATUS.md` (this file)
2. Read relevant sections of `docs/improvement-roadmap-v2.md`
3. Start with highest priority pending task
4. Run `cd forgenexus && npm test` to verify baseline
5. Implement task, write tests, run `npm run build && npm test`
6. Format: `npx prettier --write`
7. Lint: `npm run lint`
8. Commit with clear message referencing task ID (e.g., "feat(forgenexus): add outline mode tool (I5)")

## 🎯 Current Focus

**Next task: P4-T1 — DyCP KadaneDial Conversation Pruning**

Read these files first:
- `docs/improvement-roadmap-v2.md` §I-NEW-5
- `skills/_shared/protocols/summarization.md`
