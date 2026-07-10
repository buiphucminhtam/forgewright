# Forgewright Active Roadmap

> **North star:** cost per verified, accepted engineering task.
> **Scope:** the core engineering loop first; game, XR, research, and growth remain optional capability packs until the core loop has production evidence.
> **Status date:** 2026-07-10.

## Product Goal

Forgewright turns a base model into a reliable engineering execution system. It should understand the repository before editing, route work by measured risk, prove changed behavior mechanically, preserve useful project memory within a bounded context budget, and involve a human only at strategic or authority gates.

The product promise is:

> Every edit is impact-aware, every success is evidence-backed, and expensive models are used only when measured risk requires them.

## Operating Principles

1. Optimize cost per verified accepted task, not raw token count or single-run pass rate.
2. Keep one canonical production runtime and one model-call/tool-execution gateway.
3. Prefer deterministic checks over model self-assessment.
4. Start with the least expensive capable model and escalate only from objective evidence.
5. Give workers a bounded task contract and relevant context slice, never the full conversation by default.
6. Treat documentation claims as release artifacts: every quantitative or safety claim needs an owner and evidence.
7. Roll out routing changes in shadow and canary modes before making them default.

## Verified Baseline

| Area | Current evidence | Gap |
|---|---|---|
| Product truth | `product-manifest.json` and a deterministic validator now cover public version, pipeline, skill, mode, surface, and maturity facts | CI integration and remaining legacy/status-document cleanup are pending |
| Runtime | MCP, CLI, and legacy Python/shell orchestration coexist | No declared canonical runtime or conformance matrix |
| Safety controls | MiddlewareChain tests pass, but production construction was not found outside tests | Safety claims are not proven on the production path |
| Legacy agent loop | Local hardening now caches a bounded namespaced tool catalog and enforces turn, tool-call, context, output, response, and timeout limits | Live MCP/provider smoke evidence and canonical-runtime ADR remain pending |
| Model selection | Provider-specific static tier guidance and several unrelated model environment variables | No capability/risk router or startup capability probe |
| Evaluation | Stored cheap-model comparison mixes live and mock results | No valid quality/cost baseline for routing decisions |
| Cost control | Token budgets and reports exist | Budget is not enforced at a single model-call gateway |
| State | File state persistence can log a failed write while the caller reports success | No fail-closed error propagation or concurrency control |
| CI/release | MCP and CLI tests exist; several suites and coverage are not part of one required aggregate gate | Release evidence is fragmented |
| Memory | Boot injection is capped at 500 tokens | Retrieval quality, staleness, and non-ASCII query behavior lack release KPIs |

## GPT Routing Policy

Model IDs are resolved by a startup capability probe and pinned snapshots are used for repeatable evals. The policy uses capabilities, not permanent marketing names.

| Tier | Default responsibility | Current preferred GPT family | Escalation rule |
|---|---|---|---|
| Scout | Classification, extraction, ranking, inventory, context compression | GPT-5.6 Luna | Escalate when the output is ambiguous or a deterministic check fails |
| Builder | Bounded implementation, tests, debugging, code review, subagents | GPT-5.6 Terra | Escalate on any HARD signal or two failed checks |
| Expert | Architecture, security, public API/schema, concurrency, cross-module decisions, independent high-risk review | GPT-5.6 Sol | Human authority gate when budget, policy, or unresolved disagreement requires it |

Compatibility fallback order must be populated from a live capability probe. An unavailable model is a routing event, not a reason to loop. A task uses one primary model by default. Parallel workers are allowed only for two or more independent, bounded, non-overlapping workstreams. An independent reviewer receives only the original requirements, diff, and verifier evidence.

Every route decision must log: task class, risk signals, selected model and snapshot, reason, input/output/cached tokens, latency, estimated cost, verifier result, retry count, and escalation count. Prompts, secrets, and full diffs must not be stored in process arguments or telemetry.

## Delivery Phases

### Phase 0 — Truth and Runtime Safety

**Outcome:** published claims match an enforced, bounded production path.

| ID | Deliverable | Owner / model tier | Dependencies | Exit evidence |
|---|---|---|---|---|
| P0.1 | Declare the canonical runtime in an ADR and add a claim-to-enforcement conformance matrix | Architect / Expert | None | ADR accepted; every safety claim maps to code and an automated test |
| P0.2 | **Implemented locally:** canonical product manifest, drift validator, public truth sync, and regression tests; CI wiring remains | Tech writer + Builder | P0.1 | Local truth gate passes; CI reports zero truth drift and zero broken internal links |
| P0.3 | **Implemented locally:** corrected paths/model endpoint handling, workspace isolation, required-server failure, namespaced tools, and hard runtime limits; live smoke remains | Runtime engineer / Expert | P0.1 | Deterministic unit tests pass; live runtime smoke proves provider/MCP boundaries |
| P0.4 | Make stored evals comparable: live-to-live, same task set, attempts, verifier version, provider metadata, and pinned model snapshot | QA / Builder | P0.1 | Mock/live comparisons are rejected; baseline is reproducible |
| P0.5 | Replace absolute privacy and performance claims with scoped, evidence-linked language | Product + tech writer / Scout | P0.2 | No absolute claim lacks a test, benchmark, or provider-policy qualifier |

**Targets:** zero known false-success paths; zero unbounded model loops; clean clone to first verified task in under 10 minutes; at least 90% setup success in supported CI environments.

### Phase 1 — Unified Execution and Cost Control

**Outcome:** every production model and tool call is governed, observable, and budgeted.

| ID | Deliverable | Owner / model tier | Dependencies | Exit evidence |
|---|---|---|---|---|
| P1.1 | Introduce one model-call gateway with capability probe, risk router, retries/backoff, circuit breaker, usage telemetry, and hard caps | Runtime engineer / Expert | P0.3, P0.4 | 100% orchestrated model calls have usage or explicit `usage_unavailable` |
| P1.2 | Introduce one ToolExecutionGateway and connect MCP/CLI/external tools through authorization, sandbox, sanitization, offload, quality, verification, and telemetry | Security + runtime / Expert | P0.1 | Production integration tests prove gateway traversal |
| P1.3 | Make offload return a compact summary and reference; add mutation-aware cache epochs and safe dedup exclusions | Performance / Builder | P1.2 | Tool-schema tokens per turn fall at least 60%; stale-cache incidents remain zero |
| P1.4 | Enforce task and account budgets before model calls: warn at 80%, authority gate at 95%, stop at 100% unless policy explicitly permits overage | FinOps + runtime / Expert | P1.1 | Budget overshoot is zero in deterministic tests and below 2% operationally |
| P1.5 | Make state writes fail closed with typed errors, schema validation, revision/CAS or locking, bounded history, and recovery tests | Backend / Expert | P1.2 | Zero caller success responses after persistence failure; concurrency tests pass |

**Targets:** verified-task rate at least 95%; false-success rate at most 1%; median input tokens per accepted task down 35%; cost per verified task down 30%; retry rate below 10%.

### Phase 2 — Evidence-Driven GPT Routing

**Outcome:** smaller models handle most work without material quality regression.

| ID | Deliverable | Owner / model tier | Dependencies | Exit evidence |
|---|---|---|---|---|
| P2.1 | Build at least 100 representative tasks across debug, feature, review, refactor, security, docs, and operations | QA / Builder | P0.4 | Category-level confidence intervals and frozen fixtures exist |
| P2.2 | Run a strong-model-only baseline and shadow route decisions without changing execution | QA + data / Expert | P1.1, P2.1 | Route precision and predicted savings are reported |
| P2.3 | Canary the Scout/Builder/Expert policy on 10% of eligible tasks | Runtime + SRE / Expert | P2.2 | No category drops more than 2 percentage points; no safety regression |
| P2.4 | Expand gradually and tune thresholds from verifier outcomes, not self-reported model confidence | Runtime + data / Builder | P2.3 | Scout/Builder share at least 70%; escalation 10–25%; re-escalation at most 5% |
| P2.5 | Trigger independent review only when its marginal defect reduction exceeds its token cost | QA / Expert | P2.3 | Review precision and avoided-defect cost are measured |

**Targets:** P0/P1 escaped defects equal zero; p50 latency down 25%; p95 latency no worse than 10%; maximum-turn breaches below 1%.

### Phase 3 — Release and Product Credibility

**Outcome:** a release is reproducible, portable, auditable, and understandable by a new user.

| ID | Deliverable | Owner / model tier | Dependencies | Exit evidence |
|---|---|---|---|---|
| P3.1 | Consolidate CI into reusable workflows and one required aggregate gate covering MCP, CLI, Python, runtime smoke, clean install, coverage, security, and generated drift | DevOps / Builder | P0.2, P1.1, P1.2 | One required gate cannot pass when any required suite is skipped or fails |
| P3.2 | Pin actions and tools; remove unverified `curl | bash`; add SBOM, provenance, synchronized version/tag checks, rollback test, and package smoke tests | Security + DevOps / Expert | P3.1 | Release checklist contains linked evidence for every item |
| P3.3 | Ship one canonical `forge init`/`forge onboard` golden path and a 10-minute sample workflow | CLI + docs / Builder | P0.2, P3.1 | Every documented command executes in clean-clone CI |
| P3.4 | Label capabilities stable, beta, experimental, or docs-only; move non-core domains into optional packs | Product + architect / Expert | Usage data from P2 | Every README capability has maturity and evidence links |

## Learning and Memory KPIs

Replace “never repeats a mistake” with measurable behavior:

- repeated-failure recurrence decreases at least 50% after 30 days;
- memory precision@3 is at least 80%;
- stale-memory hit rate is below 5%;
- retrieval supports non-ASCII queries and is tested with representative languages;
- tokens saved by memory reuse are measured against a no-memory control;
- no memory item can override a newer explicit requirement or security policy.

## Release Gates

A phase is complete only when all of the following are true:

1. Every deliverable has an owner, automated check, evidence path, and rollback strategy.
2. Changed symbols have pre-edit impact analysis and pre-commit `detect_changes` evidence.
3. HARD changes have an independent expert review; unavailable expert capability blocks the security-sensitive change instead of silently degrading.
4. Tests use pinned model snapshots or record the resolved snapshot and date.
5. Quality and cost are reported together; savings without comparable verifier quality do not count.
6. Documentation, package metadata, generated rule files, and release artifacts agree with the canonical product manifest.

## Current Blockers

| Blocker | Impact | Required action |
|---|---|---|
| The working tree contains pre-existing changes to generated rule files and GitNexus skill material | Broad regeneration may overwrite user-owned work | Preserve these files and isolate roadmap/runtime changes |

## Next Execution Slice

1. Complete P0.1 and the live P0.3 smoke so safety claims and enforcement cannot drift.
2. Wire the product-truth validator into the required aggregate CI gate.
3. Implement P0.4 before using any cheap-model result to justify routing.
4. Run the full regression matrix, GitNexus `detect_changes`, independent diff review, and release audit.
