---
id: unslop-redline-passes-and-direction
title: Unslop UI Redline Passes, 5-Line Direction & Story Video Contract
summary: Harmonized 9-pass UI craft redline workflow, Heavy/Light/No-Slop triage, 5-line product direction, and opt-in story video adapted from heydamir/unslop.
status: active
version: 1.0.0
owners: [core, design]
---
# Unslop UI Redline Passes, 5-Line Direction & Story Video Contract

> Adapted from `heydamir/unslop` (commit `97daa3eb365670ea3f87ed85356cbfcee18105a5`, `CC-BY-4.0` License) created by Damir Sokolovsky (`[@heydamir](https://x.com/heydamir)`, `https://heydamir.design/unslop`, `https://github.com/heydamir/unslop`) and harmonized with Forgewright's **Evidence-Grounded Design Reasoning** (`design-mindset-and-rules.md`), **Reference-Grounded Visual Design** (`visual-grounding.md`), and **Operational App UI/UX Mindset** (`app-ui-ux-mindset.md`). Keep this credit in any copy or adaptation.

## 0. Authority Boundary & Specialist Harmonization (Zero Conflict, Zero Gap)

1. **Authority Order:** Explicit user/product requirements, validated `PIPELINE_CONTEXT.visual_basis` / `PIPELINE_CONTEXT.ui_style_profile`, existing project brand tokens (`Color Role Table` in Mode `V`), and WCAG accessibility outrank generic recipes. Purple, gradients, glass, or high-weight headings are valid when they belong to an approved project brand or `Visual Basis`; `unslop` targets **ungrounded vibecoded/AI-default slop** where decoration was sprayed across chrome without product intent.
2. **Role Boundaries Across the Design Subsystem:**
   - **`ux-researcher` → Direction Input:** Supplies the user job, mental model, and task comparison criteria (`U1`/`U2`) that anchor the `Product` line of the 5-line Direction.
   - **`concept-artist` & `art-director` → Pass 8 (`Visuals`) Governance:** When a landing hero scene or rendered object is needed, generation prompts bind to the approved Direction/Style DNA and require explicit user confirmation before any paid image generation tool call. Dashboards and app screens default to coded product previews (`S6–S8`).
   - **`ui-designer` → Triage, Direction & Passes 1–7:** Owns the Slop Audit, Triage (`Heavy Slop` / `Light Slop` / `No Slop`), 5-line Direction, and Passes 1–7 (`1. Spacing`, `2. Color`, `3. Icons`, `4. Copy`, `5. Type`, `6. Layout`, `7. Details`).
   - **`interaction-designer` & `motion-director` → Pass 9 (`Motion`) & State Mechanics:** Own zero-layout-shift state changes (`N1`), tri-modal hit targets (`N9`), keyboard focus restoration, mid-transition reversal safety, mobile touch close (`#drawer-close` on `390x844`), and `prefers-reduced-motion: reduce` (`0s`).
   - **`frontend-engineer` → Stack Implementation:** Implements the clean component/CSS pass updates in the project's real stack without leaking `.s1`, `.swap`, or `data-slop` story-video classes into production code.
   - **`vision-review` + `ui-dom-probe.mjs` (`Gate 3 / Cổng 3`) → Post-Pass Verification:** Verifies the rendered DOM across `375..1920` + `--sweep`, separating Broken usability/contrast/overflow (`P`) and project System Drift (`R` at `file:line`) from ungrounded slop/taste (`G` / `W`).

## 1. Triage Gate & Execution Loop

1. **Inspect & Snapshot:** Locate the rendering files or open the live route. If only a URL or standalone HTML file is available, capture a self-contained baseline HTML copy and `.live.png` screenshot via:
   ```bash
   node scripts/art-direction/unslop-snapshot.mjs <url-or-file> .forgewright/unslop/original.html Baseline [--dark|--light] [--width 1440] [--height 810]
   ```
2. **Audit Against `signs-tokens-and-visuals.md`:** List every observed slop sign (one line each with exact component/`file:line` location) alongside the 3-tier `Audit:` line (`app-ui-ux-mindset.md`).
3. **Classify Slop Severity Before Planning:**
   - **Heavy Slop (`Mode U-Redline`):** Widespread slop across color, type, icons, spacing, and copy on an ungrounded/vibecoded screen. Write the 5-line **Direction**, confirm with the user (unless the user already instructed to execute directly), and run all **9 ordered passes**.
   - **Light Slop (`Mode V-Polish`):** A mostly designed screen with a few remaining tells. Take the direction from the existing brand (`Color Role Table`), preserve the palette, type, layout, and visual, fix only what the audit found, and place larger ideas (such as a new hero scene) in the report as optional suggestions.
   - **No Slop:** State plainly that the screen is already well-designed, suggest at most 2–3 small refinements with exact values, and apply them only if requested. Never redesign a good screen just to make it different.

## 2. The 5-Line Direction Contract

Before editing in Heavy Slop mode, write five short lines derived from what the product actually does and who it serves (never from generic trends):

- **Product:** What it does and for whom, in one plain sentence.
- **Character:** 2–3 concrete words (e.g., `calm, exact, a little warm` or `fast, technical, playful`). Generic template words (`clean`, `modern`, `sleek`, `minimal`, `premium`) are disallowed.
- **World:** The physical place or material the product belongs to (e.g., paper and ink for notes, instruments and night shifts for monitoring, maps and window light for travel). Sets the neutral ramp tint, accent, and visual.
- **Moments:** 1–2 places where the screen carries rich color, material, and detail (e.g., a rendered card/device inside the preview, a semantic multi-series chart, or a world object beside the content) while surrounding chrome stays quiet.
- **Signature:** One small product-specific detail used consistently (e.g., live status dot for monitoring, keycaps for developer tools, route line for delivery). One detail, not five.

## 3. Nine Ordered Redline Passes

Execute in strict order so rhythm and copy length settle before typography, layout, visuals, and motion:

### 1. Spacing
- Align margins, paddings, gaps, and fixed heights to the project token scale or a 4px rhythm (with 2px steps allowed inside compact controls); remove arbitrary one-off values (`mt-[13px]`, `py-[11px]`).
- Enforce equal height/gap across sibling rows and equal padding across sibling cards (`N5`, `N12`); keep internal group spacing smaller than between-group spacing.
- Align icons in one column, labels on one start line, and numbers right-aligned (`tabular-nums`). Keep sidebar/nav rows dense (32–36px tall, 2–4px gap, section labels closer to their items than the group above, e.g., 24px above / 8px below).

### 2. Color
- Build surfaces, borders, and text from one neutral ramp (`Graphite` for apps/dashboards viewed for hours; `Graphite`, `Warm`, or `Ink` tinted toward the World for landing pages).
- Restrict text to three roles (`primary`, `secondary`, `muted`) and chrome to one rare accent that meets >=4.5:1 text contrast (or off-white primary fill on dark themes with accent reserved for selection/key figures).
- Reserve rich multi-hue color for the declared **Moments**; strip surface hue gradients, gradient text, colored glows/shadows, radial blobs, and neon borders. Use quiet hairlines (primary text at 6–10% opacity) and surface steps for dark-mode depth (`M20–M32`).

### 3. Icons
- Replace decorative/label emojis with a single line-icon set (project icon set or `lucide` at 16–18px, `1.5` stroke) inheriting the `secondary` or `muted` text color.
- Give icon boxes a uniform width and fixed gap (8–10px) so labels align; drop icons that add no meaning and use small status dots for category color.

### 4. Copy
- Write specific, product-bound headlines without exclamation marks (`!`/`!!`), greeting clichés (`Welcome back, X!`), hype words (`supercharge`, `seamless`, `unlock`, `magic`, `revolutionize`, `game-changing`, `AI-powered`), or trailing periods on labels/buttons.
- Include comparison baselines on deltas (`+12% vs last month`), use concise placeholders (`Search`, never `Search anything...` per `N7`/`T25`), replace `[X]`/`123,456` with plausible cross-consistent data (`S6–S8`), strip `New ✨`/`PRO`/`Beta 🚀` badge clutter, and flag unverified social-proof claims (`10,000+ teams`, `10x faster`).

### 5. Type
- Select an interface family matching the Character (preserving real brand typography when present) plus at most one partner (`mono` for figures/meta or `display` serif for large hero headlines only).
- Express hierarchy through size and color rather than heavy weights (use 400 and 500, at most 600 for rare emphasis; avoid 700–900 headings, italic emphasis, uppercase tracked labels, and negative letter-spacing on small text). Enforce sentence case and `tabular-nums` with one consistent number format.

### 6. Layout
- Preserve existing sections and their order (`S1`). Give apps/dashboards real desktop proportions (240–280px sidebar, fluid content up to 1440–1600px, full-viewport shell).
- For landing heroes without a full-bleed scene, use an asymmetric split (text vertically centered against a visual occupying >=50% width) or text over a large product preview; keep one primary action and at most one secondary action, quiet navigation (logo, links, one button, plain text login link), and clean mobile stacking (`>=11px` minimum text, `R1–R11`).

### 7. Details
- Apply nested radius math (`inner = outer - padding`, never `< 4px`: controls 8–10px, cards 12–16px, panels 14–20px; not everything is a pill).
- Give charts a clear hierarchy (one primary chart spanning >=2/3 width with one accent color and muted mono grid/labels; secondary data as a narrower ranked list or table, never equal-sized competing charts or stat-card sparkline clutter).
- Ensure distinct table/row states (`N2`) and visible keyboard focus indicators (`N9`).

### 8. Visuals
- Remove decorative 3D blobs, orbs, nebulas, floating cubes, glowing grids, and stock AI brains/robots.
- Dashboards and app screens rely on coded product previews and real data moments. Landing heroes use either a coded product preview proving the headline or an approved scene/object generated via `art-director` / image tooling (only after showing the prompt, model, and size for user confirmation).

### 9. Motion
- Strip gratuitous loops (`animate-pulse`/`animate-ping` on non-live items, heading shimmer, breathing glows, floating parallax) and `transition-all` / large `hover:scale`.
- Hand interactive state transitions to `interaction-designer` and `motion-director`: transition only explicit `color`, `background-color`, `border-color`, `opacity`, and `transform` using a single easing curve (`cubic-bezier(0.22, 1, 0.36, 1)` or project token: 120–180ms hover/press, 160–220ms popovers, 300–500ms sheets/drawers), support mid-transition interruption/reversal, and honor `prefers-reduced-motion: reduce`.

## 4. Redline Verification Checklist & Template Check

- [ ] Direction is recorded (or Brand Color Role Table preserved in Light Slop mode) and all 9 passes follow it.
- [ ] Spacing sits on the project/4px scale; sibling rows/cards share heights and paddings; icons, labels, and `tabular-nums` figures align in clean columns.
- [ ] One tinted neutral ramp, three text roles, and one >=4.5:1 contrast accent; no surface hue gradients, gradient text, colored glows, or decorative emojis.
- [ ] Sentence case, weights 400–600, no negative tracking on small text, no exclamation marks or unverified hype claims.
- [ ] Nested radii add up; one primary chart leads; all interactive states and keyboard focus rings are glance-recognizable; `ui-dom-probe.mjs --sweep` passes Gate 3 (`Cổng 3`).
- [ ] **Template Check:** If you swapped the product name for another product's, would the screen still fit? If yes, sharpen the copy nouns, product preview moment, and Signature detail.

## 5. Opt-In Story Video (`unslop-story.mjs`)

When the user explicitly requests a shareable before-to-after redline video:
1. Build a standalone presentation file `.forgewright/unslop-story/story.html` containing `<meta name="unslop-steps" content="Spacing, Color and icons, Type and copy, Details">` and optional `<meta name="unslop-frame" content="0 0 960">`, cumulative step classes (`.s1`..`.s4`), at most 8 `.swap` text wrappers, `data-gap` (4–6 blocks per stack), `data-radius` (2–4 elements), and optional `data-slop` (<=5 tags).
2. Render with Playwright + `ffmpeg` (or preview live with `--play`):
   ```bash
   node scripts/art-direction/unslop-story.mjs .forgewright/unslop-story/story.html .forgewright/unslop-story/unslop-story.mp4 [--wide|--play]
   ```
3. Never ship `.s1`, `.swap`, `data-slop`, `data-gap`, or `data-radius` presentation attributes in the project's production source files. Retain the `unslop by @heydamir` credit required by CC-BY-4.0.
