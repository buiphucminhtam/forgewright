---
name: strategic-compaction
description: "Orchestrates context window optimization, redundant session log pruning, SHA-256 token deduplication, and memory hygiene garbage collection (GC). Use when the user requests context compression, token budget recovery, session state pruning, or database cleanup of old agent execution traces."
version: 1.0.0
---

# Strategic Compaction (LITE)

## SOLVE Step 2: GROUND (Strategic Compaction Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Active session logs, raw history files, or offload traces exist | `find .forgewright/offload/ -name \"*.md\" \|\| find ~/.forgewright/usage/ -name \"*.jsonl\"` [1, 2] | Identifies active, uncompressed token trace logs and local context offload buckets [1, 2] | |
| Memory hygiene, garbage collection, or compression scripts exist | `find scripts/ -name \"*memory-hygiene*\" -o -name \"*compress*\"` [3] | Verifies presence of active pruning and log maintenance scripts [3] | |
| Twin-middleware execution properties and context offload thresholds are defined | `cat .production-grade.yaml` [1, 4] | Validates default token offload parameters and compression limits (default: 1200 tokens) [1, 4] | |
| Active API expenditure limits and token tracking are enabled | `cat .forgewright/budget.yaml` [4, 5] | Confirms running token tracker budget settings and spend safety caps [4, 5] | |

## SOLVE Step 3: DECOMPOSE (Strategic Compaction Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Scan active context buffers, session messages, and offloaded reference lists [1, 6] | Ensure total token count does not exceed safety limits and identify stale history nodes for cleanup.
2. COMPACT | Execute memory-hygiene scripts to compress session logs and prune duplicate token records [3, 7] | Verify that SHA-256 deduplication runs clean and successfully merges redundant query traces to save up to 90% space [7].
3. OFFLOAD | Divert heavy output payloads exceeding 1200 tokens to isolated disk files [1] | Confirm that the model context receives only a short trace handle and the visual canvas updates [1].
4. SYNC | Document compaction logs as lowercase kebab-case and run post-skill sync hooks [8, 9] | Ensure files are saved under `docs/02-architecture/` and symlinked to the Shared Obsidian Vault [8, 9].

## Common Mistakes Checklist
- **Swallowing Live Session Context**: Aggressively pruning active episodic nodes or uncommitted messages during cleanup, leading to agent amnesia on current tasks.
- **Ignoring SHA-256 Deduplication**: Repeatedly processing identical redundant queries instead of leveraging deduplication filters, wasting up to 90% of token window space [7].
- **Leaking Secrets in Compressed Summaries**: Neglecting to run regex filters on compacted logs, allowing sensitive credentials, database keys, or connection URIs to enter the cache [1].
- **Non-Compliant File Names**: Saving compaction statistics or technical logs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/02-architecture/MemoryCompaction.md` instead of `docs/02-architecture/memory-compaction-report.md`) [9].
- **Unverified Token Budgets on Cleanup**: Initiating recursive, LLM-powered semantic summaries of massive historical logs without verifying spending boundaries inside `.forgewright/budget.yaml` [4, 5].

## Worked Example

### Step 1: Ground current context and active usage metrics
```bash
cat .forgewright/budget.yaml
find .forgewright/offload/ -type f | wc -l
```
Output:
```yaml
budget: 20.00
currency: USD
```
```
14
```

### Step 2: Run the memory hygiene tool to compress stale history
```bash
# Execute local memory hygiene and duplicate token cleaning script
./scripts/memory-hygiene.sh --prune-duplicate-queries --threshold 1200
```
Output:
```
[INFO] Initiating session memory garbage collection (GC)...
[SUCCESS] SHA-256 deduplication complete. Pruned 4 redundant query chains.
[SUCCESS] Context token consumption reduced by 72%. Saved ~8,400 tokens.
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
print(f'[OFFLOAD SUCCESS] Truncated output to context window.')
print(f'Trace Handle: refs/{node_id}-{file_hash}.md')
"
```
Output:
```
[OFFLOAD SUCCESS] Truncated output to context window.
Trace Handle: refs/n-5-e8a3b2c1.md
```

### Step 4: Write compaction records and run the post-skill sync hook to Obsidian
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/02-architecture/memory-compaction-report.md
# Architecture Spec: Strategic Context Compaction

## 1. Executive Summary
Optimized session token efficiency by running SHA-256 deduplication and Middleware ④d context offloading.

## 2. Technical Profile
- Compaction Tool: memory-hygiene.sh
- Space Savings: 72% token reduction verified
- Offloaded Asset: refs/n-5-e8a3b2c1.md (Diverted to isolated local disk)
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for memory-compaction-report.md.
[SUCCESS] Symlinked docs/02-architecture/memory-compaction-report.md to /workspace/shared-obsidian-vault/forgewright/02-architecture/memory-compaction-report.md.
```
