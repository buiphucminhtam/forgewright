---
name: technical-writer
description: "Orchestrates documentation architecture, visualizes design specifications, and automates real-time synchronization of project codebases to Obsidian. Use when the user requests documentation creation, markdown file updates, system architecture records (ADRs), or synchronization with the Shared Obsidian Vault."
version: 1.0.0
---

# Technical Writer (LITE)

## SOLVE Step 2: GROUND (Technical Writer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Centralized Shared Obsidian Vault destination path is active or configured | `echo $OBSIDIAN_VAULT_PATH` | ... | Y/N |
| Numeric-prefixed standardized documentation directories exist under docs/ | `find docs/ -maxdepth 1 -type d \| sort` | ... | Y/N |
| Standard documentation layout templates are available for alignment | `find docs/ -name "TEMPLATE*.md"` | ... | Y/N |
| Post-skill synchronization scripts are installed and executable | `ls -la scripts/sync-obsidian.sh` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Technical Writer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Identify non-compliant filenames violating lowercase kebab-case rules under `docs/` | Ensure all filenames use strictly lowercase letters and hyphens (e.g., `api-specification.md`).
2. WRITE | Generate architecture decisions, specs, or guides utilizing standard templates | Verify that new architectural records adhere to `TEMPLATE-ADR.md` inside `docs/02-architecture/adrs/`.
3. LINK | Establish absolute symlinks from project paths into the Shared Obsidian Vault | Ensure zero duplication of physical markdown assets to prevent out-of-sync edits.
4. HOOK | Register post-commit or post-skill synchronization scripts | Validate that the local Git hook dynamically triggers synchronization whenever doc directories change.

## Common Mistakes Checklist
- **Filename Convention Violations**: Saving documentation using CamelCase, spaces, or underscores instead of strictly lowercase kebab-case (e.g., `apiSpecification.md` instead of `api-specification.md`).
- **Misplaced Directories**: Writing files directly under the root `docs/` folder instead of grouping them within the standard numeric-prefixed directories (e.g., `02-architecture/` or `04-testing/`).
- **Hard Copy Duplication**: Copying raw files physically to the Shared Obsidian Vault, causing context duplication and sync drift, instead of employing absolute symlinks.
- **Template Omission**: Creating architectural logs or technical specifications from scratch without inheriting sections from standard repository templates.
- **Unverified Broken Links**: Adding cross-document file links or relative images without verifying paths, breaking rendering on Obsidian Graph Views.

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground existing documentation directory structure and templates
```bash
find docs/ -maxdepth 2 -type d | sort
ls docs/02-architecture/adrs/TEMPLATE-ADR.md
```

### Step 2: Generate a standard, lowercase kebab-case Architectural Decision Record
```bash
cat << 'EOF' > docs/02-architecture/adrs/0004-sqlite-cognitive-graph.md
# ADR 0004: SQLite Cognitive Graph for FluxMem (Memory V4)

## Status
Accepted

## Context
JSON-based memory files lead to massive context bloat and sluggish parsing speeds in long session executions.

## Decision
We will migrate memory storage layers to an isolated SQLite database using `flux_nodes` and `flux_edges`.

## Consequences
- Sub-second execution path caching (Procedural Circuits).
- Automated ASIP edge decay and lessons indexing.
- Concurrent and transaction-safe operations.
EOF
```

