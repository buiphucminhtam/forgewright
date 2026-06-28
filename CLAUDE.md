# Forgewright — Claude Code Integration

> **This file is read by Claude Code on every new chat.** It tells Claude Code how to use Forgewright's production pipeline.

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

## ⚠️ MANDATORY INSTALLATION: SUBMODULE ONLY

**Forgewright MUST always be installed as a git submodule (in the `forgewright/` directory) for any project using it.**
- **Why**: Ensures version consistency across team members, supports project-specific custom skills, and is strictly required for executing local Git Hooks (pre-commit/post-commit) dynamically.
- **Action**: Never rely solely on global MCP server setups for production or team repositories. Always run `/setup` (or `git submodule add`) to initialize Forgewright locally.

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
   ```

   This single command sets up Forgewright MCP for **ALL four platforms simultaneously**:
   - **Cursor**: `~/.cursor/mcp.json`
   - **Claude Code**: `~/.claude/settings.json` (mcpServers key)
   - **Antigravity**: MCP workspace isolation via `~/.cursor/projects/<hash>/mcps/`
   - **OpenAI Codex CLI**: `~/.codex/config.toml` (TOML format)

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

## ⚠️ MANDATORY RULE: MERMAID FOR ALL SEQUENCE DIAGRAMS

All sequence diagrams generated or requested in this repository (in documents, design files, pull requests, or AI chat responses) **MUST** be written in Mermaid.js syntax using the ` ```mermaid ` code block.
- **NEVER** output raw text art, ASCII tables, or other text-based custom representations for sequence flows.
- **ALWAYS** wrap participant labels in double quotes `""` to support special characters (like parenthesis and slashes, e.g. `participant A as "A (path/to/file.ts)"`).

## ⚠️ MANDATORY RULE: CONDITIONAL GITNEXUS & SEQUENCE UPDATE
If changes modify logic files (e.g. `.ts`, `.py`, `.js`, `.cs`, `.gd`, `.go`, `.rs`, etc. under `src/`, `mcp/`, or `scripts/` excluding tests), you MUST run `gitnexus analyze` and `npx tsx scripts/generate-sequence.ts` to keep the code index and sequence flow diagrams updated.

<!-- NOTE: Evidence-First section is duplicated in AGENTS.md (for Antigravity).
     Source of truth: CLAUDE.md. Changes here must be mirrored to AGENTS.md manually. -->

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
<!-- source: skills/_shared/protocols/pipeline.md -->
## Pipeline: INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN

<!-- source: skills/_shared/protocols/pipeline.md -->
## Step 0 — Request Interpretation (MANDATORY)

**⚠️ DO NOT SKIP THIS STEP. EVER.**

Before ANY skill execution, interpret the user's request:

### 0.5 — Memory Retrieval (MANDATORY)

**⚠️ DO NOT SKIP THIS STEP. EVER. This is the missing retrieval loop.**

Every model call is stateless — it has no memory of previous sessions. This step restores continuity.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 0.5 — MEMORY RETRIEVAL (MANDATORY)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Run BEFORE interpreting the user's request:                        │
│                                                                      │
│  1. Extract keywords from the user's request (nouns, verbs)        │
│  2. Run: bash scripts/memory-retrieve.sh "<request>"              │
│     OR: python3 scripts/mem0-v2.py search "<keywords>" --limit 3 │
│  3. Also run: bash scripts/memory-suggest.sh "<request>"        │
│  4. If relevant memories found:                                    │
│     → Inject as MEMORY BLOCK at top of context                    │
│     → Note: "Found N relevant memories from previous sessions"     │
│  5. Also load:                                                    │
│     - .forgewright/subagent-context/CONVERSATION_SUMMARY.md       │
│     - .forgewright/memory-bank/activeContext.md                   │
│     - .forgewright/business-analyst/handoff/ba-package.md (if exists)│
│  6. Log: "✓ Memory retrieval done — N memories loaded"             │
│                                                                      │
│  Max tokens: 500 (configurable via MEM0_MAX_TOKENS)               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Evidence-first note:** Every assumption about project history should be verified against mem0 before acting. If mem0 has a memory about a previous decision, cite it. If it contradicts the assumption, update the assumption.

**Token budget:** Max 500 tokens for memory injection.

### 1. Extract 9 Dimensions

| Dimension | What to Find | Always Required? |
|-----------|-------------|----------------|
| **Task** | What they actually want done | Yes |
| **Target tool** | Forgewright pipeline mode | Auto-detect |
| **Output format** | What they expect to receive | Yes |
| **Constraints** | Explicit limits (scale, budget, team) | If mentioned |
| **Input** | What they're providing (files, specs, URLs) | If applicable |
| **Context** | Prior decisions, project state, existing code | If session has history |
| **Audience** | Who uses the output | If user-facing |
| **Success criteria** | How they know it's done | Derive if not stated |
| **Examples** | Reference systems, things they like | If mentioned |

### 2. Scan for Vague Patterns (Credit-Killing Patterns)

| Pattern | Detection | Fix |
|---------|-----------|-----|
| Vague verb | "help me", "make it", "do something" | Ask for specifics |
| Two tasks in one | "explain AND rewrite" | Ask priority |
| No success criteria | "make it better" | Derive pass/fail |
| Emotional description | "it's broken", "so annoying" | Extract technical fault |
| Assumed knowledge | "continue", "as before" | Inject Memory Block |
| No scope boundary | "build an app" | Ask what's in/out |
| No file path | "update login" | Ask for location |

### 3. Clarification Rules

- **MAX 3 clarifying questions** — pick the 3 most critical
- **If HIGH confidence**: Skip clarification, generate structured request
- **If MEDIUM/LOW confidence**: Ask before proceeding
- **NEVER start executing** if request is unclear
- **Use defaults** for everything else (don't over-ask)

### 4. Generate Structured Request

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 INTERPRETED REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mode: [detected]
Confidence: [HIGH/MEDIUM/LOW]

Intent: "[original message quoted]"

What you want:
  [1-sentence clear description]

Key decisions made:
  [Defaults applied with reasoning]

Scope:
  ✓ [In scope]
  ✗ [Out of scope]

Success criteria:
  [How we know it's done]

Missing (will be handled by PM):
  [Max 3 items]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## ⚠️ ENFORCEMENT: If Request is Unclear, STOP and Ask

The following requests **MUST** trigger clarification:
- Contains vague verbs: "help me", "make it", "do something", "fix it"
- No specific scope: "build an app", "add a feature", "update the system"
- Two or more tasks in one: "explain AND build", "fix AND test"
- No success criteria: "make it better", "improve it"
- No file/location specified: "update login", "add auth"

## ⚠️ PIPELINE SKIP DETECTION — Anti-Pattern

**Root cause: Tool-first reflex.** The model reads files before running Step 0, classifying, and planning. This causes hallucination, wrong scope, and missed memory context.

### Common Violations

| # | Violation | What should happen |
|---|-----------|---------------------|
| 1 | User asks → I read files → I answer directly | User asks → Step 0.5 → Step 0 → Step 1 → Step 2 → Execute |
| 2 | "I know this already, let me just..." | Step 0.5 Memory Retrieval FIRST |
| 3 | "Simple task, no need for pipeline" | EVERY task needs Step 0 |
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

To defeat Conversational Momentum, whenever the User provides a Trigger Keyword
(or any new command/task), **your very first action MUST be to output the exact
string `[PIPELINE_RESET]` to the user**.

**DO NOT call any tools before outputting `[PIPELINE_RESET]`.**

Source of truth: `skills/_shared/protocols/pipeline-activation.md`.

### How to Detect You've Skipped Pipeline

**Self-check BEFORE answering any user request:**

```
1. Did I run bash scripts/memory-retrieve.sh or python3 scripts/mem0-v2.py?
   └─ NO → STOP. Run Step 0.5 first.

2. Did I read skills/production-grade/SKILL.md and extract 9 dimensions?
   └─ NO → STOP. Run Step 0 first.

3. Did I classify the mode (Feature, Architect, etc.)?
   └─ NO → STOP. Run Step 1 first.

4. Did I create a plan and score it >= 9.0?
   └─ NO → STOP. Run Step 2 first.

5. Did I execute via skills, not directly?
   └─ NO → STOP. Delegate or execute via skills.
```

### Escalation Protocol

If you realize mid-turn that you skipped the pipeline:

```
1. STOP current execution immediately
2. Acknowledge: "I violated the Forgewright pipeline — correcting now."
3. Run Step 0.5 + Step 0 retroactively
4. Re-classify + Re-plan
5. Continue or restart from correct step
6. Log the lesson: Append to skills/_shared/protocols/pipeline.md as anti-pattern
```

### Enforcement Rule

> **⚠️ MANDATORY: Before answering ANY user request, verify:**
> - [ ] Memory retrieval ran (or confirmed no relevant memories exist)
> - [ ] Step 0 interpretation done (9 dimensions extracted)
> - [ ] Mode classified (one of 24 modes)
> - [ ] Plan created + scored >= 9.0
> - [ ] Execution via skills (not direct code changes)
>
> If ANY checkbox is empty → STOP → Fill it → Then proceed.

## Step 1 — Mode Classification

After interpretation, classify into one of 24 modes:

| Mode | Trigger Signals |
|------|----------------|
| **Full Build** | "build a SaaS", "from scratch", "full stack", greenfield |
| **Feature** | "add [feature]", "implement", "new endpoint" |
| **Harden** | "review", "audit", "secure", "harden" |
| **Ship** | "deploy", "CI/CD", "docker", "terraform" |
| **Debug** | "bug", "broken", "crash", "error", "not working" |
| **Test** | "write tests", "test coverage", "add tests" |
| **Review** | "review my code", "code quality" |
| **Architect** | "design", "architecture", "API design" |
| **Document** | "document", "write docs", "README" |
| **Explore** | "explain", "how does", "help me think" |
| **Research** | "research", "deep research", "find sources" |
| **Optimize** | "performance", "slow", "optimize", "scale" |
| **Design** | "design UI", "wireframes", "design system" |
| **Mobile** | "mobile app", "iOS", "Android", "React Native" |
| **Game Build** | "game", "Unity", "Unreal", "Godot", "Roblox" |
| **XR Build** | "VR", "AR", "MR", "XR", "Quest" |
| **Marketing** | "marketing", "SEO", "launch strategy" |
| **Grow** | "growth", "CRO", "conversion", "A/B test" |
| **Analyze** | "analyze requirements", "evaluate this" |
| **AI Build** | "AI feature", "chatbot", "RAG", "LLM" |
| **Migrate** | "migrate", "upgrade", "database change" |
| **Prompt** | "improve prompts", "prompt engineering" |
| **Custom** | Doesn't fit above |

<!-- source: skills/_shared/protocols/plan-quality-loop.md -->
## Step 2 — Plan First, Always

**⚠️ MANDATORY: Plan Quality Loop with Research Gate**

Before ANY skill does ANY work:
1. **PLAN** — Create a plan with 9 criteria
2. **SCORE** — Score against rubric (0-10 each)
3. **META-EVALUATE** — Check threshold ≥ 9.0
4. **IMPROVE** (if < 9.0) — Research → Improve skill → Re-plan
5. **EXECUTE** — Only after passing threshold

**Enhanced Research Flow (NEW):**

```
┌─────────────────────────────────────────────────────────────────────┐
│              RESEARCH GATE (when score < 9.0)                      │
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
│  2. FALLBACK to Web Search (always available):                     │
│     WebSearch: "best practices [topic]"                            │
│     WebSearch: "[framework] [pattern] implementation"               │
│                                                                     │
│  3. SYNTHESIZE: Extract 1-3 actionable insights                   │
│     ✓ "Auth pattern: JWT + refresh token rotation"                 │
│     ✗ "Found 15 articles about auth"                              │
│                                                                     │
│  4. UPDATE session tracker:                                         │
│     bash scripts/forgewright-session-tracker.sh plan <score>        │
│     bash scripts/forgewright-session-tracker.sh check               │
│     └─ If ≥2 consecutive failures → Research Gate MANDATORY        │
│                                                                     │
│  5. RE-PLAN with new insights                                      │
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

Max 3 iterations. No skill may skip this.

## ⚠️ Execution Blocker Loop (NEW)

**ANY time you get stuck during implementation:**

```
1. ASSESS → Categorize blocker (Technical/Architectural/Tooling/External/Unknown)
2. RESEARCH → Search web, codebase, Forgewright skills, docs
3. SYNTHESIZE → Extract key insight (NOT: "found 10 articles", YES: "the pattern is X")
4. ATTEMPT → Apply solution
5. VERIFY → Did it work?
   ├─ YES → ✅ Continue, log lesson to SKILL.md
   └─ NO → IMPROVE SKILL → Retry (max 3 cycles)
```

**⚠️ NEVER give up after 1 failed attempt. ALWAYS research first.**

**Blocker Types:**
| Type | Research Priority |
|------|------------------|
| Technical | Web search → Docs |
| Architectural | Forgewright skills → Docs |
| Tooling | Protocols → Web |
| External | Web search → Alternatives |

**After solving:** Append lesson to relevant SKILL.md for future reference.

## Large Feature Planning (Antigravity)

For features with 3+ components, create planning structure BEFORE starting:

```
antigravity/
└── planning/
 └── [feature-name]/
     ├── PLAN.md          # Main planning document
     ├── SCOPE.md         # Scope definition
     ├── ARCHITECTURE.md  # Technical architecture
     └── TASKS.md         # Task breakdown
```

## Quick Reference

| User Says | Mode | What Happens |
|-----------|------|-------------|
| "Build a SaaS..." | Full Build | All skills, 6 phases, 3 gates |
| "Add [feature]..." | Feature | PM → Architect → BE/FE → QA |
| "Review my code" | Review | Code Reviewer only |
| "Write tests" | Test | QA Engineer only |
| "Deploy / CI/CD" | Ship | DevOps → SRE |
| "Bug / fix" | Debug | Debugger → Engineer |
| "Design architecture" | Architect | Solution Architect |
| "Research..." | Research | NotebookLM + Polymath |
| "Game with Unity..." | Game Build | Game Designer → Engine → Level → Audio + `docs/unity-project-quickstart.md` |
| "Build VR app..." | XR Build | XR Engineer |
| "Mobile app" | Mobile | Mobile Engineer |
| "improve prompts" | Prompt | Prompt Engineer + chat-interpreter |
| "Run autonomous tests" | Autonomous | Autonomous Testing + Self-Healing E2E |
| "Set goal: ..." | Goal | Goal-Driven: autonomous until condition met |

## Available Skills (57 total)

See `skills/` directory for full list:
- **Orchestrator**: `skills/production-grade/SKILL.md`
- **Engineering**: Business Analyst, PM, Architect, Software/FE/BE Engineer, QA, Security
- **Game Dev**: Unity/Unreal/Godot/Roblox Engineer, Level/Narrative/TechArt/Audio
- **AI/ML**: AI Engineer, Prompt Engineer, Data Scientist, NotebookLM Researcher
- **DevOps**: DevOps, SRE, Database Engineer, Performance Engineer
- **Meta**: Polymath, Parallel Dispatch, Memory Manager, Skill Maker

## Workflow Shortcuts

| Command | What it does |
|---------|--------------|
| `/setup` | First-time setup as git submodule |
| `/update` | Check for and install updates |
| `/pipeline` | Show full pipeline reference |
| `/onboard` | Deep project analysis (includes MCP setup) |
| `/mcp` | Generate or check MCP setup — runs `forgewright-mcp-setup.sh` |
| `/setup-mcp` | One-command MCP setup for this project |

## MCP Setup (Level 4)

### Universal MCP Setup — One Server, All Platforms

**The canonical MCP server lives at:** `~/.forgewright/mcp-server/src/index.ts`

**The setup script (`forgewright-mcp-setup.sh`) configures ALL platforms to reference this single canonical server:**

| Platform | Config File | What gets updated |
|----------|-------------|-------------------|
| **Cursor** | `~/.cursor/mcp.json` | `forgewright` + `gitnexus` entries |
| **Claude Code** | `~/.claude/settings.json` | `mcpServers.forgewright` + `mcpServers.gitnexus` |
| **Antigravity** | `~/.cursor/projects/<hash>/mcps/` | MCP workspace isolation |
| **OpenAI Codex** | `~/.codex/config.toml` | `forgewright` + `gitnexus` (TOML) |
| **OpenCode** | `~/.config/opencode/config.json` | `mcpServers.forgewright` + `mcpServers.gitnexus` |

**Why this works:** All platforms use `npx tsx` with the same absolute path to the canonical server. The server auto-detects workspace from `FORGEWRIGHT_WORKSPACE` env var or git root, so it works correctly from any project.

**Setup commands:**
```bash
# Setup all platforms at once
bash scripts/forgewright-mcp-setup.sh

# Individual platforms
bash scripts/forgewright-mcp-setup.sh --cursor       # Cursor only
bash scripts/forgewright-mcp-setup.sh --claude-code  # Claude Code only
bash scripts/forgewright-mcp-setup.sh --antigravity  # Antigravity only
bash scripts/forgewright-mcp-setup.sh --check        # Status check
bash scripts/forgewright-mcp-setup.sh --diagnose     # Full diagnostics
```

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

**Self-check before any MCP config write:**
1. Is the target file a GLOBAL config (`~/.cursor/`, `~/.claude/`, `~/.codex/`, `~/.config/opencode/`)?
2. If YES → path MUST contain `~/.forgewright/mcp-server/` — never a project submodule path
3. If the path contains `/forgewright/mcp/` or any project-specific directory → **STOP, you are about to corrupt global config**

<!-- source: skills/_shared/protocols/self-check.md -->
## Self-Check

Before finishing ANY task, verify ALL of the following:

| # | Check | Action if Failed |
|---|-------|-----------------|
| 0 | ✅ IntentGate analysis done? | If mode reclassified, note Intent vs Literal shift |
| 1 | ✅ Request interpreted? | Go back to Step 0 |
| 2 | ✅ Plan scored ≥ 9.0? | Improve plan first |
| 3 | ✅ Assumptions declared? | Write verification artifacts for each assumption |
| 4 | ✅ Verification artifacts run? | Run artifacts → get pass/fail evidence before proceeding |
| 5 | ✅ Test cases prepared? | For medium/large features, write test cases/stubs first |
| 6 | ✅ Code changed? | Implement code to satisfy requirements & test cases |
| 7 | ✅ Tests run & verified? | Run QA tests to verify 100% pass |
| 8 | ✅ Scope respected? | Flag scope creep |
| 9 | ✅ User approval? | Wait for approval (if gate) |
| 10 | ✅ Turn-Close memory saved? | Save before ending turn |
| 11 | ✅ Memory Bank updated? | Update progress.md at session end |
| 12 | ✅ Skill self-improved? | Run lesson migrator → check if skills evolved |

## Session-End Ritual (NEW v8.2)

**Before closing any session, ALWAYS run:**

```
1. Update progress.md:
   - Mark completed tasks
   - Add blockers/open questions
   - Update last_updated timestamp

2. Update session state (automated):
   python3 scripts/memory-middleware.py session-log end "[summary]"
   # → Sets status to "completed"
   # → Adds completed_at timestamp
   # → Updates activeContext.md automatically

3. Generate handover if needed:
   python3 scripts/memory-middleware.py handover
   # → Creates HANDOVER.md for next session
   # → Includes goals, tasks, blockers, next steps

4. Migrate lessons to skill files + skill update check:
   bash scripts/forgewright-lesson-migrator.sh migrate

   # For every failed assumption this session:
   # a. Was it a test/script failure? → execution lesson
   # b. Was it a plan failure? → planning lesson
   # c. Was research done? → append to relevant SKILL.md
   #    - Plan failed → SKILL.md → Planning Improvements
   #    - Execution failed → SKILL.md → Execution Learnings

   # Check: any new planning improvements in SKILL.md files?
   # Log to .forgewright/asip-metrics.json:
   #   sessionsWithEvolution += 1 (if any new entries added)

5. Sync documentation with llm_wiki:
   bash scripts/forgewright-wiki-sync.sh
```

**SAVE/Resume Commands:**

| Command | Purpose |
|---------|---------|
| `python3 scripts/memory-middleware.py session-log create` | Initialize session-log.json |
| `python3 scripts/memory-middleware.py session-log start <mode> <request>` | Start new session |
| `python3 scripts/memory-middleware.py session-log task <id> <status> <summary>` | Track tasks |
| `python3 scripts/memory-middleware.py session-log end [summary]` | End session |
| `python3 scripts/memory-middleware.py handover` | Generate handover doc |
| `python3 scripts/memory-middleware.py status` | Show full status |

**Why:** Each failed assumption is now a verified test/script failure. The migrator preserves these as lessons. Over time, every project makes the skills smarter — the system learns from every mistake, not just the current one.

**⚠️ MANDATORY RULE:**
```
For Complex Tasks: Given/When/Then (BA) → Write Tests/Stubs (QA) → Code (Dev) → Run Tests → Pass ✓
For Simple Tasks:  Code (Dev) → Write & Run Tests (QA) → Pass ✓
```

**Never wait for user to ask for tests. Apply complexity-based hybrid testing flow.**

## Memory Middleware (Cross-IDE, Auto-Save)

**⚠️ Memory checkpoints are automatic. No manual action needed.**

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  MEMORY MIDDLEWARE (Cross-IDE)                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐  │
│  │ Claude Code │    │    Cursor    │    │      VS Code        │  │
│  │   Hooks    │    │    MCP       │    │    Remote SSH       │  │
│  └──────┬──────┘    └──────┬───────┘    └──────────┬──────────┘  │
│         │                   │                        │              │
│         └───────────────────┼────────────────────────┘              │
│                             ▼                                       │
│              ┌──────────────────────────┐                          │
│              │   memory-middleware.py   │                          │
│              │   (or memory-session.sh)  │                          │
│              └─────────────┬────────────┘                          │
│                            │                                       │
│         ┌──────────────────┼──────────────────┐                    │
│         ▼                  ▼                  ▼                    │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐             │
│  │ Session DB  │   │  mem0-v2    │   │  CONVERSATION│             │
│  │ JSON        │   │  SQLite     │   │  _SUMMARY.md │             │
│  └─────────────┘   └─────────────┘   └─────────────┘             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Automatic Triggers

Memory checkpoint runs automatically when:

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Message count | Every N messages (default: 3) | Auto-checkpoint |
| Token budget | ≥ 80% context | Log warning, suggest checkpoint |
| Token budget | ≥ 95% context | Auto-generate handover + checkpoint |
| File write | After code changes | Optional save |
| Long task | > 30 seconds | Context freeze |

**Token Thresholds (v8.2):**

```bash
# Warning threshold (80%) - suggest checkpoint
MEMORY_TOKEN_THRESHOLD_WARN=80  # default

# Critical threshold (95%) - auto-handover
MEMORY_TOKEN_THRESHOLD_CRITICAL=95  # default
```

### Usage (Manual Override)

```bash
# Start session tracking
python3 scripts/memory-middleware.py start

# Force checkpoint
python3 scripts/memory-middleware.py checkpoint

# Check status (shows session-log.json + token thresholds)
python3 scripts/memory-middleware.py status

# Resume from last checkpoint
python3 scripts/memory-middleware.py resume

# Generate handover document
python3 scripts/memory-middleware.py handover

# Manage session-log.json
python3 scripts/memory-middleware.py session-log create
python3 scripts/memory-middleware.py session-log start <mode> <request>
python3 scripts/memory-middleware.py session-log task <id> <status> <summary>
python3 scripts/memory-middleware.py session-log end [summary]
```

### IDE Integration

**Claude Code:**
Add to `.claude/hooks.yml` or global config:
```yaml
post_tool_use:
  - name: memory-tick
    command: python3 scripts/memory-middleware.py tick
```

**Cursor/Custom Runtime:**
Import `memory-middleware.py` as module and call hooks programmatically.

### Step 0.5 — Memory Retrieval

When context resets (overflow), these are auto-loaded:

```
1. .forgewright/subagent-context/CONVERSATION_SUMMARY.md
2. ~/.forgewright/sessions/current-session.json
3. mem0-v2.py search "session recent" --limit 5
```

**Token budget:** Max 500 tokens for memory injection.

### Step 0.6 — Session Health Check

**⚠️ NEW (v8.0) — Prevents stale session data from causing wrong decisions.**

```
1. Check session-log.json:
   IF exists AND status == "in_progress" AND last_update > 24h:
     Log: "⚠️ Stale session detected — updating to interrupted"
     Update status to "interrupted"
     Add last_update timestamp
     Update interrupted_reason: "Session health check - stale data detected"

2. Check Memory Bank freshness:
   IF .forgewright/memory-bank/progress.md exists:
     Read last_updated from header
     IF last_updated > 7 days:
       Log: "⚠️ Memory Bank may be stale — update at session end"
```

**Why:** Stale session data causes wrong resume decisions. This check ensures every session starts fresh.

### Token Monitoring (NEW v8.0)

**Context window management based on research — trigger compaction at 80%.**

```
1. Monitor token usage during long sessions
2. At ~80% context:
   - Log: "⧖ Context at 80% — triggering compaction"
   - Trigger memory-middleware.py checkpoint
   - Generate session summary

3. At ~95% context:
   - Log: "⚠️ Context critical — session may need handover"
   - Offer Handover Procedure
```

**Why:** Prevents context rot and abrupt information loss.

### Handover Procedure (NEW v8.0)

**When context hits limits, use this procedure:**

```
1. Generate handover document:
   - Write to .forgewright/memory-bank/handover-[date].md
   - Include: goals, what was done, key decisions, blockers, next steps

2. Start fresh session:
   - Upload only handover document + project brief
   - Clear context window

3. Resume from handover:
   - Read handover document
   - Continue from where previous session stopped
```

**Inspired by:** SWE-Pruner pattern, Session Handoff pattern from NotebookLM research.

## Goal-Driven Workflow (v8.2)

> **Set it and forget it.** Inspired by Codex `/goal` and Claude Code `/goal`.

When you want Forgewright to work continuously toward a goal without prompting at each step:

```
User: "Set goal: Migrate auth to JWT until all tests pass"
Forgewright: "✓ Goal set. Working toward: Migrate auth to JWT until all tests pass"
→ (works continuously)
→ (evaluates after each turn)
→ (continues until condition met)
```

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│  GOAL-DRIVEN WORKFLOW                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User sets goal with completion condition                       │
│  2. Forgewright enters autonomous mode                            │
│  3. After each turn:                                              │
│     a. Evaluate: Is the condition met?                             │
│     b. If NO: Continue to next turn (no user prompt needed)        │
│     c. If YES: Report completion, exit autonomous mode            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Handling unknowns during autonomous execution:**

When encountering an assumption with no evidence during autonomous mode:
```
Unknown encountered
  ↓
WRITE: verification artifact (test/script)
RUN
  ├── PASS → assumption confirmed → continue autonomously
  └── FAIL → assumption wrong → RESEARCH → REPLAN → new artifact → verify
               ↑
               Only path that could yield a user prompt:
               "Cannot write verification artifact" → PAUSED state
               → report blocker → wait for user guidance
```
This preserves full autonomy — user is only interrupted when no artifact can be written (pure preference/taste cases).

### Goal Commands

| Command | What it does |
|---------|--------------|
| `/goal [condition]` | Set a goal and start working |
| `/goal status` | Check current goal progress |
| `/goal clear` | Cancel the active goal |

### Example Goals

| Goal | Condition |
|------|-----------|
| `/goal All tests pass` | Verifies via `npm test` or `pytest` |
| `/goal Implement auth until all acceptance criteria met` | Checks against criteria file |
| `/goal Migrate database until migrations run successfully` | Runs migration scripts |
| `/goal Build succeeds and lint is clean` | Runs `npm run build` + `npm run lint` |

### Configuration

In `.production-grade.yaml`:

```yaml
goal:
  auto_mode: true      # Approve tool calls automatically
  max_turns: 50        # Safety limit (0 = unlimited)
  evaluator:
    model: "haiku"     # Smaller model for faster evaluation
```

### For Skills

When running in goal mode, skills should:
1. Emit progress to `.forgewright/goal-progress.md`
2. Log what was done so evaluator can check
3. Make outputs verifiable (test results, file counts, build status)

### Resume Support

Goals survive context resets:
- Load `active-goal.json` on session resume
- Continue from where left off
- User does NOT need to re-explain the goal

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

<!-- mcp:start -->
# MCP Setup — Canonical Server Rule

## CRITICAL: One Canonical MCP Server, All Platforms

**Forgewright maintains exactly ONE canonical MCP server at:**
```
~/.forgewright/mcp-server/server.ts
```

**ALL global configs (Cursor, Claude Code) MUST point to this path — NEVER to a submodule path.**

| Platform | Config | Path Written |
|----------|--------|--------------|
| Cursor | `~/.cursor/mcp.json` | `~/.forgewright/mcp-server/server.ts` |
| Claude Code | `~/.claude/settings.json` | `~/.forgewright/mcp-server/server.ts` |

**Why:** The global MCP config is the single source of truth shared across ALL projects. If a submodule's setup script writes its own path (e.g., `/project/submodule/forgewright/...`) into the global config, it breaks every other project.

**The rule:**
- **NEVER** write a submodule Forgewright path into `~/.cursor/mcp.json` or `~/.claude/settings.json`
- **ALWAYS** run `forgewright-mcp-setup.sh` from the canonical Forgewright installation to update global configs
- Submodule projects generate a `.antigravity/mcp-manifest.json` that describes the project context — but the server they use is always `~/.forgewright/mcp-server/`

**Setup command:**
```bash
bash /Users/buiphucminhtam/GitHub/forgewright/scripts/forgewright-mcp-setup.sh
```

**Quick check:**
```bash
bash /Users/buiphucminhtam/GitHub/forgewright/scripts/forgewright-mcp-setup.sh --check
```

<!-- mcp:end -->
