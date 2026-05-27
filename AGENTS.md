# Forgewright — Production Grade AI Pipeline

> **This file is read by Antigravity on every new chat.** It tells the AI assistant how to use Forgewright's 56 specialized skills.

## What is Forgewright?

Forgewright is an adaptive orchestrator with **56 AI skills** that covers the entire software development lifecycle **plus game development, XR, data engineering, and MLOps**. From a single code review to a full Unity/Unreal/Godot/Phaser 3/Three.js game build, it routes to the right skills automatically. Supports **parallel execution** via git worktrees for faster builds.

**Pipeline:** `INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN`

## ⚠️ MANDATORY RULE: ALWAYS USE FORGEWRIGHT

**After Forgewright is installed, EVERY user request MUST go through the Forgewright pipeline.**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FORGEWRIGHT MANDATORY RULE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ⚠️ NEVER skip Forgewright for user requests.                       │
│  ⚠️ NEVER handle requests directly without the orchestrator.       │
│  ⚠️ ALWAYS interpret → classify → plan → execute via skills.       │
│                                                                     │
│  EXCEPTION: BA Scope Clarification                                 │
│  ─────────────────────────────────                                 │
│  If the request is a NEW PROJECT requiring Business Analyst          │
│  scope elicitation, the BA skill will ask clarifying questions     │
│  first. This is NOT a conflict — it's the correct Forgewright      │
│  workflow (Step 0: Interpret → Identify need for BA).              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

<!-- NOTE: Evidence-First section is duplicated in CLAUDE.md (for Claude Code).
     Source of truth: CLAUDE.md. Changes here must be mirrored from CLAUDE.md manually. -->

## ⚠️ EVIDENCE-FIRST THINKING (Anti-Hallucination)

**Every assumption is a landmine. Declare it. Verify it. Or die on it.**

Modern models hallucinate confidently. The solution is not to try harder to be correct — it is to **never act on unverified assumptions**.

```
┌─────────────────────────────────────────────────────────────────────┐
│ EVIDENCE-FIRST THINKING                                            │
├─────────────────────────────────────────────────────────────────────┤
│ BEFORE acting on ANY assumption:                                    │
│ 1. STATE the assumption explicitly                                  │
│ 2. GATHER evidence — read the file, run the command, check the DB│
│ 3. VERIFY — does the evidence confirm or deny the assumption?       │
│ 4. THEN act — with the evidence, not the assumption                │
│                                                                     │
│ ❌ "The API is at /api/users — let me add the endpoint"           │
│ ✅ "I ASSUME the API is at /api/users."  READ routes.ts           │
│    → Evidence: base path is /v1/users. VERIFIED. Proceeding."     │
│                                                                     │
│ NEVER guess then implement. Guess → VERIFY → then implement.        │
└─────────────────────────────────────────────────────────────────────┘
```

**Decision rules:**
- If evidence **confirms** assumption → safe to proceed
- If evidence **denies** assumption → correct the assumption, update plan
- If evidence is **absent** → WRITE VERIFICATION ARTIFACT. Run it.
  → Artifact **passes** → assumption confirmed, proceed
  → Artifact **fails** → assumption wrong, correct + research + replan
  → Cannot write artifact → escalate to user (rare: pure preference/taste only)
- If evidence is **insufficient** → state uncertainty, flag as assumption, proceed with caution

**Verification Artifacts (autonomous evidence gathering):**
When evidence is absent, write a test or script instead of stopping to ask the user. This preserves autonomous flow while ensuring every assumption is empirically verified.

```
ASSUMPTION: "API uses JWT auth"
  ↓ (evidence absent)
WRITE: test_api_auth.py — check if requests require JWT
RUN:  pytest test_api_auth.py
  ├── PASS → Assumption confirmed. Proceed.
  └── FAIL → Assumption wrong. Research → Replan → new test → verify.
```

**Evidence hierarchy (strongest first):**
1. Verification artifact output (test/script that ran and produced output)
2. Direct code/DB reading (`Read` tool on actual files)
3. Command output (run `ls`, `grep`, `test` commands)
4. User confirmation (ask the person who knows — only when artifact impossible)
5. Project documentation (README, comments)
6. Inference from context (use sparingly, flag as inference)

**⚠️ Evidence-first + Goal-driven compatibility:**
Evidence-first does NOT conflict with goal-driven autonomous mode. The loop is:
`assumption → write artifact → run → pass/fail → (if fail) research → replan → new artifact`
This never requires user input — it only escalates when no artifact can be written.

## How to Use (For Every New Chat)

**IMPORTANT:** When the user gives any software development request, you MUST:

1. **STEP 0 — Chat Interpreter (MANDATORY)**: Read `skills/production-grade/SKILL.md` for the full request interpretation flow. This step:
   - Extracts 9 dimensions from the user's message
   - Detects vague/confusing requests and asks clarifying questions (MAX 3)
   - Generates a structured request with clear scope and success criteria
   - **DO NOT SKIP THIS STEP** — if the request is unclear, ask before proceeding
2. **STEP 1 — Classify the request** into one of 24 modes (Full Build, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Research, Optimize, Design, Mobile, Mobile Test, Marketing, Grow, **Game Build**, **XR Build**, **Analyze**, **Prompt**, **Autonomous**)
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
> If score < 9.0: **LEARN (identify weak criteria) → RESEARCH (NotebookLM → Web Search) → IMPROVE SKILL (append lessons) → RE-PLAN**.
> Max 3 iterations. No skill may skip this. Read `skills/_shared/protocols/plan-quality-loop.md` for full rubric.

**Enhanced Research Flow (NEW v8.1):**

```
┌─────────────────────────────────────────────────────────────────────┐
│              RESEARCH GATE (when plan score < 9.0)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  0. CHECK NotebookLM availability:                                 │
│     nlm --version 2>/dev/null || echo "NOT_AVAILABLE"             │
│     └─ If NOT_AVAILABLE → SKIP to Step 2 (Web Search fallback)    │
│                                                                     │
│  1. TRY NotebookLM CLI (if available):                             │
│     nlm notebook create "[Project] - [Skill] - [Topic]"            │
│     nlm research start "[topic]" --mode deep                       │
│                                                                     │
│  2. FALLBACK to Web Search (always available):                   │
│     WebSearch: "best practices [topic]"                            │
│     WebSearch: "[framework] [pattern] implementation"              │
│                                                                     │
│  3. SYNTHESIZE: Extract 1-3 actionable insights                   │
│     ✓ "Auth pattern: JWT + refresh token rotation"                │
│     ✗ "Found 15 articles about auth"                              │
│                                                                     │
│  4. UPDATE session tracker:                                       │
│     bash scripts/forgewright-session-tracker.sh plan <score>       │
│     bash scripts/forgewright-session-tracker.sh check              │
│     └─ If ≥2 consecutive failures → Research Gate MANDATORY        │
│                                                                     │
│  5. RE-PLAN with new insights, then re-score                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Session Tracking (NEW v8.1):**
- Use `scripts/forgewright-session-tracker.sh` to track consecutive failures
- Check: `bash scripts/forgewright-session-tracker.sh check`
- Record: `bash scripts/forgewright-session-tracker.sh plan <score>`

**⚠️ BA Scope Exception:**
- If plan requires Business Analyst scope elicitation (new project, unclear requirements), ASK clarifying questions via BA skill
- This is NOT blocking — this IS the Forgewright workflow for new projects
- Continue Plan → Score loop after BA scope is defined

## Quick Reference

| User Says | Mode | What Happens |
|-----------|------|-------------|
| "Build a SaaS for..." | Full Build | All skills, 6 phases, 3 gates |
| "Add [feature]..." | Feature | PM → Architect → BE/FE → QA → auto-test |
| "Review my code" | Review | Code Reviewer only |
| "Write tests" | Test | QA Engineer only |
| "Deploy / CI/CD" | Ship | DevOps → SRE |
| "Design UI for..." | Design | UX Researcher → Interaction Designer → UI Designer |
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
- `/mcp` — Generate MCP workspace isolation config — creates `.antigravity/mcp-manifest.json` for Antigravity conflict-free multi-project support

## Auto-Initialization Check

Run silently BEFORE any execution (all modes) to ensure project intelligence is fully configured.

**Step 0.1 — GitNexus + MCP Check:**

1. Check if `.antigravity/mcp-manifest.json` exists and is current in the project root.
2. **If missing or stale**, run ONE command to set up everything:

   **Detect forgewright path first**, then run:

   ```bash
   # If forgewright is a submodule in the project:
   bash <project-root>/forgewright/scripts/forgewright-mcp-setup.sh

   # If forgewright IS the project:
   bash scripts/forgewright-mcp-setup.sh

   # For Antigravity plugin users (universal, works from any project):
   bash <forgewright>/scripts/forgewright-mcp-setup.sh
   ```

   This single command sets up Forgewright MCP for **ALL three platforms simultaneously**:
   - **Cursor**: `~/.cursor/mcp.json`
   - **Claude Code**: `~/.claude/settings.json` (mcpServers key)
   - **Antigravity**: MCP workspace isolation via `~/.cursor/projects/<hash>/mcps/`

   The script auto-detects which platforms are available and configures them all with identical settings — the same MCP server path, the same launchers, the same workspace detection logic.

   To set up individual platforms:
   ```bash
   bash forgewright/scripts/forgewright-mcp-setup.sh --cursor       # Cursor only
   bash forgewright/scripts/forgewright-mcp-setup.sh --claude-code # Claude Code only
   bash forgewright/scripts/forgewright-mcp-setup.sh --antigravity  # Antigravity only
   bash forgewright/scripts/forgewright-mcp-setup.sh --check       # Status check
   bash forgewright/scripts/forgewright-mcp-setup.sh --diagnose     # Full diagnostics
   ```

3. **GitNexus Setup** (if not already done):
   ```bash
   npm install -g gitnexus
   gitnexus setup  # Auto-configures all editors
   ```

4. After setup, yield a brief message:
   `ℹ MCP server ready for this workspace. Restart your AI client to activate.`

5. **If already set up**, continue normally.

**Why a single script?**
- No more juggling multiple scripts (`mcp-generate.sh`, `mcp-serve.sh`, `mcp-launcher.sh`)
- No more manual JSON editing
- No more "which script should I run?" confusion
- Works consistently across all project types (submodule, standalone, worktree)

### Universal MCP Setup — Canonical Server Rule

**The canonical MCP server lives at:** `~/.forgewright/mcp-server/server.ts`

**CRITICAL — One Server, All Platforms:**
- The global MCP configs (`~/.cursor/mcp.json`, `~/.claude/settings.json`) are **SHARED across ALL projects**
- They MUST always point to `~/.forgewright/mcp-server/server.ts`
- **NEVER** write a submodule Forgewright path (e.g., `/project/submodule/forgewright/.forgewright/mcp-server/`) into global configs
- **ALWAYS** run `forgewright-mcp-setup.sh` from the canonical Forgewright installation to update global configs

**Setup script (`forgewright-mcp-setup.sh`) behavior:**
1. Syncs the MCP server from forgewright source → `~/.forgewright/mcp-server/`
2. Writes `~/.cursor/mcp.json` pointing to canonical server
3. Writes `~/.claude/settings.json` pointing to canonical server
4. Submodule projects get `.antigravity/mcp-manifest.json` (project context only)

**Platform configuration targets:**

| Platform | Config File | Entry |
|----------|-------------|-------|
| **Cursor** | `~/.cursor/mcp.json` | `forgewright` + `gitnexus` |
| **Claude Code** | `~/.claude/settings.json` | `mcpServers.forgewright` + `mcpServers.gitnexus` |
| **Antigravity** | `~/.cursor/projects/<hash>/mcps/` | MCP workspace isolation |

**Why this works:** All platforms use `npx tsx` with the same absolute path to the canonical server at `~/.forgewright/mcp-server/`. The server auto-detects workspace from `FORGEWRIGHT_WORKSPACE` env var or git root, so it works correctly from any project regardless of where forgewright itself is installed.

## Auto-Update Check

At the start of each session, silently check if a newer version is available:

```
Current version: read VERSION file
Remote version: compare with https://github.com/buiphucminhtam/forgewright
```

If a newer version exists, mention it briefly: *"Forgewright update available (vX.X.X → vY.Y.Y). Run `/update` to upgrade."*

## In-Repo Hooks Configuration

Forgewright provides in-repo hook configurations for Claude Code in `.claude/hooks.yml`. This allows team-wide consistency without requiring global configuration.

**Setup:**
```bash
# Option 1: Symlink (recommended)
ln -sf "$(pwd)/.claude/hooks.yml" ~/.claude/hooks.yml

# Option 2: Copy
cp .claude/hooks.yml ~/.claude/hooks.yml
```

**Current hooks:**
- `memory-tick`: Automatically increments message count and checks token thresholds after each tool use
- `token-check`: Placeholder for pre-tool token usage checks

**Benefits:**
- Hooks are version-controlled with the project
- New team members get hooks automatically
- Changes propagate via git

## Skills Directory

All 56 skills are in the `skills/` directory:

| Skill | Location |
|-------|----------|
| **Orchestrator & Meta** | |
| Orchestrator | `skills/production-grade/SKILL.md` |
| Polymath | `skills/polymath/SKILL.md` |
| Parallel Dispatch | `skills/parallel-dispatch/SKILL.md` |
| Memory Manager | `skills/memory-manager/SKILL.md` |
| Skill Maker | `skills/skill-maker/SKILL.md` |
| MCP Generator | `skills/mcp-generator/SKILL.md` — generates `.antigravity/mcp-manifest.json` for Antigravity workspace isolation |
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
| Interaction Designer | `skills/interaction-designer/SKILL.md` — Behavioral specs: state machines, micro-interactions, motion design |
| Art Director | `skills/art-director/SKILL.md` — Vision-powered art direction for UI/UX and game assets |
| Vision Review | `skills/vision-review/SKILL.md` — Claude vision quality gate for AI-generated art |
| Mobile Engineer | `skills/mobile-engineer/SKILL.md` |
| Mobile Tester | `skills/mobile-tester/SKILL.md` |
| API Designer | `skills/api-designer/SKILL.md` |
| Database Engineer | `skills/database-engineer/SKILL.md` |
| Debugger | `skills/debugger/SKILL.md` |
| Prompt Engineer | `skills/prompt-engineer/SKILL.md` |
| Prompt Optimizer | `skills/prompt-optimizer/SKILL.md` — DSPy-powered algorithmic optimization |
| **Meta & Workflow** | |
| Goal-Driven | `skills/goal-driven/SKILL.md` — Autonomous goal pursuit (inspired by Codex /goal) |
| **New Engineering (v6.1)** | |
| AI Engineer | `skills/ai-engineer/SKILL.md` |
| Accessibility Engineer | `skills/accessibility-engineer/SKILL.md` |
| Performance Engineer | `skills/performance-engineer/SKILL.md` |
| UX Researcher | `skills/ux-researcher/SKILL.md` |
| Data Engineer | `skills/data-engineer/SKILL.md` |
| XLSX Engineer | `skills/xlsx-engineer/SKILL.md` |
| Project Manager | `skills/project-manager/SKILL.md` |
| **Testing** | |
| Autonomous Testing | `skills/autonomous-testing/SKILL.md` — Self-healing E2E workflow |
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
| Unity MCP | `skills/unity-mcp/SKILL.md` — Editor automation, 100+ tools |
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
| Memory CLI | `scripts/mem0-v2.py` |
| Memory Middleware | `scripts/memory-middleware.py` |
| Memory Handover Verification | `scripts/verify-memory-handover.sh` |
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
<!-- DEPRECATED: ForgeNexus is legacy. Use GitNexus instead (see below). -->
<!--
# ForgeNexus — Code Intelligence (LEGACY)
# 
# This section is kept for backward compatibility only.
# NEW PROJECTS: Use GitNexus instead (see <!-- gitnexus:start --> section below.
#
# To migrate: npm install -g gitnexus && gitnexus setup
-->

<!-- forgenexus:end -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **forgewright** (19187 symbols, 27440 relationships, 267 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/forgewright/context` | Codebase overview, check index freshness |
| `gitnexus://repo/forgewright/clusters` | All functional areas |
| `gitnexus://repo/forgewright/processes` | All execution flows |
| `gitnexus://repo/forgewright/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
