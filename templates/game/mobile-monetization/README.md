---
title: Mobile studio integration kit
status: active
owner: Game studio and mobile maintainers
scope: Portable runtime contracts and synthetic mobile setup
last_reviewed: 2026-10-17
canonical: false
---

# Mobile studio integration kit

Follow the [domain contract](../../../skills/_shared/protocols/mobile-monetization.md)
for lifecycle, authority, research and acceptance. This kit supplies executable
framework boundaries; native SDK plugins and live store adapters are project
integration work. No store connection, real ad request or live purchase is made
by these examples.

| Artifact | Purpose |
|---|---|
| `examples/studio.json` | One shared hypothetical nonsecret profile for both examples; replace accounts/app bindings and reference existing secure runtime bindings |
| `examples/*-game.json` | Phaser 4/Three.js deltas; null product/ad-unit/track/workflow/group IDs remain blockers |
| `examples/strategy.json` | Explicit hypotheses, synthetic baseline, player/market/value/learning and measurement slots |
| `runtime.mjs` + `runtime.d.mts` | Engine-neutral async native request boundary; pause/resume, ad eligibility and context checking; no local purchase grants |
| `delivery.mjs` | Server-only verified purchase delivery with retryable provider finalization |
| `sqlite-ledger.mjs` | Optional Node >=22.13 durable idempotent grant outbox; not a complete wallet, verifier or production backend |

Build CLI once, then initialize into a target project:

```sh
npm run build:cli
node src/cli/dist/index.js mobile init /path/to/game --engine threejs
node src/cli/dist/index.js mobile profile /path/to/reviewed/studio.json
node src/cli/dist/index.js mobile doctor /path/to/game/mobile/game.json \
  --profile /path/to/reviewed/studio.json \
  --strategy /path/to/game/mobile/strategy.json
```

The generated `mobile/server/` code belongs only in a trusted Node backend; do
not bundle it into the WebView. `runtime.mjs` accepts a native bridge from the
actual audited wrapper. `simulation: true` is explicit; its capability mode stays
`simulated`. The project supplies authenticated verification and ad eligibility;
neither callback may be implemented as an unconditional success stub for a live
game. Product IDs are semantic until the adapter maps the actual store catalog.

For project-owned beta adapters import the side-effect-free
`@forgewright/cli/mobile` entry. Implement `BetaProvider` against the actual
Android build/Play and existing Xcode Cloud/TestFlight workflow. `authorize`
checks existing standing app/channel scope; `verifyReadiness` consumes actual
runtime evidence. `observe` must correlate source/config/artifact/version/run
and group/track membership and obey timeouts/cancellation. `submit` must have
exactly one build/upload trigger authority. Files or caller-provided flags never
establish real store readiness. Supply a shared `FileBetaJournal` directory;
it preserves ambiguous outcomes and version ownership across process restarts.
Do not delete crash locks or reservations to repeat a submit blindly.

For CLI dry-run planning, supply a `mobile-artifact/v1` JSON manifest with
`game_id`, `platform`, `app_id`, `source_revision`, `config_digest`,
`artifact_sha256`, positive integer `version`, and `build_id`:

```sh
node src/cli/dist/index.js mobile plan /path/to/game/mobile/game.json \
  --profile /path/to/reviewed/studio.json \
  --strategy /path/to/game/mobile/strategy.json --artifact /path/to/artifact.json
```

No mutation occurs. A syntactically valid manifest is not artifact provenance.

Run meaningful local checks without opening a browser or emulator:

```sh
npm exec --workspace src/cli -- vitest run tests/mobile-studio.test.ts tests/mobile-beta.test.ts
node --test tests/game/mobile-monetization/*.test.mjs
node tests/game/mobile-monetization/pilot.mjs
```

The pilot replays one profile, two engine-labelled game inputs, durable duplicate
purchase handling and both beta channels with a simulated interrupted submit.
It imports the built library, not an alternate resolver. It does not instantiate
Phaser/Three renderers or native SDKs and cannot establish real second-game time
savings, player benefit or revenue gain. Actual browser/native tests must use
the existing managed game-test session and owned cleanup.
