# Three.js lifecycle fixture

Signal Dash is a small playable three-lane game. Steer through three clear gates,
lose on collision, pause/resume or restart the same seed. The simulation uses
fixed 1/60-second steps. A DOM HUD and large controls preserve the playfield at
960×800 and 390×844. The palette uses a dark navy course, yellow ship and coral
obstacles, with visible keyboard focus. Assets are locally generated geometry.

## Run

Use the repo's installed TypeScript compiler. Dependencies are pinned in
package.json and package-lock.json. Install with lifecycle scripts disabled.
The offline command below requires an existing npm cache. Browser tests also
require the Chromium revision selected by the pinned Playwright package.
Verify availability on each host before running or downloading a browser.

```bash
npm --prefix tests/game/fixtures/threejs-lifecycle ci --offline --ignore-scripts
npm --prefix tests/game/fixtures/threejs-lifecycle run build
npm --prefix tests/game/fixtures/threejs-lifecycle test
npm --prefix tests/game/fixtures/threejs-lifecycle run check:skills
npm --prefix tests/game/fixtures/threejs-lifecycle run test:browser
npm --prefix tests/game/fixtures/threejs-lifecycle run serve
```

Run one task at a time after host admission. The server binds only to loopback
and serves an explicit file allowlist. Browser testing closes its own browser
and server in a finally block. No external asset or cloud service is involved.
The interactive server defaults to `http://127.0.0.1:4173`. Stop it with Ctrl+C.

## Acceptance and evidence

- Damage `(50 × 1.5 − 20 × 0.5) × 2` is 130, with a minimum of one.
- The typed pool bounds creation, reuses identity, handles duplicate release and
  disposes once. Three.js disposal events prove API calls, not GPU byte recovery.
- Unit tests check seeded determinism, win/lose, pause and twenty restarts.
- Browser tests use actual keyboard and touch-emulated controls, not state writes.
  They cover boot, start, win/lose, three restarts, pause/resume and resize.
- Console/page errors must be absent. Screenshots and the JSON receipt include a
  SHA-256 build ID covering the served game and vendor bytes. Evidence is stored
  in `.forgewright/runtime/game-host-upgrade/game-render/` at repo root.
- Touch emulation is not a real mobile device. Mobile FPS, thermals, GPU memory,
  Unity execution and production suitability remain UNVERIFIED.

Recorded local runs have passed TypeScript, unit and desktop Chromium checks.
The browser receipt records the served-byte build hash and rendered screenshots.
Separate schema-v2 verification records bind the exact tested source tree.
Current upgrade acceptance is tracked separately in
[canonical project status](../../../../docs/project-state.json).

The observed unit mutation changed the compiled win transition, failed the same
unit oracle, restored exact bytes and passed again. Browser mutation remains
planned and UNVERIFIED until host admission permits the browser oracle. Never
weaken assertions to accept a mutation.

## Basis

The [OpenAI game-studio routing reference](https://github.com/openai/plugins/tree/main/plugins/game-studio)
supports vanilla Three.js for explicit 3D work and a DOM HUD alongside the canvas.
Its [playtest guidance](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/game-playtest/SKILL.md)
emphasizes real input and rendered screenshots. The fixture uses the
[Playwright clock](https://playwright.dev/docs/clock) before loading game timers
and [`hasTouch` emulation](https://playwright.dev/docs/api/class-touchscreen).
These are design references, not installed plugins or proof of local execution.
