# Changelog

All notable changes to Forge17 (formerly Production Grade Plugin).

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
