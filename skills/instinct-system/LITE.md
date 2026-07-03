---
name: instinct-system
description: "Orchestrates real-time memory retrieval, SQLite cognitive graph (FluxMem) operations, ASIP edge decay/reinforcement, and Procedural Circuits execution trajectory caching. Use when the user requests memory-bank updates, cognitive graph querying, session lesson ingestion, or automated performance evaluation score (PES) assessments."
version: 1.0.0
---

# Instinct System (LITE)

## SOLVE Step 2: GROUND (Instinct System Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| SQLite Layer 2 Cognitive Graph database (`flux_nodes` and `flux_edges`) is active | `sqlite3 .forgewright/fluxmem.db ".tables"` | Verifies tables exist (e.g., `flux_nodes`, `flux_edges`, `procedural_circuits`) [1] | |
| Memory bank structures (persona and scenario layers) are initialized | `find .forgewright/memory-bank/ -name "*.md"` | Confirms location of persistent persona and scenario markdown files [2] | |
| Standard feature spec templates are present for BDD planning | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs [3] | |
| Active session spend tracker parameters and token limits are configured | `cat .forgewright/budget.yaml` | Displays configured budget cap rules to restrict agent task loops [4] | |

## SOLVE Step 3: DECOMPOSE (Instinct System Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. RETRIEVE | Run Step 0.5 memory loops to query SQLite graph nodes and procedural circuits | Extract high-scoring past trajectories (PES >= 90) and conversation summaries before processing requests [1, 5].
2. EVALUATE | Assess task execution trajectories and assign a Performance Evaluation Score (PES) | Verify that execution paths are rated accurately on a 0-100 scale [1, 6].
3. INGEST | Apply ASIP edge adjustments and record fresh lessons in the local database | Reinforce successful paths (1.2 multiplier) or decay blocked paths (0.5 multiplier) based on session outcomes [1].
4. SYNC | Run the Memory Consolidator and propagate logs to the Shared Obsidian Vault | Trigger post-skill scripts to update persona files and establish absolute symlinks to Obsidian [2, 7].

## Common Mistakes Checklist
- **Direct JSON Memory Overload**: Reading or writing massive unstructured JSON memory files on every step instead of utilizing the transaction-safe SQLite cognitive graph, causing progressive latency [1].
- **Bypassing ASIP Edge Decay**: Failing to apply the 0.5 mathematical decay multiplier to relationship edges when a plan fails or a blocker occurs, causing the orchestrator to repeat historical mistakes [1, 8].
- **Dangling Uncommitted Sessions**: Failing to trigger session checkpoints or commit memories during the 10-minute idle trigger window, risking state loss during unexpected IDE disconnects [1].
- **Unverified PES Assessments**: Registering a successful execution trajectory inside procedural circuits without verifying it meets the Performance Evaluation Score criteria [1].
- **Non-Compliant File Names**: Storing consolidated scenario files or architecture records under `docs/` or `.forgewright/` using CamelCase instead of lowercase kebab-case [3].

## Worked Example

### Step 1: Ground the active memory database structure
```bash
sqlite3 .forgewright/fluxmem.db ".tables"
```
Output:
```
flux_nodes            flux_edges            procedural_circuits
```

### Step 2: Query the Cognitive Graph database for a high-scoring past execution path (Procedural Circuit)
```bash
sqlite3 .forgewright/fluxmem.db "SELECT circuit_id, pes, trajectory_hash FROM procedural_circuits WHERE pes >= 90 ORDER BY pes DESC LIMIT 1;"
```
Output:
```
circ-a4f9 | 95 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

### Step 3: Execute ASIP edge adjustment (decay) after a detected compilation failure
```bash
# Simulating an execution blocker on a specific database query edge
node scripts/asip-decay.js --edge-id "edge-db-conn"
```
Output:
```
[ASIP ENGINE] Blocker detected. Initiating mathematical decay of relations.
[INFO] Decaying edge_id: edge-db-conn (weight: 1.0 -> 0.5)
[SUCCESS] SQLite Layer 2 Cognitive Graph updated. Relational weight trained to avoid failing path.
```

### Step 4: Run Memory Consolidator and sync logs to the Shared Obsidian Vault
```bash
python3 scripts/memory-consolidate.py
./scripts/sync-obsidian.sh
```
Output:
```
[INFO] Reading SQLite graph observations...
[SUCCESS] Updated .forgewright/memory-bank/persona.md with stable developer preferences.
[SUCCESS] Generated .forgewright/memory-bank/scenarios/session-908.md.
[SUCCESS] Verified naming convention compliance for session-908.md.
[SUCCESS] Symlinked .forgewright/memory-bank/scenarios/session-908.md to /workspace/shared-obsidian-vault/forgewright/memory-bank/scenarios/session-908.md.
```
