---
id: app-ui-ux-mindset
title: Operational App UI/UX Mindset & Reference Router
summary: Compact router, 12 operational principles (N1-N12), scope rules (S1-S16), and Gate 3 DOM verification contract adapted from evondev/evondevKit.
status: active
version: 1.1.0
owners: [core, design]
---
# Operational App UI/UX Mindset & Reference Router

> Adapted from `evondev/evondevKit` (`v0.3.27`, commit `4d021537edc853fd91d2bb3aade1f5076ab7556e`, MIT License) and harmonized with Forgewright's **Evidence-Grounded Design Reasoning** (`design-mindset-and-rules.md`), **Reference-Grounded Visual Design** (`visual-grounding.md`), and **Evidence-Bound UI Style Diversity** (`ui-style-diversity.md`).

## Authority & Adaptation Boundary
1. **Project & Accessibility Authority First:** Explicit user requirements, `PIPELINE_CONTEXT.visual_basis`, `PIPELINE_CONTEXT.ui_style_profile`, project tokens, and WCAG accessibility govern visual identity and keyboard focus.
2. **Mechanics vs. Taste Presets:** Reuse the operational workflows, codebase audit gates, engineering rules, and DOM probing below. Treat flat-hairline presets from `evondevKit` as optional hypotheses (`Taste / Gu`), never as laws overriding brand identity or WCAG focus visibility.
3. **On-Demand Modules:** Load only what the active task needs:
   - [workflows-u-v-l-d.md](evondevkit/workflows-u-v-l-d.md) — **Mode `U`** (`U1–U4` brief/jobs/wireframes), **Mode `V`** (`V1/V1b/V1c/V6` review), **Mode `L`** (`L1–L4` refactor), **Mode `D`** (`D1–D9` 7 core primitives & `inert data-demo-state`).
   - [engineering-rules-t-i-r-m-w.md](evondevkit/engineering-rules-t-i-r-m-w.md) — Typography/copy (`T1–T30`), states/modals (`I1–I32`), 375px (`R1–R11`), Dark Mode (`M1–M32`), Tailwind v4 (`W1–W9`), and **Gate 3 (`Cổng 3`)**.
   - [unslop/redline-passes-and-direction.md](unslop/redline-passes-and-direction.md) & [unslop/signs-tokens-and-visuals.md](unslop/signs-tokens-and-visuals.md) — **Unslop Redline (`heydamir/unslop`, CC-BY-4.0):** Heavy/Light/No-Slop triage, 5-line Direction, 9 passes, `unslop-snapshot.mjs` & `unslop-story.mjs`.

## 0. Pre-Code Routing & Proportional Audit (`Audit:` Line)
- **Mode `U` (New screen / redesign, default >=1 screen):** 3-tier `Audit:` → Brief (`U1`) + Screen Job Table (`U2`) → 2–3 distinct wireframes (`U3`) → Build (`U4`).
- **Mode `V` (Inspect / Keep-Brand / `V6` Compare):** Record the **Color Role Table** first. Categorize into **Broken (`Hỏng` / `P`)**, **System Drift (`Lệch hệ` / `R` with `file:line`)**, **Needs Review (`W`)**, and **Taste (`Gu` / `G`)**.
- **Mode `L` (Refactor):** Inventory CSS/tokens/components against delivered CSS and verify zero visual diff.
- **Mode `D` (System-First):** Lock tokens and 7 core primitives (`D1–D9`) on a preview page before screens.
- **Mode `Quick` (Localized fix):** Scope `Audit:` proportionally to the affected component, tokens, and copy (`visual-grounding.md` §2).
- **Scope (`S1–S16`):** No unrequested sections (`S1`); disambiguate ambiguous terms at handoff (`S10`, `S15`); use cross-consistent mock data (`S6`) covering 2-line titles, 9-digit numbers, `0`, missing media, empty states, and time-derived overdue items (`S8`, `S16`).

## 1. Twelve Operational Principles (`N1–N12`)
- **`N1` Zero layout shift on state change:** Hover, active tab, checkbox, spinner, and inline errors must not shift neighbors by 1 px (`tabular-nums`, icon-swapped spinners, `grid-rows: 0fr -> 1fr`).
- **`N2` Complete, glance-distinct states:** Cover default, hover, focus-visible, selected, disabled, loading, empty, error, completed, and edge cases.
- **`N3` Signal budget & de-duplication:** Spend the strongest emphasis once per view; pull repeated suffixes/dates into one group header (`T16b`).
- **`N4` Semantic status map + redundant cues:** Map status by outcome meaning (never raw `+`/`-` sign) and pair with text/icons so grayscale stays unambiguous.
- **`N5` Same role, same primitive and class contract:** Reuse exact component primitives (`S9`), heights, and class structures across screens and overlays.
- **`N6` Actionable copy & escape hatches:** State what happened, why, and the next clickable step without inventing unvalidated rules; provide a way back on multi-step/OTP flows.
- **`N7` Never pre-fill unchosen input:** Keep optional fields empty; avoid fake `00:00:00` times, fake counts, or `••••••` password placeholders (`T26`).
- **`N8` Never occlude or truncate decision-critical content:** Zero horizontal page scroll (`R1`), `min-w-0` (`T13`), `text-pretty` (`T10`), never truncate confirmation targets, preserve `@domain`/`.ext` suffixes.
- **`N9` Tri-modal operability (mouse, keyboard, touch):** Keep hover, `cursor-pointer`, and click on one node (`I29`), preserve visible keyboard focus, expand compact targets to >=32–44px via `before:absolute before:-inset-*`.
- **`N10` Strict UI/business-logic boundary:** Preserve existing props, state types, and handler contracts.
- **`N11` Box-model alignment over arbitrary negative offsets:** Use padding/gap/flex/grid rather than unexplained negative margins.
- **`N12` Repeated-block coherence:** Across repeated cards/rows in a grid or list, keep title hierarchy above metadata, align footers (`mt-auto`), and wrap item titles up to 2 lines without cutting off distinguishing words.

## 2. Gate 3 (`Cổng 3`) — Rendered DOM & Multi-Viewport Verification
Run `node scripts/art-direction/ui-dom-probe.mjs <url> --sweep` (or `~/.forgewright/bin/ui-dom-probe.mjs`): default `observational` mode safely inspects live URLs without clicking; use `--hover-focus` or `--interactive` (and `--dark`) on controlled previews/fixtures, and report `coverage.skippedChecks` plus `P`/`R`/`W`/`G` disposition.
