# Forge17 — Production Grade AI Pipeline

> **This file is read by Antigravity on every new chat.** It tells the AI assistant how to use Forge17's 47 specialized skills.

## What is Forge17?

Forge17 is an adaptive orchestrator with **47 AI skills** that covers the entire software development lifecycle **plus game development, XR, data engineering, and MLOps**. From a single code review to a full Unity/Unreal/Godot/Roblox game build, it routes to the right skills automatically. Supports **parallel execution** via git worktrees for faster builds.

**Pipeline:** `DEFINE → BUILD → HARDEN → SHIP → SUSTAIN`

## How to Use (For Every New Chat)

**IMPORTANT:** When the user gives any software development request, you MUST:

1. **Read `skills/production-grade/SKILL.md`** — this is the orchestrator that routes to all skills
2. **Classify the request** into one of 19 modes (Full Build, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Research, Optimize, Design, Mobile, Mobile Test, Marketing, Grow, **Game Build**, **XR Build**, **Analyze**)
3. **Follow the pipeline** as defined in the orchestrator

Do NOT skip the orchestrator. Do NOT try to handle requests directly. Let the production-grade skill classify and route.

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
| "Analyze requirements..." | Analyze | Business Analyst (elicit, evaluate, validate) |

## Available Workflows

Users can invoke these workflows directly:
- `/setup` — First-time setup as git submodule
- `/update` — Check for and install updates
- `/pipeline` — Show full pipeline reference and available modes
- `/setup-mobile-test` — Set up plug-and-play mobile testing (Android/iOS)
- `/onboard` — Run deep project analysis (creates `.forge17/project-profile.json`)

## Auto-Update Check

At the start of each session, silently check if a newer version is available:

```
Current version: read VERSION file
Remote version: compare with https://github.com/buiphucminhtam/forge17
```

If a newer version exists, mention it briefly: *"Forge17 update available (vX.X.X → vY.Y.Y). Run `/update` to upgrade."*

## Skills Directory

All 47 skills are in the `skills/` directory:

| Skill | Location |
|-------|----------|
| **Orchestrator & Meta** | |
| Orchestrator | `skills/production-grade/SKILL.md` |
| Polymath | `skills/polymath/SKILL.md` |
| Parallel Dispatch | `skills/parallel-dispatch/SKILL.md` |
| Memory Manager | `skills/memory-manager/SKILL.md` |
| Skill Maker | `skills/skill-maker/SKILL.md` |
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
| Project Manager | `skills/project-manager/SKILL.md` |
| **Growth** | |
| Growth Marketer | `skills/growth-marketer/SKILL.md` |
| Conversion Optimizer | `skills/conversion-optimizer/SKILL.md` |
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
| Worktree Manager | `scripts/worktree-manager.sh` |
| Memory CLI | `scripts/mem0-cli.py` |
| Mobile Test Setup | `scripts/mobile-test-setup.sh` |

## Configuration

Optional: create `.production-grade.yaml` at project root to customize paths, preferences, and feature flags. If absent, defaults apply.

## Project State (v7.0)

Forge17 maintains project state in the `.forge17/` directory:
- `project-profile.json` — Project fingerprint, health, patterns, risk (committed)
- `code-conventions.md` — Detected coding patterns for consistency (committed)
- `session-log.json` — Session history and resume state (gitignored)
- `quality-history.json` — Quality score trending across sessions (gitignored)
- `quality-report-{session}.json` — Per-session quality reports (gitignored)
- `baseline-{session}.json` — Brownfield test baselines (gitignored)
- `change-manifest-{session}.json` — File change tracking (gitignored)
