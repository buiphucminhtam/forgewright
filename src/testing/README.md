# Autonomous Testing Infrastructure

## Directory Structure

```
src/testing/
├── unit/                    # Unit tests (Vitest)
│   ├── vitest.config.ts
│   ├── setup.ts
│   └── tests/
│       ├── core/
│       ├── utils/
│       └── mocks/
│
├── e2e/                     # E2E tests (Playwright + Healwright)
│   ├── playwright.config.ts
│   ├── healwright.config.ts
│   ├── page-objects/
│   └── tests/
│
├── agents/                  # Agentic testing (SEER Framework)
│   ├── seer/
│   ├── agents/
│   │   ├── test-pilot.ts
│   │   ├── api-builder.ts
│   │   ├── rover.ts
│   │   └── healer.ts
│   └── committee/
│
├── healing/                 # Self-healing engine (5D Model)
│   ├── element-5d/
│   │   ├── fingerprint.ts
│   │   ├── similarity.ts
│   │   └── healing.ts
│   ├── dom/
│   └── visual/
│
├── repair/                  # InspectCoder self-repair
│   ├── debugger/
│   ├── strategist/
│   └── executor/
│
├── security/                # FLARE security testing
│   ├── fuzzing/
│   ├── traces/
│   └── governance/
│
├── shift-right/             # Production intelligence
│   ├── sentry/
│   ├── logrocket/
│   └── datadog/
│
├── cli/                     # CLI commands
│   ├── commands/
│   │   ├── test/
│   │   │   ├── run.ts
│   │   │   ├── setup.ts
│   │   │   ├── heal.ts
│   │   │   ├── agents.ts
│   │   │   └── ...
│   │   └── ci/
│   └── index.ts
│
├── config/                  # Configuration
│   ├── llm-providers.ts    # Multi-provider (OpenAI, Anthropic, Gemini, Ollama, MiniMax)
│   └── defaults.ts
│
└── index.ts                 # Main exports
```

## Quick Commands

```bash
# Install dependencies
npm install -D vitest @vitest/ui playwright @playwright/test healwright inspectware

# Run tests
npm run test:unit    # Vitest
npm run test:e2e     # Playwright
npm run test:e2e:install # Install pinned Playwright 1.60.0 bundled Chromium shell
npm run test:heal   # Self-healing

# Setup
npm run test:setup
```

## Browser & Motion Verification Profile

- Root and E2E Playwright configs share `scripts/runtime/playwright_chromium.mjs` (`@playwright/test@1.60.0` default bundled headless shell; Darwin uses `--disable-frame-rate-limit` for unthrottled headless begin-frames).
- `scripts/runtime/verify_motion_drawer_artifact.mjs` verifies tokenized CSS, keyboard Enter/Escape focus restoration, capture-phase mid-transition reversal in both directions, and mobile `390x844` touch + `prefers-reduced-motion: reduce`.
