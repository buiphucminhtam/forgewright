# Forgewright — Production Grade AI Pipeline

> **This file is read by Antigravity on every new chat.** It tells the AI assistant how to use Forgewright's 50 specialized skills.

## What is Forgewright?

Forgewright is an adaptive orchestrator with **50 AI skills** that covers the entire software development lifecycle **plus game development, XR, data engineering, and MLOps**. From a single code review to a full Unity/Unreal/Godot/Roblox game build, it routes to the right skills automatically. Supports **parallel execution** via git worktrees for faster builds.

**Pipeline:** `DEFINE → BUILD → HARDEN → SHIP → SUSTAIN`

## How to Use (For Every New Chat)

**IMPORTANT:** When the user gives any software development request, you MUST:

1. **Read `skills/production-grade/SKILL.md`** — this is the orchestrator that routes to all skills
2. **Classify the request** into one of 19 modes (Full Build, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Research, Optimize, Design, Mobile, Mobile Test, Marketing, Grow, **Game Build**, **XR Build**, **Analyze**)
3. **Follow the pipeline** as defined in the orchestrator
4. **PLAN FIRST, ALWAYS** — Before ANY skill does ANY work, it MUST create a plan, score it (8 criteria, threshold ≥ 8.0/10), and improve until passing. See `skills/_shared/protocols/plan-quality-loop.md`

Do NOT skip the orchestrator. Do NOT try to handle requests directly. Let the production-grade skill classify and route.

> **⚠️ MANDATORY: Plan Quality Loop**
> Every skill invocation MUST follow: **PLAN → SCORE → META-EVALUATE → CHECK ≥8 → EXECUTE**.
> If score < 8.0: **LEARN (identify weak criteria) → RESEARCH (search for solutions) → IMPROVE SKILL (append lessons to SKILL.md) → RE-PLAN**.
> Max 3 iterations. No skill may skip this. Read `skills/_shared/protocols/plan-quality-loop.md` for full rubric.

## Quick Reference

| User Says | Mode | What Happens |
|-----------|------|-------------|
| "Build a SaaS for..." | Full Build | All skills, 5 phases, 3 gates |
| "Add [feature]..." | Feature | PM → Architect → BE/FE → QA |
| "Review my code" | Review | Code Reviewer only |
| "Write tests" | Test | QA Engineer only |
| "Deploy / CI/CD" | Ship | DevOps → SRE |
| "Design UI for..." | Design | UX Researcher → UI Designer |
| "Build mobile app" | Mobile | Mobile Engineer (+ PM, Architect) |
| "Help me think about..." | Explore | Polymath co-pilot |
| "Deep research on..." | Research | Polymath + NotebookLM MCP (grounded) |
| "Marketing strategy for..." | Marketing | Growth Marketer → Conversion Optimizer |
| "Optimize conversions" | Grow | Conversion Optimizer → Growth Marketer |
| "Optimize performance" | Optimize | Performance Engineer + SRE |
| "Test on Android/iOS" | Mobile Test | Mobile Tester (AI vision on real devices) |
| "Build a game with Unity..." | Game Build | Game Designer → Engine Engineer → Level/Narrative/Audio |
| "Build a Roblox experience" | Game Build | Game Designer → Roblox Engineer |
| "Build a VR app..." | XR Build | XR Engineer (+ Game Build pipeline if game-like) |
| "Build AI feature / RAG..." | AI Build | AI Engineer + Prompt Engineer + Data Scientist |
| "Scrape/crawl website" | AI Build | Web Scraper + AI Engineer (if RAG) |
| "Analyze requirements..." | Analyze | Business Analyst (elicit, evaluate, validate) |
| "Set up Paperclip" | — | Setup multi-agent orchestration (optional) |

## Available Workflows

Users can invoke these workflows directly:
- `/setup` — First-time setup as git submodule
- `/update` — Check for and install updates
- `/pipeline` — Show full pipeline reference and available modes
- `/setup-mobile-test` — Set up plug-and-play mobile testing (Android/iOS)
- `/setup-paperclip` — Set up Paperclip multi-agent orchestration (optional)
- `/onboard` — Run deep project analysis (creates `.forgewright/project-profile.json`)
- `/mcp` — Start auto-generated project-specific MCP server

## Auto-Initialization Check

Run silently BEFORE any execution (all modes) to ensure project intelligence is fully configured.

**Step 0.1 — MCP & GitNexus Check:**

1. Check if the file `.forgewright/mcp-server/mcp-config.json` exists in the project root.
2. **If missing**, silently execute the following terminal commands to auto-initialize it:
   - `npx --yes gitnexus analyze`
   - `bash <path-to-forgewright-submodule>/scripts/mcp-generate.sh`
   - Yield a brief message to the user: `ℹ Auto-initialized GitNexus index and MCP server (missing setup).`
3. **If exists**, continue normally without doing anything.

## Auto-Update Check

At the start of each session, silently check if a newer version is available:

```
Current version: read VERSION file
Remote version: compare with https://github.com/buiphucminhtam/forgewright
```

If a newer version exists, mention it briefly: *"Forgewright update available (vX.X.X → vY.Y.Y). Run `/update` to upgrade."*

## Skills Directory

All 50 skills are in the `skills/` directory:

| Skill | Location |
|-------|----------|
| **Orchestrator & Meta** | |
| Orchestrator | `skills/production-grade/SKILL.md` |
| Polymath | `skills/polymath/SKILL.md` |
| Parallel Dispatch | `skills/parallel-dispatch/SKILL.md` |
| Memory Manager | `skills/memory-manager/SKILL.md` |
| Skill Maker | `skills/skill-maker/SKILL.md` |
| MCP Generator | `skills/mcp-generator/SKILL.md` |
| **Engineering** | |
| Business Analyst | `skills/business-analyst/SKILL.md` |
| Product Manager | `skills/product-manager/SKILL.md` |
| Solution Architect | `skills/solution-architect/SKILL.md` |
| Software Engineer | `skills/software-engineer/SKILL.md` |
| Frontend Engineer | `skills/frontend-engineer/SKILL.md` |
| QA Engineer | `skills/qa-engineer/SKILL.md` |
| Security Engineer | `skills/security-engineer/SKILL.md` |
| Code Reviewer | `skills/code-reviewer/SKILL.md` |
| DevOps | `skills/devops/SKILL.md` |
| SRE | `skills/sre/SKILL.md` |
| Data Scientist | `skills/data-scientist/SKILL.md` |
| Technical Writer | `skills/technical-writer/SKILL.md` |
| UI Designer | `skills/ui-designer/SKILL.md` |
| Mobile Engineer | `skills/mobile-engineer/SKILL.md` |
| Mobile Tester | `skills/mobile-tester/SKILL.md` |
| API Designer | `skills/api-designer/SKILL.md` |
| Database Engineer | `skills/database-engineer/SKILL.md` |
| Debugger | `skills/debugger/SKILL.md` |
| Prompt Engineer | `skills/prompt-engineer/SKILL.md` |
| **New Engineering (v6.1)** | |
| AI Engineer | `skills/ai-engineer/SKILL.md` |
| Accessibility Engineer | `skills/accessibility-engineer/SKILL.md` |
| Performance Engineer | `skills/performance-engineer/SKILL.md` |
| UX Researcher | `skills/ux-researcher/SKILL.md` |
| Data Engineer | `skills/data-engineer/SKILL.md` |
| XLSX Engineer | `skills/xlsx-engineer/SKILL.md` |
| Project Manager | `skills/project-manager/SKILL.md` |
| **Growth** | |
| Growth Marketer | `skills/growth-marketer/SKILL.md` |
| Conversion Optimizer | `skills/conversion-optimizer/SKILL.md` |
| **Data Acquisition** | |
| Web Scraper | `skills/web-scraper/SKILL.md` |
| **Integration** | |
| Paperclip Protocol | `skills/_shared/protocols/paperclip-integration.md` |
| **Game Development** | |
| Game Designer | `skills/game-designer/SKILL.md` |
| Unity Engineer | `skills/unity-engineer/SKILL.md` |
| Unreal Engineer | `skills/unreal-engineer/SKILL.md` |
| Godot Engineer | `skills/godot-engineer/SKILL.md` |
| Godot Multiplayer | `skills/godot-multiplayer/SKILL.md` |
| Roblox Engineer | `skills/roblox-engineer/SKILL.md` |
| Level Designer | `skills/level-designer/SKILL.md` |
| Narrative Designer | `skills/narrative-designer/SKILL.md` |
| Technical Artist | `skills/technical-artist/SKILL.md` |
| Game Asset & VFX | `skills/game-asset-vfx/SKILL.md` |
| Game Audio Engineer | `skills/game-audio-engineer/SKILL.md` |
| Unity Shader Artist | `skills/unity-shader-artist/SKILL.md` |
| Unity Multiplayer | `skills/unity-multiplayer/SKILL.md` |
| Unreal Technical Artist | `skills/unreal-technical-artist/SKILL.md` |
| Unreal Multiplayer | `skills/unreal-multiplayer/SKILL.md` |
| XR Engineer | `skills/xr-engineer/SKILL.md` |
| **Shared Protocols & Scripts** | |
| Shared Protocols | `skills/_shared/protocols/` |
| Task Contract Protocol | `skills/_shared/protocols/task-contract.md` |
| Task Validator Protocol | `skills/_shared/protocols/task-validator.md` |
| Merge Arbiter Protocol | `skills/_shared/protocols/merge-arbiter.md` |
| Project Onboarding Protocol | `skills/_shared/protocols/project-onboarding.md` |
| Session Lifecycle Protocol | `skills/_shared/protocols/session-lifecycle.md` |
| Quality Gate Protocol | `skills/_shared/protocols/quality-gate.md` |
| Brownfield Safety Protocol | `skills/_shared/protocols/brownfield-safety.md` |
| Quality Dashboard Protocol | `skills/_shared/protocols/quality-dashboard.md` |
| Graceful Failure Protocol | `skills/_shared/protocols/graceful-failure.md` |
| Code Intelligence Protocol | `skills/_shared/protocols/code-intelligence.md` |
| Paperclip Integration Protocol | `skills/_shared/protocols/paperclip-integration.md` |
| Worktree Manager | `scripts/worktree-manager.sh` |
| Memory CLI | `scripts/mem0-cli.py` |
| Mobile Test Setup | `scripts/mobile-test-setup.sh` |

## Configuration

Optional: create `.production-grade.yaml` at project root to customize paths, preferences, and feature flags. If absent, defaults apply.

## Project State (v7.0)

Forgewright maintains project state in the `.forgewright/` directory:
- `project-profile.json` — Project fingerprint, health, patterns, risk (committed)
- `code-conventions.md` — Detected coding patterns for consistency (committed)
- `session-log.json` — Session history and resume state (gitignored)
- `quality-history.json` — Quality score trending across sessions (gitignored)
- `quality-report-{session}.json` — Per-session quality reports (gitignored)
- `baseline-{session}.json` — Brownfield test baselines (gitignored)
- `change-manifest-{session}.json` — File change tracking (gitignored)

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **forgewright** (256 symbols, 383 relationships, 20 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/forgewright/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/forgewright/context` | Codebase overview, check index freshness |
| `gitnexus://repo/forgewright/clusters` | All functional areas |
| `gitnexus://repo/forgewright/processes` | All execution flows |
| `gitnexus://repo/forgewright/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->
