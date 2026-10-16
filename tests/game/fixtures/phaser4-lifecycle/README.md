---
title: Phaser 4 lifecycle and experience fixture
status: active
owner: Game tooling maintainers
scope: Phaser 4 and Three.js experience handoff
last_reviewed: 2026-10-16
canonical: false
---

# Phaser 4 lifecycle and experience fixture

Signal Garden is a small original 2D three-lane courier game. Move with arrows or
large touch buttons; cross with ↑, collect three signals, lose on a wrong lane,
pause/resume, restart or open settings. It uses Phaser **4.2.1**, two-frame sprite
animation, a local SVG environment, a NineSlice panel and the shared DOM UI kit.
The model is independent of Scene rendering. Restart unsubscribes the exact
owned keyboard handler; page teardown destroys owned UI and the Phaser game.

## Run from the Forgewright repository root

```sh
npm --prefix tests/game/fixtures/phaser4-lifecycle ci --ignore-scripts
npm --prefix tests/game/fixtures/phaser4-lifecycle run build
npm --prefix tests/game/fixtures/phaser4-lifecycle test
python3 scripts/art-direction/game-experience.py validate tests/game/fixtures/phaser4-lifecycle/experience.json --project-root . --stage implementation
npm --prefix tests/game/fixtures/phaser4-lifecycle run test:browser
```

The build uses the root's installed TypeScript compiler. Dependencies and lockfile
are pinned; lifecycle scripts remain disabled. The browser runner acquires the
existing shared host slots **before** creating its server or browser. It owns one
context/page, uses public keyboard/touch input, checks menu input capture and
restart, captures desktop/touch-emulated/reduced-motion/gallery views, and records
PASS only after confirmed teardown. Unknown host pressure blocks admission.
Receipts/screenshots live under `.forgewright/runtime/game-process-research/`.
No Android/iOS emulator is required or started. No physical mobile performance,
GPU-memory reclamation or player-enjoyment claim follows from DOM/unit tests.

## Handoff and trust boundary

`experience.json` binds the approved-required-set *fixture*, screen/state
wireframes, character/environment/UI study, component states, actual source
assets, local inventory/import metadata and canonical UI source by hash.
References are repository-relative; use the repo as `--project-root`.
`handoff/` contains **synthetic conformance contracts**, including fixture-author
approval records. They exercise validator structure; they are not actual user
art approval, professional concept evaluation or live specialist outputs.
The original authored assets have CC0 license notes under `assets/`.

Source/contract and DOM checks pass locally; the current managed cloud browser
attempt is **UNVERIFIED** because host admission returned
`pi_host_capacity_timeout` before browser launch. No render, actual engine
boot/animation, target-device or player-benefit success is inferred. Run on a host
with supported real pressure telemetry to close this acceptance gap; do not
replace telemetry, bypass governors or label an unrun browser test as skipped.

The UI gallery is served at `/ui/preview.html` by the same admitted test server.
For deliberate fixture maintenance, refresh hashes only after reviewing intended
scope/source changes; never regenerate contracts to conceal a failing oracle.
