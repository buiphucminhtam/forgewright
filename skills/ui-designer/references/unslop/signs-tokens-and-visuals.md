---
id: unslop-signs-tokens-and-visuals
title: Unslop Diagnostic Signs, Candidate Tokens & Visual Recipes
summary: Diagnostic slop catalog, Graphite/Warm/Ink candidate token ramps, nested radius math, and visual/effect recipes adapted from heydamir/unslop.
status: active
version: 1.0.0
owners: [core, design]
---
# Unslop Diagnostic Signs, Candidate Tokens & Visual Recipes

> Adapted from `heydamir/unslop` (`references/signs.md`, `references/tokens.md`, `references/visuals.md`, `references/effects.md` @ commit `97daa3eb365670ea3f87ed85356cbfcee18105a5`, `CC-BY-4.0` License) by Damir Sokolovsky (`[@heydamir](https://x.com/heydamir)`, `https://github.com/heydamir/unslop`). Keep this credit in copies and adaptations.

## 1. Slop Diagnostic Catalog (`signs.md`)

Use these signals during the pre-design audit to classify **Heavy Slop**, **Light Slop**, or **No Slop** (while respecting intentional approved brand tokens under `visual-grounding.md`):

- **Color & Surface Slop:** Unmotivated violet/indigo/purple-to-blue gradients on surfaces or buttons; gradient or shimmer headlines; colored glows/drop-shadows (`box-shadow` with accent hue); radial color washes/blobs behind content; neon borders; dark pages with 5+ competing purple-grey surface hues; rainbow charts or multi-shade accent stacks where nothing leads.
- **Typography Slop:** 700–900 bold weights on every heading and label; uppercase tracked section/card labels (`NAVIGATION`, `PAID THIS MONTH`); negative letter-spacing on small (`<16px`) text; italic emphasis in UI chrome; mixed number formats (`$48,210` next to `$124,860.40`) without `tabular-nums`.
- **Icons & Badges Slop:** Emojis used as navigation/card/badge icons (`New ✨`, `Beta 🚀`, `PRO`); mixed icon sets or inconsistent stroke widths; colored icon backgrounds in every stat card; glowing pill counters.
- **Spacing & Layout Slop:** Arbitrary off-scale values (`mt-[13px]`, `ml-[7px]`, `h-[31px]`); uneven row heights or card paddings in the same group; group headers closer to the preceding section than their own items; desktop apps shrunk into narrow centered columns; 3+ stacked hero CTA buttons or avatar/star rows under buttons.
- **Copy & Data Slop:** Greeting headlines (`Welcome back, Damir! 👋`); exclamation marks (`!`, `!!`); delta figures without comparison baseline (`+12%!!` instead of `+12% vs last month`); wordy placeholders (`Search anything...`); hype buzzwords (`supercharge`, `seamless`, `unlock`, `magic`, `revolutionize`, `AI-powered`); unverified social proof (`Loved by 10,000+ teams`, `10x faster`); fake placeholders (`[X]`, `$123,456`).
- **Visuals & Motion Slop:** Glossy 3D blobs, liquid chrome orbs, purple nebulas, floating cubes, glowing brains/robots; baked-in fake text/buttons inside raster images; hard unblended image edges on dark pages; `animate-pulse`/`animate-ping` on non-live elements; `transition-all`; bouncy springs or `hover:scale` >few px on cards; animating `width`/`height`/`top`/`left`.
- **Post-Pass Template Fallback Traps:** Cleaning a screen into generic `#161616` + Inter + interchangeable headline that would fit any competitor if the product name were swapped.

## 2. Candidate Starting Tokens (`tokens.md`)

When the target project already has a validated token system or `Visual Basis`, preserve it. When unslopping an ungrounded screen with no existing system, start from these values and tune them to the 5-line Direction:

### Spacing & App Proportions
- **Scale (4px base):** `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128` (controls `4–12`, related rows `2–8`, between groups `12–24`, app sections `32–64`, landing sections `80–128`, row heights `32` compact / `36` default / `40–44` touch).
- **App Shell:** Sidebar `240–280px`, fluid content with `24–32px` page padding capped at `1440–1600px`, top bar `56–64px`, main chart >=2/3 width (`280–360px` tall) paired with a narrower list/table.

### Tinted Neutral Ramps (Dark & Light)
Use `Graphite` for apps/dashboards viewed for hours; pick `Graphite`, `Warm` (paper/wood/craft/human), or `Ink` (night/water/technical) for landing pages:

| Role | Graphite (Dark / Light) | Warm (Dark / Light) | Ink (Dark / Light) |
| --- | --- | --- | --- |
| Deepest surface (sidebar) | `#0f0f10` / — | `#12110f` / — | `#07080d` / — |
| Page background | `#141415` / `#fafafa` | `#161513` / `#f7f4ee` | `#0b0d14` / `#f5f7fa` |
| Card surface | `#19191b` / `#ffffff` | `#1c1a18` / `#fdfbf7` | `#11141c` / `#ffffff` |
| Raised / active / input | `#232325` / `#f4f4f5` | `#262421` / `#efe9df` | `#1a1e28` / `#eceff4` |
| Hairline border | primary text at `8%` | primary text at `8%` | primary text at `8%` |
| Primary text | `#ededed` / `#171717` | `#efe9de` / `#1f1b16` | `#eef0f5` / `#111827` |
| Secondary text | `#a1a1a6` / `#525252` | `#aaa398` / `#5e554a` | `#a3a9b8` / `#4b5565` |
| Muted text & icons | `#85858b` / `#737373` | `#8a847a` / `#7b7266` | `#7a8296` / `#6b7487` |

- **Semantic Colors:** Positive `#4cc38a` (dark) / `#16a34a` (light); Negative `#e5484d` (dark) / `#dc2626` (light).
- **Buttons:** Hero `44–48px` tall, nav `32–36px` tall, horizontal padding `16–20px`. Dark primary: off-white fill with dark text (or >=4.5:1 accent); top hairline highlight `inset 0 1px 0 rgba(255,255,255,0.12)`.

### Character-Matched Type Families, Scale & Nested Radius
- **Precise, technical, calm:** `Geist`, `Inter`, or `IBM Plex Sans` + `Geist Mono` / `IBM Plex Mono` / `JetBrains Mono` for figures and meta.
- **Warm, friendly, human:** `Instrument Sans`, `DM Sans`, or `Figtree` + `Instrument Serif` or `Newsreader` (hero headline only).
- **Editorial, literary, crafted:** `Inter` or `Instrument Sans` + `Newsreader`, `Instrument Serif`, or `Fraunces` (headlines only).
- **Playful, bold:** `Space Grotesk` or `Bricolage Grotesque` + mono for small labels.
- **Scale:** Small labels/meta `12/16` (`400`), captions `13–14/20` (`400`), body/nav `14–15/20–22` (`400–500`), wordmark `16–18/1` (`500–600`), hero subhead `18–20/28–30` (`400`, `<=36rem`), card figures `28–32/1` (`500`, `tabular-nums`), page title `28–36/1.15` (`400–500`), hero headline `56–72` desktop / `36–44` mobile (`1.02–1.08`, `400–500`). Letter-spacing `0` below `16px`; `-0.02em` at `>=40px`, `-0.03em` at `>=56px`.
- **Nested Radius:** `inner = outer - padding` (never `< 4px`): keycap/tag `4–6px`, row/input/button `8–10px`, card `12–16px`, panel/window `14–20px`.
- **Motion Tokens:** Single curve `cubic-bezier(0.22, 1, 0.36, 1)`; hover/press `120–180ms` (press scale `0.97–0.98`), menus/popovers `160–220ms`, entrances/sheets `300–500ms` (rise `6–12px`, stagger `40–60ms` up to 6 items).

## 3. Visuals, Prompt Recipe & Optional Code Treatments (`visuals.md`, `effects.md`)

1. **Coded Product Preview First:** Dashboards and app screens rarely need generated images; build a realistic coded preview of the promised workflow with plausible cross-consistent data (`INV-0142` matching across list and detail view).
2. **7-Part Generation Prompt Recipe (when an image tool is approved):**
   - **Subject:** One plain, physical sentence derived from the World and Character.
   - **Setting:** Simple environment context.
   - **Light & Palette:** Named page background hex so edges blend cleanly.
   - **Style:** One coherent style (painted background art, cinematic single-object photo, soft matte 3D, studio product object render, light/optics, or monochrome engraving when the whole page shares that editorial world).
   - **Composition:** Subject on one side, calm empty space for headline on the other (`16:9` or wider for full-bleed hero; calm lower fifth for rising product preview).
   - **Exclusions:** No text, no letters, no logos, no UI chrome, no watermark, no baked film/paper grain.
   - **Format:** Slot aspect ratio at 2x display resolution (WebP/AVIF with descriptive `alt`, fixed `width`/`height`, and edge blending via `mask-image: radial-gradient(closest-side, #000 70%, transparent)` or page-color gradient).
3. **Optional Code Treatments on the Main Visual Only (`effects.md`):**
   - **Glyphs / Dots:** Render a 64–96 column canvas sampling image luminance into characters (`.,:;+-=*#@`) or radius-scaled dots in the ramp's muted/accent colors (`prefers-reduced-motion` static).
   - **Duotone:** SVG `<feColorMatrix type="luminanceToAlpha">` or CSS `mix-blend-mode` mapping darks to the page background and lights to the ramp primary/accent.
   - **Cutout / Window Frame:** Studio object with transparent alpha and dark-ramp contact shadow overlapping a card edge by a few pixels, or a dark-ramp 1px window bar (`32–36px` tall, three quiet 8px dots at `12%` opacity) framing a coded product preview.
