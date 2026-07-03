---
name: notebooklm-researcher
description: "Orchestrates AI-grounded deep research, source ingestion, and automated synthesis using NotebookLM and Polymath engines. Use when the user requests deep technical research, academic synthesis, RAG pipeline evaluation, or when a task triggers the mandatory Research Gate after two consecutive failures."
version: 1.0.0
---

# Notebooklm Researcher (LITE)

## SOLVE Step 2: GROUND (Notebooklm Researcher Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| NotebookLM CLI utility is installed and responsive | `nlm --version` | Verifies nlm compiler and CLI version configurations | |
| Session tracker exists to monitor attempt counts | `ls -la scripts/forgewright-session-tracker.sh` | Confirms session tracker is present to monitor failure triggers | |
| Active lessons log exists under the local state directory | `cat .forgewright/lessons.md` | Locates central markdown file for writing learned behaviors | |
| Spend limits and API token tracking are configured | `cat .forgewright/budget.yaml` | Displays current spend bounds and provider configurations | |

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
- **Unbounded web crawls**: Initiating deep web queries without verifying spend limits in `.forgewright/budget.yaml` or turning on local token tracking.
- **Non-compliant naming conventions**: Saving compiled research summaries under `docs/` using CamelCase, spaces, or uppercase letters instead of strictly lowercase kebab-case.

## Worked Example

### Step 1: Verify the NotebookLM CLI and active budget configurations
```bash
nlm --version
cat .forgewright/budget.yaml
```
Output:
```
NotebookLM CLI Tool (nlm) v2.4.0
budget: 15.00
currency: USD
```

### Step 2: Execute automated Research Gate sequence on complex task failure
```bash
# Simulating tracker recording 2 failed attempts and triggering the Research Gate
./scripts/forgewright-session-tracker.sh --record-failure --task "optimize-sqlite-cache"
```
Output:
```
[WARNING] 2 consecutive failures detected for task: 'optimize-sqlite-cache'.
[INFO] Activating mandatory Research Gate (v8.4.0)...
[INFO] Querying local notebook context...
[SUCCESS] Ingested 4 relevant grounding passages.
```

### Step 3: Execute nlm research query and run skeptic agent calibration
```bash
nlm query "SQLite write-ahead logging performance parameters" --calibrate
```
Output:
```
[SUCCESS] Research synthesis complete.
[SKEPTIC] Calculating calibration metrics:
  - Expected Calibration Error (ECE): 0.04 (PASS, threshold < 0.10)
  - Extracted Grounded Citations: 5
```

### Step 4: Write distilled findings to local lessons and sync with Obsidian Vault
```bash
cat << 'EOF' >> .forgewright/lessons.md

## Lesson: SQLite Write-Ahead Logging Optimization
- **Problem**: Large database transactions trigger concurrent execution lockups.
- **Solution**: Activating WAL mode (`PRAGMA journal_mode=WAL;`) decreases lock contention and provides sub-second execution path caching. [1, 2]
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Appended new heuristics to .forgewright/lessons.md.
[SUCCESS] Symlinked .forgewright/lessons.md to /workspace/shared-obsidian-vault/forgewright/lessons.md.
```
