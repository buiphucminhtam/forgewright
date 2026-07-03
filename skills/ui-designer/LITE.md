---
name: ui-designer
description: "Orchestrates user interface (UI) engineering, design system alignment, Tailwind CSS integrations, and visual regression validation. Use when the user requests new UI components, responsive layouts, theme adaptations, or styling updates."
version: 1.0.0
---

# Ui Designer (LITE)

## SOLVE Step 2: GROUND (Ui Designer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target UI framework (Tailwind CSS, React, or custom CSS) is installed | `cat package.json \| jq '.dependencies["tailwindcss"] // .dependencies["react"]'` | Confirms UI style frameworks and packaging configurations | |
| Active design_dna contracts or visual tokens exist under workspace paths | `find .agents/ -name "*design*" -o -name "*dna*"` | Locates standard design DNA constraints or design contract files | |
| Playwright visual regression test configurations are onboarded | `cat playwright.config.ts` | Validates snapshot engines and pixelmatch threshold rules [1] | |
| Token budgets and expenditure parameters are configured | `cat .forgewright/budget.yaml` | Displays session cost ceilings and API threshold limits [2] | |

## SOLVE Step 3: DECOMPOSE (Ui Designer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Analyze layout components, responsive media queries, and spacing grids | Verify that components do not overflow bounding boxes on standard responsive breakpoints.
2. ALIGN | Map custom component layouts to the active design_dna contract variables | Ensure colors, fonts, margins, and borders strictly inherit design system specifications.
3. SNAP | Capture rendering layouts via headless Playwright visual regression (VRT) | Compare active UI screens against baseline snapshots to verify zero pixel-level drift [1].
4. SYNC | Propagate design specifications and interface documentation to Obsidian | Run post-skill hooks to symlink design specification files to the Shared Obsidian Vault [3].

## Common Mistakes Checklist
- **Hardcoded Style Overrides**: Writing explicit, hardcoded hex colors or inline style properties inside TSX/JSX instead of leveraging standard Tailwind utility classes.
- **Missing Interaction States**: Designing UI buttons, links, or inputs without explicitly defining active, hover, focus-visible, and disabled styling variants.
- **VRT Platform Discrepancies**: Running local visual regression tests across different OS render engines without executing tests inside a consistent Docker environment [1].
- **Broken Media Breakpoints**: Omitting responsive class prefixes (e.g., `md:`, `lg:`), causing mobile device viewports to suffer layout clippings or severe wrap issues.
- **Non-Compliant Resource Directories**: Saving UI designs, style charts, or layout specs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case [4].

## Worked Example

### Step 1: Verify the UI styling framework and active design guidelines
```bash
cat package.json | grep -E "(tailwindcss|playwright)"
find .agents/ -name "*design_dna*"
```
Output:
```json
    "tailwindcss": "^3.4.0",
    "@playwright/test": "^1.40.0"
```
```
.agents/workflows/design_dna.json
```

### Step 2: Implement a responsive, accessible component adhering to Tailwind classes
Create `src/components/CardWidget.tsx`:
```typescript
import React from 'react';

export const CardWidget = ({ title, description }: { title: string; description: string }) => {
  return (
    // Conforms strictly to design_dna rules for padding, background colors, and rounded borders
    <div className="max-w-md rounded-xl bg-slate-900 p-6 shadow-md transition hover:shadow-lg focus-within:ring-2 focus-within:ring-sky-500">
      <h2 className="text-xl font-bold text-slate-100 md:text-2xl">
        {title}
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        {description}
      </p>
      <button className="mt-4 inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-900 active:bg-sky-700">
        View details
      </button>
    </div>
  );
};
```

### Step 3: Execute Playwright Visual Regression Testing (VRT)
```bash
npx playwright test tests/visual-regression.spec.ts
```
Output:
```
[INFO] Initializing headless layout validation...
[VRT] CardWidget layout matches base asset (0.00% pixel mismatch detected).
[SUCCESS] Saved audit to docs/04-testing/ui-layout-regression.md.
```

### Step 4: Synchronize layout audit reports to the Shared Obsidian Vault
```bash
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Symlinked docs/04-testing/ui-layout-regression.md to /workspace/shared-obsidian-vault/forgewright/04-testing/ui-layout-regression.md.
```
