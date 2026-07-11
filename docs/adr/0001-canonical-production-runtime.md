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
| Public product facts do not drift from the manifest | `scripts/ci/verify-product-truth.py` | `tests/unit_tests/test_product_truth.py`; aggregate CI gate | Covers declared product facts, not operational performance assertions. |
| Stored evaluation comparisons only use compatible live evidence | `evals/cheap-model/run-evals.py` | `tests/unit_tests/test_eval_comparable.py`; aggregate CI gate | Historical reports without required metadata remain non-comparable. |
