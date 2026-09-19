---
title: Optional Pi Worker Runtime
status: accepted-for-pilot
owner: Runtime maintainers
scope: Optional execution adapter; no production activation
last_reviewed: 2026-09-19
canonical: true
---

# ADR: Optional Pi Worker Runtime

## Decision and authority

Add Pi as an optional worker behind the existing `HarnessAdapter v1`, not as
another orchestrator. This is an additive Layer 5 decision under the existing
[architecture](../architecture.md) and
[canonical-runtime ADR](0001-canonical-production-runtime.md). The
[provider-native policy](../active-roadmap.md#provider-native-routing-policy),
canonical tool/model gateways, requirement-locked tests, schema-v2 verification,
Stop gates, process ownership, and context-only continuity remain authoritative.

The owner requested the architecture, README, detailed plan, and incremental
implementation. The initial implementation is deliberately an isolated,
default-off **analysis-only pilot**, not a registered production worker.
Hermes retains operator identity/scheduling; Forgewright retains goals, routing,
approvals, memory, and acceptance. No active local goal or running service is
replaced by this decision. Existing Jev routing remains unchanged.

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
`taskId`, `objective`, `acceptance`, and optional supplied `context`. Fresh
messages and an empty tool set are constructed for every adapter instance.
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

An instance cannot overlap tasks or be reused for replay. Timeout/interruption
remain terminal even if a late SDK call finishes. `quiescence` reports whether
the adapter's SDK promise settled; it is not proof of remote provider shutdown,
OS isolation, or zero further billing. Non-cooperative work is not automatically
retried. Every result retains `completion_state: unverified`.

### Dependency and trust boundary

The inspected upstream source candidate is
`@earendil-works/pi-agent-core@0.85.1`, whose manifest requires Node >=22.19.0.
The loader checks Node and the direct package version before loading `Agent`.
This is a **source candidate**, not evidence that npm installation or runtime
compatibility has passed. Registry availability, exact transitive lockfile,
integrity, license/audit results, and clean installation must be verified on the
target before a live call. Do not silently substitute `latest`.

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
- Run the checked-in PI-01 through PI-20 tests; bind their exact file/command
  hashes. Repeat against the real pinned SDK with a deterministic test stream
  on supported Node, then validate real `HarnessAdapter` negotiation.
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

## Verification entry points and evidence boundaries

Offline pilot, no API key or Pi installation required:

```bash
node --check integrations/pi/adapter.mjs
node --test integrations/pi/adapter.test.mjs
```

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

Offline fake-Agent tests prove adapter logic only. They do not prove actual SDK
compatibility, target Mac execution, canonical integration, provider usage,
sandboxing, throughput, cost savings, or independent approval. Current runtime
blockers and exact next actions belong in the PR, not a fabricated PASS record.

## Primary sources

- [Pi repository and permission model](https://github.com/earendil-works/pi)
- [Agent package manifest](https://github.com/earendil-works/pi/blob/main/packages/agent/package.json)
- [Agent API and implementation](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent.ts)
- [Forgewright HarnessAdapter contract](../../mcp/src/runtime/harness-adapter.ts)
- [Documentation governance](../../skills/_shared/protocols/documentation-governance.md)

Upstream links are moving references. Re-read and bind an immutable upstream
revision plus installed lockfile/integrity before certifying the actual SDK.
