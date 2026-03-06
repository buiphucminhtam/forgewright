---
name: production-grade
description: >
  Orchestrates software engineering work — build apps, add features,
  fix bugs, refactor code, review PRs, write tests, deploy services,
  audit security, design architecture, generate docs, optimize performance,
  debug issues, or explore ideas. Any coding or development request gets
  routed to the right specialized skills automatically.
---

# Production Grade

!`git status 2>/dev/null || echo "No git repo detected"`
!`cat ANTIGRAVITY.md 2>/dev/null || echo "No ANTIGRAVITY.md found"`
!`ls Antigravity-Production-Grade-Suite/ 2>/dev/null || echo "No existing workspace"`
!`cat .production-grade.yaml 2>/dev/null || echo "No config file — defaults apply"`

## Overview

Adaptive meta-skill orchestrator for all software engineering work. Analyzes the user's request, identifies which skills are needed, builds a minimal task graph, and executes — from a single code review to a full 14-skill greenfield build.

**14 skills, one orchestrator.** The orchestrator routes to the right skills based on what the user actually needs. No forced full-pipeline execution for everyday tasks.

**All skills are bundled in this plugin. Single install, everything included.**

## When to Use

- Building a new SaaS, platform, or service from scratch (full pipeline)
- Adding a feature to an existing codebase
- Hardening code before launch (security + QA + review)
- Setting up CI/CD, Docker, Terraform for existing code
- Writing tests for existing code
- Reviewing code quality or architecture conformance
- Designing architecture or API contracts
- Writing documentation for existing systems
- Performance optimization or reliability engineering
- Any task that benefits from structured, production-quality execution
- User says "build me a...", "add [feature]", "review my code", "set up CI/CD", "write tests", "harden this", "document this"

## Request Classification

Before any execution, classify the user's request into a mode. This determines which skills run and how.

**Step 1 — Analyze the request:**

Read `$ARGUMENTS` and the user's message. Classify into one of these modes:

| Mode | Trigger Signals | Skills Involved |
|------|----------------|-----------------|
| **Full Build** | "build a SaaS", "production grade", "from scratch", "full stack", greenfield intent | All 14 skills, full DEFINE→BUILD→HARDEN→SHIP→SUSTAIN pipeline |
| **Feature** | "add [feature]", "implement [feature]", "new endpoint", "new page", "integrate [service]" | PM (scoped) → Architect (scoped) → BE/FE → QA |
| **Harden** | "review", "audit", "secure", "harden", "before launch", "production ready" (on EXISTING code) | Security + QA + Code Review (sequential) → Remediation |
| **Ship** | "deploy", "CI/CD", "containerize", "infrastructure", "terraform", "docker" | DevOps → SRE |
| **Test** | "write tests", "test coverage", "test this", "add tests" | QA |
| **Review** | "review my code", "code review", "code quality", "check my code" | Code Reviewer |
| **Architect** | "design", "architecture", "API design", "data model", "tech stack", "how should I structure" | Solution Architect |
| **Document** | "document", "write docs", "API docs", "README" | Technical Writer |
| **Explore** | "explain", "understand", "help me think", "what should I", "I'm not sure" | Polymath |
| **Optimize** | "performance", "slow", "optimize", "scale", "reliability" | SRE + Code Reviewer |
| **Custom** | Doesn't fit above patterns | Present skill menu, let user pick |

**Step 2 — Present or skip the plan:**

**Single-skill modes** (Test, Review, Architect, Document, Explore): Skip plan presentation. Classify → invoke immediately. The intent is obvious — no overhead needed.

**Multi-skill modes** (Feature, Harden, Ship, Optimize, Custom): Present the plan for confirmation via notify_user:

```
Here's my plan:

[numbered list of skills and what each does]

Scope: [light / moderate / heavy]

1. **Looks good — start (Recommended)** — Execute this plan
2. **I want the full production-grade pipeline** — Run all 14 skills, 5 phases, 3 gates
3. **Adjust the plan** — Add or remove skills from the plan
4. **Chat about this** — Free-form input
```

**Full Build mode**: Always proceed to the Full Build Pipeline section below.

If the user selects "full pipeline" from any mode, switch to Full Build.

**Step 3 — Execute the mode:**

For non-Full-Build modes, use the lightweight execution flows below. For Full Build, use the Full Build Pipeline.

## Mode Execution (Non-Full-Build)

All modes share these behaviors:
- Bootstrap workspace: `mkdir -p Antigravity-Production-Grade-Suite/.protocols/ Antigravity-Production-Grade-Suite/.orchestrator/`
- Write shared protocols (same as Full Build step 3)
- Read `.production-grade.yaml` for path overrides
- Read existing workspace state if present
- Engagement mode: ask ONLY if mode involves 3+ skills. For 1-2 skill modes, use Standard engagement + Sequential execution.

### Feature Mode

Add a feature to an existing codebase. Lightweight DEFINE → BUILD → TEST.

1. **Codebase scan** — read existing code structure, framework, patterns
2. **PM (Express depth)** — 2-3 questions to scope the feature. Write a mini-BRD (user stories + acceptance criteria for this feature only)
3. **Architect (scoped)** — design how this feature fits the existing architecture. New endpoints, schema changes, component additions. NOT a full system redesign.
4. **Build** — Software Engineer and/or Frontend Engineer implement the feature
5. **Test** — QA writes and runs tests for the new feature
6. **Optional: Review** — Code Reviewer checks the new code against existing patterns

**1 gate:** After PM scoping (step 2), confirm scope before building.

### Harden Mode

Security + quality audit on existing code. No building, pure analysis + fixes.

1. **Codebase scan** — read all existing code
2. **Sequential:** Security Engineer → QA Engineer → Code Reviewer analyze the code
3. **Consolidated findings** — merge all findings, deduplicate, sort by severity
4. **Present findings** — show Critical/High/Medium/Low counts with top issues
5. **Remediation** — fix Critical and High issues (with user confirmation)

**1 gate:** After findings (step 4), before remediation.

### Ship Mode

Get existing code deployed. Infrastructure + reliability.

1. **Codebase scan** — read existing code, identify services, dependencies
2. **DevOps** — Dockerfiles, CI/CD pipelines, IaC (Terraform/Pulumi), monitoring
3. **SRE** — SLO definitions, runbooks, alerting, chaos experiment plan

**1 gate:** After DevOps infra plan, before applying.

### Test Mode

Write tests for existing code. Single skill.

1. Read skills/qa-engineer/SKILL.md and follow its instructions against existing code
2. QA reads code, writes test plan, implements tests, runs them
3. Report results

**0 gates.** QA operates autonomously.

### Review Mode

Code quality review. Single skill, read-only.

1. Read skills/code-reviewer/SKILL.md and follow its instructions
2. Review produces findings report
3. Present findings with severity distribution

**0 gates.** Read-only operation.

### Architect Mode

Design or redesign architecture. Single skill.

1. Read skills/solution-architect/SKILL.md and follow its instructions
2. Full discovery interview (depth based on engagement mode)
3. Produces ADRs, diagrams, tech stack, API contracts, scaffold

**1 gate:** Architecture approval before scaffold generation.

### Document Mode

Generate documentation for existing code. Single skill.

1. Read skills/technical-writer/SKILL.md and follow its instructions
2. Reads all code + existing docs
3. Generates API reference, dev guides, architecture overview

**0 gates.** Technical Writer operates autonomously.

### Explore Mode

Thinking partner. Single skill.

1. Read skills/polymath/SKILL.md and follow its instructions
2. Research, advise, ideate — whatever the user needs
3. When ready, offer to hand off to any other mode

**0 gates.** Polymath manages its own dialogue.

### Optimize Mode

Performance + reliability analysis. Two skills.

1. **Code Reviewer** — identify performance anti-patterns, N+1 queries, memory leaks
2. **SRE** — capacity analysis, scaling bottlenecks, SLO evaluation
3. **Consolidated report** — performance findings + reliability recommendations
4. **Remediation** — fix top issues

**1 gate:** After analysis, before fixes.

### Custom Mode

User picks skills from a menu. Present via notify_user:

```
Which skills do you need? (list the numbers separated by commas)

1. **Product Manager** — Requirements, user stories, BRD
2. **Solution Architect** — System design, API contracts, tech stack
3. **Software Engineer** — Backend implementation
4. **Frontend Engineer** — UI components, pages, design system
5. **QA Engineer** — Tests — unit, integration, e2e, performance
6. **Security Engineer** — OWASP audit, STRIDE, vulnerability scan
7. **Code Reviewer** — Architecture conformance, code quality
8. **DevOps** — Docker, CI/CD, Terraform, monitoring
9. **SRE** — SLOs, chaos engineering, runbooks
10. **Technical Writer** — API docs, dev guides, architecture docs
11. **Data Scientist** — LLM optimization, ML pipelines, experiments
12. **Chat about this** — Free-form input
```

Execute selected skills in dependency order. If user picks conflicting skills, resolve via the authority hierarchy.

## Auto-Update Check

Run BEFORE any execution (all modes). Silent if current. One prompt max if update exists.

**Step 0 — version check:**

1. Check current version from plugin metadata
2. Use `read_url_content` to fetch `https://raw.githubusercontent.com/antigravity-code/antigravity-code-production-grade-plugin/main/.antigravity-plugin/plugin.json` → extract `version` (this is the remote version)
3. **If fetch fails** (offline, timeout, 404) → silently continue. Never block the pipeline over an update check.
4. **If remote ≤ local** → continue silently (user sees nothing)
5. **If remote > local** → prompt via notify_user:

```
production-grade v{remote} is available (you have v{local})

1. **Update to v{remote} (Recommended)** — Auto-update and restart pipeline
2. **Skip — continue with v{local}** — Use current version
```

6. **If skip** → continue pipeline with current version
7. **If update** → execute in sequence:
   ```bash
   git clone --depth 1 https://github.com/antigravity-code/antigravity-code-production-grade-plugin.git /tmp/pg-update
   ```
   - Copy updated files to the skills directory
   - Clean up: `rm -rf /tmp/pg-update`
   - Print: `✓ Updated to v{remote_version}. Re-invoke /production-grade to use the new version.`
   - **STOP** — do not continue pipeline. The user must re-invoke to pick up new content.

**If any update step fails**, print a warning and continue with the current version. Never let the updater break the pipeline.

## Full Build Pipeline

When mode is **Full Build**, follow this EXACT sequence:

1. **Print kickoff banner:**
```
━━━ Production Grade Pipeline v{local_version} ━━━━━━━━━━━━━━━━━━
Project: [extracted from user's message]
⧖ Bootstrapping workspace...
```

2. **Bootstrap workspace:**
```bash
mkdir -p Antigravity-Production-Grade-Suite/.protocols/
mkdir -p Antigravity-Production-Grade-Suite/.orchestrator/
```

3. **Write shared protocols** to `Antigravity-Production-Grade-Suite/.protocols/`:

| Protocol File | Content |
|---------------|---------|
| `ux-protocol.md` | 6 UX rules: never open-ended questions, "Chat about this" last, recommended first, continuous execution, real-time progress, autonomy |
| `input-validation.md` | 5-step validation: read config → probe inputs in parallel → classify Critical/Degraded/Optional → print gap summary → adapt scope |
| `tool-efficiency.md` | Parallel tool calls, view_file_outline before view_file, find_by_name not find, grep_search not grep, config-aware paths |
| `conflict-resolution.md` | Authority hierarchy, dedup by file:line (keep highest severity), HARDEN→BUILD feedback loops (2 cycle max) |

Read these from the plugin's `skills/_shared/protocols/` directory and copy them. If plugin path is unavailable, write from the summaries above.

4. **Codebase discovery — detect greenfield vs brownfield:**

   Run these scans in parallel:
   ```
   find_by_name("package.json"), find_by_name("go.mod"), find_by_name("pyproject.toml"), find_by_name("Cargo.toml"), find_by_name("pom.xml")
   find_by_name("*", "src/"), find_by_name("*", "services/"), find_by_name("*", "frontend/"), find_by_name("*", "tests/"), find_by_name("*", "docs/")
   find_by_name("Dockerfile*"), find_by_name("*", ".github/workflows/"), find_by_name("*", "infrastructure/"), find_by_name("*", "terraform/")
   find_by_name(".production-grade.yaml")
   ```

   **Classify the project:**

   | Signal | Mode | Behavior |
   |--------|------|----------|
   | Empty/new directory, no source files | **Greenfield** | Create everything from scratch |
   | Source files exist, no `.production-grade.yaml` | **Brownfield (unmapped)** | Discover structure, generate config, adapt |
   | Source files + `.production-grade.yaml` exist | **Brownfield (mapped)** | Use config paths, augment existing code |

   **If Greenfield** → log `✓ Greenfield project — creating from scratch` and continue to step 5.

   **If Brownfield** → run the adaptation sequence:

   a. **Structure report** — scan and summarize what exists:
   ```
   ⧖ Existing codebase detected. Scanning structure...
   Language: [detected from package.json/go.mod/etc.]
   Framework: [detected from dependencies]
   Directories found: src/, tests/, docs/, .github/workflows/
   Files: [N] source files, [N] test files, [N] config files
   ```

   b. **Path mapping** — if no `.production-grade.yaml`, generate one from discovered structure. Notify user via notify_user:

   ```
   I've detected an existing codebase. Here's what I found:

   [structure summary]

   I'll map the pipeline outputs to your existing structure.

   1. **Approve mapping (Recommended)** — Use detected paths, generate .production-grade.yaml
   2. **Customize paths** — Review and adjust the path mapping
   3. **Treat as greenfield** — Ignore existing code, create fresh structure
   4. **Chat about this** — Discuss how the pipeline adapts to your codebase
   ```

   c. **Write `.production-grade.yaml`** from discovered structure — map `paths.*` to actual directories found.

   d. **Set brownfield context** — write to `Antigravity-Production-Grade-Suite/.orchestrator/codebase-context.md`:
   ```markdown
   # Codebase Context
   Mode: brownfield
   Language: [detected]
   Framework: [detected]
   Existing paths: [mapping]

   ## Rules for all agents
   - NEVER overwrite existing files without explicit user approval
   - READ existing code patterns before writing new code
   - MATCH existing code style (naming, formatting, structure)
   - ADD to existing directories, don't replace them
   - If a file exists at the target path, create alongside it or extend it
   - Existing tests must still pass after changes
   ```

   All skills read this file before executing. It overrides default "create from scratch" behavior.

5. **Engagement mode:**

Notify user via notify_user:

```
How deeply should the pipeline involve you in decisions?

1. **Standard (Recommended)** — 3 gates + moderate architect interview. Best balance of speed and control.
2. **Express** — Minimal interaction. 3 gates only, auto-derive architecture from BRD. Fastest.
3. **Thorough** — Deep interviews at PM and Architect. Full capacity planning. Review phase summaries.
4. **Meticulous** — Maximum depth. Approve each ADR individually. Review every agent output. Full control.
```

Write the choice to `Antigravity-Production-Grade-Suite/.orchestrator/settings.md`:
```markdown
# Pipeline Settings
Engagement: [express|standard|thorough|meticulous]
```

All skills read this file at startup to adapt their depth. The engagement mode controls:
- **PM interview depth** — Express: 2-3 questions. Standard: 3-5. Thorough: 5-8. Meticulous: 8-12.
- **Architect discovery depth** — Express: auto-derive. Standard: 5-7 questions. Thorough: 12-15 with capacity planning. Meticulous: full walkthrough + individual ADR approval.
- **Phase summaries** — Thorough/Meticulous show intermediate outputs between phases.
- **Gate detail** — Meticulous adds per-skill output review at each gate.

6. **Detect existing workspace** — if `Antigravity-Production-Grade-Suite/.orchestrator/` has prior state, offer to resume or restart via notify_user.

7. **Polymath pre-flight check:**
   - If `Antigravity-Production-Grade-Suite/polymath/handoff/context-package.md` exists → read it, pass to PM as pre-loaded context. Log: `✓ Polymath context loaded — skipping redundant discovery`
   - If no polymath context, assess the user's request for knowledge gaps:
     - **Vague scope** (no specific problem domain), **no constraints** (scale, budget, team), **complex domain with no domain language**, **contradictory signals**
     - If gaps detected → read `skills/polymath/SKILL.md` and follow its instructions for pre-flight consultation before proceeding. The polymath will research, clarify with the user, and write a context package when ready.
     - If no gaps → proceed directly. Log: `✓ Request is clear — proceeding to PM`
   - If user explicitly requests to skip polymath ("just build it", clear detailed spec) → proceed immediately.

8. **Research the domain** — use search_web before asking the user anything (skip if polymath already researched).

9. **Create task tracking:**

Create a `task.md` file in `Antigravity-Production-Grade-Suite/.orchestrator/` with all 13 tasks and their statuses. Track dependencies and completion.

10. **Begin Phase 1** — read `phases/define.md` and start immediately. Do NOT ask "should I proceed?"

**Key principle:** The user already told you what to build. Research, plan, start building. Pause at the 3 approval gates. In Thorough/Meticulous mode, also show phase summaries between major phases — but never block on them (inform, don't gate).

## User Experience Protocol

Follow the shared UX Protocol at `Antigravity-Production-Grade-Suite/.protocols/ux-protocol.md`. Key rules:
1. **NEVER** ask open-ended questions — always use notify_user with predefined numbered options
2. **"Chat about this"** always last option
3. **Recommended option first** with `(Recommended)` suffix
4. **Continuous execution** — work until next gate or completion
5. **Real-time progress** — constant ⧖/✓ progress updates via task_boundary
6. **Autonomy** — sensible defaults, self-resolve, report decisions

### Gate Companion — Polymath Integration

When the user selects **"Chat about this"** at any gate, invoke the polymath in translate mode:

```
Read skills/polymath/SKILL.md and follow its instructions in translate mode.
The polymath reads the gate artifacts, explains in plain language,
answers the user's questions via structured options,
then re-presents the original gate options when the user is ready.
```

This ensures non-technical users can understand what they're approving without the orchestrator needing to be the translator.

### Strategic Gates (3 total)

**Gate 1 — BRD Approval** (after T1):

Notify user via notify_user:
```
BRD complete: [X] user stories, [Y] acceptance criteria. Approve?

1. **Approve — start architecture (Recommended)** — BRD locked, proceed to Solution Architect
2. **Show BRD details** — Display the full BRD before deciding
3. **I have changes** — Request modifications to requirements
4. **Chat about this** — Free-form input about the BRD
```

**Gate 2 — Architecture Approval** (after T2):

Notify user via notify_user:
```
Architecture complete: [tech stack summary]. Approve to start building?

1. **Approve — start building (Recommended)** — Architecture locked, begin autonomous BUILD phase
2. **Show architecture details** — Walk through ADRs, diagrams, and API spec
3. **I have concerns** — Flag issues with architecture decisions
4. **Chat about this** — Free-form input about the architecture
```

**Gate 3 — Production Readiness** (after T9):

Notify user via notify_user:
```
All phases complete. [summary]. Ship it?

1. **Ship it — production ready (Recommended)** — Finalize assembly and deploy
2. **Show full report** — Display complete pipeline summary
3. **Fix issues first** — Address remaining findings before shipping
4. **Chat about this** — Free-form input about production readiness
```

## Task Dependency Graph — Sequential Execution

Sequential task execution with clear dependency tracking. The orchestrator reads the architecture output (number of services, pages, modules) and generates tasks accordingly.

```
T1: product-manager (BRD)
    ↓ [GATE 1]
T2: solution-architect (Architecture)
    ↓ [GATE 2]
T3a: software-engineer — implement backend services (1 per service)
T3b: frontend-engineer — implement frontend pages (1 per page group)
T4a: devops — Dockerfiles + CI skeleton
    ↓ (code written)
T5: qa-engineer — implement tests (unit/integ/e2e/perf)
T6a: security-engineer — STRIDE + code audit + dep scan
T6b: code-reviewer — arch conformance + quality review
    ↓
T7: devops (IaC + CI/CD)
T8: remediation (HARDEN fixes)
T9: sre (SLOs + chaos + capacity)
T10: data-scientist (conditional on AI/ML)
    ↓ [GATE 3]
T11: technical-writer (API ref + dev guides)
T12: skill-maker
    ↓
T13: Compound Learning + Assembly
```

### Task Dependencies

| Task | Blocked By | Notes |
|------|-----------|-------|
| T1 | — | First task, no blockers |
| T2 | T1 | Needs BRD |
| T3a | T2 | Backend — implement services from architecture |
| T3b | T2 | Frontend — implement pages from BRD |
| T4a | T2 | DevOps — Dockerfiles + CI skeleton |
| T5 | T3a, T3b | QA — needs code + test plan |
| T6a | T3a, T3b | Security — needs code + threat model |
| T6b | T3a, T3b | Review — needs code + checklist |
| T7 | T5, T6a, T6b | IaC + CI/CD — needs HARDEN output |
| T8 | T5, T6a, T6b | Remediation — needs HARDEN findings |
| T9 | T7, T8 | SRE — needs infra + fixes |
| T10 | T7, T8 | Conditional on AI/ML usage |
| T11 | T9 | Docs — needs all prior output |
| T12 | T9 | Skills — needs all prior output |
| T13 | T11, T12 | Final step |

### Dynamic Task Generation

After Gate 2 (architecture approved), the orchestrator reads the architecture output to determine work units:

1. **Count services** — Read `docs/architecture/` service list or `api/` specs. For each service, note it for sequential implementation in T3a.
2. **Count pages** — Read BRD user stories. Group into page clusters (auth, dashboard, settings, etc.). Note for T3b.
3. **Execute sequentially** — Each service and page group is implemented one at a time, reading the SKILL.md for the relevant skill.

### Conditional Tasks

- **T3b (Frontend):** Skip if `.production-grade.yaml` has `features.frontend: false`
- **T10 (Data Scientist):** Auto-detect by scanning for `openai`, `anthropic`, `langchain`, `transformers`, `torch`, `tensorflow` imports. If not detected and `features.ai_ml: false`, mark as completed immediately.

## Phase Execution

Each phase loads its dispatcher file for task management.

| Phase | File | Tasks |
|-------|------|-------|
| DEFINE | `phases/define.md` | T1, T2 |
| BUILD | `phases/build.md` | T3a, T3b, T4a |
| HARDEN | `phases/harden.md` | T5, T6a, T6b |
| SHIP | `phases/ship.md` | T7, T8, T9, T10 |
| SUSTAIN | `phases/sustain.md` | T11, T12, T13 |

**Read the phase file BEFORE starting that phase. Never load all phase files at once.**

**Internal skill architecture** — each skill's internal phase structure (executed sequentially in Antigravity):

| Skill | Internal Phases |
|-------|----------------|
| software-engineer | Shared foundations first (Phase 2a), then per-service implementation (Phase 2b). Foundations ensure consistency. |
| frontend-engineer | UI Primitives first (Phase 3a), then Layout + Features (Phase 3b), then Pages (Phase 4). Primitives are foundational atoms. |
| qa-engineer | Unit, integration, e2e, performance tests — sequential by test type |
| security-engineer | Code audit, auth review, data security, supply chain — sequential by domain |
| code-reviewer | Architecture conformance, code quality, performance review — sequential by focus |
| devops | IaC, CI/CD, container orchestration — sequential by layer |
| sre | Chaos engineering, incident management, capacity planning — sequential |
| technical-writer | API reference, developer guides — sequential |

### Skill Dispatch Method

Read the skill's SKILL.md file and follow its instructions directly:

```
Read skills/<skill-name>/SKILL.md and follow its instructions.
Provide context: architecture files, BRD, workspace paths, etc.
```

## Conflict Resolution

Follow the shared protocol at `Antigravity-Production-Grade-Suite/.protocols/conflict-resolution.md`.

| Artifact | Sole Authority | Others Must NOT |
|----------|---------------|-----------------|
| OWASP, STRIDE, PII, encryption | **security-engineer** | code-reviewer must NOT do security review |
| SLO, error budgets, runbooks | **sre** | devops must NOT define SLOs |
| Code quality, arch conformance | **code-reviewer** | — |
| Infrastructure, CI/CD, monitoring setup | **devops** | sre reviews but doesn't provision |
| Requirements (WHAT) | **product-manager** | architect flags gaps, doesn't change requirements |
| Architecture (HOW) | **solution-architect** | — |

### Remediation Feedback Loop

When HARDEN skills find Critical/High issues:
1. Orchestrator creates T8 (Remediation) task with findings
2. Fix code in `services/`, `frontend/`
3. Re-scan affected files after fixes
4. If still failing after **2 cycles** → escalate to user via notify_user

## Context Bridging

| Task | Reads From | Writes To (Project Root) | Writes To (Workspace) |
|------|-----------|--------------------------|----------------------|
| Polymath | User dialogue, web research | — | `polymath/context/`, `polymath/handoff/` |
| T1: PM | User input, polymath context, web research | — | `product-manager/BRD/` |
| T2: Architect | `product-manager/BRD/` | `api/`, `schemas/`, `docs/architecture/` | `solution-architect/` |
| T3a: Backend | `api/`, `schemas/`, `docs/architecture/` | `services/`, `libs/shared/` | `software-engineer/` |
| T3b: Frontend | `api/`, `product-manager/BRD/` | `frontend/` | `frontend-engineer/` |
| T4: DevOps | `services/`, `docs/architecture/` | Dockerfiles at root | `devops/containers/` |
| T5: QA | `services/`, `frontend/`, `api/` | `tests/` | `qa-engineer/` |
| T6a: Security | All implementation code | — | `security-engineer/` |
| T6b: Review | All implementation + architecture | — | `code-reviewer/` |
| T7: DevOps IaC | Architecture, implementation | `infrastructure/`, `.github/workflows/` | `devops/` |
| T8: Remediation | HARDEN findings | Fixes in `services/`, `frontend/` | — |
| T9: SRE | All prior outputs | `docs/runbooks/` | `sre/` |
| T10: Data Sci | Implementation (LLM usage) | — | `data-scientist/` |
| T11: Tech Writer | ALL workspace + project | `docs/` | `technical-writer/` |
| T12: Skill Maker | ALL workspace | `skills/` | `skill-maker/` |

**Deliverables** go to project root (respecting `.production-grade.yaml` path overrides). **Workspace artifacts** go to `Antigravity-Production-Grade-Suite/<skill-name>/`.

## Workspace Architecture

```
Antigravity-Production-Grade-Suite/
├── .protocols/              # Shared protocols (written at bootstrap)
├── .orchestrator/           # Pipeline state via task.md
├── product-manager/         # BRD, research
├── solution-architect/      # Architecture artifacts
├── software-engineer/       # Backend logs/artifacts
├── frontend-engineer/       # Frontend logs/artifacts
├── qa-engineer/             # Test artifacts
├── security-engineer/       # Security findings
├── code-reviewer/           # Quality findings
├── devops/                  # Infrastructure artifacts
├── sre/                     # Readiness artifacts
├── data-scientist/          # AI/ML artifacts (conditional)
├── technical-writer/        # Documentation artifacts
└── skill-maker/             # Custom skills
```

## Adaptive Rules

| Situation | Action |
|-----------|--------|
| No frontend needed | Skip T3b, simplify DevOps |
| Monolith architecture | Single Dockerfile, skip K8s/service mesh |
| LLM/ML APIs detected | Auto-enable T10 (Data Scientist) |
| Critical security finding | Create remediation task (T8) |
| QA failures > 20% | Flag to user |
| Architecture drift detected | Warn user (arch decisions are user-approved) |
| `features.frontend: false` | Skip T3b entirely |
| `features.ai_ml: false` | Skip T10 unless auto-detected |

## Security Hooks (Continuous)

Security runs during ALL phases:
- Block `rm -rf /`, `chmod 777`, destructive operations
- Block `.env`, `.key`, `.pem`, `credentials.json` from git
- Scan staged files for API keys, tokens, passwords
- Engineers scan for hardcoded secrets as they write code

## Autonomous Behavior

Every skill execution follows:
1. **Build and verify** — after writing code, run it. After writing tests, execute them.
2. **Validation loop** — `while not valid: fix(errors); validate()`
3. **Self-debug** — read errors, identify root cause. After 3 failures: stop and report.
4. **Quality bar** — no TODOs, no stubs. All code compiles. All tests pass.
5. **TDD enforced** — write test first, watch fail, implement, watch pass, refactor.

## Partial Execution

| Command | Tasks Run |
|---------|----------|
| `just define` | T1, T2 only |
| `just build` | T3a, T3b, T4 (requires T2 output) |
| `just harden` | T5, T6a, T6b (requires BUILD output) |
| `just ship` | T7-T10 (requires HARDEN output) |
| `just document` | T11 only |
| `skip frontend` | Omit T3b |
| `start from architecture` | Skip T1, start at T2 |

## Final Summary Template

```
╔══════════════════════════════════════════════════════════════╗
║          PRODUCTION GRADE v{local_version} — COMPLETE          ║
╠══════════════════════════════════════════════════════════════╣
║  Project: <name>                                             ║
║                                                              ║
║  DEFINE:  ✓ BRD (<X> stories) ✓ Architecture (<pattern>)     ║
║  BUILD:   ✓ Backend (<N> services) ✓ Tests (<N> passing)     ║
║  HARDEN:  ✓ Security (<N> fixed) ✓ Code Review (<N> fixed)   ║
║  SHIP:    ✓ Docker ✓ CI/CD ✓ Terraform ✓ SRE approved       ║
║  SUSTAIN: ✓ Docs ✓ Skills (<N> created) ✓ Learnings captured ║
║                                                              ║
║  Workspace: Antigravity-Production-Grade-Suite/              ║
║  Config: .production-grade.yaml                              ║
╚══════════════════════════════════════════════════════════════╝
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Running BUILD without DEFINE | Architecture decisions must exist first |
| Code reviewer doing OWASP review | security-engineer is sole OWASP authority |
| DevOps defining SLOs | sre is sole SLO authority |
| DevOps writing runbooks | sre writes runbooks to docs/runbooks/ |
| Skipping tests | Production grade means tested |
| Not running code after writing | Every skill verifies output compiles and runs |
| Skills working in isolation | Cross-reference via Context Bridging table |
| Over-asking the user | Respect engagement mode. Express: 3 gates only. Standard: 3 gates + moderate interview. Thorough/Meticulous: deeper interviews but always structured options. |
| Ignoring engagement mode | ALL skills must read settings.md and adapt depth. Express architect doesn't ask 15 questions. Meticulous PM doesn't skip to BRD after 2 questions. |
| One-size-fits-all architecture | Architecture is derived from constraints (scale, team, budget, compliance). A 100-user internal tool does NOT need microservices + K8s. |
| Writing stubs | No `// TODO: implement` in production code |
| Hardcoded paths | Read `.production-grade.yaml` for path overrides |
| Not leveraging skill architecture | Even though execution is sequential, each skill's internal phase structure ensures quality. Foundations before dependent work. |
| Duplicating security review | code-reviewer references security-engineer findings |
