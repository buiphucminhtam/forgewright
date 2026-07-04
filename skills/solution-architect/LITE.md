---
name: solution-architect
description: "Orchestrates technical system design, Architectural Decision Records (ADRs), system migration blueprints, client-server sequence mappings, and structural blast-radius analysis. Use when the user requests new microservice designs, major API overhauls, backend database transitions, system topology reviews, or ADR creation."
version: 1.0.0
---

# Solution Architect (LITE)

## SOLVE Step 2: GROUND (Solution Architect Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Target project-specific tech stack and profile are active | `cat .forgewright/project-profile.json` | ... | run the check command and paste output |
| Existing system architecture records, design specs, or ADRs are indexed | `find docs/02-architecture/ -name "*.md"` | ... | run the check command and paste output |
| GitNexus symbol database is initialized and ready for structural analysis | `gitnexus analyze --status \|\| find . -name \"*.gitnexus\"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Solution Architect Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Evaluate symbol relationships, call trees, and downstream dependencies via GitNexus | Check blast radius of target functions or interfaces using `gitnexus_impact` before modifying code.
2. DESIGN | Author standardized Architectural Decision Records (ADRs) conforming to project templates | Ensure all design selections utilize the formal `TEMPLATE-ADR.md` layout under `docs/02-architecture/adrs/`.
3. DIAGRAM | Trace client-to-server call flows and compile visual execution graphs | Generate clean Mermaid.js sequence charts of API routes, saving them to `docs/architecture/flows/`.

## Common Mistakes Checklist
- **Bypassing Blast Radius Audits**: Modifying shared interfaces, API models, or data structures without running `gitnexus_impact` to assess downstream breakages.
- **Unstructured Design Choices**: Documenting major system decisions in unstructured formats instead of compiling a formal Architectural Decision Record (ADR) using the `TEMPLATE-ADR.md` layout.
- **Non-Compliant File Names**: Storing architecture specifications, diagrams, or ADRs under `docs/` using CamelCase, spaces, or uppercase letters instead of strictly lowercase kebab-case (e.g., `docs/02-architecture/AuthFlow.md` instead of `docs/02-architecture/auth-flow.md`).
- **Hardcoding Secrets in System Topologies**: Leaving API base URLs, developer keys, database credentials, or bearer tokens inside architecture specifications or connection configurations.

### Step 1: Ground target project settings and verify GitNexus readiness
```bash
cat .forgewright/project-profile.json
gitnexus analyze --status
```

### Step 2: Audit structural blast-radius before making an architectural API change
```bash
gitnexus_impact --target "UserService" --direction "upstream"
```

### Step 3: Run the Sequence Flow Generator to trace and document client-to-server calls
```bash
# Execute sequence diagram generator using GitNexus call-graph stitching
python3 scripts/sequence-flow-generator.py --src src/ --api src/app/api/
```
