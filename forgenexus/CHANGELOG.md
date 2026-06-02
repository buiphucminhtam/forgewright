# Changelog — ForgeNexus

All notable changes are documented here. Forgenexus follows [Semantic Versioning](https://semver.org/).

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.3.0] — 2026-06-02

### Added

#### Anti-Hallucination System (GA)
- **Skeptic Verification Agent** — Verifies every factual claim against indexed codebase before surfacing
- **Confidence Scoring** — ECE (Expected Calibration Error) < 0.10; per-claim confidence scores (0–1)
- **Citation Extraction** — Inline source citations `[source:filepath:line]` for all factual claims
- **TokenShapley Attribution** — Per-token influence scoring on model outputs
- **Semantic Energy Uncertainty** — Quantifies output uncertainty via semantic surprise measurement
- **RAG-Grounded Wiki** — `forgenexus wiki [topic]` with integrated verification and citations

#### Evaluation
- **Eval Runner** (`src/evaluation/runner.ts`) — Configurable evaluation pipeline
- **Eval Dataset** (`src/evaluation/dataset.ts`) — 300-case anti-hallucination test suite
- **Eval Report** (`src/evaluation/report.ts`) — ECE, hallucination rate, citation accuracy metrics

#### Telemetry & Observability
- **Metrics Collection** (`src/telemetry/metrics.ts`) — Verification stats, latency, accuracy tracking
- **Metrics Dashboard** (`src/dashboard/renderer.ts`) — Terminal, JSON, HTML, Markdown output formats
- **Dashboard CLI** (`src/cli/dashboard.ts`) — `forgenexus dashboard [metrics|html|report|export]`
- **Feedback Collector** (`src/feedback/collector.ts`) — Beta user feedback collection

#### CI/CD & Rollout
- **GitHub Actions Workflows** (`.github/workflows/`):
  - `test.yml` — Full test suite on every PR
  - `benchmark.yml` — Performance regression detection
  - `staged-rollout.yml` — Dev → Staging → Production pipeline
  - `dependency-review.yml` — Dependency vulnerability scanning
  - `benchmark-compare.yml` — Baseline comparison reporting
- **Rollout Config** (`.github/rollout-config.yml`) — Staged rollout, quality gates, rollback triggers

#### Feature Flags
- **Config Module** (`src/config/feature-flags.ts`) — Toggle verification, strict mode, no-verify bypass
- **Threshold Config** (`src/config/thresholds.ts`) — Environment variable overrides for all thresholds

#### Agents
- **Multi-Agent Orchestration** (`src/agents/multi-agent.ts`) — Skeptic + LLM + synthesizer pipeline
- **Synthesizer Agent** (`src/agents/synthesizer.ts`) — Combines verification results into coherent output
- **Token Tracker** (`src/agents/token-tracker.ts`) — Per-token cost and influence tracking

#### RAG
- **Hybrid Search** (`src/rag/hybrid-search.ts`) — BM25 + dense embedding retrieval
- **Reranker** (`src/rag/reranker.ts`) — Cross-encoder reranking of retrieved chunks
- **Chunker** (`src/rag/chunker.ts`) — Smart code chunking with overlap

#### MCP Server
- **Verify Tool** (`src/mcp/tools/verify.ts`) — MCP tool for skeptic verification
- **Freshness Resource** (`src/mcp/resources.ts`) — Index freshness as MCP resource
- **Context Execution** (`src/mcp/ctx-execute.test.ts`) — MCP context protocol tests

#### Testing
- **E2E Tests** (`src/e2e/`):
  - `wiki-workflow.test.ts` — 10 wiki verification cases
  - `impact-workflow.test.ts` — 10 impact analysis cases
  - `query-workflow.test.ts` — 10 query confidence cases
  - `multi-agent.test.ts` — 5 multi-agent orchestration cases
  - `binding-verification.test.ts` — 5 binding verification cases

### Changed

- **Verification is default** — All analysis commands now run skeptic verification by default
- **Output includes `confidence` and `warnings`** — All result objects have new fields
- **Latency increase** — Skeptic adds ~1-2s per command; use `--no-verify` for fast mode

### Fixed

- N/A (first stable release with anti-hallucination system)

### Deprecated

- `gitnexus verify` — Replaced by built-in `--verify` flag on all commands
- Legacy `env-legacy.ts` — Migrate to `config/feature-flags.ts`

### Security

- Dependency vulnerability scanning via `dependency-review.yml`
- No verify mode for emergency rollback (zero-latency bypass)

---

## [2.2.0] — 2026-05-01

### Added
- Incremental indexing with FTS updates (`src/data/fts-incremental.ts`)
- Community detection via Leiden algorithm (`src/data/leiden.ts`)
- Community cache (`src/data/community-cache.ts`)
- Graph freshness tracking (`src/data/freshness.ts`)

### Fixed
- Memory leak in AST cache for large codebases
- Tree-sitter parser crash on syntax errors in TypeScript 5.x

---

## [2.1.0] — 2026-04-01

### Added
- MCP server implementation (`src/mcp/server.ts`)
- Cypher query executor (`src/mcp/cypher-executor.ts`)
- Binding verification (`src/analysis/binding-verification.ts`)

### Changed
- Database schema v3 (added `embedding` column to `nodes` table)

---

## [2.0.0] — 2026-03-01

### Added
- Complete rewrite with Neo4j/Kuzu backend
- Knowledge graph with edges and communities
- Embedding-based semantic search
- Framework detection (React, Vue, Angular, Next.js, SvelteKit, Nuxt)

### Breaking Changes
- Node.js >= 18 required
- SQLite replaced by Kuzu (embedded graph DB)
- Dropped Python CLI compatibility
