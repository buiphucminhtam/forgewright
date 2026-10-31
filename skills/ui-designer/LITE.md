---
name: ui-designer
description: "Use for information hierarchy, layout, typography, semantic tokens, component states, responsive behavior, accessibility, or visual-system work."
version: 3.0.0
---

# UI Designer (LITE)

## Domain Authority
Own the **UI contract** for screens/components. Consume validated `PIPELINE_CONTEXT.visual_basis` + Evidence Card IDs; for greenfield UI also consume `PIPELINE_CONTEXT.ui_style_profile`. Do not recreate pipeline research. Without a `GROUNDED` basis, return `NEEDS_PIPELINE_GROUNDING`. Model prior may suggest hypotheses, never choose material style. Translate product/UX intent into hierarchy, tokens, states and responsive behavior.

## SOLVE Step 2: GROUND (UI Designer Domain Slots)
| Specialist input | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Pipeline visual basis | Read validated basis id/card ids, `PIPELINE_CONTEXT.visual_basis`, and approved design refs | ... | current evidence + applicability/causality boundaries + MUST MATCH / MAY VARY / PROHIBITED DRIFT |
| Information architecture / task priority | Read BRD/user flow/UX findings and current screen | ... | primary task, content hierarchy, progressive disclosure decisions |
| Design-system tokens | Inspect theme/token/component-library files | ... | semantic color/type/space/radius/elevation/motion tokens actually available |
| Component anatomy and reachable states | Inspect existing components/state model | ... | slots + default/hover/pressed/focus/disabled/loading/empty/error states relevant to behavior |
| Responsive / platform constraints | Read breakpoints, safe area, orientation/input conventions | ... | target viewport/input matrix |
| Accessibility contract | Inspect semantic roles, focus order, contrast/text scaling/reduced motion needs | ... | applicable WCAG/platform requirements + affected components |

## Mandatory UI/HUD Review Gate

For every material screen or gameplay HUD, verify these before handoff:

- **Task and viewport:** name primary task/content. Measure HUD/chrome coverage, occlusion, safe areas and target-scale readability; decoration must not overpower task priority.
- **Hierarchy and grouping:** rank primary/secondary/tertiary information; verify reading order, alignment and proximity match priority.
- **Semantic system:** bound container/border/elevation roles; avoid uniform rounded-card/glow defaults. Keep semantic color families consistent and pair meaning with text/icon/shape cues.
- **Typography:** verify actual resolution, viewing distance, localization and up-to-200% scaling. Prefer sentence case and locale-aware alignment; reserve all-caps for short labels or approved identity.
- **Measured accessibility:** calculate contrast instead of judging by eye and apply the target platform's thresholds. Use the source-backed UI/HUD checks in `skills/_shared/protocols/visual-grounding.md`.
- **States, audit and DOM probe:** review interaction states, responsive/camera conditions, and apply [references/app-ui-ux-mindset.md](references/app-ui-ux-mindset.md) (pre-code `Audit:` line, `U/V/L/D` routing, Color Role Table, `N1–N12`, and `scripts/art-direction/ui-dom-probe.mjs --sweep`). A static frame cannot prove motion or state quality.

## SOLVE Step 3: DECOMPOSE (UI Designer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. HIERARCHY | Screen/task content | Define focal point, primary/secondary actions, grouping, density and disclosure; verify scanning order matches user task priority.
2. LAYOUT | Grid/container/spacing system | Map content to existing layout primitives and target viewports; verify wrapping/overflow/safe-area behavior.
3. TOKENS | Semantic visual roles | Map brand/reference values into semantic tokens; verify no component introduces unexplained one-off styling.
4. COMPONENT | Anatomy + variants/states | Specify content slots, affordance, state transitions and error/loading/empty/focus behavior; verify state family remains recognizable.
5. TYPOGRAPHY | Type hierarchy/readability | Set scale/weight/line-height/measure from project type system; verify actual display scale and localization/wrapping risk.
6. ACCESSIBILITY | Semantics/focus/color independence/motion | Specify keyboard/touch/focus and reduced-motion behavior; verify meaning is not encoded by color alone.
7. VISUAL CONTRACT | Downstream frontend/mobile/engine | Deliver component inventory, tokens, responsive/state matrix and reference deviations for implementation.

## Domain Failure Modes
- **Hierarchy by decoration:** bigger/glowier styling replaces clear task priority or content grouping.
- **Token fragmentation:** visually identical roles get one-off hex/spacing/radius values instead of semantic tokens.
- **Component-state drift:** hover/pressed/loading/error variants look like unrelated components or alter layout unexpectedly.
- **Density mismatch:** desktop information density is copied to touch/mobile or mobile sparsity is copied to productivity desktop without task rationale.
- **Typography overflow blindness:** labels/localized text/large text break controls because type was reviewed only at ideal copy length.
- **Focus/visual-order mismatch:** keyboard/screen-reader sequence differs materially from perceived reading order.
- **Safe-area/input miss:** critical controls collide with notch/system gesture/thumb/console navigation constraints.
- **Reference mimicry without function:** pixels are copied from a reference while its content model/task context differs from this product.
- **HUD-as-dashboard:** repeated panels, persistent center overlays or decorative callouts consume the primary gameplay/content viewport without a task-critical reason.

## Domain Verifiers / Handoff
Verify token conformance, component-state completeness, target viewport overflow/wrapping, focus/semantic accessibility and rendered reference deviation. Hand downstream roles a concrete UI contract; return product/architecture/scope-changing discoveries as `DOMAIN_FINDING`.

## Phaser 4 / Three.js experience handoff

New 2D browser projects use Phaser 4; explicit 3D uses Three.js. Preserve verified existing engine/version pins. Map reachable gameplay/screen states to wireframes, applicable character/environment/UI concepts, approved Style DNA, component states and asset IDs. Follow [the game UI kit handoff](references/game-ui-kit.md); reuse an existing kit when it meets the contract. The optional DOM starter is `templates/game/ui-kit/`. A picture of a component family is not a usable interactive kit.
