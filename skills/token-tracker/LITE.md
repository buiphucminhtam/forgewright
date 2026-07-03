---
name: token-tracker
description: "Orchestrates LLM usage logging, budget alert configurations, token cost analysis, and API cost optimization tips [1, 2]. Use when the user requests token usage reports, budget audits, cost dashboards, or API cost optimization reviews [1]."
version: 1.0.0
---

# Token Tracker (LITE)

## SOLVE Step 2: GROUND (Token Tracker Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Built-in cost control and local token tracking are activated | `forge token status` or `forge token on` | Verification that local token tracking is fully active [3, 4] | |
| Active project budget configuration is established | `cat .forgewright/budget.yaml` | Displays configured spend thresholds, alert rules, and providers [1, 2] | |
| Structured token usage log directory and JSONL files exist | `ls -la ~/.forgewright/usage/` | Confirms usage log directories exist for active projects [2] | |
| Offline context caching thresholds are configured | `cat .production-grade.yaml` | Verifies context cache settings to minimize repetitive token overhead [3] | |

## SOLVE Step 3: DECOMPOSE (Token Tracker Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Parse raw usage logs (`~/.forgewright/usage/{project}/{date}.jsonl`) | Extract input/output token counts, model types, execution latency, and financial costs [1, 2].
2. COMPARE | Map current expenditures against boundaries configured in `budget.yaml` | Trigger budget alert notifications if cumulative spending crosses warn thresholds (e.g., 90%) [1].
3. ANALYZE | Identify premium model waste and recommend structural optimization techniques | Assess whether SHA-256 deduplication, minimal signature files, and progressive disclosure are active [5].
4. EXPORT | Generate a clean, kebab-case markdown usage report under `docs/05-operations/` | Verify file name compliance and execute sync hooks to propagate reports to the Shared Obsidian Vault [6, 7].

## Common Mistakes Checklist
- **Disabled tracking**: Running high-overhead autonomous agent tasks without running `forge token on` first, rendering API spend completely invisible [3].
- **Missing or invalid budget schema**: Forgetting to define or validate `.forgewright/budget.yaml`, causing budget alerts to fail silently [1, 2].
- **Loading raw log dumps directly**: Appending raw, heavy JSONL logs into the active chat session instead of offloading summaries, resulting in immediate context window bloat [8].
- **Ignoring caching opportunities**: Overusing premium reasoning routes for routine, low-risk steps instead of leveraging context caching thresholds and Gemini 3.5 Flash routing [3, 4].
- **Non-compliant log reports**: Writing local token tracking reports under `docs/` with camelCase or spaces instead of strictly lowercase kebab-case [7].

## Worked Example

### Step 1: Ensure local token tracking is active
```bash
# Activate the built-in local token tracking system
forge token on
```
Output:
```
[SUCCESS] Local token tracking activated. All upcoming LLM API queries will be recorded.
```

### Step 2: Inspect the project budget limits
```bash
cat .forgewright/budget.yaml
```
Output:
```yaml
budget:
  monthly_limit: 100.00
  currency: USD
  alert_thresholds:
    - 0.50
    - 0.90
  providers:
    gemini:
      limit: 50.00
    anthropic:
      limit: 50.00
```

### Step 3: Fetch real-time token usage summary via API
```bash
curl -s http://localhost:3000/api/usage
```
Output:
```json
{
  "project": "forgewright-core",
  "period": "current-session",
  "input_tokens": 142050,
  "output_tokens": 38400,
  "estimated_cost_usd": 0.285,
  "warnings": []
}
```

### Step 4: Export a compliant, lowercase kebab-case usage report and sync to Obsidian
```bash
# Save cost report following standard documentation naming patterns
cat << 'EOF' > docs/05-operations/token-usage-report.md
# Token Usage & Spend Report

## Summary
- Active project: forgewright-core
- Estimated cost: $0.285 USD
- Budget status: Nominal (0.285% of monthly limit)

## Optimization Recommendations
- Maintain progressive disclosure for FluxMem V4 L2 Cognitive Graph memory.
- Enforce the 1200 token offload threshold for tool execution traces.
EOF

# Execute synchronization hook
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Symlinked docs/05-operations/token-usage-report.md to /workspace/shared-obsidian-vault/forgewright/05-operations/token-usage-report.md.
```
