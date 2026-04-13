# Forgewright — Production Grade AI Pipeline

> **This file is read by Antigravity on every new chat.** It tells the AI assistant how to use Forgewright's 54 specialized skills.

## What is Forgewright?

Forgewright is an adaptive orchestrator with **55 AI skills** that covers the entire software development lifecycle **plus game development, XR, data engineering, and MLOps**. From a single code review to a full Unity/Unreal/Godot/Phaser 3/Three.js game build, it routes to the right skills automatically. Supports **parallel execution** via git worktrees for faster builds.

**Pipeline:** `INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN`

## How to Use (For Every New Chat)

**IMPORTANT:** When the user gives any software development request, you MUST:

1. **STEP 0 — Chat Interpreter (MANDATORY)**: Read `skills/production-grade/SKILL.md` for the full request interpretation flow. This step:
   - Extracts 9 dimensions from the user's message
   - Detects vague/confusing requests and asks clarifying questions (MAX 3)
   - Generates a structured request with clear scope and success criteria
   - **DO NOT SKIP THIS STEP** — if the request is unclear, ask before proceeding
2. **STEP 1 — Classify the request** into one of 23 modes (Full Build, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Research, Optimize, Design, Mobile, Mobile Test, Marketing, Grow, **Game Build**, **XR Build**, **Analyze**, **Prompt**)
3. **STEP 2 — PLAN FIRST, ALWAYS** — Before ANY skill does ANY work, it MUST create a plan, score it (8 criteria, threshold ≥ 9.0/10), and improve until passing. See `skills/_shared/protocols/plan-quality-loop.md`
4. **STEP 3 — Execute the pipeline** as defined in the orchestrator

**⚠️ CRITICAL RULE: NEVER START EXECUTING WITHOUT INTERPRETATION**

If the user's request is vague or missing critical information:
- STOP immediately
- Ask clarifying questions (max 3)
- Wait for user response
- ONLY then proceed to skill execution

Do NOT skip the orchestrator. Do NOT try to handle requests directly. Let the production-grade skill classify and route.

> **⚠️ MANDATORY: Plan Quality Loop**
> Every skill invocation MUST follow: **PLAN → SCORE → META-EVALUATE → CHECK ≥9 → EXECUTE**.
> If score < 9.0: **LEARN (identify weak criteria) → RESEARCH (search for solutions) → IMPROVE SKILL (append lessons to SKILL.md) → RE-PLAN**.
> Max 3 iterations. No skill may skip this. Read `skills/_shared/protocols/plan-quality-loop.md` for full rubric.

## Quick Reference

| User Says | Mode | What Happens |
|-----------|------|-------------|
| "Build a SaaS for..." | Full Build | All skills, 6 phases, 3 gates |
| "Add [feature]..." | Feature | PM → Architect → BE/FE → QA → auto-test |
| "Review my code" | Review | Code Reviewer only |
| "Write tests" | Test | QA Engineer only |
| "Deploy / CI/CD" | Ship | DevOps → SRE |
| "Design UI for..." | Design | UX Researcher → UI Designer |
| "Build mobile app" | Mobile | Mobile Engineer (+ PM, Architect) |
| "Help me think about..." | Explore | Polymath co-pilot |
| "Deep research on..." | Research | NotebookLM Researcher + Polymath (grounded) |
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

**Step 0.1 — ForgeNexus Check:**

1. Check if the file `.forgewright/mcp-server/mcp-config.json` exists in the project root.
2. **If missing**, silently execute the following terminal commands to auto-initialize it:
   - `npx --yes forgenexus analyze`
   - `bash <path-to-forgewright-submodule>/scripts/mcp-generate.sh`
   - Yield a brief message to the user: `ℹ Auto-initialized ForgeNexus index and MCP server (missing setup).`
3. **If exists**, continue normally without doing anything.

## Auto-Update Check

At the start of each session, silently check if a newer version is available:

```
Current version: read VERSION file
Remote version: compare with https://github.com/buiphucminhtam/forgewright
```

If a newer version exists, mention it briefly: *"Forgewright update available (vX.X.X → vY.Y.Y). Run `/update` to upgrade."*

## Skills Directory

All 55 skills are in the `skills/` directory:

| Skill | Location |
|-------|----------|
| **Orchestrator & Meta** | |
| Orchestrator | `skills/production-grade/SKILL.md` |
| Polymath | `skills/polymath/SKILL.md` |
| Parallel Dispatch | `skills/parallel-dispatch/SKILL.md` |
| Memory Manager | `skills/memory-manager/SKILL.md` |
| Skill Maker | `skills/skill-maker/SKILL.md` |
| MCP Generator | `skills/mcp-generator/SKILL.md` |
| **Planning** | |
| Antigravity | `antigravity/README.md` |
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
| Prompt Optimizer | `skills/prompt-optimizer/SKILL.md` — DSPy-powered algorithmic optimization |
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
| NotebookLM Researcher | `skills/notebooklm-researcher/SKILL.md` |
| **Integration** | |
| Paperclip Protocol | `skills/_shared/protocols/paperclip-integration.md` |
| **Game Development** | |
| Game Designer | `skills/game-designer/SKILL.md` |
| Unity Engineer | `skills/unity-engineer/SKILL.md` + Unity-MCP integration |
| **Unity Quickstart** | `docs/unity-project-quickstart.md` |
| Unreal Engineer | `skills/unreal-engineer/SKILL.md` |
| Godot Engineer | `skills/godot-engineer/SKILL.md` |
| Godot Multiplayer | `skills/godot-multiplayer/SKILL.md` |
| Roblox Engineer | `skills/roblox-engineer/SKILL.md` |
| **Phaser 3 Engineer** | `skills/phaser3-engineer/SKILL.md` |
| **Three.js Engineer** | `skills/threejs-engineer/SKILL.md` |
| Level Designer | `skills/level-designer/SKILL.md` |
| Narrative Designer | `skills/narrative-designer/SKILL.md` |
| Technical Artist | `skills/technical-artist/SKILL.md` |
| Game Asset & VFX | `skills/game-asset-vfx/SKILL.md` |
| Game Audio Engineer | `skills/game-audio-engineer/SKILL.md` |
| Unity Shader Artist | `skills/unity-shader-artist/SKILL.md` + Unity-MCP visual feedback |
| Unity Multiplayer | `skills/unity-multiplayer/SKILL.md` + Unity-MCP testing |
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

**Setting up Dry Run Mode (v7.6+)**
For zero-risk refactoring with self-improvement loop:
```yaml
guardrail:
  enabled: true
  mode: "dry_run"
planQuality:
  threshold: 9.0
```

## Project State (v7.0)

Forgewright maintains project state in the `.forgewright/` directory:
- `project-profile.json` — Project fingerprint, health, patterns, risk (committed)
- `code-conventions.md` — Detected coding patterns for consistency (committed)
- `session-log.json` — Session history and resume state (gitignored)
- `quality-history.json` — Quality score trending across sessions (gitignored)
- `quality-report-{session}.json` — Per-session quality reports (gitignored)
- `baseline-{session}.json` — Brownfield test baselines (gitignored)
- `change-manifest-{session}.json` — File change tracking (gitignored)

<!-- forgenexus:start -->
# ForgeNexus — Code Intelligence

> **NOTE:** This block describes the self-hosted ForgeNexus engine built into Forgewright. It replaces the previous `forgenexus` npm dependency. Run `forgenexus analyze` to index any codebase.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `forgenexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius to the user.
- **MUST run `forgenexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `forgenexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol, use `forgenexus_context({name: "symbolName"})`.

## When Debugging

1. `forgenexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `forgenexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ forgenexus://repo/forgewright/process/{processName}` — trace the full execution flow step by step
4. For regressions: `forgenexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `forgenexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first.
- **Extracting/Splitting**: MUST run `forgenexus_context({name: "target"})` to see all refs, then `forgenexus_impact({target: "target", direction: "upstream"})`.
- After any refactor: run `forgenexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `forgenexus_impact`.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `forgenexus_rename` which understands the call graph.
- NEVER commit changes without running `forgenexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `forgenexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `forgenexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `forgenexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `forgenexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `forgenexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `forgenexus_cypher({query: "..."})` |
| `list_repos` | List indexed repositories | `forgenexus_list_repos()` |
| `route_map` | API route to handler mapping | `forgenexus_route_map()` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `forgenexus://repos` | All indexed repositories |
| `forgenexus://repo/forgewright/context` | Codebase overview, check freshness |
| `forgenexus://repo/forgewright/clusters` | All functional areas |
| `forgenexus://repo/forgewright/processes` | All execution flows |
| `forgenexus://repo/forgewright/process/{name}` | Step-by-step execution trace |
| `forgenexus://schema` | Graph schema reference |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `forgenexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `forgenexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the ForgeNexus index becomes stale. Re-run analyze to update it:

```bash
npx forgenexus analyze
```

<!-- forgenexus:end -->