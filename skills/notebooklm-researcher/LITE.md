---
name: notebooklm-researcher
description: "Orchestrates AI-grounded deep research, source ingestion, and automated synthesis using NotebookLM and Polymath engines. Use when the user requests deep technical research, academic synthesis, RAG pipeline evaluation, or when a task triggers the mandatory Research Gate after two consecutive failures."
version: 1.0.0
---

# Notebooklm Researcher (LITE)

## SOLVE Step 2: GROUND (Notebooklm Researcher Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| NotebookLM CLI utility is installed and responsive | `nlm --version` | ... | Y/N |
| Session tracker exists to monitor attempt counts | `ls -la scripts/forgewright-session-tracker.sh` | ... | Y/N |
| Active lessons log exists under the local state directory | `cat .forgewright/lessons.md` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Notebooklm Researcher Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. EVALUATE | Check consecutive failures in the session tracker | If failures >= 2, intercept pipeline execution and force the activation of the Research Gate.
2. INGEST | Run local `nlm` query against notebook sources with Web Search fallback | Extract relevant grounding passages and query web search APIs if local sources are thin.
3. SYNTHESIZE | Apply skeptic agent filtering, compute confidence scores, and extract citations | Enforce Expected Calibration Error (ECE) < 0.10 to prevent AI hallucinations.
4. INTEGRATE | Save distilled lessons under `.forgewright/lessons.md` and trigger sync | Run the post-skill hooks to symlink generated documentation to the Shared Obsidian Vault.

## Common Mistakes Checklist
- **Skipping CLI verification**: Attempting deep research workflows without validating `nlm` compiler installation, leading to silent tool failures.
- **Accepting uncalibrated outputs**: Accepting synthesis reports with high hallucination risk (ECE >= 0.10) or missing explicit citations.
- **Bypassing the failure tracker**: Resolving pipeline failures manually without updating `forgewright-session-tracker.sh`, preventing the orchestrator from learning.
- **Non-compliant naming conventions**: Saving compiled research summaries under `docs/` using CamelCase, spaces, or uppercase letters instead of strictly lowercase kebab-case.

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Verify the NotebookLM CLI and active budget configurations
```bash
nlm --version
cat .forgewright/budget.yaml
```

### Step 2: Execute automated Research Gate sequence on complex task failure
```bash
# Simulating tracker recording 2 failed attempts and triggering the Research Gate
./scripts/forgewright-session-tracker.sh --record-failure --task "optimize-sqlite-cache"
```

### Step 3: Execute nlm research query and run skeptic agent calibration
```bash
nlm query "SQLite write-ahead logging performance parameters" --calibrate
```

