# Operational App UI/UX Mindset & Reference System

> Adapted from `evondev/evondevKit` (`v0.3.27`, commit `4d021537edc853fd91d2bb3aade1f5076ab7556e`, MIT License) and harmonized with Forgewright's **Evidence-Grounded Design Reasoning** (`design-mindset-and-rules.md`), **Reference-Grounded Visual Design** (`visual-grounding.md`), and **Evidence-Bound UI Style Diversity** (`ui-style-diversity.md`).

## Authority & Adaptation Boundary

1. **Project & Accessibility Authority First:** Explicit user requirements, the validated `PIPELINE_CONTEXT.visual_basis`, `PIPELINE_CONTEXT.ui_style_profile`, existing project design tokens, and WCAG accessibility standards always govern visual identity and accessibility.
2. **Operational Mechanics vs. Author Taste Presets:** Reuse the operational workflows, codebase audit gates, state/form/responsive/dark-mode engineering rules, and deterministic DOM probing below across all app/web UI work. Treat flat-hairline aesthetic defaults from `evondevKit` as **optional exploration hypotheses** when a project has no visual system, never as universal laws that override a project's brand or WCAG keyboard focus visibility.

---

## 0. Four Pre-Code Questions (Mandatory Sequence)

### Q1. Which Workflow Route Applies? (`U` | `V` | `L` | `D` | `Quick`)

| User Intent / Prompt Signal | Route | Execution Contract |
|---|---|---|
| **New screen or full redesign** (*default for >=1 screen*) | **Mode `U` (Design as Designer)** | 1. Run 3-tier Audit. 2. Present concise **Brief (`U1`)** + **Screen Job Table (`U2`)** (primary purpose, comparison attributes, final action, category conventions). 3. Build 2–3 **structurally distinct wireframes (`U3`)** using real project tokens/primitives, realistic edge-case data, and all 4 data states (data, loading, empty, error), verified by DOM probe. 4. Implement selected layout (`U4`). *(If user says "build directly / skip wireframe", execute `U1+U2` internally, build the recommended layout, and state the chosen layout + rationale at handoff.)* |
| **Audit / review existing UI** (*"review this", "what's wrong", URL/screenshot*) | **Mode `V` (Inspect Mode)** | Measure DOM + inspect visuals against the project's own system. Output a categorized findings table (**Broken / System Drift / Taste**) with before/after evidence and wait for user selection before mutating project code. |
| **Rebuild while keeping brand** (*"keep brand", "clean up UI but keep colors"*) | **Mode `V` (Keep-Brand Mode)** | Record the **Color Role Table** first. Upgrade layout rhythm, spacing, and unstyled native controls while strictly preserving how the brand assigns color to each role. Consolidate accidental near-duplicate hex codes into the matching project token. |
| **Compare new vs. original UI** (*"compare with original", "is it better"*) | **Mode `V6` (Comparative Review)** | Capture both versions at identical viewports, compare criterion-by-criterion, actively identify any regressions where the new version lost clarity or identity, and propose targeted fixes. |
| **Refactor CSS/code without changing visuals** (*"refactor to Tailwind", "clean up CSS"*) | **Mode `L` (Visual-Preserving Refactor)** | Measure DOM geometry, computed styles, and screenshots at 375/768/1440px **before** touching code. Refactor implementation only; never neutralize brand colors or alter layout. Re-verify zero visual regression after edits. |
| **Design system / UI kit first** (*"build design system first", multi-screen foundation*) | **Mode `D` (`D1–D9`)** | Lock semantic tokens and the core primitives (Button, Badge, Input, Card, List Row, Modal, Empty State + task-specific primitives) on a single preview surface before building individual screens. |
| **Sub-screen localized change** (*single component, dropdown, bugfix*) | **Mode `Quick`** | Run 3-tier Audit, implement using existing project primitives/tokens, verify states/viewports, and report defaults at handoff. |

### Q2. What Does the Project Already Use? (3-Tier Blocking Audit)

Never guess the stack or create duplicate primitives. Inspect and emit a single-line `Audit:` summary before proposing layouts or writing code:

1. **Tier 1 — Stack & Preflight:** Inspect `package.json`, CSS entrypoints (`globals.css`, `index.css`, `tailwind.config.*`), `@import "tailwindcss"` preflight status, and specialized libraries (charts, date pickers, tables, virtual lists).
2. **Tier 2 — Existing Component Primitives (`S9`, `N5`):** Search the repo for the target component (`Button`, `Avatar`, `Modal`, `Select`, `Badge`, `Toast`, `Table`). If present, **reuse the project's component**—do not author a competing second primitive.
3. **Tier 3 — Style Signals, Color Roles, and Copy Locale (`T24`):** Count non-overlay files using glass (`backdrop-blur`), gradients, elevation shadows, or rich semantic/categorical accents (`--chart-*`), detect dark-mode support, and inspect existing labels/i18n to lock the UI copy language before writing the first label.

### Q3. How Should Visual Style & Brand Roles Behave?

- Follow the validated `PIPELINE_CONTEXT.visual_basis` and `PIPELINE_CONTEXT.ui_style_profile`, or the existing repository's detected style (flat, elevated, glass, gradient, dark, or high-chroma brand).
- When rebuilding an existing product while keeping its brand (**Mode `V` Keep-Brand** or **Mode `U` on an existing app**), write out the **Color Role Table** before editing:
  - **Primary action button:** (e.g., solid brand fill + white text)
  - **Active navigation / selected tab or chip:** (e.g., solid fill, tinted pill, or neutral surface + weight)
  - **Badges & status counters:** (e.g., semantic tinted pill vs. solid brand badge)
  - **Secondary links & inline actions:** (e.g., brand text link without border)
  - **Highlighted metrics / prices:** (e.g., bold brand accent or high-contrast foreground)
  - **Hero / feature surfaces:** (e.g., brand gradient or tinted surface)
- Consolidate stray hardcoded hex values that approximate an existing role token into that exact token so the screen coheres without losing brand identity.

### Q4. Screen Layout & Disambiguation Discipline (`S1–S16`)

- **No unrequested sections (`S1–S3`):** Build the exact sections required by the task plus structural necessities (screen title, input labels, button text, validation messages). Do not append unrequested marketing banners, FAQs, or footers.
- **Disambiguate ambiguous terms explicitly (`S10`, `S15`):** State how ambiguous terms were interpreted in the first handoff line (e.g., *"bảng" → data table vs. kanban board; "thẻ" → card vs. tab; "danh sách" → vertical list vs. dropdown; "lịch" → month calendar vs. timeline*).
- **Cross-consistent, edge-case mock data (`S6–S8`, `S16`):** Summary counters must match row/tab contents (e.g., if a tab shows 1 cancelled order, KPI cards must not contradict it). Include realistic edge cases: 2-line wrapping titles, 9-digit numbers, `0` values, missing avatar/image fallback, empty states, and time-derived overdue/late items.

---

## 1. Twelve Core Principles & Self-Tests (`N1–N12`)

| ID | Principle | Visual / DOM Self-Test |
|---|---|---|
| `N1` | **State changes never shift adjacent layout** | Toggle hover, active tab, checkbox selection, loading spinner, and inline error: do neighboring elements move by even 1 px? Use `tabular-nums`, fixed action column widths, icon-swapped spinners, reserved error slots between inputs and submit buttons, and `grid-rows: 0fr -> 1fr` for accordions. |
| `N2` | **Every reachable state is built and glance-distinct** | Cover default, hover, focus-visible, selected, disabled, loading, empty, error, completed, and edge cases. If text is hidden, can each state still be told apart? |
| `N3` | **One signal per meaning; save the strongest signal for the primary action** | Count solid/high-chroma elements on screen. Does each communicate something no adjacent element already says? Pull repeated suffixes/dates (`"vs 2025"`, `"/2026"`) into a single group header. |
| `N4` | **Semantic status color map + redundant text/icon cues** | Map status by outcome meaning (neutral pending, positive success, warning attention, danger destructive/error)—never raw `+`/`-` sign (e.g., rising cost is not green). Does every status remain readable in grayscale? |
| `N5` | **Same semantic role, same primitive and class contract** | Do date-range endpoints, pagination controls, form buttons, and status badges share identical height, radius, and class structure across every screen and modal? |
| `N6` | **Copy explains what happened, why, and the next action** | Do errors explain how to recover without repeating the label or inventing unvalidated rules? Does every step (e.g., OTP, filters) offer an escape hatch (e.g., *"Change email"*), and do user-started empty states offer clickable starter prompts? |
| `N7` | **Never pre-fill or guess unchosen user input** | Are optional/unchosen fields genuinely empty until user interaction, without fake `00:00:00` times, fake badge counts, or `••••••` password placeholders? |
| `N8` | **Never occlude or truncate decision-critical information** | At 375px with the longest data, can the user read everything needed to decide? Never truncate confirmation targets; use `min-w-0` on flex/grid children, `text-pretty` on descriptions, and suffix-preserving truncation (`@domain`, `.pdf`) when needed. |
| `N9` | **Operable by mouse, keyboard, and touch** | Are hover, `cursor-pointer`, and click on the same node? Is keyboard focus clearly visible? Are compact inline controls expanded to >=32–44px tap targets via `relative before:absolute before:-inset-*`? |
| `N10` | **UI/UX changes never silently mutate business logic** | Are all existing props, state types, and handler contracts preserved? |
| `N11` | **Box-model alignment over unexplained negative margins** | Are spacing and alignment achieved via padding/gap/flex/grid rather than arbitrary negative margins? |
| `N12` | **Rendered DOM measurement before completion** | Has `ui-dom-probe.mjs` (or equivalent rendered multi-viewport check) verified 375px–1920px and continuous resize sweeps? |

---

## 2. Engineering Rules by Surface Domain

### Typography & Multilingual Copy (`T1–T30`)
- **Font rendering & Vietnamese diacritics (`T1`, `T5`, `T30`):** Use antialiased text rendering, verify Vietnamese glyph coverage (`vietnamese` subset) so stacked diacritics (`ệ`, `ử`, `ẫ`) never clip or fall back to another font mid-word, and give multi-line body/modal descriptions sufficient line-height (`leading-relaxed` / `text-sm/6`) and top margin (`mt-2`) so uppercase diacritics never collide with the heading above.
- **Hierarchy & measure (`T8`, `T10–T15`):** Section headings must be at least one scale step larger than the largest text inside their container (`T8`). Constrain multi-line reading measure to <=75ch (`T11`), left-align long copy (`T12`), apply `min-w-0` to flex/grid items containing dynamic text (`T13`), allow button labels to wrap rather than overflow (`T15`), and apply `tabular-nums` to aligned numbers/tables (`T16`) and `font-mono` to IDs/codes/tokens (`T17`).
- **Clean UI copy (`T18–T29`):** Avoid decorative emojis substituting for icons (`T19`), redundant instructions like *"Click to save"* (`T20`), password dot placeholders (`T26`), or mixing languages across UI labels (`T24`, `T27`). Pair relative timestamps (*"5m ago"*) with absolute timestamps via subtitle or tooltip (`T16b`).

### Interactive States, Forms & Overlays (`I1–I32`)
- **Button hierarchy & destructive actions (`I1–I8`):** Limit primary emphasis to one primary CTA per choice group (`I3`). Classify destructive actions by three impact questions (`I4`: *Does it delete data? Does it terminate an active process/subscription? Does it revoke access/session?*). Destructive confirmation dialogs must match destructive semantics and never truncate the target name. Secondary/subtle controls must maintain clear contrast so they do not read as disabled (`I8`).
- **Hover, focus & selection coherence (`I9–I15`, `I29`, `I32`):** Every interactive control requires a perceptible hover state on pointers (`I9`) and a visible keyboard focus state (WCAG 2.4.7). Keep hover background, click target, and `cursor-pointer` on the same element (`I29`). A container's hover background must never match the background of a child badge/control inside it (`I32`), and hovering a checked radio/checkbox must not strip its selected accent color.
- **Data views & loading transitions (`I16–I19`):** Every data-driven surface implements four states: **populated, loading, empty, and error** (`I19`). Skeletons match the geometry of real rows; subsequent filter/page changes keep existing rows visible with a subtle progress indicator rather than flashing back to a full-page skeleton or empty state.
- **Modals, popovers & focus restoration (`I20–I23`, `I30–I31`):** Modals containing form inputs must not dismiss on backdrop click (`I20`) while keeping an explicit close/cancel control. Portal floating menus/popovers to avoid container clipping (`I22`). Animate disclosures smoothly without abrupt `<details>` jumps (`I30`). When deleting or archiving the currently focused row/item, move focus deterministically to the next item or trigger (`I31`).
- **Form ergonomics (`I26–I28`):** Bind `<label>` to its control with `cursor-pointer` (`I26`), provide a show/hide toggle (`size-10` hit target) on password fields (`I27`), and preserve browser autofill with proper `autocomplete` attributes (`I28`). Place *"Forgot password?"* on the label row (after the input in DOM tab order, or properly ordered) so it never competes with validation error space below the input.

### Responsive & Small-Viewport Mechanics (`R1–R11`)
- **Zero horizontal page scroll (`R1`, `R2`):** Always declare `grid-cols-1` (`minmax(0, 1fr)`) before desktop breakpoint columns (`lg:grid-cols-*`) so wide children (search bars, chip rows, tables) never blow out mobile viewport width at 375px.
- **No orphan wrapped items (`R3`, `R6`):** Prevent 4-item rows from wrapping into `3 + 1` orphans. Keep linear sequences (kanban boards, step indicators, filter chip rails, tab bars) in horizontally scrollable containers with `shrink-0` items rather than wrapping into Z-order rows (`R6`).
- **Mobile rhythm & input sizing (`R4`, `R5`, `R8`):** Scale container padding appropriately on 375px viewports (`p-4` to `p-5` rather than desktop `p-8`). Keep editable inputs (`input`, `textarea`, `select`) at `>=16px` font size on mobile so iOS browsers do not force-zoom on focus (`R8`).
- **Mobile tables (`R9`, `R11`):** Scroll data tables horizontally inside their container or adapt to structured row cards rather than crushing columns into 3-line vertical slivers (`R9`). Secondary columns may hide on mobile, but the row's primary identifier and primary action must remain accessible (`R11`).

### Color, Elevation & Dark Mode Integrity (`M1–M32`, `W1–W9`)
- **Surface hierarchy in dark mode (`M20–M32`):** In dark mode, elevation rises by lightness/surface step rather than drop shadow alone. Never style a selected/highlighted item inside an elevated card/popover with `bg-background` (which is darker than the card and creates a "punched hole" sunken effect—checked by `findSunkenSelections`).
- **Hue stability & contrast across themes (`M7`, `M31`):** Semantic status badges and colored text must preserve their hue identity across light and dark modes (avoid shifting orange-amber in light mode to lemon-yellow in dark mode—checked by `findHueDrifts`), and never leave light `-50/-100` pastel surfaces unadapted in dark mode. Ensure inputs retain visible borders in dark mode (avoid `dark:border-transparent`).
- **Tailwind v4 traps (`W1–W9`):** Verify `@import "tailwindcss"` preflight presence, ensure `@theme` variable references resolve at `:root` when switching themes dynamically (re-deriving dependent focus/ring tokens when `--primary` changes), and avoid utility specificity collisions where `hover:border-*` overrides `checked:border-*`.

---

## 3. Three-Tier UI Review Rubric (`V1`) & Probe Verification

When reviewing or auditing an interface, classify every observation into one of three tiers (mapping directly to `visual-grounding.md` and `vision-review`):

| Tier | Forgewright Finding Class | Definition & Evidence Requirement | Default Action |
|---|---|---|---|
| **1. Broken (`Hỏng`)** | `USABILITY_ACCESSIBILITY` / `TECHNICAL_ARTIFACT` | Fails under any brand: text/UI contrast below threshold, horizontal page overflow at 375px, clipped/hidden text that loses meaning, tap target too small, floating layer overflowing viewport, hover causing layout shift, missing keyboard focus visibility. | **Must fix** (selected by default in review tables). |
| **2. System Drift (`Lệch hệ`)** | `REFERENCE_DEVIATION` | Contradicts the project's **own** tokens or components (e.g., hardcoded `#3b82f6` where the project token is `primary #2563eb`, or unstyled browser-native `<select>`/`<input type="range">` inside a styled app). **Must cite exact `file:line` project evidence.** Different border radii across different component roles (e.g., stat card vs. promo banner) are not system drift. | **Propose fix aligned to project system** (with `file:line` citation). |
| **3. Taste / Polish (`Gu`)** | `SUBJECTIVE_PREFERENCE` | Optional layout tightening, signal reduction, or visual polish where current code does not violate accessibility or project tokens. Must state user-facing impact (e.g., *"8/8 cards have a 'New' badge so nothing stands out"*), never *"doesn't match skill taste"*. | **Suggest only** (unselected by default; never overwrite brand identity). |

### Running the Deterministic DOM Probe (`ui-dom-probe.mjs`)

Whenever a live route or local HTML wireframe is available, run:

```bash
node scripts/art-direction/ui-dom-probe.mjs http://localhost:<port>/<route> --sweep
```

Include a **Probe Verification (`Đối chiếu probe`)** summary in the handoff or review report covering tested widths (`375, 768, 1024, 1280, 1440, 1920` + `1440->375` sweep), resolved `P` issues, and five visual self-check items (hierarchy at a glance, grouping/whitespace, alignment edges, visual noise/duplication, and consistency across viewports/states).
