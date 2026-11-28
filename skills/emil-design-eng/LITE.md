---
name: emil-design-eng
description: "Design-engineering judgment for interaction polish: press and hover states, transition timing and easing, springs, popover origin, tooltips, drag and gesture details. Use when a game menu, HUD control or app component works but feels stiff, laggy or cheap to interact with."
version: 1.0.0
---

# Emil Design Engineering — Interaction Polish (LITE)

> Vendored from `emilkowalski/skills` (MIT, Emil Kowalski, `https://github.com/emilkowalski/skills`, skill `emil-design-eng`, commit `64eb3de`), unmodified.

## Domain Authority & Harmonization
Owns the feel of individual interactions: what a press, hover, open, close or drag does and how long it takes. `unslop` Pass 9 (Motion) and `motion-director` own the motion system and stack choice; `interaction-designer` owns state graphs; `game-asset-vfx` owns in-world particles and impact feedback. This skill decides the per-control details inside those systems. Input must stay immediate: no animation may delay a keypress, tap or gamepad action.

## SOLVE Step 2: GROUND
| Input | Check | Result | Script-produced evidence |
|---|---|---|---|
| Control under review | Read the component code and its states (idle, hover, pressed, focus, disabled) | ... | List of states with current timing/easing |
| Interaction cost | Time from input to visible response; frame drops during the transition | ... | Recorded timing or trace |
| Reduced motion | `prefers-reduced-motion: reduce` path | ... | Rendered result with motion reduced |

## SOLVE Step 3: DECOMPOSE
1. AUDIT | each interactive control | Name the detail that feels wrong (timing, origin, easing, missing pressed state).
2. FIX | the control's own styles in the project's styling system | Animate `transform`/`opacity`; keep durations short for frequent actions.
3. VERIFY | render on pointer, touch and keyboard | Input responds on the same frame; reduced-motion path works.
