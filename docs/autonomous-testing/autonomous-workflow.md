# Autonomous Testing & Self-Healing Workflow

> Complete system for autonomous code → test → detect bug → fix → continue development.

## The Problem

```
Traditional Flow (Manual):
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Code   │───►│  Test   │───►│  Find   │───►│  User   │
│ Feature │    │ Manual  │    │  Bug    │    │  Fix    │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     │                                          ▲
     └──────────────────────────────────────────┘
                    (Repeat)
```

```
Autonomous Flow (Self-Healing):
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Code   │───►│  Auto   │───►│  Detect │───►│  Auto   │
│ Feature │    │  Test   │    │   Bug   │    │   Fix   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     │                                          │
     │            ┌─────────┐                  │
     └───────────►│ Continue│◄─────────────────┘
                  │ Dev    │
                  └─────────┘
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS TESTING SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐            │
│  │    Code      │───►│    Test      │───►│    Detect    │            │
│  │   Feature    │    │   Runner     │    │     Bug      │            │
│  └──────────────┘    └──────────────┘    └──────────────┘            │
│       │                    │                    │                      │
│       │                    │                    ▼                      │
│       │                    │            ┌──────────────┐            │
│       │                    │            │   Analyze    │            │
│       │                    │            │    Error     │            │
│       │                    │            └──────────────┘            │
│       │                    │                    │                      │
│       │                    │                    ▼                      │
│       │                    │            ┌──────────────┐            │
│       │                    │            │   Decision   │            │
│       │                    │            │   Engine     │            │
│       │                    │            └──────────────┘            │
│       │                    │                    │                      │
│       │          ┌─────────┴─────────┐         │                      │
│       │          │                   │         ▼                      │
│       │          ▼                   ▼   ┌──────────────┐            │
│       │    ┌───────────┐       ┌───────────┐    │    Fix     │            │
│       │    │   Unit    │       │   Visual   │───►│   Code     │            │
│       │    │   Tests   │       │   Tests    │    └──────────────┘            │
│       │    └───────────┘       └───────────┘          │                      │
│       │          │                   │                ▼                      │
│       │          ▼                   ▼          ┌──────────────┐            │
│       │    ┌───────────┐       ┌───────────┐   │    Re-test   │            │
│       │    │  Static   │       │  Screenshot│───►│    Verify    │            │
│       │    │  Analysis │       │  Compare   │   └──────────────┘            │
│       │    └───────────┘       └───────────┘          │                      │
│       │          │                   │                ▼                      │
│       │          └───────────────────┴─────────┐      ┌──────────────┐      │
│       │                                          │      │   Continue   │      │
│       └──────────────────────────────────────────└─────►│    Dev      │      │
│                                                            └──────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Test Layers

### Layer 1: Unit Tests (Fast - 10ms/test)

```typescript
// Automated via Jest/Vitest
// Run on every file save
// Fail = auto-fix or rollback
```

### Layer 2: Integration Tests (Medium - 100ms/test)

```typescript
// Automated via Supertest/Playwright
// API + Component integration
// Fail = detailed error report
```

### Layer 3: Visual Regression Tests (Slow - 1s/test)

```typescript
// Automated via Playwright + Applitools
// Screenshot comparison
// Detect UI changes automatically
```

### Layer 4: E2E Tests (Slowest - 10s/test)

```typescript
// Automated via Playwright
// Full user flows
// Fail = autonomous fix attempt
```

---

## Self-Healing Decision Tree

```
┌─────────────────────────────────────────────────────────┐
│                  BUG DETECTED                           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Error Type?          │
              └───────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │  Syntax   │   │  Logic    │   │   UI/UX   │
   │   Error   │   │   Bug     │   │   Bug     │
   └───────────┘   └───────────┘   └───────────┘
         │                │                │
         ▼                ▼                ▼
   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │  Auto-fix │   │  Analyze  │   │  Screenshot│
   │  via AI   │   │  + Suggest│   │  Compare   │
   └───────────┘   └───────────┘   └───────────┘
         │                │                │
         ▼                ▼                ▼
   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │ Re-test   │   │ Human    │   │ Update    │
   │ + Deploy  │   │ Decision │   │ Baseline  │
   └───────────┘   └───────────┘   └───────────┘
```

---

## Implementation Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| **Code Generation** | Cursor AI / Claude | Write feature code |
| **Unit Tests** | Vitest / Jest | Logic validation |
| **API Tests** | Supertest | Backend validation |
| **Visual Tests** | Playwright + Applitools | UI regression |
| **E2E Tests** | Playwright | Full flow testing |
| **CI/CD** | GitHub Actions | Orchestration |
| **Error Analysis** | LLM | Root cause analysis |
| **Auto-Fix** | LLM (Claude/GPT-4) | Code repair |

---

## Workflow Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT LOOP                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │  CURSOR/CLAUDE: Write Feature Code                       │ │
│   │  + Auto-generate unit tests                              │ │
│   │  + Update existing tests                                 │ │
│   └──────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │  AUTOMATED TEST RUNNER                                   │ │
│   │  1. Vitest (unit tests) - ~10s                          │ │
│   │  2. Playwright (API + E2E) - ~60s                       │ │
│   │  3. Visual comparison (Applitools) - ~30s                │ │
│   └──────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │  RESULT ANALYSIS                                          │ │
│   │                                                          │ │
│   │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │ │
│   │  │  ALL PASS  │  │   TESTS   │  │   TESTS   │         │ │
│   │  │    ✓       │  │   FAIL    │  │   FAIL    │         │ │
│   │  └────────────┘  │  (Logic)  │  │   (UI)    │         │ │
│   │                  └────────────┘  └────────────┘         │ │
│   │                       │                │                  │ │
│   │                       ▼                ▼                  │ │
│   │  ┌────────────────────────────────────────────────┐     │ │
│   │  │  ERROR CLASSIFICATION                          │     │ │
│   │  │  - Syntax Error → Auto-fix                     │     │ │
│   │  │  - Logic Bug → LLM Analysis → Auto-fix        │     │ │
│   │  │  - UI Change → Screenshot Diff → Accept/Update│     │ │
│   │  │  - E2E Flow → Human Review Required            │     │ │
│   │  └────────────────────────────────────────────────┘     │ │
│   └──────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │  AUTONOMOUS FIX (if fixable)                            │ │
│   │                                                          │ │
│   │  1. Analyze error → Get context                         │ │
│   │  2. Generate fix → LLM suggests solution                 │ │
│   │  3. Apply fix → Edit code                               │ │
│   │  4. Re-test → Verify fix works                          │ │
│   │  5. If pass → Continue development                      │ │
│   │  6. If fail → Log + Human review                        │ │
│   └──────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │  COMMIT & CONTINUE                                      │ │
│   │  ✓ Tests pass                                          │ │
│   │  ✓ Build successful                                    │ │
│   │  → Next feature                                        │ │
│   └──────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tools Configuration

### 1. Vitest (Unit Tests)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Auto-run on save
    watch: true,
    // Report coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    // Retry failed tests once
    retry: 1,
    // Exit on first failure in CI
    bail: process.env.CI ? 1 : 0,
  },
})
```

### 2. Playwright (E2E + Visual)

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Setup
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    
    // Chromedriver
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },

    // Visual Testing (Applitools)
    {
      name: 'visual',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 3. Applitools (Visual AI)

```typescript
// tests/visual.config.ts
import { test, expect } from '@playwright/test';
const { Applitools } = require('@applitools/eyes-playwright');

test('homepage visual regression', async ({ page }) => {
  const eyes = new Applitools.Eyes();
  eyes.setApiKey(process.env.APPLITOOLS_API_KEY);
  
  await page.goto('/');
  
  // Full page visual check
  await eyes.check('Homepage', Applitools.Region.target());
  
  // Specific element check
  await eyes.check('Hero Section', page.locator('.hero'));
  
  // Interactive element check
  await page.click('.btn-primary');
  await eyes.check('After Click State');
  
  await eyes.close();
});
```

---

## CI/CD Pipeline

```yaml
# .github/workflows/autonomous-test.yml
name: Autonomous Testing

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  # ============================================
  # STEP 1: Code Analysis (Fast)
  # ============================================
  analyze:
    name: Code Analysis
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install deps
        run: npm ci
      
      - name: ESLint
        run: npm run lint
      
      - name: Type check
        run: npm run typecheck

  # ============================================
  # STEP 2: Unit Tests (Fast)
  # ============================================
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: analyze
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install deps
        run: npm ci
      
      - name: Run Unit Tests
        run: npm run test:unit
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v4

  # ============================================
  # STEP 3: Integration Tests (Medium)
  # ============================================
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install deps
        run: npm ci
      
      - name: Run API Tests
        run: npm run test:api
      
      - name: Run E2E Tests
        run: npm run test:e2e

  # ============================================
  # STEP 4: Visual Regression (Slow)
  # ============================================
  visual-tests:
    name: Visual Regression
    runs-on: ubuntu-latest
    needs: integration-tests
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install deps
        run: npm ci
      
      - name: Run Visual Tests
        run: npm run test:visual
        env:
          APPLITOOLS_API_KEY: ${{ secrets.APPLITOOLS_API_KEY }}

  # ============================================
  # STEP 5: Auto-Fix (On Failure)
  # ============================================
  auto-fix:
    name: Auto-Fix & Retry
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests, visual-tests]
    if: failure()
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install deps
        run: npm ci
      
      - name: Get Error Context
        run: |
          # Get failed test info
          echo "Failed tests detected. Analyzing..."
          
      - name: Auto-Fix via Claude
        uses: anthropics/anthropic-actions@latest
        with:
          api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Analyze the test failures and fix the code:
            
            1. Read the test files that failed
            2. Read the source code being tested
            3. Identify the root cause
            4. Fix the code
            5. Do NOT modify tests unless they are incorrect
            
            Return the fixed code changes.
      
      - name: Re-run Tests
        run: npm run test
      
      - name: Create PR if Fixed
        if: success()
        run: |
          git config user.name "Auto-Fix Bot"
          git config user.email "bot@forgewright.ai"
          git checkout -b fix/${{ github.sha }}
          git add -A
          git commit -m "fix: auto-fix test failures"
          git push origin fix/${{ github.sha }}
          gh pr create --title "Auto-Fix: Test Failures" --body "Automated fix from CI"

  # ============================================
  # STEP 6: Build & Deploy
  # ============================================
  build-deploy:
    name: Build & Deploy
    runs-on: ubuntu-latest
    needs: [visual-tests]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Build
        run: npm run build
      
      - name: Deploy
        run: npm run deploy
```

---

## NPM Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run --testPathPattern=tests/unit",
    "test:api": "vitest run --testPathPattern=tests/api",
    "test:e2e": "playwright test",
    "test:visual": "playwright test --project=visual",
    "test:all": "npm run test:unit && npm run test:api && npm run test:e2e",
    
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit",
    
    "ci": "npm run lint && npm run typecheck && npm run test:all"
  }
}
```

---

## Autonomous Agent Configuration

### Cursor Rules

```json
// .cursor/rules/autonomous-testing.json
{
  "name": "Autonomous Testing",
  "description": "Self-healing test-driven development",
  "rules": [
    {
      "pattern": "**/*.ts",
      "actions": {
        "on_save": [
          "Run related unit tests",
          "If fail: analyze error and auto-fix",
          "If still fail: notify and continue"
        ]
      }
    },
    {
      "pattern": "**/*.test.ts",
      "actions": {
        "on_save": [
          "Run specific test",
          "If fail: show error + suggested fix",
          "Auto-apply fix if confident"
        ]
      }
    }
  ]
}
```

### Claude Desktop Config

```json
// ~/.claude/projects/forgewright/settings.json
{
  "autonomous": {
    "enabled": true,
    "maxAutoFixAttempts": 3,
    "requireHumanApproval": false,
    "testOnSave": true,
    "autoCommitOnPass": true
  }
}
```

---

## Metrics & Reporting

### Dashboard Metrics

| Metric | Target | Alert |
|--------|--------|-------|
| Test Pass Rate | > 95% | < 90% |
| Mean Time to Fix | < 5 min | > 15 min |
| Auto-fix Success | > 80% | < 60% |
| False Positive Rate | < 5% | > 10% |

### Auto-Fix Categories

| Category | Auto-Fixable | Human Required |
|----------|--------------|----------------|
| Syntax Errors | ✅ 100% | - |
| Type Errors | ✅ 90% | Logic bugs |
| Logic Bugs | ⚠️ 60% | Complex |
| UI Changes | ⚠️ 40% | Intent changes |
| E2E Failures | ⚠️ 30% | Most |

---

## Quick Start

### 1. Install Dependencies

```bash
npm install -D vitest @playwright/test @applitools/eyes-playwright
npx playwright install --with-deps
```

### 2. Configure

```bash
cp .env.example .env
# Add APPLITOOLS_API_KEY
# Add ANTHROPIC_API_KEY (for auto-fix)
```

### 3. Run Autonomous Mode

```bash
# Start dev server + watch tests
npm run dev
npm run test:watch

# Or run full CI locally
npm run ci
```

### 4. Enable Auto-Fix

```bash
# Set environment
export AUTONOMOUS_MODE=true
export MAX_AUTO_FIX_ATTEMPTS=3

# Run - it will auto-fix failures
npm run ci
```

---

## Best Practices

1. **Fast feedback loop**: Unit tests should run in < 10s
2. **Isolate tests**: Each test independent
3. **Clear assertions**: Descriptive test names
4. **Minimal mocking**: Test real behavior when safe
5. **Visual baseline**: Update regularly in dev
6. **Auto-fix limits**: Max 3 attempts before human

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tests too slow | Run unit tests first, then E2E |
| Flaky tests | Use test retries, fix timing issues |
| Visual false positives | Update baselines, add tolerance |
| Auto-fix loops | Add human approval for complex fixes |

---

## See Also

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Applitools Visual AI](https://applitools.com/)
- [Cursor IDE Testing](https://cursor.sh/)
