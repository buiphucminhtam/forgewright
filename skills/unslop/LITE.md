---
name: unslop
description: "Mandatory UI craft and redline skill for all UI design and design-planning work. Audits AI/vibecoded slop, locks a 5-line product-derived Direction (Product, Character, World, Moments, Signature), and applies 9 ordered passes (Spacing, Color, Icons, Copy, Type, Layout, Details, Visuals, Motion) harmonized with UI Designer, Interaction Designer, Motion Director, and Vision Review."
version: 1.0.0
---

# Unslop — UI Craft & Redline Specialist (LITE)

> Adapted from `heydamir/unslop` (`CC-BY-4.0`, Damir Sokolovsky `@heydamir`, `https://github.com/heydamir/unslop`). Always active during UI design and design planning alongside `ui-designer`.

## Domain Authority & Harmonization
Own the **UI Craft & Redline Gate** across every UI design and design-planning task. Explicit user requirements, `PIPELINE_CONTEXT.visual_basis` / `ui_style_profile`, existing brand tokens (`Color Role Table`), and WCAG accessibility take precedence over default token recipes. Coordinate seamlessly with `ux-researcher` (`Product` job), `ui-designer` (hierarchy/tokens/Passes 1–7), `concept-artist`/`art-director` (Pass 8 generated visuals after user approval), `interaction-designer`/`motion-director` (Pass 9 motion, `N1` zero-shift, `N9` targets, `prefers-reduced-motion: reduce`), `frontend-engineer` (clean stack code without `.s1`/`.swap` story classes), and `vision-review` (`Gate 3` `ui-dom-probe.mjs --sweep` + Template Check).

## SOLVE Step 2: GROUND (Unslop Domain Slots)
| Specialist input | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Screen & codebase baseline | Inspect rendering components/styles or capture live URL/HTML via `node scripts/art-direction/unslop-snapshot.mjs <url-or-file> <out.html> [label] [--dark\|--light]` | ... | `Audit:` line + rendered baseline screenshot (`.live.png`) |
| Slop signs & severity triage | Audit against `skills/unslop/references/signs.md` and `skills/ui-designer/references/unslop/signs-tokens-and-visuals.md` | ... | Classify **Heavy Slop** (full 5-line Direction + 9 passes), **Light Slop / Keep-Brand** (preserve brand palette/type, fix audited slop only), or **No Slop** (<=3 exact refinements, no redesign) |
| 5-Line Direction (or Keep-Brand Color Role Table) | Derive `Product`, `Character` (no `clean/modern/sleek/minimal/premium`), `World`, `Moments` (1–2 rich focal elements), and `Signature` (1 product-specific detail) | ... | Locked Direction in design plan before coding |

## SOLVE Step 3: DECOMPOSE (Unslop 9-Pass Plan & Execution)
Format: `n. ACTION | TARGET | CHECK`

1. DIRECTION & TRIAGE | Design plan / brief | Lock 5-line Direction (Heavy Slop) or Brand Color Role Table (Light Slop); confirm with user when direction is open.
2. PASS 1–3 (SPACING, COLOR, ICONS) | Layout rhythm, neutral ramp (`Graphite`/`Warm`/`Ink`), 3 text roles, 1 >=4.5:1 accent, 16–18px `1.5` stroke line icons | Verify 4px/project rhythm, quiet chrome with richness confined to Moments, and zero decorative emojis/glows.
3. PASS 4–7 (COPY, TYPE, LAYOUT, DETAILS) | Specific copy (`+X% vs period`, no `!`/hype), 400–600 weights + `tabular-nums`, desktop/mobile proportions, nested radius (`inner = outer - padding >= 4px`), 1 lead chart | Verify sentence case, realistic edge-case data (`S6–S8`), and distinct row/focus states (`N2`, `N9`).
4. PASS 8–9 (VISUALS & MOTION) + GATE 3 | Coded product preview (or approved hero scene), explicit `transform`/`opacity`/color transitions (`cubic-bezier(0.22, 1, 0.36, 1)`), `ui-dom-probe.mjs --sweep` | Verify Template Check (swapping the product name would not fit another product) and zero horizontal overflow across `375..1920`.
