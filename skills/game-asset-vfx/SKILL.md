---
name: game-asset-vfx
description: >
  Use for real-time game assets and VFX: particles, game feel/juice, action or
  combo feedback, level-win celebration, environment animation and VFX
  optimization. Vietnamese triggers: "hiệu ứng game", "hạt particle",
  "cảm giác thao tác", "hiệu ứng combo", "ăn mừng thắng màn",
  "hoạt ảnh môi trường", "tối ưu VFX". English triggers: "game particles",
  "game feel", "combo effects", "level-win celebration", "environment animation
  in a game", "optimize game VFX", "sprite quality". Applies to the actual game
  engine, including Three.js/WebGL, Canvas, Capacitor web games, Phaser, Unity,
  Unreal, Godot and Roblox. Excludes video editing, video advertisements,
  trailers, footage compositing and standalone photo/image editing.
version: 4.0.0
author: forgewright
tags: [game-assets, vfx, particles, game-feel, combo, celebration, mobile, accessibility]
---

# Game Asset & VFX

## Domain Authority

Own the real-time visual feedback contract: readability, art/timing translation,
representation, effect lifecycle and measured rendering cost. Consume
`PIPELINE_CONTEXT.visual_basis` and the validated Visual Evidence Card binding
from the pipeline; use the shared [visual foundations](../_shared/game-visual-foundations.md)
and [visual grounding](../_shared/protocols/visual-grounding.md) as analysis lenses.
If a production art decision lacks a GROUNDED basis, return
`NEEDS_PIPELINE_GROUNDING`; original exploratory prototypes may be labeled
hypotheses for review. Do not treat training prior or these recipes as visual evidence.

Game rules, economy, reward authority and renderer migration belong to their
existing owners. Keep sprite/asset polish in scope when it supports the game's
visual language. A silent ambient effect or a flat sprite can be intentional;
there is no mandatory particle count, layer count, palette or audio pairing.

## Specialist Inputs

Before selecting an effect implementation, inspect the actual project:

- Engine/version, renderer, render pipeline, camera, canvas/webview and target
  devices from manifests, scene code and installed packages. Capacitor is a
  host wrapper, not evidence that a game uses Three.js. Verify uncertain APIs
  against documentation for the installed version.
- Existing effect manager, event source, board/entity identity, scene lifetime,
  pause/restart/background handling and reward transaction owner.
- Art direction: approved silhouettes, palette/value hierarchy, materials,
  motion language, gameplay region and UI/safe areas that must stay readable.
- Worst expected event overlap, device evidence, motion settings, asset
  provenance and current performance baseline. Missing measurements stay
  `UNVERIFIED`; do not substitute desktop/emulator FPS.

## Specialist Heuristics

1. **Readability → art/timing → representation → density.** Show the action's
   origin, direction, outcome and importance. Preserve targets and board state
   at the peak. Fix an unclear silhouette or monotonous timing before adding
   particles. A grounded multi-layer timeline can use shape, light, motion,
   text and optional sound without turning every layer into an emitter.
2. **Palette roles and silhouette serve gameplay.** Separate focal accents
   from ambient values; test light/dark backgrounds, grayscale and small
   screens. Reinforce color with shape, icon/text or another available channel.
   Do not impose universal hue bans, palette ratios or shape meanings.
3. **Use the current renderer first.** Prefer existing sprites/tweens/native
   particle systems for bounded effects. Compare atlas/flipbook, ribbon/trail,
   mesh and instanced representations only where they solve a measured or
   visible problem. Avoid an engine rewrite for a confetti burst.
4. **Reuse and admission are separate.** A fixed-size collection is not proof
   of an object reuse pool. Pool instances/resources with a reset contract;
   independently cap active effects, particles, emitters and transparent
   coverage. GPU particles are not always faster on mobile: simulation savings
   can lose to fill-rate, blending, bandwidth or synchronization cost.
5. **Effects observe committed gameplay events.** Gameplay/reward must not
   depend on effect completion. Event revision and scene generation guard
   against stale callbacks, reused objects, duplicate delivery and restart.
6. **Reduce decoration before essential information.** Drop/coalesce ambient
   and repeated flourish at saturation; retain an inexpensive action/result
   cue. Support cancellation, disabled VFX, reduced motion and no-flash
   treatments without changing the game's result.

## Workflow and Domain Artifacts

### 1. Ground and specify

Inspect the smallest affected scene and effect/event path. Write an effect spec
in the project's existing design/task format (do not create a second framework):

| Spec field | Required decision |
|---|---|
| Event and authority | committed event kind, event ID/revision, scene generation, reward owner |
| Meaning and priority | what the player learns; focal/secondary/ambient; protected gameplay/UI regions |
| Art contract | silhouette, palette roles, materials, reference binding, prohibited drift |
| Timeline | anticipation, impact, travel, settle; per-layer start/end, curves and overlap policy |
| Representation | sprite/atlas/flipbook/ribbon/mesh; blend/depth; texture ownership |
| Resource policy | reuse/reset, active cap, admission/drop/coalesce policy, cleanup owner |
| Lifecycle | cancellation/restart/background, stale callback guards, accessibility variants |
| Evidence | rendered readability review, event/lifecycle checks, device baseline and profiling plan |

Read [art and puzzle recipes](references/art-and-recipes.md) for an original
worked spec. Its counts and milliseconds are **proposed starting points, not
benchmarks or universal quality standards**. Obtain playtest/art review before
calling a treatment accepted; do not claim improved retention or “best” visuals.

### 2. Select only the relevant engine reference

| Observed runtime | Load on demand |
|---|---|
| Three.js/WebGL, Canvas, Capacitor web game | [Web rendering](references/web-rendering.md) |
| Unity, with its actual render pipeline/version | [Unity](references/unity.md) |
| Phaser, Unreal, Godot, Roblox or another engine | Use installed engine tools and the corresponding Forgewright engine specialist; apply this spec/lifecycle contract, verify native APIs |
| Engine not yet identified | Inspect runtime first; do not invent file paths, helper imports or dependencies |

There is no assumed `@shared` VFX library. Reuse project helpers only when present
and appropriate. Do not add a renderer or a heavy dependency by default.

### 3. Integrate safe event and resource lifetimes

Apply [lifecycle and accessibility](references/lifecycle-and-accessibility.md).
Trace commit → presentation, with a token per play invocation rather than only a
scene check. Test delayed work after cancellation and instance reuse. Reward
idempotency belongs to the gameplay transaction layer, not the particle pool.

### 4. Review and profile

Review the effect inside actual play, including overlap, rather than just in a
showcase. Use [mobile profiling and acceptance](references/profiling-and-acceptance.md)
to separate CPU/GPU time, frame p95/p99, thermal behavior and overdraw. Structural
checks prove integration; they do not prove beauty, phone performance or
photosensitivity safety. Report the untested device/art/accessibility limits.

## Domain Failure Modes

| Evidence/sign | Correction |
|---|---|
| More particles obscure targets or score | simplify silhouette, palette/value and timeline; reduce coverage |
| Flat timing despite many layers | vary onset/acceleration/decay according to the action meaning |
| New objects/materials on every event | inspect allocation; reuse/reset where worthwhile; verify disposal |
| Pool size interpreted as active cap | add independent admission accounting and deterministic overload policy |
| Callback mutates next board or reused instance | guard generation/revision/play token and cancel owned tasks |
| Win replay gives another reward | move idempotency to committed gameplay transaction; VFX is an observer |
| Resume dumps missed emissions | pause/cancel cosmetics and reset the time origin; do not catch up bursts |
| GPU solution regresses a phone | compare same-art workload; inspect fill-rate, passes, bandwidth and heat |
| Reduced motion erases success information | keep persistent icon/text/state and optional sensory alternatives |

## Domain Verifiers and Handoff Contract

Deliver the effect spec, asset provenance, implementation/cleanup ownership,
normal and reduced-motion rendered evidence, event saturation/restart/background
checks, and device profiling results with configuration and limitations. Hand the
engine specialist exact integration facts; return scope-changing findings as
`DOMAIN_FINDING` to the pipeline. Do not certify gameplay, rewards, accessibility,
aesthetics or mobile performance from a successful build alone.

Primary sources and their precise scope are listed in
[sources](references/sources.md); read the linked source when its API or criteria
matter. These sources support technical constraints and design lenses, not
copied assets, exact production recipes or business outcome claims.
