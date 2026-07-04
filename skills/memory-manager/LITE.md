---
name: memory-manager
description: "Orchestrates persistent project-specific memory, episodic checkpointing, hybrid GraphRAG/vector indexing (FluxMem), context offloading, and memory consolidation. Use when the user requests memory retrieval, session state recovery, database memory consolidation, context optimization, or session checkpoint audits."
version: 1.0.0
---

# Memory Manager (LITE)

## SOLVE Step 2: GROUND (Memory Manager Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Relational SQLite cognitive graph database exists and contains active tables | `sqlite3 .forgewright/fluxmem.db ".tables"` | ... | run the check command and paste output |
| Core project-specific memory files and directories are present | `find .forgewright/ -maxdepth 2 -name "lessons.md" -o -name "architecture.md" -o -name "memory-bank"` | ... | run the check command and paste output |
| Twin-middleware execution properties and context thresholds are configured | `cat .production-grade.yaml` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Memory Manager Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. RETRIEVE | Execute the Step 0.5 retrieval loop to load recent session summaries and active memories | Verify recent conversational context is injected before processing user requests.
2. OFFLOAD | Divert heavy tool execution outputs exceeding 1200 tokens to isolated disk files | Ensure a compact trace handle (e.g., `refs/n-X-tool-hash.md`) is written to model context.
3. CONSOLIDATE | Run consolidator scripts to compile SQLite database observations into permanent memory layers | Verify insights are migrated under `.forgewright/memory-bank/persona.md` and `.forgewright/memory-bank/scenarios/`.

## Common Mistakes Checklist
- **Bypassing Step 0.5 Memory Loading**: Starting an agent session without running the Step 0.5 memory retrieval loop, causing the orchestrator to repeat past mistakes.
- **Suppressing Middleware ④d Context Offload**: Permitting raw tool outputs over 1200 tokens to flood the active model context window, accelerating token exhaustions.
- **Skipping ASIP Edge Decay on Failures**: Failing to decay graph relation weights by a factor of 0.5 when a plan score falls below 9.0 or an execution blocker occurs, breaking self-healing logic.
- **Non-Compliant Memory File Naming**: Creating scenario memory records or persona logs under `.forgewright/memory-bank/` using spaces or CamelCase instead of lowercase kebab-case.

### Step 1: Ground the active memory SQLite database and configurations
```bash
sqlite3 .forgewright/fluxmem.db "SELECT count(*) FROM flux_nodes;"
find .forgewright/ -maxdepth 2 -name "lessons.md"
```

### Step 2: Retrieve and trace offloaded tool execution context
```bash
# Query large outputs archived under local session directories
python3 scripts/memory-trace.py --query "auth validation"
```

### Step 3: Execute memory consolidation to update the local project memory bank
```bash
# Consolidate SQLite observations and session logs into structured Markdown files
python3 scripts/memory-consolidate.py
```
