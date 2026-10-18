---
id: game-studio-pipeline
title: Game Studio Control Plane
summary: Artifact-driven control plane for cross-discipline game development from concept through verified release.
status: active
version: 1.0.0
owners: [core]
triggers: [game build, cross-discipline game work]
used_by: [game-designer, game-engineer, production-grade]
related: [game-test-protocol, model-tier, peer-collaboration, quality-gate, task-validator]
supersedes: []
superseded_by: null
---

# Game Studio Control Plane

> A Codex-native, artifact-driven operating model for taking a game from an idea
> to a verified release without pretending that a fixed roster of agents or an
> external swarm runtime is available.

Use this protocol whenever Game Build mode spans more than one discipline or
phase. A small, single-system edit may enter at the relevant phase, but it must
still preserve the phase's inputs, evidence, and handoff contract.

## Operating Principles

1. **One source of truth** — keep the current phase, active milestone, decisions,
   owners, blockers, and evidence in the resolved studio state path (default:
   `production/session-state/game-studio.md`).
2. **Artifacts before activity** — a phase advances because its required
   artifacts and evidence exist, not because an agent says the work is done.
3. **Vertical responsibility, horizontal review** — a producer/control-plane
   lens coordinates; discipline leads own decisions; specialists implement;
   peer disciplines review cross-domain effects.
4. **Dependency-driven orchestration** — topology follows task dependencies and
   file ownership. Agent count never determines topology by itself.
5. **Codex-native roles** — studio roles are role lenses applied by the current
   agent. Do not claim that named subagents exist. Use actual subagents only when
   the user explicitly requests delegation or parallel agent work. The host owns
   the native `spawn_agent` tool; this repository owns only the routing contract
   and dispatch packet.
6. **Bounded autonomy** — implementation within an approved design can proceed
   end to end. Major creative direction, architecture, scope, monetization, and
   release-risk decisions remain user decisions.
7. **Evidence closes work** — tests, builds, playtests, performance captures,
   screenshots, and acceptance-criteria mappings are the completion record.
8. **Bounded peer advice is opt-in** — a parent/control-plane owner may broker a
   read-only, typed feedback loop between named disciplines, but peers never
   form a free-chat mesh or become decision owners.

## State Path Resolution

Before reading or writing studio state:

1. Read `.production-grade.yaml` and use an existing project-specific
   production or session-state path override when one is defined.
2. Otherwise, preserve an established game-studio state convention discovered
   in the repository.
3. Only when neither exists, use the default
   `production/session-state/game-studio.md`.

Record the resolved path in the turn plan. Do not invent a new configuration key
or create a second state file when the project already has a source of truth.

## Phase Activation Contract

This is the sole phase/decision activation table. Entrypoints consume it with
the lifecycle and handoff requirements below; it adds no gate or state schema.
Paths are relative to the installed framework root, not an assumed consumer
checkout. Verify the file and host permission before loading an applicable lens;
a path in this table is not a capability grant or a demand to load every role.
For grounded web selectors, verified engine paths are
`skills/phaser4-engineer/LITE.md`, `skills/threejs-engineer/LITE.md`, and legacy
`skills/phaser3-engineer/LITE.md`. Native intent instead uses the applicable
installed `skills/unity-engineer/LITE.md`, `skills/unreal-engineer/LITE.md`,
`skills/godot-engineer/LITE.md` or `skills/roblox-engineer/LITE.md` through its
supported trusted host route; the web-only `--game-engine` flag does not select
these native roles.

| Phase | Current decision or trigger | Owner lens / available skill path | Required inputs | Compact output | Next consumer | Capability or evidence boundary |
|---|---|---|---|---|---|---|
| Concept | New game promise, audience, platform or material direction | Parent coordinates with `skills/game-designer/LITE.md`; commercial intent: `skills/product-manager/LITE.md` and `skills/growth-marketer/LITE.md`; player/context uncertainty: `skills/ux-researcher/LITE.md`; then `skills/concept-artist/LITE.md` → `skills/art-director/LITE.md` | Brief, existing project/engine evidence, constraints, applicable grounded UX/visual basis | Scoped promise/core loop, engine/pins, target budgets, selected Concept Packet and approved Style DNA; source-backed commercial decisions or labelled hypotheses in existing brief/GDD | Systems Design and downstream creative owners | UX/research → Concept Artist → Art Director → downstream order remains binding. No monetization decision is required merely to explore a prototype; undecided/unmonetized work stays narrative, never a fabricated `mobile-strategy/v1` enum/catalog. Research does not authorize SDKs, spend, analytics export or store changes. |
| Systems Design | Decide mechanics, learning, economy, screen flow or affected content | `skills/game-designer/LITE.md`; as applicable `skills/level-designer/LITE.md`, `skills/ui-designer/LITE.md`, `skills/interaction-designer/LITE.md`, `skills/ux-researcher/LITE.md`; commercial/statistical decisions use `skills/product-manager/LITE.md`, `skills/growth-marketer/LITE.md`, `skills/data-scientist/LITE.md` | Passed Concept, selected Concept Packet, approved Style DNA, relevant research and protected rules | Design-ready systems/states, wireframes and component-kit requirements, tunables with units/bounds, acceptance criteria and unresolved decision owners | Technical Setup and story owners | Activate only affected decisions; bind UI/art to approved creative inputs. Hypotheses are not player or revenue observations. Existing strict strategy models remain `ads`, `iap`, `hybrid`, `premium`. |
| Technical Setup | Make the chosen stack buildable/testable and establish ownership | `skills/game-engineer/LITE.md`, selected engine path from routing; architecture: `skills/solution-architect/LITE.md`; relevant art/audio/mobile: `skills/technical-artist/LITE.md`, `skills/game-audio-engineer/LITE.md`, `skills/mobile-engineer/LITE.md` | Design-ready, actual engine/shell/pins, target platform/budgets | Implementation-ready ADR/control manifest, build/test commands, save/content/lifecycle boundaries, native prerequisites where applicable | Pre-Production and implementers | Preserve existing engines and native shells. A web build/static doctor does not establish native adapter, account or device capability. Reuse mobile authority/config and existing resource admission. |
| Pre-Production | Test the riskiest hypothesis before committing production scale | Parent/`skills/project-manager/LITE.md` owns keep/change/kill; `skills/game-designer/LITE.md` and selected engine implement the slice; `skills/ux-researcher/LITE.md` owns actual player research method; `skills/qa-engineer/LITE.md` protects rules | Implementation-ready for code, selected hypothesis, whole-loop scope and approved creative inputs | Slice observations, real playtest evidence where available, second content-unit cost, keep/change/kill and ready stories | Production owner and user at the existing commitment decision | Missing participants/devices leave those claims UNVERIFIED and an applicable required gate item FAIL. Technical evidence can close its own scoped experiment; it cannot certify players. |
| Production | Implement one accepted story or propagate a design change | Smallest story-owned set from `skills/game-engineer/LITE.md`, selected engine, `skills/level-designer/LITE.md`, `skills/technical-artist/LITE.md`, `skills/game-audio-engineer/LITE.md`, `skills/ui-designer/LITE.md`; `skills/qa-engineer/LITE.md` verifies | Design-ready + implementation-ready per story, protected paths/rules and dependencies | Done handoff, exact checks, owned defects and propagated accepted changes | Dependent story owners, then Polish | Presentation observes authoritative committed gameplay/payment events; animation/audio completion never grants damage, rewards or entitlements. Preserve frozen mechanics and purchase/server authority. |
| Polish | Diagnose affected feel, accessibility, balance, performance or recovery | Applicable `skills/game-designer/LITE.md`, `skills/game-accessibility-engineer/LITE.md`, `skills/performance-engineer/LITE.md`, `skills/qa-engineer/LITE.md` and affected art/audio/engine owner | Complete story evidence, approved visual basis, project target budgets and measured problem | Existing game-feel action card/checklist, regression/performance/recovery evidence, keep/change/kill | Release owner | Diagnose before adding effects; preserve combined mute/motion alternatives. Rendered/player/device claims need their own observations. Admit browser/device work through existing leases and release only owned resources. |
| Release & Sustain | Package, approve, distribute and support the identified artifact | `skills/build-release-engineer/LITE.md`; packaged web: `skills/mobile-engineer/LITE.md` and `skills/mobile-tester/LITE.md`; applicable measurement/support: `skills/liveops-engineer/LITE.md` | Passed Polish, exact artifact identity, rights/identity/listing evidence and scoped authorization | Release/publish evidence, internal-beta journal where applicable, telemetry/support/triage and rollback record | User and operations/hotfix owner | Provider availability, installed build, internal beta, soft launch and production are distinct. Listing promises must match reachable gameplay. No implicit paid campaign, analytics export, store operation or production release. |

At phase entry and transition, read the resolved current studio state, identify
the current decision and applicable owner, and transfer only the relevant input
paths/revisions, accepted decisions, checks, blockers and next consumer. Keep
deferred needs in that existing state, revisit them when applicable, and record
`N/A` only with a genuine applicability rationale. Missing applicable evidence
follows the existing FAIL rule, not a new approval checkpoint.

### Controller interpretation and host boundary

The bounded lexical selector may abstain on both “không biết làm game” and
“không tạo game”. The parent interprets the actual authorized request and
workspace: inexperience can accompany affirmative game intent; negation,
conflicting goals and policy bypass language do not authorize execution. Ground
engine/platform before using a trusted explicit game route. Android alone does
not select Unity or replace an existing React Native/native shell. New web work
uses Phaser 4 for 2D or Three.js for 3D; preserve existing Phaser 3 and explicit
native-engine intent. Ask only about unknowns that materially change direction,
scope, risk or cost.

File-capable native controllers can apply verified installed lenses sequentially
through their existing authorized file/route capability. Preserve configured
disabled roles and context limits: the current startup route admits at most 12
overlays and 8,000 estimated tokens; this table does not enlarge that shortlist.
Retain the exact `deferred_skills` inventory from the route result. When the
host exposes its bounded deferred loader, load only an exact admitted member,
once; an unavailable or denied controlled loader must never be bypassed by
reading its files directly. A role outside that inventory needs an existing
trusted host route/load mechanism or a separately supported bounded phase run.
If none exists, report that applicable capability as BLOCKED rather than
pretending it was loaded or silently omitting it.

The standalone Python LITE orchestrator routes once at startup. It does not
automatically interpret an abstention, reroute or load arbitrary phase roles.
This activation contract targets file-capable native controllers; it introduces
no phase argument, routing API, loader or automatic Python re-entry. A proposed
controller trajectory is not observed semantic behavior or novice success.

## Entry Routing

Classify the request before creating work:

| Starting point | Route |
|---|---|
| No concept or a vague idea | Begin at Concept |
| Clear concept, no implementation | Ground engine/platform, then Concept |
| Existing project | Detect current artifacts and enter at the earliest incomplete phase |
| Isolated feature | Enter Production only after design-ready and implementation-ready handoffs exist |
| Bug or hotfix | Use DEBUG/SHIP rules, then attach evidence to the active Production or Release milestone |

Select a review mode and record it in the state file:

- `solo` — minimum required artifacts, one owner may cover several role lenses.
- `lean` — default; required artifacts plus cross-domain review at phase gates.
- `full` — independent discipline reviews and explicit user approval at every
  gate.

Do not create empty ceremony. Only genuinely non-applicable evidence may be
marked `N/A`, and the gate record must explain why the phase outcome is still
proved. Missing applicable required evidence is never a skip.

## Seven-Phase Lifecycle

| # | Phase | Required outcome | Minimum evidence | Gate owner |
|---|---|---|---|---|
| 1 | Concept | A scoped game promise, audience, platform, engine, pillars, core loop, and art direction | Concept/GDD, engine decision, target budgets, selected Concept Packet, approved Style DNA contract | Creative + technical + user |
| 2 | Systems Design | MVP systems are decomposed with dependencies, states, balance inputs, UX flows, and acceptance criteria | Systems index, per-system specs, cross-system review, accessibility targets | Game design |
| 3 | Technical Setup | The game can be built and tested on the chosen stack with explicit architectural boundaries | Architecture, ADRs, control manifest, test scaffold, build command, performance budgets | Technical |
| 4 | Pre-Production | The riskiest assumptions are playable before full production commitment | Throwaway prototype where needed, vertical slice, playtest report, asset/UX inventory, ready epics/stories | Producer + user |
| 5 | Production | Stories move through readiness, implementation, review, QA, and done without losing traceability | Story records, acceptance-criteria evidence, automated tests, smoke builds, design-change log | Producer + discipline leads |
| 6 | Polish | The complete experience meets feel, balance, accessibility, stability, content, and performance targets | Regression results, performance captures, asset audit, balance evidence, representative playtests | QA + creative + technical |
| 7 | Release & Sustain | A reproducible player build is approved, shipped, observable, and supportable | Release candidate plus release artifact identity and checksum, publish/deployment evidence, telemetry and crash-reporting smoke evidence, rollback/hotfix rehearsal, post-release measurement and triage checkpoint | Release + user |

There are **7 phase gates**. Gate checks use this verdict vocabulary:

```text
PASS | CONCERNS | FAIL
```

- `PASS` — required evidence exists and no material unresolved risk remains.
- `CONCERNS` — evidence is sufficient to proceed only if named risks are
  explicitly accepted.
- `FAIL` — required evidence or a blocking decision is missing; do not advance.

Apply evidence status consistently:

- Only genuinely non-applicable evidence may be marked `N/A`; state the
  applicability rule and replacement proof.
- Missing applicable required evidence is always `FAIL`.
- A `FAIL` cannot be accepted or waived. Fix the blocker and rerun the gate.
- Only non-blocking residual risks may receive `CONCERNS`, and each concern needs
  an owner and explicit user acceptance before advancement.

The user approves major direction and any accepted concerns. A passing gate
updates the state file; it does not erase prior evidence.

## Phase Gate Record

For reference-game clone/polish work, attach a frozen mechanics contract to the
existing design-ready handoff and ProductIntent/Delta: reference build/source,
fixed input/step IDs, observed state/score/timing/order, protected rules,
predeclared tolerances, approved cosmetic deltas, and genuine N/A fields. Keep
Visual Basis and creative ownership authoritative. Candidate hints must not
choose the replay inputs. Web-capture normalization must not erase protected
cooldowns, timing or gameplay order.

Where automated browser comparison applies, require the existing-gate evidence
command below, plus normal phase-specific human/device evidence:

```bash
node scripts/runtime/game-reference.mjs contract.json reference.json candidate.json CURRENT_BUILD_SHA256
```

This validator consumes raw captures, checks the frozen journey and current
build, and requires observed engine capability, applicable completed public-input
playtest and confirmed cleanup. `FAIL` or `UNVERIFIED` blocks this evidence item;
a declared PASS, stale build or missing playtest cannot replace it. The command
does not prevent arbitrary Markdown edits or certify subjective feel, all studio
gates, native engines or mobile performance. Its ordered snapshots do not prove
intra-step gameplay event order; contracts requiring that trace stay UNVERIFIED. The opt-in Signal Dash experiment
and its source-pinned expectations are documented in the fixture README.

Append this record to the resolved studio state path (default:
`production/session-state/game-studio.md`):

```markdown
## Gate: <current phase> -> <next phase>
- Date:
- Review mode: solo | lean | full
- Verdict: PASS | CONCERNS | FAIL
- Required artifacts: <paths and status>
- Evidence commands: <exact commands and exit codes>
- Playtest/build evidence: <paths or not applicable>
- Accepted concerns: <risk, owner, user decision>
- Blockers:
- Next milestone:
```

The state file is coordination state, not a substitute for GDDs, ADRs, story
files, test output, or release records.

## Studio Responsibility Lanes

Use the smallest set of role lenses that covers the work:

| Lane | Forgewright skills | Owns | Must not decide alone |
|---|---|---|---|
| Control plane | `production-grade`, `project-manager` | Phase, milestone, dependency graph, scope, risk, change propagation | Creative or technical domain decisions |
| Creative direction | `game-designer`, `concept-artist`, `art-director`, `level-designer`, `narrative-designer`, `game-audio-engineer` | Player promise, mechanics, concept exploration, content, presentation, feel | Architecture, release acceptance |
| Technical direction | `solution-architect`, `game-engineer`, engine-specific skills, `technical-artist` | Architecture, engine integration, runtime budgets, tools | Product scope or player-facing design intent |
| Quality | `qa-engineer`, `game-accessibility-engineer`, `performance-engineer`, `security-engineer` | Test strategy, evidence, regression, performance, accessibility, abuse cases | Waiving release risk |
| Release and sustain | `build-release-engineer`, `devops`, `sre`, `liveops-engineer` | Reproducible builds, packaging, rollout, observability, hotfix readiness | Shipping with any gate failure or unaccepted concern |

For a solo developer, one agent may apply multiple lenses sequentially. It must
label the lens change and preserve independent evidence; it must not manufacture
agreement between roles.

## Handoff Applicability

Handoffs are phase-conditional. Greenfield work does not need downstream inputs
before the phase that creates them.

| Phase | Required at entry | Completion record |
|---|---|---|
| Concept | None | Phase gate record |
| Systems Design | Passed Concept gate | Design-ready handoff + phase gate record |
| Technical Setup | Design-ready handoff | Implementation-ready handoff + phase gate record |
| Pre-Production | Implementation-ready handoff only for prototype/vertical-slice code | Phase gate record + slice evidence |
| Production | Design-ready and implementation-ready per story | Done handoff per story + phase gate record |
| Polish | Passed Production gate and complete story evidence | Phase gate record + regression/playtest evidence |
| Release & Sustain | Passed Polish gate and identified release candidate | Phase gate record + publish/operate evidence |

Non-code phases close with their phase gate record. A done handoff applies to an
implemented story or code-bearing deliverable, not to Concept or Systems Design
work.

## Handoff Contracts

### Creative routing and executable dispatch contract

Design and Game Build work use the same ordered creative handoff:

```text
UX/research -> Concept Artist -> Art Director -> UI/technical/engine handoff
```

The named skill files are `skills/concept-artist/LITE.md` and
`skills/art-director/LITE.md`; downstream handoff paths include
`skills/ui-designer/LITE.md`, `skills/technical-artist/LITE.md`, and the
selected engine skill. Resolve paths before initial creative work, then let
Concept Artist and Art Director produce their owned artifacts in order. Before
dispatching the downstream scope, run the repository-owned executables in this
order against those artifacts; validation is not a prerequisite for creating
the artifacts themselves:

1. Resolve ordered, verified skill paths with
   `python3 scripts/runtime/skill_routing.py --mode "$MODE" --config .forgewright/skills-config.json`.
2. Validate the concept and art artifacts against the same GROUNDED evidence basis with
   `python3 scripts/art-direction/creative-handoff.py validate-handoff "$CONCEPT_PACKET" "$ART_DIRECTION_GATES" --visual-basis .forgewright/visual-evidence/visual-basis.json --cards-dir .forgewright/visual-evidence/cards`.
3. Freeze a skill-aware dispatch packet containing each item's skill name,
   `skill_path`, validated artifact paths, owned paths, checks, tier, and stop
   conditions. Do not dispatch from an unfrozen or path-only packet.
4. Resolve verified model fields by calling
   `python3 scripts/runtime/codex-subagent-routing.py --config .production-grade.yaml --capabilities-json "$CODEX_SPAWN_CAPABILITIES_JSON" --tier "$TIER" --agent-type "$AGENT_TYPE" --overrides-json "$EXPLICIT_OVERRIDES_JSON"`.
5. Give the frozen skill item/path and the resolver's emitted
   `spawn_agent_args` to the **host-owned native `spawn_agent`** tool. The
   repository does not provide, invoke, or own that native tool; when the host
   does not expose it, keep the work local and report the boundary.

When `PIPELINE_CONTEXT` explicitly requests
`collaboration.mode: bounded-advisory`, the parent may add one creative
feedback loop after `creative-handoff.py validate-handoff` passes:

```text
Concept Packet -> Art Director typed feedback -> parent decision
```

This is not a replacement for the ordered handoff. Concept Artist owns
concepts and the packet; Art Director owns Style DNA and gates; the parent is
the broker, observer, policy owner, and final arbiter. Both skills receive only
JSON-compatible assignments with immutable artifact refs and return untrusted
typed event mappings. They never receive a broker, controller, channel, callable,
or capability. The exact profile is `concept-art-direction/v1`: two participants,
one round, repo-owned hard limits, and `parent-serial` fallback. If the context
does not request collaboration, do not add this loop.

Execution requires a same-process parent-TCB `TrustedParentHostAdapter` plus an
out-of-band `TrustedHostCapability`; neither may be peer-provided or loaded from
the dispatch manifest. The runner privately publishes validated mappings through
the `InProcessBroker` and parent-owned JSONL log. Missing capability, malformed or
late events, stale refs, limit breach, or disagreement requires explicit
parent-serial fallback and returns nonzero when no parent serial executor exists.

### Design-ready handoff

Required before architecture or story creation:

- player problem and game pillar served;
- mechanic state/flow and failure cases;
- tunable values stored as data, not literals embedded in implementation;
- UX, art, audio, accessibility, analytics, and platform implications;
- measurable acceptance criteria and out-of-scope boundary;
- unresolved questions and decision owner.

For affected control/feedback/camera or differentiation work, include the
designer's [game-feel action card](../../game-designer/references/game-feel.md)
in the existing GDD: intent/state, applicable control/space, commit/contact,
recovery, cue hierarchy and combined mute/motion alternatives. Name the frozen
reference versus approved delta, competing cause, baseline/variant and rejection
criterion. No new phase, schema or mandatory effect is introduced.

For Phaser 4/Three.js packaged on Android/iOS, include the
[mobile domain handoff](mobile-monetization.md): player/market evidence or
labelled hypotheses, product value/free path/no-ads scope, level learning and
economy/offer recovery, per-game catalog/placement mappings, and balanced
measurement. Hypotheses can drive a bounded prototype; synthetic tests cannot
be promoted to player or revenue evidence. Growth marketing contributes early
research while campaign execution retains its own scope.

### Implementation-ready handoff

Required before code changes:

- approved design-ready handoff;
- governing ADR/control-manifest rules;
- dependency stories and target paths;
- path ownership and protected paths;
- automated checks plus manual playtest evidence where feel is involved;
- performance/build budgets and rollback strategy for risky changes.

For that mobile route, also bind studio profile revision, effective config
digest, actual wrapper/native capability evidence and internal target scope.
Use `forge mobile doctor` for static blockers. Existing native integration,
account policy and runtime evidence remain separate requirements. In Release &
Sustain report provider availability and actual device install/launch separately;
reuse the existing Xcode Cloud workflow and managed browser/emulator ownership.

### Done handoff

Required before a story closes:

- every acceptance criterion mapped to code and evidence;
- relevant tests/builds pass with exact commands;
- manual playtest evidence covers non-automatable feel or visuals;
- GDD/ADR deviations are recorded and propagated;
- known defects and follow-up work are owned.

For applicable feel changes, attach the selected conditional-checklist verdicts
and keep/change/kill decision. Distinguish technical correctness, rendered/device
observations and real-player feel evidence. Missing required playtest evidence
cannot become PASS from a build, contract replay or an attractive capture;
apply the existing phase gate's missing-evidence rule.

## Topology Decision

Choose topology from the dependency graph:

| Topology | Use when | Control |
|---|---|---|
| `serial-local` | One lane, one file scope, or each output is needed by the next step | Work locally in dependency order |
| `pipeline` | Design → architecture → implementation → QA has strict handoffs | Each stage consumes a versioned handoff; blocked stages stop downstream work |
| `fan-out/fan-in` | Independent research or reviews share immutable inputs | Freeze the review packet, collect every result, then synthesize disagreements |
| `hierarchical` | A milestone spans multiple independent, path-disjoint lanes | One control-plane owner, bounded workers, explicit ownership, scheduled fan-in |
| `bounded-advisory` | A named peer needs one read-only review of a validated artifact | Parent-mediated typed events, finite limits, and serial fallback |

Before any multi-agent dispatch, run the deterministic decision contract in
`scripts/runtime/orchestration_policy.py`. Follow its worker cap, reviewer
reservation, risk routing, stop conditions, and advisory budget. Never add
workers solely because a task touches three files.

Rules for every dispatched worker:

- one bounded deliverable and one path ownership scope;
- immutable requirements and dependency inputs;
- no recursive spawn;
- no edits outside owned paths without a control-plane handoff;
- exact verification command and a completion/blocker message;
- partial results remain usable when another worker blocks.

For the optional bounded-advisory topology, apply
`skills/_shared/protocols/peer-collaboration.md`: no peer writes, peer tool
calls, merge authority, recursive spawn, remote webhook, or distributed broker.
The v1 path is strict: same-process trusted parent adapter, private in-process
broker/channel publication, and parent-owned bounded JSONL. Callback waits obey
the shared deadline, but timed-out daemon threads cannot be portably killed;
the adapter must be cancellation-aware and late results are discarded.

For security, schema, public API, concurrency, release-risk, or unresolved
creative/technical disagreement, use an expert or independent review. Do not
claim that a textual `raft`, `consensus`, or `anti_drift` setting provides
runtime guarantees. In Forgewright, anti-drift comes from bounded scope, file
ownership, shared state, checkpoints, evidence, and explicit fan-in.

## Model-Aware Subagent Dispatch

When the deterministic policy selects one or more workers and the user has
authorized delegation or parallel work, apply
`skills/_shared/protocols/model-tier.md` before spawning. Tier selection and
concrete model selection are separate:

| Tier | Game-studio work | Quality boundary |
|---|---|---|
| `scout` | Mechanical inventory, bounded repository search, asset/status extraction | Read-only evidence; no design or architecture decisions |
| `builder` | Normal implementation, content production, tests, and bounded synthesis | Own one disjoint path scope and its exact checks |
| `expert` | Security, schema, public API, concurrency, release risk, unresolved creative/technical disagreement, or independent review | Do not downgrade the tier to save tokens |

Use the tier to optimize cost before selecting a model: scouts handle narrow
mechanical work, builders handle normal production, and experts are reserved for
high-risk judgment and fresh review. Keep the parent agent as control-plane
owner; it coordinates, verifies, and synthesizes instead of duplicating worker
implementation.

Resolve a concrete model only from a same-invocation structured capability probe:

1. For the native Codex collaboration runtime, read `subagents.codex` from
   `.production-grade.yaml`, resolve explicit task override → agent type → tier
   → default, then inspect the active `spawn_agent` schema and validate its
   advertised model overrides and reasoning controls.
   Immediately before each native spawn, run:
   `python3 scripts/runtime/codex-subagent-routing.py --config .production-grade.yaml --capabilities-json "$CODEX_SPAWN_CAPABILITIES_JSON" --tier "$TIER" --agent-type "$AGENT_TYPE" --overrides-json "$EXPLICIT_OVERRIDES_JSON"`.
   Pass only its emitted `spawn_agent_args` JSON object to the host-owned native
   `spawn_agent`; the repository does not own that tool.
2. For the external read-only adapter, use
   `scripts/parallel-dispatch-runner.py`, which probes the active provider and
   enforces the capability rules in `model-tier.md`.
3. Pass a concrete model or reasoning override only when that runtime
   capability is verified and matches the selected tier.
4. If a safe match is absent, use `provider-managed` selection and omit the
   override. Do not hard-code model IDs, infer them from prose, or silently
   lower an `expert` assignment.

Before spawning, freeze a dispatch packet containing the task requirements,
dependency inputs, owned paths, tier, deadline, stop conditions, and exact
checks. Spawn selected independent workers concurrently;
never start a dependent scope early. Every worker returns a bounded result,
evidence, changed paths when writes were authorized, and blockers.

At fan-in:

- wait for every selected worker or an explicit stop condition;
- reject out-of-scope edits and rerun each scope's exact checks;
- compare overlapping conclusions and escalate unresolved disagreement to
  `expert`;
- do not reserve one advisory token-budget slot or any token/cost/goal quota;
  reserve one advisory reviewer slot when independent review is requested;
- give the independent reviewer only immutable requirements, diff, and raw
  evidence, never worker reasoning or mutable synthesis context;
- run parent-level integration, playtest, and phase-gate checks after merging
  results.

Parallel completion is not a quality verdict. A faster worker result may enter
the milestone only after its evidence passes and fan-in finds no unresolved
cross-lane conflict.

## Production Story Loop

Each story follows:

```text
READY -> IN PROGRESS -> REVIEW -> QA -> PLAYTEST (when needed) -> DONE
```

1. **READY** — validate design-ready and implementation-ready handoffs.
2. **IN PROGRESS** — implement only the accepted scope. Add/update behavioral tests only when propagating an explicit accepted requirement change; otherwise keep existing test oracles read-only.
3. **REVIEW** — check architecture, design fidelity, cross-domain effects, and
   unintended changes.
4. **QA** — execute `game-test-protocol.md` at the appropriate engine layer.
5. **PLAYTEST** — required for feel, difficulty, UX, level flow, audio, and
   accessibility outcomes that automated tests cannot prove.
6. **DONE** — attach the done handoff; never mark done from implementation alone.

Design changes discovered mid-story go back to the owning design artifact. The
control-plane lane identifies downstream GDDs, ADRs, stories, assets, tests, and
release notes that need propagation before work resumes.

## Verification Stack

Use the existing Forgewright controls rather than duplicating them:

1. `skills/_shared/protocols/game-test-protocol.md` — mechanics, balance, state,
   performance, integration, platform, visual, and build evidence.
2. `skills/_shared/protocols/quality-gate.md` — repository-wide test, lint,
   coverage, security, build, and visual requirements.
3. `skills/_shared/protocols/task-validator.md` — delivery versus task contract.
4. `skills/_shared/protocols/game-studio-pipeline.md` — phase readiness,
   cross-domain handoffs, playtest evidence, and accepted risk.

Build success does not prove playability, fun, legibility, accessibility, or
performance. A visual review does not prove mechanics or state correctness.
Both forms of evidence are required when the acceptance criteria span both.

## Session Close

Before ending game-studio work:

1. Update the resolved studio state path (default:
   `production/session-state/game-studio.md`).
2. Record changed artifacts, active phase/milestone, next dependency, and
   blockers.
3. Persist design or architecture decisions in their owning documents.
4. Release runtime leases per the Runtime Lifecycle Guard.
5. Report exact verification evidence and any accepted concerns.

## Research Basis

This control plane synthesizes the lifecycle and studio hierarchy patterns from
Donchitos/Claude-Code-Game-Studios, dependency-aware swarm patterns from
benedek-dev/RGS-Framework, and the explicit Codex adaptation rules from
eiichimo/Codex-Game-Studios. It intentionally reuses Forgewright's existing
orchestration policy, verification contracts, memory, guardrails, and engine
skills instead of importing another runtime or duplicating an agent roster.

## Early prototype and complete web-game handoff

For new web work, ground 2D→Phaser 4 / 3D→Three.js; preserve existing package pins. Before production art/system commitment, an isolated throwaway prototype may answer one recorded question from the brief. Record scope, target/input/camera, minimum technical readiness, temporary path, actual observations, keep/change/kill and limitations in the existing studio state. This is an experiment, not an eighth phase or an approved production deliverable. Do not promote its placeholders/code without the applicable design/implementation-ready and creative gates.

Prototype and low-fi player/screen flow iterate together. Then produce applicable character/environment/UI concepts, approve Style DNA, and hand off a game-specific UI kit plus sprite/GLB contracts. Use `game-experience/v1` to map required screen states→wireframes→concepts→component/token/asset IDs→runtime entries. The required set comes from the approved design-ready handoff; edits go through existing change authority. Missing items cannot be waived by deleting the required set or inventing N/A.

The existing design-ready gate consumes `game-experience.py validate <manifest> --project-root <project> --stage design`; implementation-ready consumes `--stage implementation`. Resolve the script under the installed framework root, not an assumed consumer scripts directory. Preserve legacy packet contracts; adopt existing projects incrementally. Stage PASS certifies declared completeness and local hashes only. Current-build public-input playtest, rendered evidence, target performance and cleanup remain separate studio evidence.

Build a whole-loop vertical slice before production scale-up, then observe a second unit/level to measure repeatable production cost. For clone/polish, retain protected reference mechanics and compare them with the existing comparator. Evaluate approved differentiation separately through ProductDelta, a player-benefit hypothesis and new playtest criteria. Never loosen the old oracle to make an intentional mechanic change appear equivalent; never equate a cosmetic delta or passing replay with increased fun.
