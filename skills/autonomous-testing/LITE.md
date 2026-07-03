---
name: autonomous-testing
description: "Orchestrates automated test execution, property-based testing (PBT), mutation testing, and visual/E2E test suites via Vitest, Stryker, fast-check, Playwright, or Maestro [1]. Use when the user requests automated testing pipelines, test suite creations, coverage audits, or validation of software quality gates before deployment [1, 2]."
version: 1.0.0
---

# Autonomous Testing (LITE)

## SOLVE Step 2: GROUND (Autonomous Testing Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target testing libraries (Vitest, Stryker, fast-check, Playwright, Maestro) are installed | `cat package.json \| jq '.dependencies, .devDependencies \| select(. != null) \| with_entries(select(.key \| match("vitest\|stryker\|fast-check\|playwright\|maestro")))'` | Confirms active testing frameworks and versions [1] | |
| Existing test configurations, suites, or specifications exist in the workspace | `find tests/ src/ -name "*.test.ts" -o -name "*.spec.ts" -o -name "playwright.config.ts"` | Lists active test files, configs, and automation harness targets [1] | |
| Standardized QA templates or acceptance criteria are defined | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs [3] | |
| Active API expenditure limit rules and token trackers are configured | `cat .forgewright/budget.yaml` | Verifies current session spend threshold rules and ceilings [2, 4] | |

## SOLVE Step 3: DECOMPOSE (Autonomous Testing Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Analyze test coverage reports, mutation scores, and property-based test bounds | Verify that code coverage and mutation tests comply with configured quality gate criteria [1, 5, 6].
2. GENERATE | Build automated BDD test specifications, mock stubs, or fast-check property-based suites | Ensure test stubs are registered under `tests/` matching BDD specifications prior to main code build [1, 2].
3. EXECUTE | Run local unit, integration, visual regression, or E2E mobile test suites | Confirm clean test passes on all endpoints, verify zero visual drift, and track execution status in the session graph [1, 7].
4. SYNC | Propagate test result reports and code coverage logs to the Shared Obsidian Vault | Run the post-skill sync hook to generate unified markdown logs and symlink reports to Obsidian [8].

## Common Mistakes Checklist
- **Testing implementation details instead of BDD specifications**: Writing fragile unit tests that couple tightly to private class internals instead of verifying functional BDD acceptance criteria [1, 2].
- **Ignoring Mutation or PBT verification**: Relying solely on raw code line coverage without running property-based or mutation testing, allowing low-assertion test cases to pass [1].
- **Dangling test runner ports**: Failing to close headless browser contexts or database socket handles on test cleanup, leading to port collisions or memory leaks.
- **Non-compliant test file naming**: Saving test specifications, configurations, or operations logs using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `tests/UserTest.ts` instead of `tests/user-test.ts`) [3].
- **Unverified AI Token spending**: Executing recursive test-and-repair autonomous loops without validating current budget limitations in `.forgewright/budget.yaml` [2, 4].

## Worked Example

### Step 1: Verify the testing framework configuration and project profile
```bash
cat .forgewright/project-profile.json
cat package.json | grep -E "(vitest|stryker)"
```
Output:
```json
{
  "project_name": "forgewright-qa-suite",
  "tech_stack": ["TypeScript", "Vitest", "Stryker"],
  "health_status": "PASS"
}
```
```json
    "vitest": "^1.6.0",
    "@stryker-mutator/core": "^8.0.0"
```

### Step 2: Write a BDD-aligned property-based test under `tests/user-validation.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Implementation target
const isValidUsername = (username: string): boolean => {
  return username.length >= 3 && username.length <= 15 && /^[a-z0-9-]+$/.test(username);
};

describe('Username Validation BDD-First Specs', () => {
  // Scenario: String boundary checks using property-based testing (PBT)
  it('should accept valid kebab-case strings and reject invalid inputs', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3, maxLength: 15 }), (input) => {
        const result = isValidUsername(input);
        if (/^[a-z0-9-]+$/.test(input)) {
          expect(result).toBe(true);
        } else {
          expect(result).toBe(false);
        }
      })
    );
  });
});
```

### Step 3: Run the test suites with Stryker mutation testing and generate quality audits
```bash
npx vitest run --coverage
npx stryker run
```
Output:
```
✓ tests/user-validation.test.ts (1 test)
  ✓ Username Validation BDD-First Specs > should accept valid kebab-case strings and reject invalid inputs

Test Files  1 passed (1)
Tests       1 passed (1)
Coverage    100.00% of lines (PASS, target > 90.00%)

[INFO] Starting Stryker mutation analysis...
[INFO] Mutants killed: 12/12 (100.00% mutation score)
[SUCCESS] Quality Gate passed: Score 100/100 (Grade A - Production Ready).
```

### Step 4: Write compliant report logs and sync with the Shared Obsidian Vault
```bash
cat << 'EOF' > docs/04-testing/username-validation-audit.md
# QA Test Audit: Username Validation

## 1. Executive Summary
Validated boundary safety of user input strings using fast-check PBT and Stryker.

## 2. Metrics Dashboard
- Test runner: Vitest
- Line Coverage: 100.00%
- Mutation Score: 100.00% (Grade A)
- PBT Iterations: 100 randomized inputs
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for username-validation-audit.md.
[SUCCESS] Symlinked docs/04-testing/username-validation-audit.md to /workspace/shared-obsidian-vault/forgewright/04-testing/username-validation-audit.md.
```
