---
name: memory-manager
description: "Orchestrates persistent project-specific memory, episodic checkpointing, hybrid GraphRAG/vector indexing (FluxMem), context offloading, and memory consolidation. Use when the user requests memory retrieval, session state recovery, database memory consolidation, context optimization, or session checkpoint audits."
version: 1.0.0
---

# Memory Manager (LITE)

## SOLVE Step 2: GROUND (Memory Manager Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Relational SQLite cognitive graph database exists and contains active tables | `sqlite3 .forgewright/fluxmem.db ".tables"` | Confirms presence of `flux_nodes`, `flux_edges`, and `procedural_circuits` tables [1, 2] | |
| Core project-specific memory files and directories are present | `find .forgewright/ -maxdepth 2 -name "lessons.md" -o -name "architecture.md" -o -name "memory-bank"` | Verifies paths to active lessons, design logs, and structured memory bank files [3, 4] | |
| Twin-middleware execution properties and context thresholds are configured | `cat .production-grade.yaml` | Validates default token offload threshold parameters (default: 1200 tokens) [5] | |
| Active API expenditure parameters and cost ceilings are active | `cat .forgewright/budget.yaml` | Displays configured spend tracking limits to restrict heavy token crawls [6, 7] | |

## SOLVE Step 3: DECOMPOSE (Memory Manager Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. RETRIEVE | Execute the Step 0.5 retrieval loop to load recent session summaries and active memories | Verify recent conversational context is injected before processing user requests [8].
2. OFFLOAD | Divert heavy tool execution outputs exceeding 1200 tokens to isolated disk files | Ensure a compact trace handle (e.g., `refs/n-X-tool-hash.md`) is written to model context [5].
3. CONSOLIDATE | Run consolidator scripts to compile SQLite database observations into permanent memory layers | Verify insights are migrated under `.forgewright/memory-bank/persona.md` and `.forgewright/memory-bank/scenarios/` [3].
4. SYNC | Propagate consolidated memory specifications to the Shared Obsidian Vault | Execute post-skill sync scripts to establish absolute symlinks for documentation files [9].

## Common Mistakes Checklist
- **Direct JSON Memory Mutations**: Mutating legacy `.json` memory files directly instead of utilizing the relational SQLite database, causing state desynchronization [1, 2].
- **Bypassing Step 0.5 Memory Loading**: Starting an agent session without running the Step 0.5 memory retrieval loop, causing the orchestrator to repeat past mistakes [8].
- **Suppressing Middleware ④d Context Offload**: Permitting raw tool outputs over 1200 tokens to flood the active model context window, accelerating token exhaustions [5].
- **Skipping ASIP Edge Decay on Failures**: Failing to decay graph relation weights by a factor of 0.5 when a plan score falls below 9.0 or an execution blocker occurs, breaking self-healing logic [1].
- **Non-Compliant Memory File Naming**: Creating scenario memory records or persona logs under `.forgewright/memory-bank/` using spaces or CamelCase instead of lowercase kebab-case [10].

## Worked Example

### Step 1: Ground the active memory SQLite database and configurations
```bash
sqlite3 .forgewright/fluxmem.db "SELECT count(*) FROM flux_nodes;"
find .forgewright/ -maxdepth 2 -name "lessons.md"
```
Output:
```
42
.forgewright/lessons.md
```

### Step 2: Retrieve and trace offloaded tool execution context
```bash
# Query large outputs archived under local session directories
python3 scripts/memory-trace.py --query "auth validation"
```
Output:
```
[INFO] Searching local offload directories...
[SUCCESS] Match found: .forgewright/offload/session-001/refs/n-4-tool-hash.md
[SUMMARY] Raw fetch trace containing 5,420 output tokens.
```

### Step 3: Execute memory consolidation to update the local project memory bank
```bash
# Consolidate SQLite observations and session logs into structured Markdown files
python3 scripts/memory-consolidate.py
```
Output:
```
[INFO] Reading SQLite flux_nodes and completed session logs...
[SUCCESS] Consolidated 14 semantic observations.
[SUCCESS] Written memory layers:
  - .forgewright/memory-bank/persona.md
  - .forgewright/memory-bank/scenarios/session-001.md
```

### Step 4: Write documentation and synchronize with the Shared Obsidian Vault
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/02-architecture/memory-manager-spec.md
# Architecture Spec: Persistent Memory Manager

## 1. Executive Summary
Provide a persistent, relational SQLite GraphRAG memory system utilizing ASIP edge decay and context offloading.

## 2. Technical Profile
- Database Engine: SQLite Layer 2 Cognitive Graph (flux_nodes & flux_edges)
- Context Middleware: Middleware ④c (Sandbox) and Middleware ④d (Offload)
- Consolidation Target: .forgewright/memory-bank/ (persona.md and scenarios/)
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for memory-manager-spec.md.
[SUCCESS] Symlinked docs/02-architecture/memory-manager-spec.md to /workspace/shared-obsidian-vault/forgewright/02-architecture/memory-manager-spec.md.
```
