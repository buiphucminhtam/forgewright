# Phase 5: Testing & Accessibility

## Objective

Establish comprehensive testing coverage and accessibility compliance — component testing (Vitest + Testing Library), E2E testing (Playwright), accessibility audit (axe-core, WCAG 2.1 AA), performance budgets (Core Web Vitals), visual regression testing, and cross-browser strategy.

## Context Bridge

Read Phase 3 component inventory from `.forgewright/frontend-engineer/docs/component-inventory.md`. Read Phase 4 pages from `frontend/app/pages/` for route coverage.

## Workflow

### Step 1: Component Testing

Set up component tests with the project's framework (Vitest + @testing-library/react recommended for React/Next.js). Test every component across all states:

- **UI primitives:** All variants (primary, secondary, destructive), interactive states (hover, focus, disabled, loading), edge cases (long text, empty)
- **Feature components:** Mocked API data via MSW — loading skeleton, success, error with retry, empty state with CTA
- **Custom hooks:** @testing-library/react-hooks with renderHook
- **A11y per component:** `jest-axe` assertion in every component test

Coverage target: 80% branch coverage on component files, 100% for hooks and utilities.

Produce tests in `frontend/tests/components/` mirroring the component directory structure.

### Step 2: End-to-End Testing (Playwright)

Configure Playwright with projects for Desktop Chrome, Firefox, Safari (WebKit), Mobile Chrome (Pixel 5), and Mobile Safari (iPhone 13). Enable trace-on-first-retry and screenshot-only-on-failure.

Write E2E tests for every critical user flow from Phase 1: authentication (signup, login, logout, session expiry), onboarding, core CRUD operations, navigation and deep linking, admin operations. Use role-based test fixtures for multi-role flows.

Produce E2E tests in `frontend/tests/e2e/` and `frontend/playwright.config.ts`.

### Step 3: Accessibility Audit

**Automated (axe-core):**
- `jest-axe` in every component test (Step 1)
- `@axe-core/playwright` full-page audits on every route in E2E
- Target: **WCAG 2.1 AA** with zero critical violations
- `eslint-plugin-jsx-a11y` at error level in ESLint — CI fails on violation

**Manual checklist:**
- Keyboard: every interactive element reachable via Tab, activatable via Enter/Space
- Focus: trapped in modals, returned to trigger on close
- Screen reader: all images have alt text, all inputs have labels, live regions for dynamic updates
- Color contrast: 4.5:1 normal text, 3:1 large text
- Motion: `prefers-reduced-motion` respected

Produce `.forgewright/frontend-engineer/docs/a11y-audit.md`.

### Step 4: Performance Budget (Core Web Vitals)

Define and enforce via Lighthouse CI:

| Metric | Target | Tool |
|--------|--------|------|
| **LCP** | < 2.5s | Lighthouse CI |
| **INP** | < 200ms | Lighthouse CI |
| **CLS** | < 0.1 | Lighthouse CI |
| **TTFB** | < 800ms | Lighthouse CI |
| **Initial bundle** | < 200 KB gzip | @next/bundle-analyzer |
| **Per-route JS** | < 50 KB gzip | @next/bundle-analyzer |

Configure `lighthouserc.json` with minScore assertions (performance 0.9, accessibility 0.95, best-practices 0.9) and numeric thresholds for LCP, TTI, CLS.

Produce `frontend/lighthouserc.json` and `.forgewright/frontend-engineer/docs/performance-budget.md`.

### Step 5: Visual Regression Testing

Capture baseline screenshots per component and page across viewports using Playwright `toHaveScreenshot()` or Chromatic. Pixel diff tolerance: 0.1%. CI blocks merge on unexpected visual diff.

Produce visual regression configs in `frontend/tests/visual/`.

### Step 6: Cross-Browser Testing Strategy

| Browser | Versions | Method | Priority |
|---------|----------|--------|----------|
| Chrome | Latest 2 | Playwright CI | P0 |
| Firefox | Latest 2 | Playwright CI | P0 |
| Safari | Latest 2 | Playwright WebKit | P0 |
| Edge | Latest 2 | Covered by Chromium | P1 |
| Mobile Chrome | Latest | Playwright emulation | P0 |
| Mobile Safari | Latest | Playwright emulation | P0 |

Produce `.forgewright/frontend-engineer/docs/browser-support.md`.

## Output Files

- `frontend/tests/components/` (component tests with a11y)
- `frontend/tests/e2e/` (Playwright E2E tests)
- `frontend/tests/visual/` (visual regression)
- `frontend/playwright.config.ts`
- `frontend/lighthouserc.json`
- `.forgewright/frontend-engineer/docs/a11y-audit.md`
- `.forgewright/frontend-engineer/docs/performance-budget.md`
- `.forgewright/frontend-engineer/docs/browser-support.md`

## Validation Loop

Before concluding the frontend skill:
- [ ] Every UI primitive has component tests covering all variants, states, and a11y
- [ ] Every critical user flow has an E2E test
- [ ] WCAG 2.1 AA with zero critical violations
- [ ] Performance budget defined and enforced in CI
- [ ] Visual regression baselines captured
- [ ] Cross-browser matrix tested (Chrome, Firefox, Safari, mobile)

**Present testing summary with coverage report, a11y audit results, and performance scores to user.**

## Quality Bar

Every component must have at least one accessibility test. "Tests pass" is not acceptable -- "94 component tests (87% branch coverage), 12 E2E flows, zero WCAG 2.1 AA violations, LCP 1.8s (budget: 2.5s), CLS 0.04 (budget: 0.1), bundle 156 KB gzip (budget: 200 KB)" is acceptable.
