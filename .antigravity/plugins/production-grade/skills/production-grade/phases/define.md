# DEFINE Phase — Dispatcher

This phase manages tasks T1 (Product Manager), T1.5 (UI Designer, conditional), and T2 (Solution Architect). Sequential execution with Gate 1 and Gate 2.

## Pre-Flight

Read `.production-grade.yaml` for path overrides:
- `paths.brd` → BRD output location (default: `.forgewright/product-manager/BRD/`)
- `paths.api_contracts` → API contract location (default: `api/openapi/*.yaml`)
- `paths.adrs` → ADR location (default: `docs/architecture/architecture-decision-records/`)
- `paths.architecture_docs` → Architecture docs (default: `docs/architecture/`)
- `features.ui_design` → if false, skip T1.5 (default: true for full builds)

## T0.5: Business Analyst — Requirements Validation (Conditional)

**Activation:** Runs if the orchestrator's BA pre-flight check (Step 7.5) detected information gaps (6W1H score < 6/7). Skip if requirements are already complete or user explicitly skipped BA.

```
Update task.md: T0.5 status → in_progress

Read skills/business-analyst/SKILL.md and follow its instructions.
Context:
- Read polymath context from: .forgewright/polymath/handoff/context-package.md
- Read codebase context from: .forgewright/codebase-context.md
- Write BA outputs to: .forgewright/business-analyst/
- Key output: handoff/ba-package.md (feeds into PM)
```

The business-analyst skill will:
1. Discover stakeholders (Phase 1)
2. Structured elicitation using 6W1H framework (Phase 2)
3. Critical evaluation — challenge assumptions, detect contradictions, assess feasibility (Phase 3)
4. Information Gate — completeness check before handoff (Phase 4)
5. Outputs: `stakeholder-analysis.md`, `requirements-register.md`, `feasibility-assessment.md`, `ba-package.md`

**On completion:**
```
Update task.md: T0.5 status → completed
```

## T1: Product Manager — BRD

Mark task in progress and execute the product-manager skill (needs user interaction for CEO interview):

```
Update task.md: T1 status → in_progress
Read skills/product-manager/SKILL.md and follow its instructions.
```

The product-manager skill will:
1. **Check for BA package** — if `.forgewright/business-analyst/handoff/ba-package.md` exists, use it to reduce CEO interview
2. Research domain via search_web (skip if BA or Polymath already researched)
3. Conduct CEO interview (depth reduced if BA package covers gaps)
4. Write BRD to `.forgewright/product-manager/BRD/`
5. Outputs: `brd.md`, `research-notes.md`, `constraints.md`

**On completion:**
```
Update task.md: T1 status → completed
```

### Gate 1 — BRD Approval

Present Gate 1 using the orchestrator's gate pattern. On approval, unblock T1.5 (or T2 if UI design is skipped).

**Memory save (Gate 1):**
```bash
python3 scripts/mem0-cli.py add "Gate 1 approved: BRD for [project]. Key decisions: [list top 3]" --category decisions
```

If user selects "I have changes" → iterate on BRD, re-present Gate 1.
If user selects "Show BRD details" → display BRD, re-present Gate 1.

## T1.5: UI Designer — Design System & Wireframes (Conditional)

**Activation:** Runs if `features.ui_design` is true (default) OR if BRD contains UI/frontend requirements. Skip if project is backend-only (API, CLI, library).

```
Update task.md: T1.5 status → in_progress

Read skills/ui-designer/SKILL.md and follow its instructions.
Context:
- Read BRD from: .forgewright/product-manager/BRD/
- Read protocols from: skills/_shared/protocols/
- Write design specs to: .forgewright/ui-designer/
- Write design tokens to: docs/design/design-tokens.json
- Outputs: design-brief.md, wireframes/, design-tokens.md, component-inventory.md, interaction-patterns.md

Update task.md: T1.5 status → completed
```

The UI Designer provides design specifications that the Frontend Engineer and Mobile Engineer consume during the BUILD phase.

## T2: Solution Architect — Architecture

```
Update task.md: T2 status → in_progress
Read skills/solution-architect/SKILL.md and follow its instructions.
```

The solution-architect skill will:
1. Read BRD from `.forgewright/product-manager/BRD/`
2. Read design specs from `.forgewright/ui-designer/` (if T1.5 ran)
3. Design architecture: ADRs, tech stack, system design
4. Design API contracts (OpenAPI 3.1), data model (ERD), migrations
5. Generate project scaffold
6. Write deliverables to **project root**: `api/`, `schemas/`, `docs/architecture/`
7. Write workspace artifacts to `.forgewright/solution-architect/`

**On completion:**
```
Update task.md: T2 status → completed
```

### Gate 2 — Architecture Approval

Present Gate 2 using the orchestrator's gate pattern. On approval, proceed to BUILD phase.

## Handoff to BUILD

After Gate 2 approval:
1. Verify architecture outputs exist at project root (`api/`, `schemas/`, `docs/architecture/`)
2. If T1.5 ran, verify design outputs exist (`docs/design/design-tokens.json`)
3. Log decisions to `.forgewright/decisions-log.md`
4. Read `phases/build.md` and begin BUILD phase

## Failure Handling

- If PM cannot gather enough requirements → escalate to user
- If UI Designer lacks sufficient BRD context → proceed with minimal design, flag gaps
- If Architect finds contradictions in BRD → flag to user, do not silently resolve
- Each skill self-debugs before escalating
