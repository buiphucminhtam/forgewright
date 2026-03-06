# Forge17 — Production Grade AI Pipeline

> **This file is read by Antigravity on every new chat.** It tells the AI assistant how to use Forge17's 17 specialized skills.

## What is Forge17?

Forge17 is an adaptive orchestrator with **17 AI skills** that covers the entire software development lifecycle. From a single code review to a full greenfield build, it routes to the right skills automatically.

**Pipeline:** `DEFINE → BUILD → HARDEN → SHIP → SUSTAIN`

## How to Use (For Every New Chat)

**IMPORTANT:** When the user gives any software development request, you MUST:

1. **Read `skills/production-grade/SKILL.md`** — this is the orchestrator that routes to all 17 skills
2. **Classify the request** into one of 12 modes (Full Build, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Optimize, Design, Mobile)
3. **Follow the pipeline** as defined in the orchestrator

Do NOT skip the orchestrator. Do NOT try to handle requests directly. Let the production-grade skill classify and route.

## Quick Reference

| User Says | Mode | What Happens |
|-----------|------|-------------|
| "Build a SaaS for..." | Full Build | All 17 skills, 5 phases, 3 gates |
| "Add [feature]..." | Feature | PM → Architect → BE/FE → QA |
| "Review my code" | Review | Code Reviewer only |
| "Write tests" | Test | QA Engineer only |
| "Deploy / CI/CD" | Ship | DevOps → SRE |
| "Design UI for..." | Design | UI Designer only |
| "Build mobile app" | Mobile | Mobile Engineer (+ PM, Architect) |
| "Help me think about..." | Explore | Polymath co-pilot |

## Available Workflows

Users can invoke these workflows directly:
- `/setup` — First-time setup as git submodule
- `/update` — Check for and install updates
- `/pipeline` — Show full pipeline reference and available modes

## Auto-Update Check

At the start of each session, silently check if a newer version is available:

```
Current version: read VERSION file
Remote version: compare with https://github.com/buiphucminhtam/forge17
```

If a newer version exists, mention it briefly: *"Forge17 update available (vX.X.X → vY.Y.Y). Run `/update` to upgrade."*

## Skills Directory

All 17 skills are in the `skills/` directory:

| Skill | Location |
|-------|----------|
| Orchestrator | `skills/production-grade/SKILL.md` |
| Polymath | `skills/polymath/SKILL.md` |
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
| Skill Maker | `skills/skill-maker/SKILL.md` |
| UI Designer | `skills/ui-designer/SKILL.md` |
| Mobile Engineer | `skills/mobile-engineer/SKILL.md` |
| Shared Protocols | `skills/_shared/protocols/` |

## Configuration

Optional: create `.production-grade.yaml` at project root to customize paths, preferences, and feature flags. If absent, defaults apply.
