# Forgewright Active Roadmap

> **North star:** cost per verified, accepted engineering task.
> **Scope:** the core engineering loop first; game, XR, research, and growth remain optional capability packs until the core loop has production evidence.
> **Status date:** 2026-07-11.

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
| Product truth | `product-manifest.json`, deterministic validator, and required aggregate gate cover declared public facts | Remaining legacy/status-document cleanup is pending |
| Runtime | The TypeScript MCP stdio server is declared as the canonical locally-tested production path; CLI and Python/shell paths coexist | Live provider/MCP smoke and legacy-path equivalence evidence are pending |
| Safety controls | MiddlewareChain tests pass, but production construction was not found outside tests | Safety claims are not proven on the production path |
| Legacy agent loop | Local hardening now caches a bounded namespaced tool catalog and enforces turn, tool-call, context, output, response, and timeout limits | Live MCP/provider smoke evidence and legacy-path enforcement equivalence remain pending |
| Model selection | Provider-specific static tier guidance and several unrelated model environment variables | No capability/risk router or startup capability probe |
| Evaluation | Schema-v2 local validator rejects mock/incomplete/mismatched reports; historical files are documented as non-comparable | No reproducible paired live baseline or live provider evidence |
| Cost control | Token budgets and reports exist | Budget is not enforced at a single model-call gateway |
| State | File state persistence can log a failed write while the caller reports success | No fail-closed error propagation or concurrency control |
| CI/release | A deterministic aggregate workflow invokes product truth, Python units, MCP lint/format/build/test, and CLI tests | Coverage, security, clean-install, and runtime smoke remain outside this partial P3.1 gate |
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
| P0.1 | **Implemented locally:** ADR 0001 declares the canonical MCP runtime and scopes claims through a code/test conformance matrix | Architect / Expert | None | Local conformance evidence exists; live-provider and legacy-path equivalence remain gated |
| P0.2 | **Implemented locally:** canonical product manifest, drift validator, public truth sync, regression tests, and aggregate CI wiring | Tech writer + Builder | P0.1 | Local truth gate passes; hosted CI execution and remaining internal-link cleanup remain pending |
| P0.3 | **Implemented locally:** corrected paths/model endpoint handling, workspace isolation, required-server failure, namespaced tools, and hard runtime limits; live smoke remains | Runtime engineer / Expert | P0.1 | Deterministic unit tests pass; live runtime smoke proves provider/MCP boundaries |
| P0.4 | **Implemented locally:** schema-v2 eval reports require live mode, exact task set, attempts, verifier metadata, provider, model, and resolved snapshot before comparison | QA / Builder | P0.1 | Historical reports are intentionally rejected; reproducible paired live baseline remains pending |
| P0.5 | **Implemented locally (README/product overview scope):** absolute safety, privacy, and performance language is qualified and linked to runtime/evidence boundaries | Product + tech writer / Scout | P0.2 | Broader documentation inventory remains pending |

**Targets:** zero known false-success paths; zero unbounded model loops; clean clone to first verified task in under 10 minutes; at least 90% setup success in supported CI environments.

### Phase 1 — Unified Execution and Cost Control

**Outcome:** every production model and tool call is governed, observable, and budgeted.

| ID | Deliverable | Owner / model tier | Dependencies | Exit evidence |
|---|---|---|---|---|
| P1.1 | **Implemented locally:** deterministic model-call gateway foundation with injected capability probe, Scout/Builder/Expert selection, bounded retry/backoff, circuit state, per-call timeout/output/turn caps, and privacy-safe usage telemetry with explicit `usage_unavailable` | Runtime engineer / Expert | P0.3, P0.4 | Unit evidence exists; canonical MCP does not yet originate live provider calls, so live provider evidence remains gated |
| P1.2 | **Implemented locally on the canonical MCP handler:** `ToolExecutionGateway` exposes an authorization hook and routes registered MCP calls through existing sanitization, offload, quality, verification, and telemetry hooks | Security + runtime / Expert | P0.1 | Deterministic registration traversal test exists; a production identity/authorization policy and CLI/external-tool traversal are not wired in this slice |
| P1.3 | **Implemented locally:** offloaded MCP tool output returns a compact bounded result plus a sanitized reference; dedup remains limited to `fw_get_current_phase` and `fw_check_pipeline_compliance`, with per-session cache epochs advanced only after a successful non-allowlisted canonical tool | Performance / Builder | P1.2 | Deterministic gateway tests prove a pre-mutation read hit, post-mutation miss, session isolation, failed-mutation retention, and a synthetic large-result compact-reference reduction of at least 60%; this is not an operational token-savings claim |
| P1.4 | **Implemented locally in the model gateway:** atomic in-process task/account reservations occur before provider invocation, actual cost settles reservations, terminal failures refund them, and concurrent calls cannot deterministically overshoot a budget; warnings begin at 80%, authority is required at 95%, and overage requires explicit authorization | FinOps + runtime / Expert | P1.1 | Deterministic unit evidence covers concurrency, settlement/refunds, thresholds, explicit override, and retry eligibility. The canonical MCP server does not yet originate live provider calls, so operational provider-cost/overshoot evidence remains gated. |
| P1.5 | **Implemented locally:** state writes fail closed with typed errors, schema validation, lock-backed transactions, a deterministic 100-entry history cap, and recovery/concurrency regressions | Backend / Expert | P1.2 | Deterministic tests cover typed persistence failures, same-process transaction serialization, lock recovery, oldest-first history trimming, and no pipeline-state event after a rejected transaction; evidence is local MCP/aggregate-gate execution |

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
| P3.1 | **Partial implemented locally:** required aggregate gate covers product truth, Python units, MCP lint/format/build/test, and CLI tests | DevOps / Builder | P0.2, P1.1, P1.2 | Runtime smoke, clean install, coverage, security, and reusable workflow decomposition remain pending |
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

1. Run a live P0.3 provider/MCP smoke and record its evidence before expanding runtime safety claims.
2. Produce paired schema-v2 live reports with the same resolved model snapshot before using cheap-model results to justify routing.
3. Extend P3.1 with clean-install, coverage, security, runtime-smoke, and reusable workflow evidence.
4. Run the full regression matrix, GitNexus `detect_changes`, independent diff review, and release audit.
