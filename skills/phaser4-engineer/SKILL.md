---
name: phaser4-engineer
description: Use when building or maintaining Phaser 4 2D browser games, scenes, sprite animation, Arcade or Matter physics, responsive canvas input, or scene lifecycle. Preserve existing Phaser 3 projects with their legacy specialist unless migration is explicitly requested.
version: 1.0.0
tags: [phaser4, game-development, 2d, browser]
---

# Phaser 4 Engineer

## Ground the target

Inspect package/lockfile and current project conventions. The local reference fixture pins **Phaser 4.2.1**; API documentation may describe a different patch. Compile examples against the actual pin. New 2D browser work defaults here; new 3D goes to `threejs-engineer`. Existing v3 work stays with `phaser3-engineer` until an explicit migration plan is approved.

Consume the existing studio handoff and approved visual basis. Keep gameplay rules and serializable state outside Scene rendering. Prototype code may test one recorded hypothesis with labeled temporary art; it cannot certify production artwork or advance a production gate.

## Build a complete loop

Use a thin boot/preload and gameplay Scene, with stable asset keys and one input-to-action boundary. Phaser owns physics velocity integration: do not multiply Arcade velocity by delta again. Use fixed steps for deterministic rules where appropriate. Pool measured high-frequency entities, reset their physics bodies on reuse, and preserve a bounded ownership contract.

Map each required screen/state to its wireframe, concept, component and asset. Production sprites need shared frame size/anchor/scale and named animation keys; inspect at actual camera scale. UI should preserve the playfield and use the project's Style DNA. DOM controls suit text-heavy responsive menus; NineSlice suits stretchable texture panels where supported by the pinned engine. Art sheets alone do not prove a working UI kit.

Menus own input focus; pause gameplay when required and restore focus/control deliberately. Restart must not duplicate handlers. Remove exact owned listener functions, timers and tweens on shutdown; destroy owned resources once, preserve borrowed resources.

## Verify outcomes

Compile the fixture and extracted examples against the locked package. Test rules at their lowest reliable layer, then use public keyboard/touch input plus rendered screenshots for a full boot/play/win-or-loss/retry/pause journey. Compare protected reference mechanics separately from an approved ProductDelta; images and green unit tests do not prove improved fun.

Use `runGameTest`/`createGameBrowser` and the existing admission governor before server/browser effects. Reuse a page, close owned resources, and retain UNVERIFIED when pressure telemetry or cleanup proof is missing. No emulator is required for browser-game testing.

References: [studio](../_shared/protocols/game-studio-pipeline.md), [UI kit](../ui-designer/references/game-ui-kit.md), [version-pinned pilot](../../tests/game/fixtures/phaser4-lifecycle/README.md), [Phaser release](https://github.com/phaserjs/phaser/releases/tag/v4.2.1).
