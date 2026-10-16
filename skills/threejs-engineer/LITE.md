---
name: threejs-engineer
description: Use when building Three.js browser games or interactive 3D scenes, camera/input systems, shaders, GLB assets, or rendering and resource-lifecycle optimizations.
version: 2.1.0
---

# Three.js Engineer (LITE)

## SOLVE Step 2: GROUND

| Material assumption | Check |
|---|---|
| Actual engine/toolchain | Inspect package/lockfile; preserve existing pins. Reference fixture uses Three 0.183.2. |
| Rendering and production context | Inspect canvas, chosen renderer, camera, input, asset ownership and named target hardware/budgets. |
| Accepted experience | Consume the studio handoff, Visual Basis/Style DNA, required screen/state wireframes, applicable character/environment/UI concepts and component/asset IDs. |

## SOLVE Step 3: DECOMPOSE

1. RULES: keep serializable simulation outside rendering; apply elapsed time once. Use the project's architecture, not compulsory ECS.
2. PRESENT: align coordinates, clipping/frustum and responsive aspect; keep playfield readable. GLB/glTF uses consistent units/pivots/scale, required clip names, material/texture expectations and applicable collision/LOD strategy. Actually load and animate before claiming runtime integration.
3. INPUT: menus gate camera/keyboard/pointer-lock controls, manage focus and restore the intended control mode. Reuse the existing UI or the optional game UI kit; no forced React or world-space HUD.
4. VERIFY: use the lowest reliable layer for changed rules/import/lifecycle; public input plus current rendered evidence for actual scene/viewport behavior. Measure approved target budgets; screenshots and counters do not prove GPU bytes or mobile performance.
5. CLEANUP: cancel the owned loop/listeners and loader work; dispose owned geometry/material/texture/mixer resources once after final use. Preserve borrowed assets. Handle late loader completion and cached-page navigation explicitly.

WebGLRenderer requires WebGL2 since r163; do not impose old WebGL1 NPOT rules universally. WebGPU fallback applies only when required by the selected renderer/capability contract. Reduced motion and low quality remain separate; essential cues survive.

Follow the existing game-studio and game-test protocols. Prototype evidence does not approve production art. Protect frozen reference mechanics; evaluate approved ProductDelta/player benefit separately. Missing runtime/visual evidence stays UNVERIFIED.

Start long-running processes through `bash scripts/runtime/dev-run.sh --role <role> -- <command>`. Browser tests use `runGameTest`/`createGameBrowser`, existing admission, page reuse and confirmed owned cleanup. Never bypass unknown host pressure. Close with the runtime ledger.

Read SKILL.md for full examples compiled by the existing fixture; see [UI handoff](../ui-designer/references/game-ui-kit.md) and [runtime ownership](../../docs/adr/ADR-010-runtime-lifecycle-guard.md).
