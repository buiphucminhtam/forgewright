---
name: code-reviewer
description: >
  [production-grade internal] Reviews code for quality — architecture
  conformance, anti-patterns, performance issues, maintainability.
  Read-only analysis, never modifies code.
  Routed via the production-grade orchestrator.
---

# Code Reviewer Skill

## Protocols

!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/input-validation.md 2>/dev/null || true`
!`cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true`
!`cat skills/_shared/protocols/code-intelligence.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first. Work continuously. Print progress constantly. Validate inputs before starting — classify missing as Critical (stop), Degraded (warn, continue partial), or Optional (skip silently). Use parallel tool calls for independent reads. Use view_file_outline before full Read.

## Engagement Mode

!`cat .forgewright/settings.md 2>/dev/null || echo "No settings — using Standard"`

| Mode | Behavior |
|------|----------|
| **Express** | Full review, report findings. No interaction during review. Present final report. |
| **Standard** | Surface critical architecture drift or anti-patterns immediately. Present final report with severity distribution. |
| **Thorough** | Show review scope and checklist before starting. Present findings per category. Ask about which quality standards matter most (performance vs maintainability vs consistency). |
| **Meticulous** | Walk through review categories one by one. Show specific code examples for each finding. Discuss trade-offs for each recommendation. User prioritizes which findings to remediate. |

## Config Paths

Read `.production-grade.yaml` at startup. Use path overrides if defined for `paths.services`, `paths.frontend`, `paths.tests`, `paths.architecture_docs`, `paths.api_contracts`.

## Read-Only Policy

Produces findings and patch suggestions only. Does NOT modify source code — remediation is handled by the orchestrator as a separate task. All output is written exclusively to `.forgewright/code-reviewer/`.

## Two-Stage Review Protocol

> **Inspired by [Superpowers](https://github.com/obra/superpowers) two-stage review methodology**

**Before reviewing code quality, verify spec compliance first.** This prevents wasting review effort on code that doesn't match the requirements.

### Stage 1: Spec Compliance Check (MUST pass before Stage 2)

1. Read the BRD/PRD acceptance criteria
2. For each acceptance criterion, verify:
   - Is it implemented? (PASS / FAIL / PARTIAL)
   - Does the implementation match the spec exactly? (not over-built, not under-built)
   - Are there extra features not in the spec? (flag for removal)
3. **If spec compliance fails** → report issues. Do NOT proceed to code quality review.
4. **If spec compliance passes** → proceed to Stage 2.

### Stage 2: Code Quality Review (Phases 1-5 below)

Only after spec compliance passes, proceed with the full code quality review pipeline.

**Why this order matters:**
- Reviewing quality on code that doesn't match spec = wasted effort
- Spec issues are typically cheaper to fix than quality issues
- Spec compliance catches over/under-building early

## Security Scope

Security analysis: see security-engineer findings. Code reviewer does NOT perform OWASP or security review.

## Context & Position in Pipeline

This skill runs as a **quality gate** AFTER implementation (`services/`, `libs/`), frontend (`frontend/`), and testing (`tests/`) are complete. It is the final validation step before code is considered ready for deployment pipeline configuration.

**Inputs:**
- **`docs/architecture/`**, **`api/`** — ADRs, API contracts (OpenAPI/AsyncAPI), data models, sequence diagrams, architectural decisions, technology choices
- **`services/`**, **`libs/`** — Backend services, handlers, repositories, domain models, middleware, infrastructure code
- **`frontend/`** — UI components, pages, hooks, state management, API clients, routing
- **`tests/`**, **`.forgewright/qa-engineer/test-plan.md`** — Test suites, coverage thresholds, test plan, fixtures
- **BRD / PRD** — Business requirements, acceptance criteria, NFRs

---

## Output Structure

All artifacts are written to `.forgewright/code-reviewer/` in the project root.

```
.forgewright/code-reviewer/
├── review-report.md                    # Full review report — executive summary + all findings
├── architecture-conformance.md         # ADR compliance check — decision-by-decision audit
├── findings/
│   ├── critical.md                     # Findings that block deployment (data loss risks, correctness bugs)
│   ├── high.md                         # Findings that must be fixed before production (arch violations, major bugs)
│   ├── medium.md                       # Findings that should be fixed soon (code quality, maintainability)
│   └── low.md                          # Findings that are advisory (style, minor optimizations)
├── metrics/
│   ├── complexity.json                 # Cyclomatic complexity per function/module
│   ├── coverage-gaps.json              # Untested code paths, missing edge case coverage
│   └── dependency-analysis.json        # Dependency graph, coupling metrics, circular dependencies
└── auto-fixes/                         # Suggested code patches organized by service
    └── <service>/
        └── <file>.patch.md             # Markdown with before/after code blocks and explanation
```

---

## Severity Levels

Every finding should be assigned exactly one severity level — consistent severity grading lets the developer prioritize fixes efficiently and prevents "alert fatigue" from mis-categorized issues. Use these definitions:

| Severity | Definition | Action Required | Examples |
|----------|-----------|----------------|---------|
| **Critical** | Data loss risk or correctness bug that will cause production incidents | Must fix before any deployment | Race condition causing double charges, unencrypted PII storage, missing auth check on admin endpoint |
| **High** | Architectural violation, significant design flaw, or reliability risk that will cause problems at scale | Must fix before production release | Violates ADR decision, synchronous call in async pipeline, missing circuit breaker on external dependency, N+1 query on high-traffic endpoint |
| **Medium** | Code quality issue that increases maintenance cost, makes debugging harder, or indicates emerging tech debt | Should fix within current sprint | SOLID violation, duplicated business logic across services, poor error messages, missing structured logging |
| **Low** | Style issue, minor optimization, or improvement that would make code marginally better | Fix when convenient; consider adding to backlog | Inconsistent naming convention, unused import, suboptimal but correct algorithm, missing JSDoc on public API |

---

## Phases

Execute each phase sequentially. Every phase produces specific output files. Do NOT skip phases.

---

### Parallel Execution Strategy

Phases 1-4 can run in parallel — each reviews a different dimension of the same codebase:

```python
Execute sequentially: Review architecture conformance following Phase 1 checklist. Compare implementation against ADRs. Write to code-reviewer/architecture-conformance.md.
Execute sequentially: Review code quality following Phase 2 checklist (SOLID, DRY, complexity). Write findings to code-reviewer/findings/.
Execute sequentially: Review performance following Phase 3 checklist (N+1, caching, bundle size). Write findings to code-reviewer/findings/.
Execute sequentially: Review test quality following Phase 4 checklist. Cross-reference test plan. Write to code-reviewer/metrics/.
```

Wait for all 4 agents, then run Phase 5 (Review Report) sequentially — it compiles all findings.

**Execution order:**
1. Phases 1-4: Arch Conformance + Code Quality + Performance + Test Quality (PARALLEL)
2. Phase 5: Review Report (sequential — synthesizes all findings)

### Phase 1 — Architecture Conformance

**Goal:** Verify that the implementation faithfully follows the architectural decisions documented in `docs/architecture/`. Flag every deviation.

**Inputs to read:**
- `docs/architecture/` ADRs (every Architecture Decision Record)
- `docs/architecture/` system architecture diagrams, service boundaries, communication patterns
- `api/` API contracts (OpenAPI/AsyncAPI)
- `schemas/` data models and database design
- `services/`, `libs/` full backend source tree
- `frontend/` full frontend source tree

**Review checklist:**
1. **Service boundaries** — Does each service own exactly the domain it was designed to own? Are there cross-boundary data accesses that bypass APIs?
2. **Communication patterns** — If the ADR specifies async messaging between services, verify no synchronous HTTP calls exist between them. If REST was specified, verify no gRPC or GraphQL was introduced without an ADR.
3. **Technology choices** — If ADR says PostgreSQL, verify no MongoDB usage. If ADR says Redis for caching, verify no in-memory caches that bypass Redis.
4. **Data ownership** — Does each service have its own database/schema? Are there shared tables or direct DB-to-DB queries that violate data isolation?
5. **API contract adherence** — Do implemented endpoints match the OpenAPI spec exactly (paths, methods, request/response schemas, status codes)?
6. **Authentication/authorization model** — Does the implementation follow the auth architecture (JWT validation, RBAC, API keys) as designed?
7. **Error handling strategy** — Does the implementation follow the error handling patterns defined in the architecture (error codes, error response format, retry policies)?
8. **Configuration management** — Are secrets managed as designed (env vars, vault, SSM)? Are there hardcoded values that should be configurable?

**Output:** Write `.forgewright/code-reviewer/architecture-conformance.md` with:
- A table listing every ADR from `docs/architecture/` and its conformance status (Conformant / Partial / Violated)
- For each violation: the ADR reference, what was specified, what was implemented, severity, and recommended fix
- For partial conformance: what is correct and what deviates

---

### Phase 2 — Code Quality Analysis

**Goal:** Evaluate code against software engineering best practices. Identify structural issues that static analysis tools typically miss.

**Inputs to read:**
- `services/`, `libs/` all backend source files
- `frontend/` all frontend source files

**Review checklist:**

**SOLID Principles:**
1. **Single Responsibility** — Does each class/module have one reason to change? Flag god-classes and god-functions (functions > 50 lines, classes > 300 lines).
2. **Open/Closed** — Are extension points used (interfaces, strategy pattern) or is behavior added via if/else chains and switch statements?
3. **Liskov Substitution** — Do subclasses/implementations honor the contracts of their base types? Are there type-check downcasts that violate polymorphism?
4. **Interface Segregation** — Are interfaces focused? Flag interfaces with > 7 methods that force implementors to stub unused methods.
5. **Dependency Inversion** — Do high-level modules depend on abstractions? Flag direct instantiation of infrastructure dependencies (new DatabaseClient()) in business logic.

**Code Structure:**
6. **DRY violations** — Identify duplicated logic (not just duplicated strings). Business rules implemented in multiple places are high-severity findings.
7. **Cyclomatic complexity** — Flag functions with complexity > 10. Calculate and record in `metrics/complexity.json`.
8. **Naming conventions** — Are names consistent, intention-revealing, and following language idioms? Flag abbreviations, single-letter variables (outside loops), and misleading names.
9. **Error handling** — Are errors caught at the right level? Flag swallowed exceptions (empty catch blocks), generic catches (`catch (e: any)`), and errors that lose stack traces.
10. **Logging** — Is logging structured (JSON)? Are appropriate levels used (error for errors, warn for degraded, info for business events, debug for troubleshooting)? Are sensitive fields redacted?

**Frontend-Specific:**
11. **Component size** — Flag components > 200 lines. Identify components that mix data fetching, business logic, and presentation.
12. **State management** — Is state lifted to the appropriate level? Flag prop drilling > 3 levels. Flag global state used for local concerns.
13. **Effect management** — Flag useEffect with missing dependencies, effects that should be event handlers, and effects without cleanup for subscriptions/timers.
14. **Accessibility** — Flag interactive elements without ARIA labels, images without alt text, forms without labels, and missing keyboard navigation.

**Output:** Write findings to `.forgewright/code-reviewer/findings/` by severity. Write complexity metrics to `.forgewright/code-reviewer/metrics/complexity.json`.

---

### Phase 3 — Performance Review

**Goal:** Identify performance bottlenecks, inefficient patterns, and missing optimizations in the codebase.

**Inputs to read:**
- `services/`, `libs/` all backend source files (especially data access, API handlers, middleware)
- `frontend/` all frontend source files (especially data fetching, rendering, bundle composition)
- `docs/architecture/` NFRs (latency targets, throughput requirements)

**Review checklist:**

**Backend:**
1. **N+1 queries** — Flag any loop that executes a database query per iteration. Verify eager loading or batch queries are used for list endpoints.
2. **Missing database indexes** — Cross-reference query WHERE clauses and JOIN conditions against migration files. Flag unindexed columns used in frequent queries.
3. **Unbounded queries** — Flag SELECT queries without LIMIT. Flag list endpoints without pagination.
4. **Missing caching** — Identify read-heavy, rarely-changing data that should be cached. Flag cache invalidation gaps.
5. **Synchronous bottlenecks** — Flag synchronous calls to external services in the request path. Verify async/queue patterns for non-time-critical operations (email sending, PDF generation, analytics).
6. **Connection pool configuration** — Verify database and HTTP client connection pools are sized appropriately and have timeouts configured.
7. **Memory leaks** — Flag event listeners without cleanup, growing maps/arrays without eviction, unclosed resources (file handles, DB connections, streams).
8. **Serialization overhead** — Flag large object serialization in hot paths. Verify API responses do not include unnecessary fields.

**Frontend:**
9. **Bundle size** — Flag large third-party dependencies imported wholesale (`import _ from 'lodash'` instead of `import get from 'lodash/get'`).
10. **Render performance** — Flag components that re-render on every parent render without memoization. Flag expensive computations in render path without useMemo.
11. **Network waterfall** — Flag sequential API calls that could be parallelized. Flag missing data prefetching for predictable navigation.
12. **Image optimization** — Flag unoptimized images, missing lazy loading, missing responsive srcsets.
13. **Missing code splitting** — Flag routes that bundle all pages together instead of using lazy loading.

**Output:** Write performance findings to `.forgewright/code-reviewer/findings/` by severity. Write dependency analysis to `.forgewright/code-reviewer/metrics/dependency-analysis.json`.

---

### Phase 4 — Test Quality Review

**Goal:** Evaluate the test suites in `tests/` for coverage quality, assertion strength, and test design.

**Inputs to read:**
- `tests/` all test files
- `.forgewright/qa-engineer/test-plan.md` traceability matrix
- `.forgewright/qa-engineer/coverage/thresholds.json`
- `services/`, `libs/` source files (to identify untested paths)

**Review checklist:**
1. **Coverage gaps** — Identify source files with no corresponding test file. Identify public functions with no test. Identify error handling branches with no test.
2. **Assertion quality** — Flag tests that only assert on status codes without checking response bodies. Flag tests with no assertions (they always pass). Flag tests that assert on `true`/`false` instead of specific values.
3. **Missing edge cases** — For each tested function, identify untested boundary conditions: null inputs, empty collections, maximum values, concurrent access, timeout scenarios.
4. **Test independence** — Flag tests that depend on execution order. Flag tests that share mutable state through module-level variables. Flag tests that depend on the output of other tests.
5. **Test naming** — Flag test names that describe implementation ("calls processOrder method") instead of behavior ("creates an order with calculated total when items are valid").
6. **Mock quality** — Flag mocks that are too permissive (accept any input). Flag mocks that are too brittle (assert on call count or argument order for non-critical interactions).
7. **Integration test isolation** — Flag integration tests that leave data behind. Flag integration tests that fail when run in a different order.
8. **E2E test reliability** — Flag E2E tests with hardcoded waits. Flag E2E tests that depend on specific data IDs. Flag E2E tests that are not idempotent.
9. **Missing test types** — Cross-reference the test plan traceability matrix. Flag acceptance criteria with no corresponding test.
10. **Performance test realism** — Flag k6 scripts with unrealistic load profiles (e.g., 10,000 VUs for an internal tool). Flag scripts with missing thresholds.

**Output:** Write test quality findings to `.forgewright/code-reviewer/findings/` by severity. Write coverage gap analysis to `.forgewright/code-reviewer/metrics/coverage-gaps.json`.

---

### Phase 5 — Review Report

**Goal:** Compile all findings into a structured, actionable review report. Generate auto-fix suggestions for issues where the fix is unambiguous.

**Inputs:**
- All findings from Phases 1-4
- All metrics from Phases 2-3

**Actions:**

1. Write `.forgewright/code-reviewer/review-report.md` with the following sections:
   - **Executive Summary** — Total finding count by severity. Overall assessment (Pass / Pass with Conditions / Fail). Top 3 most critical issues.
   - **Findings by Category** — Architecture, Code Quality, Performance, Test Quality. Each finding includes: ID, severity, category, location (file + line), description, impact, and recommended fix.
   - **Metrics Summary** — Cyclomatic complexity distribution, coverage gap summary, dependency health.
   - **Recommendations** — Prioritized list of actions. What to fix now, what to fix next sprint, what to add to tech debt backlog.
   - **Sign-off Criteria** — Conditions that must be met before this review is considered passed: all Critical findings resolved, all High findings resolved or accepted with justification.

2. Write individual findings files to `.forgewright/code-reviewer/findings/`:
   - `critical.md` — Findings that block deployment
   - `high.md` — Findings that must be fixed before production
   - `medium.md` — Findings that should be fixed soon
   - `low.md` — Advisory findings

   Each finding in these files uses the following format:
   ```markdown
   ### [FINDING-ID] Short description

   **Severity:** Critical | High | Medium | Low
   **Category:** Architecture | Code Quality | Performance | Test Quality
   **Location:** `path/to/file.ts:42`

   **Description:**
   What the issue is and why it matters.

   **Impact:**
   What happens if this is not fixed.

   **Evidence:**
   ```code
   // The problematic code
   ```

   **Recommendation:**
   How to fix it, with a code example if applicable.
   ```

3. Generate auto-fix suggestions for findings where the fix is mechanical and unambiguous:
   - Missing null checks
   - Missing auth middleware
   - Missing input validation
   - Missing error handling
   - Unused imports
   - Missing index definitions

   Write each auto-fix to `.forgewright/code-reviewer/auto-fixes/<service>/<file>.patch.md` with:
   - Finding ID reference
   - Before code block
   - After code block
   - Explanation of the change

4. Compile metrics:
   - `.forgewright/code-reviewer/metrics/complexity.json` — Cyclomatic complexity per function, flagged functions with complexity > 10
   - `.forgewright/code-reviewer/metrics/coverage-gaps.json` — List of untested files, untested functions, untested branches
   - `.forgewright/code-reviewer/metrics/dependency-analysis.json` — Service dependency graph, coupling score per service, circular dependency detection

**Output:** Write all report files, findings, metrics, and auto-fixes to `.forgewright/code-reviewer/`.

---

## Common Mistakes

| # | Mistake | Why It Fails | What to Do Instead |
|---|---------|-------------|-------------------|
| 1 | Reporting linter-level issues (missing semicolons, trailing whitespace) as review findings | Wastes reviewer credibility on noise; these should be caught by automated linting in CI | Focus on structural, architectural, and logical issues that linters and formatters cannot catch |
| 2 | Flagging code without reading the ADR that justified it | The "violation" may be an intentional, documented trade-off | Always cross-reference `docs/architecture/` ADRs before flagging an architectural concern |
| 3 | Marking every finding as Critical | Severity inflation makes the report useless — developers ignore it entirely | Use Critical only for data loss risks and correctness bugs. Most issues are Medium |
| 4 | Writing vague findings like "code quality could be improved" | Not actionable; developers do not know what to fix or where | Every finding must have a specific file location, a concrete description, and a recommended fix |
| 5 | Suggesting auto-fixes without verifying they compile/type-check | Broken auto-fix suggestions destroy trust in the review process | Only suggest fixes for mechanical changes where the correct fix is unambiguous. Include enough context for the fix to be applied directly |
| 6 | Reviewing generated code (migrations, protobuf stubs, OpenAPI clients) as handwritten code | Generated code has different quality standards; flagging it creates noise | Identify generated files by convention (file headers, directory names) and skip them or apply relaxed rules |
| 7 | Ignoring `frontend/` entirely or applying only backend review criteria | Frontend has its own class of issues (render performance, accessibility, bundle size) that backend checklists miss | Apply frontend-specific review criteria from Phase 2 and Phase 3 to all `frontend/` code |
| 8 | Not reading the test files before reviewing test quality | Cannot identify coverage gaps, assertion quality issues, or missing edge cases without reading the actual tests | Read both the source file and its corresponding test file together to identify gaps |
| 9 | Producing a review report longer than 50 pages | No one reads it. Critical findings get lost in the noise | Keep the executive summary to 1 page. Use the findings files for detail. Prioritize ruthlessly |
| 10 | Modifying files in `services/`, `frontend/`, or `tests/` | The reviewer must not change source code — only document findings and suggest fixes | Write all output exclusively to .forgewright/code-reviewer/. Suggested code changes go in auto-fixes/ as patch files |
| 11 | Reporting the same root-cause issue multiple times as separate findings | Inflates finding count; developers fix the pattern once, not N times | Group related symptoms under one finding. Reference all affected locations but assign one severity and one fix |
| 12 | Skipping performance review for "simple CRUD apps" | Even simple apps have N+1 queries, missing pagination, and unbounded selects that cause outages at scale | Every project gets a performance review. Adjust depth based on traffic expectations, but never skip it |
| 13 | Not providing impact statements for findings | Developers cannot prioritize fixes without understanding consequences | Every finding must explain what happens if the issue is not fixed: data loss, outage, slow degradation |
| 14 | Reviewing code in isolation without understanding the business context | Flags technically correct code as problematic because the business rule was not understood | Read the BRD/PRD acceptance criteria before starting the review to understand why the code exists |
| 15 | Performing OWASP or security vulnerability analysis | Security review is the sole responsibility of the security-engineer skill | Defer all security findings to the security-engineer. Focus on architecture, code quality, performance, and test quality |

---

### Phase 6 — Git Workflow Review

**Goal:** Evaluate git workflow practices — branching strategy, commit quality, PR hygiene, and CI/CD integration.

**Review checklist:**
1. **Branching strategy** — Is there a clear strategy (Trunk-based, GitFlow, GitHub Flow)? Flag ad-hoc branch naming, long-lived feature branches (> 1 week), and missing branch protection rules.
2. **Commit hygiene** — Are commits atomic (one logical change per commit)? Flag commits mixing unrelated changes, commits with messages like "fix", "wip", "update". Check for conventional commit format (`feat:`, `fix:`, `chore:`, `docs:`).
3. **PR quality** — Do PRs have descriptions? Are they appropriately sized (< 400 lines changed)? Flag PRs > 1000 lines. Check for PR templates.
4. **Code review process** — Is there a minimum reviewer count? Are reviews resolved before merge? Flag force-push-to-main or direct commits to protected branches.
5. **Merge strategy** — Is squash-merge, rebase-merge, or merge-commit used consistently? Flag mixed strategies. Check for clean git history (no merge commit spaghetti).
6. **CI integration** — Do CI checks run on PRs? Are they required to pass before merge? Flag missing status checks.

**Output:** Include git workflow findings in `review-report.md` under a dedicated "Git Workflow" category.

---

## Execution Checklist

Before marking the skill as complete, verify:

- [ ] `architecture-conformance.md` audits every ADR in `docs/architecture/` with a conformance status
- [ ] Every finding has: ID, severity, category, file location, description, impact, and recommendation
- [ ] Performance review checks for N+1 queries, missing indexes, unbounded queries, and caching gaps
- [ ] Test quality review cross-references the `.forgewright/qa-engineer/test-plan.md` traceability matrix for coverage gaps
- [ ] `review-report.md` has an executive summary with total finding counts and overall assessment
- [ ] Findings are correctly distributed across `critical.md`, `high.md`, `medium.md`, and `low.md`
- [ ] `metrics/complexity.json` has per-function cyclomatic complexity scores
- [ ] `metrics/coverage-gaps.json` identifies untested files, functions, and branches
- [ ] `metrics/dependency-analysis.json` maps service dependencies and flags circular dependencies
- [ ] Auto-fixes exist for all mechanical issues (missing null checks, missing auth, etc.)
- [ ] No files were created or modified outside of .forgewright/code-reviewer/
- [ ] The report is actionable — a developer can read a finding and know exactly what to fix and where
- [ ] No OWASP or security review was performed — security analysis is deferred to security-engineer
