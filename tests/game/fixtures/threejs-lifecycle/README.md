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

Browser testing acquires the shared host worker/heavy slots before creating its
server or browser. It reuses one page and closes its owned context, browser and
server before emitting PASS. Cleanup uncertainty quarantines capacity. The
server binds only to loopback and serves an explicit file allowlist. No external
asset or cloud service is involved. Unknown OS pressure blocks admission.
For a separately verified host Chromium, set `FORGEWRIGHT_GAME_CHROMIUM` to its
absolute executable path; this does not certify the pinned Playwright browser
revision. These commands do not download a browser or open an interactive browser window.
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
Current upgrade acceptance is tracked separately in the canonical
`docs/project-state.json` metadata, available through the
[Docs Hub guide](../../../../docs/guides/docs-hub.md).

The observed unit and browser mutations changed the compiled win transition to
a loss. Each failed its unchanged oracle, restored exact bytes and passed again.
The browser run used the pinned Chromium revision and actual keyboard and
emulated touch input. Physical mobile performance remains UNVERIFIED. Never
weaken assertions to accept a mutation.

## Frozen reference and approved polish

The opt-in experiment uses `reference-contract.json`, pinned to the original
served-byte build and source commit. Its expectations come from the fixed-step
source rules; each run must still observe the reference before comparing the
candidate. Inputs are fixed before candidate execution and never consult its
next-lane hint. The original adaptive browser smoke remains separate.

```bash
npm --prefix tests/game/fixtures/threejs-lifecycle run build
npm --prefix tests/game/fixtures/threejs-lifecycle run test:reference-contract
npm --prefix tests/game/fixtures/threejs-lifecycle run test:reference
```

The comparison serves a separately identified visual-only candidate with a
declared button-shadow delta and identical game code. It checks state, score,
lane and protected tick snapshots, exact pause invariance, win/loss and restart.
Snapshot tick tolerance is declared up front for animation-frame alignment;
it is not removed by web normalization. There is no lives mechanic (N/A).
Missing/stale build, environment, input/step, engine, playtest or cleanup evidence
is UNVERIFIED; a mechanics mismatch is FAIL. The same validator command is a
required evidence item in the existing studio clone/polish gate.

One managed browser/context owns sequentially reused/closed pages and build-linked
screenshots. PASS is emitted only after confirmed cleanup. Capacity/telemetry
failure writes UNVERIFIED with no successful comparison claim. The new experiment
has not obtained a fresh real-browser PASS in the current managed cloud because
applicable Linux memory-pressure telemetry is unavailable; the host governor
remains unchanged. Offline validator/served-build tests do not fill this gap.
Only frozen input/snapshot order is checked; intra-step gameplay event order
is unverified. Contracts declaring `requireGameplayEventTrace: true` stay
UNVERIFIED until a separate observed trace verifier exists. Native engine/device
performance and human game feel remain unverified.

## Basis

The [OpenAI game-studio routing reference](https://github.com/openai/plugins/tree/main/plugins/game-studio)
supports vanilla Three.js for explicit 3D work and a DOM HUD alongside the canvas.
Its [playtest guidance](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/game-playtest/SKILL.md)
emphasizes real input and rendered screenshots. The fixture uses the
[Playwright clock](https://playwright.dev/docs/clock) before loading game timers
and [`hasTouch` emulation](https://playwright.dev/docs/api/class-touchscreen).
These are design references, not installed plugins or proof of local execution.
