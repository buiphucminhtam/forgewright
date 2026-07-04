---
name: game-designer
description: "Orchestrates game design documents (GDD), gameplay core loops, game system mechanics, progression curves, and balance parameters. Use when the user requests a new game concept, core loop formulation, mechanics definitions, balance sheets, or game design specification generation."
version: 1.0.0
---

# Game Designer (LITE)

## SOLVE Step 2: GROUND (Game Designer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target game development framework and visual stacks are defined | `cat .forgewright/project-profile.json` | ... | Y/N |
| Existing game design documents (GDD) or features are indexed | `find docs/01-product/ -name "*gdd*" -o -name "*mechanics*"` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Game Designer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. DEFINE | Design foundational gameplay loops (core, secondary, tertiary) | Verify mechanics are aligned with engine limitations (e.g., draw call limits in WebGL vs heavy physics in Unity).
2. DOCUMENT | Write structural game specifications under `docs/01-product/` matching templates | Ensure file names strictly use lowercase letters and kebab-case with no space characters (e.g., `combat-mechanics.md`).
3. SEQUENCE | Map mechanics requirements directly to downstream engineering roles | Enforce the strict sequence: `BA/Design (BDD) -> QA (Stubs) -> Build -> Test` for high-complexity features.
4. SYNC | Propagate live game design logs and progression maps to Obsidian | Execute post-skill synchronization scripts to establish absolute symlinks for visual graph analysis.

## Common Mistakes Checklist
- **Non-compliant document names**: Creating GDD files or specification assets under `docs/` that use camelCase, uppercase, or spaces (e.g., `docs/01-product/GameDesignDoc.md` instead of `docs/01-product/game-design-doc.md`).
- **Feature creep prior to core loop validation**: Specifying high-level secondary systems (e.g., unlockable cosmetics, leaderboard UI) before verifying and solidifying the basic 3-second and 30-second core gameplay loop.
- **Hardcoded game balance variables**: Outlining progression curves, enemy health pool, or damage coefficients directly within code logic instead of offloading config profiles to external datasets (JSON, YAML, CSV).
- **Ignoring hardware performance budgets**: Formulating high-overhead mechanics (e.g., thousand-entity collision sweeps) without validating mesh instancing or collision optimization rules.

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground the target game stack and baseline settings
```bash
cat .forgewright/project-profile.json
```

### Step 2: Create a standard, lowercase kebab-case mechanics document `docs/01-product/combat-loop-mechanics.md`
```bash
cat << 'EOF' > docs/01-product/combat-loop-mechanics.md
# Feature: Melee Combat Core Mechanics

## 1. Executive Summary
Provide a responsive, physics-aligned melee sword swing loop with adaptive screen shake.

## 2. Core Game Loop
1. Input Event: Player presses "Space" key (re-mappable).
2. Swing Animation: Core engine triggers visual arc renderer.
3. Box Intersection: Execute collision check against active targets in range.
4. Visual Feedback: Trigger hit-spark particles, sound effect, and 150ms camera shake.

## 3. Acceptance Criteria (BDD)
Scenario: Successful strike triggers visual feedback
  Given a player stands within 1.5 units of an active enemy
  When the player triggers the swing action (combat-melee-strike)
  Then detect bounding box collision overlap
  And invoke the fire-burst VFX emitter
  And deduct 10 hit points from the enemy health array
EOF
```

