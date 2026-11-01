---
id: evondevkit-engineering-rules
title: Operational UI/UX Engineering Rules (T, I, R, M, W & Gate 3)
summary: Detailed engineering rules for Typography/Vietnamese copy (T1-T30), Interactive States/Forms/Overlays (I1-I32), Responsive 375px (R1-R11), Dark Mode (M1-M32), Tailwind v4 Traps (W1-W9), and Gate 3 DOM verification.
status: active
version: 1.1.0
owners: [core, design]
---
# Operational UI/UX Engineering Rules (`T` · `I` · `R` · `M` · `W` · `Gate 3`)

## 1. Typography & Multilingual Copy (`T1–T30`)
- **Antialiasing & Vietnamese glyph integrity (`T1`, `T4`, `T5`, `T30`):** Apply `antialiased` on `body`, load only required weights, verify `vietnamese` subset support so stacked diacritics (`ệ`, `ử`, `ẫ`) never clip or trigger fallback fonts mid-word, and give multi-line descriptions `text-sm/6` (`leading-relaxed`) with `mt-2` below headings so uppercase diacritics never collide with the line above.
- **Scale, measure & alignment (`T6–T17`):** Container headings must be at least one step larger than the largest text inside the container (`T8`). Keep reading measure `<=75ch` (`T11`), left-align multi-line copy (`T12`), set `min-w-0` on flex/grid children (`T13`), truncate single-line titles with `title` while allowing descriptions and button labels to wrap (`T14`, `T15`, `text-pretty` `T10`), apply `tabular-nums` to numeric columns/counters (`T16`), pair relative times with absolute timestamps (`T16b`), and use `font-mono` for IDs/codes (`T17`).
- **Copy hygiene (`T18–T29`):** Lock UI copy language from existing i18n/labels before writing the first label (`T24`). Avoid decorative emojis as icons (`T19`), redundant helper instructions (`T20`), fake marketing badges (`T21`), or `••••••` password placeholders (`T26`). Use sentence case and locale-appropriate number/currency formatting in English copy (`T28`, `T29`).

## 2. Interactive States, Forms & Overlays (`I1–I32`)
- **Action hierarchy & destructive classification (`I1–I8`):** Allow at most one primary CTA per choice group (`I3`). Classify destructive actions by three impact questions (`I4`: *deletes data, terminates active process/subscription, or revokes access*). Ensure secondary buttons have sufficient contrast so they never look disabled (`I8`).
- **Hover, focus & selection (`I9–I15`, `I29`, `I32`):** Place hover background, `cursor-pointer`, and click handler on the exact same DOM node (`I29`). Preserve visible WCAG 2.4.7 keyboard focus indicators. Never let a container's hover background match a child badge/control background (`I32`), and never let `hover:border-*` override `checked:border-*` on radio/checkbox controls.
- **Data views & loading transitions (`I16–I19`):** Implement all 4 states (**populated, loading, empty, error**). Match skeleton geometry to real rows, keep existing data visible during filter/page reloads, and avoid flashing empty states while loading.
- **Modals, disclosures & focus lifecycle (`I20–I31`):** Do not close modals containing form inputs on outside backdrop click (`I20`). Portal floating overlays (`I22`). Animate disclosures smoothly (`grid-rows: 0fr -> 1fr`, never abrupt `<details>` `I30`). When removing the focused row/element, move focus deterministically to the next item or trigger (`I31`).
- **Form ergonomics (`I26–I28`):** Bind `<label>` with `cursor-pointer` (`I26`), include a `size-10` show/hide password toggle (`I27`), and preserve browser autofill (`autocomplete` attributes `I28`).

## 3. Responsive & 375px Small-Viewport Rules (`R1–R11`)
- **Zero horizontal page scroll (`R1`, `R2`):** Always declare `grid-cols-1` (`minmax(0, 1fr)`) before `sm:`/`lg:` columns so wide children never expand implicit `auto` tracks and cause horizontal scroll at 375px.
- **No orphan wraps & linear rails (`R3`, `R6`):** Avoid `3 + 1` orphan wraps. Keep linear sequences (kanban columns, step bars, filter chip rails, tab strips) in horizontal scroll containers with `shrink-0` items (`R6`).
- **Mobile spacing, 16px inputs & tables (`R4`, `R5`, `R8`, `R9`, `R11`):** Reduce card padding to `p-4`/`p-5` on mobile (`R4`), keep editable inputs `>=16px` on mobile to prevent iOS auto-zoom (`R8`), and scroll tables horizontally inside their container (or adapt to cards) while preserving the primary row action (`R9`, `R11`).

## 4. Color, Elevation & Dark Mode Integrity (`M1–M32`)
- **Dark-mode surface order (`M20–M25`):** Elevated cards/modals in dark mode must be lighter than the base page background. Never apply `bg-background` to selected/hovered items inside an elevated card or popover (`M21` sunken selection hole).
- **Hue stability & input borders (`M7`, `M31–M32`):** Preserve semantic hue identity between light and dark themes (avoid shifting orange-amber to yellow `findHueDrifts`), adapt `-50/-100` light badges for dark mode, and keep visible input borders (`dark:border-*`, never `dark:border-transparent`).

## 5. Tailwind v4 Traps (`W1–W9`)
- **`W1–W3` `@theme` namespace & variable resolution:** In Tailwind v4, `--color-*`, `--radius-*`, and `--shadow-*` inside `@theme` control utility generation. Never create self-referencing CSS variables (`--primary: var(--primary)`), and when dynamically switching `--primary` on `:root`, re-derive dependent tokens (`--border-focus`, `--ring-focus`, `--primary-hover`) at `:root` so child controls do not retain stale focus colors.
- **`W8` Selection & focus-ring specificity:** Use `not-checked:hover:*` or explicit state tokens so hover utilities declared later in CSS do not strip `checked:` or `aria-selected` styles.
- **`W9` Missing Preflight on legacy projects:** If a brownfield CSS project lacks `@import "tailwindcss"` preflight, **do not blindly enable Preflight globally** (which strips existing headings, borders, and button resets across unrelated screens); scope resets to the new/refactored component tree or verify full-app regression first.

## 6. Gate 3 (`Cổng 3`) — Complete DOM Probe Verification Protocol

1. **Resolve probe path:** Use `scripts/art-direction/ui-dom-probe.mjs` in the Forgewright checkout, or `~/.forgewright/bin/ui-dom-probe.mjs` / `"$FORGEWRIGHT_SOURCE_DIR/scripts/art-direction/ui-dom-probe.mjs"` from an external project directory.
2. **Choose interaction mode safely:**
   - Arbitrary live URLs → default `observational` mode (`--sweep`) so no buttons/options are clicked.
   - Controlled previews / wireframes / test fixtures → `--hover-focus` or `--interactive` (`--allow-create-clicks` only when create buttons are known-safe modal triggers).
3. **Probe light, dark, and state routes:** Run both light and `--dark` when dark mode applies, and probe separate state URLs (`?tt=dang-tai`, `?tt=rong`, `?tt=loi`) when states are route/query-addressed.
4. **Account for all findings & coverage:** Report `coverage.skippedChecks` transparently; resolve all `P` (`broken`) items (`--fail-on-broken` exits `1` when any `P` item remains), evaluate `R` (`referenceDeviation`) and `W` (`needsReview`) against rendered screenshots, and treat `G` (`taste`) as optional unless `--strict-evon-style` is requested.
