---
name: prompt-optimizer
description: "Orchestrates prompt compression, context offloading (DeerFlow IV), SHA-256 query deduplication, and real-time token tracking. Use when the user requests API cost analysis, token footprint reduction, prompt-response caching setups, or context window optimization."
version: 1.0.0
---

# Prompt Optimizer (LITE)

## SOLVE Step 2: GROUND (Prompt Optimizer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Token tracking and budget alerts are active | `cat .forgewright/budget.yaml` | ... | run the check command and paste output |
| Local token trackers and usage logs are initialized | `ls -la ~/.forgewright/usage/` | ... | run the check command and paste output |
| Context Offload (DeerFlow IV) and Tool Sandbox thresholds are set | `cat .production-grade.yaml` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Prompt Optimizer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Scan active agent workflows for redundant queries and heavy payloads | Compare active outputs against previous execution hashes to identify token waste.
2. COMPRESS | Route large tool execution outputs (>1200 tokens) to offloaded references | Replace bulky text with a short trace handle under `.forgewright/offload/`.
3. DEDUP | Enforce SHA-256 hashing to eliminate duplicate query iterations | Ensure duplicate calls return cached responses instead of invoking remote API calls.

## Common Mistakes Checklist
- **Context Window Flooding**: Passing entire code files or raw db schemas directly into active prompt contexts instead of using minimal signatures or progressive disclosure.
- **Bypassing the 1200-Token Threshold**: Permitting custom tool scripts to feed unchecked outputs directly to the model context without offloading traces to disk.
- **Insecure Few-Shot Examples**: Hardcoding credentials, API keys, or database URIs inside system prompt templates instead of using strict regex redactions.
- **Unverified Token Budget Execution**: Running long-running parallel workflows without enabling budget track gates or validating `.forgewright/budget.yaml` limits.
- **Non-Compliant Report Names**: Storing cost reports or optimization logs under `docs/` using CamelCase, spaces, or absolute paths instead of lowercase kebab-case.

### Step 1: Ground prompt configurations and verify token tracking status
```bash
# Enable the built-in token tracker
forge token on
cat .forgewright/budget.yaml
```

### Step 2: Trigger prompt optimization pipeline utilizing Context Offload (DeerFlow IV)
```bash
# Simulate execution of a heavy schema fetch tool exceeding 1200 tokens
node scripts/simulate-heavy-tool.js
```

### Step 3: Execute a duplicate query check using SHA-256 deduplication
```bash
# Executing identical query sequence to verify the deduplication cache
node scripts/run-prompt.js --query "Explain the ASIP feedback loop"
node scripts/run-prompt.js --query "Explain the ASIP feedback loop"
```
