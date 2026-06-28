# Forgewright — Production Grade AI Pipeline

> **This file is read by Antigravity on every new chat.** It tells the AI assistant how to use Forgewright's 81 specialized skills.

## What is Forgewright?

Forgewright is an adaptive orchestrator with **81 AI skills** that covers the entire software development lifecycle **plus game development, XR, data engineering, and MLOps**. From a single code review to a full Unity/Unreal/Godot/Phaser 3/Three.js game build, it routes to the right skills automatically. Supports **parallel execution** via git worktrees for faster builds.

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
│  workflow (Phase 0.A: Interpret → Identify need for BA).              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## ⚠️ MANDATORY INSTALLATION: SUBMODULE ONLY

**Forgewright MUST always be installed as a git submodule (in the `forgewright/` directory) for any project using it.**
- **Why**: Ensures version consistency across team members, supports project-specific custom skills, and is strictly required for executing local Git Hooks (pre-commit/post-commit) dynamically.
- **Action**: Never rely solely on global MCP server setups for production or team repositories. Always run `/setup` (or `git submodule add`) to initialize Forgewright locally.

## ⚠️ MANDATORY RULE: MERMAID FOR ALL SEQUENCE DIAGRAMS

All sequence diagrams generated or requested in this repository (in documents, design files, pull requests, or AI chat responses) **MUST** be written in Mermaid.js syntax using the ` ```mermaid ` code block.
- **NEVER** output raw text art, ASCII tables, or other text-based custom representations for sequence flows.
- **ALWAYS** wrap participant labels in double quotes `""` to support special characters (like parenthesis and slashes, e.g. `participant A as "A (path/to/file.ts)"`).

## ⚠️ MANDATORY RULE: CONDITIONAL GITNEXUS & SEQUENCE UPDATE
If changes modify logic files (e.g. `.ts`, `.py`, `.js`, `.cs`, `.gd`, `.go`, `.rs`, etc. under `src/`, `mcp/`, or `scripts/` excluding tests), you MUST run `gitnexus analyze` and `npx tsx scripts/generate-sequence.ts` to keep the code index and sequence flow diagrams updated.

<!-- NOTE: Evidence-First section is duplicated in CLAUDE.md (for Claude Code).
     Source of truth: skills/_shared/protocols/evidence-first.md -->

<!-- source: skills/_shared/protocols/evidence-first.md -->
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
│ NEVER guess then implement. Guess → VERIFY → then implement.         │
└─────────────────────────────────────────────────────────────────────┘
```

## 🎯 Empirical Confidence > 99% Rule

No module, feature, or logic block is considered "done" unless the AI has **empirical evidence** yielding 99% confidence.
- **Subjective Confidence (Bad):** "I am 100% sure this code works because it looks correct."
- **Empirical Confidence (Good):** "I am 99% confident because `npm run test` passed and the CLI returned exit code 0."

**UI/Visual Confidence Exception (Max 80%):**
- AI cannot visually assess aesthetics (color harmony, spacing aesthetics) accurately.
- For UI tasks, empirical confidence is **capped at 80%** (verified structurally via Chrome DevTools/DOM check).
- The remaining **19% MUST be provided by the User** via a Quality Gate (or AI Vision) to reach 99%.

**Anti-Loop Breaker:**
- If verification fails **3 consecutive times** (Confidence remains < 99%), STOP execution.
- Do not burn tokens in an infinite fix-loop. Lock the Gate and escalate to the user using the `scripts/confidence-breaker.sh` protocol.

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

1. **Phase 0.A — Chat Interpreter (MANDATORY)**: Read `skills/production-grade/SKILL.md` for the full request interpretation flow. This step:
   - Extracts 9 dimensions from the user's message
   - Detects vague/confusing requests and asks clarifying questions (MAX 3)
   - Generates a structured request with clear scope and success criteria
   - **DO NOT SKIP THIS STEP** — if the request is unclear, ask before proceeding

2. **Phase 0.B — Memory Retrieval (MANDATORY)**: Every model call is stateless — restore continuity first.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 0.B — MEMORY RETRIEVAL (MANDATORY)                          │
├─────────────────────────────────────────────────────────────────────┤
│  Run BEFORE interpreting the user's request:                       │
│                                                                      │
│  1. Extract keywords from the user's request (nouns, verbs)        │
│  2. Run: bash scripts/memory-retrieve.sh "<request>"              │
│     OR: python3 scripts/mem0-v2.py search "<keywords>" --limit 3 │
│  3. Also run: bash scripts/memory-suggest.sh "<request>"        │
│  4. If relevant memories found:                                    │
│     → Inject as MEMORY BLOCK at top of context                   │
│     → Note: "Found N relevant memories from previous sessions"     │
│  5. Also load:                                                    │
│     - .forgewright/subagent-context/CONVERSATION_SUMMARY.md        │
│     - .forgewright/memory-bank/activeContext.md                    │
│     - .forgewright/business-analyst/handoff/ba-package.md (if exists)│
│  6. Log: "✓ Memory retrieval done — N memories loaded"           │
│  Max tokens: 500 (configurable via MEM0_MAX_TOKENS)             │
└─────────────────────────────────────────────────────────────────────┘
```

3. **Phase 1 — Classify the request** into one of 24 modes (Full Build, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Research, Optimize, Design, Mobile, Mobile Test, Marketing, Grow, **Game Build**, **XR Build**, **Analyze**, **Prompt**, **Autonomous**)
3. **Phase 2 — PLAN FIRST, ALWAYS** — Before ANY skill does ANY work, it MUST create a plan, score it (9 criteria, complexity-scaled threshold), and improve until passing. See `skills/_shared/protocols/plan-quality-loop.md`
4. **Phase 3 — Execute the pipeline** as defined in the orchestrator

**⚠️ CRITICAL RULE: NEVER START EXECUTING WITHOUT INTERPRETATION**

If the user's request is vague or missing critical information:
- STOP immediately
- Ask clarifying questions (max 3)
- Wait for user response
- ONLY then proceed to skill execution

Do NOT skip the orchestrator. Do NOT try to handle requests directly. Let the production-grade skill classify and route.

> **⚠️ MANDATORY: Plan Quality Loop**
> Every skill invocation MUST follow: **PLAN → SCORE → META-EVALUATE → CHECK threshold (complexity-scaled) → EXECUTE**.
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
│     └─ If NOT_AVAILABLE → SKIP to Phase 2 (Web Search fallback)    │
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

## ⚠️ PIPELINE SKIP DETECTION — Anti-Pattern

**Root cause: The 3 Psychological Traps of LLMs.** 

1. **"Tool-first reflex"**: The innate desire to be immediately helpful overrides the instruction to plan. The model uses tools (like `grep` or `read_file`) to find data instantly instead of orchestrating.
2. **Attention Decay**: In a large prompt, a short user prompt (e.g., "đánh giá plan") causes the attention mechanism to focus entirely on the verb ("đánh giá"), burying the Trigger Keyword rules.
3. **Conversational Momentum**: Continuing a smooth conversation makes the AI treat the new command as a simple continuation rather than a strict new Task needing Phase 0.B (Memory) -> Phase 0.A (Interpret) -> Phase 1 -> Phase 2.

### Common Violations

| # | Violation | What should happen |
|---|-----------|---------------------|
| 1 | User asks → I read files → I answer directly | User asks → Phase 0.A → Phase 0.B → Phase 1 → Phase 2 → Execute |
| 2 | "I know this already, let me just..." | Phase 0.B Memory Retrieval FIRST |
| 3 | "Simple task, no need for pipeline" | EVERY task needs Phase 0.B |
| 4 | User asks "còn gì chưa làm" → I read and answer | This IS a user request → MUST go through pipeline |
| 5 | User asks "lên plan" → I create plan manually | This IS a user request → MUST go through pipeline |

### Trigger Keywords — Any of these means: RUN PIPELINE

**Any of the following phrases = "this is a user request" → MUST run Step 0:**

| Category | Keywords |
|----------|----------|
| Status check | "còn gì", "tình trạng", "status", "check", "còn phải làm gì" |
| Planning | "lên plan", "kế hoạch", "roadmap", "sprint", "backlog", "ưu tiên" |
| Priority | "đánh giá", "đánh ưu tiên", "priority", "thứ tự" |
| Engineering | "build", "add", "implement", "fix", "review", "test", "refactor" |
| Analysis | "phân tích", "evaluate", "assess", "what's left" |

### 🛑 The Momentum Breaker (MANDATORY)

To defeat Conversational Momentum, whenever the User provides a Trigger Keyword (or any new command/task), **your very first action MUST be to output the exact string `[PIPELINE_RESET]` to the user**. 

**DO NOT call any tools before outputting `[PIPELINE_RESET]`.** 
Outputting this token acts as a physical "brake" to interrupt your conversational momentum and forces your attention mechanism to restart the pipeline at Phase 0.B (Memory Retrieval).

Source of truth: `skills/_shared/protocols/pipeline-activation.md`.

### How to Detect You've Skipped Pipeline

**Self-check BEFORE answering any user request:**

```
1. Did I run bash scripts/memory-retrieve.sh or python3 scripts/mem0-v2.py?
   └─ NO → STOP. Run Phase 0.B first.

2. Did I read skills/production-grade/SKILL.md and extract 9 dimensions?
   └─ NO → STOP. Run Phase 0.B first.

3. Did I classify the mode (Feature, Architect, etc.)?
   └─ NO → STOP. Run Phase 1 first.

4. Did I create a plan and score it >= 9.0?
   └─ NO → STOP. Run Phase 2 first.

5. Did I execute via skills, not directly?
   └─ NO → STOP. Delegate or execute via skills.
```

### Escalation Protocol

If you realize mid-turn that you skipped the pipeline:

```
1. STOP current execution immediately
2. Acknowledge: "I violated the Forgewright pipeline — correcting now."
3. Run Phase 0.A + Phase 0.B retroactively
4. Re-classify + Re-plan
5. Continue or restart from correct step
6. Log the lesson: Append to skills/_shared/protocols/pipeline.md as anti-pattern
```

### Enforcement Rule

> **⚠️ MANDATORY: Before answering ANY user request, verify:**
> - [ ] Memory retrieval ran (or confirmed no relevant memories exist)
> - [ ] Phase 0.B interpretation done (9 dimensions extracted)
> - [ ] Mode classified (one of 24 modes)
> - [ ] Plan created + scored >= 9.0
> - [ ] Execution via skills (not direct code changes)
>
> If ANY checkbox is empty → STOP → Fill it → Then proceed.

## Quick Reference

| User Says | Mode | What Happens |
|-----------|------|-------------|
| "Build a SaaS for..." | Full Build | All skills, 6 phases, 3 gates (enforces BDD-First testing) |
| "Add [feature]..." | Feature | PM → Architect → QA (stubs) → BE/FE → auto-test (BDD-First for complex) |
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
- `/setup-codex` or prompt "setup codex" / "enable codex mcp" — Configure Forgewright MCP for OpenAI Codex CLI
- `/onboard` — Run deep project analysis (creates `.forgewright/project-profile.json`)
- `/mcp` — Generate MCP workspace isolation config — creates `.antigravity/mcp-manifest.json` for Antigravity conflict-free multi-project support

## Auto-Initialization Check

Run silently BEFORE any execution (all modes) to ensure project intelligence is fully configured.

**Phase 0.C — GitNexus + MCP Check:**

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

   This single command sets up Forgewright MCP for **ALL four platforms simultaneously**:
   - **Cursor**: `~/.cursor/mcp.json`
   - **Claude Code**: `~/.claude/settings.json` (mcpServers key)
   - **Antigravity**: MCP workspace isolation via `~/.cursor/projects/<hash>/mcps/`
   - **OpenAI Codex CLI**: `~/.codex/config.toml` (TOML format)

   The script auto-detects which platforms are available and configures them all with identical settings — the same MCP server path, the same launchers, the same workspace detection logic.

   To set up individual platforms (or when the user prompts "setup codex", "enable codex mcp", "bật codex cli" or similar):
   ```bash
   bash forgewright/scripts/forgewright-mcp-setup.sh --cursor       # Cursor only
   bash forgewright/scripts/forgewright-mcp-setup.sh --claude-code # Claude Code only
   bash forgewright/scripts/forgewright-mcp-setup.sh --antigravity  # Antigravity only
   bash forgewright/scripts/forgewright-mcp-setup.sh --codex        # OpenAI Codex CLI only
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

**The canonical MCP server lives at:** `~/.forgewright/mcp-server/src/index.ts`

**CRITICAL — One Server, All Platforms:**
- The global MCP configs (`~/.cursor/mcp.json`, `~/.claude/settings.json`, `~/.codex/config.toml`) are **SHARED across ALL projects**
- They MUST always point to `~/.forgewright/mcp-server/src/index.ts`
- **NEVER** write a submodule Forgewright path (e.g., `/project/submodule/forgewright/.forgewright/mcp-server/`) into global configs
- **ALWAYS** run `forgewright-mcp-setup.sh` from the canonical Forgewright installation to update global configs

**Setup script (`forgewright-mcp-setup.sh`) behavior:**
1. Syncs the MCP server from forgewright source → `~/.forgewright/mcp-server/`
2. Writes `~/.cursor/mcp.json` pointing to canonical server
3. Writes `~/.claude/settings.json` pointing to canonical server
4. Writes `~/.codex/config.toml` pointing to canonical server (TOML format)
5. Submodule projects get `.antigravity/mcp-manifest.json` (project context only)

**Platform configuration targets:**

| Platform | Config File | Entry |
|----------|-------------|-------|
| **Cursor** | `~/.cursor/mcp.json` | `forgewright` + `gitnexus` |
| **Claude Code** | `~/.claude/settings.json` | `mcpServers.forgewright` + `mcpServers.gitnexus` |
| **Antigravity** | `~/.cursor/projects/<hash>/mcps/` | MCP workspace isolation |
| **OpenAI Codex** | `~/.codex/config.toml` | `forgewright` + `gitnexus` (TOML) |
| **OpenCode** | `~/.config/opencode/config.json` | `mcpServers.forgewright` + `mcpServers.gitnexus` |

**Why this works:** All platforms use `npx tsx` with the same absolute path to the canonical server at `~/.forgewright/mcp-server/`. The server auto-detects workspace from `FORGEWRIGHT_WORKSPACE` env var or git root, so it works correctly from any project regardless of where forgewright itself is installed.

### ⚠️ SUBMODULE MCP GLOBAL PROTECTION — Mandatory Rule

```
┌─────────────────────────────────────────────────────────────────────┐
│             SUBMODULE MCP GLOBAL PROTECTION                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  When a project uses Forgewright as a SUBMODULE                    │
│  (e.g., /my-project/forgewright/), the AI agent MUST:             │
│                                                                     │
│  ✅ DO:                                                             │
│  1. Only write .antigravity/mcp-manifest.json (project-local)      │
│  2. Point global configs to ~/.forgewright/mcp-server/src/index.ts │
│  3. Use ${workspaceFolder} for Cursor/Claude (dynamic resolution) │
│  4. Run setup from the CANONICAL install, not from submodule       │
│                                                                     │
│  ❌ NEVER:                                                          │
│  1. Write submodule paths into ~/.cursor/mcp.json                  │
│  2. Write submodule paths into ~/.claude/settings.json             │
│  3. Write submodule paths into ~/.codex/config.toml                │
│  4. Write submodule paths into ~/.config/opencode/config.json      │
│  5. Hardcode a project-specific path into ANY global config        │
│  6. Run forgewright-mcp-setup.sh from a submodule directory        │
│     expecting it to write submodule paths globally                 │
│                                                                     │
│  WHY: Global configs are SHARED across ALL projects on the         │
│  machine. Writing a submodule path breaks MCP for every other      │
│  project that uses Forgewright.                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Violation examples (what NEVER to do):**

```json
// ❌ WRONG — submodule path in global config
{
  "forgewright": {
    "command": "tsx",
    "args": ["/Users/me/my-project/forgewright/mcp/src/index.ts"]
  }
}

// ✅ CORRECT — canonical path in global config
{
  "forgewright": {
    "command": "tsx",
    "args": ["/Users/me/.forgewright/mcp-server/src/index.ts"]
  }
}
```

**Self-check before any MCP config write:**
1. Is the target file a GLOBAL config (`~/.cursor/`, `~/.claude/`, `~/.codex/`, `~/.config/opencode/`)?
2. If YES → path MUST contain `~/.forgewright/mcp-server/` — never a project submodule path
3. If the path contains `/forgewright/mcp/` or any project-specific directory → **STOP, you are about to corrupt global config**

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

All 81 skills are in the `skills/` directory:

| Skill | Location |
|-------|----------|
| **Orchestrator & Meta** | |
| Orchestrator | `skills/production-grade/SKILL.md` |
| Polymath | `skills/polymath/SKILL.md` |
| Parallel Dispatch | `skills/parallel-dispatch/SKILL.md` |
| Memory Manager | `skills/memory-manager/SKILL.md` |
| Skill Maker | `skills/skill-maker/SKILL.md` |
| MCP Generator | `skills/mcp-generator/SKILL.md` — generates `.antigravity/mcp-manifest.json` for Antigravity workspace isolation |
| Token Tracker | `skills/token-tracker/SKILL.md` — tracks LLM tokens and API budgets |
| Instinct System | `skills/instinct-system/SKILL.md` — runs automatic response instinct checks |
| Strategic Compaction | `skills/strategic-compaction/SKILL.md` — manages conversation memory compaction |
| Hook Expert | `skills/generated/hook-expert/SKILL.md` — automates git hook configuration |
| **Planning** | |
| Antigravity | `antigravity/README.md` |
| **Engineering** | |
| Business Analyst | `skills/business-analyst/SKILL.md` |
| Product Manager | `skills/product-manager/SKILL.md` |
| Solution Architect | `skills/solution-architect/SKILL.md` |
| Software Engineer | `skills/software-engineer/SKILL.md` |
| Software Engineer (Go) | `skills/software-engineer-go/SKILL.md` |
| Software Engineer (Python) | `skills/software-engineer-python/SKILL.md` |
| Software Engineer (Rust) | `skills/software-engineer-rust/SKILL.md` |
| Frontend Engineer | `skills/frontend-engineer/SKILL.md` |
| Fullstack Engineer | `skills/fullstack-engineer/SKILL.md` |
| QA Engineer | `skills/qa-engineer/SKILL.md` |
| Security Engineer | `skills/security-engineer/SKILL.md` |
| Code Reviewer | `skills/code-reviewer/SKILL.md` |
| Code Reviewer (Go) | `skills/code-reviewer-go/SKILL.md` |
| Code Reviewer (Python) | `skills/code-reviewer-python/SKILL.md` |
| Code Reviewer (Rust) | `skills/code-reviewer-rust/SKILL.md` |
| Code Quality Engineer | `skills/code-quality-engineer/SKILL.md` |
| DevOps | `skills/devops/SKILL.md` |
| SRE | `skills/sre/SKILL.md` |
| Build & Release Engineer | `skills/build-release-engineer/SKILL.md` — CI/CD builds, release pipelines, EAS automation |
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
| AI Engineer | `skills/ai-engineer/SKILL.md` |
| Accessibility Engineer | `skills/accessibility-engineer/SKILL.md` |
| Performance Engineer | `skills/performance-engineer/SKILL.md` |
| UX Researcher | `skills/ux-researcher/SKILL.md` |
| Data Engineer | `skills/data-engineer/SKILL.md` |
| XLSX Engineer | `skills/xlsx-engineer/SKILL.md` |
| Project Manager | `skills/project-manager/SKILL.md` |
| Eval Engineer | `skills/eval-engineer/SKILL.md` |
| LLM Tester | `skills/llm-tester/SKILL.md` — Promptfoo-powered evaluation & red-teaming |
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
| Game Engineer | `skills/game-engineer/SKILL.md` |
| AI Behavior Engineer | `skills/ai-behavior-engineer/SKILL.md` — utility AI, behavioral trees, state machines |
| Animation Engineer | `skills/animation-engineer/SKILL.md` — interactive web/mobile animation |
| Game Accessibility Engineer | `skills/game-accessibility-engineer/SKILL.md` — game custom inputs, subtitles, UI visual helpers |
| LiveOps Engineer | `skills/liveops-engineer/SKILL.md` — events, operations, telemetry |
| Unity Engineer | `skills/unity-engineer/SKILL.md` + Unity-MCP integration |
| Unity MCP | `skills/unity-mcp/SKILL.md` — Editor automation, 100+ tools |
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
| 3D Spatial Engineer | `skills/3d-spatial-engineer/SKILL.md` |
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

This project is indexed by GitNexus as **forgewright** (17857 symbols, 23306 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

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
