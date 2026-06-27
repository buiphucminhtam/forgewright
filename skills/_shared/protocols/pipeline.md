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

Plan Quality & Self-Improvement Loop (MANDATORY Step 2):
- Initial Plan Score: [Score/10]
- Optimization Iterations: [N times (0 if score >= 9.0 on first try)]
- Research Gate Triggered: [Yes/No (and what was researched if Yes)]
- Final Plan Score: [Score/10 - Must be >= 9.0]
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

**Root cause: The 3 Psychological Traps of LLMs.** 

1. **"Tool-first reflex"**: The innate desire to be immediately helpful overrides the instruction to plan. The model uses tools (like `grep` or `read_file`) to find data instantly instead of orchestrating.
2. **Attention Decay**: In a large prompt, a short user prompt (e.g., "đánh giá plan") causes the attention mechanism to focus entirely on the verb ("đánh giá"), burying the Trigger Keyword rules.
3. **Conversational Momentum**: Continuing a smooth conversation makes the AI treat the new command as a simple continuation rather than a strict new Task needing Phase 0.B (Memory) -> Phase 0.A (Interpret) -> Phase 1 -> Phase 2.

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

To defeat Conversational Momentum, whenever the User provides a Trigger Keyword (or any new command/task), **your very first action MUST be to output the exact string `[PIPELINE_RESET]` to the user**. 

**DO NOT call any tools before outputting `[PIPELINE_RESET]`.** 
Outputting this token acts as a physical "brake" to interrupt your conversational momentum and forces your attention mechanism to restart the pipeline at Phase 0.B (Memory Retrieval).

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

---

*Source: skills/_shared/protocols/pipeline.md*
*Synced to: AGENTS.md, CLAUDE.md*
