---
name: instinct-system
description: "Orchestrates real-time memory retrieval, SQLite cognitive graph (FluxMem) operations, ASIP edge decay/reinforcement, and Procedural Circuits execution trajectory caching. Use when the user requests memory-bank updates, cognitive graph querying, session lesson ingestion, or automated performance evaluation score (PES) assessments."
version: 1.0.0
---

# Instinct System (LITE)

## SOLVE Step 2: GROUND (Instinct System Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| SQLite Layer 2 Cognitive Graph database (`flux_nodes` and `flux_edges`) is active | `sqlite3 .forgewright/memory.db ".tables"` | ... | run the check command and paste output |
| Memory bank structures (persona and scenario layers) are initialized | `find .forgewright/memory-bank/ -name "*.md"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Instinct System Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. RETRIEVE | Run Step 0.5 memory loops to query SQLite graph nodes and procedural circuits | Extract high-scoring past trajectories (PES >= 90) and conversation summaries before processing requests.
2. EVALUATE | Assess task execution trajectories and assign a Performance Evaluation Score (PES) | Verify that execution paths are rated accurately on a 0-100 scale.
3. INGEST | Apply ASIP edge adjustments and record fresh lessons in the local database | Reinforce successful paths (1.2 multiplier) or decay blocked paths (0.5 multiplier) based on session outcomes.

## Common Mistakes Checklist
- **Direct JSON Memory Overload**: Reading or writing massive unstructured JSON memory files on every step instead of utilizing the transaction-safe SQLite cognitive graph, causing progressive latency.
- **Bypassing ASIP Edge Decay**: Failing to apply the 0.5 mathematical decay multiplier to relationship edges when a plan fails or a blocker occurs, causing the orchestrator to repeat historical mistakes.
- **Dangling Uncommitted Sessions**: Failing to trigger session checkpoints or commit memories during the 10-minute idle trigger window, risking state loss during unexpected IDE disconnects.
- **Unverified PES Assessments**: Registering a successful execution trajectory inside procedural circuits without verifying it meets the Performance Evaluation Score criteria.
- **Non-Compliant File Names**: Storing consolidated scenario files or architecture records under `docs/` or `.forgewright/` using CamelCase instead of lowercase kebab-case.

### Step 1: Ground the active memory database structure
```bash
sqlite3 .forgewright/memory.db ".tables"
```

### Step 2: Query the Cognitive Graph database for a high-scoring past execution path (Procedural Circuit)
```bash
sqlite3 .forgewright/memory.db "SELECT circuit_id, pes, trajectory_hash FROM procedural_circuits WHERE pes >= 90 ORDER BY pes DESC LIMIT 1;"
```

### Step 3: Execute ASIP edge adjustment (decay) after a detected compilation failure
```bash
# Simulating an execution blocker on a specific database query edge
python3 scripts/mem0-v2.py graph-decay "source-node" "edge-db-conn"
```
