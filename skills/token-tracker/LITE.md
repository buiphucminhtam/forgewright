---
name: token-tracker
description: "Orchestrates LLM usage logging, budget alert configurations, token cost analysis, and API cost optimization tips [1, 2]. Use when the user requests token usage reports, budget audits, cost dashboards, or API cost optimization reviews."
version: 1.0.0
---

# Token Tracker (LITE)

## SOLVE Step 2: GROUND (Token Tracker Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Built-in cost control and local token tracking are activated | `forge token status` or `forge token on` | ... | Y/N |
| Active project budget configuration is established | `cat .forgewright/budget.yaml` | ... | Y/N |
| Structured token usage log directory and JSONL files exist | `ls -la ~/.forgewright/usage/` | ... | Y/N |
| Offline context caching thresholds are configured | `cat .production-grade.yaml` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Token Tracker Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Parse raw usage logs (`~/.forgewright/usage/{project}/{date}.jsonl`) | Extract input/output token counts, model types, execution latency, and financial costs [1, 2].
2. COMPARE | Map current expenditures against boundaries configured in `budget.yaml` | Trigger budget alert notifications if cumulative spending crosses warn thresholds (e.g., 90%).
3. ANALYZE | Identify premium model waste and recommend structural optimization techniques | Assess whether SHA-256 deduplication, minimal signature files, and progressive disclosure are active.
4. EXPORT | Generate a clean, kebab-case markdown usage report under `docs/05-operations/` | Verify file name compliance and execute sync hooks to propagate reports to the Shared Obsidian Vault [6, 7].

## Common Mistakes Checklist
- **Disabled tracking**: Running high-overhead autonomous agent tasks without running `forge token on` first, rendering API spend completely invisible.
- **Missing or invalid budget schema**: Forgetting to define or validate `.forgewright/budget.yaml`, causing budget alerts to fail silently [1, 2].
- **Loading raw log dumps directly**: Appending raw, heavy JSONL logs into the active chat session instead of offloading summaries, resulting in immediate context window bloat.
- **Ignoring caching opportunities**: Overusing premium reasoning routes for routine, low-risk steps instead of leveraging context caching thresholds and Gemini 3.5 Flash routing [3, 4].
- **Non-compliant log reports**: Writing local token tracking reports under `docs/` with camelCase or spaces instead of strictly lowercase kebab-case.

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ensure local token tracking is active
```bash
# Activate the built-in local token tracking system
forge token on
```

### Step 2: Inspect the project budget limits
```bash
cat .forgewright/budget.yaml
```

### Step 3: Fetch real-time token usage summary via API
```bash
curl -s http://localhost:3000/api/usage
```

