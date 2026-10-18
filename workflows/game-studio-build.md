---
description: Run an artifact-gated, Codex-native game studio workflow from concept or existing project through release
---

# Game Studio Build Workflow

Use this workflow for a full game, a milestone, or a feature that spans design,
engineering, content, QA, and release responsibilities.

## Control Plane

Read `skills/_shared/protocols/game-studio-pipeline.md` first. It is the source
of truth for phases, role lenses, handoffs, topology, gate verdicts, and session
state. Use its **Phase Activation Contract** for the current decision, exact
skill paths, compact output, next consumer and host capability boundary; do not
create a second activation roster here.

For Phaser 4/Three.js packaged on Android/iOS, also apply
`skills/_shared/protocols/mobile-monetization.md` at the existing Concept,
Systems Design, Technical Setup and Release & Sustain gates. Player/market
assumptions may drive a prototype with validation plans. Reuse the studio
profile, keep game-specific IDs/strategy separate, and run `forge mobile doctor`
before native integration. Static/synthetic success does not establish native,
store or player outcomes; keep the existing state path and resource ownership.

Do not assume slash commands, named agents, or an external swarm runtime exist.
Apply the required role lenses locally unless the user explicitly requests
delegation or parallel work.

## Starting with a novice brief

For example: “Tôi không biết làm game. Hãy giúp tôi làm một game xếp hình 2D
cho Android để kinh doanh.” This is an affirmative request with inexperience.
The local selector still abstains on “không”; a file-capable native parent must
interpret intent and inspect the repository before explicit routing. “Không tạo
game. Chỉ giải thích cách làm game” authorizes explanation only. These are
controller examples, not keyword tests or measured novice outcomes. Follow the
canonical host boundary when a loader or role is unavailable; do not claim the
standalone Python orchestrator automatically re-enters after abstention.

The agent owns the brief/GDD, state, research, routing and evidence. First
explain the proposed player promise and smallest useful milestone in ordinary
language. Ask the user only for material audience/direction, time/budget,
platform or rights constraints that the workspace cannot answer. Preserve an
existing engine/shell/pin; Android does not imply Unity. For new web 2D use
Phaser 4, for web 3D Three.js, then check wrapper/native prerequisites separately.
Commercial intent brings product/market decisions into Concept; it does not
authorize SDK installation, paid campaigns, analytics export or store activity.
An undecided/unmonetized prototype stays in the narrative brief/GDD.

Develop a bounded hypothesis and applicable player/screen flow; use the ordered
creative handoff to explore divergent visual concepts and obtain a selected
concept packet and approved Style DNA
before passing Concept. The agent turns those decisions into systems and
build/test readiness, then a whole-loop slice and an observed second unit/level
cost before scale-up. A throwaway exploratory prototype answers its recorded
question; it does not pass Concept or waive production readiness. Report what
was actually built/observed, missing player/device evidence and keep/change/kill
plainly. Missing applicable required evidence blocks its gate.

Continue with the smallest story-owned set of lenses from the activation table,
revisit admitted deferred needs at their phase, and summarize each material
decision with its evidence, remaining risk/cost and next step. Existing-project
repairs enter the relevant phase using valid artifacts; a save hotfix needs
diagnosis and scoped verification, not a new concept cycle. The user chooses
material direction and accepted non-blocking concerns under the existing gates;
the number of technical artifacts is never a questionnaire for the novice.

## Ordered Creative Handoff and Dispatch

Design and Game Build work share this handoff order:

```text
UX/research -> Concept Artist -> Art Director -> UI/technical/engine handoff
```

Use the explicit skill files `skills/concept-artist/LITE.md` and
`skills/art-director/LITE.md`, followed by the applicable
`skills/ui-designer/LITE.md`, `skills/technical-artist/LITE.md`, or engine skill.
Resolve verified paths before initial creative work. Concept Artist and Art
Director produce their owned artifacts in order; do not require their downstream
validation before the artifacts can exist. Before downstream dispatch, execute
this repository-owned chain against those artifacts:

1. `python3 scripts/runtime/skill_routing.py --mode "$MODE" --config .forgewright/skills-config.json`
   returns ordered, verified skill paths.
2. `python3 scripts/art-direction/creative-handoff.py validate-handoff "$CONCEPT_PACKET" "$ART_DIRECTION_GATES" --visual-basis .forgewright/visual-evidence/visual-basis.json --cards-dir .forgewright/visual-evidence/cards`
   validates the concept/art artifacts and proves they bind the same GROUNDED evidence basis.
3. Freeze the skill-aware dispatch packet with the selected skill item/path,
   validated artifacts, ownership, checks, tier, and stop conditions.
4. Call `python3 scripts/runtime/codex-subagent-routing.py --config .production-grade.yaml --capabilities-json "$CODEX_SPAWN_CAPABILITIES_JSON" --tier "$TIER" --agent-type "$AGENT_TYPE" --overrides-json "$EXPLICIT_OVERRIDES_JSON"`.
5. The host then invokes its **host-owned native `spawn_agent`** with the frozen
   skill item/path and emitted `spawn_agent_args`. The repository does not own or
   provide the native tool; if the host does not expose it, keep the work local.

If `PIPELINE_CONTEXT` explicitly requests
`collaboration.mode: bounded-advisory`, and the Concept Packet has passed
validation, the parent may broker one read-only Concept Artist ↔ Art Director
feedback loop. Use typed events and immutable artifact refs through the parent;
do not open direct peer chat. Concept Artist owns concepts/the packet, Art
Director owns Style DNA/gates, and the parent owns the decision. Cap the initial
strict profile `concept-art-direction/v1` at exactly two participants and one
round. No collaboration loop is required for every task.

The host integration must inject a same-process parent-TCB
`TrustedParentHostAdapter` and out-of-band `TrustedHostCapability`; neither may
come from a peer or manifest. Participant callbacks receive JSON-compatible
assignments only and return untrusted event mappings; they never receive the
broker, controller, channel, callable, or capability. Missing capability,
malformed or late events, stale refs, deadline/limit breach, or disagreement
requires explicit parent-serial fallback and is nonzero unless a parent serial
executor completes that fallback.

## Steps

1. **Detect the entry point**
   - Inspect the project profile, engine files, design artifacts, architecture,
     tests, production records, and release evidence.
   - Classify as greenfield, existing-project adoption, isolated feature, or
     hotfix.
   - Enter at the earliest incomplete phase; do not recreate valid artifacts.

2. **Open the studio state**
   - Resolve `.production-grade.yaml` path overrides and any existing project
     convention first; use `production/session-state/game-studio.md` only as the
     default.
   - Read or create the single resolved studio state file.
   - Record review mode (`solo`, `lean`, or `full`), current phase, milestone,
     decisions, owners, blockers, and evidence links.

3. **Plan the milestone**
   - Consult the canonical Phase Activation Contract for the current decision.
     Load only applicable verified paths through the available authorized host
     mechanism. Retain exact deferred inventory; absent or denied controlled
     loaders and unsupported outside-inventory roles stay BLOCKED.
   - Produce only the handoff required by the active phase, using the Handoff
     Applicability table in the control-plane protocol.
   - Concept has no handoff prerequisite; Systems Design produces design-ready;
     Technical Setup produces implementation-ready; Production stories produce
     done handoffs.
   - Build a dependency graph with exact path ownership and checks.
   - Use `serial-local` for dependent local work.
   - Before any multi-agent dispatch, run the deterministic contract in
     `scripts/runtime/orchestration_policy.py`; honor its worker cap, reviewer
     reservation, risk routing, and stop conditions.
   - Read `skills/_shared/protocols/model-tier.md`; record each selected scope's
     `scout`, `builder`, or `expert` tier before resolving any concrete model.
   - Read `subagents.codex` from `.production-grade.yaml`. Resolve explicit task
     override → agent type → tier → default, then validate the exact model and
     reasoning effort against the active runtime's structured capabilities.
     Immediately before each native spawn, run the exact command:
     `python3 scripts/runtime/codex-subagent-routing.py --config .production-grade.yaml --capabilities-json "$CODEX_SPAWN_CAPABILITIES_JSON" --tier "$TIER" --agent-type "$AGENT_TYPE" --overrides-json "$EXPLICIT_OVERRIDES_JSON"`.
     Pass only its emitted `spawn_agent_args` object to `spawn_agent`; otherwise
     keep selection `provider-managed` and omit unsupported fields.
   - Freeze requirements, dependencies, owned paths, checks, deadlines, and stop
     conditions in the dispatch packet.
   - If the context requests bounded peer advice, freeze the exact activation:
     mode, `concept-art-direction/v1` profile, two participants, purpose,
     `frozen_inputs: true`, `fallback: parent-serial`, and non-empty strict
     artifact refs. The repo-owned profile supplies participant/round/event/byte/
     deadline limits. Do not add token, cost, or goal quotas or allow recursive
     spawn.
   - If the policy returns workers and delegation is authorized, ask the host-owned
     native `spawn_agent` adapter to run all independent scopes concurrently. Set
     explicit ownership, forbid recursive spawn, and do not dispatch dependent
     scopes.
     Use `scripts/parallel-dispatch-runner.py` only for its explicitly authorized
     read-only external adapter.
   - Wait for every selected result, verify its owned scope, then fan-in. Resolve
     disagreement before integration and run an isolated expert reviewer from
     requirements, diff, and raw evidence when the policy reserves one.

4. **Execute the active phase**
   - Apply the activation table's inputs/output/next-consumer contract and the
     existing phase-specific handoff requirements. Transfer relevant artifact
     paths/revisions, accepted decisions, checks, blockers and deferred needs
     through the resolved state; do not load every discipline at startup.
   - Preserve the ordered creative handoff and existing optional bounded-advice
     rules. Presentation observes committed gameplay/payment events; it never
     grants damage, rewards or entitlements.
   - At Release & Sustain, identify the exact artifact and checksum. Publish or
     deploy the approved artifact only within the authorized release scope;
     smoke telemetry and crash reporting, rehearse rollback/hotfix, and run a
     post-release measurement and triage checkpoint. Provider availability,
     internal beta, device install and production release are separate evidence.

5. **Verify**
   - Run `skills/_shared/protocols/game-test-protocol.md`.
   - Run `skills/_shared/protocols/quality-gate.md`.
   - Run `skills/_shared/protocols/task-validator.md`.
   - Attach exact commands, exit codes, build artifacts, and playtest evidence.

6. **Gate and persist**
   - Issue `PASS`, `CONCERNS`, or `FAIL` using the control-plane criteria.
   - Advance only on `PASS`, or on `CONCERNS` after the user accepts each risk.
   - Update studio state and propagate design/architecture changes to every
     affected artifact before starting dependent work.

## Completion

The workflow is complete only when the requested outcome has its phase-appropriate
completion record, all applicable evidence is attached, accepted concerns are
explicit, runtime leases are reconciled, and the next milestone or support owner
is named. Non-code phases close with a phase gate record; implemented stories
also require a done handoff. A Release & Sustain outcome additionally requires
publish/deployment evidence and the post-release measurement checkpoint.

## Web-game specialization

For new 2D browser games use `--game-engine phaser4`; for 3D use `--game-engine threejs` with the existing `skill_routing.py --mode game-build` command. A grounded existing v3 project uses `--game-engine phaser3`. Read the studio protocol’s early-prototype and complete web-game handoff section: it defines the scoped prototype branch, stage-specific game-experience checks, usable UI kit and separate fidelity/differentiation evidence without adding a parallel control plane.
