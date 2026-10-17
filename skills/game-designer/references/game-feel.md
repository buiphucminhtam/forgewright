---
title: Game feel judgment and action handoff
status: active
owner: Game Designer maintainers
scope: Moment-to-moment design and approved differentiation, especially Phaser 4 2D and Three.js 3D games
last_reviewed: 2026-10-17
canonical: true
---

# Game feel: diagnose, fit, differentiate

Load for a material control, feedback, camera, polish or distinctiveness task.
Use within the current GDD and studio handoff; a compiler/import fix needs no
feel exercise. Game Designer owns intent, rules and design trade-offs. Engine,
Art/VFX, audio, accessibility and QA retain their existing authority.

## Foundation, fit and signature

Good feel lets players express intent, learn a predictable response, understand
cause and consequence, and know when they can act again. Judge it in the actual
space, challenge, input mode and repeated core loop. Swink's input, response,
context, polish, metaphor and rules are useful lenses [1]; polish is one part.

| Layer | Designer question | Decision basis |
|---|---|---|
| Foundation | Is intent received, interpreted and resolved reliably? Can players read contact, state and the next available action? | Mapping, input/state traces, collision/space, consistent response and observable misunderstanding. |
| Fit | Does this timing, weight, precision, forgiveness and rhythm serve the player promise? | A deliberate heavy recovery and a calm drag puzzle have different needs. Separate immediate acknowledgment from delayed committed outcomes. |
| Signature | What action, decision or skill is memorable and learnable here? | Mechanic-linked agency/mastery, rhythm and coherent motion/audio/material grammar; recognition after repetition and removal of decorative layers. |

Distinctiveness also depends on mechanics, content and depth. More effects,
faster response or a novel aesthetic alone does not establish a better game.
Prototype feel early with enough metaphor, cues and spatial context to test
the hypothesis; a late decoration pass cannot repair an unreadable core loop.

## Diagnose one action

Observe a specific moment → identify intent/result/perception mismatch → list
plausible causes → choose the smallest change that distinguishes them → test
and keep/change/kill. Inspect correctness and meaningful information before
adding treatment. A rich presentation may still be essential to a hypothesis.

Analyze **intent → anticipation → commit/contact → response → recovery →
reward → return-to-control**. Beats can overlap, merge or be N/A; actions need
neither a reward nor a control lock by default. Record who owns input/state at
each applicable beat. Presentation observes committed gameplay events; points,
progress and rewards must survive cancellation or missing animation callbacks.

Trade-offs to resolve explicitly:

- **Responsiveness and commitment:** accepted, rejected, buffered and cancelled
  inputs have different meanings. Do not acknowledge a rejected input as an
  accepted action. Buffer expiry/priority is design, not a tween side effect.
- **Forgiveness and mastery:** identify an intent interpretation problem before
  adding coyote time, snap tolerance, input buffer or corner correction [2].
  Excess forgiveness can produce unintended actions or change the challenge.
- **Weight and control:** use pose/contact, movement, sound, space and recovery
  to fit the promise. If hitstop is justified, name stopped and continuing
  clocks, including input, simulation, camera, UI and audio.
- **Intensity and contrast:** ordinary, urgent and exceptional events need
  hierarchy. Quiet beats and silence are valid. Under overlap, coalesce eligible
  decoration while preserving essential information and reward truth.
- **Signature and fidelity:** for clone/polish, freeze observed mechanics and
  unknowns; evaluate approved ProductDelta separately. New preview, buffering,
  hitboxes or camera rules may change mechanics. Keep the comparator/oracle.

## Worked decisions

**Quiet puzzle drag.** A token lands in the wrong cell after resize. First
inspect pointer-to-board mapping, current canvas bounds, preview/commit and
cancel, not particles. A preview may help only after correct mapping, without
revealing hidden future state. Threes' development discussion distinguishes
continuous swipe from binary key input and questions preview/noise [3]; it
does not prove every discussed feature shipped. Try one target-preview change
with rules held fixed; reject if targeting errors or hidden-information leaks
increase. A fitting signature could express the piece's geometry/material;
combo pressure or shake needs its own design authority.

**Heavy melee hit.** A dodge seems lost during recovery. Trace receipt,
acceptance, queue and transitions against the reference. Distinguish dropped
valid input, deliberate commitment and missing state cues. Preserve protected
timing; propose a separate delta for new cancel/buffer behavior. Compare contact
and telegraph readability under repeated hits before adding hitstop or impact
layers. Reject spectacle that hides threats or makes accepted actions unclear.

**3D follow camera.** Inconsistent lag can come from frame-based interpolation,
mapping, scale, occlusion or an unsuitable follow policy. Check elapsed units
and same-time behavior before tuning strength. Preserve loop pause/background
ownership. A numerical camera regression proves timebase behavior; rendered
turns/obstacles and target-player observation assess readability and comfort.
Fixed camera games need no free-look system. Secondary shake/bob/blur controls
should match applicable needs [5].

## Action card in the existing GDD

For the affected action, provide these slots rather than a new manifest:

| Slot | Content downstream roles need |
|---|---|
| Promise/context | Player task, core-loop moment, input/device/session, protected reference, approved delta, unknowns. |
| Intent/state | Before/after state; press/hold/release; valid/rejected input; preview/commit; queue/buffer/cancel priority and reason. |
| Control/space | Applicable movement, collision, forgiveness and camera rules; parameter, unit, owner and baseline or UNVERIFIED. |
| Beats | Authoritative contact/result; cue timing, recovery and next control; proposed starting values labelled; clock/sync policy. |
| Meaning/grammar | One sentence the player must understand; essential/decorative channels, priority, contrast and mechanic-linked signature within approved Style DNA. |
| Alternatives | Mute/unavailable audio, reduced motion/no-flash, low quality and haptics off/absent; combined modes keep essential information. |
| Evidence/decision | Hypothesis and competing cause; baseline/variant/ablation; unchanged oracle; acceptance/rejection, owner and limits. |

The canonical VFX effect spec retains event IDs, revisions, scene/play tokens,
resource and cancellation details. Link it rather than duplicate it. Engine
owns clocks/input/lifecycle; audio owns mix/voice priority; Art/VFX own expression;
accessibility reviews access and QA/UX research assess observations. No lane
self-certifies the others.

## Conditional checklist

Select rows for the affected action. Record **APPLIES** or **N/A(reason)** and
criterion-specific **PASS / FAIL / UNVERIFIED** with build/target/evidence refs.
N/A follows actual design, never missing required evidence. The existing studio
gate decides readiness; this is no extra phase, schema or summed fun score.

GD = designer; ENG = engine; AV = relevant art/VFX/audio owner; AX = accessibility;
QA = QA/UX research; LD = level design.

| Case / player question | Observable pass; failure to catch | Evidence | If failing / owner | Applicability |
|---|---|---|---|---|
| Normal input: understood? | Correct mapping and honest acknowledgment; lost press/release or displaced touch | Public input, state/event trace, resize mapping | Repair intent boundary; GD+ENG | Affected input |
| Control: predictable? | Learnable stop/turn/contact; unexplained slip/hitbox | Paths/contact traces and task observation | Tune movement/collision/context; GD+ENG+LD | Movement/collision |
| Gesture: preview or committed? | Preview/commit/cancel distinct; early commit or hidden future leak | Drag/release/cancel, canvas exit, overlay/input modes | Separate preview from committed state; GD+ENG | Gesture/preview present |
| Rapid repeat: which command won? | Specified queue/drop/coalesce; duplicate reward/cue or saturated mix | Bursts, event identity, overlap render/listening | Preserve essentials, reduce decoration; ENG+AV | Repeating action |
| Invalid: why rejected? | Readable reason and no state mutation; false success or ambiguous silence | Blocked/cooldown/invalid target, player explanation | Affordance/rejection; GD+ENG+AV | Invalid state exists |
| Pending: waiting or stuck? | Honest pending and one commit; premature success | Real delayed state, error/cancel/retry | Acknowledge actual work, no artificial delay; GD+ENG | Pending exists |
| Anticipation/contact: when? | Cue agrees with event; phantom contact/hidden telegraph | Frame/event/audio alignment plus task play | Correct origin, sync, priority; GD+ENG+AV | Relevant mechanic |
| Recovery: can I act? | Lock/cancel/buffer matches rules; animation wrongly owns control | Input near transitions, expiry/priority | Restore state authority; GD+ENG | Recovery exists |
| Failure: what can I change? | Player recognizes cause/opportunity; misread loss | Task/replay and explanation after attempt | Fix information/challenge; GD+QA | Failure exists |
| Retry: ready again? | Clean state/input; stale callbacks/ghost input | Retry from relevant end/pending states, repeated lifecycle | Existing cleanup/control contract; ENG+QA | Retry exists |
| Win/reward: what next? | Correct result independent of celebration; cancellation loses reward | VFX off/cancel/restart/duplicate event plus state oracle | Commit reward in gameplay; ENG+GD+AV | Win/reward exists |
| Pause/background: who controls? | Correct focus/time/audio; catch-up burst/stale queued input | Public pause/focus loss/return | Explicit carry/discard and clock policy; ENG+Audio | Relevant lifecycle |
| Camera/space: can I decide? | Hazard/target/grounding readable; occlusion, discomfort, mapping drift | Paths, resize, relative input and target-player review | Tune camera/context/secondary motion; ENG+GD+AX | Relevant camera/spatial feature |
| Rhythm: what matters? | Ordinary/urgent/exceptional distinguishable; constant emphasis | Whole-loop repeated play and peak overlap | Cut competing cues, keep quiet beats; GD+AV | Affected loop |
| Mute/audio unavailable: informed? | Essential state readable; missing warning/result | Master/SFX mute, locked/suspended audio | Alternate channel, respect mute; Audio+AX+ENG | Essential cue |
| Reduced motion/no-flash: playable? | Meaning survives; reduced treatment erases state | Separate and combined mute/motion render, flash review | Replace secondary motion; AX+AV | Motion/flash present |
| Haptics absent/off: informed? | No exclusive information; unsupported vibration loses cue | Supported/absent device and setting off | Redundant cue; AX+ENG | Haptics used |
| Load/latency: consistent? | Declared target budget met; hitch/refresh-dependent timing | Raw frame distribution, event/render traces, real target | Identify CPU/GPU/GC/overdraw/input cause; ENG+TA | Affected workload |
| Signature/mastery: what is mine? | Player explains action/decision/trade-off; noise or automatic choice | Real baseline/variant play, repeated use, explanation | Keep/change/kill hypothesis; GD+QA+Art | Differentiation goal |

Use project/ref-derived thresholds, units and target budgets, not universal ms,
particle counts or FPS. Motion settings and quality tiers are separate axes.
Review combined cues and flash patterns; passing an isolated effect test is
not accessibility certification. WCAG 2.3.3 is Level AAA [7], not a universal
AA or native-game mandate. RAF timing is not physical input-to-photon latency [8].

## Evidence and experiments

Separate (1) source/contract correctness, (2) current rendered/runtime/device
behavior, (3) actual human feel/comfort/agency/mastery, and (4) product outcomes.
A build, screenshot, author judgment or contract replay supports only its own
claim. Retention/revenue require separate real data; unknowns stay UNVERIFIED.

For one moment, freeze build/content/input/device, reference and acceptance.
Compare baseline against one causal treatment; remove a layer for an ablation
while preserving essential cues. Include a deliberately busy variant that
obscures gameplay and allow a restrained variant to win. Select observations
from the hypothesis: corrections, accidental actions, telegraph recognition,
failure explanation, recovery understanding, mastery and fatigue. Observe play
before asking leading satisfaction questions. Counterbalance order where
appropriate; record learning/novelty, repeat-use effects and disagreements.
Choose a pilot/cohort and stop rule for the actual risk, not a magic sample size.

**Keep** when the target observation improves without violating constraints;
**change** when the cause/trade-off differs; **kill** when essential cues,
comfort, reference or repeated value regress. Missing players/device evidence
stays UNVERIFIED rather than a technical PASS relabelled as satisfying.

For a skill upgrade, preserve current/candidate bytes, same prompt/runtime and
tool budget, raw decisions, frozen semantic rubric and held-out cases. Judge
diagnosis, discriminating test, ownership, trade-off and rejection criteria;
do not reward checklist words or self-reported event labels. A small exploratory
sample cannot establish stable model uplift. Existing promotion requires its
trusted observed-host verifier; contract replays do not qualify.

## Primary sources and limits

Reviewed 2026-10-17. Practitioner accounts guide hypotheses, not universal
timings or causal proof. Version-sensitive code must compile against the project
pin (reference fixtures: Phaser 4.2.1, Three 0.183.2); no version migration implied.

1. [Steve Swink, Game Feel: The Secret Ingredient](https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient) — six lenses, prototype feel early; practitioner framework.
2. [Maddy Makes Games, Celeste & Forgiveness](https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html) — intent-friendly mechanics in Celeste; values/mechanics are not genre-wide defaults.
3. [Threes development correspondence](https://asherv.com/threes/threemails/) — swipe, preview and coherent expression; development discussion, not proof every proposal shipped.
4. [Xbox Accessibility Guideline 103](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/103) — additional channels for essential information, with applicability review.
5. [Xbox Accessibility Guideline 117](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117) — motion/camera settings and comfort considerations.
6. [Xbox Accessibility Guideline 118](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118) — photosensitivity, including combined presentation; no safety certification inferred.
7. [W3C Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) — animation from interaction, Level AAA scope.
8. [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) — elapsed timestamps, refresh/background behavior; not end-to-end input latency.
