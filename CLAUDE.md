# Forgewright — Claude Code Integration

> **This file is read by Claude Code on every new chat.** It tells Claude Code how to use Forgewright's production pipeline.

## Pipeline: INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN

## Step 0 — Request Interpretation (MANDATORY)

**⚠️ DO NOT SKIP THIS STEP. EVER.**

Before ANY skill execution, interpret the user's request:

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
| `/mcp` | Generate MCP workspace isolation config — creates `.antigravity/mcp-manifest.json` for Antigravity conflict-free multi-project support |

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

**⚠️ MANDATORY RULE:**
```
Code Changed → Write Tests → Run Tests → Verify Pass → Done
     ↑                                    ↓
     ←←←←←←←← NO. ALWAYS RUN TESTS ←←←←←←
```

**Never wait for user to ask for tests. After any code change, auto-run QA.**
