# Changelog

All notable changes to [Forgewright](https://github.com/buiphucminhtam/forgewright).

## [8.1.0] — 2026-04-29

> **v8.1 — Autonomous Pipeline Hardening (Clarify-to-Deploy)**

### Added
- **Strict Cognitive Rules** (`rules/.tieu-mo-deployment-flow.md`) — Enforced ground truth for the AI orchestrator to prevent DevOps-related hallucinations during Clarify phase.
- **Automated Vercel Project Binding** (`scripts/task-runner.sh`) — Automatically generates `vercel.json` with a sanitized project name before deployment to resolve Vercel directory name collision bugs.
- **HTTP Validation Loop** (`scripts/task-runner.sh`) — Added a self-verifying HTTP ping check after assigning the custom Vercel subdomain to ensure DNS propagation before confirming task completion.
- **Global Memory Injection** — Integrated memory-wrapper injection to ensure the Orchestrator inherently understands the CI/CD boundaries.

## [8.0.0] — 2026-04-13

> **v8.0 — Stability, Resilience, Audit, Quality, Timeout**

### Added

- **Circuit Breaker Protocol** (`skills/_shared/protocols/circuit-breaker.md`) — State machine pattern (CLOSED → OPEN → HALF_OPEN) to prevent cascading failures in parallel dispatch workers.
- **Bulkhead Isolation Protocol** (`skills/_shared/protocols/bulkhead.md`) — Resource limits per worker type (memory, CPU, duration) with failure containment.
- **Verification Protocol** (`skills/_shared/protocols/verification.md`) — 4-level verification framework (Contract Compliance → Acceptance Criteria → Integration → Quality Score).
- **Quality History Schema** (`.forgewright/quality-history.schema.json`) — JSON Schema for tracking quality scores across sessions.
- **Production Config Template** (`.production-grade.yaml.example`) — Example config with circuit breaker, bulkhead, quality gate, middleware chain, and timeout settings.

### Changed

- **Documentation Count Fix** — Mode count corrected to 23 (from 22) in README.md, README.vi.md, CLAUDE.md, AGENTS.md. Protocol count corrected to 27 (from 15) in README.md and README.vi.md badges.
- **Skills Count Fix** — AGENTS.md corrected to "55 AI skills" (from 54).
- **AI Build Mode Simplification** — Removed `"scrape"`, `"crawl website"` triggers and `Web Scraper` skill from AI Build mode. Web Scraper has its own trigger and skill.
- **DEFINE Phase** — Added investigation timeout management (T0 no limit, T0.5 10min, T1 15min, T1.5 15min, T2 20min).
- **TASK Contract JSON Schema** (`skills/_shared/protocols/task-contract.md`) — Added JSON Schema block for contract validation.
- **READ-ONLY Enforcement** (`skills/code-reviewer/SKILL.md`) — Phase 0 enforcement ensuring code-reviewer never modifies source code.
- **Authority Boundary Checks** (`skills/_shared/protocols/guardrail.md`) — SOLE OWASP and SOLE SLO authority enforcement via guardrail custom rules.
- **Enhanced Secret Detection** (`skills/security-engineer/SKILL.md`) — JWT `algorithm: none`, AWS v4 signatures, base64-encoded secrets, env var patterns, hardcoded credentials, connection strings with embedded secrets.
- **Self-Healing Loop** (`skills/production-grade/phases/build.md`) — Error classification → retry protocol (max 3) → rollback → escrow report.

### Security

- Authority boundary enforcement via guardrail custom rules (SOLE OWASP for security-engineer, SOLE SLO for SRE).
- Secret detection patterns expanded with 20+ regex patterns for API keys, JWTs, credentials, and connection strings.

### Internal

- 15 phase and cross-cutting audits completed with 150+ findings. All P0 issues resolved. Breaking changes: 0.

# Changelog

All notable changes to [Forgewright](https://github.com/buiphucminhtam/forgewright).

## [7.8.2] — 2026-04-09

> **Quality Overhaul — Stability, CI/CD, Architecture, Maintainability**

### Added

- **Middleware Chain Extraction** (`skills/production-grade/middleware/`) — 10 middleware files extracted from SKILL.md into separate files for maintainability: `01-session-data.md` through `10-graceful-failure.md`. SKILL.md reduced from 1700+ lines to ~400 lines.
- **Modes Reference** (`skills/production-grade/modes/README.md`) — Quick-reference index for all 19 modes, gate counts, skill counts, and shared behaviors.
- **Architecture Decision Records** (`docs/adr/`) — 4 ADRs documenting key decisions: orchestrator separation, KuzuDB read-only MCP, parallel pre-commit, skills count oscillation prevention.
- **Health Monitoring Script** (`scripts/forgeNexus-health.sh`) — Automated index health check, staleness detection, and auto-reindex trigger.
- **CLI Integration Tests** (`scripts/test-cli.sh`) — 16-test suite covering CLI commands, skills system, CI/CD, and version consistency.

### Changed

- **KuzuDB readOnly mode** (`forgenexus/src/data/db.ts`) — MCP server now opens database in read-only mode, eliminating lock conflicts with concurrent `analyze` CLI runs. Multiple MCP servers across projects can run safely alongside indexing.
- **Pre-commit parallelization** (`.husky/pre-commit`) — Restructured into 2-wave architecture: ESLint + Prettier run in parallel (wave 1), TypeScript + Vitest run in parallel (wave 2). ESLint uses `--cache` for incremental checks. ~2x speedup.
- **GitHub Actions CI parallelization** (`.github/workflows/ci.yml`) — All jobs (`lint-and-format`, `typecheck`, `test`, `commitlint`) now run in parallel. `test-coverage` waits only for `test`. Total CI time reduced significantly.
- **SKILL.md Middleware Table** — Middleware chain now documented with explicit file references, eliminating duplicate inline protocol reading.
- **build.md** — Self-healing loop (up to 5 attempts, search-augmented, escrow report) integrated per `self-healing-execution.md`.
- **DryRun Interceptor** — Added as middleware 03b in the middleware chain table.
- **`ANTIGRAVITY.md` references removed** — Replaced with `CLAUDE.md` in SKILL.md and `phases/sustain.md`.

### Fixed

- **husky version** (`package.json`) — Corrected `husky: "^10.0.0"` (non-existent) to `husky: "^9.1.7"`.
- **typo: `forgwrightVersion`** (`scripts/mcp-generate.sh`, `mcp-generator/templates/`) — Fixed to `forgewrightVersion` in both script and Handlebars template.
- **Version consistency** — `package.json` `version` field bumped to `7.8.1`, matching `VERSION` file.
- **`mcp-config.json` version** — `forgewright_version` updated from `7.0.0` to `7.8.1`.
- **MCP server config** — Added `forgewright-forgenexus` entry to `.cursor/mcp.json` pointing to local forgewright repo.

### Dependencies

- **No changes** — All dependency versions unchanged.

### Impact Assessment

- **Breaking changes:** 0
- **Backward compatibility:** 100%
- **Migration required:** None
- **User affected:** Developers using pre-commit hooks (faster), MCP server users (no lock conflicts)

## [7.8.1] — 2026-04-08

> **ForgeNexus Enterprise — Phase 1-3**

### Added

- **ForgeNexus Enterprise Features** (Phase 1-3)
  - PR Review with blast radius analysis (`forgenexus pr-review <base> [head]`)
  - Symbol impact analysis (`forgenexus impact <symbol>`)
  - OpenAPI contract checking (oasdiff integration)
  - Auto Wiki generation with multi-provider LLM support
  - Auto Reindex workflow (incremental/full)
  - Multi-repo group management (`group contracts`, `group status`, `group query`)
  - Contract verification with oasdiff
  - Cross-repo impact analysis
- **GitHub Actions Workflows** (`.github/workflows/`)
  - `pr-review.yml` — PR blast radius + OpenAPI
  - `auto-wiki.yml` — Auto wiki generation
  - `auto-reindex.yml` — Incremental/full reindex
  - `contract-verification.yml` — OpenAPI breaking changes
  - `multi-repo.yml` — Multi-repo sync
  - `multi-repo-impact.yml` — Cross-repo impact
- **Composite Actions** (`.github/actions/`)
  - `pr-review/action.yml` — PR review action with dry-run
  - `auto-wiki/action.yml` — Wiki generation action
  - `auto-reindex/action.yml` — Reindex action
- **Reusable Workflows** (`.github/workflows/reusable/`)
  - `pr-review.yml` — Reusable PR review workflow
- **Documentation**
  - `.github/README.md` — Tổng hợp tất cả workflows
  - `.github/actions/*/README.md` — Hướng dẫn chi tiết
- **Test Suite** (`scripts/test-cli.sh`)
  - Test tất cả CLI commands

### Impact Assessment

- **Breaking changes:** 0
- **Backward compatibility:** 100%
- **Migration required:** None
- **User affected:** Only users wanting to use Enterprise features

## [7.8.0] — 2026-04-06

> **⚠️ Breaking Change — ForgeNexus Database Migration**
>
> ForgeNexus has migrated from `better-sqlite3` to **KuzuDB** (graph database).
> Existing SQLite indexes must be migrated. Run the migration script:
> ```bash
> node forgenexus/scripts/migrate-sqlite-to-kuzu.js [--dry-run]
> ```

### Added

- **ForgeNexus Groups** (`forgenexus/src/data/groups.ts`) — Multi-repo contract tracking. Create named groups, add repos, sync contracts, query cross-repo execution flows. 8 new MCP tools: `group_list`, `group_create`, `group_add`, `group_sync`, `group_contracts`, `group_query`, `group_status`, `group_remove`. CLI: `forgenexus group <list|create|add|remove|sync>`.
- **Claude Code Hooks** (`forgenexus/.claude/hooks/`) — Auto-install on `forgenexus setup`: `pre-tool-use.ts` enriches grep/search context with graph data; `post-tool-use.ts` auto-reindexes after git commits.
- **SQLite → KuzuDB Migration Script** (`forgenexus/scripts/migrate-sqlite-to-kuzu.js`) — Automated migration for existing ForgeNexus SQLite indexes. Run with `--dry-run` to preview.
- **README Mermaid Diagrams** — 7 diagrams replacing ASCII art: Architecture Overview, Middleware Chain, Session Lifecycle, ForgeNexus Analyze Pipeline, Multi-Repo Group Management, Claude Code Hooks Flow, Request → Mode → Skills Routing.

### Changed

- **ForgeNexus Database Backend** (`forgenexus/src/data/db.ts`, `schema.ts`, `registry.ts`) — Replaced `better-sqlite3` with `kuzu ^0.11.3`. Schema migrated from single `nodes`/`edges` tables to per-type node tables (CodeNode, Community, Process) and per-edge-type rel tables (CALLS, IMPORTS, EXTENDS, etc.). KuzuDB handles FTS and vector extensions natively.
- **Husky Git Hooks** (`.husky/`) — Upgraded from v9 to v10. All hook scripts updated to use `#!/usr/bin/env sh` + source `husky.sh`. `husky.sh` rewritten with v10-compatible bootstrap logic.
- **ESLint + Security Fixes** (`forgenexus/src/analysis/detect-changes.ts`, prompts) — Fixed 34 ESLint errors (unused vars, prefer-const, no-useless-escape, no-extra-semi, dead code). Added security overrides for `esbuild ^0.25.0` and `minimatch ^9.0.5`. Fixed 2 critical prompt bugs: `checkStaleness` variable interpolation and `detect_impact` template literal.
- **Prettier Format** — Reformatted all 32 source files.
- **Root-Level Scripts** (`package.json`) — Added `build:forgenexus`, `test:forgenexus`, `lint:forgenexus`, `format:forgenexus`, `build:cli`, `dev:cli`, `typecheck:cli`.

### Dependencies

- **Removed:** `better-sqlite3`, `@types/better-sqlite3`
- **Added:** `kuzu ^0.11.3` (graph DB with FTS + vector extensions)
- **Added overrides:** `esbuild ^0.25.0`, `minimatch ^9.0.5`

## [7.7.1] — 2026-04-06

### Added

- **ForgeNexus 2.1.0** (`forgenexus/`) — Parallel worker threads, Leiden algorithm, binding propagation, suffix trie, incremental FTS, embedding cache, early-exit optimization, 15+ framework detection

### Changed

- **ForgeNexus README** — Full 9-phase pipeline architecture diagram, expanded features table, performance comparison vs original pipeline, GitNexus integration docs
- **VERSION** — Bumped to 7.7.1
- **Version badge** in README, AGENTS.md

## [7.7.0] — 2026-04-02

### Added

- **Forge-Nexus MCP Server** (`mcp/`) — Global MCP server v1.0.0 with PipelineManager, SkillParser, PromptEngine. Enables Claude/Cursor AI assistants to interact with Forgewright pipeline across all projects. Listens on stdio via Model Context Protocol SDK.
- **GitHub Actions CI/CD** (`.github/workflows/ci.yml`) — Full pipeline: ESLint, Prettier format-check, TypeScript build, Vitest unit tests with v8 coverage, coverage threshold gate, commitlint on PRs.
- **Dev tooling** (`mcp/`) — ESLint with TypeScript ESLint plugin, Prettier formatting, Vitest test runner, commitlint for Conventional Commits, `.eslintrc.json`, `.prettierrc`, `vitest.config.ts` with pool: forks.
- **Husky Git hooks** (`.husky/`) — Pre-commit hook (ESLint + Prettier + TypeScript + Vitest), commit-msg hook for commitlint. Root `package.json` with `prepare: husky install` for auto-initialization on clone.
- **Global Setup Script** (`scripts/setup-project.sh`) — Links Forgewright to any project without git submodule. Detects tech stack, runs ForgeNexus analyze, prints Cursor MCP config snippet.
- **GitHub Templates** (`.github/`) — Issue templates (bug report, feature request), PR template with Forgewright pipeline checklist.
- **Cursor Subagent Review Workflow** (`.cursor/agents/`) — 5 specialized subagents: quality-reviewer, security-auditor, spec-reviewer, verifier, chat-interpreter for structured code review.
- **ForgeNexus MCP Tools** (via MCP server) — `forgenexus_query`, `forgenexus_context`, `forgenexus_impact`, `forgenexus_detect_changes`, `forgenexus_rename`, `forgenexus_cypher` for code intelligence.
- **Auto-initialization Check** — MCP server and ForgeNexus index auto-initialize on session start if `.forgewright/mcp-server/mcp-config.json` is missing.
- **Antigravity Plugin** (`.antigravity/`) — Production-grade plugin system with 52 skills, 15 shared protocols, preset templates, game dev workflows.

### Changed

- **Skill count** — 48 skills (corrected after oscillation 52 → 53 → 52)
- **README** — Added Mermaid flow diagrams for pipeline, subagent review, parallel dispatch; version badge bumped to 7.7.0
- **VERSION** — Bumped to 7.7.0
- **AGENTS.md** — Updated skill count to 52, skill directory table
- **CI pipeline** — Skills updated with activation rules, parallel-dispatch with Mermaid diagrams

### Fixed

- `.vite` build cache ignored in `.gitignore`
- `mcp/node_modules/` tracked artifacts removed (added to `.gitignore`)
- ForgeNexus code intelligence block updated with `npx forgenexus analyze` refresh note


## [7.0.0] — 2026-03-14

### Added — New Protocols (5)
- **Project Onboarding** (`project-onboarding.md`) — 5-phase deep project analysis: fingerprint → health check → pattern analysis → risk assessment → profile generation. Produces `.forgewright/project-profile.json` and `.forgewright/code-conventions.md`.
- **Session Lifecycle** (`session-lifecycle.md`) — Cross-session continuity with start/save/end hooks. Resume interrupted sessions, detect drift, memory integration.
- **Quality Gate** (`quality-gate.md`) — Universal per-skill validation: 4 levels (Build, Regression, Standards, Traceability), 0-100 quality scoring, configurable thresholds. Works in sequential AND parallel modes.
- **Brownfield Safety** (`brownfield-safety.md`) — Safety net: auto git branching, baseline snapshots, protected paths, change manifest, regression checks, rollback.
- **Quality Dashboard** (`quality-dashboard.md`) — Real-time tracking, final dashboard, machine-readable JSON reports, cross-session trending, early warning system.

### Added — Workflow
- `/onboard` — Run deep project analysis without starting pipeline.

### Added — Project State
- `.forgewright/` directory for persistent project state (profile, conventions, session logs, quality reports).

### Changed — Orchestrator
- **Session lifecycle pre-flight (Step 0.5)** — Loads project profile, session state, memory context, quality trends before work begins.
- **Enhanced codebase discovery** — Deep onboarding replaces shallow scanning for brownfield. Learns patterns, conventions, risk.
- **Context-aware routing** — Suggests addressing health issues before building (failing tests, CVEs, tech debt).
- **Quality gate integration** — Runs after EVERY skill. Mini-scorecard + aggregate at gates.
- **Brownfield safety net** — Auto-activates for all brownfield projects in any mode.
- **Session lifecycle hooks** — PHASE_COMPLETE, TASK_COMPLETE, GATE_DECISION, ERROR hooks throughout.
- **Quality Dashboard final summary** — Replaces legacy text banner with comprehensive report.
- **5 new common mistakes** added.

### Changed — Phase Dispatchers
- **BUILD phase** — Quality gate & regression checks after each task. Change manifest. Brownfield regression at completion.
- **HARDEN phase** — Quality gate per task, quality scoring in summary, brownfield merge readiness check.

### Changed — Memory Manager
- **Active lifecycle hooks** — Orchestrator now calls memory at 6 lifecycle points (was spec-only).
- **Context integration** — Memory + project profile provide full context without re-scanning.

### Changed — Metadata
- **Skill count** — 46 skills unchanged
- **Protocol count** — 7 → 12 (added 5 new protocols)
- **Version** — 6.1.0 → 7.0.0

## [5.2.0] — 2026-03-10

### Added
- **Parallel dispatch** — Git worktree-based parallel task execution. Independent tasks (BUILD: T3a/T3b/T3c, HARDEN: T5/T6a/T6b) run in isolated worktrees simultaneously.
- **Task Contract protocol** — JSON-based contract defining exact input/output/constraints for each parallel worker. Workers can only read listed files and write to allowed directories.
- **Task Validator protocol** — 7-step post-execution validation: contract compliance, boundary violations, forbidden patterns, build check, test check, import verification, API/schema conformance.
- **Merge Arbiter protocol** — Ordered merge strategy with auto-resolution for configs (package.json, docker-compose.yml), integration testing, and per-branch rollback.
- **Worktree Manager script** — Shell script managing git worktree lifecycle: create, status, validate, merge, cleanup, resume.
- **Scope Analysis Engine** — Analyzes project complexity (5-factor weighted score), estimates execution time for both modes, assesses 6 risk categories, and generates data-driven recommendation.
- **Anti-hallucination pipeline** — 6-layer defense: contract boundaries → forbidden pattern grep → build verification → test execution → import path resolution → API/schema conformance.
- **`init-parallel` setup command** — Convenience command that symlinks worktree-manager and updates .gitignore.
- **Checkpoint & resume** — Failed parallel workers preserve state in worktree for retry from checkpoint.

### Changed
- **Skill count** — 17 → 18 (added `parallel-dispatch` orchestrator skill).
- **Protocol count** — 4 → 7 (added task-contract, task-validator, merge-arbiter).
- **Execution strategy** — Orchestrator now presents scope analysis with complexity scoring, time estimates, and risk predictions before asking user to choose parallel or sequential.
- **BUILD phase** — Supports parallel mode via parallel-dispatch skill dispatch.
- **HARDEN phase** — Supports parallel mode with strict authority boundary enforcement in contracts.
- **AGENTS.md** — Updated with parallel-dispatch skill and new protocol references.

## [5.0.0] — 2026-03-06

### Changed
- **Migrated to Antigravity** — complete platform migration from Claude Code to Antigravity.
- All Claude Code-specific APIs replaced with Antigravity equivalents:
  - `AskUserQuestion` → `notify_user` with markdown numbered options
  - `Agent()` parallel sub-agents → sequential skill execution
  - `Skill()` invocation → direct SKILL.md reading and instruction following
  - `TeamCreate/TaskCreate/TaskUpdate/TeamDelete` → `task.md` tracking + `task_boundary`
  - `WebSearch/WebFetch` → `search_web/read_url_content`
  - `Read/Write/Edit/Glob/Grep` → `view_file/write_to_file/replace_file_content/find_by_name/grep_search`
  - `smart_outline/smart_unfold/smart_search` → `view_file_outline/view_code_item/grep_search`
  - `Bash` → `run_command`
- **Workspace directory** renamed: `Claude-Production-Grade-Suite/` → `Antigravity-Production-Grade-Suite/`
- **Config file** reference: `CLAUDE.md` → `ANTIGRAVITY.md`
- **Skill installation** simplified: skills load directly from `skills/` directory, no marketplace needed
- **Skill Maker** simplified: removed plugin packaging (Phase 3) and marketplace registration (Phase 5), skills install directly to `skills/` directory
- **Parallel execution removed** — Antigravity executes skills sequentially. Architecture quality (14 specialized skills, authority hierarchies, approval gates) is fully preserved.
- Author updated to `antigravity-code`
- All 50+ markdown files across 14 skills updated with new tool references and branding

## [4.2.0] — 2026-03-06

### Added
- **Adaptive routing** — orchestrator now analyzes the user's request and routes to the right skills automatically. No longer requires full pipeline for every task.
- **10 execution modes**: Full Build, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Optimize, Custom. Each with appropriate skill composition, gates, and parallelism.
- **Request classification** — automatic intent detection maps user requests to modes. "Add auth to my API" → Feature mode (PM + Architect + Backend + QA). "Review my code" → Review mode (Code Reviewer only).
- **Execution plan presentation** — user sees which skills will run and can adjust, escalate to full pipeline, or proceed.
- **Custom mode** — multi-select skill menu for requests that don't fit standard patterns.
- **Lightweight mode execution** — non-Full-Build modes skip unnecessary overhead (engagement/parallelism prompts only for 3+ skill modes).

### Changed
- Plugin description broadened from "build a complete production-ready system" to "any software engineering work that benefits from structured, production-quality execution."
- "When to Use" expanded to cover: adding features, hardening, deploying, testing, reviewing, documenting, optimizing, exploring — not just greenfield builds.
- Full Build pipeline preserved unchanged as one mode within the adaptive orchestrator.

## [4.1.0] — 2026-03-05

### Added
- **Engagement modes** — 4-level interaction depth (Express, Standard, Thorough, Meticulous) chosen at pipeline start.
- **Architecture Fitness Function** — Solution Architect now DERIVES architecture from constraints instead of picking templates.
- **Scale & Fitness Interview** — Adaptive 1-4 round interview (depth scales with engagement mode).
- **Adaptive PM interview** — Express: 2-3 questions. Standard: 3-5. Thorough: 5-8. Meticulous: 8-12.

### Changed
- **Engagement mode propagated to ALL 14 skills** — every skill reads `settings.md` and adapts decision surfacing.
- Solution Architect Phase 1 rewritten from 5 shallow questions to a comprehensive adaptive discovery process.
- Product Manager Phase 1 rewritten with 4 interview depth profiles matching engagement modes.
- **Software Engineer parallelism revised** — shared foundations established SEQUENTIALLY before parallel service agents.
- **Frontend Engineer parallelism revised** — UI Primitives built SEQUENTIALLY first, then Layout + Features parallel.

## [4.0.0] — 2026-03-05

### Changed
- **Two-wave parallel execution** — orchestrator splits work into Wave A (build + analysis) and Wave B (execution against code).
- **Internal skill parallelism** — 8 skills now spawn parallel Agents for independent work units.
- **Dynamic task generation** — orchestrator reads architecture output and creates tasks accordingly.

### Added
- **Parallelism preference** — user selects performance mode at pipeline start.
- **Token economics** — parallel execution is both faster AND cheaper.

## [3.3.0] — 2026-03-05

### Added
- **Brownfield awareness** — orchestrator detects greenfield vs existing codebase at startup.
- **Codebase discovery** — parallel scan of project root for package.json, go.mod, etc.

### Changed
- **MECE intent-based skill routing** — all 14 skill descriptions rewritten from keyword triggers to intent descriptions.

### Fixed
- **Protocol loading crash** — added `|| true` fallback.
- **Polymath priority** — uncertainty expressions now correctly route to polymath.

## [3.2.0] — 2026-03-05

### Added
- **Auto-update with consent** — orchestrator checks for new versions on pipeline start.

### Fixed
- **Protocol loading crash** — added `|| true` fallback to all `cat` commands.
- **MECE intent-based skill routing** — replaced keyword trigger matching with intent descriptions.

## [3.1.0] — 2026-03-05

### Added
- **Polymath co-pilot** — the 14th skill. Thinks with you before, during, and after the pipeline.
- 6 Polymath modes: onboard, research, ideate, advise, translate, synthesize.

## [3.0.0] — 2026-03-04

### Changed
- **Full rewrite** — shared protocols, 4 protocols, sole-authority conflict resolution.
- Large skills split into router + on-demand phases for 65% token savings.

### Added
- Phase-based skill splitting for 7 skills.
- Conditional task execution: frontend auto-skip, data-scientist auto-detect.
- Partial execution: "just define", "just build", "just harden", "just ship", "just document".

## [2.0.0] — 2026-03-04

### Changed
- **Bundle all 13 skills** into a single plugin install.
- Unified workspace architecture.
- Prescriptive UX Protocol enforced across all skills.

### Added
- Skill Maker as pipeline phase.
- VISION.md: ten principles governing the ecosystem.

## [1.0.0] — 2026-03-03

### Added
- Initial release: production-grade orchestrator plugin.
- 12 specialized agent skills coordinated through dependency graph.
- 3 approval gates, autonomous execution between gates.
- DEFINE > BUILD > HARDEN > SHIP > SUSTAIN pipeline.
