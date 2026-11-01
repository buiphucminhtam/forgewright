---
id: evondevkit-workflows-u-v-l-d
title: Operational UI/UX Workflows (Modes U, V, L, D)
summary: Detailed execution mechanics for Task-First Wireframing (U1-U4), Structured Review & Keep-Brand (V1-V6), Visual-Preserving Refactor (L1-L4), and System-First Primitives (D1-D9).
status: active
version: 1.1.0
owners: [core, design]
---
# Operational UI/UX Workflows (`U` · `V` · `L` · `D`)

## 1. Mode `U` — Task-First Design & Multi-Option Wireframing (`U1–U4`)

### `U1` Grounded Brief
- Run the 3-tier `Audit:` first (stack/preflight, existing primitives, style signals & copy locale).
- Inspect README, routes, data types/mocks, and existing screens to write a 5-line brief: **product**, **target user**, **1–3 primary jobs**, **dominant platform** (mobile vs. desktop), and **differentiator**.
- Tag each line with its source (`read from code`, `user stated`, `inferred default`). Do not invent fictional user personas or unverified research percentages.

### `U2` Per-Screen Job Table
| Screen | Primary Job (Why user visits) | Comparison / Decision Attributes | Final Action | Category Convention |
|---|---|---|---|---|
| Example: Order List | Triage delayed/unpaid orders | Status, overdue age, total, customer | Open order / batch action | Sticky filter bar, status tabs with counts, sortable table |
- The **Comparison Attributes** column dictates card and table hierarchy: attributes used to compare items must be the most prominent and appear first.

### `U3` Structurally Distinct Wireframes (2–3 Options)
- **Structural divergence, not cosmetic variation:** Option A, B, and C must differ in layout strategy (e.g., A: compact sticky filter + table; B: split master-detail pane; C: search-first grouped queue), never merely border radius or accent color.
- **Real project tokens & primitives:** Build wireframes using the project's actual CSS variables/tokens and component class structures.
- **Shareable URL state & review toolbar:** Expose options via URL query parameters (`?v=a&mau=xam&kho=desktop&tt=du-lieu`) supporting option switch (`v=a|b|c`), grayscale vs. color (`mau=xam|mau`), viewport (`kho=desktop|mobile`), and all 4 data states (`tt=du-lieu|dang-tai|rong|loi`), plus a rationale box (`data-wf-reason`) stating: (1) where the primary job lives, (2) what changed vs. baseline, and (3) explicit trade-offs.
- **Stable block numbering (`data-wf-block`):** Number major layout blocks (`data-wf-block="1"`, `"2"`, ...) without overlapping text (`data-wf-block-out` when padding is zero) and place the attribute on a non-scrolling wrapper so users can steer by block number (*"remove block 3"*, *"move block 2 above 1"*).
- **Fixed "now" timestamp & time-derived overdue state:** For screens with schedules, deadlines, or deliveries, set a fixed reference "now" so at least one item exhibits the **overdue / late / attention** state derived from time rather than only static database enums.
- **Pre-handoff probe:** Run `ui-dom-probe.mjs` on each option at `1280,375` and `--sweep` before presenting Gate 2.

### `U4` Implementation & Wireframe Conformance
- Implement the selected option (or a non-conflicting hybrid `A + B` if requested) and verify with `--wireframe <selected-wireframe-url>` at `1440` and `375` so spacing, typography weights, copy, and icons match the approved wireframe.

---

## 2. Mode `V` — Structured UI Review, Keep-Brand Rebuild & Comparative Audit (`V1–V6`)

### `V1` Four-Class Finding Taxonomy
1. **Broken (`Hỏng` / `P` → `USABILITY_ACCESSIBILITY` / `TECHNICAL_ARTIFACT`):** Fails under any brand (contrast below threshold, 375px horizontal overflow, clipped meaning, overflowing overlay, hover layout shift).
2. **System / Reference Drift (`Lệch hệ` / `R` → `REFERENCE_DEVIATION`):** Contradicts the project's own tokens/components (must cite exact `file:line` where the canonical token/component is defined vs. where the same role drifts) or approved wireframe anchors. Distinct component roles (e.g., KPI card vs. promo banner) having different radii are not drift.
3. **Needs Review (`W` → `NEEDS_REVIEW`):** Heuristic signals requiring rendered/context confirmation (suspected missing keyboard focus indicator, `<24px` target subject to WCAG 2.5.8 spacing/inline exceptions, button/row wrapping, narrow column squeeze).
4. **Taste / Polish (`Gu` / `G` → `SUBJECTIVE_PREFERENCE`):** Optional signal reduction or style tightening with user-facing rationale; never auto-enforced over brand identity.

### `V1b` Structural Pass & `V1c` Per-Block Tightening (Keep-Brand Mode)
- **Color Role Table first:** Record how the existing product assigns colors to primary CTAs, active nav/tabs, badges, links, key numbers, and brand surfaces. Consolidate accidental near-duplicate hex codes (`#ef4444` vs `#dc2626` vs token `--danger`) into the canonical token.
- **`V1b` Structural pass:** Identify competing primary signals (two primary buttons side by side), repeated non-distinguishing badges (e.g., 8/8 cards labeled "New"), and decorative colors colliding with semantic status colors.
- **`V1c` Per-block tightening:** Propose per-block before/after cleanup (replacing unstyled native `<select>`/`<input type="range">`, aligning header action heights, tightening card rhythm) while preserving the Color Role Table.

### `V6` Comparative Review (New vs. Original)
- Capture both versions under **identical conditions**: same viewport widths (`375, 768, 1280, 1440`), same dataset, same authentication/user state, same active tab/filter state, and same theme (light/dark).
- Verify that no user-visible content, action, or brand role was accidentally dropped.
- Output an explicit comparison table (**Criterion | Original | New | Winner | Evidence & Fix for Regressions**) and actively search for any criterion where the new version regressed.

---

## 3. Mode `L` — Visual-Preserving Refactor (`L1–L4`)

1. **`L1` Measure before concluding:** Capture baseline screenshots and computed styles at `375, 768, 1440` before editing.
2. **`L2` Initial CSS/token/component inventory:** Inventory active stylesheets, token definitions, and shared components. Distinguish **architectural debt** (duplicated CSS rules, unused selectors, inline style sprawl) from **intentional visual design**.
3. **`L3` Delivered/built CSS is ground truth:** When documentation or comments disagree with what the browser actually renders from delivered CSS, preserve the rendered behavior unless the user explicitly approves a visual change.
4. **`L4` Zero visual regression verification:** Re-run screenshots and DOM probe after refactoring; never neutralize brand colors or alter spacing/radii during a Mode `L` refactor.

---

## 4. Mode `D` — System-First Primitives (`D1–D9`)

- **`D1` Seven Core Primitives Contract:** Before building multi-screen flows (or when asked to build a design system first under `D9`), lock semantic tokens (`D2` single status map) and seven foundational primitives:
  1. **Button:** semantic variants (`primary`, `outline`/`secondary`, `ghost`, `danger`), consistent height ladder, icon-left/icon-only sizing (`aria-label`), spinner-in-place loading state.
  2. **Badge / Pill:** status and category pills with text + icon/dot cues and dark-mode hue stability.
  3. **Input / Select / Field:** surface background, label binding (`cursor-pointer`), validation error slot below input, password show/hide toggle, preserved autofill.
  4. **Card / Panel:** semantic surface, border/elevation role, header/body/footer rhythm (`mt-auto` for aligned actions).
  5. **List Row / Table Row:** hover/selected state separation, action column alignment, mobile responsive adaptation.
  6. **Modal / Drawer / Overlay:** portal mount, backdrop dismissal policy (`I20` no outside-click close when inputs exist), explicit close button, focus trap & restoration.
  7. **Empty State:**system-populated quiet empty state vs. user-initiated actionable starter state (`N6`).
- **`D9` Design-System Preview Surface:** Render all core primitives with their reachable states side by side as static examples (`inert data-demo-state="hover|focus|loading|error|disabled"`) so the owner can approve the foundation in one gate before screens are assembled (`D3–D8`).
