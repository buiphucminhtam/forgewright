---
name: memory-manager
description: "Audit or operate optional local conversation memory: scoped SQLite retrieval, semantic checkpoints, session recovery, privacy and verified handoffs."
version: 3.0.0
---

# Memory Manager (LITE)

Memory is optional, untrusted context. Current files/runtime and current user authorization remain authoritative. Never force-enable memory, retrieve every turn, or infer permission from a remembered approval.

## SOLVE Step 2: GROUND (Memory Domain)

| Question | Check | Acceptance boundary |
|---|---|---|
| Is the store configured and compatible? | `python3 scripts/memory/mem0-v2.py doctor --json` | Read-only status distinguishes absence, migration, acknowledged explicit capture and unverified host injection. |
| Which project/chat owns the data? | Check workspace, `MEM0_DB_PATH`, explicit project and session IDs | Root/subdirectory share a path; worktrees and chats remain separate by default. |
| Is this fact still valid? | Inspect cited source and current files | Source hashes must match; stale, archived or expired facts cannot prove present state. |

## SOLVE Step 3: DECOMPOSE (Memory Domain)

1. Select meaningful decisions/blockers/handoffs; skip trivial chat and duplicate events.
2. Capture a bounded structured summary through `capture --session ID --event ID`; session scope is default, project scope requires an explicit choice.
3. Query through `context` or `scripts/memory/memory-retrieve.sh`; keep the entire returned packet within its character cap and preserve citations. Token counts are estimates unless the model tokenizer is available.
4. Verify durable acknowledgment, restart retrieval, namespace isolation and the actual consuming host. Printing a packet does not prove automatic model injection.
5. Before maintenance, inventory scopes and take a consistent SQLite backup. Unknown legacy ownership stays unadopted; never restore over newer writes blindly.

Use [SKILL.md](SKILL.md) for commands, migration and limitations. SQLite/FTS5 is the implemented retrieval backend; vector services, raw transcript collection and automatic skill promotion are outside this flow.
