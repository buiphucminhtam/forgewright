# Art direction and original puzzle recipes

Read when translating a grounded visual basis into a playable effect. These are
original design proposals, not extracted production assets or benchmark data.

## Build a readable visual sentence

Decide what changed, where it happened and what deserves the eye first. Use one
recognizable focal silhouette with secondary accents subordinate in size,
contrast and duration. Palette roles follow the approved game style: gameplay
identity, transient accent, neutral support. Test silhouettes without glow and
in grayscale; color alone should not carry success/error or target identity.
Check foreground/background value separation at the smallest target viewport.

Layering means separate jobs over time, not a required number of emitters:
anticipation establishes intent, impact marks commitment, travel conveys flow,
and settle returns attention to play. Tune curves and rhythmic contrast against
actual input cadence. Do not add delay to input acceptance just to show wind-up.

[Riot's VFX update priorities](https://www.leagueoflegends.com/en-us/news/dev/dev-behind-the-scenes-of-vfx-updates/)
put accurate gameplay communication and readability ahead of thematic flourish.
[Playrix's lead-VFX account](https://dtf.ru/playrix/963583-kak-sozdayut-vizualnye-effekty-v-igrah-vid-iznutri)
describes simplifying an unpleasant repeated destruction effect. These support
reviewing noise and repetition in context, not a retention claim or universal style.

## Worked spec: original “Mosaic Garden” tile-clear

All numeric values below are **proposed starting points, not benchmarked**;
playtest timing and measure the target device before setting production budgets.

- Meaning: a committed group of tiles cleared; the board result remains visible.
- Event: `TilesCleared`, immutable event ID, board revision and scene generation.
  Gameplay updates tiles/score before publishing; presentation awards nothing.
- Focal form: a compact outline echo of the cleared cluster, with a reserved
  accent from the project's palette. Secondary chips use the tile silhouette.
- Space: clip secondary chips to the board decoration region; score/result text
  stays above the effect. No full-screen flash or automatic camera movement.
- Resource proposal: at most 4 simultaneous clear presentations and 24 active
  decorative chips across this effect family. Reuse resources; on saturation
  merge nearby decorative chips or omit them, preserving the clear/result cue.
- Lifecycle: every play captures its generation/revision/token; cancel on board
  replacement, scene exit or restart. Reduced motion uses a static outline/result.

| Layer | Proposed start/end | Shape/motion and purpose |
|---|---|---|
| Action acknowledgement | 0–80 ms | brief local outline; committed input is perceptible |
| Focal tile echo | 0–160 ms | small compression/release, then fade; conveys location |
| Secondary chips | 40–240 ms | 6 chips follow short outward arcs; never hide next targets |
| Score presentation | 60–320 ms | existing score display updates independently; restrained accent |
| Settle | 160–320 ms | decoration clears and attention returns to the board |

The overlap makes this a layered timeline, not five sequential delays. Remove a
layer if it adds no readable meaning. Review normal-speed repeated play, peak
frame, grayscale, saturated event overlap and reduced-motion treatment.

## Puzzle recipe families

| Family | Intent and layered treatment | Lifecycle and overload behavior |
|---|---|---|
| Tap/select/drag/drop | immediate silhouette/outline acknowledgement; optional short settle; legal/illegal state uses shape/icon as well as color | follow the current input target; cancel previous selection on revision change; no reward or input gate on settle |
| Match/merge/clear | local focal shape → directional secondary fragments → settle; preserve board occupancy/result | snapshot committed positions; coalesce decoration during chains; cap active effects globally |
| Combo | pulse the existing combo label, then a directional ribbon toward the result region; escalate rhythm/shape before density | derive from committed combo revision; replace obsolete label animations; clamp intensity and avoid accumulating shakes |
| Level-win celebration | persistent success/result panel first; localized emblem accent → optional confetti framing → calm settle | deduplicate win presentation per event; reward already committed; continue/skip available immediately; cancel on restart/navigation |
| Environment animation | low-priority wind ripple, foliage sway, water flipbook or sparse drifting motes from approved setting | background/hidden scene suspends it; spatial and active caps; static variant; yield attention and coverage to gameplay |

For a win prototype, a single 500 ms decorative settle and 12 confetti pieces
could be tried; these are **unbenchmarked proposals**, not required minima.
Do not loop celebration until the user acts. Environmental animation can be
absent when the board or UI needs calm contrast. No recipe mandates Three.js,
GPU simulation, post-processing, audio, screen shake or a particular art style.

## Choose a representation by its job

- **Atlas sprites:** reuse a texture and shared state for related silhouettes;
  pack with padding and verify filtered/mipmapped edges on the actual renderer.
- **Flipbook:** a bounded authored temporal shape (splash/smoke/glint) can replace
  many simulated pieces; review texture memory, frame cadence and alpha coverage.
- **Ribbon/trail:** communicates a continuous route or combo connection; clamp
  history length, reset on teleport/reuse and inspect joins, width and coverage.
- **Mesh:** expresses a controllable silhouette/deformation or 3D shard;
  compare geometry/material/pass cost against sprites before adopting it.

Shared textures do not automatically batch incompatible materials, blend modes
or depth ordering. Large soft alpha quads can cost more than many tiny opaque
pieces; particle count alone is a weak proxy for visual density and GPU cost.
