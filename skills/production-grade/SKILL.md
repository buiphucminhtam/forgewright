---
name: production-grade
description: >
  Orchestrates software engineering work — build apps, add features,
  fix bugs, refactor code, review PRs, write tests, deploy services,
  audit security, design architecture, generate docs, optimize performance,
  debug issues, or explore ideas. Any coding or development request gets
  routed to the right specialized skills automatically.
---

# Production Grade

!`git status 2>/dev/null || echo "No git repo detected"`
!`cat CLAUDE.md 2>/dev/null || echo "No CLAUDE.md found"`
!`ls .forgewright/ 2>/dev/null || echo "No existing workspace"`
!`cat .production-grade.yaml 2>/dev/null || echo "No config file — defaults apply"`

## Overview

Adaptive meta-skill orchestrator for all software engineering work. Analyzes the user's request, identifies which skills are needed, builds a minimal task graph, and executes — from a single code review to a full 17-skill greenfield build.

**55 skills, one orchestrator.** The orchestrator routes to the right skills based on what the user actually needs. No forced full-pipeline execution for everyday tasks.

**All skills are bundled in this plugin. Single install, everything included.**

### Middleware Chain (v8.0 — DeerFlow Pattern)

Every skill invocation is wrapped by an ordered middleware chain. Implementation details are in `skills/production-grade/middleware/`:

```
Pre-Skill:  ① SessionData → ② ContextLoader → ③ SkillRegistry → ④ Guardrail → ⑤ Summarization
            ═══ SKILL EXECUTION ═══
Post-Skill: ⑥ QualityGate → ⑦ BrownfieldSafety → ⑧ TaskTracking → ⑨ Memory → ⑩ GracefulFailure → ⑪ CircuitBreaker → ⑫ Bulkhead → ⑬ Verification
```

| # | Middleware | File | Hook | Purpose |
|---|-----------|------|------|---------|
| ① | SessionData | `middleware/01-session-data.md` | before_skill | Load profile, session state |
| ② | ContextLoader | `middleware/02-context-loader.md` | before_skill | Load memory, conventions |
| ③b| DryRunContext | `skills/_shared/protocols/dryrun-interceptor.md` | before_skill | Dry-run mode system prompt injection |
| ③ | SkillRegistry | `middleware/03-skill-registry.md` | before_skill | Progressive skill loading |
| ④ | Guardrail | `middleware/04-guardrail.md` | before_tool | Pre-tool authorization |
| ⑤ | Summarization | `middleware/05-summarization.md` | before_skill | Context compression |
| ⑥ | QualityGate | `middleware/06-quality-gate.md` | after_skill | Post-skill validation |
| ⑦ | BrownfieldSafety | `middleware/07-brownfield-safety.md` | after_skill | Regression + protected paths |
| ⑧ | TaskTracking | `middleware/08-task-tracking.md` | after_skill | Update todos, emit events |
| ⑨ | Memory | `middleware/09-memory.md` | after_skill + turn_close | Persistent fact extraction |
| ⑩ | GracefulFailure | `middleware/10-graceful-failure.md` | on_error | Retry logic, stuck detection |
| ⑪ | CircuitBreaker | `skills/_shared/protocols/circuit-breaker.md` | after_skill | Fault isolation + state machine |
| ⑫ | Bulkhead | `skills/_shared/protocols/bulkhead.md` | after_skill | Resource limits per worker type |
| ⑬ | Verification | `skills/_shared/protocols/verification.md` | after_skill | Contract + criteria check |
**Middleware protocol:** `skills/_shared/protocols/middleware-chain.md`

### Progressive Skill Loading (v8.0 — DeerFlow Pattern)

Skills are loaded on-demand based on classified mode. Read `.forgewright/skills-config.json` for the mode→skill mapping.

```
Instead of loading all 52 skill descriptions (~66KB), only load skills relevant to the mode:
  Review mode  → loads 1 skill  (~3KB)
  Feature mode → loads 5 skills (~15KB)
  Full Build   → loads 10 skills (~30KB)
  Fallback     → load all skills (classification failure)
```

## When to Use

- Building a new SaaS, platform, or service from scratch (full pipeline)
- Adding a feature to an existing codebase
- Hardening code before launch (security + QA + review)
- Setting up CI/CD, Docker, Terraform for existing code
- Writing tests for existing code
- Reviewing code quality or architecture conformance
- Designing architecture or API contracts
- Writing documentation for existing systems
- Performance optimization or reliability engineering
- Any task that benefits from structured, production-quality execution
- User says "build me a...", "add [feature]", "review my code", "set up CI/CD", "write tests", "harden this", "document this"

## Request Classification

Before any execution, classify the user's request into a mode. This determines which skills run and how.

### Paperclip Detection (Optional)

Before classifying, check if this session is managed by [Paperclip](https://github.com/paperclipai/paperclip):

```
Paperclip indicators: ticket reference (#42, CLIP-, [paperclip]),
heartbeat context, budget mention, agent identity
```

If detected:
1. Read `skills/_shared/protocols/paperclip-integration.md`
2. Switch to **Express** engagement mode (fully autonomous)
3. Apply ticket scope discipline (stay within assigned task)
4. Use structured output format for Paperclip consumption
5. Apply cost-awareness rules

If not detected → proceed normally (no changes).

## Step 0 — Request Interpretation (MANDATORY)

**⚠️ DO NOT SKIP THIS STEP. EVER.**

Before ANY skill execution, interpret the user's request:

1. **Extract 9 dimensions** (from chat-interpreter):
   - Task: What they actually want
   - Target tool: Forgewright mode
   - Output format: What they expect
   - Constraints: Explicit limits
   - Input: What they're providing
   - Context: Prior decisions, project state
   - Audience: Who uses output
   - Success criteria: How they know it's done
   - Examples: Reference systems

2. **Scan for vague patterns** (from credit-killing patterns):
   - Vague verb ("help me", "make it", "do something") → ask specifics
   - Two tasks in one → ask priority
   - No success criteria → derive and confirm
   - Emotional description → extract technical fault
   - Assumed knowledge → inject context
   - No project context → pull from project-profile.json
   - No scope boundary → ask what's in/out
   - No file path → ask for location

3. **Clarification Rules:**
   - **MAX 3 clarifying questions** — pick the 3 most critical
   - **If HIGH confidence**: Skip clarification, generate structured request
   - **If MEDIUM/LOW confidence**: Ask before proceeding
   - **NEVER start executing** if request is unclear
   - **Use defaults** for everything else (don't over-ask)

4. **Generate Structured Request:**
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

**Step 1 — Analyze the request:**

Read `.forgewright/subagent-context/INTERPRETED_REQUEST.md` (from chat-interpreter Step -1) for the authoritative request analysis. The chat-interpreter has already performed 9-dimension extraction and mode detection.

If `confidence: HIGH` → use the detected mode directly, skip the classification table.
If `confidence: MEDIUM` → present 2 most likely modes to the user.
If `confidence: LOW` → present 3 most likely modes to the user.

**⚠️ ENFORCEMENT: If request is unclear, STOP and ask. DO NOT start executing.**

The following requests MUST trigger clarification:
- Contains vague verbs: "help me", "make it", "do something", "fix it"
- No specific scope: "build an app", "add a feature", "update the system"
- Two or more tasks in one: "explain AND build", "fix AND test"
- No success criteria: "make it better", "improve it"
- No file/location specified: "update login", "add auth"

Override the detected mode only if the user's intent clearly differs from what was interpreted. Otherwise, trust the chat-interpreter's analysis.

| Mode | Trigger Signals | Skills Involved |
|------|----------------|-----------------|
| **Full Build** | "build a SaaS", "production grade", "from scratch", "full stack", greenfield intent | All skills, full DEFINE→BUILD→HARDEN→SHIP→SUSTAIN→GROW pipeline |
| **Feature** | "add [feature]", "implement [feature]", "new endpoint", "new page", "integrate [service]" | BA (if gaps detected) → PM (scoped) → Architect (scoped) → BE/FE → QA |
| **Harden** | "review", "audit", "secure", "harden", "before launch", "production ready" (on EXISTING code) | Security + QA + Code Review (sequential) → Remediation |
| **Ship** | "deploy", "CI/CD", "containerize", "infrastructure", "terraform", "docker" | DevOps → SRE |
| **Debug** | "debug", "fix bug", "broken", "investigate", "not working", "error", "trace", "crashes" | Debugger (→ Software/Frontend Engineer for fix) |
| **AI Build** | "AI feature", "chatbot", "RAG", "embeddings", "LLM", "agent", "prompt", "AI-powered" | AI Engineer + Prompt Engineer + Data Scientist + Architect (scoped) → BE/FE |
| **Migrate** | "migrate", "upgrade", "migration", "database change", "schema change", "refactor DB", "move to" | Database Engineer + Software Engineer → QA |
| **Test** | "write tests", "test coverage", "test this", "add tests" | QA |
| **Review** | "review my code", "code review", "code quality", "check my code" | Code Reviewer |
| **Architect** | "design", "architecture", "API design", "data model", "tech stack", "how should I structure" | Solution Architect |
| **Document** | "document", "write docs", "API docs", "README" | Technical Writer |
| **Explore** | "explain", "understand", "help me think", "what should I", "I'm not sure" | Polymath |
| **Research** | "research", "deep research", "find sources", "analyze topic", "investigate [domain]", "NotebookLM", "study materials", "generate quiz" | NotebookLM Researcher → Polymath (research mode) + NotebookLM MCP (primary) |
| **Optimize** | "performance", "slow", "optimize", "scale", "reliability" | Performance Engineer + SRE + Code Reviewer |
| **Design** | "design UI", "wireframes", "design system", "color palette", "UX flow" | UX Researcher → UI Designer |
| **Mobile** | "mobile app", "React Native", "Flutter", "iOS", "Android" | BA (if gaps detected) → Mobile Engineer (+ PM scoped, Architect scoped if needed) |
| **Game Build** | "game", "Unity", "Unreal", "Godot", "Roblox", "Phaser", "Three.js", "gameplay", "game design", "build a game" | Game Designer → Engine Engineer (Unity/Unreal/Godot/Phaser 3/Three.js) → Level/Narrative/TechArt/Audio |
| **XR Build** | "VR", "AR", "MR", "XR", "spatial", "Quest", "Vision Pro", "WebXR" | XR Engineer (+ Game Build pipeline if game-like XR) |
| **Marketing** | "marketing", "SEO", "launch strategy", "copywriting", "content strategy", "go-to-market" | Growth Marketer (+ Conversion Optimizer if CRO mentioned) |
| **Grow** | "growth", "CRO", "conversion", "funnel", "A/B test", "churn", "retention", "referral" | Conversion Optimizer (+ Growth Marketer if strategy needed) |
| **Analyze** | "analyze requirements", "evaluate this", "is this feasible", "validate requirements", "check completeness", "client says" | Business Analyst (standalone requirements analysis) |
| **Custom** | Doesn't fit above patterns | Present skill menu, let user pick |

**Step 2 — Present or skip the plan:**

**Single-skill modes** (Test, Review, Architect, Document, Explore, Design, Debug, Analyze): Skip plan presentation. Classify → invoke immediately. The intent is obvious — no overhead needed.

**Multi-skill modes** (Feature, Harden, Ship, Optimize, AI Build, Migrate, Custom): Present the plan for confirmation via notify_user:

```
Here's my plan:

[numbered list of skills and what each does]

Scope: [light / moderate / heavy]

1. **Looks good — start (Recommended)** — Execute this plan
2. **I want the full production-grade pipeline** — Run all 55 skills, 6 phases, 3 gates
3. **Adjust the plan** — Add or remove skills from the plan
4. **Chat about this** — Free-form input
```

**Large Feature Mode** (Feature with 3+ components, or any request with complexity): Create planning document on antigravity BEFORE starting:

```
antigravity/
└── planning/
    └── [feature-name]/
        ├── PLAN.md          # Main planning document
        ├── SCOPE.md         # Scope definition
        ├── ARCHITECTURE.md  # Technical architecture (if needed)
        └── TASKS.md         # Task breakdown
```

**Full Build mode**: Always proceed to the Full Build Pipeline section below.

If the user selects "full pipeline" from any mode, switch to Full Build.

**Step 3 — Execute the mode:**

For non-Full-Build modes, use the lightweight execution flows below. For Full Build, use the Full Build Pipeline.

## Coding-Level Adaptation

Read `codingLevel` from `.production-grade.yaml` (default: 8). Adapt ALL skill output accordingly:

```yaml
# .production-grade.yaml
codingLevel: 8  # 1-10 scale (default: 8 = senior/terse)
```

| Level | Style | Output Behavior |
|-------|-------|-----------------|
| **1-3** (Junior) | **Guided** | Detailed explanations for every decision. Inline comments on complex logic. Link to relevant docs/tutorials. Explain WHY, not just WHAT. Step-by-step instructions for manual steps. |
| **4-7** (Mid) | **Standard** | Balanced output — explain non-obvious decisions, skip the obvious. Standard inline comments. Focus on trade-offs and alternatives. |
| **8-10** (Senior) | **Terse** | Code-focused, minimal commentary. Only flag unexpected decisions or gotchas. Diff-style output preferred. No tutorials, no hand-holding. Assume deep familiarity with tools and patterns. |

**Rules:**
- If `codingLevel` is not set, default to **Standard (5)**
- Coding level affects **output verbosity**, NOT **code quality** — all levels produce production-grade code
- Engagement Mode (Express/Standard/Thorough/Meticulous) controls **interaction depth** — coding level controls **explanation depth**. They are independent dimensions.

## Sensitive File Protection

All skills MUST follow the sensitive file protection protocol:

!`cat skills/_shared/protocols/sensitive-file-protection.md 2>/dev/null || echo "Protocol not found — apply defaults: never read .env without user approval, redact secrets in output, check .gitignore before commit"`

## Plan Quality Loop

**ALL skills** MUST run the plan quality loop before doing any work. No exceptions — every skill plans first, scores, improves until ≥ 9.0:

!`cat skills/_shared/protocols/plan-quality-loop.md 2>/dev/null || echo "Protocol not found — apply defaults: every skill must plan first, score against 8 criteria, threshold 9.0/10, improve loop with research + skill self-improvement"`

### ⚠️ ASIP Enforcement for Plan Quality

**After 2 consecutive failed plan attempts (score < 9.0):**
1. **TRIGGER MANDATORY RESEARCH GATE** — Cannot skip
2. Research via NotebookLM (deep mode)
3. Update skill SKILL.md (Planning Improvements section)
4. Append to `.forgewright/plan-lessons.md`
5. Only then re-plan with injected knowledge

**This is NON-NEGOTIABLE. The system will not proceed until research is complete.**

## Execution Blocker Loop

**ANY time a blocker is encountered during implementation, MUST run this loop BEFORE asking user:**

!`cat skills/_shared/protocols/execution-blocker-loop.md 2>/dev/null || echo "Protocol not found — apply defaults: assess → research (web/codebase/docs) → synthesize → attempt → verify → improve skill. Max 3 cycles."`

**⚠️ NEVER give up after 1 failed attempt. ALWAYS research first.**

### ⚠️ ASIP Enforcement for Execution Blockers

**After 2 consecutive failed execution attempts:**
1. **TRIGGER MANDATORY RESEARCH GATE** — Cannot skip
2. Categorize: Technical/Architectural/Tooling/External
3. Research via NotebookLM (deep mode)
4. Update skill SKILL.md (Execution Learnings section)
5. Append to `.forgewright/execution-lessons.md`
6. Only then retry with updated skill
7. If still fails → ESCALATE to user

**This is NON-NEGOTIABLE. The system will not proceed until research is complete.**

## Adaptive Self-Improving Loop (ASIP)

**Combined Plan Quality + Execution Blocker Loop with mandatory NotebookLM research:**

!`cat skills/_shared/protocols/self-improving-loop.md 2>/dev/null || echo "Protocol not found — apply defaults: 2 failures → research via NotebookLM → update skill → retry"`

**Core principle:** Every failure is a learning opportunity. Skills improve over time based on real failures.

### ASIP Metrics

Track project adaptation:
```json
{
  "totalResearchGates": 0,
  "totalSkillUpdates": 0,
  "uniquePatterns": 0,
  "lessonsLearned": 0,
  "failuresAvoided": 0
}
```

## Review Intensity Mode

**Control how much design/architecture review happens at each step:**

!`cat skills/_shared/protocols/review-intensity.md 2>/dev/null || echo "Protocol not found — apply defaults: Review mode defaults to Lean (reviews only at phase gates). Set in production/review-mode.txt. Modes: full (all reviews), lean (gate reviews only), solo (no reviews)."`

User can override per-invocation with `--review [mode]` flag.

## Model Tier Assignment

**Assign optimal Claude model tier to each skill invocation:**

!`cat skills/_shared/protocols/model-tier.md 2>/dev/null || echo "Protocol not found — apply defaults: Sonnet for most skills. Haiku for /sprint-status, /help, /scope-check, /onboard. Opus for /architecture-review, /gate-check, /code-review."`

Override per-invocation with `--model [haiku|sonnet|opus]` flag.

## Mode Execution (Non-Full-Build)

All modes share these behaviors:
- Bootstrap workspace: `mkdir -p skills/_shared/protocols/ .forgewright/`
- Write shared protocols (same as Full Build step 3)
- Read `.production-grade.yaml` for path overrides
- Read existing workspace state if present
- Apply coding-level adaptation from `.production-grade.yaml` (see above)
- Apply sensitive file protection protocol for all file operations
- **Run plan quality loop** on EVERY skill invocation — plan first, score ≥ 9.0 before any work begins
- **Asynchronous Heartbeat:** Periodically emit human-readable status updates (e.g., "Running tests...", "Applying self-healing fix 2/5...") so the user knows the AI is working and hasn't frozen.
- **⚠️ QA AUTO-RUN (MANDATORY):** After any code change (build, fix, feature), ALWAYS run QA/Testing WITHOUT waiting for user prompt. The sequence is: BUILD → TEST → VERIFY → DONE. Never finish without testing.
- **Antigravity Planning (for large features):** Features with 3+ components MUST use antigravity planning structure BEFORE starting implementation. Create `antigravity/planning/[feature-name]/` with PLAN.md, SCOPE.md, ARCHITECTURE.md, TASKS.md files.
- Engagement mode: ask ONLY if mode involves 3+ skills. For 1-2 skill modes, use Standard engagement + Sequential execution.

## ⚠️ Self-Check Before Finishing (MANDATORY)

**BEFORE declaring a task complete, verify ALL of the following:**

| # | Check | Action if Failed |
|---|-------|-----------------|
| 1 | **Request interpreted?** | If Step 0 wasn't completed, go back and do it |
| 2 | **Plan scored ≥ 9.0?** | If < 9.0, improve plan before proceeding |
| 3 | **ASIP Research Gate followed?** | If 2 failures occurred → research + skill update was mandatory |
| 4 | **Lessons written?** | Append to skill SKILL.md + .forgewright/lessons.md |
| 5 | **Code changes made?** | If yes → run QA tests |
| 6 | **Tests written?** | If code changed → write tests |
| 7 | **Tests passed?** | If tests exist → run them |
| 8 | **forgenexus_impact run?** | If editing symbols → run impact analysis |
| 9 | **Scope respected?** | If scope creep detected → flag to user |
| 10 | **User approval obtained?** | If gate exists → wait for approval |
| 11 | **Review mode respected?** | If Full mode → run director reviews; if Solo → confirm skip OK |
| 12 | **ASIP metrics updated?** | Increment counters in .forgewright/asip-metrics.json |

**⚠️ NEVER finish a task without completing checks 3-5 if code was changed.**

### QA Test Sequence (MANDATORY after any code change)

```
Code Changed?
    ↓ YES
Run QA Engineer (Express mode)
    ↓
Write tests (unit → integration → e2e)
    ↓
Run tests and verify ALL pass
    ↓
Report results
    ↓
Done ✓
```

**Do NOT wait for user to ask for tests. Run them automatically.**

## Antigravity Planning System

For large features (3+ components), use the Antigravity Planning System to structure your work.

### When to Use Antigravity

| Feature Type | Antigravity? |
|--------------|--------------|
| Single file change | ❌ No |
| Small (1-2 components) | ❌ No |
| Medium (3+ components) | ✅ Yes |
| Full Build / Game Build | ✅ Required |
| Multi-team coordination | ✅ Required |
| New integration (auth, payment) | ✅ Yes |

### Antigravity Folder Structure

```
antigravity/
└── planning/
    └── [feature-name]/
        ├── PLAN.md          # Main planning document
        ├── SCOPE.md         # Scope definition
        ├── ARCHITECTURE.md   # Technical architecture
        ├── TASKS.md         # Task breakdown
        ├── DECISIONS.md     # Architecture decisions log
        └── RETROSPECTIVE.md # Post-completion retrospective
```

### Quick Commands

```bash
# Create new feature plan
./scripts/antigravity/antigravity.sh new <feature-name>

# Check status
./scripts/antigravity/antigravity.sh status

# Show progress
./scripts/antigravity/antigravity.sh progress <feature>

# Archive completed
./scripts/antigravity/antigravity.sh archive <feature>
```

### Feature Plan Template

Each feature plan must include:

| File | Required? | Content |
|------|-----------|---------|
| `PLAN.md` | ✅ Yes | Overview, goals, key decisions, timeline |
| `SCOPE.md` | ✅ Yes | In/out scope, constraints, risks, acceptance criteria |
| `ARCHITECTURE.md` | ⚠️ If complex | Component diagram, data models, API design |
| `TASKS.md` | ✅ Yes | Task breakdown by priority, estimates |
| `DECISIONS.md` | ⚠️ Recommended | Architecture Decision Records |
| `RETROSPECTIVE.md` | ⚠️ After completion | Lessons learned, metrics |

### Plan Quality Criteria

Each feature plan must score ≥ 9.0/10 on:

| Criteria | Description |
|----------|-------------|
| Clarity | Scope clearly defined |
| Completeness | Enough info to implement |
| Feasibility | Achievable in timeframe |
| Risk Awareness | Risks identified |
| Testability | Clear acceptance criteria |
| Maintainability | Long-term viable |
| Priority | Impact vs effort clear |
| Dependencies | External deps identified |

See `antigravity/README.md` for full documentation.

### Feature Mode

Add a feature to an existing codebase. Lightweight DEFINE → BUILD → TEST.

1. **Codebase scan** — read existing code structure, framework, patterns
2. **BA pre-flight (conditional)** — Assess the user's feature description for information gaps using 6W1H. If requirements score < 6/7 completeness → run BA (Express depth) to elicit missing info. If clear → skip. Log: `✓ Requirements complete — skipping BA` or `⧖ Information gaps detected — running BA elicitation`
3. **PM (Express depth)** — 2-3 questions to scope the feature. Write a mini-BRD (user stories + acceptance criteria for this feature only). If BA ran, use `ba-package.md` to reduce questions.
4. **Architect (scoped)** — design how this feature fits the existing architecture. New endpoints, schema changes, component additions. NOT a full system redesign.
5. **Build** — Software Engineer and/or Frontend Engineer implement the feature
6. **⚠️ Test (AUTO-RUN)** — **Immediately** write and run tests for the new feature. **DO NOT WAIT for user to ask.** Sequence: Build → Test → Verify → Done.
7. **Optional: Review** — Code Reviewer checks the new code against existing patterns

**1 gate:** After PM scoping (step 3), confirm scope before building.

**⚠️ IMPORTANT:** Step 6 (Test) is MANDATORY. After building, ALWAYS run tests without waiting for user prompt.

### Harden Mode

Security + quality audit on existing code. No building, pure analysis + fixes.

1. **Codebase scan** — read all existing code
2. **Sequential:** Security Engineer → QA Engineer → Code Reviewer analyze the code
3. **Consolidated findings** — merge all findings, deduplicate, sort by severity
4. **Present findings** — show Critical/High/Medium/Low counts with top issues
5. **Remediation** — fix Critical and High issues (with user confirmation)

**1 gate:** After findings (step 4), before remediation.

### Ship Mode

Get existing code deployed. Infrastructure + reliability.

1. **Codebase scan** — read existing code, identify services, dependencies
2. **DevOps** — Dockerfiles, CI/CD pipelines, IaC (Terraform/Pulumi), monitoring
3. **SRE** — SLO definitions, runbooks, alerting, chaos experiment plan

**1 gate:** After DevOps infra plan, before applying.

### Test Mode

Write tests for existing code. Single skill.

1. Read skills/qa-engineer/SKILL.md and follow its instructions against existing code
2. QA reads code, writes test plan, implements tests, runs them
3. Report results

**0 gates.** QA operates autonomously.

### Review Mode

Code quality review. Single skill, read-only.

1. Read skills/code-reviewer/SKILL.md and follow its instructions
2. Review produces findings report
3. Present findings with severity distribution

**0 gates.** Read-only operation.

### Architect Mode

Design or redesign architecture. Single skill.

1. Read skills/solution-architect/SKILL.md and follow its instructions
2. Full discovery interview (depth based on engagement mode)
3. Produces ADRs, diagrams, tech stack, API contracts, scaffold

**1 gate:** Architecture approval before scaffold generation.

### Document Mode

Generate documentation for existing code. Single skill.

1. Read skills/technical-writer/SKILL.md and follow its instructions
2. Reads all code + existing docs
3. Generates API reference, dev guides, architecture overview

**0 gates.** Technical Writer operates autonomously.

### Explore Mode

Thinking partner. Single skill.

1. Read skills/polymath/SKILL.md and follow its instructions
2. Research, advise, ideate — whatever the user needs
3. When ready, offer to hand off to any other mode

**0 gates.** Polymath manages its own dialogue.

### Research Mode

Deep, grounded research on any topic. **NotebookLM Researcher is the primary skill** (v0.5.19, 35+ tools: research, studio, audio, quiz, flashcards, slides, cross-notebook, batch, pipelines, tags). Polymath + crawl4ai are enhancement layers.

1. Read `skills/notebooklm-researcher/SKILL.md` and follow its instructions
2. Check authentication: `nlm auth status`
3. Check for existing notebooks before creating new: `nlm notebook list`
4. **Phase 1 — Discovery:** Identify if this is a new topic (→ create notebook) or existing notebook (→ add sources)
5. **Phase 2 — Source Ingestion:** Add source URLs, text notes, or YouTube videos. Use `nlm research start --mode deep` for automatic web discovery
6. **Phase 3 — NotebookLM Synthesis:** Use `notebook describe`, `notebook query`, `cross query` to synthesize findings
7. **Phase 4 — Content Generation:** Generate study materials: audio (podcast), report (briefing doc/study guide), quiz, flashcards, slides, infographic
8. **Phase 5 — Cross-Notebook (if needed):** Query across multiple notebooks for comparative research
9. **Phase 6 — Handoff:** Format findings as research report with citations, hand off to relevant mode

**NotebookLM Capabilities (v0.5.19):**
- 35+ MCP tools: notebook, source, research, studio, audio, video, report, quiz, flashcards, mindmap, slides, infographic, data-table, download, export, chat, share, batch, cross, pipeline, tag, alias, config, doctor, skill, setup
- Batch operations: same action across multiple notebooks
- Pipelines: `ingest-and-podcast`, `research-and-report`, `multi-format`
- Drive sync: stale source detection and sync
- Multi-profile: multiple Google accounts
- Enterprise/Workspace support via `NOTEBOOKLM_BASE_URL`

**0 gates.** NotebookLM Researcher manages dialogue.

### Optimize Mode

Performance + reliability analysis. Two skills.

1. **Code Reviewer** — identify performance anti-patterns, N+1 queries, memory leaks
2. **SRE** — capacity analysis, scaling bottlenecks, SLO evaluation
3. **Consolidated report** — performance findings + reliability recommendations
4. **Remediation** — fix top issues

**1 gate:** After analysis, before fixes.

### Marketing Mode

Go-to-market strategy, content, and SEO. Primarily Growth Marketer.

1. **Growth Marketer** — market analysis, positioning, content strategy, SEO audit, copywriting, launch campaign, analytics setup
2. **Conversion Optimizer** (if CRO explicitly mentioned) — funnel audit, CRO recommendations alongside marketing strategy
3. **Frontend Engineer** (if SEO code changes needed) — implement meta tags, schema markup, page speed fixes

**1 gate:** After strategy, before content creation.

### Grow Mode

Conversion optimization, experimentation, and growth engineering. Primarily Conversion Optimizer.

1. **Conversion Optimizer** — funnel audit, CRO implementation, A/B test design, growth loops, churn prevention
2. **Growth Marketer** (if strategy context needed) — provide positioning, messaging, and traffic analysis
3. **Frontend Engineer** (if code changes needed) — implement CRO changes, experiment infrastructure
4. **QA Engineer** (if A/B test infrastructure) — verify experiment implementation

**1 gate:** After audit, before implementation.

### Analyze Mode

Standalone requirements analysis and validation. Single skill.

1. Read `skills/business-analyst/SKILL.md` and follow its instructions
2. BA receives client information, applies 6W1H framework, evaluates completeness
3. BA challenges assumptions, checks feasibility, detects contradictions
4. BA generates `ba-package.md` with validated requirements
5. When complete, offer handoff options:

```
Analysis complete. What next?

1. **Hand off to PM — write BRD from this analysis (Recommended)**
2. **Start Feature mode — build what was analyzed**
3. **Start Full Build — full pipeline from this analysis**
4. **Done — I just needed the analysis**
5. **Chat about this** — Free-form input
```

**0 gates.** BA operates autonomously. Handoff is optional.

### Custom Mode

User picks skills from a menu. Present via notify_user:

```
Which skills do you need? (list the numbers separated by commas)

--- Core Engineering ---
1. **Business Analyst** — Requirements elicitation, feasibility analysis, critical evaluation, information gatekeeping
2. **Product Manager** — Requirements, user stories, BRD
3. **Solution Architect** — System design, API contracts, tech stack
4. **Software Engineer** — Backend implementation
5. **Frontend Engineer** — UI components, pages, design system
6. **QA Engineer** — Tests — unit, integration, e2e, performance
7. **Security Engineer** — OWASP audit, STRIDE, AI security, runtime detection
8. **Code Reviewer** — Architecture conformance, code quality, git workflow
9. **DevOps** — Docker, CI/CD, Terraform, monitoring
10. **SRE** — SLOs, chaos engineering, runbooks
11. **Technical Writer** — API docs, dev guides, architecture docs
12. **Data Scientist** — AI/ML systems, RAG pipelines, agent orchestration
13. **Debugger** — Bug investigation, root cause analysis, regression testing
14. **Prompt Engineer** — Prompt design, evaluation, optimization
15. **API Designer** — REST/GraphQL design, endpoints, error taxonomy
16. **Database Engineer** — Schema design, migrations, query optimization
17. **AI Engineer** — MLOps, model serving, fine-tuning, evaluation
18. **Accessibility Engineer** — WCAG compliance, a11y audit, screen reader
19. **Performance Engineer** — Load testing, profiling, Core Web Vitals
20. **UX Researcher** — User research, usability testing, personas
21. **Data Engineer** — ETL pipelines, data warehouse, dbt, data quality
22. **Project Manager** — Sprint planning, velocity, risk management
23. **XLSX Engineer** — Excel spreadsheet creation, financial models, formula-driven reports, data formatting

--- Game Development ---
24. **Game Designer** — GDD, gameplay loops, economy, mechanic specs
25. **Unity Engineer** — C# ScriptableObjects, Editor tools, URP
26. **Unreal Engineer** — C++/Blueprint, GAS, Nanite/Lumen
27. **Godot Engineer** — GDScript, scene tree, signals, cross-platform
28. **Godot Multiplayer** — MultiplayerSpawner, ENet, prediction, dedicated server
29. **Roblox Engineer** — Luau, DataStore, Roblox Studio, experience design
30. **Phaser 3 Engineer** — TypeScript, modular scenes, ECS-optional, WebGL/Canvas, shared vfx/ui helpers
31. **Three.js Engineer** — ECS, WebGPU/WebGL, Rapier physics, performance budgets, post-processing
30. **Level Designer** — Spatial design, encounters, pacing, environmental storytelling
31. **Narrative Designer** — Branching dialogue, character voice, lore
34. **Technical Artist** — Shaders, VFX, LOD, performance budgets
35. **Game Audio Engineer** — Spatial audio, adaptive music, SFX, mix
36. **Unity Shader Artist** — Shader Graph, HLSL, VFX Graph, post-processing
37. **Unity Multiplayer** — Netcode for GameObjects, relay, prediction
38. **Unreal Technical Artist** — Niagara, Material Editor, Lumen/Nanite
39. **Unreal Multiplayer** — Replication, dedicated server, GAS networking
40. **XR Engineer** — AR/VR/MR, spatial UI, hand tracking, comfort

--- Growth ---
41. **Growth Marketer** — Launch strategy, content, channels, SEO
42. **Conversion Optimizer** — CRO, funnel analysis, A/B testing, retention

--- Data Acquisition ---
43. **Web Scraper** — Secure web crawling (crawl4ai), URL validation, output sanitization, CSS/LLM extraction

--- Integration ---
44. **Paperclip** (optional) — Multi-agent orchestration, ticket management, budget control, heartbeat scheduling

45. **Chat about this** — Free-form input
```

Execute selected skills in dependency order. If user picks conflicting skills, resolve via the authority hierarchy.

### Debug Mode

Systematic bug investigation. Single skill (+ optional fix).

1. Read `skills/debugger/SKILL.md` and follow its instructions
2. Debugger triages, generates hypotheses, investigates, finds root cause
3. Present root cause and proposed fix
4. If user approves fix → apply fix + regression test
5. If fix touches backend code → Software Engineer applies it
6. If fix touches frontend code → Frontend Engineer applies it

**1 gate:** After root cause identified (step 3), before applying fix.

### AI Build Mode

Build or integrate AI-powered features. Multi-skill.

1. **Codebase scan** — identify existing AI infrastructure (LLM clients, embeddings, RAG, agents)
2. **PM (Express depth)** — scope the AI feature. User stories focused on AI behavior.
3. **Data Scientist** — select model, design RAG pipeline/agent architecture (if needed)
4. **Prompt Engineer** — design and evaluate prompts for the feature
5. **Architect (scoped)** — API contracts for AI endpoints, vector DB schema
6. **Build** — Software Engineer + Frontend Engineer implement
7. **Test** — QA + evaluation framework for AI quality

**2 gates:** After AI architecture design (step 3-4), and after prompt evaluation (step 7).

### Migrate Mode

Database migration, framework upgrade, or large-scale code migration.

1. **Codebase scan** — understand current state (schema, framework version, code patterns)
2. **Database Engineer** — design migration: new schema, zero-downtime migration scripts, data transformation
3. **Software Engineer** — update code to work with new schema/framework
4. **QA** — regression tests, data integrity verification
5. **Optional: Rollback plan** — reversible migrations, feature flags for gradual rollout

**2 gates:** After migration plan (step 2), and after migration scripts generated (before execution).

### Game Build Mode

Build a game from concept to playable build. Full game development pipeline.

1. **Concept analysis** — extract game concept, genre, platform, engine from user's message
2. **Engine detection** — read `.production-grade.yaml` for `game.engine` override, or ask:
   ```
   Which engine for this game?
   1. **Unity** (Recommended for indie-AA, mobile, 2D/3D)
   2. **Unreal Engine** (AAA quality, heavy 3D, C++/Blueprint)
   3. **Godot** (Open-source, lightweight, rapid iteration)
   4. **Phaser 3** (Web-native 2D, HTML5, Canvas/WebGL — no install, instant play)
   5. **Three.js** (Web-native 3D, WebGPU/WebGL — browser-native 3D experiences)
   ```
3. **Game Designer** — `skills/game-designer/SKILL.md` — design pillars, core loop, economy, mechanic specs, player flows
4. **Engine Engineer** — based on chosen engine:
   - Unity: `skills/unity-engineer/SKILL.md` — C# architecture, ScriptableObjects, Editor tools
   - Unreal: `skills/unreal-engineer/SKILL.md` — C++/Blueprint, GAS, AI, Blueprint layer
   - Godot: `skills/godot-engineer/SKILL.md` — GDScript, scene tree, signals
   - Phaser 3: `skills/phaser3-engineer/SKILL.md` — TypeScript, modular scenes, ECS-optional, WebGL/Canvas
   - Three.js: `skills/threejs-engineer/SKILL.md` — ECS architecture, WebGPU/WebGL, Rapier physics
5. **Level Designer** — `skills/level-designer/SKILL.md` — level structure, encounters, pacing, blockouts
6. **Narrative Designer** (if story-driven) — `skills/narrative-designer/SKILL.md` — dialogue, characters, lore
7. **Technical Artist** — `skills/technical-artist/SKILL.md` — shaders, VFX, LOD, performance budgets
8. **Game Audio Engineer** — `skills/game-audio-engineer/SKILL.md` — SFX, adaptive music, spatial audio
9. **Engine-specific depth** (optional, based on game needs):
   - Multiplayer: `skills/unity-multiplayer/SKILL.md`, `skills/unreal-multiplayer/SKILL.md`, `skills/godot-multiplayer/SKILL.md`
   - Shader/VFX: `skills/unity-shader-artist/SKILL.md`, `skills/unreal-technical-artist/SKILL.md`
10. **QA** — per `skills/_shared/protocols/game-test-protocol.md` (extended for Phaser 3 and Three.js):
    - Mechanics Validation (engine-specific tests: Unity UTF, Unreal Automation, Godot GUT, Phaser 3 Vitest/Jest, Three.js ECS system tests)
    - Balance Validation (economy, XP curves, difficulty scaling against GDD)
    - State Machine Validation (all mechanic transitions match GDD state diagrams)
    - Performance Validation (FPS, memory, load time per platform targets; Three.js: draw calls < 100/frame)
    - Build Verification (compile, references, platform builds, boot test; Phaser 3: Vite build; Three.js: Vite bundle)
    - Integration Validation (cross-system regressions)
    - Platform Validation (web browsers, mobile WebGL, desktop WebGL/WebGPU)
11. **Quality Gate** — run `skills/_shared/protocols/quality-gate.md` with game-specific thresholds (see `tests/coverage/thresholds.json`)
12. **Task Validator** — run `skills/_shared/protocols/task-validator.md` to validate delivery against Task Contract

**4 gates:** After Game Designer GDD (step 3), after engine architecture (step 4), after first playable (step 9), and after QA test suite (step 10).

### XR Build Mode

Build AR/VR/MR applications. XR Engineer + optional game development pipeline.

1. **Concept analysis** — determine XR type (VR game, AR tool, MR experience), platform (Quest, Vision Pro, PCVR, WebXR)
2. **XR Engineer** — `skills/xr-engineer/SKILL.md` — XR setup, spatial interaction, comfort, spatial UI
3. **If game-like XR** (VR game, interactive experience) — run Game Build pipeline steps 3-8 within XR context
4. **If tool/productivity XR** — route to standard Feature/Full Build pipeline with XR Engineer leading spatial design
5. **QA** — comfort testing, frame rate validation, input model coverage

**2 gates:** After XR architecture (step 2), and after spatial interaction playable (step 3-4).

## Chat Interpretation (Pre-Processing — BEFORE everything else)

> **Powered by prompt-master methodology.** Run BEFORE Step 0.1 on every user message.

Every user message is first interpreted through the `chat-interpreter` Cursor subagent. This converts vague natural language into a structured, unambiguous pipeline request — eliminating the need for users to speak "prompt engineer."

**Step -1 — Chat Interpretation:**

```
Invoke: /chat-interpreter [user's message]
```

**The chat-interpreter subagent performs:**

1. **9-Dimension Extraction** — silently extracts: Task, Target tool, Output format, Constraints, Input, Context, Audience, Success criteria, Examples

2. **Mode Detection** — maps the request to Forgewright's 19 modes with confidence level (HIGH/MEDIUM/LOW)

3. **Gap Detection** — identifies missing information (max 3 clarifying questions if needed)

4. **Default Application** — fills in reasonable defaults for unstated requirements

5. **Structured Output** — produces `INTERPRETED_REQUEST.md` with:
   - Detected mode + confidence
   - Intent (original quoted)
   - Key decisions made
   - Scope (included/excluded)
   - Constraints
   - Missing items
   - Success criteria

**If confidence is HIGH:**
```
✓ Request interpreted — [mode] mode detected
[Structured request summary — 3 lines max]
→ Proceeding to Step 0.1
```

**If confidence is MEDIUM:**
```
Request understood. Detected [mode] but [alternative] is also possible.

1. **[mode] (Recommended)** — [reason]
2. **[alternative]** — [reason why user might want this]
3. **Chat about this** — Tell me more
```

**If confidence is LOW:**
```
I'm not sure what you want. A few quick questions:

1. [most critical unknown — max 3 questions]
2. [second most critical]
3. [third most critical — last one]

After your answers, I'll route to the right pipeline.
```

**Paperclip Detection (auto-handled):**
- If `#42`, `CLIP-`, or `[paperclip]` detected → route to **Express** engagement mode
- chat-interpreter appends `engagement_override: express` to `INTERPRETED_REQUEST.md`

**Chat Interpretation Output:**
```
.forgewright/subagent-context/INTERPRETED_REQUEST.md
  ├── mode: [detected mode]
  ├── confidence: [HIGH/MEDIUM/LOW]
  ├── intent_summary: [1 sentence]
  ├── scope: {included: [...], excluded: [...]}
  ├── constraints: [...]
  ├── missing: [...]
  ├── success_criteria: [...]
  └── engagement_override: [express/standard/thorough/meticulous if set]
```

**Reading the interpreted request before proceeding:**
All subsequent pipeline steps read `.forgewright/subagent-context/INTERPRETED_REQUEST.md` as the authoritative source of user intent — not the raw chat message.

## Tool-Specific Routing (from prompt-master)

When generating prompts for specific AI tools, use the appropriate template and technique based on the target tool. Reference files:

| File | Read When |
|------|-----------|
| `skills/_shared/protocols/prompt-templates.md` | Need template structure for any tool category |
| `skills/_shared/protocols/credit-killing-patterns.md` | Fixing bad prompts or diagnosing failures |
| `skills/_shared/protocols/prompt-techniques.md` | Selecting safe techniques per model |

### Code AI Tools

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Claude Code** | ReAct + Stop Conditions (H) | Stop conditions MANDATORY, file scope, human review triggers |
| **Cursor / Windsurf** | File-Scope (G) | Path + function + do-not-touch list + done_when |
| **GitHub Copilot** | RTF (A) | Exact function signature as docstring |
| **Cline (Claude Dev)** | ReAct + Stop Conditions (H) | File scope + approval gates + stop conditions |

### Reasoning Models

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Claude (claude.ai)** | RTF/CO-STAR (A/B) | XML tags, explicit length, no over-engineering |
| **ChatGPT / GPT-5.x** | RTF/CO-STAR (A/B) | Output contract, verbosity control, compact structure |
| **o3 / o4-mini** | Short clean only | **REMOVE CoT** — they think internally, under 200 words |
| **Gemini 2.x/3** | CO-STAR (B) | Grounding anchors, citation rules, format locks |
| **DeepSeek-R1** | Short clean only | **REMOVE CoT**, short instructions only |
| **Qwen3 (thinking)** | Short clean only | Treat like o3 — no CoT scaffolding |
| **Qwen3 (non-thinking)** | RTF (A) | Full structure, explicit format, role assignment |
| **MiniMax** | RTF (A) | Temperature 0-1 only, structured output |

### Local Models

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Ollama** | RTF (A) | Ask which model first, shorter prompts, simple structure |
| **Llama / Mistral** | RTF (A) | Shorter prompts, flat structure, explicit role |
| **CodeLlama** | File-Scope (G) | Coding-focused prompts, shorter |

### Image/Video AI

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Midjourney** | Visual Descriptor (I) | Comma-separated, negative prompt, parameters |
| **DALL-E 3** | Visual Descriptor (I) | Prose works, text exclusion, foreground/background |
| **Stable Diffusion** | Visual Descriptor (I) | `(word:weight)` syntax, CFG 7-12, negative mandatory |
| **ComfyUI** | ComfyUI (K) | Separate positive/negative, checkpoint-specific |
| **Reference editing** | Reference Image (J) | Delta only, attach reference first |
| **Sora / Runway** | Visual Descriptor (I) | Camera movement, duration, cinematic language |

### Full-Stack Generators

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Bolt / v0 / Lovable** | RISEN (C) | Stack + version + what NOT to scaffold |
| **Figma Make** | RISEN (C) | Component names from Figma, scope boundaries |
| **Google Stitch** | RISEN (C) | Interface goal over implementation, Material Design 3 |

### Autonomous Agents

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Devin / SWE-agent** | ReAct + Stop Conditions (H) | Starting state + target state + forbidden actions |
| **Manus / Perplexity Computer** | RISEN (C) | End deliverable focus, permission scope |

### Quick Reference

- **Claude Code, Devin, AutoGPT** → Template H (ReAct + Stop Conditions)
- **Cursor, Windsurf, Copilot** → Template G (File-Scope)
- **o3, o4-mini, R1, Qwen3-thinking** → **REMOVE CoT**, keep under 200 words
- **Claude, GPT-4o, Gemini** → CoT allowed, use Template E if logic-heavy
- **Midjourney, SD, DALL-E** → Template I (Visual Descriptor), negative prompts
- **Complex multi-step** → Template C (RISEN)

## Auto-Initialization Check

Run silently BEFORE any execution (all modes) to ensure project intelligence is fully configured.

**Step 0.1 — MCP & ForgeNexus Check:**

1. Check if the file `.forgewright/mcp-server/mcp-config.json` exists in the project root.
2. **If missing**, silently execute the following terminal commands to auto-initialize it:
   - `npx --yes forgenexus analyze`
   - `bash <path-to-forgewright-submodule>/scripts/mcp-generate.sh`
   - Yield a brief message to the user: `ℹ Auto-initialized ForgeNexus index and MCP server (missing setup).`
3. **If exists**, continue normally without doing anything.

**Step 0.2 — System Requirements + Power Level Check (required):**

Forgewright requires **Node.js 18+** (ForgeNexus) and **Python 3** (local memory). Power level determines which tools are needed.

**Step 0.2.1 — System Requirements Check:**

Run these in parallel:

```
node_check:  node --version 2>/dev/null | grep -oE '[0-9]+' | head -1
python_check: python3 --version 2>/dev/null
memory_check:  [ -d .forgewright/memory_db ] && echo "ready" || echo "setup"
settings_check: [ -f .forgewright/settings.md ] && echo "exists" || echo "missing"
```

**Decision matrix:**

| node | python | memory | Action |
|------|--------|--------|--------|
| ≥18 | ≥3.8 | ready | ✅ Full Persistent — continue to Step 0.3 |
| ≥18 | ≥3.8 | setup | ⧖ Memory setup needed — run memory-local.sh |
| ≥18 | missing | — | ⚠️ Python missing — stop, tell user install Python 3 |
| <18 | — | — | ⚠️ Node.js <18 — stop, tell user upgrade Node.js |
| missing | — | — | ⚠️ Node.js missing — stop, tell user install Node.js 18+ |

**If Node.js or Python missing (blocking):**
```
notify_user:
  "⚠️ Missing required tools for Forgewright:

   Node.js 18+ required for: ForgeNexus code intelligence, MCP server
   Python 3.8+ required for: Local memory (ChromaDB + sentence-transformers)

   How to install:
   macOS:  brew install node python3
   Linux:  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt install -y nodejs python3
   Windows: Download from nodejs.org + python.org

   After installing, re-run your request."
  Options:
  > "I'll install and try again (Recommended)"
  > "Chat about this"
```

**If memory needs setup (non-blocking):**
```
# Run silently
bash <path-to-forgewright>/scripts/memory-local.sh "$(pwd)" 2>/dev/null

# If failed (no python3)
Log: "⚠️ Memory init failed — install Python 3 first. Forcing: FORGEWRIGHT_SKIP_MEMORY=1"
# CI/headless exemption auto-applied
```

**If all requirements met:**
```
Log: "✓ System requirements verified:
  - Node.js: [version] ✓
  - Python 3: [version] ✓
  - Memory: [ready/setup needed] ✓"
```

**Step 0.2.2 — Power Level Check:**

```
IF .forgewright/settings.md exists:
  Read engagement + execution from settings
  Log: "✓ Power level loaded: [level]"
  Continue to Step 0.3
ELSE:
  # First-time setup — ask user
  Log: "⧖ Power level not set — prompting user"
```

**Prompt for power level (only if settings missing):**
```
notify_user:
  "Forgewright has 5 power levels. Choose based on how much capability you need:

  ⚡ Basic       — 55 skills, full pipeline (Node.js only)
  ⚡⚡ Smart     — + ForgeNexus blast-radius analysis (Node.js only)
  ⚡⚡⚡ Persistent — + Local memory with ChromaDB (Node.js + Python 3)
  ⚡⚡⚡⚡ Research  — + NotebookLM grounded research (optional)
  ⚡⚡⚡⚡⚡ Full Power — All of the above + crawl4ai, Midscene, Paperclip

  Which level?"
  Options:
  > "⚡⚡⚡ Persistent (Recommended) — Standard for active projects"
  > "⚡⚡⚡⚡⚡ Full Power — Maximum capability"
  > "⚡⚡ Smart — Code intelligence without memory"
  > "⚡ Basic — Just the pipeline"
  > "Chat about this"
```

**After user selects:**

```
IF Full Power:
  Log: "✓ Power level: Full Power"
  # Prompt user about optional Full Power tools (required acknowledgment)
  notify_user:
    "⚡ Full Power selected! You have everything you need:

     MANDATORY (auto-verified): Node.js 18+, Python 3.8+, local memory ✓

     OPTIONAL — install anytime to unlock more capability:

     📚 Research Mode
        pip install notebooklm-mcp
        (Grounded AI with zero hallucinations, citations from your sources)

     🌐 Web Intelligence
        pip install crawl4ai>=0.8.0
        (Scrape & crawl any website for RAG or research)

     📱 Mobile Testing
        npm install -g @anthropic-ai/midscene
        (AI-powered UI testing on real Android/iOS devices)

     Which optional tools would you like to install now?"
    Options:
    > "Install all optional tools now (Recommended)"
    > "Install [specific tool] only — I'll do others later"
    > "Skip — I'll install manually later"
    > "Chat about this"

  IF user selects "Install all":
    Log: "Installing optional Full Power tools..."
    # Try pip tools first (each tool independently — if one fails, continue others)
    Run: pip install notebooklm-mcp 2>/dev/null && Log: "  ✓ notebooklm-mcp" || Log: "  ⚠ notebooklm-mcp skipped (pip error)"
    Run: pip install crawl4ai>=0.8.0 2>/dev/null && Log: "  ✓ crawl4ai" || Log: "  ⚠ crawl4ai skipped (pip error)"
    # npm tool last (requires node)
    Run: npm install -g @anthropic-ai/midscene 2>/dev/null && Log: "  ✓ Midscene" || Log: "  ⚠ Midscene skipped (npm error)"
    # Verify which tools are now importable / executable
    Run: python3 -c "import notebooklm_mcp" 2>/dev/null && npb="✓" || npb="⚠"
    Run: python3 -c "import crawl4ai" 2>/dev/null && crw="✓" || crw="⚠"
    Run: which midscene >/dev/null 2>&1 && mids="✓" || mids="⚠"
    Log: "✓ Optional tools status: notebooklm-mcp [$npb]  crawl4ai [$crw]  Midscene [$mids]"
    Log: "  Full install commands (if any skipped):"
    Log: "    pip install notebooklm-mcp crawl4ai>=0.8.0"
    Log: "    npm install -g @anthropic-ai/midscene"
  IF user selects specific tool:
    Log: "Installing [selected tool]..."
    Run: [corresponding install command]
    Log: "✓ [tool] installed"
  IF user selects skip:
    Log: "⧖ Optional tools deferred — run install commands manually when ready"

IF Research:
  Log: "✓ Power level: Research"
  Log: "Optional: pip install notebooklm-mcp"

IF Persistent:
  Log: "✓ Power level: Persistent — Local memory ready"

IF Smart:
  Log: "✓ Power level: Smart — ForgeNexus ready"

IF Basic:
  Log: "✓ Power level: Basic"
```

**Write settings file:**

```bash
mkdir -p .forgewright production
cat > .forgewright/settings.md << 'EOF'
# Pipeline Settings
Power_Level: [selected]
Engagement: [express/standard/thorough/meticulous — default: standard]
Execution: [parallel/sequential — default: parallel]
Review_Mode: [full/lean/solo — default: lean]
EOF
```

**Review Mode Configuration:**

Follow `skills/_shared/protocols/review-intensity.md` for review mode selection:
- **Full** — Director specialists review at every step
- **Lean** (default) — Reviews only at phase gate transitions
- **Solo** — No reviews, maximum speed

```bash
mkdir -p production
echo "lean" > production/review-mode.txt
```

User can override per-invocation with `--review [mode]` flag.

**Log checkpoint:**
```
Log: "✓ System init complete:
  - Node.js: [version] ✓
  - Python 3: [version] ✓
  - Memory: [ready] ✓
  - Power level: [level] ✓
  - Review mode: [mode] ✓
  - Settings: written to .forgewright/settings.md"
```

## Auto-Update Check

Run BEFORE any execution (all modes). Silent if current. One prompt max if update exists.

**Step 0 — version check:**

1. Check current version from plugin metadata
2. Use `read_url_content` to fetch `https://raw.githubusercontent.com/buiphucminhtam/forgewright/main/VERSION` → read the version string (this is the remote version)
3. **If fetch fails** (offline, timeout, 404) → silently continue. Never block the pipeline over an update check.
4. **If remote ≤ local** → continue silently (user sees nothing)
5. **If remote > local** → prompt via notify_user:

```
production-grade v{remote} is available (you have v{local})

1. **Update to v{remote} (Recommended)** — Auto-update and restart pipeline
2. **Skip — continue with v{local}** — Use current version
```

6. **If skip** → continue pipeline with current version
7. **If update** → execute in sequence:
   ```bash
   git clone --depth 1 https://github.com/buiphucminhtam/forgewright.git /tmp/pg-update
   ```
   - Copy updated files to the skills directory
   - Clean up: `rm -rf /tmp/pg-update`
   - Print: `✓ Updated to v{remote_version}. Re-invoke /production-grade to use the new version.`
   - **STOP** — do not continue pipeline. The user must re-invoke to pick up new content.

**If any update step fails**, print a warning and continue with the current version. Never let the updater break the pipeline.

## Session Lifecycle Pre-Flight

Run AFTER update check, BEFORE mode classification. Follows `skills/_shared/protocols/session-lifecycle.md`.

**Step 0.5 — session start:**

1. **Load project profile:**
   - If `.forgewright/project-profile.json` exists and is fresh (<24h) → load context, skip re-onboarding
   - If stale → re-run health check only (project-onboarding Phase 2)
   - If missing → run full project onboarding (see `skills/_shared/protocols/project-onboarding.md`)

2. **Load last session state:**
   - If `.forgewright/session-log.json` exists with interrupted session → offer resume via notify_user
   - If last session completed → log summary, continue to new request
   - If first session → continue normally

3. **Load memory context (required for Persistent power level — Step 0.2):**
   - Run `python3 <path-to-forgewright>/scripts/mem0-v2.py search "<project-name> <user-request-keywords>" --limit 5` (or `./scripts/mem0-v2.py` when the project is the Forgewright repo)
   - If the store is empty or search returns nothing → run `python3 ... mem0-v2.py search "<project-name>"` again to verify setup
   - Also read `.forgewright/code-conventions.md` if it exists for extra conventions

4. **Detect manual changes:**
   - If git available → check commits since last session
   - If structural changes detected → re-run onboarding fingerprint + patterns

5. **Display quality trend** (if history exists):
   - Read `.forgewright/quality-history.json` → show trend of last 5 sessions

Log: `✓ Session context loaded — [project name], last session: [summary or "first session"]`

**Step 0.6 — Cursor Subagent Context Preparation:**

Run AFTER session context is loaded, AFTER chat-interpreter (Step -1), BEFORE any skill or phase execution. This ensures subagents have clean, bounded context.

1. **Ensure subagent context directory exists:**
   ```
   mkdir -p .forgewright/subagent-context/
   ```

2. **Read chat-interpreter output:**
   ```
   Read .forgewright/subagent-context/INTERPRETED_REQUEST.md
   → This is the authoritative source of user intent
   → All skills use this instead of the raw chat message
   ```

3. **Write PIPELINE_SUMMARY.md** (refresh for each new phase): (refresh for each new phase):
   - Read `.forgewright/project-profile.json` if exists
   - Read current phase status from `.forgewright/task.md`
   - Read approved architecture from `docs/architecture/` (if exists)
   - Read BRD summary from `product-manager/BRD/` (if exists)
   - Compress to ≤ 2,000 tokens
   - Write to `.forgewright/subagent-context/PIPELINE_SUMMARY.md`

3. **Write REVIEWER_CONTRACT.md** (per-review, generated dynamically):
   ```
   For each review task, write:
   - REVIEWER_CONTRACT.md with scope, acceptance criteria, forbidden paths
   - Reference: .forgewright/subagent-context/REVIEWER_CONTRACT_TEMPLATE.md
   ```

4. **Update SECURITY_STANDARDS.md** (refresh for HARDEN phase):
   - Run security-engineer skill output through SECURITY_STANDARDS template
   - Write to `.forgewright/subagent-context/SECURITY_STANDARDS.md`

5. **Log:**
   ```
   ✓ Subagent context prepared — [N] files in .forgewright/subagent-context/
   ```

**Cursor Subagent Invocation Convention:**

When invoking a Cursor subagent, use the exact pattern below:

```
Invoke: /[subagent-name] [task context]
Example: /verifier Review the T3a backend services delivery
Example: /spec-reviewer Check T3b frontend against CONTRACT.json
Example: /quality-reviewer Assess T3a services code quality
Example: /security-auditor Perform read-only OWASP audit on T3a auth code
```

**Built-in Cursor EXPLORE subagent** (automatic, no explicit invocation needed):

The Cursor built-in `explore` subagent runs 10 parallel searches simultaneously using a fast model. This is automatically used by Cursor's Agent for context-heavy exploration. In the DEFINE phase (Step 4: Codebase Discovery), use natural language and the explore subagent handles parallel search automatically — you do NOT need to manually invoke it.

**Available Cursor Subagents:**

| Subagent | Model | Best For | Invocation |
|----------|-------|---------|-----------|
| `chat-interpreter` | fast | Translates chat to structured request | `/chat-interpreter [message]` |
| `explore` | fast (built-in) | 10 parallel codebase searches | Automatic (Cursor Agent) |
| `verifier` | fast | Confirm deliverables actually work | `/verifier [task]` |
| `spec-reviewer` | fast | Verify spec compliance | `/spec-reviewer [task]` |
| `quality-reviewer` | inherit | Deep quality/architecture review | `/quality-reviewer [task]` |
| `security-auditor` | inherit | OWASP read-only audit | `/security-auditor [task]` |

## Full Build Pipeline

When mode is **Full Build**, follow this EXACT sequence:

1. **Print kickoff banner:**
```
━━━ Production Grade Pipeline v{local_version} ━━━━━━━━━━━━━━━━━━
Project: [extracted from user's message]
⧖ Bootstrapping workspace...
```

2. **Bootstrap workspace:**
```bash
mkdir -p skills/_shared/protocols/
mkdir -p .forgewright/
```

3. **Write shared protocols** to `skills/_shared/protocols/`:

| Protocol File | Content |
|---------------|---------|
| `ux-protocol.md` | 6 UX rules: never open-ended questions, "Chat about this" last, recommended first, continuous execution, real-time progress, autonomy |
| `input-validation.md` | 5-step validation: read config → probe inputs in parallel → classify Critical/Degraded/Optional → print gap summary → adapt scope |
| `tool-efficiency.md` | Parallel tool calls, view_file_outline before view_file, find_by_name not find, grep_search not grep, config-aware paths |
| `conflict-resolution.md` | Authority hierarchy, dedup by file:line (keep highest severity), HARDEN→BUILD feedback loops (2 cycle max) |
| `project-onboarding.md` | 5-phase deep project analysis: fingerprint → health check → pattern analysis → risk assessment → profile generation |
| `session-lifecycle.md` | Cross-session continuity: session start/save/end hooks, resume protocol, drift detection, memory integration |
| `quality-gate.md` | Universal per-skill validation: 4 levels (build, regression, standards, traceability), quality scoring 0-100, configurable thresholds |
| `brownfield-safety.md` | Safety net for existing projects: git branching, baseline snapshots, protected paths, change manifest, regression checks, rollback |
| `quality-dashboard.md` | Quality scoring & reporting: real-time tracking, final dashboard, machine-readable JSON reports, cross-session trending, early warning |
| `graceful-failure.md` | Retry limits, stuck detection, graceful exit format, failure categories — prevents skills from looping on impossible tasks |
| `code-intelligence.md` | ForgeNexus-powered knowledge graph: impact analysis, 360° context, process tracing, pre-commit risk — optional enhancement for deep code awareness |
| `prompt-templates.md` | 12 prompt templates auto-selected by task type: RTF, CO-STAR, RISEN, CRISPE, Chain of Thought, Few-Shot, File-Scope, ReAct+Stop, Visual Descriptor, Reference Image, ComfyUI, Prompt Decompiler |
| `credit-killing-patterns.md` | 35 patterns that waste tokens: 7 task, 6 context, 6 format, 6 scope, 5 reasoning, 5 agentic |
| `prompt-techniques.md` | 5 safe techniques: Role Assignment, Few-Shot, XML Tags, Grounding Anchors, Chain of Thought. Also lists forbidden techniques: ToT, GoT, USC, prompt chaining, MoE |

Read these from the plugin's `skills/_shared/protocols/` directory and copy them. If plugin path is unavailable, write from the summaries above.

4. **Codebase discovery — detect greenfield vs brownfield:**

   **If project onboarding already ran** (Step 0.5 loaded `.forgewright/project-profile.json`) → use cached fingerprint data. Otherwise, run scans:

   Run these scans in parallel:
   ```
   find_by_name("package.json"), find_by_name("go.mod"), find_by_name("pyproject.toml"), find_by_name("Cargo.toml"), find_by_name("pom.xml")
   find_by_name("*", "src/"), find_by_name("*", "services/"), find_by_name("*", "frontend/"), find_by_name("*", "tests/"), find_by_name("*", "docs/")
   find_by_name("Dockerfile*"), find_by_name("*", ".github/workflows/"), find_by_name("*", "infrastructure/"), find_by_name("*", "terraform/")
   find_by_name(".production-grade.yaml")
   ```

   **Cursor EXPLORE Enhancement (automatic):**

   Cursor's built-in `explore` subagent can be triggered naturally. When the Agent sees you need to understand the codebase structure, it automatically runs up to 10 parallel searches using the `explore` subagent — each with a fast model, consuming no context in the main conversation. The explore subagent returns only the synthesized findings.

   To leverage this explicitly in the DEFINE phase, frame your discovery queries naturally:
   ```
   Agent (you): "Explore the backend structure — find services, APIs, and database models"
   → Cursor Agent spawns explore subagent with 10 parallel searches
   → explore subagent returns: [list of services], [API endpoints], [DB schemas], [key patterns]
   → You inject results into project profile
   ```

   This replaces manual `find_by_name` calls for complex discovery with a more intelligent, semantically-driven approach. Use both — `find_by_name` for exact file discovery, explore for architectural pattern analysis.

   **Classify the project:**

   | Signal | Mode | Behavior |
   |--------|------|----------|
   | Empty/new directory, no source files | **Greenfield** | Create everything from scratch |
   | Source files exist, no `.production-grade.yaml` | **Brownfield (unmapped)** | Deep onboarding, generate config, adapt |
   | Source files + `.production-grade.yaml` exist | **Brownfield (mapped)** | Use config paths, augment existing code |

   **If Greenfield** → log `✓ Greenfield project — creating from scratch`. Write minimal `.forgewright/project-profile.json` (to be populated progressively). Continue to step 5.

   **If Brownfield** → run the enhanced adaptation sequence:

   a. **Deep project onboarding** — run full `skills/_shared/protocols/project-onboarding.md` if not already done in Step 0.5. This produces:
      - `.forgewright/project-profile.json` — full fingerprint, health, patterns, risk
      - `.forgewright/code-conventions.md` — coding patterns for all skills to follow

   b. **Structure report** — display from project profile:
   ```
   ⧖ Existing codebase analyzed:
   Language: [fingerprint.language]  |  Framework: [fingerprint.framework]
   Architecture: [fingerprint.architecture]
   Tests: [health.test_count] ([health.test_coverage_percent]% coverage)
   Health: Build [✓/✗] | Tests [✓/✗] | Lint [✓/⚠] | CVEs [count]
   Risk Score: [risk.overall_risk_score]/10
   Patterns: [patterns.naming_convention], [patterns.component_pattern]
   ```

   c. **Path mapping** — if no `.production-grade.yaml`, generate one from discovered structure. Notify user via notify_user:

   ```
   I've analyzed your existing codebase. Here's what I found:

   [structure summary from project profile]

   I'll map the pipeline outputs to your existing structure.

   1. **Approve mapping (Recommended)** — Use detected paths, generate .production-grade.yaml
   2. **Customize paths** — Review and adjust the path mapping
   3. **Treat as greenfield** — Ignore existing code, create fresh structure
   4. **Chat about this** — Discuss how the pipeline adapts to your codebase
   ```

   d. **Write `.production-grade.yaml`** from discovered structure — map `paths.*` to actual directories found.

   e. **Set brownfield context** — write to `.forgewright/codebase-context.md`:
   ```markdown
   # Codebase Context
   Mode: brownfield
   Language: [detected]
   Framework: [detected]
   Existing paths: [mapping]
   Code conventions: .forgewright/code-conventions.md
   Project profile: .forgewright/project-profile.json

   ## Rules for all agents
   - Don't overwrite existing files without explicit user approval — blindly replacing files can destroy production-critical configuration or break existing consumers that depend on current signatures
   - READ .forgewright/code-conventions.md and MATCH existing code style
   - ADD to existing directories, don't replace them
   - If a file exists at the target path, create alongside it or extend it
   - Existing tests must still pass after changes (verified by quality-gate)
   - Check .forgewright/project-profile.json → risk.protected_paths before writing
   ```

   f. **Activate brownfield safety net** — follow `skills/_shared/protocols/brownfield-safety.md`:
      - Create session branch: `forgewright/session-{timestamp}`
      - Snapshot baseline (existing tests pass count)
      - Register protected paths
      - Log: `✓ Safety net active — branch: forgewright/session-{timestamp}, baseline: [N] tests`

   All skills read codebase-context.md and code-conventions.md before executing.

5. **Engagement mode:**

Notify user via notify_user:

```
How deeply should the pipeline involve you in decisions?

1. **Standard (Recommended)** — 3 gates + moderate architect interview. Best balance of speed and control.
2. **Express** — Minimal interaction. 3 gates only, auto-derive architecture from BRD. Fastest.
3. **Thorough** — Deep interviews at PM and Architect. Full capacity planning. Review phase summaries.
4. **Meticulous** — Maximum depth. Approve each ADR individually. Review every agent output. Full control.
```

Write the choice to `.forgewright/settings.md`:
```markdown
# Pipeline Settings
Engagement: [express|standard|thorough|meticulous]
```

All skills read this file at startup to adapt their depth. The engagement mode controls:
- **PM interview depth** — Express: 2-3 questions. Standard: 3-5. Thorough: 5-8. Meticulous: 8-12.
- **Architect discovery depth** — Express: auto-derive. Standard: 5-7 questions. Thorough: 12-15 with capacity planning. Meticulous: full walkthrough + individual ADR approval.
- **Phase summaries** — Thorough/Meticulous show intermediate outputs between phases.
- **Gate detail** — Meticulous adds per-skill output review at each gate.

5b. **Execution strategy — Scope Analysis & Recommendation:**

Before asking the user, the orchestrator should analyze the project scope and generate a data-driven recommendation — this avoids wasting the user's time with uninformed "how would you like to proceed?" questions. This runs AFTER Gate 2 (architecture approved), when the full scope is known.

**Step 5b-1: Scope Metrics Collection**

Read the approved architecture and BRD to extract these metrics:

```
From docs/architecture/ and api/:
  service_count    = number of backend services/modules
  endpoint_count   = number of API endpoints
  db_model_count   = number of database models/entities

From product-manager/BRD/:
  page_count       = number of frontend pages/screens
  user_story_count = number of user stories

From .production-grade.yaml:
  has_frontend     = features.frontend (true/false)
  has_mobile       = features.mobile (true/false)
  has_ai_ml        = features.ai_ml (true/false)
  architecture     = project.architecture (monolith/microservices)

Derived:
  parallel_task_count = count of active BUILD tasks (T3a + T3b? + T3c? + T4)
  integration_points  = number of cross-service API calls
  shared_deps         = number of shared libraries/packages
```

**Step 5b-2: Complexity Scoring**

Calculate a complexity score (1-10) from the metrics:

| Factor | Weight | Score Formula |
|--------|--------|---------------|
| Service count | 25% | 1-2: score 2, 3-5: score 5, 6+: score 8 |
| Page count | 15% | 1-3: score 2, 4-8: score 5, 9+: score 8 |
| Cross-cutting concerns | 20% | shared_deps × 2 + integration_points |
| Architecture type | 20% | monolith: 2, modular-monolith: 5, microservices: 8 |
| Feature breadth | 20% | +2 per active platform (web, mobile, AI/ML) |

```
complexity_score = weighted_sum(factors)
```

**Step 5b-3: Time Estimation**

Estimate wall-clock execution time for both modes:

```
Base times per task (approximate):
  T3a (Backend):  ~15-40 min (scales with service_count)
  T3b (Frontend): ~10-25 min (scales with page_count)
  T3c (Mobile):   ~10-20 min (scales with page_count)
  T4  (DevOps):   ~5-10 min
  T5  (QA):       ~10-20 min
  T6a (Security): ~5-10 min
  T6b (Review):   ~5-10 min

Sequential time:
  total_sequential = sum of all active task times (BUILD + HARDEN)

Parallel time:
  build_parallel  = max(T3a, T3b, T3c) + T4    # longest worker + sequential T4
  harden_parallel = max(T5, T6a, T6b)           # longest worker
  merge_overhead  = 2-5 min per parallel group  # validation + merge
  total_parallel  = build_parallel + merge_overhead + harden_parallel + merge_overhead

Speed gain:
  speedup_factor = total_sequential / total_parallel
  time_saved     = total_sequential - total_parallel
```

**Step 5b-4: Risk Assessment (Parallel Mode)**

Evaluate risks specific to parallel execution:

| Risk | Condition | Severity | Mitigation |
|------|-----------|----------|------------|
| **Merge conflict** | shared_deps > 2 OR services share DB models | Medium-High | Merge Arbiter auto-resolves configs; code conflicts escalate |
| **Shared schema divergence** | Multiple workers read same schema, one modifies | Medium | Contract locks schema as readonly for all workers |
| **Package version mismatch** | Workers add conflicting dependency versions | Low | Merge Arbiter unions package.json, runs dedupe |
| **Integration failure post-merge** | Workers build against stale API contracts | Medium | All workers share same frozen api/ snapshot |
| **Resource exhaustion** | 4 Gemini CLI processes × large context | Low | MAX_WORKERS cap + timeout per worker |
| **Rollback complexity** | Post-merge integration fail, hard to isolate | Medium | Per-branch rollback via merge-arbiter protocol |

```
Risk level:
  LOW    — service_count <= 2, no shared deps, monolith
  MEDIUM — service_count 3-5, some shared deps, modular
  HIGH   — service_count 6+, heavy integration, microservices
```

**Step 5b-5: Generate Recommendation**

Based on analysis, determine the recommended mode:

```
IF complexity_score >= 5 AND parallel_task_count >= 3 AND risk_level != HIGH:
  recommendation = PARALLEL
  reason = "Scope large enough to benefit from parallelization"

ELIF complexity_score >= 5 AND risk_level == HIGH:
  recommendation = PARALLEL with caution
  reason = "Large scope benefits from parallel, but high integration risk"

ELIF complexity_score < 5 OR parallel_task_count < 3:
  recommendation = SEQUENTIAL
  reason = "Scope too small for parallel overhead to pay off"
```

**Step 5b-6: Present to User**

Notify user via notify_user with the analysis:

```
━━━ Execution Strategy Analysis ━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Project Scope:
  Services: [N]  |  Pages: [N]  |  Endpoints: [N]
  Platforms: [Web / Mobile / AI]
  Architecture: [monolith / modular / microservices]
  Complexity Score: [X]/10

⏱ Time Estimates:
  Sequential:  ~[X] min (all tasks one-by-one)
  Parallel:    ~[Y] min (independent tasks simultaneous)
  ⚡ Speedup:   ~[Z]x faster ([N] min saved)

⚠️ Parallel Risks:
  • Merge conflict risk: [Low/Medium/High] — [detail]
  • Integration risk: [Low/Medium/High] — [detail]
  • Resource usage: [N] concurrent Gemini CLI workers

📋 Recommendation: [PARALLEL / SEQUENTIAL]
   Reason: [explanation]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **[Recommended mode] (Recommended)** — [brief why]
2. **[Other mode]** — [brief why user might want this]
3. **Chat about this** — Discuss the analysis or ask questions
```

**Step 5b-7: Save Decision**

Append to `.forgewright/settings.md`:
```markdown
Execution: [parallel|sequential]
Max_Workers: 4
Complexity_Score: [X]
Estimated_Time_Sequential: [N]min
Estimated_Time_Parallel: [N]min
Risk_Level: [LOW|MEDIUM|HIGH]
```

Write analysis report to `.forgewright/scope-analysis.md` for future reference.

When **Parallel** is selected, the BUILD and HARDEN phases use the parallel-dispatch skill (`skills/parallel-dispatch/SKILL.md`) to spawn git worktrees, distribute Task Contracts, and merge results. When **Sequential** is selected, the pipeline behaves as before.

6. **Detect existing workspace & load memory** — if `.forgewright/` has prior state, use session-lifecycle resume protocol. If `.forgewright/session-log.json` has interrupted state, offer resume. Otherwise offer clean start via notify_user.
   - **Memory load:** Run `python3 scripts/mem0-v2.py search "<project-name> <user-request-keywords>" --limit 5` to retrieve relevant project context. Inject results into your context for this session.
   - If no results or memory is empty, verify setup with `python3 scripts/mem0-v2.py stats`.

7. **Polymath pre-flight check:**
   - If `.forgewright/polymath/handoff/context-package.md` exists → read it, pass to PM as pre-loaded context. Log: `✓ Polymath context loaded — skipping redundant discovery`
   - If no polymath context, assess the user's request for knowledge gaps:
     - **Vague scope** (no specific problem domain), **no constraints** (scale, budget, team), **complex domain with no domain language**, **contradictory signals**
     - If gaps detected → read `skills/polymath/SKILL.md` and follow its instructions for pre-flight consultation before proceeding. The polymath will research, clarify with the user, and write a context package when ready.
     - If no gaps → proceed directly. Log: `✓ Request is clear — proceeding to BA/PM`
   - If user explicitly requests to skip polymath ("just build it", clear detailed spec) → proceed immediately.

7.5. **BA pre-flight check (after Polymath, before PM):**

   **Detect greenfield Full Build** (any of: Step 4 logged **Greenfield**; empty/minimal codebase with net-new product intent; user said "from scratch" / "new SaaS" / equivalent):

   - **Greenfield Full Build — BA is mandatory (no silent skip):**
     - Do **not** skip BA because the model self-scored 6W1H ≥ 6/7. Self-scores are optimistic; greenfield needs **documented client answers**.
     - **MUST** read `skills/business-analyst/SKILL.md` and run through at least **one full elicitation cycle** (stakeholder + structured questions per engagement depth: Express minimum **3** client-answered items, Standard **3–5**, Thorough **5+** with **2 rounds** if gaps remain) until:
       - `.forgewright/business-analyst/handoff/ba-package.md` exists **and**
       - Open gaps are either resolved or explicitly logged as **client-acknowledged assumptions** (not BA guesses).
     - Log: `⧖ Greenfield Full Build — mandatory BA before PM`
     - **Escape hatches (only these):** (1) `.production-grade.yaml` → `features.skip_define_ba: true`, or (2) `notify_user` with explicit option **"Skip BA — I accept incomplete requirements risk"** (user must choose; never auto-skip), or (3) `ba-package.md` already present from **this session** with completeness sign-off.

   **Brownfield Full Build** (existing meaningful codebase):

   - If `.forgewright/business-analyst/handoff/ba-package.md` exists → read it, pass to PM. Log: `✓ BA package loaded — requirements pre-validated`
   - If no BA package: run 6W1H completeness. If average < 6/7 **or** the request describes a **net-new product/surface** (major scope) → run BA as above (same minimum elicitation as Standard depth).
   - If score ≥ 6/7 **and** incremental change only **and** no net-new product → may skip BA. Log: `✓ Requirements sufficiently complete — proceeding to PM`

   **Non–Full-Build modes** (Feature, etc.): keep conditional BA per the Feature Mode section (6W1H below 6/7 → BA).

   - **Context-aware routing (v7.0):** If project-profile shows health issues, suggest addressing them:
     - `health.tests_pass == false` → suggest Harden mode first
     - `risk.known_cves > 0` (Critical/High) → warn and suggest Security audit
     - `risk.tech_debt_score > 7` → suggest addressing tech debt before new features

8. **Research the domain** — use search_web before asking the user anything (skip if polymath already researched).

9. **Create task tracking:**

Create a `task.md` file in `.forgewright/` with all 13 tasks and their statuses. Track dependencies and completion.

10. **Begin Phase 1** — read `phases/define.md` and start immediately. Do NOT ask "should I proceed?"
   - **Memory save (session start):** Run `python3 scripts/mem0-v2.py add "Session started: [mode] mode for [brief request]. Engagement: [level]" --category session`

**Key principle:** Research, plan, start building. Pause at the 3 approval gates. **Exception — greenfield Full Build:** BA elicitation is a **hard gate before PM**; do not jump to T1 until `ba-package.md` exists and minimum rounds above are satisfied (unless an explicit escape hatch in 7.5 was used). In Thorough/Meticulous mode, show phase summaries between major phases (inform; strategic gates still rule).

**After every user request is satisfied** (end of assistant turn, before going idle): run **Turn-Close memory** (see `session-lifecycle.md` §Per-request memory).

## Quality Gate Integration

After EVERY skill completes (in any mode — Full Build, Feature, Harden, etc.), run the Universal Quality Gate Protocol (`skills/_shared/protocols/quality-gate.md`):

1. **Per-skill validation:** Level 1 (Build), Level 2 (Regression), Level 3 (Standards), Level 4 (Traceability)
2. **Score computation:** 0-100 quality score per skill output
3. **Threshold enforcement:** Score < `quality.block_score` (default 60) → STOP. Score < `quality.minimum_score` (default 90) → WARN at next gate.
4. **Display mini-scorecard** after each skill in task_boundary status
5. **Aggregate scorecard** displayed at each strategic gate

**For brownfield projects:** Level 2 (Regression) compares against the baseline snapshot from brownfield-safety.md. Any previously-passing test that now fails = regression = STOP.

**For greenfield projects:** Level 2 is auto-satisfied (no baseline).

### Session Lifecycle Hooks

Call these hooks at the appropriate lifecycle points:

| Event | Hook | Action |
|-------|------|--------|
| Phase completes | `PHASE_COMPLETE(name, summary)` | Update session-log, save to memory, update quality metrics |
| Task completes | `TASK_COMPLETE(id, name, status, summary)` | Update session-log |
| Gate decided | `GATE_DECISION(gate#, decision, feedback)` | Update session-log, save decision to memory |
| Architecture approved | `ARCH_DECISION(tech_stack, services, rationale)` | Save architecture to memory — see Gate 2.5 |
| Error occurs | `ERROR(task_id, type, details)` | Update session-log, save blocker to memory |
| Pipeline ends | Session End | Summarize, save to memory, update project profile |
| User request answered | `TURN_CLOSE` | Mandatory memory `add` — see session-lifecycle §Per-request memory |

## User Experience Protocol

Follow the shared UX Protocol at `skills/_shared/protocols/ux-protocol.md`. Key rules:
1. **Don't** ask open-ended questions — always use notify_user with predefined numbered options (open-ended questions stall the pipeline because the model can't proceed without parsing free-text responses)
2. **"Chat about this"** always last option
3. **Recommended option first** with `(Recommended)` suffix
4. **Continuous execution** — work until next gate or completion
5. **Real-time progress** — constant ⧖/✓ progress updates via task_boundary
6. **Autonomy** — sensible defaults, self-resolve, report decisions

### Gate Companion — Polymath Integration

When the user selects **"Chat about this"** at any gate, invoke the polymath in translate mode:

```
Read skills/polymath/SKILL.md and follow its instructions in translate mode.
The polymath reads the gate artifacts, explains in plain language,
answers the user's questions via structured options,
then re-presents the original gate options when the user is ready.
```

This ensures non-technical users can understand what they're approving without the orchestrator needing to be the translator.

### Review Mode Integration

At each gate, adapt behavior based on `production/review-mode.txt`:

| Mode | Gate Behavior |
|------|--------------|
| **Full** | Run director reviews, show detailed findings, longer approval flow |
| **Lean** | Quick validation, abbreviated findings, streamlined approval |
| **Solo** | Skip gate pause, auto-proceed with quality gate score only |

```
REVIEW_MODE=$(cat production/review-mode.txt 2>/dev/null || echo "lean")
if [ "$REVIEW_MODE" = "solo" ]; then
  # Skip gate pause, log quality score
  Log: "Quality Gate Score: [X]/100 — Auto-proceeding (Solo mode)"
else
  # Show gate options as normal
fi
```

### Strategic Gates (4 total — 3 user-facing + 1 automated)

**Gate 1 — BRD Approval** (after T1):

Notify user via notify_user:
```
BRD complete: [X] user stories, [Y] acceptance criteria. Approve?

1. **Approve — start architecture (Recommended)** — BRD locked, proceed to Solution Architect
2. **Show BRD details** — Display the full BRD before deciding
3. **I have changes** — Request modifications to requirements
4. **Chat about this** — Free-form input about the BRD
```

**Gate 2 — Architecture Approval** (after T2):

Notify user via notify_user:
```
Architecture complete: [tech stack summary]. Approve to start building?

1. **Approve — start building (Recommended)** — Architecture locked, begin autonomous BUILD phase
2. **Show architecture details** — Walk through ADRs, diagrams, and API spec
3. **I have concerns** — Flag issues with architecture decisions
4. **Chat about this** — Free-form input about the architecture
```

**Gate 2.5 — Architecture Memory Persistence** (auto, no user interaction):

After Gate 2 is approved, automatically persist architecture decisions to memory:

```
1. Extract key architecture decisions:
   - Tech stack (language, framework, key libraries)
   - Service decomposition (services, modules)
   - API style (REST, GraphQL, etc.)
   - Database choices
   - Key architectural patterns

2. Run memory persistence commands:
   # Main architecture
   python3 scripts/mem0-v2.py add "ARCH: [tech stack] | SERVICES: [service list] | REASON: [key rationale]" --category architecture
   
   # Individual ADRs
   python3 scripts/mem0-v2.py add "DECISION: [ADR title] | ALTERNATIVE: [rejected options] | REASON: [why chosen]" --category decisions
   
   # Project scope
   python3 scripts/mem0-v2.py add "PROJECT: [project name] | SCOPE: [feature list] | STATUS: active" --category project

3. Log: "✓ Architecture decisions persisted to memory — [N] decisions saved"
```

**Why this matters:** Future sessions can search `mem0-v2.py search "architecture"` to retrieve the approved stack without re-reading all architecture files.

**Gate 3 — Production Readiness** (after T9):

**Read review mode first:**
```
REVIEW_MODE=$(cat production/review-mode.txt 2>/dev/null || echo "lean")
```

**Solo mode: Auto-proceed with quality gate score:**
```
if [ "$REVIEW_MODE" = "solo" ]; then
  Log: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  Log: "Phase 5 — SUSTAIN Complete [Review: Solo]"
  Log: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  Log: "Quality Gate Score: [X]/100"
  Log: "All phases complete — auto-proceeding (Solo mode)"
  Log: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  # Skip to final summary
fi
```

**Step G3.1 — Run VERIFIER subagent (before showing Gate 3 to user):**

Before presenting Gate 3 options to the user, run the Cursor `verifier` subagent to confirm all work is actually complete:

```
Invoke: /verifier Confirm all pipeline deliverables are complete and functional for [project-name]
```

The verifier subagent:
1. Reads `.forgewright/subagent-context/PIPELINE_SUMMARY.md` for scope
2. Reads all DELIVERY.json from completed tasks
3. Runs compilation and tests for each deliverable
4. Scans for TODOs, secrets, and obvious bugs
5. Writes report to `.forgewright/subagent-context/VERIFIER_REPORT.md`

**Step G3.2 — Present Gate 3 options (using verifier report):**

Notify user via notify_user (with verifier report summary):
```
All phases complete. Ship it?

## Verifier Report Summary
[VERIFIER_REPORT.md summary — PASS/FAIL count]

1. **Ship it — production ready (Recommended)** — Verifier confirmed ✓
2. **Show full report** — Display complete pipeline summary + verifier details
3. **Fix issues first** — Address remaining findings before shipping
4. **Chat about this** — Free-form input about production readiness
```

If verifier returned **FAIL** or **PARTIAL**:
```
⚠️ Verifier found issues. Review before shipping.

## Verifier Report
[FAIL/PARTIAL findings from VERIFIER_REPORT.md]

1. **Fix and retry verifier** — Address issues, re-run /verifier
2. **Show full report** — See all findings in detail
3. **Override — ship anyway** — Proceed with known issues (not recommended)
4. **Chat about this** — Discuss the findings
```

## Task Dependency Graph

Task execution with clear dependency tracking. The orchestrator reads the architecture output (number of services, pages, modules) and generates tasks accordingly. Supports both **sequential** and **parallel** execution based on `settings.md`.

### Sequential Mode (default)
```
T1: product-manager (BRD)
    ↓ [GATE 1]
T2: solution-architect (Architecture)
    ↓ [GATE 2]
T3a: software-engineer — implement backend services (1 per service)
T3b: frontend-engineer — implement frontend pages (1 per page group)
T4a: devops — Dockerfiles + CI skeleton
    ↓ (code written)
T5: qa-engineer — implement tests (unit/integ/e2e/perf)
T6a: security-engineer — STRIDE + code audit + dep scan
T6b: code-reviewer — arch conformance + quality review
    ↓
T7: devops (IaC + CI/CD)
T8: remediation (HARDEN fixes)
T9: sre (SLOs + chaos + capacity)
T10: data-scientist (conditional on AI/ML)
    ↓ [GATE 3]
T11: technical-writer (API ref + dev guides)
T12: skill-maker
    ↓
T13: Compound Learning + Assembly
```

### Parallel Mode
```
T1: product-manager (BRD)
    ↓ [GATE 1]
T2: solution-architect (Architecture)
    ↓ [GATE 2]
    ┌────────────────────── Parallel Group A (BUILD) ─────────────────┐
    │ T3a: software-engineer ──── worktree: .worktrees/T3a           │
    │ T3b: frontend-engineer ──── worktree: .worktrees/T3b           │
    │ T3c: mobile-engineer   ──── worktree: .worktrees/T3c  [cond.] │
    └────────────────── validate → merge → integration test ─────────┘
    T4a: devops (depends on merged T3a output)
    ↓ (code written)
    ┌────────────────────── Parallel Group B (HARDEN) ────────────────┐
    │ T5:  qa-engineer       ──── worktree: .worktrees/T5            │
    │ T6a: security-engineer ──── worktree: .worktrees/T6a           │
    │ T6b: code-reviewer     ──── worktree: .worktrees/T6b           │
    └────────────────── validate → merge → integration test ─────────┘
    ↓
T7: devops (IaC + CI/CD)
T8: remediation (HARDEN fixes)
T9: sre (SLOs + chaos + capacity)
T10: data-scientist (conditional on AI/ML)
    ↓ [GATE 3]
T11: technical-writer (API ref + dev guides)
T12: skill-maker
    ↓
T13: Compound Learning + Assembly
```

When parallel mode is active, the orchestrator reads `skills/parallel-dispatch/SKILL.md` for the dispatch flow.

### Task Dependencies

| Task | Blocked By | Notes |
|------|-----------|-------|
| T1 | — | First task, no blockers |
| T2 | T1 | Needs BRD |
| T3a | T2 | Backend — implement services from architecture |
| T3b | T2 | Frontend — implement pages from BRD |
| T4a | T2 | DevOps — Dockerfiles + CI skeleton |
| T5 | T3a, T3b | QA — needs code + test plan |
| T6a | T3a, T3b | Security — needs code + threat model |
| T6b | T3a, T3b | Review — needs code + checklist |
| T7 | T5, T6a, T6b | IaC + CI/CD — needs HARDEN output |
| T8 | T5, T6a, T6b | Remediation — needs HARDEN findings |
| T9 | T7, T8 | SRE — needs infra + fixes |
| T10 | T7, T8 | Conditional on AI/ML usage |
| T11 | T9 | Docs — needs all prior output |
| T12 | T9 | Skills — needs all prior output |
| T13 | T11, T12 | Final step |

### Dynamic Task Generation

After Gate 2 (architecture approved), the orchestrator reads the architecture output to determine work units:

1. **Count services** — Read `docs/architecture/` service list or `api/` specs. For each service, note it for sequential implementation in T3a.
2. **Count pages** — Read BRD user stories. Group into page clusters (auth, dashboard, settings, etc.). Note for T3b.
3. **Execute sequentially** — Each service and page group is implemented one at a time, reading the SKILL.md for the relevant skill.

### Conditional Tasks

- **T3b (Frontend):** Skip if `.production-grade.yaml` has `features.frontend: false`
- **T10 (Data Scientist):** Auto-detect by scanning for `openai`, `anthropic`, `langchain`, `transformers`, `torch`, `tensorflow` imports. If not detected and `features.ai_ml: false`, mark as completed immediately.

## Phase Execution

Each phase loads its dispatcher file for task management. In parallel mode, BUILD and HARDEN phases additionally invoke the parallel-dispatch skill.

| Phase | File | Tasks | Parallel Support |
|-------|------|-------|------------------|
| DEFINE | `phases/define.md` | T1, T2 | No (gate-protected) |
| BUILD | `phases/build.md` | T3a, T3b, T3c, T4a | Yes (Group A) |
| HARDEN | `phases/harden.md` | T5, T6a, T6b | Yes (Group B) |
| SHIP | `phases/ship.md` | T7, T8, T9, T10 |
| SUSTAIN | `phases/sustain.md` | T11, T12, T13 |

**Read the phase file BEFORE starting that phase. Never load all phase files at once.**

**Internal skill architecture** — each skill's internal phase structure (executed sequentially in Antigravity):

| Skill | Internal Phases |
|-------|----------------|
| software-engineer | Shared foundations first (Phase 2a), then per-service implementation (Phase 2b). Foundations ensure consistency. |
| frontend-engineer | UI Primitives first (Phase 3a), then Layout + Features (Phase 3b), then Pages (Phase 4). Primitives are foundational atoms. |
| qa-engineer | Unit, integration, e2e, performance tests — sequential by test type |
| security-engineer | Code audit, auth review, data security, supply chain — sequential by domain |
| code-reviewer | Architecture conformance, code quality, performance review — sequential by focus |
| devops | IaC, CI/CD, container orchestration — sequential by layer |
| sre | Chaos engineering, incident management, capacity planning — sequential |
| technical-writer | API reference, developer guides — sequential |

### Skill Dispatch Method

Read the skill's SKILL.md file and follow its instructions directly:

```
Read skills/<skill-name>/SKILL.md and follow its instructions.
Provide context: architecture files, BRD, workspace paths, etc.
```

## Conflict Resolution

Follow the shared protocol at `skills/_shared/protocols/conflict-resolution.md`.

| Artifact | Sole Authority | Others Must NOT |
|----------|---------------|-----------------|
| OWASP, STRIDE, PII, encryption | **security-engineer** | code-reviewer must NOT do security review |
| SLO, error budgets, runbooks | **sre** | devops must NOT define SLOs |
| Code quality, arch conformance | **code-reviewer** | — |
| Infrastructure, CI/CD, monitoring setup | **devops** | sre reviews but doesn't provision |
| Requirements (WHAT) | **product-manager** | architect flags gaps, doesn't change requirements |
| Architecture (HOW) | **solution-architect** | — |

### Remediation Feedback Loop

When HARDEN skills find Critical/High issues:
1. Orchestrator creates T8 (Remediation) task with findings
2. Fix code in `services/`, `frontend/`
3. Re-scan affected files after fixes
4. If still failing after **2 cycles** → escalate to user via notify_user

## Context Bridging

| Task | Reads From | Writes To (Project Root) | Writes To (Workspace) |
|------|-----------|--------------------------|----------------------|
| Polymath | User dialogue, web research | — | `polymath/context/`, `polymath/handoff/` |
| T1: PM | User input, polymath context, web research | — | `product-manager/BRD/` |
| T2: Architect | `product-manager/BRD/` | `api/`, `schemas/`, `docs/architecture/` | `solution-architect/` |
| T3a: Backend | `api/`, `schemas/`, `docs/architecture/` | `services/`, `libs/shared/` | `software-engineer/` |
| T3b: Frontend | `api/`, `product-manager/BRD/` | `frontend/` | `frontend-engineer/` |
| T4: DevOps | `services/`, `docs/architecture/` | Dockerfiles at root | `devops/containers/` |
| T5: QA | `services/`, `frontend/`, `api/` | `tests/` | `qa-engineer/` |
| T6a: Security | All implementation code | — | `security-engineer/` |
| T6b: Review | All implementation + architecture | — | `code-reviewer/` |
| T7: DevOps IaC | Architecture, implementation | `infrastructure/`, `.github/workflows/` | `devops/` |
| T8: Remediation | HARDEN findings | Fixes in `services/`, `frontend/` | — |
| T9: SRE | All prior outputs | `docs/runbooks/` | `sre/` |
| T10: Data Sci | Implementation (LLM usage) | — | `data-scientist/` |
| T11: Tech Writer | ALL workspace + project | `docs/` | `technical-writer/` |
| T12: Skill Maker | ALL workspace | `skills/` | `skill-maker/` |

**Deliverables** go to project root (respecting `.production-grade.yaml` path overrides). **Workspace artifacts** go to `.forgewright/<skill-name>/`.

## Workspace Architecture

```
.forgewright/
├── .protocols/              # Shared protocols (written at bootstrap)
├── .orchestrator/           # Pipeline state via task.md
├── product-manager/         # BRD, research
├── solution-architect/      # Architecture artifacts
├── software-engineer/       # Backend logs/artifacts
├── frontend-engineer/       # Frontend logs/artifacts
├── qa-engineer/             # Test artifacts
├── security-engineer/       # Security findings
├── code-reviewer/           # Quality findings
├── devops/                  # Infrastructure artifacts
├── sre/                     # Readiness artifacts
├── data-scientist/          # AI/ML artifacts (conditional)
├── technical-writer/        # Documentation artifacts
└── skill-maker/             # Custom skills
```

## Adaptive Rules

| Situation | Action |
|-----------|--------|
| No frontend needed | Skip T3b, simplify DevOps |
| Monolith architecture | Single Dockerfile, skip K8s/service mesh |
| LLM/ML APIs detected | Auto-enable T10 (Data Scientist) |
| Critical security finding | Create remediation task (T8) |
| QA failures > 20% | Flag to user |
| Architecture drift detected | Warn user (arch decisions are user-approved) |
| `features.frontend: false` | Skip T3b entirely |
| `features.ai_ml: false` | Skip T10 unless auto-detected |

## Security Hooks (Continuous)

Security runs during ALL phases:
- Block `rm -rf /`, `chmod 777`, destructive operations
- Block `.env`, `.key`, `.pem`, `credentials.json` from git
- Scan staged files for API keys, tokens, passwords
- Engineers scan for hardcoded secrets as they write code

## Autonomous Behavior

Every skill execution follows:
1. **Build and verify** — after writing code, run it. After writing tests, execute them.
2. **Quality gate** — run `skills/_shared/protocols/quality-gate.md` after each skill output. Score must meet threshold.
3. **Validation loop** — `while not valid: fix(errors); validate()`
4. **Self-debug** — read errors, identify root cause. After 3 failures: stop and report.
5. **Quality bar** — no TODOs, no stubs. All code compiles. All tests pass. Quality score ≥ 90.
6. **TDD enforced** — write test first, watch fail, implement, watch pass, refactor.
7. **Convention compliance** — read `.forgewright/code-conventions.md` (if brownfield) and match existing patterns.

## Partial Execution

| Command | Tasks Run |
|---------|----------|
| `just define` | T1, T2 only |
| `just build` | T3a, T3b, T4 (requires T2 output) |
| `just harden` | T5, T6a, T6b (requires BUILD output) |
| `just ship` | T7-T10 (requires HARDEN output) |
| `just document` | T11 only |
| `skip frontend` | Omit T3b |
| `start from architecture` | Skip T1, start at T2 |
| `just onboard` | Run project-onboarding only (no pipeline) |

## Final Summary — Quality Dashboard

At pipeline completion, generate the Quality Dashboard from `skills/_shared/protocols/quality-dashboard.md`. This replaces the legacy text banner with a comprehensive, machine-readable quality report.

The dashboard includes:
- **Overall quality score** (0-100) with grade (A-F)
- **Build health** — compilation, Docker, dependencies, lint
- **Test coverage** — unit, integration, E2E, contract, performance, regression
- **Security** — OWASP, STRIDE, CVEs, secrets scan
- **Code quality** — architecture conformance, conventions, stubs, imports
- **Acceptance** — BRD criteria coverage, traceability
- **Pipeline stats** — mode, duration, skills run, files changed

**Machine-readable output:** `.forgewright/quality-report-{session}.json`
**Quality trending:** `.forgewright/quality-history.json` (appended each session)

Also display the legacy summary for backward compatibility:
```
╔══════════════════════════════════════════════════════════════╗
║          Forgewright v{local_version} — COMPLETE                    ║
╠══════════════════════════════════════════════════════════════╣
║  Project: <name>                                             ║
║  Quality Score: [XX]/100 (Grade [A-F])                       ║
║                                                              ║
║  DEFINE:  ✓ BRD (<X> stories) ✓ Architecture (<pattern>)     ║
║  BUILD:   ✓ Backend (<N> services) ✓ Tests (<N> passing)     ║
║  HARDEN:  ✓ Security (<N> fixed) ✓ Code Review (<N> fixed)   ║
║  SHIP:    ✓ Docker ✓ CI/CD ✓ Terraform ✓ SRE approved       ║
║  SUSTAIN: ✓ Docs ✓ Skills (<N> created) ✓ Learnings captured ║
║                                                              ║
║  Workspace: .forgewright/              ║
║  Config: .production-grade.yaml                              ║
║  Report: .forgewright/quality-report-{session}.json              ║
╚══════════════════════════════════════════════════════════════╝
```

## Brownfield Safety Net

For ALL brownfield projects (any mode, not just Full Build), activate the safety net from `skills/_shared/protocols/brownfield-safety.md`:

| Safety Layer | When | Action |
|-------------|------|--------|
| Git branch | Pre-pipeline | Create `forgewright/session-{timestamp}` branch |
| Baseline snapshot | Pre-pipeline | Run existing tests, record pass count |
| Protected paths | Pre-pipeline | Register paths that must not be modified |
| Regression checks | After T3a, T3b, T5 | Verify existing tests still pass |
| Change manifest | During pipeline | Track every file create/modify/delete |
| Merge readiness | Pre-Gate 3 | Full regression + quality check |
| Rollback | On failure | Revert via session branch |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Running BUILD without DEFINE | Architecture decisions must exist first |
| Code reviewer doing OWASP review | security-engineer is sole OWASP authority |
| DevOps defining SLOs | sre is sole SLO authority |
| DevOps writing runbooks | sre writes runbooks to docs/runbooks/ |
| Skipping tests | Production grade means tested |
| Not running code after writing | Every skill verifies output compiles and runs |
| Skills working in isolation | Cross-reference via Context Bridging table |
| Over-asking the user | Respect engagement mode. Express: 3 gates only. Standard: 3 gates + moderate interview. Thorough/Meticulous: deeper interviews but always structured options. |
| Ignoring engagement mode | ALL skills must read settings.md and adapt depth. Express architect doesn't ask 15 questions. Meticulous PM doesn't skip to BRD after 2 questions. |
| One-size-fits-all architecture | Architecture is derived from constraints (scale, team, budget, compliance). A 100-user internal tool does NOT need microservices + K8s. |
| Writing stubs | No `// TODO: implement` in production code |
| Hardcoded paths | Read `.production-grade.yaml` for path overrides |
| Not leveraging skill architecture | Even though execution is sequential, each skill's internal phase structure ensures quality. Foundations before dependent work. |
| Duplicating security review | code-reviewer references security-engineer findings |
| Skipping quality gate | EVERY skill output must pass quality-gate.md — no exceptions, even in sequential mode |
| Ignoring code conventions in brownfield | Read `.forgewright/code-conventions.md` BEFORE writing code. Match existing patterns. |
| Modifying protected paths | Check brownfield-safety protected paths before ANY file write |
| No regression check in brownfield | After EACH build skill, verify existing tests still pass against baseline |
| Not saving session state | Call session lifecycle hooks at every phase/task/gate completion |

## Execution Learnings

> Auto-generated by ASIP. DO NOT DELETE.

### 2026-04-24 — Architectural: Self-Improving Agentic System Design
- **Problem:** Needed to design ASIP protocol for adaptive skill improvement
- **Failed Attempts:** N/A (initial design)
- **Research Source:** https://notebooklm.google.com/notebook/ca68602f-fcf2-4ab9-b8e9-9743868e18b6
- **Solution:** ASIP design combines ACE (incremental delta updates) + Multi-Agent Reflexion (diverse perspectives) + HyperAgents (self-modification)
- **Key Insight:** Self-improvement should be persistent (in code files), human-readable, and transferable. Avoid context collapse by using incremental updates.
- **Apply When:** Designing any self-improvement loop, skill adaptation, or knowledge retention system
