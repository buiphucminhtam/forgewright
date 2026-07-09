# TencentDB Agent Memory Applicability Analysis

Date: 2026-06-23
Mode: Research / Explore
Target repo: https://github.com/TencentCloud/TencentDB-Agent-Memory

## Request

Assess whether TencentDB-Agent-Memory has ideas that can upgrade Forgewright.

## External Evidence

- TencentDB Agent Memory positions itself as a local-first agent memory plugin with symbolic short-term memory plus layered long-term memory.
- Its README describes short-term context layering: raw tool outputs in `refs/*.md`, step summaries in JSONL, and top-level Mermaid canvas for agent context.
- Its long-term model is L0 Conversation -> L1 Atom -> L2 Scenario -> L3 Persona.
- It emphasizes traceability from upper-layer memory back to raw evidence via `node_id` and `result_ref`.
- It ships as `@tencentdb-agent-memory/memory-tencentdb` v0.3.6 and requires Node >= 22.16.0.
- Its package includes OpenClaw/Hermes integration, SQLite + sqlite-vec, hybrid retrieval, and CLI scripts for migration, export, and local memory reading.

## Local Forgewright Evidence

- Forgewright already has persistent long-term memory in `scripts/mem0-v2.py`: SQLite + WAL + FTS5, category weighting, auto tags, L1 index / L2 search / L3 get, soft-delete GC, observation links, Flux graph nodes/edges, and procedural circuits.
- `scripts/memory-retrieve.sh` loads conversation summary, active context, BA handoff, session summary, and mem0 search results with a token budget.
- `mcp/src/middleware/tool-sandbox.ts` already sanitizes tool outputs, writes audit logs, compresses large outputs, and returns summaries.
- `mcp/src/middleware/session-deduplication.ts` deduplicates repeated tool calls in-session.
- `scripts/memory-session.sh` and `scripts/memory-middleware.py` create checkpoints and handover summaries.
- `antigravity/src/memory/graphrag.py` has a simple NetworkX graph persisted to JSON, but it is not wired into a live short-term tool-call canvas.

## Main Gaps

1. Forgewright has long-term memory layering, but does not appear to have Tencent-style short-term context offload with a live Mermaid task canvas.
2. Existing MCP audit logs are linear summaries, not a deterministic drill-down chain from injected context to raw tool output.
3. Memory retrieval is mostly search/category based; it lacks a persona/scenario-first recall path analogous to L3 Persona / L2 Scenario.
4. Tool-token reduction exists through summarization and deduplication, but it does not expose explicit `node_id` trace handles to the model.
5. Existing NotebookLM skill docs are stale for `nlm auth status`; CLI 0.5.19 uses `login`, not `auth`.

## Recommended Upgrade Candidates

1. Short-term context offload canvas for MCP tool calls.
   - Persist full tool output under `.forgewright/offload/<session>/refs/`.
   - Store a JSONL event index with `node_id`, `tool`, `args_hash`, `summary`, `result_ref`, status, and timestamps.
   - Inject only a compact Mermaid task canvas into context.

2. Drill-down memory CLI.
   - Add commands to retrieve by `node_id` and open the raw `result_ref`.
   - Tie MCP audit refs to mem0 graph nodes.

3. Scenario/persona layer on top of mem0.
   - Materialize `.forgewright/memory-bank/scenarios/*.md` and `.forgewright/memory-bank/persona.md`.
   - Use these as first-pass recall before atom-level search.

4. Memory observability/export.
   - Add a diagnostic export script that redacts config, packages memory DB, summaries, audit logs, and offload refs.
   - Useful for debugging users' memory issues without exposing secrets accidentally.

5. Fix NotebookLM skill auth command.
   - Replace `nlm auth status` guidance with current `nlm login` / `nlm config` / `nlm doctor` checks after verifying desired command behavior.

## Risk Notes

- Do not vendor Tencent's plugin directly: it targets OpenClaw/Hermes, Node >= 22.16.0, and has host-specific hooks.
- Forgewright currently supports broader Codex/Cursor/Claude/OpenCode workflows; the right path is adapting concepts, not installing the plugin.
- Any Mermaid canvas injection must preserve tool-call/tool-result ordering and avoid breaking agent protocol messages.

