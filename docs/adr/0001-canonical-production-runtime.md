# ADR 0001: Canonical production runtime

- Status: Accepted for the currently implemented product surface
- Date: 2026-07-11

## Decision

The canonical production runtime is the TypeScript MCP server entry point at
[`mcp/src/index.ts`](../../mcp/src/index.ts). It accepts MCP traffic over stdio,
initializes the workspace through
[`setWorkspaceRoot`](../../mcp/src/state/pipeline-manager.ts), and registers
the published MCP prompt and tool handlers.

The stateful pipeline path is `registerTools` → `pipeline-manager` →
`PipelineService` → `FileSystemStateRepository`; its behavior is covered by
the MCP unit suite, including `PipelineService.test.ts` and state-repository
tests. The public CLI is a separate surface and is covered by
[`scripts/testing/test-cli.sh`](../../scripts/testing/test-cli.sh).

## Non-decision and evidence boundary

`scripts/runtime/forgewright-orchestrator.py`, its compatibility shim, and the
shell MCP launchers remain installed compatibility or development paths. This
repository does not currently prove that every one of those paths constructs
or traverses `MiddlewareChain`. Therefore they are not the canonical
production enforcement path, and this ADR makes no claim that their live
provider or live MCP boundaries have been smoke-tested.

The canonical declaration is intentionally limited to the locally testable
MCP server surface. A live-provider/MCP smoke remains an evidence-gated P0.3
gap.

## Consequences

New production safety or state claims must identify their MCP construction
path and automated test. Claims about legacy orchestration must remain scoped
until an integration test demonstrates equivalent enforcement.

## Claim-to-enforcement conformance matrix

| Scoped claim | Enforced at | Automated evidence | Boundary / gap |
| --- | --- | --- | --- |
| MCP server uses stdio and registers its handlers | `mcp/src/index.ts` (`StdioServerTransport`, `registerPrompts`, `registerTools`) | `cd mcp && npm run build`; `cd mcp && npm test` | Local build/unit evidence; no live client smoke in this slice. |
| Pipeline state is parsed and persisted through the MCP service path | `mcp/src/state/pipeline-manager.ts`; `mcp/src/core/services/PipelineService.ts`; `mcp/src/infrastructure/adapters/FileSystemStateRepository.ts` | `mcp/src/core/services/PipelineService.test.ts`; repository tests in `cd mcp && npm test` | Covers the MCP service path only. |
| A failed state write does not publish a success update | `PipelineService.transactAndPublish` awaits repository transaction before publishing | `mcp/src/core/services/PipelineService.test.ts` in the MCP suite | Applies to pipeline state, not every historical shell/Python path. |
| Middleware behavior is unit-tested | `mcp/src/middleware/chain.ts` | `mcp/src/middleware/chain.test.ts` in the MCP suite | Production construction of this chain is not established by `mcp/src/index.ts`; do not claim universal middleware traversal. |
| Canonical MCP tool execution traverses one gateway | `mcp/src/api/tools.ts` → `mcp/src/runtime/tool-execution-gateway.ts` → `mcp/src/middleware/chain.ts` | `mcp/src/api/tools.gateway.test.ts`; `mcp/src/runtime/tool-execution-gateway.test.ts` | Covers registered MCP tools only; the gateway has an authorization hook, but no MCP caller-identity policy, CLI, or external-tool wiring in this slice. |
| Canonical MCP read deduplication cannot reuse a result across a successful mutation or session | `mcp/src/middleware/session-deduplication.ts` uses a call-owned pending entry and a per-session epoch in each cache key; `mcp/src/api/tools.ts` gives each stdio server process a stable cache session; `mcp/src/runtime/tool-execution-gateway.ts` gives each invocation a unique call ID | `mcp/src/middleware/session-deduplication.test.ts`; `mcp/src/runtime/tool-execution-gateway.test.ts` | Only the explicit read-only allowlist (`fw_get_current_phase`, `fw_check_pipeline_compliance`) is cached by the gateway. A failed mutation does not advance the epoch. The deterministic ≥60% compact-reference reduction is a synthetic test result, not a live operational metric. |
| Model-call gateway makes deterministic bounded decisions | `mcp/src/runtime/model-call-gateway.ts` | `mcp/src/runtime/model-call-gateway.test.ts` | The MCP server does not originate provider calls today. Capability probes/providers are injected abstractions; no live provider claim or evidence. |
| Model-call estimated budgets fail closed before invocation | `BudgetLedger` in `mcp/src/runtime/model-call-gateway.ts` | `mcp/src/runtime/model-call-gateway.test.ts` | Local in-process atomic reservation, actual-cost settlement, and terminal-failure refunds are evidenced whenever callers use the gateway; live provider/operational evidence remains gated. |
| Public product facts do not drift from the manifest | `scripts/ci/verify-product-truth.py` | `tests/unit_tests/test_product_truth.py`; aggregate CI gate | Covers declared product facts, not operational performance assertions. |
| Stored evaluation comparisons only use compatible live evidence | `evals/cheap-model/run-evals.py` | `tests/unit_tests/test_eval_comparable.py`; aggregate CI gate | Historical reports without required metadata remain non-comparable. |
