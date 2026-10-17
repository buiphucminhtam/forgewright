---
name: phaser4-engineer
description: Use when building Phaser 4 2D browser games, sprite animations, scene input, physics or lifecycle; preserve legacy Phaser 3 pins with their existing specialist.
version: 1.0.0
---

# Phaser 4 Engineer (LITE)

1. GROUND: inspect package/lockfile, camera/input and project conventions. Reference pin: 4.2.1; never assume v3 snippets prove v4 compatibility.
2. DECOMPOSE: keep serializable rules outside thin Scenes; map required journeys/screens/states to wireframes, approved concepts, UI components and asset IDs.
3. IMPLEMENT: physics velocity is already integrated by Arcade; reset pooled bodies. Sprites share frame/anchor/scale and required animation names. Use project tokens/Style DNA, actual camera scale and relevant UI states; menus own focus and gameplay input.
4. VERIFY: compile against the pin, exercise real public input, inspect rendered evidence and prove restart/cleanup. Remove exact owned listeners and resources once. Follow the existing studio and game-test protocols; do not turn a prototype into production approval.

Use the managed browser/session governor before server/browser effects. Reuse pages; missing telemetry or uncertain cleanup remains UNVERIFIED. Reference mechanics and approved creative deltas have separate evidence; a passing test does not prove fun or device performance.

Read SKILL.md and the fixture README for the complete handoff. Existing Phaser 3 projects do not auto-upgrade.

For feel changes consume the designer's [action card](../game-designer/references/game-feel.md):
verify pointer mapping after resize, preview/commit/cancel, input acceptance and
return-to-control. Convert time units once; frame pacing uses raw elapsed
observations, not smoothed delta as a latency claim. No universal buffer or shake.
