---
title: Game flow, wireframe and UI kit handoff
status: active
owner: Game tooling maintainers
scope: Phaser 4 and Three.js experience handoff
last_reviewed: 2026-10-16
canonical: false
---

# Game flow, wireframe and UI kit handoff

For Phaser 4 (2D) and Three.js (3D), consume the existing game promise,
player verbs, target camera/input and grounded Visual Basis. Preserve Concept
Artist → Art Director authority. UI owns screen/component anatomy, states,
layout and interaction; it does not choose a competing art direction.

Build the applicable inventory: boot/loading, menu/onboarding, gameplay HUD,
pause/settings, results/retry and game-specific surfaces. Shop, inventory,
characters and meta-game are not compulsory features. For each reachable
screen/state, supply a low-fi wireframe; map its content and controls to
concept/Style DNA, semantic tokens, component IDs, asset IDs and runtime entry.
A full-color art sheet alone cannot close a missing interactive component.

Use `game-experience/v1` (`schemas/game-experience.schema.json`) for the required
set from the approved design-ready handoff, its journeys/screens and bindings.
Reference that source intent by file hash. The checker validates the declared
scope and local hashes, not authenticity of approval or semantic completeness
of arbitrary prose. A changed required set must go through the existing
ProductIntent/Delta and owner review; never delete requirements to pass.
The first state in each journey is its entry; all declared states must be
reachable through that journey's transitions. Declare and hash every JSON
card in the supplied creative card directory; helpers must not read unbound
neighboring cards.
Declared character/environment asset categories and UI components also make
their concept categories applicable. Assetless games may bind empty inventory
and import documents at implementation stage; the legacy lifecycle CLI keeps
its existing nonempty import requirement.

Use the full source/plugin checkout containing `scripts/art-direction`,
`schemas` and `templates`; run from that root or use its absolute script path.
For a receipt-owned shared MCP runtime, resolve and verify the original
`source_root` from its ownership receipt. Copied global skill catalogs are
not standalone game-tool installations; legacy symlinked skills resolve back
to their source checkout.

```sh
python3 scripts/art-direction/game-experience.py validate /project/experience.json --project-root /project --stage design
python3 scripts/art-direction/game-experience.py validate /project/experience.json --project-root /project --stage implementation
```

Design checks bind wireframes, concept categories, tokens and required component
states to the validated creative bundle. Implementation additionally needs real
assets, inventory/import manifest, component runtime/preview refs and hash-bound
import observations. Missing required evidence fails. Legitimate non-applicability
needs a reason and cannot waive an item in the approved required set.

Useful component families: buttons/icons, panel/dialog, tab, toggle/slider,
progress/resource display, tooltip/toast and HUD text. Include reachable
pressed/focus/disabled/loading/error states, relevant hover, safe-area/responsive
layouts, long/localized labels and keyboard/touch paths. Menus gate gameplay and
camera input; close restores the intended focus/control mode. Low quality and
reduced motion are distinct; essential feedback remains available.

The optional `templates/game/ui-kit/` starter supplies working DOM controls and
a state gallery. Reuse an existing kit when it meets the same contract. Phaser
canvas panels may use version-verified NineSlice; Three world-space cues remain
scene-owned. No compulsory UI framework, font, gradient or motion style.

Checker PASS applies only to design/implementation completeness. Actual runtime
acceptance requires the current served build, public-input journey, rendered
viewport evidence, intended target and confirmed managed resource cleanup.
Visual appeal and player benefit need separate review/playtest.

The bundled config opts into `auto_detect_rules.game_engine_routing`: explicit Phaser 4/Three.js requests and new 2D/3D game intent select the relevant web specialist; existing project package pins win when the engine is unspecified. Older user configs without that setting preserve their routing until intentionally adopted. The orchestrator resolves configuration/project policy and package evidence from the consumer project, while skill source stays under the trusted framework root. Explicit CLI selectors remain available.
