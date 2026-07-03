---
name: prompt-optimizer
description: "Orchestrates prompt compression, context offloading (DeerFlow IV), SHA-256 query deduplication, and real-time token tracking. Use when the user requests API cost analysis, token footprint reduction, prompt-response caching setups, or context window optimization [1-3]."
version: 1.0.0
---

# Prompt Optimizer (LITE)

## SOLVE Step 2: GROUND (Prompt Optimizer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Token tracking and budget alerts are active | `cat .forgewright/budget.yaml` | Displays configured spending ceilings, daily alerts, and tracked providers [3] | |
| Local token trackers and usage logs are initialized | `ls -la ~/.forgewright/usage/` | Confirms directories for real-time tracking logs exist [3, 4] | |
| Context Offload (DeerFlow IV) and Tool Sandbox thresholds are set | `cat .production-grade.yaml` | Verifies default offload bounds (e.g., 1200 tokens) and injection regexes [1] | |
| Standard feature specs and naming conventions are loaded | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs [5] | |

## SOLVE Step 3: DECOMPOSE (Prompt Optimizer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Scan active agent workflows for redundant queries and heavy payloads | Compare active outputs against previous execution hashes to identify token waste [2].
2. COMPRESS | Route large tool execution outputs (>1200 tokens) to offloaded references | Replace bulky text with a short trace handle under `.forgewright/offload/` [1].
3. DEDUP | Enforce SHA-256 hashing to eliminate duplicate query iterations | Ensure duplicate calls return cached responses instead of invoking remote API calls [2, 6].
4. SYNC | Compile token optimization reports and synchronize docs with Obsidian | Verify file names are lowercase kebab-case and run post-skill hooks to link documentation [5, 7].

## Common Mistakes Checklist
- **Context Window Flooding**: Passing entire code files or raw db schemas directly into active prompt contexts instead of using minimal signatures or progressive disclosure [2, 8].
- **Bypassing the 1200-Token Threshold**: Permitting custom tool scripts to feed unchecked outputs directly to the model context without offloading traces to disk [1].
- **Insecure Few-Shot Examples**: Hardcoding credentials, API keys, or database URIs inside system prompt templates instead of using strict regex redactions [1].
- **Unverified Token Budget Execution**: Running long-running parallel workflows without enabling budget track gates or validating `.forgewright/budget.yaml` limits [3, 8].
- **Non-Compliant Report Names**: Storing cost reports or optimization logs under `docs/` using CamelCase, spaces, or absolute paths instead of lowercase kebab-case [5].

## Worked Example

### Step 1: Ground prompt configurations and verify token tracking status
```bash
# Enable the built-in token tracker
forge token on
cat .forgewright/budget.yaml
```
Output:
```
[SUCCESS] Real-time token tracking and cost analytics are now ACTIVE.
budget: 15.00
currency: USD
alerts:
  threshold: 0.85
  notify: true
```

### Step 2: Trigger prompt optimization pipeline utilizing Context Offload (DeerFlow IV)
```bash
# Simulate execution of a heavy schema fetch tool exceeding 1200 tokens
node scripts/simulate-heavy-tool.js
```
Output:
```
[INFO] Tool output size: 4500 tokens. Threshold: 1200 tokens.
[MIDDLEWARE ④d] Large output detected. Initiating Context Offload...
[SUCCESS] Offloaded output to .forgewright/offload/sess-908/refs/n-1a-schema.md
[CONTEXT] Replaced raw output with trace handle: "refs/n-1a-schema.md"
[INFO] Saved 3300 tokens (73.3% context window space saved).
```

### Step 3: Execute a duplicate query check using SHA-256 deduplication
```bash
# Executing identical query sequence to verify the deduplication cache
node scripts/run-prompt.js --query "Explain the ASIP feedback loop"
node scripts/run-prompt.js --query "Explain the ASIP feedback loop"
```
Output:
```
[EXEC 1] Fetching fresh response from LLM provider... (Cost: $0.0045)
[EXEC 2] SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
[EXEC 2] Match found in local Procedural Circuit cache. Retrieving response...
[SUCCESS] Retrieved response in 42ms with 0 additional token costs.
```

### Step 4: Write standard optimization logs and synchronize to the Shared Obsidian Vault
```bash
cat << 'EOF' > docs/05-operations/token-optimization-audit.md
# Token Optimization and API Cost Audit

## 1. Executive Summary
Conducted a token footprint review of active development pipelines utilizing DeerFlow IV.

## 2. Metrics Summary
- Offloaded Sessions: 1 (saved 3300 tokens)
- Duplicate Queries Blocked: 1 (SHA-256 cache match)
- Total Savings: 90% cost reduction on high-frequency runs
- Active Budget Balance: $14.99 / $15.00 remaining
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for token-optimization-audit.md.
[SUCCESS] Symlinked docs/05-operations/token-optimization-audit.md to /workspace/shared-obsidian-vault/forgewright/05-operations/token-optimization-audit.md.
```
