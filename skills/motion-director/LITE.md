---
name: motion-director
description: "Use when designing motion concepts, animation systems, choreography, timing, easing, reduced-motion behavior, or deciding which motion stack to use for web UI, video, GIF, Rive, Lottie, GSAP, Motion, Remotion, or Three.js work."
version: 1.0.0
---

# Motion Director (LITE)

## SOLVE Step 2: GROUND (Motion Director Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Existing motion/animation runtime or CSS token baseline is known | Inspect `package.json` and stylesheets for CSS transition tokens, Motion, GSAP, Rive, Lottie, Remotion, or Three.js | ... | Record installed stack; default to native CSS transitions unless an existing runtime or explicit need justifies more |
| Reduced-motion and input-modality constraints are grounded | Inspect `@media (prefers-reduced-motion: reduce)` and `(hover: hover) and (pointer: fine)` rules in target styles | ... | Record current reduced-motion fallback, keyboard focus visibility, and touch access |
| Bundled quality rubric is loaded for post-implementation QA | Read `skills/motion-director/references/motion-quality-rubric.md` | ... | Cite rubric path; leave unobserved categories `unscored` |

## SOLVE Step 3: DECOMPOSE (Motion Director Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. SPECIFY | Define motion goal, lightest suitable stack, choreography, timing/easing tokens (150-250 ms ease-out default for UI state transitions), and reduced-motion path in task state | Confirm keyboard focus and input are never delayed behind entrance animations.
2. IMPLEMENT | Coordinate with UI/Frontend/Game specialist to apply explicit `transform`/`opacity` transitions, interruption/reversal handling, mobile touch close controls (include a visible `#drawer-close` button inside any drawer/sheet or keep `#drawer-toggle` unobstructed on `390x844` mobile viewports), and cleanup | Confirm rapid repeated toggles/clicks settle deterministically to the latest requested state and touch users can both open and close the surface.
3. VERIFY | Inspect desktop and mobile viewports, keyboard focus, touch input, `prefers-reduced-motion: reduce`, mid-transition interruption, and score observed categories with `references/motion-quality-rubric.md` | Cite exact revision and trace/screenshot evidence; mark unobserved categories `unscored`.
