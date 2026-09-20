---
title: Optional Pi Worker Runtime
status: accepted-for-pilot
owner: Runtime maintainers
scope: Optional execution adapter; no production activation
last_reviewed: 2026-09-20
canonical: true
---

# ADR: Optional Pi Worker Runtime

## Decision and authority

Add Pi as an optional worker behind the existing `HarnessAdapter v1`, not as
another orchestrator. This is an additive Layer 5 decision under the existing
[architecture](https://github.com/buiphucminhtam/forgewright/blob/0d835e28740f112c5c3737345d8d0404becd0d1f/docs/architecture.md) and
[canonical-runtime ADR](https://github.com/buiphucminhtam/forgewright/blob/0d835e28740f112c5c3737345d8d0404becd0d1f/docs/adr/0001-canonical-production-runtime.md). The
[provider-native policy](../active-roadmap.md#provider-native-routing-policy),
canonical tool/model gateways, requirement-locked tests, schema-v2 verification,
Stop gates, process ownership, and context-only continuity remain authoritative.

The owner requested the architecture, README, detailed plan, and incremental
implementation. The initial implementation is deliberately an isolated,
default-off **analysis-only pilot**, not a registered production worker.
Hermes retains operator identity/scheduling; Forgewright retains goals, routing,
approvals, memory, and acceptance. No active local goal or running service is
replaced by this decision. The 2026-09-20 owner amendment below replaces cloud-Jev routing on the default path with bounded local routing.

## 2026-09-20 amendment: usable keyless, low-resource consumer worker

The owner approved a free System-1-style path without requiring the Jev model,
a new API subscription, or a resident local classifier. `skill_routing.py` now
uses explicit selection, optional exact cache, bounded EN/VI rules, then abstain.
The older cloud-Jev fallback is no longer called. One historical integration
test changes its expected route under this explicit requirement amendment;
existing adapter-unit expectations and the original 135 Pi checks are retained.

`worker-runtime.mjs` is the opt-in public entrypoint used by `forge delegate`.
It runs the pinned Pi Agent and `pi-ai` provider stream directly, not a nested
Codex coding-agent subprocess. The older constructor-only pilot and host bridge
remain separate compatibility surfaces. A user-invoked contract authorizes only
existing regular read/write files and named immutable verifier argv. The model
cannot edit its contract, acceptance, tests, configuration, credentials or
submodule, and cannot register new tools or approval decisions.

From a consumer root with Forgewright installed at `forgewright/`:

```bash
node forgewright/src/cli/dist/index.js delegate on --worker pi --provider current --auth-source codex
node forgewright/src/cli/dist/index.js delegate status --worker pi
node forgewright/src/cli/dist/index.js delegate run --worker pi --contract task.json
node forgewright/src/cli/dist/index.js delegate resources
node forgewright/src/cli/dist/index.js delegate off --worker pi
```

The parent `.production-grade.yaml` owns `delegationMode.worker` (`cli`,
`provider`, `model`, `authSource`, `endpoint`). Editing this section preserves
unrelated configuration. Prototype `.forgewright/pi-worker.json` is read-only
compatibility, not a new second authority. Package code/skills resolve from the
submodule; config, files, goal and run receipts resolve from the parent.

For an already-running local model, explicitly select `--provider local
--endpoint http://127.0.0.1:PORT/v1 --model EXACT_ID`. Only literal loopback
addresses are admitted. For a subscription, select `--provider current
--auth-source codex` or `--provider openai-codex --auth-source pi --model EXACT_ID`.
Credential access is read-only and explicit, with no browser-cookie extraction,
project copy or automatic refresh of another application's tokens. Expiry,
401/403 and quota exhaustion stop truthfully. No paid fallback is selected.
Subscription USD stays null and quota still applies. The pinned Codex protocol
does not provide a hard output-token cap; bounded turns, deadline, input/output
bytes and one HTTP attempt per model turn are enforced instead.

Example `task.json` (files must already exist; the caller approves the contract):

```json
{
  "schema": "forgewright-pi-task/v1",
  "taskId": "fix-sum",
  "objective": "Fix sum and run the immutable check verifier",
  "acceptance": ["sum(2,3) equals 5", "check passes after the final patch"],
  "readPaths": ["source.mjs", "verify.mjs"],
  "writePaths": ["source.mjs"],
  "verifiers": [{"id": "check", "argv": ["node", "verify.mjs"]}]
}
```

Host revisions advance only after a before-hash-checked own patch. Changed
scoped source, policy, contract or config fails as a foreign-edit conflict.
Pre-existing dirty tracked write targets are rejected rather than overwritten.
`delegate cancel RUN_ID` writes a durable cancellation marker and fences new
file effects; it does not claim remote provider billing has stopped. Receipts
are bounded and distinguish `ready`, actual provider observations, final
verifier results, missing usage and local quiescence.

`host_admission_broker.py` and `host-governor.mjs` share a per-user SQLite
transaction authority across processes: maximum two workers, one per project,
and one heavy job with a matching parent lease. A low-memory/pressure profile
reduces admission, queue service is project-fair, queue/history are bounded,
and PID/start identity plus opaque owner tokens protect lease operations.
Unknown cleanup or lost active ownership quarantines its reserved capacity;
TTL alone never authorizes replay. The broker is demand-started and exits after
15 idle seconds. It owns no product jobs, cloud connections or model weights.

The resource limit covers cooperating Pi clients on the same user/machine,
not arbitrary external IDEs. Never terminate unowned work to gain memory.
Short five-process tests are not the required long mixed-project soak or a
4 GiB hardware certification. Local routing performance numbers from the
synthetic author-labeled corpus do not establish general production accuracy.

Verifier commands execute inside the macOS OS sandbox with scoped reads,
scratch-only writes, no network, minimized environment and owned cleanup.
Other verifier platforms currently fail closed; do not call this cross-platform
sandbox coverage. File CAS is application-level protection against observed
conflicts, not isolation from a malicious same-user process. Native source/task
acceptance is separate from comparative savings, broad canary rollout and the
full earlier P0-P6 outcome program.

## Target architecture and current boundary

```mermaid
flowchart TD
    A[User or Hermes operator] --> B[Forgewright goals, scope and policy]
    B --> C[Existing HarnessAdapter v1]
    C --> D[Existing native workers]
    C --> E[Optional Pi worker]
    E --> F[Scoped context and host-selected provider stream]
    E -. P2: not connected in pilot .-> G[Canonical tool gateway and owned lifecycle]
    F --> H[Analysis or artifacts plus measured metadata]
    G --> H
    H --> I[Forgewright verifier and independent review]
    I --> J[Accept, revise or stop]
```

| Responsibility | Owner and constraint |
| --- | --- |
| Intent, acceptance and task priority | Forgewright; never delegated to Pi session state |
| Model, provider credentials and spend authorization | Trusted host using the existing provider-native contract; no automatic provider switch |
| Agent loop | Pi within one explicitly scoped worker |
| Tool admission, workspace and approvals | Existing canonical gateway; pilot exposes **zero tools** |
| Memory, checkpoint validity and resume authority | Existing Forgewright continuity; Pi history is not project truth |
| Usage/cost evidence | Existing receipt contract; missing usage stays unavailable, not zero |
| Product completion | Forgewright verification; successful generation is not acceptance |

### P1 implementation surface

`integrations/pi/adapter.mjs` exports `createPiWorkerAdapter(config)` and a lazy
`loadPinnedPiAgent()`. This is an optional package outside the root workspaces;
normal root installation and canonical runtime registration are unchanged.

The trusted host must supply `enabled: true`, its system policy, selected model,
and `streamFn`. These are not accepted inside task data. A task contains only
`taskId`, `objective`, `acceptance`, and optional supplied `context`. Acceptance
must contain 1-64 explicit non-empty strings; sparse or missing entries are
rejected before SDK loading, not serialized into null criteria. Fresh messages
and an empty tool set are constructed for every adapter instance.
There is no filesystem reader: analysis uses only the supplied context.

The adapter advertises `native-host-loop` with `start` and `interrupt` only.
`start()` waits for its bounded attempt before returning a session ID; live
scheduler compatibility with this waiting behavior is a P2 acceptance gate.
`resume`, `fork`, `steer`, `checkpoint`, and pre-compaction are unsupported.
`getResult()` returns analysis and execution metadata; `getTelemetry()` excludes
the prompt, system policy, supplied context, and generated text. Task IDs must
be non-secret correlation IDs supplied by the host.

| Limit | Default | Hard ceiling | Meaning |
| --- | ---: | ---: | --- |
| Input bytes | 16,384 | 65,536 | UTF-8 system policy plus serialized task; reject, never silently trim AC |
| Final text bytes | 16,384 | 65,536 | Collected assistant text; **not** a provider output-token or streaming-memory cap |
| Model invocations | 1 | 4 | Calls through the supplied stream callback; provider-internal retries are not counted |
| Attempt deadline | 60 seconds | 120 seconds | Includes SDK loading; timeout requests abort, not forced process termination |

An instance cannot overlap tasks or be reused for replay. Retained stream
callbacks lose admission after successful or failed settlement; retained
message callbacks cannot mutate settled output or telemetry. This is a local
callback gate, not proof that a remote provider has stopped. Timeout/interruption
remain terminal even if a late SDK call finishes. `quiescence` reports whether
the adapter's SDK promise settled; it is not proof of remote provider shutdown,
OS isolation, or zero further billing. Non-cooperative work is not automatically
retried. Every result retains `completion_state: unverified`.

### Optional canonical host bridge (experimental source integration)

`integrations/pi/host-adapter.mjs` adds `createPiHostAdapter(config)` alongside,
not inside, the original zero-tool pilot. It is **not registered** in the
canonical dispatcher and stays default-off. The host snapshots configuration
at `start()`, which returns a session identifier after local input validation;
`wait(sessionId)` owns the terminal execution result. Resume, fork, steer and
checkpoint remain unsupported.

The bridge uses the existing `ModelCallGateway`, `ToolExecutionGateway`,
`ExecutionContainment`, `LifecycleCoordinator`, `TrajectoryLedger` and
`BudgetLedger` without changing the shared runtime. Model routing is pinned to
the host's capability probe. The gateway has exactly one attempt per bridge
invocation; the trusted transport must declare no hidden retry and receives an
attempt identity, output-token limit and canonical cancellation signal. This
host declaration is not independent proof of a remote provider's behavior.

Tools are an explicit host registry of existing canonical tools. Every tool
passes the canonical containment/policy path and an out-of-band host approval,
with identity revalidation before its handler. Task data cannot grant approval.
Duplicate tool-call IDs, unknown tools, stale bindings and traversal fail closed.
The registry does not load Pi shell tools, extensions or arbitrary filesystem
handlers. Cancellation closes admissions before cleanup and quarantines an
unconfirmed terminal result; no automatic fallback or replay follows effects.

The host must supply a non-secret `accountId` distinct from workspace identity.
Adapters sharing a billing account share the same canonical account budget even
when they run in different workspaces. That account identity is snapshotted at
start and bound to reservation, transport and attempt receipt; it never comes
from task/model data or an implicit workspace fallback.

A separate canonical budget reservation surrounds each transport invocation.
A proven pre-dispatch failure releases its reservation and closes admission so
a late lifecycle callback cannot spend released escrow. Once transport has
been invoked, missing native cost or pending settlement **holds** the
reservation rather than releasing it or converting it to zero. Only trusted
provider-reported cost settles invoked work. Reconciliation requires the host's
native receipt, not a model-authored usage field. The bridge and receipt book
are process-local and do not supply cross-process recovery or provider receipt
authentication.

`contracts.mjs` bounds dense plain JSON, task acceptance and host-provided
artifact references, rejects accessor/toJSON inputs, and binds current workspace,
session, turn, tree, policy, capability and expiry. Artifact references are host
metadata: no file is automatically opened and no referenced-content hash is
claimed to have been recomputed. All provider-visible context, including tool
schemas and results, is byte-bounded without silently dropping acceptance.

`receipts.mjs` records attempt-bound observations and projects eligible trusted
native observations to the existing ForgeBench `ProviderUsageObservation` v1.
Synthetic SDK usage and fixture receipts never become native usage. Missing cost
remains unavailable even when token counters exist. The projection accepts only
in-process book-issued records; serialized records need host revalidation.
Neither this provenance check nor a content hash authenticates a same-user host.

Monotonic deadline checks in both adapters reject success after synchronous
SDK/provider work starves timer callbacks. They cannot preempt blocked JavaScript.
The host bridge owns a referenced bounded cleanup fence because the canonical
coordinator's normal long-lived host uses unreferenced timers. A cleanup timeout
retains `not_confirmed`; it is not proof of remote cancellation or no further cost.

### Benchmark and canary gates (not a live rollout)

`release-gates.mjs` consumes the existing ForgeBench report and
`createPairedComparison` contract rather than introducing another benchmark
runner. A locked Pi comparison requires 12 distinct tasks, three attempts per
arm, exact task/verifier/provider/model/snapshot/topology bindings and every
attempt receipt. It rechecks per-attempt acceptance against verifier outcomes,
counts failed attempts, reconciles total cost, and evaluates the declared 10%
median token or accepted-outcome cost benefit with at most 10% p95 latency
regression. Missing, malformed, self-paired or incomparable evidence is held.

A passing numerical comparison returns only `candidate_for_review` with
`activationAllowed: false` and `productionEvidence: missing`. Caller-supplied
reports do not authenticate their own native receipts. Randomized run order,
cold/warm cache strata, peak RSS, independent security/exact-tree review and
owner authorization remain separate gates. The deterministic test reports are
not results of running the 12-task live pilot.

`createPiCanaryController` is a process-local owner gate with one active worker,
default-off admission and one task by default (hard maximum ten). Its trusted
host authorization callback must verify the actual release prerequisites; no
model/task field can supply approval. Killing the controller immediately closes
new admissions and interrupts only its owned adapter. Unconfirmed cleanup is
quarantined, with no automatic rerouting, replay or re-enable. A separate local
integration test composes the real SDK, canonical gateways/lifecycle and this
controller against a deterministic transport. This is not a production canary,
a global scheduler lock or proof of OS isolation.

The installed app-server currently advertises a ChatGPT Pro account and
`gpt-6-astra`. Observed reviewer turns provide client token counters, but those
observations do not establish this pilot's exact native snapshot, price,
end-to-end attempt receipts or paired accepted-outcome benefit. Keep live
promotion held until those are independently bound. The feature branch also
has protected-ref and verified-signature requirements; a prior bypass warning
is a release blocker, not authorization to repeat a bypass.

### Dependency and trust boundary

The isolated package pins `@earendil-works/pi-agent-core@0.85.1`, whose
manifest requires Node >=22.19.0. The loader checks Node and the direct package
version before loading `Agent`. `integrations/pi/package-lock.json` pins the
transitive graph and registry integrity values independently of the root
workspaces; install it with `npm ci --ignore-scripts`, never substitute `latest`.

The registry's published `gitHead` is
`d981de1229ef899957bbe968bc8dcda02a21f477`; the immutable package manifest at
that revision agrees with the installed version, Node requirement, MIT license
and direct dependencies. The core tarball integrity recorded in the lock is
`sha512-hIXIP3eAWueAYiAl8aMvWCvvZ8Q5gT3Dip5bE5uJyIGh4+YlWRjtMLI4BaeoXoSs93zndjue61u1B/vhefLnuA==`.
Clean installation, actual SDK import and deterministic stream conformance
have been exercised on the isolated Mac arm64 worktree with Node 22.22.0.
This is not a live-provider, remote-cancellation or production certification.
Rerun the dependency audit on the candidate lock before promotion; a clean
advisory scan does not establish absence of vulnerabilities.

The core package itself depends on Pi AI, telemetry and Chord. Therefore neither
small footprint nor reduced token use is assumed. `pi-coding-agent`, extensions,
auto-discovered project scripts and default shell tools are not loaded. Pi does
not provide a built-in OS permission sandbox. Trusted injected code can still
use host privileges; this pilot is not a security boundary against malicious
SDKs, host callbacks, or a same-user attacker.

`pi-durable` adoption is deferred. Forgewright already has state, checkpoint and
ledger contracts; adding another durable store requires a demonstrated gap and
an explicit migration decision, not a presumed token-saving benefit.

## Locked delivery sequence

The sequence is **P0 -> P1 -> P2 -> P3 -> P4 -> P5 -> P6**. Later gates never
become complete because a file exists or fixture tests pass. The PR checklist
tracks transient execution status. Canonical project status remains
`docs/project-state.json`; reconcile it with the target workspace before
activation, without overwriting another lane's goal.

### P0: Target preflight and baseline

- Inspect Mac workspace, branch, worktree status, active goal, Node/npm versions,
  existing providers, and owned process leases. Never reset/clean or switch a
  dirty checkout. Use a separate worktree for the feature branch.
- Run the existing Docs Hub strict doctor/build baseline and current relevant
  local verification commands before integrating behavior.
- Record source/dependency/license provenance and exact provider topology;
  establish a no-live-spend default until the host authorizes a capped run.
- **Exit:** current Mac evidence and baseline are recorded; unresolved failures
  remain blockers, not reasons to relax tests or install hooks differently.

### P1: Isolated SDK seam and offline conformance

- Keep the package default-off with no canonical dispatch registration.
- Verify strict input, host-owned configuration, no tools, one-shot lifecycle,
  bounded attempts, redacted errors, cancellation and unavailable usage.
- Run the checked-in PI-01 through PI-24 tests; bind their exact file/command
  hashes. PI-21 through PI-24 preserve the existing strict-AC and one-shot
  requirements, including sparse entries and retained callbacks after success
  or failure. Exercise the corresponding runtime boundaries through
  `sdk.test.mjs` against the real pinned `Agent` and a deterministic transport,
  then use `harness.test.mjs` to validate the actual built Forgewright
  `HarnessAdapter` negotiator. Keep these evidence tiers separate: the SDK
  suite does not replace the original fixture tests or certify live providers.
- Generate and review the isolated dependency lockfile on the target; perform
  clean install with lifecycle scripts disabled. No root dependency churn.
- **Exit:** fixture, real-SDK and target-host conformance are separately proven.
  No tool effects, resume support or production readiness are claimed.

### P2: Canonical provider/tool/lifecycle integration

- Bind the host stream to the existing model gateway: runtime capability probe,
  one provider ecosystem, approved credentials, attempt identity, reservation,
  settlement and provider-native receipts. No independent Gemini API path.
- Adapt an explicit allowlist of canonical gateway tools, not Pi default tools.
  Bind each call to workspace/session/task/turn, scoped paths, policy, approval,
  trajectory accounting and the existing process-ownership contract.
- Add negative tests for unknown tools, forged approval, traversal/symlink
  escape, stale scope, credential exposure, prompt injection, duplicate effects,
  policy denial, interrupt during effects and non-cooperative cleanup.
- Resolve scheduler start/wait semantics, verify cancellation/settlement and
  negotiate only capabilities actually implemented. Never fake resume support.
- **Exit:** canonical integration plus independent security/contract review;
  the feature remains opt-in and denied effects never execute.

### P3: Context and continuity discipline

- Use existing bounded task contracts, progressive skill loading and offload
  references; exclude whole conversation histories by default.
- Preserve required acceptance, policy, provenance and active work references.
  Measure bytes and exact-provider tokens separately; do not label bytes tokens.
- Add resume only after binding canonical tree, ledger, workspace, capability
  snapshot and expiry, with rejection tests for stale/corrupt/replayed state.
- **Exit:** context limits and acceptance preservation pass; any summarization
  cost and recovery overhead are included in later measurements.

### P4: Evidence and telemetry bridge

- Normalize native input/output/cached usage, model snapshot, latency, tool
  calls, retries, failures and cost basis into the existing receipt contract.
- Missing usage/pricing stays explicitly unavailable. Do not copy entire Pi
  events, prompts, source files, secrets or outputs into telemetry.
- Add tests for partial streams, duplicate receipts, retry accounting,
  cancellation charges and failed attempts. Keep billing/provider truth distinct
  from local callback counts and SDK-settled state.
- **Exit:** exact-bound receipts reconcile with the selected live provider;
  neither fixture events nor generated metadata can enable routing gates.

### P5: Paired benchmark and promotion decision

- Compare current worker and Pi on the same task revisions, acceptance tests,
  provider/model snapshot, settings, tool capabilities and retry budgets.
- Use an initial declared pilot of 12 tasks (analysis, bugfix, tests, refactor),
  three repetitions per arm with randomized order; label this a pilot, not a
  universal performance estimate. Separate cold/warm cache and startup costs.
- Log all failures and retries. Primary metric: total cost per verified accepted
  outcome. Also report accepted-task rate, false-success, tokens, p50/p95 latency,
  peak RSS, cleanup/recovery and maintenance complexity.
- Promotion requires no new safety/false-success failures, no accepted-task
  regression in the paired suite, and a reproducible material benefit. A proposed
  pilot threshold is >=10% lower median tokens or accepted-outcome cost without
  >10% p95 latency regression; lock thresholds before running, not afterwards.
- **Exit:** independent review of results, uncertainty and native receipts.
  If no benefit is demonstrated, keep the adapter experimental or remove it;
  do not migrate because an integration already exists.

### P6: Opt-in canary, rollback and documentation gate

- Canary one owner-selected low-risk lane, one active worker, with explicit
  provider/spend caps; keep existing native workers as the default.
- Verify an immediate admission kill switch and exact-owned draining/cleanup.
  Do not reroute a task after possible effects until state is reconciled.
- Update canonical project-state/roadmap only from observed evidence, rebuild
  Docs Hub and run its gate, existing local regression checks and independent
  schema-v2 exact-tree review. Hosted CI is not required.
- **Exit:** separate implementation/integration/activation/production/outcome
  records, tested rollback and explicit release decision. No automatic main
  merge, service restart, submodule rollout or Hermes migration.

## Source publication and activation are different decisions

An owner-authorized source release may publish the experimental, default-off
integration after its local acceptance, independent review and repository
publication requirements pass. This does not close the complete P0–P6 program:
provider-native accounting, the actual paired pilot and a production canary
still require their own evidence. A signed source commit never enables Pi.

`release-acceptance.mjs` binds six material local-source requirements across
three distinct checks: public contract rejection, installed-SDK/canonical-host
runtime behavior, and fresh-process owner-gated workflows with real policy
subprocesses. Model responses remain deterministic. Positive tool execution,
denied effects, hung pre-dispatch cancellation, account limits, unavailable
usage and one-worker kill/quarantine are observed separately from live billing.
The same acceptance IDs and negative-path references can be linked across these
tiers without treating each internal unit-test label as a product requirement.
The original 117 regression cases remain unchanged and run alongside the new
18 release-acceptance cases.

```bash
npm --prefix integrations/pi run test:release
python3 scripts/ci/verify-readme.py
```

The README verifier checks EN/VI links, canonical product facts and actual
init/onboard commands in a disposable project. It does not measure product
performance or replace independent review of public claims.

## Verification entry points and evidence boundaries

Offline pilot, no API key or Pi installation required:

```bash
node --check integrations/pi/adapter.mjs
node --test integrations/pi/adapter.test.mjs
```

Real installed SDK and canonical host-contract conformance, without an API key:

```bash
npm --prefix integrations/pi ci --ignore-scripts --no-audit --no-fund
npm run build
npm --prefix integrations/pi run test:all
npm --prefix integrations/pi audit --omit=dev
```

`test:all` retains the original 24 fixture contracts, 20 actual-SDK transport
contracts and four canonical host-negotiation contracts. Separate suites cover
monotonic deadlines, bounded context/receipt contracts, canonical host execution,
account-budget and pre-dispatch settlement, benchmark gating and local canary
integration. The SDK suites supply deterministic transport output while the
installed agent loop, event handling and abort path execute normally. Synthetic
usage is intentionally not promoted into native billing evidence. A test-local
fetch rejection is an accidental-network tripwire, not a general OS sandbox.

The optional host bridge resolves its own start/wait contract; this does not
register it in the production scheduler. The original three P1 suites and their
oracles remain unchanged. The original pilot implementation gained monotonic
deadline enforcement. The two newer bridge/canary fixture setups explicitly
supply their existing account identity for the stricter host configuration;
their prior assertions and scenarios are preserved.

On the target checkout, use the existing configured toolchain and gates:

```bash
npm run build
npm test
npm run ci:docs
npm run verify:roadmap
```

Use the established Docs Hub lifecycle (`forge docs doctor . --strict`,
`forge docs build .`, `forge docs gate . --worktree`, final build). Also evaluate
the **base-to-head changeset** during PR review; a clean checkout's worktree-only
gate is not evidence that the committed PR diff was checked.

Offline fake-Agent tests prove adapter logic only. The separate installed-SDK
and built-host tests add deterministic compatibility evidence on the tested
Mac/Node version; they do not prove canonical dispatch integration, native
provider usage, sandboxing, throughput, cost savings, scheduler compatibility
or independent approval. Current runtime blockers and exact next actions
belong in canonical project-state and the PR, not a fabricated PASS record.

## Primary sources

- [Pi repository and permission model](https://github.com/earendil-works/pi)
- [Pinned agent package manifest](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/agent/package.json)
- [Pinned agent API and implementation](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/agent/src/agent.ts)
- [Forgewright HarnessAdapter contract](https://github.com/buiphucminhtam/forgewright/blob/0d835e28740f112c5c3737345d8d0404becd0d1f/mcp/src/runtime/harness-adapter.ts)
- [Documentation governance](../../skills/_shared/protocols/documentation-governance.md)

The repository overview is a moving reference; the package/API references are
bound to the published immutable revision above. A dependency upgrade requires
reviewing the new revision and lockfile, then repeating target conformance and
audit before any later activation decision.
