---
name: game-asset-vfx
description: >
  Real-time game particles, game feel, combo feedback, level-win celebration,
  environment animation and VFX optimization; hiệu ứng game, cảm giác thao tác,
  hiệu ứng combo, ăn mừng thắng màn, hoạt ảnh môi trường, tối ưu VFX.
  Excludes video editing, video ads/trailers and standalone image/photo editing.
version: 2.0.0
---

# Game Asset & VFX (LITE)

## Domain grounding

- Verify the actual engine/version/renderer, camera, target phone and existing
  effect manager from project files. Capacitor alone does not identify a renderer.
- Consume `PIPELINE_CONTEXT.visual_basis`; missing production art grounding
  returns `NEEDS_PIPELINE_GROUNDING`. Recipes are exploratory starting points.
- Trace committed events, board/entity revision, scene generation, restart and
  reward authority. Gameplay/reward must not depend on effect completion.
- Inspect palette/silhouette, protected board/UI areas, overlapping effects,
  motion preferences and measured CPU/GPU baseline before selecting technology.

## Domain actions

1. SPECIFY | effect meaning, priority and per-layer timeline | readability and
   art/timing before particle count; no universal palette/layer requirement.
2. SELECT | existing sprite/atlas/flipbook/ribbon/mesh representation | stay with
   the actual renderer; GPU particles are not always faster on mobile.
3. INTEGRATE | reuse/reset plus independent active cap | fixed-size collection
   does not prove object reuse; Unity ObjectPool.maxSize is not an active cap.
4. GUARD | event revision, scene generation and per-play token | stale callbacks,
   cancellation, restart, background and duplicate reward remain harmless.
5. ADAPT | reduced-motion/no-flash treatment and persistent result cue | essential
   information remains perceivable; review XAG 103/117/118 for applicable criteria.
6. VERIFY | rendered gameplay and real-device CPU/GPU, p95/p99, thermal/overdraw |
   proposed counts/ms are unbenchmarked; no retention or best-visuals claims.

## Load only as needed

Read [SKILL.md](SKILL.md) for the effect spec and failure modes, then select:
[art/recipes](references/art-and-recipes.md),
[web/Canvas/Capacitor](references/web-rendering.md),
[Unity](references/unity.md),
[lifecycle/accessibility](references/lifecycle-and-accessibility.md), or
[profiling/acceptance](references/profiling-and-acceptance.md).
[Primary sources](references/sources.md) bound the claims.

## Common mistakes

Avoid guessed helper imports, new emitters per frame, completion-driven rewards,
pool-retention limits mistaken for concurrency, background catch-up bursts and
stacked full-screen flashes. Do not replace the renderer for a cosmetic effect.
Return the effect spec, lifecycle checks, rendered normal/reduced variants and
actual device evidence (or explicitly `UNVERIFIED` limitations) to the pipeline.
