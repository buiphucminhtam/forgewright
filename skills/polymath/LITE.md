---
name: polymath
description: "Orchestrates multi-source technical research, academic RAG synthesis, semantic cross-referencing, and literature analysis. Use when the user requests RAG evaluations, documentation analysis, cross-source synthesis, or deep technical reviews."
version: 1.0.0
---

# Polymath (LITE)

## SOLVE Step 2: GROUND (Polymath Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Target documentation, source articles, or RAG assets are indexed | `find docs/ -name "*.md" \| sort` | ... | run the check command and paste output |
| Local NotebookLM compiler or CLI tools are installed and active | `nlm --version` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Polymath Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. INGEST | Scan and validate target research inputs, schemas, or raw markdown repositories | Verify input files conform to standard folder structures and lowercase kebab-case naming limits.
2. SYNTHESIZE | Execute multi-source semantic cross-referencing and RAG retrieval queries | Ensure compiled conclusions are strictly grounded in source passages with explicit citations.
3. CRITIQUE | Run the Skeptic Agent confidence scorer and error calibrations on compiled logs | Validate that output calibrations meet Expected Calibration Error (

## Common Mistakes Checklist
- **Missing Citation Mappings**: Delivering compiled research or answering deep queries without specific, traceable citation links, violating core source-grounding rules.
- **Context Window Flooding**: Parsing massive raw source transcripts or entire PDFs directly into the chat context instead of using progressive summaries or offloading traces.
- **Skeptic Gate Bypass**: Accepting synthesis reports that skip confidence scoring, allowing uncalibrated or hallucinated model outputs to pass.
- **Non-Compliant Document Naming**: Storing research logs, findings, or bibliographies under `docs/` using CamelCase, spaces, or uppercase naming patterns instead of strictly lowercase kebab-case (e.g., `RAG-analysis.md` instead of `rag-analysis.md`).

### Step 1: Ground RAG files and CLI tooling
```bash
nlm --version
cat .forgewright/project-profile.json
```

### Step 2: Query the integrated local database for specialized technical analysis
```bash
nlm query "SQLite Cognitive Graph vs JSON Memory performance thresholds" --calibrate
```

### Step 3: Compile findings into a compliant, lowercase kebab-case report under `docs/05-operations/`
```bash
cat << 'EOF' > docs/05-operations/sqlite-vs-json-memory-audit.md
# SQLite Cognitive Graph vs JSON Memory Performance Audit

## 1. Executive Summary
Comparative analysis of memory scaling patterns in long-running AI sessions.

## 2. Core Metrics
- JSON Memory: Severe context bloat, parsing latency grows O(N^2) on long sessions.
- SQLite (Memory V4): Sub-second retrieval, transactional safety, and concurrent-safe storage [1, 3].

## 3. Grounded References
- .forgewright/memory-bank/persona.md
- docs/02-architecture/adrs/0004-sqlite-cognitive-graph.md
- .forgewright/lessons.md
EOF
```
