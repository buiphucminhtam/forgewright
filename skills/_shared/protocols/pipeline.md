# Forgewright Pipeline

<!-- source: skills/_shared/protocols/pipeline.md -->
<!-- This is the single source of truth for the Forgewright pipeline -->

**Pipeline:** `INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN`

## Pipeline Phases

| Phase | Description | Key Activities |
|-------|-------------|----------------|
| **INTERPRET** | Parse request, extract 9 dimensions | Memory retrieval, intent analysis, mode classification |
| **DEFINE** | Scope and plan | Context loading, plan generation, plan quality scoring |
| **BUILD** | Implement solution | Skill selection, skill execution, quality gate |
| **HARDEN** | Test and validate | Unit tests, integration tests, security review |
| **SHIP** | Deploy to production | CI/CD, staging deploy, production deploy |
| **SUSTAIN** | Monitor and improve | Metrics collection, bug fixes, optimization |

## Step 0 — Request Interpretation (MANDATORY)

**⚠️ DO NOT SKIP THIS STEP. EVER.**

Before ANY skill execution, interpret the user's request:

### 0.5 — Memory Retrieval (MANDATORY)

**⚠️ DO NOT SKIP THIS STEP. EVER. This is the missing retrieval loop.**

Every model call is stateless — it has no memory of previous sessions. This step restores continuity.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 0.5 — MEMORY RETRIEVAL (MANDATORY) │
├─────────────────────────────────────────────────────────────────────┤
│ │
│ Run BEFORE interpreting the user's request: │
│ │
│ 1. Extract keywords from the user's request (nouns, verbs) │
│ 2. Run: bash scripts/memory-retrieve.sh "<request>" │
│ OR: python3 scripts/mem0-v2.py search "<keywords>" --limit 3 │
│ 3. Also run: bash scripts/memory-suggest.sh "<request>" │
│ 4. If relevant memories found: │
│ → Inject as MEMORY BLOCK at top of context │
│ → Note: "Found N relevant memories from previous sessions" │
│ 5. Also load: │
│ - .forgewright/subagent-context/CONVERSATION_SUMMARY.md │
│ - .forgewright/memory-bank/activeContext.md │
│ - .forgewright/business-analyst/handoff/ba-package.md (if exists)│
│ 6. Log: "✓ Memory retrieval done — N memories loaded" │
│ │
│ Max tokens: 500 (configurable via MEM0_MAX_TOKENS) │
│ │
└─────────────────────────────────────────────────────────────────────┘
```

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

---

*Source: skills/_shared/protocols/pipeline.md*
*Synced to: AGENTS.md, CLAUDE.md*
