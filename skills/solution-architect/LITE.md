---
name: solution-architect
description: "Orchestrates technical system design, Architectural Decision Records (ADRs), system migration blueprints, client-server sequence mappings, and structural blast-radius analysis. Use when the user requests new microservice designs, major API overhauls, backend database transitions, system topology reviews, or ADR creation."
version: 1.0.0
---

# Solution Architect (LITE)

## SOLVE Step 2: GROUND (Solution Architect Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target project-specific tech stack and profile are active | `cat .forgewright/project-profile.json` | Identifies active programming languages, framework layers, and build status [1] | |
| Existing system architecture records, design specs, or ADRs are indexed | `find docs/02-architecture/ -name "*.md"` | Confirms location of persistent architecture files and design specs [2] | |
| GitNexus symbol database is initialized and ready for structural analysis | `gitnexus analyze --status \|\| find . -name \"*.gitnexus\"` | Verifies symbol graph database is ready to map relationships [3, 4] | |
| Active API expenditure parameters and cost ceilings are configured | `cat .forgewright/budget.yaml` | Verifies current session spend parameters and warning thresholds [5] | |

## SOLVE Step 3: DECOMPOSE (Solution Architect Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Evaluate symbol relationships, call trees, and downstream dependencies via GitNexus | Check blast radius of target functions or interfaces using `gitnexus_impact` before modifying code [4, 6].
2. DESIGN | Author standardized Architectural Decision Records (ADRs) conforming to project templates | Ensure all design selections utilize the formal `TEMPLATE-ADR.md` layout under `docs/02-architecture/adrs/` [2].
3. DIAGRAM | Trace client-to-server call flows and compile visual execution graphs | Generate clean Mermaid.js sequence charts of API routes, saving them to `docs/architecture/flows/` [7].
4. SYNC | Propagate architectural specifications and diagrams to Obsidian | Run post-skill hooks to sync documentation files via absolute symlinks in the Shared Obsidian Vault [8].

## Common Mistakes Checklist
- **Bypassing Blast Radius Audits**: Modifying shared interfaces, API models, or data structures without running `gitnexus_impact` to assess downstream breakages [4].
- **Unstructured Design Choices**: Documenting major system decisions in unstructured formats instead of compiling a formal Architectural Decision Record (ADR) using the `TEMPLATE-ADR.md` layout [2].
- **Non-Compliant File Names**: Storing architecture specifications, diagrams, or ADRs under `docs/` using CamelCase, spaces, or uppercase letters instead of strictly lowercase kebab-case (e.g., `docs/02-architecture/AuthFlow.md` instead of `docs/02-architecture/auth-flow.md`) [2].
- **Hardcoding Secrets in System Topologies**: Leaving API base URLs, developer keys, database credentials, or bearer tokens inside architecture specifications or connection configurations [9].
- **Unverified Token Budgets**: Initiating massive, recursive code call-tree mappings or complex structural audits without validating current spend caps inside `.forgewright/budget.yaml` [5, 10].

## Worked Example

### Step 1: Ground target project settings and verify GitNexus readiness
```bash
cat .forgewright/project-profile.json
gitnexus analyze --status
```
Output:
```json
{
  "project_name": "forgewright-portal",
  "tech_stack": ["React", "TypeScript", "Node.js"],
  "health_status": "PASS"
}
```
```
[SUCCESS] GitNexus database index is fresh (20,138 symbols, 28,557 relationships).
```

### Step 2: Audit structural blast-radius before making an architectural API change
```bash
gitnexus_impact --target "UserService" --direction "upstream"
```
Output:
```
[INFO] Querying symbol graph database...
[INFO] "UserService" is imported/referenced by 5 active modules.
[SUCCESS] Blast Radius Risk Level: LOW (Low risk changes permitted)
```

### Step 3: Run the Sequence Flow Generator to trace and document client-to-server calls
```bash
# Execute sequence diagram generator using GitNexus call-graph stitching
python3 scripts/sequence-flow-generator.py --src src/ --api src/app/api/
```
Output:
```
[INFO] Parsing client fetch hooks and matching server route handlers...
[SUCCESS] Generated client-to-server call sequence flow.
[INFO] Exporting diagram to docs/architecture/flows/user-auth-flow.md.
```

### Step 4: Write standard Architectural Decision Record (ADR) and trigger Shared Obsidian Vault sync
Create `docs/02-architecture/adrs/0004-use-sqlite-for-cognitive-graph.md`:
```markdown
# ADR 0004: Use SQLite for Cognitive Graph Memory

## Status
Accepted

## Context
JSON-based memory storage causes high parsing latencies and context bloat during long-running sessions.

## Decision
We will transition the Layer 2 Cognitive Graph memory system to an isolated SQLite architecture (flux_nodes and flux_edges).

## Consequences
- Crash-safe concurrent operations are guaranteed.
- Memory access scales to sub-second retrieval times.
- Eliminates JSON file parsing overhead completely.
```

```bash
# Run post-skill synchronization script
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for user-auth-flow.md and 0004-use-sqlite-for-cognitive-graph.md.
[SUCCESS] Symlinked docs/02-architecture/adrs/0004-use-sqlite-for-cognitive-graph.md to /workspace/shared-obsidian-vault/forgewright/02-architecture/adrs/0004-use-sqlite-for-cognitive-graph.md.
```
