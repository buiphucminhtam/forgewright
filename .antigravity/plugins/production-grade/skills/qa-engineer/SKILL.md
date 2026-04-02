---
name: qa-engineer
description: >
  [production-grade internal] Writes and runs tests when you want to verify
  code works — unit, integration, e2e, performance, contract testing,
  and Playwright browser automation for visual regression and UI validation.
  Routed via the production-grade orchestrator.
---

# QA Engineer Skill

## Protocols

!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/input-validation.md 2>/dev/null || true`
!`cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`
!`cat .forgewright/codebase-context.md 2>/dev/null || true`

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first. Work continuously. Print progress constantly. Validate inputs before starting — classify missing as Critical (stop), Degraded (warn, continue partial), or Optional (skip silently). Use parallel tool calls for independent reads. Use view_file_outline before full Read.

## Engagement Mode

!`cat .forgewright/settings.md 2>/dev/null || echo "No settings — using Standard"`

| Mode | Behavior |
|------|----------|
| **Express** | Fully autonomous. Generate all test suites with sensible coverage targets. Report test plan in output. |
| **Standard** | Surface 1-2 critical decisions — coverage targets, e2e scope (which flows to test), performance thresholds. |
| **Thorough** | Show full test plan before implementing. Ask about test data strategy, which edge cases matter most, performance SLAs to validate. Show test results summary per category. |
| **Meticulous** | Walk through test plan per service. User reviews test scenarios before implementation. Show each test category's results. Ask about flaky test tolerance and retry strategy. |

## Brownfield Awareness

If `.forgewright/codebase-context.md` exists and mode is `brownfield`:
- **READ existing tests first** — understand test framework, patterns, fixtures, helpers
- **MATCH existing test framework** — if they use pytest, don't introduce jest. If they use Vitest, use Vitest
- **ADD tests alongside existing ones** — don't restructure their test directory
- **Existing tests must still pass** — run the full test suite after adding new tests
- **Reuse existing fixtures and helpers** — don't duplicate test utilities

## Config Paths

Read `.production-grade.yaml` at startup. Use these overrides if defined:
- `paths.services` — default: `services/`
- `paths.frontend` — default: `frontend/`
- `paths.tests` — default: `tests/`

## Context & Position in Pipeline

This skill runs AFTER the Software Engineer and Frontend Engineer skills have completed. It expects:

- **`services/` and `libs/`** — Backend services, handlers, repositories, domain models, API route definitions
- **`frontend/`** — UI components, pages, hooks, state management, API client calls
- **`api/`, `schemas/`, `docs/architecture/`** — API contracts (OpenAPI/AsyncAPI specs), data models, sequence diagrams
- **BRD or PRD** — Acceptance criteria, user stories, business rules, edge cases

The QA Engineer does NOT modify source code. It generates test files and test infrastructure to `tests/` at the project root, and test documentation (test plan, reports) to `.forgewright/qa-engineer/`.

### Graceful Degradation

At startup, check whether `frontend/` (or `paths.frontend` from config) exists. If the frontend directory is not found:
- Skip all frontend-related test phases (UI E2E, visual regression, frontend contract tests, frontend-specific checks).
- Print: `[DEGRADED: frontend not found — skipping frontend tests]`
- Continue with all backend test phases normally.

---

## Output Structure

This skill produces output in two locations: test deliverables (code, configs, fixtures) at `tests/` in the project root, and workspace artifacts (test plan, reports, findings) in `.forgewright/qa-engineer/`. Never write test files into `services/` or `frontend/` directly.

### Project Root Output (`tests/`)

```
tests/
├── unit/
│   └── <service>/                      # One folder per backend service
│       ├── handlers/
│       │   └── <handler>.test.ts       # HTTP handler / controller tests
│       ├── services/
│       │   └── <service>.test.ts       # Business logic / domain service tests
│       ├── repositories/
│       │   └── <repo>.test.ts          # Data access layer tests (mocked DB)
│       ├── validators/
│       │   └── <validator>.test.ts     # Input validation tests
│       └── mappers/
│           └── <mapper>.test.ts        # DTO / domain mapper tests
├── integration/
│   ├── docker-compose.test.yml         # Test dependency containers (Postgres, Redis, Kafka, etc.)
│   ├── setup.ts                        # Global integration test setup / teardown
│   └── <service>/
│       ├── db/
│       │   └── <repo>.integration.ts   # Real DB queries via testcontainers
│       ├── cache/
│       │   └── <cache>.integration.ts  # Real Redis / cache operations
│       ├── messaging/
│       │   └── <queue>.integration.ts  # Real message broker publish / consume
│       └── api/
│           └── <endpoint>.integration.ts  # HTTP-level integration (supertest / httptest)
├── contract/
│   ├── pacts/
│   │   ├── consumer/
│   │   │   └── <consumer>-<provider>.pact.ts  # Consumer-driven contract tests
│   │   └── provider/
│   │       └── <provider>.verify.ts           # Provider verification tests
│   ├── schema/
│   │   └── <api>.schema.test.ts               # OpenAPI schema validation tests
│   └── pact-broker.config.ts                  # Pact Broker connection config
├── e2e/
│   ├── api/
│   │   ├── flows/
│   │   │   └── <user-flow>.e2e.ts     # Multi-step API workflow tests
│   │   ├── smoke.e2e.ts               # Critical-path smoke tests
│   │   └── setup.ts                   # API E2E auth helpers, base URLs
│   └── ui/
│       ├── pages/                     # Page Object Models
│       │   └── <page>.page.ts
│       ├── flows/
│       │   └── <user-flow>.spec.ts    # Playwright / Cypress user flow specs
│       ├── visual/
│       │   └── <component>.visual.ts  # Visual regression snapshot tests
│       └── playwright.config.ts       # Or cypress.config.ts
├── performance/
│   ├── load-tests/
│   │   └── <scenario>.k6.js           # k6 load test scripts (sustained load)
│   ├── stress-tests/
│   │   └── <scenario>.k6.js           # k6 stress test scripts (breaking point)
│   ├── spike-tests/
│   │   └── <scenario>.k6.js           # k6 spike test scripts (sudden burst)
│   ├── baselines/
│   │   └── <scenario>.baseline.json   # Expected p50/p95/p99 latency, throughput
│   └── thresholds.js                  # Shared k6 threshold definitions
├── fixtures/
│   ├── factories/
│   │   └── <entity>.factory.ts        # Test data factories (fishery / factory-girl pattern)
│   ├── seed-data/
│   │   ├── <entity>.seed.json         # Static seed data for integration / E2E
│   │   └── seed-runner.ts             # Script to load seed data into test DBs
│   └── mocks/
│       ├── <external-api>.mock.ts     # External API mock servers (MSW / nock)
│       └── <service>.stub.ts          # Internal service stubs
└── coverage/
    └── thresholds.json                # Per-service and global coverage gates
```

### Workspace Output (`.forgewright/qa-engineer/`)

```
.forgewright/qa-engineer/
├── test-plan.md                        # Master test plan with traceability matrix
├── coverage-report.md                  # Coverage analysis and findings
└── findings.md                         # QA findings and recommendations
```

---

## TDD Enforcement Protocol

> **Inspired by [Superpowers](https://github.com/obra/superpowers) TDD methodology**

```
NO TEST FILE WITHOUT A FAILING TEST FIRST
```

When writing tests, verify the RED-GREEN cycle for every test case:
1. **RED** — Write the test. Run it. It MUST fail.
2. **Verify RED** — Confirm it fails for the right reason (not a syntax error or import issue).
3. **GREEN** — The existing implementation should make it pass. If the test passes immediately without exercising the code path, the test is wrong — rewrite it.

### Why Test Order Matters

**"I'll write tests after to verify it works"** — Tests written after code pass immediately. Passing immediately proves nothing:
- Might test the wrong thing
- Might test implementation, not behavior
- Might miss edge cases you forgot
- You never saw it catch the bug

**"I already manually tested all the edge cases"** — Manual testing is ad-hoc. No record, can't re-run, easy to forget cases under pressure.

### Common Rationalizations (QA Context)

| Excuse | Reality |
|--------|---------|
| "The code already works, just need coverage" | Coverage without verified failures is carpet-bombing. Test what COULD break. |
| "Too many tests to write, skip edge cases" | Edge cases cause production incidents. They ARE the priority. |
| "Test passes immediately, must be fine" | A test that never fails proves nothing. Make it fail first, then fix. |
| "Mocks are too complex, just test the happy path" | Unmocked dependencies hide real failures. Mock correctly or write integration tests. |
| "Performance tests aren't worth the effort" | One missing load test = one production outage at scale. |
| "Visual regression is flaky, skip it" | Pin viewports, disable animations, use per-OS baselines. Fix flakiness, don't skip. |

### Red Flags — STOP and Reassess

- Test passes on first run without any code changes → test is likely wrong
- Test name describes implementation ("calls processOrder") not behavior ("creates order with total")
- Test has no assertions (it always passes)
- Test uses `toBeTruthy()` instead of specific value assertions
- Test shares mutable state with other tests
- Test depends on execution order

---

## Phases

Execute each phase sequentially. Do NOT skip phases. Each phase builds on the outputs of the previous one.

### Parallel Execution Strategy

After Phase 0 (Target Analysis) and Phase 1 (Test Planning), Phases 2-6 run in parallel — each test type is independent:

```python
# After test plan is written, spawn all test types simultaneously:
Execute sequentially: Write unit tests following Phase 2 rules. Read test-plan.md for traceability. Write to tests/unit/.
Execute sequentially: Write integration tests following Phase 3 rules. Read test-plan.md. Write to tests/integration/.
Execute sequentially: Write contract tests following Phase 4 rules. Read test-plan.md. Write to tests/contract/.
Execute sequentially: Write E2E tests following Phase 5 rules. Read test-plan.md. Write to tests/e2e/.
Execute sequentially: Write performance tests following Phase 6 rules. Read test-plan.md. Write to tests/performance/.
```

Wait for all 5 agents to complete, then run Phase 7 (Test Infrastructure) sequentially — it needs all test files to configure CI.

**Why this works:** Each test type reads source code independently and writes to its own directory. No conflicts. The test plan from Phase 1 provides shared context.

**Execution order:**
1. Phase 0: Target Analysis (sequential — determines technique)
2. Phase 1: Test Planning (sequential — foundational, uses Phase 0 recommendation)
3. Phases 2-6: Unit + Integration + Contract + E2E + Performance (PARALLEL)
4. Phase 7: Test Infrastructure (sequential — needs all test files)

---

### Phase 0 — Test Technique Assessment

**Goal:** Analyze the target website/application's technical characteristics to recommend the optimal testing technique BEFORE writing any test cases. This prevents wasted effort from using the wrong tool.

**When to run:** Always first, before Phase 1. Especially critical when testing third-party websites, SPAs, or apps with canvas/WebGL elements.

**Actions:**

1. **Probe the target** — if a URL or running app is available:
   ```
   a. Open the target URL (or localhost) in browser
   b. Inspect DOM structure:
      - Count elements with data-testid or data-test attributes
      - Count elements with ARIA roles/labels
      - Detect <canvas>, <svg>, <video>, <iframe> usage
      - Check for Shadow DOM / Web Components
   c. Detect framework: React (data-reactroot), Vue (__vue__), Angular (ng-*), Svelte, vanilla
   d. Check page complexity:
      - Total interactive elements
      - Dynamic content areas (infinite scroll, virtual lists)
      - Client-side routing (SPA vs MPA)
   ```

2. **Assess access level:**
   ```
   | Access Level | Criteria | Available Techniques |
   |-------------|----------|---------------------|
   | Full control | Own codebase, can modify source | All techniques + Page Agent inject |
   | Partial control | Can add data-testid, but can't inject scripts | Playwright + Midscene |
   | No control | Third-party site, read-only access | Midscene vision + Page Agent Extension |
   ```

3. **Score and recommend** — evaluate each technique:

   | Signal | Playwright Selectors | Midscene Vision | Page Agent DOM |
   |--------|---------------------|-----------------|----------------|
   | Has `data-testid` / ARIA labels | ⭐⭐⭐ Best | ⭐⭐ Good | ⭐⭐ Good |
   | No test attributes, clean HTML | ⭐⭐ Usable | ⭐⭐⭐ Best | ⭐⭐⭐ Best |
   | Canvas / WebGL / SVG charts | ❌ Cannot | ⭐⭐⭐ Only option | ❌ Cannot |
   | Shadow DOM / Web Components | ⭐ Difficult | ⭐⭐⭐ Best | ⭐⭐ Partial |
   | Heavy dynamic content (SPA) | ⭐⭐ With waits | ⭐⭐ With waits | ⭐⭐⭐ Best (live DOM) |
   | Need speed / CI integration | ⭐⭐⭐ Fastest | ⭐ Slow (~3s/step) | ⭐⭐ Medium |
   | Budget sensitive | ⭐⭐⭐ Free | ⭐⭐ ~$0.01/step | ⭐⭐⭐ ~$0.001/step |
   | Cross-browser needed | ⭐⭐⭐ Native | ⭐⭐ Via Playwright | ❌ Chrome only |
   | Mobile testing needed | ⭐⭐ Viewport emulation | ⭐⭐⭐ Real device | ❌ Web only |
   | Own app, can inject script | ⭐⭐ Good | ⭐⭐ Good | ⭐⭐⭐ Best (cheapest) |
   | Third-party site, no access | ⭐⭐ Good | ⭐⭐⭐ Best | ⭐⭐ Extension needed |

4. **Generate recommendation:**

   ```markdown
   ## Test Technique Assessment

   Target: [URL or app name]
   Framework: [React / Vue / Angular / Vanilla / Unknown]
   Access: [Full control / Partial / No control]

   ### DOM Quality Score
   - data-testid coverage: [N]% of interactive elements
   - ARIA label coverage: [N]%
   - Canvas/WebGL elements: [Yes/No]
   - Shadow DOM: [Yes/No]
   - Dynamic complexity: [Low/Medium/High]

   ### Recommendation
   | Technique | Fit Score | Use For |
   |-----------|-----------|---------|
   | [Primary] | ⭐⭐⭐ | [Main E2E flows, CI regression] |
   | [Secondary] | ⭐⭐ | [Visual validation, canvas, fallback] |

   ### Hybrid Strategy (if applicable)
   - Use [Primary] for: [fast CI regression, selector-based flows]
   - Use [Secondary] for: [visual verification, canvas elements, exploratory]
   ```

5. **Pass recommendation to Phase 1** — the test plan incorporates technique selection per test case:
   - E2E tests reference the recommended technique
   - Visual regression tests auto-select Midscene if canvas detected
   - CI pipeline configured for the recommended stack

**Output:** Write `.forgewright/qa-engineer/technique-assessment.md`

**Skip rules:**
- If `qa-engineer/technique-assessment.md` already exists and target hasn't changed → skip, reuse
- If testing backend-only (no frontend) → skip entirely, proceed to Phase 1
- If user explicitly specifies technique ("use Playwright") → skip, use user choice

---

### Phase 1 — Test Planning

**Goal:** Produce a traceability matrix linking every BRD acceptance criterion to concrete test cases, categorized by test type. **Use Phase 0's technique recommendation** to assign the optimal testing approach per test case.

**Inputs to read:**
- BRD / PRD acceptance criteria (every GIVEN/WHEN/THEN or equivalent)
- `api/` API contracts (OpenAPI specs, AsyncAPI specs)
- `schemas/` data models and `docs/architecture/` sequence diagrams
- `services/` service structure (list all services, handlers, repos)
- `frontend/` component and page structure (if frontend exists; otherwise skip frontend inputs)

**Actions:**
1. Extract every acceptance criterion and assign a unique ID (AC-001, AC-002, ...).
2. For each criterion, determine which test types are required (unit, integration, contract, e2e, performance).
3. Identify all services, modules, and components that need test coverage.
4. Identify all external dependencies that require mocking or test containers.
5. Identify critical user flows for E2E coverage.
6. Identify performance-sensitive endpoints for load testing.
7. Define coverage thresholds per service (lines, branches, functions).

**Output:** Write `.forgewright/qa-engineer/test-plan.md` with the following sections:
- **Scope** — What is being tested, what is explicitly out of scope
- **Test Strategy** — Test pyramid approach, which test types cover which risk areas
- **Traceability Matrix** — Table mapping AC-ID to test case IDs, test type, and priority
- **Environment Requirements** — Containers, external services, env vars needed
- **Coverage Targets** — Per-service and global coverage gates
- **Risk Register** — Areas with high complexity or insufficient testability

---

### Phase 2 — Unit Tests

**Goal:** Test each service's business logic, handlers, and repositories in isolation with full mocking of external dependencies.

**Inputs to read:**
- `services/` source code for each service
- The test plan from Phase 1

**Rules:**
1. One test file per source file. Mirror the source directory structure under `tests/unit/<service>/`.
2. Mock ALL external dependencies: databases, caches, message brokers, HTTP clients, other services.
3. Use dependency injection or module mocking — never patch globals.
4. Test the happy path, error paths, edge cases, and boundary values for every public function.
5. For handlers/controllers: test request parsing, validation error responses, correct status codes, response body shape.
6. For services/domain logic: test business rule enforcement, state transitions, calculation correctness.
7. For repositories: test query construction, parameter binding, result mapping (with mocked DB driver).
8. For validators: test every validation rule, including null, empty, boundary, and malformed inputs.
9. Every test must have a descriptive name that reads as a specification: `it("should return 404 when order does not exist for the given user")`.
10. Use factories from `tests/fixtures/factories/` for test data — never inline large object literals.
11. Assert on specific values, not just truthiness. Prefer `toEqual` over `toBeTruthy`.
12. Test error types and messages, not just that an error was thrown.

**Output:** Write test files to `tests/unit/<service>/`.

Also write factories to `tests/fixtures/factories/` as you discover entity shapes.

---

### Phase 3 — Integration Tests

**Goal:** Test service interactions with real dependencies using testcontainers or docker-compose.

**Inputs to read:**
- `services/` database migrations, schemas, connection configs
- `docs/architecture/` infrastructure requirements (which DBs, caches, brokers)
- The test plan from Phase 1

**Rules:**
1. Write `tests/integration/docker-compose.test.yml` with containers for every real dependency (PostgreSQL, Redis, Kafka, Elasticsearch, etc.). Pin exact image versions.
2. Write `tests/integration/setup.ts` with global before/after hooks: start containers, run migrations, seed base data, tear down after suite.
3. Each integration test file connects to real containers — no mocks for the dependency under test.
4. Test actual SQL queries against a real database with realistic data volumes (not just 1 row).
5. Test cache read/write/eviction with a real Redis instance.
6. Test message publishing and consumption with a real broker.
7. Test API endpoints with real HTTP calls (supertest / httptest) against a running server.
8. Each test must clean up its own data. Use transactions with rollback, or truncate tables in afterEach.
9. Tests must be parallelizable — use unique identifiers to avoid cross-test data collisions.
10. Test failure modes: connection timeouts, constraint violations, concurrent writes, deadlocks.

**Output:** Write test files to `tests/integration/<service>/`.

Write `docker-compose.test.yml` and `setup.ts` to `tests/integration/`.

---

### Phase 4 — Contract Tests

**Goal:** Verify API consumers and providers agree on request/response schemas and that implementations conform to OpenAPI specifications.

**Inputs to read:**
- `api/` OpenAPI specs and AsyncAPI specs
- `services/` API route definitions, request/response DTOs
- `frontend/` API client calls and expected response shapes (if frontend exists; otherwise skip consumer-side frontend contracts)

**Rules:**
1. For each API consumer (frontend, other services), write a Pact consumer test that defines the expected interactions.
2. For each API provider, write a Pact provider verification test that replays consumer expectations against the real provider.
3. Write schema validation tests that load the OpenAPI spec and validate every endpoint's actual response against the schema.
4. Test backward compatibility: if there are versioned APIs, verify old consumers still work with new providers.
5. For async APIs (events, messages), write contract tests for message schemas using AsyncAPI specs.
6. Configure Pact Broker connection in `pact-broker.config.ts` (even if the broker URL is a placeholder).
7. Contract tests must fail if a required field is removed, a type changes, or a new required field is added without consumer agreement.

**Output:** Write contract tests to `tests/contract/`.

---

### Phase 5 — E2E Tests

**Goal:** Test critical user flows end-to-end through the full stack.

**Inputs to read:**
- BRD / PRD user stories and acceptance criteria (especially the critical path)
- `frontend/` pages and navigation flow (if frontend exists; otherwise API-only E2E)
- `services/` API endpoints
- The test plan from Phase 1 (critical user flows identified)

**Rules:**
1. Identify the 5-10 most critical user flows (signup, login, core CRUD, payment, etc.).
2. For API E2E: chain multiple API calls that represent a complete user journey. Use real auth tokens. Validate side effects (DB state, emails sent, events published).
3. For UI E2E (skip if frontend not found): use Page Object Model pattern. Each page gets a class in `tests/e2e/ui/pages/`.
4. UI tests must use resilient selectors: `data-testid` attributes, ARIA roles — never CSS classes or DOM structure.
5. Write a smoke test suite (`smoke.e2e.ts`) that covers the absolute minimum "is the app alive" checks. This runs on every deploy.
6. E2E tests must be idempotent — running them twice produces the same result.
7. Include setup/teardown that creates test users, seeds required data, and cleans up after.
8. Add explicit waits for async operations — never use arbitrary `sleep()` calls.
9. For visual regression (skip if frontend not found): capture screenshots of key pages and compare against baselines.
10. Configure test timeouts generously (30s+ per test) — E2E is slow by nature.

**Output:** Write E2E tests and page objects to `tests/e2e/`. Write Playwright or Cypress config.

---

### Phase 5b — Playwright Browser Automation (NEW)

**Goal:** Run real browser-based E2E tests using Playwright to validate UI flows, visual regression, multi-viewport responsiveness, and accessibility — going beyond code-level E2E to actual browser interaction.

**Prerequisite:** Only runs if `frontend/` exists. Skip entirely for API-only projects.

**Inputs to read:**
- E2E test specs written in Phase 5
- `frontend/` pages and components
- BRD critical user flows
- Design system tokens (for visual regression baseline colors/spacing)

**Rules:**
1. **Install Playwright** — add `@playwright/test` to the project. Configure `tests/e2e/ui/playwright.config.ts` with:
   - Browsers: Chromium + Firefox + WebKit (all three for cross-browser coverage)
   - Viewports: Mobile (375×667), Tablet (768×1024), Desktop (1440×900)
   - Base URL from environment variable `PLAYWRIGHT_BASE_URL`
   - Screenshot on failure: enabled
   - Video on failure: enabled (retain-on-failure)
   - Trace on failure: enabled (retain-on-failure)
   - Global timeout: 30 seconds per test
   - Retries: 2 in CI, 0 locally

2. **Page Object Model** — every page gets a POM class in `tests/e2e/ui/pages/`:
   ```typescript
   export class LoginPage {
     constructor(private page: Page) {}
     async goto() { await this.page.goto('/login'); }
     async login(email: string, password: string) {
       await this.page.getByLabel('Email').fill(email);
       await this.page.getByLabel('Password').fill(password);
       await this.page.getByRole('button', { name: 'Sign in' }).click();
     }
     async expectError(message: string) {
       await expect(this.page.getByRole('alert')).toContainText(message);
     }
   }
   ```

3. **Accessibility-first selectors** — use ARIA roles (`getByRole`), labels (`getByLabel`), placeholder text (`getByPlaceholder`), and `data-testid` attributes. Avoid CSS selectors or XPath because they couple tests to implementation details (class names, DOM structure) that change frequently, causing brittle tests that break on every UI refactor.

4. **Visual regression tests** — capture full-page and component screenshots, compare against baseline:
   ```typescript
   test('dashboard matches visual baseline', async ({ page }) => {
     await page.goto('/dashboard');
     await expect(page).toHaveScreenshot('dashboard.png', { maxDiffPixelRatio: 0.01 });
   });
   ```
   - Store baselines in `tests/e2e/ui/visual/__screenshots__/`
   - Configure threshold: maxDiffPixelRatio = 0.01 (1% pixel tolerance)
   - Generate baselines per OS/browser combination

5. **Multi-viewport testing** — every critical flow runs at 3 viewports:
   ```typescript
   const viewports = [
     { name: 'mobile', width: 375, height: 667 },
     { name: 'tablet', width: 768, height: 1024 },
     { name: 'desktop', width: 1440, height: 900 },
   ];
   for (const vp of viewports) {
     test(`${vp.name}: navigation menu works`, async ({ page }) => {
       await page.setViewportSize(vp);
       // test responsive behavior
     });
   }
   ```

6. **Accessibility scanning** — integrate `@axe-core/playwright` for automated WCAG 2.1 AA checks:
   ```typescript
   import AxeBuilder from '@axe-core/playwright';
   test('page is accessible', async ({ page }) => {
     await page.goto('/dashboard');
     const results = await new AxeBuilder({ page }).analyze();
     expect(results.violations).toEqual([]);
   });
   ```
   - Run axe scan on every page
   - Fail on any WCAG 2.1 AA violations
   - Generate accessibility report to `.forgewright/qa-engineer/a11y-report.md`

7. **Network mocking** — for external API calls, use `page.route()` to mock responses:
   ```typescript
   await page.route('**/api/payments/**', route => route.fulfill({
     status: 200, body: JSON.stringify({ success: true }),
   }));
   ```

8. **Authentication fixture** — create a shared auth fixture that logs in once and reuses session:
   ```typescript
   // tests/e2e/ui/fixtures/auth.fixture.ts
   export const test = base.extend<{ authenticatedPage: Page }>({
     authenticatedPage: async ({ browser }, use) => {
       const context = await browser.newContext({ storageState: 'auth.json' });
       const page = await context.newPage();
       await use(page);
       await context.close();
     },
   });
   ```

9. **CI integration** — add Playwright to `.github/workflows/test.yml`:
   - Cache browser binaries
   - Run with `--shard` for parallel execution across CI runners
   - Upload test results, screenshots, videos, and traces as artifacts
   - Generate HTML report with `playwright show-report`

10. **Performance assertions** — validate Core Web Vitals:
    ```typescript
    const metrics = await page.evaluate(() => JSON.stringify(performance.getEntriesByType('navigation')));
    // Assert LCP < 2.5s, FID < 100ms, CLS < 0.1
    ```

**Output:**
```
tests/e2e/ui/
├── playwright.config.ts           # Multi-browser, multi-viewport config
├── pages/                          # Page Object Models
│   ├── login.page.ts
│   ├── dashboard.page.ts
│   └── settings.page.ts
├── flows/                          # User flow specs
│   ├── auth.spec.ts               # Login, register, forgot password
│   ├── onboarding.spec.ts         # First-time user experience
│   └── core-workflow.spec.ts      # Main business flow
├── visual/                         # Visual regression specs
│   ├── pages.visual.ts            # Full-page screenshot comparisons
│   ├── components.visual.ts       # Component-level visual tests
│   └── __screenshots__/           # Baseline screenshots (git-tracked)
├── a11y/                           # Accessibility specs
│   ├── pages.a11y.ts              # Per-page WCAG 2.1 AA scans
│   └── components.a11y.ts         # Component-level a11y checks
├── responsive/                     # Multi-viewport specs
│   └── viewport.spec.ts           # Mobile/tablet/desktop breakpoints
├── fixtures/
│   ├── auth.fixture.ts            # Shared authentication state
│   └── test-data.fixture.ts       # Shared test data helpers
└── global-setup.ts                 # Playwright global setup (auth, seed data)
```

---

### Phase 5c — Midscene Vision Testing (NEW)

**Goal:** Add vision-based, natural-language UI testing that eliminates brittle selectors and extends E2E coverage to mobile platforms (Android/iOS) — powered by [Midscene.js](https://midscenejs.com) (12k+ ⭐, MIT).

**Prerequisite:** Midscene environment variables must be configured (see Setup). If not configured, skip this phase with: `[DEGRADED: Midscene not configured — skipping vision tests]`

**Why Midscene alongside Playwright:**
- Playwright = deterministic, fast, selector-based → great for CI regression
- Midscene = vision-based, natural language, cross-platform → great for visual QA, mobile, and canvas UIs
- Together = comprehensive coverage with complementary strengths

**Setup:**
```bash
# Install Midscene for Playwright integration
npm install @midscene/web --save-dev

# Configure model (in .env or environment)
MIDSCENE_MODEL_API_KEY="your-api-key"
MIDSCENE_MODEL_NAME="gemini-3-flash"            # Recommended: fast + cheap
MIDSCENE_MODEL_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
MIDSCENE_MODEL_FAMILY="gemini"
```

**For cross-platform testing (mobile/desktop), install skills:**
```bash
npx skills add web-infra-dev/midscene-skills
```

**Rules:**

1. **Vision-based E2E tests** — write natural language test flows using Midscene + Playwright:
   ```typescript
   import { PlaywrightAiFixture } from '@midscene/web/playwright';
   import { test as base } from '@playwright/test';

   const test = base.extend<PlaywrightAiFixture>(PlaywrightAiFixture());

   test('user can complete checkout', async ({ page, ai, aiAssert }) => {
     await page.goto('/products');

     // Vision-based interactions — no selectors needed
     await ai('click on the first product card');
     await ai('click "Add to Cart" button');
     await ai('click the shopping cart icon in the header');
     await aiAssert('the cart shows 1 item');
     await ai('click "Proceed to Checkout"');
     await ai('fill in shipping address with test data');
     await ai('click "Place Order"');
     await aiAssert('order confirmation page is displayed with order number');
   });
   ```

2. **Natural language assertions** — use `aiAssert()` for visual state validation:
   ```typescript
   // Assert UI state without knowing DOM structure
   await aiAssert('the navigation menu has 5 items');
   await aiAssert('the user avatar shows initials "JD"');
   await aiAssert('the price is displayed in red with a strikethrough');
   await aiAssert('the loading spinner is not visible');
   await aiAssert('dark mode is active — background is dark');
   ```

3. **Data extraction** — use `aiQuery()` to extract structured data from UI:
   ```typescript
   const products = await aiQuery(
     { productNames: 'string[]', totalPrice: 'string' },
     'extract all product names and total price from the cart'
   );
   expect(products.productNames).toHaveLength(3);
   ```

4. **Canvas and complex UI testing** — Midscene works on `<canvas>`, WebGL, SVG, and other non-DOM UIs:
   ```typescript
   test('chart renders correctly', async ({ page, ai, aiAssert }) => {
     await page.goto('/analytics');
     await aiAssert('a bar chart is displayed with monthly revenue data');
     await aiAssert('the Y-axis shows dollar amounts');
     await ai('hover over the tallest bar');
     await aiAssert('a tooltip shows the revenue value');
   });
   ```

5. **Mobile testing with Midscene Skills** (when midscene-skills installed):
   ```typescript
   // Android testing via ADB
   // Invoke: "Use Midscene android skill to test the login flow"

   // iOS testing via WebDriverAgent
   // Invoke: "Use Midscene ios skill to open the app and verify home screen"
   ```
   - Android: requires ADB connection to device/emulator
   - iOS: requires WebDriverAgent running on device/simulator

6. **Test caching** — enable caching for faster reruns (Midscene caches vision model responses):
   ```typescript
   await ai('click the submit button', { cacheable: true });
   ```
   - First run: model analyzes screenshot (~2-3s per action)
   - Cached run: instant replay from cache
   - Cache invalidates when UI changes significantly

7. **Visual replay reports** — Midscene generates interactive HTML reports showing every step:
   ```typescript
   // After test suite completes, reports are at:
   // ./midscene_run/report/
   // Each step shows: screenshot → action → result
   ```

8. **Deep Think mode** — for complex multi-step interactions:
   ```typescript
   await ai('find the settings gear icon, open it, navigate to "API Keys" tab, and copy the first key', {
     deepThink: true,  // Model reasons step-by-step before acting
   });
   ```

9. **Guard Rails:**
   - Model API costs: ~$0.001-0.01 per vision call (Gemini Flash)
   - Latency: ~2-5s per `ai()` call (model inference + action)
   - Use Playwright selectors for speed-critical CI tests
   - Use Midscene for visual QA, exploratory testing, and mobile
   - Always have a `.env` or environment config — never hardcode API keys
   - ⚠️ Midscene can control EVERYTHING on screen — scope tests carefully

**Output:**
```
tests/e2e/vision/
├── midscene.config.ts              # Midscene model + report settings
├── flows/
│   ├── <user-flow>.vision.ts       # Vision-based E2E test specs
│   └── canvas-ui.vision.ts         # Canvas/complex UI tests
├── mobile/                          # Mobile test specs (when applicable)
│   ├── android/
│   │   └── <flow>.android.ts
│   └── ios/
│       └── <flow>.ios.ts
└── reports/                         # Auto-generated visual replay reports
```

---

### Phase 6 — Performance Tests

**Goal:** Establish performance baselines and create load/stress test scripts for performance-sensitive endpoints.

**Inputs to read:**
- `docs/architecture/` NFRs (latency targets, throughput requirements, SLOs)
- `services/` API endpoints (especially high-traffic ones)
- The test plan from Phase 1 (performance-sensitive areas)

**Rules:**
1. Write k6 scripts (JavaScript). Each script targets a specific scenario (e.g., "user browsing products", "checkout flow under load").
2. Load tests: simulate sustained normal traffic. Define realistic ramp-up patterns (e.g., 0 -> 100 VUs over 2 min, hold 10 min, ramp down).
3. Stress tests: find the breaking point. Ramp VUs aggressively until error rate exceeds 5% or p99 exceeds SLO.
4. Spike tests: simulate sudden traffic bursts (0 -> 500 VUs in 10 seconds).
5. Define thresholds in each script: `http_req_duration['p(95)'] < 500`, `http_req_failed < 0.01`.
6. Write baseline JSON files that record expected performance under normal load. CI compares against these.
7. Use realistic test data — not the same request repeated. Parameterize with CSV data files or k6 SharedArray.
8. Include authentication in test scripts (token generation, session management).
9. Test both read-heavy and write-heavy endpoints separately.
10. Add custom metrics for business-critical operations (e.g., `order_processing_time`).

**Output:** Write k6 scripts to `tests/performance/`. Write baseline files to `tests/performance/baselines/`.

---

### Phase 7 — Test Infrastructure

**Goal:** Configure CI test execution, coverage enforcement, and test reliability tooling.

**Inputs to read:**
- All test files generated in Phases 2-6 (including Playwright from Phase 5b)
- Coverage thresholds from the test plan
- Project CI/CD system (GitHub Actions, GitLab CI, etc.)

**Actions:**
1. Write `tests/coverage/thresholds.json` with per-service and global coverage gates:
   ```json
   {
     "global": { "lines": 80, "branches": 75, "functions": 80, "statements": 80 },
     "services": {
       "<service-name>": { "lines": 85, "branches": 80, "functions": 85, "statements": 85 }
     }
   }
   ```
2. Write `.github/workflows/test.yml` (or `ci/test-config.yml`) with:
   - **Unit test stage** — runs first, fast, no containers. Fails fast on coverage threshold breach.
   - **Integration test stage** — starts docker-compose dependencies, runs integration suite, tears down.
   - **Contract test stage** — runs Pact tests, publishes results to broker.
   - **E2E test stage** — deploys to test environment, runs smoke + full E2E suite.
   - **Playwright test stage** — installs browsers, runs visual regression + a11y + responsive tests, uploads screenshots/traces/videos as artifacts.
   - **Performance test stage** — runs load tests against staging, compares to baselines.
   - Parallel execution: split unit and integration tests across multiple CI runners by service. Shard Playwright tests across runners.
   - Test result artifacts: JUnit XML reports, coverage HTML reports, k6 JSON results, Playwright HTML report.
   - Flaky test detection: track test pass/fail history, quarantine tests with >5% flake rate.
   - Retry policy: retry failed E2E/Playwright tests up to 2 times before marking as failed.
3. Write seed data runner to `tests/fixtures/seed-data/seed-runner.ts`.
4. Write external API mock configurations to `tests/fixtures/mocks/`.

**Output:** Write CI config to `.github/workflows/test.yml`, coverage thresholds and test infrastructure to `tests/`.

---

## Common Mistakes

| # | Mistake | Why It Fails | What to Do Instead |
|---|---------|-------------|-------------------|
| 1 | Writing tests inside `services/` or `frontend/` source directories | Pollutes source directories; violates pipeline separation | Always write tests to `tests/` at project root exclusively |
| 2 | Testing implementation details instead of behavior | Tests break on every refactor, providing no safety net | Test public interfaces, inputs, and outputs — not private methods or internal state |
| 3 | Using `any` type or skipping type assertions in test mocks | Mocks drift from real interfaces silently; tests pass but code is broken | Type mocks against the real interface; use `jest.Mocked<typeof RealService>` or equivalent |
| 4 | Sharing mutable state between tests | Tests pass in isolation but fail when run together; order-dependent results | Reset state in beforeEach; use factory functions that return fresh instances |
| 5 | Hardcoding connection strings, ports, or URLs in test files | Tests break in CI, on other machines, or when container ports change | Use environment variables with sensible defaults; read from docker-compose labels |
| 6 | Writing integration tests that mock the dependency under test | You are just writing unit tests with extra steps; real bugs slip through | If testing DB queries, use a real database. If testing cache, use real Redis. Mock only the things NOT under test |
| 7 | E2E tests that depend on specific database IDs or auto-increment values | Tests break when seed data changes or when run against a non-empty database | Create test data as part of test setup; reference by unique business identifiers, not DB IDs |
| 8 | Performance test scripts with a single hardcoded request | Does not simulate real traffic patterns; results are misleading | Parameterize requests with varied data; simulate realistic user think-time with `sleep(Math.random() * 3)` |
| 9 | Coverage thresholds set to 100% | Encourages meaningless tests written just to hit the number; blocks legitimate PRs | Set realistic thresholds (80-85% lines, 75-80% branches); focus on critical path coverage |
| 10 | Ignoring test execution time | Slow test suites get skipped by developers; CI feedback loops become painful | Parallelize tests by service; keep unit suite under 60 seconds; keep integration suite under 5 minutes |
| 11 | Not testing error paths and failure modes | Happy-path-only tests miss the bugs that actually cause production incidents | For every success test, write at least one failure test: invalid input, timeout, auth failure, conflict |
| 12 | Writing E2E tests with `sleep()` for async waits | Flaky on slow CI runners; wastes time on fast ones | Use explicit wait-for conditions: poll for element visibility, API response, or DB state change |
| 13 | Contract tests that only check status codes | Schema changes, missing fields, and type mismatches go undetected | Validate full response body shape, field types, required fields, and enum values against the contract |
| 14 | No seed data strategy — each test creates its own world from scratch | Integration and E2E suites become extremely slow; redundant setup logic everywhere | Build a shared seed-data layer with factories and a seed runner; tests add only their unique data on top |
| 15 | Generating test files without reading the actual implementation first | Tests reference nonexistent functions, wrong parameter names, or incorrect module paths | Always read the source file before writing its test file; match imports, function signatures, and error types exactly |
| 16 | Playwright tests using CSS selectors or XPath | Brittle selectors break on every UI refactor; maintenance nightmare | Use ARIA roles (getByRole), labels (getByLabel), data-testid — accessibility-first selectors only |
| 17 | Visual regression tests without viewport pinning | Screenshots differ across OS/resolution, causing false positives | Always pin viewport size, disable animations, and use per-OS/browser baselines |
| 18 | Skipping Playwright in CI because "browsers are heavy" | Visual regressions and a11y violations ship to production undetected | Cache browser binaries, shard tests across runners, run only critical visual checks on PR |

---

## Quick-Invoke Modes

These modes allow targeted invocation of specific testing capabilities without running the full pipeline.

### API Contract Testing Mode

Invoked when the orchestrator routes with focus on API validation only.

1. Read all OpenAPI/AsyncAPI specs from `api/` or `docs/`
2. Generate schema validation tests (every endpoint response vs spec)
3. Generate consumer-driven contract tests (Pact) for each API consumer
4. Generate backward compatibility tests for versioned APIs
5. Report findings: missing endpoints, schema mismatches, undocumented fields

### Performance Benchmarking Mode

Invoked for dedicated performance analysis without full QA pipeline.

1. Identify performance-critical endpoints (high traffic, data-heavy, user-facing)
2. Write k6 scripts: load, stress, spike, soak scenarios
3. Establish baselines: p50/p95/p99 latency, throughput, error rate
4. Identify breaking point (error rate > 1% or p99 > SLO)
5. Generate performance report with bottleneck analysis and optimization recommendations

---

## Execution Checklist

Before marking the skill as complete, verify:

- [ ] `.forgewright/qa-engineer/test-plan.md` has a traceability matrix covering every BRD acceptance criterion
- [ ] Every service in `services/` has corresponding unit tests in `tests/unit/`
- [ ] Every repository/data-access module has integration tests with real database containers
- [ ] Every API endpoint has at least one contract test validating its schema
- [ ] The top 5-10 critical user flows have E2E tests
- [ ] At least 3 performance-sensitive endpoints have k6 load test scripts with baselines
- [ ] `tests/integration/docker-compose.test.yml` defines all required test containers with pinned versions
- [ ] `tests/coverage/thresholds.json` defines realistic per-service coverage gates
- [ ] `.github/workflows/test.yml` orchestrates all test stages with parallelization and artifact collection
- [ ] All test factories are in `tests/fixtures/factories/` and reused across test types
- [ ] No test file has hardcoded secrets, credentials, or environment-specific values
- [ ] All tests can run independently and in any order
- [ ] **(Playwright)** `tests/e2e/ui/playwright.config.ts` configures 3 browsers × 3 viewports
- [ ] **(Playwright)** Page Object Models exist for every critical page
- [ ] **(Playwright)** Visual regression baselines are generated and committed
- [ ] **(Playwright)** Every page passes `@axe-core/playwright` WCAG 2.1 AA scan
- [ ] **(Playwright)** Auth fixture reuses session state across tests
- [ ] **(Playwright)** `.forgewright/qa-engineer/a11y-report.md` is generated
- [ ] **(Midscene)** `@midscene/web` installed and model configured in `.env`
- [ ] **(Midscene)** Vision-based E2E tests written for critical user flows at `tests/e2e/vision/`
- [ ] **(Midscene)** Natural language assertions validate visual UI state
- [ ] **(Midscene)** Canvas/complex UI tests cover non-DOM elements (if applicable)
- [ ] **(Midscene)** Mobile tests written for Android/iOS (if mobile app exists)
- [ ] **(Midscene)** Visual replay reports generated at `midscene_run/report/`
