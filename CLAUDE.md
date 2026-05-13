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

## Pipeline: INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN

## Step 0 — Request Interpretation (MANDATORY)

**⚠️ DO NOT SKIP THIS STEP. EVER.**

Before ANY skill execution, interpret the user's request:

### 0.5 — Load Conversation Memory (MANDATORY)

**⚠️ DO NOT SKIP THIS STEP. EVER. This prevents context loss when model hits context limit.**

Run BEFORE processing the user's request. This ensures continuity across context windows:

```
# Step 1: Load conversation summary from previous turns
IF .forgewright/subagent-context/CONVERSATION_SUMMARY.md exists:
  Read it → inject into context
  Log: "✓ Conversation summary loaded"

# Step 2: Search for relevant recent memories
IF LOCAL_MEMORY_DISABLED != true AND FORGEWRIGHT_SKIP_MEMORY != 1:
  python3 scripts/mem0-v2.py search "conversation recent" --limit 3
  python3 scripts/mem0-v2.py list --category session --limit 3
  Log: "✓ Recent turns loaded"

# Step 3: Load BA scope if exists
IF .forgewright/business-analyst/handoff/ba-package.md exists:
  Read key sections → inject scope summary
  Log: "✓ BA scope context loaded"
```

**Why mandatory?** Without this, conversation facts from Turn N are lost in Turn N+1 when context resets. The model "forgets" what was just discussed.

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

## Step 2 — Plan First, Always

**⚠️ MANDATORY: Plan Quality Loop with Research Gate**

Before ANY skill does ANY work:
1. **PLAN** — Create a plan with 8 criteria
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

## Available Skills (56 total)

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

When the user needs to set up or check MCP for a project, run:

```bash
bash <forgewright>/scripts/forgewright-mcp-setup.sh
```

**Single command does everything:**
1. Detect forgewright location (standalone, submodule, or Antigravity plugin)
2. Generate/verify MCP server
3. Create workspace manifest
4. Update global config (Claude Desktop or Cursor)
5. Verify installation

**Quick status check:**
```bash
bash scripts/forgewright-mcp-setup.sh --check
```

**Diagnose problems:**
```bash
bash scripts/forgewright-mcp-setup.sh --diagnose
```

## Self-Check

Before finishing ANY task, verify ALL of the following:

| # | Check | Action if Failed |
|---|-------|-----------------|
| 1 | ✅ Request interpreted? | Go back to Step 0 |
| 2 | ✅ Plan scored ≥ 9.0? | Improve plan first |
| 3 | ✅ Code changed? | → Run QA tests |
| 4 | ✅ Tests written? | Write tests (mandatory) |
| 5 | ✅ Tests passed? | Fix issues first |
| 6 | ✅ Scope respected? | Flag scope creep |
| 7 | ✅ User approval? | Wait for approval (if gate) |
| 8 | ✅ Turn-Close memory saved? | Save before ending turn |
| 9 | ✅ Memory Bank updated? | Update progress.md at session end |

## Session-End Ritual (NEW v8.0)

**Before closing any session, ALWAYS run:**

```
1. Update progress.md:
   - Mark completed tasks
   - Add blockers/open questions
   - Update last_updated timestamp

2. Update activeContext.md:
   - Summarize current state
   - Note next steps

3. Update session-log.json:
   - Set status to "completed" OR "interrupted"
   - Add completed_at timestamp
   - Add summary of what was done
```

**Why:** Ensures next session starts with fresh, accurate context.

**⚠️ MANDATORY RULE:**
```
Code Changed → Write Tests → Run Tests → Verify Pass → Done
     ↑                                    ↓
     ←←←←←←←← NO. ALWAYS RUN TESTS ←←←←←←
```

**Never wait for user to ask for tests. After any code change, auto-run QA.**

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
| Message count | Every N messages | Auto-checkpoint |
| Token budget | ≥ 70% context | Force checkpoint |
| File write | After code changes | Optional save |
| Long task | > 30 seconds | Context freeze |

### Usage (Manual Override)

```bash
# Start session tracking
python3 scripts/memory-middleware.py start
# or
bash scripts/memory-session.sh start

# Force checkpoint
python3 scripts/memory-middleware.py checkpoint

# Check status
python3 scripts/memory-middleware.py status

# Resume from last checkpoint
python3 scripts/memory-middleware.py resume
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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

> **RECOMMENDED:** This project uses GitNexus for code intelligence. GitNexus provides 38K+ stars, npm installation, auto-setup for all editors, and 16 MCP tools for deep code understanding.

This project is indexed by GitNexus as **forgewright** (16,112 nodes, 23,551 edges, 322 clusters, 250 flows).

## Quick Start

```bash
# Install (if not already)
npm install -g gitnexus

# Analyze/update index
gitnexus analyze

# Check status
gitnexus status
```

## Always Do (MANDATORY)

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

## MCP Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "..."})` |
| `list_repos` | List indexed repositories | `gitnexus_list_repos()` |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/forgewright/context` | Codebase overview, check index freshness |
| `gitnexus://repo/forgewright/clusters` | All functional areas |
| `gitnexus://repo/forgewright/processes` | All execution flows |
| `gitnexus://repo/forgewright/process/{name}` | Step-by-step execution trace |

## Keeping the Index Fresh

After code changes, re-index to keep the graph current:

```bash
gitnexus analyze
```

## Editor Skills (Claude Code)

When using Claude Code, these skills are auto-installed:

| Task | Skill |
|------|-------|
| Understand architecture | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius analysis | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Refactoring | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| CLI reference | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
