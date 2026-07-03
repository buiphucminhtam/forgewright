---
name: animation-engineer
description: "Orchestrates interactive visual transitions, keyframe animation sequences, CSS/JS tween timelines, and sprite sheet behaviors. Use when the user requests UI motion design, hardware-accelerated web animations, GSAP/Framer Motion setups, canvas state rendering, or prefers-reduced-motion accessibility adjustments."
version: 1.0.0
---

# Animation Engineer (LITE)

## SOLVE Step 2: GROUND (Animation Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target animation and transition libraries (GSAP, Framer Motion, Anime.js) are installed | `cat package.json \| jq '.dependencies["gsap"] // .dependencies["framer-motion"]'` | Identifies active web animation frameworks and versions | |
| Existing animation stylesheets, assets, or motion configs are located | `find src/ -name "*anim*" -o -name "*motion*" -o -name "*tween*"` | Lists active UI transition scripts, stylesheets, and keyframe setups | |
| Standardized feature specifications template is active | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Confirms structural layouts for behavioral BDD specs | |
| Spend limit guidelines and token budgets are mapped | `cat .forgewright/budget.yaml` | Verifies cost boundaries and active session spend thresholds | |

## SOLVE Step 3: DECOMPOSE (Animation Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Profile DOM paint/composite cycles and layout thrashing risks | Verify that motion paths use composition-only transforms (`transform`, `opacity`) instead of trigger-reflow properties (`left`, `top`).
2. ORCHESTRATE | Establish timeline tween engines and frame-rate handlers | Ensure animations support pause/resume events and recycle active objects via object pools to prevent GC lag.
3. ADAPT | Enforce responsive accessibility overrides for motion limits | Verify that `prefers-reduced-motion: reduce` configurations successfully disable high-stakes visual flashing or complex parallax scenes.
4. SYNC | Document motion systems and export kebab-case logs to Obsidian | Trigger the post-skill synchronization scripts to establish absolute symlinks for doc alignments.

## Common Mistakes Checklist
- **Triggering DOM Reflows**: Animating geometry-altering properties (e.g., animating `width`, `height`, `margin`, `top`, or `left`) which forces continuous browser recalculations instead of utilizing hardware-accelerated `translate3d` or `scale`.
- **Ignoring WCAG Reduced Motion**: Forgetting to implement media-query overrides for users requesting reduced motion, causing nausea or triggering accessibility auditing failures.
- **Tween Instance Accumulation**: Creating timeline tweens or event loops on every click or update without calling `.kill()` on previous active animations, leading to progressive GPU/CPU leaks.
- **Blocking requestAnimationFrame loops**: Conducting heavy mathematical queries, synchronous storage reads, or logging inside the main animation frame tick, degrading output rates to sub-30fps.
- **Non-Compliant File Names**: Storing animation guides or test specifications under `docs/` using CamelCase, spaces, or uppercase letters instead of strictly lowercase kebab-case (e.g., `ui-motion-guide.md`).

## Worked Example

### Step 1: Verify the project environment and animation libraries
```bash
cat .forgewright/project-profile.json
cat package.json | grep -E "(gsap|framer-motion)"
```
Output:
```json
{
  "project_name": "forgewright-motion-app",
  "tech_stack": ["TypeScript", "GSAP", "React"],
  "health_status": "PASS"
}
```
```json
    "gsap": "^3.12.5"
```

### Step 2: Implement a leak-safe, hardware-accelerated GSAP controller inside `src/animations/interactive-card.ts`
```typescript
import { gsap } from 'gsap';

export class InteractiveCardAnimation {
  private timeline: gsap.core.Timeline;

  constructor(element: HTMLElement) {
    // Ground check: check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.timeline = gsap.timeline({ paused: true });

    if (prefersReducedMotion) {
      // Accessibility fallback: bypass intensive motion, perform instant opacity transition
      this.timeline.to(element, {
        opacity: 0.9,
        duration: 0.1
      });
      console.log('[MOTION] Reduced motion enabled. Running accessible static fallback.');
    } else {
      // Standard hardware-accelerated composition transforms
      this.timeline.to(element, {
        transform: 'translate3d(0, -10px, 0) scale(1.05)',
        opacity: 1,
        duration: 0.4,
        ease: 'power2.out',
        force3D: true // Enforces GPU layer promotion
      });
    }
  }

  public play() {
    this.timeline.play();
  }

  public reverse() {
    this.timeline.reverse();
  }

  // Explicit disposal prevents timeline allocation leaks
  public destroy() {
    this.timeline.kill();
    console.log('[MOTION] GSAP timeline instance killed and cleared.');
  }
}
```

### Step 3: Compile documentation and execute the Shared Obsidian Vault sync
```bash
cat << 'EOF' > docs/01-product/interactive-card-motion.md
# Feature: Interactive Card Motion System

## 1. Executive Summary
Responsive, GPU-promoted interactive card hover movements mapped to accessibility specs.

## 2. Technical Profile
- Engine: GSAP 3.x
- Acceleration: `force3D: true` via `translate3d` transforms.
- WCAG compliance: Fallback configured for `prefers-reduced-motion`.
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for interactive-card-motion.md.
[SUCCESS] Symlinked docs/01-product/interactive-card-motion.md to /workspace/shared-obsidian-vault/forgewright/01-product/interactive-card-motion.md.
```
