---
name: strategic-compaction
description: "Orchestrates context window optimization, redundant session log pruning, SHA-256 token deduplication, and memory hygiene garbage collection (GC). Use when the user requests context compression, token budget recovery, session state pruning, or database cleanup of old agent execution traces."
version: 1.0.0
---

# Strategic Compaction (LITE)

## SOLVE Step 2: GROUND (Strategic Compaction Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Active session logs, raw history files, or offload traces exist | `find .forgewright/offload/ -name \"*.md\" \|\| find ~/.forgewright/usage/ -name \"*.jsonl\"` | ... | run the check command and paste output |
| Memory hygiene, garbage collection, or compression scripts exist | `find scripts/ -name \"*memory-hygiene*\" -o -name \"*compress*\"` | ... | run the check command and paste output |
| Twin-middleware execution properties and context offload thresholds are defined | `cat .production-grade.yaml` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Strategic Compaction Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Scan active context buffers, session messages, and offloaded reference lists | Ensure total token count does not exceed safety limits and identify stale history nodes for cleanup.
2. COMPACT | Execute memory-hygiene scripts to compress session logs and prune duplicate token records | Verify that SHA-256 deduplication runs clean and successfully merges redundant query traces to save up to 90% space.
3. OFFLOAD | Divert heavy output payloads exceeding 1200 tokens to isolated disk files | Confirm that the model context receives only a short trace handle and the visual canvas updates.

## Common Mistakes Checklist
- **Swallowing Live Session Context**: Aggressively pruning active episodic nodes or uncommitted messages during cleanup, leading to agent amnesia on current tasks.
- **Ignoring SHA-256 Deduplication**: Repeatedly processing identical redundant queries instead of leveraging deduplication filters, wasting up to 90% of token window space.
- **Leaking Secrets in Compressed Summaries**: Neglecting to run regex filters on compacted logs, allowing sensitive credentials, database keys, or connection URIs to enter the cache.
- **Non-Compliant File Names**: Saving compaction statistics or technical logs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/02-architecture/MemoryCompaction.md` instead of `docs/02-architecture/memory-compaction-report.md`).

### Step 1: Ground current context and active usage metrics
```bash
cat .forgewright/budget.yaml
find .forgewright/offload/ -type f | wc -l
```
```
14
```

### Step 2: Run the memory hygiene tool to compress stale history
```bash
# Execute local memory hygiene and duplicate token cleaning script
./scripts/memory-hygiene.sh --prune-duplicate-queries --threshold 1200
```

### Step 3: Offload a heavy shell output payload to isolated disk storage (Middleware ④d)
```bash
# Simulate a large tool output exceeding 1200 tokens
python3 -c "
import os
import hashlib

output_data = 'DATA_DUMP_OR_LOGS_EXCEEDING_TOKEN_LIMIT' * 1000
node_id = 'n-5'
session_id = 'session-001'

# Write to isolated offload disk storage
offload_dir = f'.forgewright/offload/{session_id}/refs'
os.makedirs(offload_dir, exist_ok=True)
file_hash = hashlib.sha256(output_data.encode()).hexdigest()[:8]
ref_path = f'{offload_dir}/{node_id}-{file_hash}.md'

with open(ref_path, 'w') as f:
    f.write(output_data)

# Print the short trace handle injected into the active context window
print(f'Offload success: Truncated output to context window.')
print(f'Trace Handle: refs/{node_id}-{file_hash}.md')
"
```
