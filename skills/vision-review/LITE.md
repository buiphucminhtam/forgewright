---
name: vision-review
description: "Orchestrates visual regression testing, UI/UX layout audits, accessibility design reviews, and cross-platform display consistency checks. Use when the user requests visual regression audits, layout mismatch reviews, Playwright snapshot configurations, Midscene.js AI-vision scripts, or responsive design inspections."
version: 1.0.0
---

# Vision Review (LITE)

## SOLVE Step 2: GROUND (Vision Review Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project tech stack and language profile are established | `cat .forgewright/project-profile.json` | Confirms target frameworks, UI platforms, and project health baseline | |
| Visual regression or E2E testing package configurations exist | `cat package.json \| jq '.devDependencies \| keys' \| grep -E \"(playwright\|puppeteer\|cypress\|midscene)\"` | Identifies active testing frameworks, engine dependencies, and version bindings | |
| Playwright viewport dimensions and VRT config options are defined | `cat playwright.config.ts \|\| cat playwright.config.js` | Verifies active screenshot settings, pixelmatch thresholds, and browser configurations | |
| Active API expenditure parameters and cost ceilings are configured | `cat .forgewright/budget.yaml` | Verifies current session spend limits and warning triggers prior to AI-vision steps | |

## SOLVE Step 3: DECOMPOSE (Vision Review Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Scan target component layouts, responsive media queries, and viewport scale thresholds | Verify that color contrast ratios meet WCAG guidelines and elements don't shift layout bounds during load.
2. CAPTURE | Generate local screenshots or trigger E2E visual captures under specific resolutions | Ensure that snapshots are taken only after the page reaches network idle status to prevent flaky animations.
3. COMPARE | Execute pixelmatch comparisons between active screenshots and established reference base images | Confirm that pixel mismatch ratios do not exceed the max allowed threshold configured for the suite.
4. SYNC | Compile visual audit results, save lowercase kebab-case reports, and run sync hooks | Verify file names conform to conventions under `docs/04-testing/` and symlink them to the Obsidian vault.

## Common Mistakes Checklist
- **Flaky Dynamic Rendering**: Capturing screenshots before heavy animations, lazy-loaded images, or asynchronous API data fetches are completely completed, resulting in false-positive VRT failures.
- **Cross-Platform Mismatch Divergences**: Comparing baseline screenshots generated locally on MacOS directly against test outputs generated on Linux/CI, causing minor text rendering mismatches. Always run VRT inside an official headless Docker test container to guarantee rendering consistency.
- **Unbounded Mismatch Thresholds**: Setting the pixelmatch mismatch threshold (`maxDiffPixels` or `maxDiffPixelRatio`) too low (failing on irrelevant anti-aliasing variations) or too high (ignoring broken CSS rules).
- **Non-Compliant Asset Directory Names**: Storing screenshot bases, visual audit report sheets, or user review logs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/04-testing/VisualReport.md` instead of `docs/04-testing/visual-review-report.md`).
- **Unverified AI Token Spending**: Routing large, raw, high-resolution screenshots to multi-modal visual analysis prompts repeatedly without checking the remaining token budget inside `.forgewright/budget.yaml`.

## Worked Example

### Step 1: Ground target styling frameworks and testing settings
```bash
cat .forgewright/project-profile.json
cat playwright.config.ts | grep -E "(use:|viewport|expect)" -A 3
```
Output:
```json
{
  "project_name": "forgewright-portal",
  "tech_stack": ["React", "TypeScript", "Tailwind CSS"],
  "health_status": "PASS"
}
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
Output:
```
Running 1 test using 1 worker
  ✓  [chromium] › tests/visual-audit.spec.ts:3:5 › landing page layout matches the visual baseline (1.4s)

[SUCCESS] Playwright Visual Regression Audit passed.
[INFO] Pixel mismatch ratio: 0.00% (No regressions detected).
```

### Step 4: Write compliant report logs and synchronize to the Shared Obsidian Vault
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/04-testing/visual-review-report.md
# Visual Regression & Layout Review

## 1. Executive Summary
Conducted visual regression audits on key user-facing views to guarantee style integrity across browsers.

## 2. Technical Profile
- Toolchain: Playwright, pixelmatch, and Midscene.js
- Baseline Images: Enforced Docker container rendering parity
- Validation Score: PASS (Mismatch ratio 0.00% detected)
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for visual-review-report.md.
[SUCCESS] Symlinked docs/04-testing/visual-review-report.md to /workspace/shared-obsidian-vault/forgewright/04-testing/visual-review-report.md.
```
