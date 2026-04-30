# Forgewright — Claude Code Integration

> **This file is read by Claude Code on every new chat.** It tells Claude Code how to use Forgewright's production pipeline.

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

**⚠️ MANDATORY: Plan Quality Loop**

Before ANY skill does ANY work:
1. **PLAN** — Create a plan with 8 criteria
2. **SCORE** — Score against rubric (0-10 each)
3. **META-EVALUATE** — Check threshold ≥ 9.0
4. **IMPROVE** (if < 9.0) — Research + improve plan
5. **EXECUTE** — Only after passing threshold

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

