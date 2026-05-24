# Plan Quality Loop Protocol

> **Purpose:** Every skill MUST plan before acting. Plans are scored against a quality rubric. Plans below threshold enter a LEARN → RESEARCH → IMPROVE SKILL cycle until quality is sufficient. NO skill may begin implementation without a passing plan score.

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

## When to Apply

**EVERY skill invocation.** No exceptions. When any skill is called, it MUST:
1. Create an action plan before doing any work
2. Score the plan against the rubric
3. Improve until score ≥ threshold
4. Only then execute

### Evidence-First in Planning

Every plan is built on **assumptions**. State them. Verify them. Or don't act on them.

**Before writing any plan:**

```
1. ASSUMPTION: [State every assumption you're building the plan on]
   - "I ASSUME the API uses JWT auth" → WRITE test_auth.py → RUN → evidence confirms/denies
   - "I ASSUME the DB is PostgreSQL" → WRITE test_db.py → RUN → evidence confirms/denies
   - "I ASSUME the user wants REST, not GraphQL" → Can write artifact? → YES: write it / NO: ask user

2. For each assumption:
   - Evidence CONFIRMS → safe to build on, cite the test output
   - Evidence DENIES → update assumption, revise plan
   - Evidence ABSENT → WRITE VERIFICATION ARTIFACT → RUN → get evidence
     → Test passes → confirmed → proceed
     → Test fails → assumption wrong → research + replan
     → Cannot write artifact → flag as ⚠️ UNVERIFIED → ask user (last resort)
```

**Plan template with assumption section:**

```
## Plan: [Task name]

### Assumptions (VERIFIED before planning)
- ✅ [assumption] → [artifact output / file:line — confirmed]
- ❌ [assumption] → [artifact output / file:line — disproved, corrected to X]
- ⚠️ [assumption] → UNVERIFIED → [artifact written, pending run / cannot artifact: asking user]

### Implementation Steps
...
```

**Scoring: Assumption quality is part of Completeness (criterion 1).**
A plan with 3 unverified assumptions that could invalidate the entire approach scores 0.5 or below on Completeness.

**Deterministic assumption check:**
For each assumption marked ✅ CONFIRMED, verify that evidence is cited:
- Evidence MUST be: (a) test/script output, (b) file:line citation, or (c) command output
- If "confirmed" but no evidence cited → Completeness scores ≤ 0.5


### Plan Depth by Skill Type

Not all skills need the same plan depth. Scale the plan to the task:

| Skill Type | Plan Depth | Example |
|------------|------------|--------|
| **Multi-step orchestrated** (Full Build, Feature, AI Build, Ship, Game Build) | Full plan — all 8 criteria weighted equally | Architecture plan, feature spec, deployment strategy |
| **Analysis skills** (Code Review, Security, Harden, Analyze) | Focused plan — what to examine, methodology, output format | "Review auth module for OWASP Top 10, check rate limiting, output severity-ranked findings" |
| **Creative skills** (PM, Architect, Game Design, UI Design) | Design plan — requirements mapping, alternatives considered, constraints | "Design auth: JWT vs session, chose JWT because stateless. Risk: token theft" |
| **Execution skills** (Software Engineer, Frontend, QA, DevOps, DB Engineer) | Implementation plan — files to create/modify, sequence, tests | "Create auth middleware → add routes → write 5 unit tests → integration test" |
| **Investigation skills** (Debugger, Polymath, Research) | Investigation plan — hypotheses, evidence sources, methodology | "3 hypotheses ranked. Check logs first, then DB state, then recent commits" |
| **Writing skills** (Technical Writer, Document) | Content plan — outline, audience, sections, sources | "API reference: 12 endpoints, include request/response examples, audience: frontend devs" |

## Loop Flow

```
┌───────────────────────────────────────────────────────────────┐
│ Phase N — Planning Stage                                      │
│                                                               │
│  1. PLAN      → Skill creates plan                            │
│  2. SCORE     → Evaluate against rubric (8 criteria)         │
│  3. CHECK     → Score ≥ threshold?                           │
│      ├─ YES   → PROCEED to implementation                     │
│      └─ NO    → 4. LEARN + IMPROVE SKILL                     │
│                  (identify weak criteria,                       │
│                   APPEND lessons to SKILL.md)                  │
│              → 5. RESEARCH (Enhanced Research Gate)           │
│                  (NotebookLM CLI → Web Search fallback)         │
│              → 6. RE-PLAN                                     │
│                  (re-read improved skill + lessons)             │
│              → Go back to Step 2                               │
│                  (max 3 iterations)                            │
└───────────────────────────────────────────────────────────────┘

⚠️ BA Exception: If unclear scope → trigger BA skill first
```

## Scoring Rubric

8 criteria × 1.25 points each = **10.0 max score**

| # | Criterion | 0 pts | 0.5 pts | 1.0 pts | 1.25 pts |
|---|-----------|-------|---------|---------|----------|
| 1 | **Completeness** — All requirements covered? | Missing major items | Partial coverage | All requirements addressed | + Edge cases covered |
| 2 | **Specificity** — Concrete actions, not vague? | "Implement feature" | Some specifics | Clear files, functions, steps | + Line-level changes |
| 3 | **Feasibility** — Executable with available tools? | Requires unavailable tech | Partially feasible | Fully executable | + Fallback paths defined, verified by `scripts/asip-deterministic-check.sh` |
| 4 | **Risk awareness** — What could go wrong? | No risks mentioned | 1-2 obvious risks | All major risks identified | + Mitigation per risk |
| 5 | **Scope control** — Right-sized, not over-engineered? | Way too broad | Slightly overbuild | Right-sized | + Explicitly excludes out-of-scope |
| 6 | **Dependency ordering** — Logical sequence? | Random order | Mostly ordered | Correct dependency graph | + Parallel opportunities noted |
| 7 | **Testability** — How to verify success? | No verification | "Run tests" | Specific test commands/criteria | + Deterministic check passes (`bash scripts/asip-deterministic-check.sh`) |
| 8 | **Impact assessment** — What existing code is affected? | Not mentioned | Files listed | Files + functions + risk | + Blast radius quantified |

## Threshold

```yaml
# Default (configurable in .production-grade.yaml)
planQuality:
  threshold: 9.0        # minimum score to proceed
  maxIterations: 3       # safety cap
  researchOnImprove: true  # search for reference cases
  deterministicCheck: true  # run asip-deterministic-check.sh on Feasibility/Testability
```

## Scoring Output Format

After scoring, display concisely:

```
┌─ Plan Quality: [Phase Name] ─── Iteration [N] ──┐
│ Completeness:     1.25  ████████████████████ ✓   │
│ Specificity:      0.50  ████████░░░░░░░░░░░ ⚠   │
│ Feasibility:      1.25  ████████████████████ ✓   │
│ Risk awareness:   1.25  ████████████████████ ✓   │
│ Scope control:    1.00  ████████████████░░░ ✓    │
│ Dep. ordering:    1.00  ████████████████░░░ ✓    │
│ Testability:      0.50  ████████░░░░░░░░░░░ ⚠   │
│ Impact assess:    0.50  ████████░░░░░░░░░░░ ⚠   │
│ ──────────────────────────────────────────────── │
│ Total: 7.25/10  │  Threshold: 9.0  │  ❌ IMPROVE │
│ Weak: Specificity, Testability, Impact           │
└──────────────────────────────────────────────────┘
```

## Scoring Quality Check (Meta-Evaluation)

**After every score, the evaluator MUST evaluate its own scoring.** This prevents lazy scoring, inflated scores, and inconsistent standards.

**DETERMINISTIC VERIFICATION (MANDATORY):**
Subjective LLM scoring is insufficient without objective checks. For any **Execution Plan**, run the deterministic checker before finalizing the score:

```bash
bash scripts/asip-deterministic-check.sh plan.md
```

| Exit code | Meaning | Auto-action |
|-----------|---------|------------|
| `0` | All checks pass | Proceed — Feasibility=1.25, Testability=1.25 |
| `2` | Warnings only | Proceed — Feasibility=1.0, Testability=1.0 |
| `1` | Critical failures | Block — Feasibility=0, Testability=0, score < threshold |

If the script is unavailable, fall back to manual checks: verify referenced files exist, test commands are real, and acceptance criteria are concrete. Do not score Feasibility or Testability above 0.5 without verification.

### Self-Evaluation Checklist (5 checks)

After producing a score, answer these questions honestly:

| # | Check | Symptom of Bad Scoring | Action |
|---|-------|----------------------|--------|
| 1 | **Evidence-based?** — Did each criterion cite specific evidence from the plan? | Scored 1.0+ without pointing to specific plan content | Re-score: require quote/reference for each ≥ 1.0 |
| 2 | **Leniency bias?** — Did you score high to avoid the improve loop? | Multiple criteria at 1.0+ but plan has vague sections | Re-score with stricter lens: "Would a senior reviewer accept this plan as-is?" |
| 3 | **Harshness bias?** — Did you score low to force unnecessary iteration? | Criteria at 0.5 but plan actually addresses the point adequately | Re-score: check if the plan genuinely fails or just uses different wording |
| 4 | **Consistency?** — Would the same plan get the same score if scored again? | Scores feel arbitrary, not anchored to rubric descriptions | Re-anchor: re-read the 0/0.5/1.0/1.25 descriptions for each criterion |
| 5 | **Proportionality?** — Does the score match the plan's actual quality? | High overall score but plan has obvious gaps, or low score but plan is solid | Compare: "If I had to implement from this plan alone, would I succeed?" |

### Meta-Score Confidence

After the 5 checks, assign a confidence level:

| Confidence | Meaning | Action |
|------------|---------|--------|
| **High** | All 5 checks pass, scoring is evidence-based and consistent | ✅ Accept the score as-is |
| **Medium** | 1-2 checks flagged minor concerns | ⚠️ Re-score the flagged criteria only, then accept |
| **Low** | 3+ checks flagged OR leniency/harshness bias detected | 🔄 Full re-score with fresh evaluation |

### Scoring Output (with meta-evaluation)

```
┌─ Plan Quality: [Phase Name] ─── Iteration [N] ──┐
│ [... criteria scores ...]                        │
│ Total: 9.25/10  │  Threshold: 9.0  │  ✅ PASS    │
│ Scoring Confidence: HIGH ✓                       │
│ (All 5 checks passed — evidence-based, no bias)  │
└──────────────────────────────────────────────────┘
```

### Self-Improvement of Scoring Process

When meta-evaluation reveals scoring problems, APPEND improvement to THIS protocol's understanding:

Log to `.forgewright/scoring-lessons.md`:
```markdown
## Scoring Issue: [Date] — [Bias Type]
- **Problem:** Gave Completeness 1.25 without verifying edge case coverage
- **Fix:** Before scoring Completeness ≥ 1.0, explicitly list which edge cases the plan covers
```

### Anti-Recursion Rule

> **ONE meta-evaluation pass only.** Do NOT meta-evaluate the meta-evaluation. The self-evaluation checklist runs once per scoring round. If confidence is Low, do ONE full re-score, accept the result, and move on. This prevents infinite meta-recursion.

## Step 4: LEARN + SKILL SELF-IMPROVEMENT

When plan scores below threshold:

1. **Identify weak criteria** — which rubric items scored ≤ 0.5?

2. **Identify the responsible skill** — which SKILL.md produced this plan?
   - Feature Mode PM step → `skills/product-manager/SKILL.md`
   - Architect step → `skills/solution-architect/SKILL.md`
   - Game Design step → `skills/game-designer/SKILL.md`
   - DevOps plan → `skills/devops/SKILL.md`
   - Security audit plan → `skills/security-engineer/SKILL.md`
   - AI Build PM step → `skills/ai-engineer/SKILL.md`
   - etc.

3. **Log lesson to session file** — APPEND to `.forgewright/plan-lessons.md`:

```markdown
## [Phase Name] — Iteration [N] — Score: [X]/10
### Responsible skill: [skill-name/SKILL.md]
### Weak criteria:
- [Criterion] ([score]/1.25): [why it scored low]
### Lesson:
- [specific, actionable takeaway for next iteration]
```

4. **IMPROVE THE RESPONSIBLE SKILL** — APPEND a planning improvement to the responsible SKILL.md:

   **Rules for skill self-improvement:**
   - **ONLY APPEND** — never rewrite or delete existing content
   - **ONLY add to `## Planning Improvements` section** — create it if not exists
   - **Keep concise** — max 3-5 lines per lesson
   - **Be specific** — reference the exact criterion that scored low
   - **Include research source** — add NotebookLM notebook URL if research was done

   **Format to append to the skill's SKILL.md:**
   ```markdown
   ## Planning Improvements

   > Auto-generated by plan-quality-loop protocol. DO NOT DELETE.

   ### Learned: [Date] — [Criterion that was weak]
   - **Problem:** [What the plan missed]
   - **Why:** [Root cause — what assumption was wrong]
   - **Research Source:** [WebSearch URL / NotebookLM notebook URL]
   - **Fix:** [What to always include when planning this type of work]
   - **Verification Test:** [What test would catch this next time]
   ```

   **Example — PM skill scored low on Risk Awareness:**
   ```markdown
   ## Planning Improvements

   > Auto-generated by plan-quality-loop protocol. DO NOT DELETE.

   ### Learned: 2026-03-22 — Risk Awareness
   - **Problem:** Auth feature plan had no risk section for token expiry edge cases
   - **Why:** Assumed JWT tokens are long-lived without verifying token lifecycle config
   - **Research Source:** WebSearch: "JWT token expiry best practices 2026"
   - **Fix:** Every plan involving auth MUST include: token lifecycle risks, session invalidation, and rate-limiting
   - **Verification Test:** `test_auth_token_expiry.py` — verifies tokens expire correctly
   ```

5. Read back the improved skill + `plan-lessons.md` before re-planning.

6. **Cross-link from Execution (v8.3):** Execution lessons may generate planning stubs in `plan-lessons.md` via the `forgewright-lesson-migrator.sh` cross-feedback. When re-planning, check `.forgewright/plan-lessons.md` for cross-linked entries from past execution failures. These are the "unexpected" planning gaps that execution revealed.

## Step 5: RESEARCH

Before re-planning, actively search for knowledge to address weak criteria:

**Research Priority Order (MANDATORY):**

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
│     nlm research start "[weak criteria topics]" --mode deep       │
│     nlm notebook query <id> "Best practices for [topic]?"         │
│     → Save notebook URL for lesson documentation                   │
│                                                                     │
│  2. FALLBACK to Web Search (always available):                   │
│     WebSearch: "best practices [topic]"                            │
│     WebSearch: "[framework] [pattern] implementation"              │
│     WebSearch: "[technology] common pitfalls"                      │
│                                                                     │
│  3. SYNTHESIZE: Extract 1-3 actionable insights                   │
│     ✓ "Auth pattern: JWT + refresh token rotation"                 │
│     ✗ "Found 15 articles about auth"                               │
│                                                                     │
│  4. UPDATE session tracker:                                       │
│     bash scripts/forgewright-session-tracker.sh plan <score>        │
│     bash scripts/forgewright-session-tracker.sh check              │
│     └─ If ≥2 consecutive failures → Research Gate MANDATORY        │
│                                                                     │
│  5. APPEND lesson to SKILL.md (Planning Improvements section)      │
│                                                                     │
│  6. RE-PLAN with new insights                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Session Tracking (NEW v8.1):**
- Use `scripts/forgewright-session-tracker.sh` to track consecutive failures
- Check before triggering Research Gate: `bash scripts/forgewright-session-tracker.sh check`
- Record after each attempt: `bash scripts/forgewright-session-tracker.sh plan <score>`

**⚠️ BA Scope Exception for Research:**
- If weak criteria reveals **unclear project requirements** (missing scope, undefined stakeholders, no success criteria), STOP research and trigger BA skill
- BA will ask clarifying questions → define scope → resume Plan Quality Loop
- This is NOT blocking — scope elicitation is part of the Forgewright workflow

## Step 6: RE-PLAN

Re-plan with injected context:
1. Re-read original requirements
2. Re-read the **improved skill** (which now has the appended Planning Improvements)
3. Re-read `plan-lessons.md` (session-level lessons)
4. Re-read research findings from Step 5
5. Generate improved plan — specifically targeting weak criteria
6. Return to Step 2 (SCORE)

## Termination Rules

| Condition | Action |
|-----------|--------|
| Score ≥ threshold | ✅ Proceed to implementation |
| 3 iterations, best ≥ threshold - 2.0 | ⚠️ Proceed with warning, notify user |
| 3 iterations, best < threshold - 2.0 | ❌ STOP — escalate: "Cannot produce adequate plan after 3 attempts" |
| Score decreasing 2 consecutive iterations | ❌ STOP at iteration 2 — use best-scoring plan |

## Integration with Quality Gate

This protocol runs **BEFORE** implementation. The Quality Gate Protocol runs **AFTER** implementation. Together they form a complete quality sandwich:

```
Plan Quality Loop (pre-implementation) → Implementation → Quality Gate (post-implementation)
```

> Inspired by ClaudeKit's review gates and Forgewright's Quality Gate Protocol. Extended with research-driven self-improvement loop.
