---
id: mobile-monetization
title: Packaged Web Game Monetization and Internal Beta Contract
status: active
owner: Game studio, mobile and release maintainers
scope: Phaser 4 and Three.js games packaged for Android and iOS
last_reviewed: 2026-10-17
canonical: true
---

# Packaged web games: player value, native integration and beta delivery

Use this domain contract when a Phaser 4/Three.js project needs mobile billing,
AdMob mediation or internal store distribution. Keep the existing seven-phase
[studio lifecycle](game-studio-pipeline.md), resolved studio state, engine choice,
ProductIntent/Delta and [managed test resources](game-test-protocol.md). This is
an additive handoff, not another lifecycle, secret store or memory database.

## Design-ready inputs

PM/game designer own the player promise and monetization decision; level design
owns learning/challenge/recovery; growth marketer contributes market, competition
and positioning research during Concept/Systems Design. Marketing execution
retains its separately authorized GROW scope. LiveOps implements measurement and
bounded configuration; native/security/release specialists own their boundaries.

One per-game brief contains:

- **Player:** motives and session context, comprehension/learning, choice and
  fairness/trust risks, with interview/playtest questions and evidence links.
- **Market:** target country/platform/cohort, direct competitors and substitutes,
  creative/store promise versus actual gameplay. Record date/version/method.
- **Value/economy:** model and actual player benefit, free path, product/catalog
  mappings, no-ads promise, resource sources/sinks and affordability hypotheses.
- **Level/offer:** introduce/practice/demonstrate, failure reason, free retry and
  optional assistance, reward/decline/unavailable/pending/return states.
- **Measurement:** baseline status, primary metric, experience and revenue
  guardrails, validation/decision rule and later experiment requirements.

Label every evidence item `primary_source`, `observed`, `estimate`, `hypothesis`
or `synthetic`; sourced claims include source/time, all items include validation.
Assumptions are permitted for prototypes and synthetic tests. They remain
assumptions after a green test. Internal beta may test these hypotheses without
inventing a D7/revenue improvement prerequisite. Record unmeasured impact.

Autonomy, competence and relatedness suggest questions; they do not diagnose a
player or prove causal monetization lift. Bartle categories, fixed session/spend
profiles, source/sink multipliers, exponential costs and referral-spend formulas
are optional hypotheses requiring applicability and evidence. Avoid automatic
FOMO, manufactured failure, grind or personalized difficulty that pressures a
purchase. Reuse the [design rules](design-mindset-and-rules.md).

## Shared configuration and current executable surface

The canonical executable schemas/resolver are
`src/cli/src/mobile/contracts.ts`. A studio profile contains versioned account
identities, allowed game/app bindings, internal destinations, AdMob ownership,
network candidates and **secret reference names**. Game deltas contain engine,
wrapper evidence, app/catalog/product IDs, AdMob app/units/network mappings,
tester group/workflow and per-game strategy. Resolution binds profile revision,
game/app scope and a deterministic config digest. Game deltas cannot widen
release authority. Missing IDs/capabilities are explicit blockers.

Reuse one reviewed nonsecret profile file across projects. Do not store raw
keys, tokens, receipts or keystores in profile/config/memory/chat. Runtime/vault
bindings stay under their existing owner; names/presence are not proof of API
permission. Source examples deliberately use hypothetical accounts and null
native/store IDs. `doctor` validates static/simulation readiness; it never
certifies live access.

```sh
npm run build:cli
node src/cli/dist/index.js mobile init /path/to/game --engine phaser4
node src/cli/dist/index.js mobile doctor /path/to/game/mobile/game.json \
  --profile /path/to/shared/studio.json \
  --strategy /path/to/game/mobile/strategy.json
```

The initializer preserves an existing `mobile/` directory. Customize generated
examples before using real projects; they are not an approved game strategy.
`mobile plan` accepts an exact artifact identity manifest and emits a dry-run
intent only. The side-effect-free `@forgewright/cli/mobile` entry exports the
resolver, beta coordinator and journal for trusted project-owned adapters.

## Native/payment authority

The [portable template](../../../templates/game/mobile-monetization/README.md)
contains a typed client bridge boundary, server delivery contract and optional
Node SQLite durable grant outbox. It contains **no installed native SDK plugin**.
Audit the actual wrapper/native projects and current SDK compatibility before
choosing a plugin/version; do not migrate an existing shell without evidence.

Client purchase success/local storage is not entitlement truth. Trusted provider
verification binds studio, app, environment, actual product and authenticated
player. Native listeners and direct purchase results converge on idempotent
delivery. Pending/cancelled/unverified purchases do not grant. Dedupe excludes
user from the unique purchase identity so another login cannot replay one token.
Persist grant before retryable acknowledge/consume/finish; preserve a recoverable
pending finalization. Server tokens/keys stay trusted-side. Restore/revocation,
guest merge and consumable inventory require an explicit project policy.

The SQLite reference records a durable outbox grant, not a playable wallet or
consumable restore. A project must supply real provider verification, atomic
inventory consumption, refund/revocation reconciliation and proof custody. It
cannot certify production payment readiness on its own. Payment is HARD/DEEP;
use existing independent exact-tree verification/review requirements.

Ads require per-player consent/age/entitlement eligibility. UMP and ATT are
distinct; consent can change. Pause/resume/input/audio ownership belongs to the
game host. Reward comes from a verified native reward path, never close/resume;
high-value rewards need the project's authoritative durable delivery strategy.
No-fill/decline/error must return to a valid free path. Test each mediated network
with its supported test mode; a Google demo unit does not prove mediation.

## Internal beta and recovery

The beta coordinator receives an exact app/account/source/config/artifact/version
intent and trusted project adapter. It serializes app operations, reserves a
store version for one intent and journals unknown outcomes before submit. Resume
observes the provider before any further effect; ambiguous upload never blindly
creates another build. A retained crash lock requires owner investigation, not
lease deletion to manufacture capacity. Use one shared journal for all projects
that can publish the same app; this is not a distributed store lock.

The current CLI only plans; it does not upload/build. Live coordinator adapters
must provide runtime-bound native/purchase/privacy/license-tester/artifact/store
readiness evidence and existing scoped authority. Reuse standing authorization
for the allowed account/apps/internal targets. New permissions, unknown identity
or out-of-scope effects stop at the exact missing prerequisite.

Google track identity is resolved from the actual account/tool mapping; the
fetched guide's `qa` differs from common tooling's `internal`. Reject production,
default and ambiguous targets. Test-track enrollment is separate from license
testers; ordinary testers can incur real charges. Bootstrap/legal/signing are
per-app observations, not automatically inherited approvals.

Reuse the existing Xcode Cloud workflow, source/commit, toolchain and custom
scripts. Correlate run/build/group; upload is not processing or availability.
Probe its actual TestFlight post-action/group behavior; supported API or a
specific owner action may be needed. Do not silently replace it with EAS.

Report `available_to_testers` separately from
`device_install_launch_verified`, for each platform and observed time. Pilots
must install/launch actual builds. Later authorized beta runs need no automatic
human checkpoint unless the run's acceptance requires it. Simulation cannot set
either live flag; `simulated_available_to_testers` is a separate result.

## Evidence of improvement

Use deterministic tests for configuration, scope, purchase/reward correctness
and recovery; playtests for comprehension/feel; powered, preregistered experiments
for approved causal questions. Track attempt/abandonment distributions and ad
opportunity-to-return as well as reconciled net ads+IAP, refunds and trust.
Normalize amount/unit/currency/precision explicitly: Apple JWS milliunits differ
from StoreKit Decimal currency units. Clicks, installs and retained players are
different outcomes; store metric dictionaries change. Preserve cohort/window,
consent coverage, maturity and attribution limitations. Underpowered results
remain inconclusive; increased spend/session length alone does not prove value.

Measure first-game setup effort/manual inputs/defects; compare a genuinely
different second game with its complexity visible. The local two-engine replay
proves only contract reuse under synthetic inputs. It cannot prove native/game
quality, fewer real support conversations or revenue uplift.

## Research basis (retrieved 2026-10-17; recheck material changes)

- [Google billing security](https://developer.android.com/google/play/billing/security),
  [testing](https://developer.android.com/google/play/billing/test) and
  [deprecation](https://developer.android.com/google/play/billing/deprecation-faq).
- [Capacitor plugin boundary](https://capacitorjs.com/docs/plugins): candidate
  bridge architecture, not a selected wrapper/version.
- [Meta Android mediation](https://developers.google.com/admob/android/mediation/meta)
  and [Unity mediation](https://developers.google.com/admob/android/mediation/unity):
  bidding/adapter constraints; Unity waterfall ended 2026-01-31.
- [AdMob mediation group API](https://developers.google.com/admob/api/reference/rest/v1beta/accounts.mediationGroups/create):
  limited-access provisioning; produce a console action manifest when unavailable.
- [Xcode Cloud TestFlight](https://developer.apple.com/documentation/xcode/distributing-your-xcode-cloud-builds-through-testflight)
  and [internal groups](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/):
  inspect actual workflow/group behavior rather than assuming auto-distribution.
- [Motivational Pull of Video Games](https://doi.org/10.1007/s11031-006-9051-8):
  original research abstract supports motivation hypotheses, not game revenue lift.
