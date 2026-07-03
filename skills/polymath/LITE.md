---
name: polymath
description: "Orchestrates multi-source technical research, academic RAG synthesis, semantic cross-referencing, and literature analysis. Use when the user requests RAG evaluations, documentation analysis, cross-source synthesis, or deep technical reviews."
version: 1.0.0
---

# Polymath (LITE)

## SOLVE Step 2: GROUND (Polymath Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target documentation, source articles, or RAG assets are indexed | `find docs/ -name "*.md" \| sort` | Confirms location of input Markdown source materials | |
| Local NotebookLM compiler or CLI tools are installed and active | `nlm --version` | Verifies RAG-grounded indexer availability | |
| Standardized spec templates exist for output structuring | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs | |
| Active session spend trackers and token budget thresholds are configured | `cat .forgewright/budget.yaml` | Displays current spend bounds to restrict autonomous RAG queries | |

## SOLVE Step 3: DECOMPOSE (Polymath Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. INGEST | Scan and validate target research inputs, schemas, or raw markdown repositories | Verify input files conform to standard folder structures and lowercase kebab-case naming limits.
2. SYNTHESIZE | Execute multi-source semantic cross-referencing and RAG retrieval queries | Ensure compiled conclusions are strictly grounded in source passages with explicit citations.
3. CRITIQUE | Run the Skeptic Agent confidence scorer and error calibrations on compiled logs | Validate that output calibrations meet Expected Calibration Error (ECE) metrics of `< 0.10`.
4. SYNC | Propagate distilled research logs to `docs/05-operations/` and trigger sync hook | Run standard post-skill sync scripts to establish absolute symlinks to Obsidian.

## Common Mistakes Checklist
- **Missing Citation Mappings**: Delivering compiled research or answering deep queries without specific, traceable citation links, violating core source-grounding rules.
- **Context Window Flooding**: Parsing massive raw source transcripts or entire PDFs directly into the chat context instead of using progressive summaries or offloading traces.
- **Skeptic Gate Bypass**: Accepting synthesis reports that skip confidence scoring, allowing uncalibrated or hallucinated model outputs to pass.
- **Non-Compliant Document Naming**: Storing research logs, findings, or bibliographies under `docs/` using CamelCase, spaces, or uppercase naming patterns instead of strictly lowercase kebab-case (e.g., `RAG-analysis.md` instead of `rag-analysis.md`).
- **Unverified AI Token Spending**: Triggering large-scale recursive web search queries without checking token tracker configurations in `.forgewright/budget.yaml`.

## Worked Example

### Step 1: Ground RAG files and CLI tooling
```bash
nlm --version
cat .forgewright/project-profile.json
```
Output:
```
NotebookLM CLI Tool (nlm) v2.4.0
{
  "project_name": "forgewright-research-workspace",
  "tech_stack": ["NotebookLM", "Polymath", "Markdown"],
  "health_status": "PASS"
}
```

### Step 2: Query the integrated local database for specialized technical analysis
```bash
nlm query "SQLite Cognitive Graph vs JSON Memory performance thresholds" --calibrate
```
Output:
```
[SUCCESS] Query execution complete.
[SKEPTIC] Calculating calibration metrics:
  - Expected Calibration Error (ECE): 0.05 (PASS, threshold < 0.10)
  - Extracted Grounded Citations: 4
```

### Step 3: Compile findings into a compliant, lowercase kebab-case report under `docs/05-operations/`
```bash
cat << 'EOF' > docs/05-operations/sqlite-vs-json-memory-audit.md
# SQLite Cognitive Graph vs JSON Memory Performance Audit

## 1. Executive Summary
Comparative analysis of memory scaling patterns in long-running AI sessions [1].

## 2. Core Metrics
- JSON Memory: Severe context bloat, parsing latency grows O(N^2) on long sessions [2].
- SQLite (Memory V4): Sub-second retrieval, transactional safety, and concurrent-safe storage [1, 3].

## 3. Grounded References
- [1] .forgewright/memory-bank/persona.md
- [2] docs/02-architecture/adrs/0004-sqlite-cognitive-graph.md
- [3] .forgewright/lessons.md
EOF
```

### Step 4: Synchronize compiled research outputs to the central Shared Obsidian Vault
```bash
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for sqlite-vs-json-memory-audit.md.
[SUCCESS] Symlinked docs/05-operations/sqlite-vs-json-memory-audit.md to /workspace/shared-obsidian-vault/forgewright/05-operations/sqlite-vs-json-memory-audit.md.
```
