---
name: vision-review
description: "Orchestrates visual regression testing, UI/UX layout audits, accessibility design reviews, and cross-platform display consistency checks. Use when the user requests visual regression audits, layout mismatch reviews, Playwright snapshot configurations, Midscene.js AI-vision scripts, or responsive design inspections."
version: 1.0.0
---

# Vision Review (LITE)

## SOLVE Step 2: GROUND (Vision Review Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project tech stack and language profile are established | `cat .forgewright/project-profile.json` | ... | Y/N |
| Visual regression or E2E testing package configurations exist | `cat package.json \| jq '.devDependencies \| keys' \| grep -E \"(playwright\|puppeteer\|cypress\|midscene)\"` | ... | Y/N |
| Playwright viewport dimensions and VRT config options are defined | `cat playwright.config.ts \|\| cat playwright.config.js` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Vision Review Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Scan target component layouts, responsive media queries, and viewport scale thresholds | Verify that color contrast ratios meet WCAG guidelines and elements don't shift layout bounds during load.
2. CAPTURE | Generate local screenshots or trigger E2E visual captures under specific resolutions | Ensure that snapshots are taken only after the page reaches network idle status to prevent flaky animations.
3. COMPARE | Execute pixelmatch comparisons between active screenshots and established reference base images | Confirm that pixel mismatch ratios do not exceed the max allowed threshold configured for the suite.
4. SYNC | Compile visual audit results, save lowercase kebab-case reports, and run sync hooks | Verify file names conform to conventions under `docs/04-testing/` and symlink them to the Obsidian vault.

## Common Mistakes Checklist
- **Cross-Platform Mismatch Divergences**: Comparing baseline screenshots generated locally on MacOS directly against test outputs generated on Linux/CI, causing minor text rendering mismatches. Always run VRT inside an official headless Docker test container to guarantee rendering consistency.
- **Unbounded Mismatch Thresholds**: Setting the pixelmatch mismatch threshold (`maxDiffPixels` or `maxDiffPixelRatio`) too low (failing on irrelevant anti-aliasing variations) or too high (ignoring broken CSS rules).
- **Non-Compliant Asset Directory Names**: Storing screenshot bases, visual audit report sheets, or user review logs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/04-testing/VisualReport.md` instead of `docs/04-testing/visual-review-report.md`).

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground target styling frameworks and testing settings
```bash
cat .forgewright/project-profile.json
cat playwright.config.ts | grep -E "(use:|viewport|expect)" -A 3
```
```typescript
  use: {
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
  },
```

### Step 2: Implement an automated, flake-free visual regression test in `tests/visual-audit.spec.ts`
```typescript
import { test, expect } from '@playwright/test';

test('landing page layout matches the visual baseline', async ({ page }) => {
  // Navigate to the target local server
  await page.goto('/');

  // Prevent flaky comparisons by waiting for both the network and layout stability
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500); // Allow custom animations to settle

  // Perform secure, grounded pixel comparison
  await expect(page).toHaveScreenshot('landing-page-base.png', {
    maxDiffPixelRatio: 0.02, // Enforce maximum 2% pixel variance
    animations: 'disabled',  // Automatically freeze CSS transition states
  });
});
```

### Step 3: Run the local visual test suite and inspect pixel mismatch scores
```bash
npx playwright test tests/visual-audit.spec.ts
```

