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

**80 skills, one orchestrator.** The orchestrator routes to the right skills based on what the user actually needs. No forced full-pipeline execution for everyday tasks.

**All skills are bundled in this plugin. Single install, everything included.**

### ⚠️ MANDATORY: Pipeline State Management (MCP Tools)
If you are running in an environment with the Forgewright MCP Server connected, YOU MUST explicitly manage the pipeline state using the exposed `fw_*` tools. This ensures any connected IDE or Dashboard accurately tracks your progress.
1. When starting a new goal/session, call `fw_start_pipeline`.
2. When transitioning from one Phase to the next (e.g. from Phase 0 Interpret to Phase 1 Define), you MUST call `fw_advance_to_next_phase`.
3. If a step requires explicit human approval (e.g. locking the architecture), call `fw_request_gate_approval`.
**Failure to call these MCP tools will cause the user's dashboard to permanently hang at "Interpret".**

### Middleware Chain (v8.0 — DeerFlow Pattern)

Every skill invocation is wrapped by an ordered middleware chain. Implementation details are in `skills/production-grade/middleware/`:

```
Pre-Skill:  ① SessionData → ② ContextLoader → ③b DryRunContext → ③ SkillRegistry → ④ Guardrail → ⑤ Summarization
            ═══ SKILL EXECUTION ═══
Post-Skill: ⑥ QualityGate → ⑦ BrownfieldSafety → ⑧ TaskTracking → ⑨ Memory → ⑩ GracefulFailure → ⑪ ASIP → ⑫ CircuitBreaker → ⑬ Bulkhead → ⑭ Verification
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
| ⑪ | ASIP | `skills/_shared/protocols/self-improving-loop.md` | after_skill + on_error | Canonical self-improvement (ASIP) |
| ⑫ | CircuitBreaker | `skills/_shared/protocols/circuit-breaker.md` | after_skill | Fault isolation + state machine |
| ⑬ | Bulkhead | `skills/_shared/protocols/bulkhead.md` | after_skill | Resource limits per worker type |
| ⑭ | Verification | `skills/_shared/protocols/verification.md` | after_skill | Evidence-First verification check |
**Middleware protocol:** `skills/_shared/protocols/middleware-chain.md`

### Progressive Skill Loading (v8.0 — DeerFlow Pattern)

Skills are loaded on-demand based on classified mode. Read `.forgewright/skills-config.json` for the mode→skill mapping.

```
Instead of loading all 80 skill descriptions (~95KB), only load skills relevant to the mode:
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

## Phase 0.B — Request Interpretation (MANDATORY)

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

### IntentGate — Explicit Intent Analysis (NEW Phase 0.D)

**Purpose:** Before classifying into modes, verify we understand the user's TRUE goal. This prevents literal misinterpretation — user says "fix the login" but actually wants OAuth added.

**Trigger:** Runs AFTER vague pattern scanning, BEFORE clarification questions.

**Three reflection questions — answer them YOURSELF as the agent:**

```
INTENTGATE ANALYSIS:
After scanning for vague patterns, ask yourself:
1. "What is the USER'S GOAL behind this request?" (not the literal action)
2. "What does success look like to the USER?" (what would they consider done?)
3. "What would the USER consider a complete fix/implementation?"

If the literal interpretation differs from the Intent Analysis:
→ Highlight the discrepancy in the structured request
→ If HIGH confidence: proceed with Intent, note mode reclassification
→ If MEDIUM/LOW confidence: ask 1 clarifying question to confirm intent
```

**Rules:**
- IntentGate is 3 reflection questions MAX — answer them yourself, do NOT ask the user
- Only ask the user if the intent is genuinely ambiguous (MEDIUM/LOW confidence)
- IntentGate adds 0 token overhead if confidence is HIGH — it's internal reflection
- If mode reclassified based on Intent Analysis, note it explicitly

**Output:** Append Intent Analysis to the structured request below.

3. **Auto-Clarification Loop (Phase 0.E - NEW v8.8):**
   - **Ambiguity Score Assessment:** Chấm điểm độ mơ hồ (Ambiguity Score: $0.0 - 1.0$). Nếu score $> 0.4$, bắt buộc dừng tiến trình code và đặt câu hỏi làm rõ.
   - **6W1H Completeness Checklist:** Chấm điểm độ hoàn thiện yêu cầu ($0.0 - 1.0$) dựa trên 7 tiêu chí 6W1H.
   - **Thực thi vòng lặp (No hard limit):** Tự động đặt câu hỏi làm rõ và lặp lại cho đến khi điểm hoàn thiện đạt $\ge 0.85$. Tuyệt đối không tiến hành code khi chưa đạt ngưỡng chất lượng đầu vào này.
   - **Chuẩn hóa Gherkin/BDD:** Mọi đặc tả tính năng đã làm rõ phải được viết dưới dạng kịch bản Given/When/Then để làm đầu vào cho QA sinh test case tự động.

4. **Generate Structured Request:**
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔍 INTERPRETED REQUEST (v8.8 Input Upgraded)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Mode: [detected]
   Confidence: [HIGH/MEDIUM/LOW]
   Ambiguity Score: [Score/1.0 - Halted if > 0.4]
   6W1H Completeness Score: [Score/1.0 - Target >= 0.85]

   Intent: "[original message quoted]"

   What you want:
     [1-sentence clear description]

   Intent Analysis (Phase 0.D):
   - User's true goal: [1-sentence — what they actually want, not what they said]
   - Success definition: [from the USER's perspective]
   - Intent vs Literal: [if different from what they said, note it here]
     ✗ Literal: [what they literally said]
     ✓ Intent: [what they actually need]

   Key decisions made:
     [Defaults applied with reasoning]

   Scope:
     ✓ [In scope]
     ✗ [Out of scope]

   BDD/Gherkin Scenarios (MANDATORY):
     Given [Context]
     When [Action]
     Then [Expected Outcome]

   Success criteria:
     [How we know it's done]

   Plan Quality & Self-Improvement Loop (MANDATORY Phase 2):
   - Initial Plan Score: [Score/10]
   - Optimization Iterations: [N times (0 if score >= 9.0 on first try)]
   - Research Gate Triggered: [Yes/No (and what was researched if Yes)]
   - Final Plan Score: [Score/10 - Must be >= 9.0]
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

**Phase 1 — Analyze the request:**

Read `.forgewright/subagent-context/INTERPRETED_REQUEST.md` (from chat-interpreter Phase 0.A) for the authoritative request analysis. The chat-interpreter has already performed 9-dimension extraction and mode detection.

## Enhanced Mode Classification with Fuzzy Matching (v8.7+)

Detailed classification confidence levels, fuzzy trigger matching rules, trigger patterns, fallback chains, and planning/UX suggestions are documented in [references/mode-classification.md](file:///Users/buiphucminhtam/GitHub/forgewright/skills/production-grade/references/mode-classification.md).

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

!`cat skills/_shared/protocols/plan-quality-loop.md 2>/dev/null || echo "Protocol not found — apply defaults: every skill must plan first, score against 9 criteria, complexity-scaled threshold (6.0-9.0 by mode), improve loop with research + skill self-improvement"`

## Webhook State & Telemetry Protocol

**ALL skills** and Orchestrator MUST use the Local Webhook to report state changes and token usage. OSC sequences are deprecated. You may use direct HTTP Webhook via curl OR continue using MCP Tools (which will automatically proxy to the Webhook).

!`cat skills/_shared/protocols/webhook-telemetry-protocol.md 2>/dev/null || echo "Protocol not found — apply defaults: POST to FORGEWRIGHT_WEBHOOK_URL/api/v1/telemetry and /api/v1/state instead of using OSC sequences."`

### ⚠️ ASIP Enforcement for Plan Quality

**After 2 consecutive failed plan attempts (score < 9.0):**
1. **TRIGGER MANDATORY RESEARCH GATE** — Cannot skip
2. **Record attempt:** `bash scripts/forgewright-session-tracker.sh plan <score>`
3. **Check if gate needed:** `bash scripts/forgewright-session-tracker.sh check`
4. **Research Priority Order:**
   ```
   a) CHECK NotebookLM availability:
      nlm --version 2>/dev/null || echo "NOT_AVAILABLE"
      └─ If NOT_AVAILABLE → SKIP to (b)
   
   b) TRY NotebookLM CLI (if available):
      nlm notebook create "[Project] - [Skill] - [Topic]"
      nlm research start "[topic]" --mode deep
      nlm notebook query <id> "Best practices?"
   
   c) FALLBACK to Web Search (always available):
      WebSearch: "best practices [topic]"
      WebSearch: "[framework] [pattern] implementation"
   ```
5. SYNTHESIZE findings into 1-3 actionable insights
6. Update skill SKILL.md (Planning Improvements section)
7. Append to `.forgewright/plan-lessons.md`
8. RE-PLAN with injected knowledge
9. Re-score — only proceed if ≥ 9.0

**⚠️ BA Scope Exception:**
- If weak criteria reveals **unclear project requirements**, STOP research and trigger BA skill
- BA will ask clarifying questions → define scope → resume Plan Quality Loop
- This is NOT blocking — scope elicitation IS the Forgewright workflow

**This is NON-NEGOTIABLE. The system will not proceed until research is complete.**

## Execution Blocker Loop

> **DEPRECATED — Use ASIP (Adaptive Self-Improving Loop) instead.**
>
> The canonical execution blocker loop is now in `self-improving-loop.md` (ASIP Phase 2).
> This section is kept for reference only.

~~**ANY time a blocker is encountered during implementation, MUST run this loop BEFORE asking user:**~~

~~!`cat skills/_shared/protocols/execution-blocker-loop.md 2>/dev/null || echo "Protocol not found — apply defaults: assess → research (web/codebase/docs) → synthesize → attempt → verify → improve skill. Max 3 cycles."`~~

See **ASIP (Adaptive Self-Improving Loop)** below for the canonical execution blocker loop.

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

## Optional Expert CLI Mode

**Escalate high-stakes planning/review/gates through a local Claude CLI or Codex CLI only when explicitly enabled:**

!`cat skills/_shared/protocols/expert-cli-mode.md 2>/dev/null || echo "Protocol not found — expert CLI mode disabled by default. Use forge expert status/on/off/use and forge token on/status."`

Expert CLI mode is optional, supports single-provider setups, and must not require both Claude and Codex to be installed.

## Mode Execution (Non-Full-Build)

Detailed execution instructions, QA test sequences, and task flows for each non-Full-Build mode (e.g. Goal, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Research, Optimize, Design, Mobile, Game Build, XR Build, Analyze, Custom, Debug, AI Build, Migrate) are documented in [references/mode-execution.md](file:///Users/buiphucminhtam/GitHub/forgewright/skills/production-grade/references/mode-execution.md).

## Chat Interpretation (Pre-Processing — BEFORE everything else)

> **Powered by prompt-master methodology.** Run BEFORE Phase 0.C on every user message.

Every user message is first interpreted through the `chat-interpreter` Cursor subagent. This converts vague natural language into a structured, unambiguous pipeline request — eliminating the need for users to speak "prompt engineer."

### 🛑 Momentum Breaker (MANDATORY)

Before invoking the chat interpreter or calling any tools to process a new user request, **you MUST output the exact string `[PIPELINE_RESET]` to the user**. 
This physical action acts as a "brake" to interrupt Conversational Momentum. Once this flag is outputted, you are strictly bound to follow the 5-step pipeline (0.A -> 0.B -> 1 -> 2 -> 3) without bypassing to direct tool execution (Tool-first reflex).

**Phase 0.A — Chat Interpretation:**

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
→ Proceeding to Phase 0.C
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

Prompts, techniques, and template mappings for various AI code interfaces, reasoning engines, local LLMs, image generators, and autonomous agents are documented in [references/tool-routing.md](file:///Users/buiphucminhtam/GitHub/forgewright/skills/production-grade/references/tool-routing.md).

## Auto-Initialization, Updates, and Session Lifecycle

System requirements, power level selection, auto-update mechanisms, session loading, memory retrieval, subagent context preparation, and subagent invocation protocols are documented in [references/initialization-and-lifecycle.md](file:///Users/buiphucminhtam/GitHub/forgewright/skills/production-grade/references/initialization-and-lifecycle.md).

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
| `code-intelligence.md` | GitNexus-powered knowledge graph: impact analysis, 360° context, process tracing, pre-commit risk — optional enhancement for deep code awareness |
| `prompt-templates.md` | 12 prompt templates auto-selected by task type: RTF, CO-STAR, RISEN, CRISPE, Chain of Thought, Few-Shot, File-Scope, ReAct+Stop, Visual Descriptor, Reference Image, ComfyUI, Prompt Decompiler |
| `credit-killing-patterns.md` | 35 patterns that waste tokens: 7 task, 6 context, 6 format, 6 scope, 5 reasoning, 5 agentic |
| `prompt-techniques.md` | 5 safe techniques: Role Assignment, Few-Shot, XML Tags, Grounding Anchors, Chain of Thought. Also lists forbidden techniques: ToT, GoT, USC, prompt chaining, MoE |

Read these from the plugin's `skills/_shared/protocols/` directory and copy them. If plugin path is unavailable, write from the summaries above.

4. **Codebase discovery — detect greenfield vs brownfield:**

   **If project onboarding already ran** (Phase 0.B loaded `.forgewright/project-profile.json`) → use cached fingerprint data. Otherwise, run scans:

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

   a. **Deep project onboarding** — run full `skills/_shared/protocols/project-onboarding.md` if not already done in Phase 0.B. This produces:
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

> **Quality Scoring:** See `skills/_shared/protocols/quality-gate.md` for the authoritative scoring rubric (4 levels, 100-point scale: Build 25, Regression 25, Standards 30, Traceability 20) and grade thresholds (A/B/C/F).


### Session Handoff Protocol

When context reaches 80% capacity or session needs to transfer:

```
┌─────────────────────────────────────────────────────────────────────┐
│ SESSION HANDOFF PROTOCOL │
├─────────────────────────────────────────────────────────────────────┤
│ │
│ 1. GENERATE handoff document at .forgewright/handover-[date].md │
│ │
│ 2. INCLUDE in handoff: │
│ - Goals accomplished │
│ - What was done │
│ - Key decisions made │
│ - Blockers / open questions │
│ - Next steps │
│ │
│ 3. START fresh session with only: │
│ - Handover document │
│ - Project brief │
│ - Current task context │
│ │
│ 4. VERIFY handoff completeness: │
│ - Can the new session resume without asking user to re-explain? │
│ - Are all decisions documented? │
│ - Are blockers clearly stated? │
│ │
└─────────────────────────────────────────────────────────────────────┘
```

**When to trigger handoff:**
- Context at ≥ 80% capacity
- Session exceeds 2 hours
- User takes a break and returns
- Multi-day project continuation

### Token Budget Management

```
┌─────────────────────────────────────────────────────────────────────┐
│ TOKEN BUDGET MANAGEMENT │
├─────────────────────────────────────────────────────────────────────┤
│ │
│ Threshold Monitoring: │
│ - 70% context → Begin aggressive compaction │
│ - 80% context → Trigger checkpoint + handoff preparation │
│ - 95% context → HALT and generate handoff │
│ │
│ Compaction Strategy: │
│ - Replace verbose logs with summaries │
│ - Remove redundant context │
│ - Keep only essential decisions │
│ - Archive intermediate artifacts │
│ │
│ Preservation Priority: │
│ 1. Current task state │
│ 2. Key architectural decisions │
│ 3. Unresolved blockers │
│ 4. Recent learnings │
│ │
└─────────────────────────────────────────────────────────────────────┘
```

### Memory Integration Best Practices

**Persistent Memory (ChromaDB + sentence-transformers):**
- Store architectural decisions: `mem0-v2.py add "ARCH: [details]"`
- Store project context: `mem0-v2.py add "PROJECT: [name]"`
- Store technical learnings: `mem0-v2.py add "LESSON: [insight]"`

**Session Memory (localStorage):**
- Current task progress
- Recently modified files
- User preferences

**Cross-Session Continuity:**
- Project profile loaded at session start
- Previous session learnings available
- Long-term context preserved

### Error Recovery Patterns

| Error Type | Detection | Recovery |
|-----------|-----------|----------|
| Compilation failure | Build step fails | Read error, fix syntax, retry |
| Test failure | QA step fails | Identify test, fix code, re-run |
| Missing dependency | npm install fails | Install dependency, retry |
| File conflict | Merge fails | Manual resolution, re-merge |
| API contract violation | Integration fails | Update contract, sync teams |
| Security vulnerability | Scan finds CVE | Apply patch or workaround |

**Retry Limits:**
- Compilation errors: 3 retries
- Test failures: 3 retries (with fixes)
- Missing deps: 2 retries
- Merge conflicts: escalate to user
- Security issues: 1 attempt, then escalate

### Logging Standards

Every skill execution should log:

```markdown
## Skill Execution Log

**Skill:** [name]
**Started:** [timestamp]
**Ended:** [timestamp]
**Duration:** [X] minutes

**Actions Taken:**
- [List of major actions]

**Files Created:**
- [List]

**Files Modified:**
- [List]

**Decisions Made:**
- [List with rationale]

**Blockers Encountered:**
- [List]

**Quality Score:** [X]/100
**Passed Quality Gate:** [Yes/No]

**Handoff Notes:**
- [Any context needed for next session]
```

### Metrics Collection

Track these metrics per pipeline execution:

```json
{
  "session_id": "uuid",
  "timestamp": "ISO8601",
  "mode": "full-build|feature|...",
  "engagement": "express|standard|thorough|meticulous",
  "execution": "sequential|parallel",
  "duration_minutes": 0,
  "skills_invoked": ["skill1", "skill2"],
  "tasks_completed": 0,
  "tasks_total": 0,
  "quality_scores": {
    "build": 0,
    "harden": 0,
    "overall": 0
  },
  "gates_approved": 0,
  "gates_rejected": 0,
  "errors_encountered": 0,
  "retry_count": 0,
  "user_approvals": 0
}
```

### Metrics, Performance, and Configuration Reference

Metric collection schemas, performance targets, dependency injection patterns, configuration schemas, environment variables, emergency procedures, communication protocols, test topologies, CI/CD templates, deployment checklists, and the complete 80-skill catalog are documented in [references/technical-reference.md](file:///Users/buiphucminhtam/GitHub/forgewright/skills/production-grade/references/technical-reference.md).

### Knowledge Transfer Protocol

When transitioning between sessions:

```
1. EXECUTIVE SUMMARY (3 sentences)
   - What was the goal?
   - What was accomplished?
   - What remains?

2. TECHNICAL STATE
   - Architecture decisions (key ones)
   - Current blockers
   - Next actions

3. FILE INVENTORY
   - Created/modified files
   - Their purposes

4. TESTING STATUS
   - Tests passing/failing
   - Coverage percentage

5. OPEN QUESTIONS
   - Decisions pending
   - Ambiguities unresolved

6. CONTEXT FOR CONTINUATION
   - Exact command to resume
   - Files to examine first
```

### Skill Catalog

Complete list of 80 skills organized by category:

**Orchestration & Meta:**
1. Orchestrator (production-grade)
2. Polymath
3. Parallel Dispatch
4. Memory Manager
5. Skill Maker
6. MCP Generator
7. Token Tracker
8. Instinct System
9. Strategic Compaction
10. Hook Expert (generated/hook-expert)

**Engineering:**
11. Business Analyst
12. Product Manager
13. Solution Architect
14. Software Engineer
15. Software Engineer (Go)
16. Software Engineer (Python)
17. Software Engineer (Rust)
18. Frontend Engineer
19. Fullstack Engineer
20. QA Engineer
21. Security Engineer
22. Code Reviewer
23. Code Reviewer (Go)
24. Code Reviewer (Python)
25. Code Reviewer (Rust)
26. Code Quality Engineer
27. DevOps
28. SRE
29. Build & Release Engineer
30. Data Scientist
31. Technical Writer
32. UI Designer
33. Interaction Designer
34. Art Director
35. Vision Review
36. Mobile Engineer
37. Mobile Tester
38. API Designer
39. Database Engineer
40. Debugger
41. Prompt Engineer
42. Prompt Optimizer
43. AI Engineer
44. Accessibility Engineer
45. Performance Engineer
46. UX Researcher
47. Data Engineer
48. XLSX Engineer
49. Project Manager
50. Eval Engineer

**Game Development:**
51. Game Designer
52. Game Engineer
53. AI Behavior Engineer
54. Animation Engineer
55. Game Accessibility Engineer
56. LiveOps Engineer
57. Unity Engineer
58. Unity MCP
59. Unreal Engineer
60. Godot Engineer
61. Godot Multiplayer
62. Roblox Engineer
63. Phaser 3 Engineer
64. Three.js Engineer
65. Level Designer
66. Narrative Designer
67. Technical Artist
68. Game Audio Engineer
69. Game Asset & VFX
70. Unity Shader Artist
71. Unity Multiplayer
72. Unreal Technical Artist
73. Unreal Multiplayer
74. XR Engineer

**Growth & Marketing:**
75. Growth Marketer
76. Conversion Optimizer

**Testing:**
77. Autonomous Testing

**Data Acquisition:**
78. Web Scraper
79. NotebookLM Researcher

**Workflow:**
80. Goal-Driven

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

A comprehensive table of common operational/architectural mistakes and their resolutions is documented in [references/common-mistakes.md](file:///Users/buiphucminhtam/GitHub/forgewright/skills/production-grade/references/common-mistakes.md).

## Execution Learnings

> Auto-generated by ASIP. DO NOT DELETE.

### 2026-04-24 — Architectural: Self-Improving Agentic System Design
- **Problem:** Needed to design ASIP protocol for adaptive skill improvement
- **Failed Attempts:** N/A (initial design)
- **Research Source:** https://notebooklm.google.com/notebook/ca68602f-fcf2-4ab9-b8e9-9743868e18b6
- **Solution:** ASIP design combines ACE (incremental delta updates) + Multi-Agent Reflexion (diverse perspectives) + HyperAgents (self-modification)
- **Key Insight:** Self-improvement should be persistent (in code files), human-readable, and transferable. Avoid context collapse by using incremental updates.
- **Apply When:** Designing any self-improvement loop, skill adaptation, or knowledge retention system
