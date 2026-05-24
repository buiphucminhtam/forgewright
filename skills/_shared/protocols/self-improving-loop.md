# Adaptive Self-Improving Loop Protocol (ASIP)

> **Purpose:** CANONICAL self-improvement loop. Mandatory 2-failure-then-research that forces knowledge acquisition before retry. Builds project-specific, adaptive skill knowledge over time.
>
> **This is the single source of truth for all self-improvement loops. Graceful Failure handles detection; ASIP handles research and skill updates.**

## Core Principle

```
┌─────────────────────────────────────────────────────────────┐
│                  ADAPTIVE LOOP PHILOSOPHY                      │
│                                                               │
│   Every failure is a LEARNING OPPORTUNITY, not a setback.    │
│   Every skill improves over time based on REAL failures.      │
│   The longer you use Forgewright, the SMARTER it becomes.     │
│                                                               │
│   Core loop: assumption → write test → run → pass/fail        │
│               → (if fail) research → skill update → replan    │
└─────────────────────────────────────────────────────────────┘
```

## Why This Exists

| Problem | Solution |
|---------|----------|
| Skills give generic advice | Research builds project-specific knowledge |
| Same mistakes repeated | Failed approaches logged, alternatives suggested |
| No knowledge retention | Lessons appended to skill files, persist across sessions |
| Hallucination risk | NotebookLM + verification artifacts ground solutions |

## The Single Canonical Loop

This protocol unifies both plan failures and execution failures into one loop:

```
┌──────────────────────────────────────────────────────────────────────┐
│                      ASIP CANONICAL LOOP                                │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │  PLAN QUALITY LOOP (Pre-Execution)                           │   │
│   │                                                              │   │
│   │  1. Write plan → Score ≥ 9.0? ──YES──→ Execute            │   │
│   │               │ NO                                           │   │
│   │               ↓                                              │   │
│   │  [Attempt 1] → Score < 9.0 → [Attempt 2] → Score < 9.0   │   │
│   │               │                                              │   │
│   │               ↓                                              │   │
│   │  🔬 RESEARCH GATE (mandatory)                               │   │
│   │  → Write verification artifact (test)                       │   │
│   │  → Run → evidence from output                              │   │
│   │  → Research (NotebookLM / WebSearch)                       │   │
│   │  → Update SKILL.md (Planning Improvements)                  │   │
│   │  → RE-PLAN with injected knowledge                         │   │
│   │  → Loop (max 3 iterations)                               │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                              ↓                                        │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │  EXECUTION BLOCKER LOOP (During Execution)                   │   │
│   │                                                              │   │
│   │  1. Execute → Success? ──YES──→ Continue                  │   │
│   │               │ NO                                          │   │
│   │               ↓                                              │   │
│   │  [Attempt 1] → Failed                                       │   │
│   │               ↓                                              │   │
│   │  [Attempt 2] → Failed                                       │   │
│   │               ↓                                              │   │
│   │  🔬 RESEARCH GATE (mandatory)                              │   │
│   │  → Write verification artifact (test)                       │   │
│   │  → Run → evidence from output                              │   │
│   │  → Categorize blocker (Technical/Architectural/etc)        │   │
│   │  → Research (NotebookLM / WebSearch)                       │   │
│   │  → Update SKILL.md (Execution Learnings)                    │   │
│   │  → ATTEMPT 3 with updated skill                            │   │
│   │  → If fail → ESCALATE                                      │   │
│   └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## Verification Artifacts — Primary Evidence

**Every assumption is verified by an artifact, not by gut feeling.**

### Writing Verification Artifacts

When an assumption needs testing, write a test or script:

```
ASSUMPTION: "API uses JWT auth"
  ↓
WRITE: test_api_auth.py
```python
import requests
r = requests.get("/api/protected", headers={})
assert r.status_code == 401  # Expects JWT
```
  ↓
RUN: pytest test_api_auth.py
  ├── PASS → Assumption confirmed. Proceed.
  └── FAIL → Assumption wrong. Evidence: "got 200, not 401"
      ↓
      → RESEARCH → update assumption → replan → new test
```

### Artifact Types by Context

| Context | Artifact Type | Example |
|---------|--------------|---------|
| API behavior unknown | HTTP test | `curl` / `requests` script |
| DB schema unknown | Query test | `psql -c "SELECT..."` |
| Auth mechanism unknown | Auth test | Check if requests require token |
| Config behavior unknown | Config test | Read config, assert expected values |
| Library behavior unknown | Unit test | Import library, call function, assert output |
| Build process unknown | Build script | Run build command, check exit code |

### Artifact Quality Rules

- Test must produce pass/fail output — not "let's see"
- Assertions must be real (not mocked core behavior)
- Run the artifact → paste exact output as evidence
- If artifact cannot be written → escalate to user (pure preference only)

## Phase 1: Plan Quality Loop (Pre-Execution)

### When to Trigger

- Every skill MUST run plan quality loop before implementation
- Trigger: Plan score < 9.0 (threshold configurable)

### Research Gate for Plans

```
IF plan scores < 9.0 TWICE consecutively:
  THEN MANDATORY RESEARCH GATE:

  1. WRITE verification artifact to test the weak criteria
     e.g., if Risk Awareness is weak: write test for the missing risk

  2. RUN artifact → get evidence from output

  3. RESEARCH via NotebookLM:
     nlm notebook create "[Project] - [Skill] - [Topic]"
     nlm research start "[specific weak criteria]" --mode deep
     Import sources, query, generate study guide

  4. UPDATE SKILL.md (Planning Improvements section)

  5. RE-PLAN with injected knowledge
```

### Research Focus by Weak Criteria

| Weak Criterion | Research Focus | Example Query |
|---------------|----------------|---------------|
| Completeness | Edge cases, boundary conditions | "React form validation edge cases" |
| Specificity | Implementation patterns | "Next.js App Router file structure" |
| Feasibility | Technology constraints | "WebAssembly browser support 2026" |
| Risk awareness | Common pitfalls | "Microservices migration failures" |
| Scope control | Right-sized patterns | "MVP vs over-engineering examples" |
| Dependency ordering | Build sequence | "React TypeScript monorepo setup" |
| Testability | Testing patterns | "Jest React Testing Library best practices" |
| Impact assessment | Refactoring risks | "Large-scale React refactoring risks" |

## Phase 2: Execution Blocker Loop (During Execution)

### When to Trigger

- Any time during implementation when 2+ attempts fail at same problem
- Trigger: compile errors, persistent bugs, unknown API behavior

### Research Gate for Execution

```
IF 2 attempts fail at the SAME problem:
  THEN MANDATORY RESEARCH GATE:

  1. WRITE verification artifact to isolate the failure
     e.g., test_api_auth.py → proves auth method

  2. RUN artifact → evidence from output disproves assumption

  3. CATEGORIZE blocker type

  4. RESEARCH via NotebookLM:
     nlm notebook create "[Project] - [Blocker Type] - [Problem]"
     nlm research start "[problem]" --mode deep

  5. UPDATE SKILL.md (Execution Learnings section)

  6. ATTEMPT 3 with updated skill
```

### Blocker Type → Research Priority

| Blocker Type | Research Priority |
|--------------|------------------|
| **Technical** | Web search → Official docs → Stack Overflow |
| **Architectural** | Forgewright skills → Design patterns → Docs |
| **Tooling** | Forgewright protocols → Tool docs → Community |
| **External** | Web search → API docs → Alternatives |
| **Performance** | Profiling → Optimization patterns → Benchmarks |
| **Knowledge** | NotebookLM deep research → Experts → Papers |

## Phase 3: Skill Self-Improvement

### Where to Store Lessons

```
.forgewright/
├── plan-lessons.md          # Plan quality loop failures
├── execution-lessons.md     # Execution blocker loop failures
└── project-profile.json     # Aggregated knowledge

skills/*/SKILL.md
├── ## Planning Improvements    # Pre-execution lessons (from plan failures)
└── ## Execution Learnings     # Implementation lessons (from execution failures)
```

### Cross-Feedback Loop: Execution → Planning (v8.3+)

Execution Learnings capture implementation blockers. Each execution lesson generates a **Planning Improvements review task** — the execution failure was predictable if the plan had been better.

1. In `.forgewright/execution-lessons.md`, append a cross-link:

```markdown
### Planning Review Trigger
- **Planning Gap:** [Why the plan should have predicted this]
- **Planning Improvement Needed:** [What to add to Planning Improvements]
```

2. The lesson migrator (`forgewright-lesson-migrator.sh`) extracts this and writes a stub to `.forgewright/plan-lessons.md`.

### Append to SKILL.md: Planning Improvements

```markdown
## Planning Improvements

> Auto-generated by ASIP. DO NOT DELETE.

### [Date] — [Skill] — [Weak Criterion]
- **Problem:** [What the plan missed]
- **Why:** [Root cause — what assumption was wrong]
- **Research Source:** [WebSearch URL / NotebookLM notebook URL]
- **Fix:** [What to always include when planning this type of work]
- **Verification Test:** [What test would catch this next time]
```

### Append to SKILL.md: Execution Learnings

```markdown
## Execution Learnings

> Auto-generated by ASIP. DO NOT DELETE.

### [Date] — [Blocker Type]: [Brief Description]
- **Problem:** [What was blocking]
- **Failed Attempts:** [What was tried and failed]
- **Research Source:** [NotebookLM notebook URL]
- **Solution:** [What fixed it]
- **Key Insight:** [1-sentence takeaway]
- **Apply When:** [When to apply this pattern]
```

### Skill Update Decision

After every failure, before replanning:

```
CAN UPDATE SKILL?
├── YES: Append lesson to relevant SKILL.md
│   ├── Plan failed → SKILL.md → Planning Improvements
│   └── Execution failed → SKILL.md → Execution Learnings
└── NO:  Skip (not every failure is a skill gap)
```

## Phase 4: Project-Specific Adaptation

Each project using Forgewright develops:

1. **Project Profile** (`.forgewright/project-profile.json`)
   - Technology stack learned
   - Common patterns identified
   - Pitfalls encountered

2. **Skill Adaptations** (`.forgewright/skill-adaptations/`)
   - Project-specific patterns and conventions

3. **Memory** (mem0)
   - Long-term facts about the project
   - Lessons learned

## Enforcement Rules

### Rule 1: Research Gate is NON-NEGOTIABLE

```
⚠️  2 failures WITHOUT research = PROTOCOL VIOLATION

When triggered:
1. STOP current execution
2. WRITE verification artifact
3. RUN → get evidence from output
4. RUN NotebookLM research (mandatory)
5. UPDATE skill files (mandatory)
6. RETRY with updated skill

Cannot skip to step 6 without steps 2-5.
```

### Rule 2: Lessons Must Persist

```
✅ GOOD: Append to .forgewright/plan-lessons.md + skill SKILL.md
❌ BAD: Only log to session, forget after chat ends
❌ BAD: Skip writing lessons because "we figured it out"
```

### Rule 3: Self-Improvement is Iterative

```
After research + update:
1. RE-READ the updated skill
2. RE-READ the lessons file
3. RE-PLAN or RETRY with new knowledge
4. VERIFY the fix worked (write new verification artifact)
5. CONFIRM lesson was written
```

## Configuration

```yaml
# .production-grade.yaml
asip:
  enabled: true
  planQuality:
    threshold: 9.0
    maxIterations: 3
    researchOnImprove: true
    mandatoryResearchAfter: 2  # 2 failed iterations → research
  executionBlocker:
    failureThreshold: 2  # 2 failures → research
    maxResearchCycles: 3
    escalateAfter: 3
  adaptation:
    storeInProject: true
    skillAdaptationsDir: .forgewright/skill-adaptations
    updateProjectProfile: true
```

## Quick Reference

| Situation | Action |
|-----------|--------|
| Plan scores < 9.0 once | Improve plan directly |
| Plan scores < 9.0 twice | **MANDATORY Research Gate** |
| Execution fails once | Try alternative approach |
| Execution fails twice | **MANDATORY Research Gate** |
| Research done | Update skill + lessons + retry |
| 3 failures | Escalate to user |

## Anti-Patterns

```
❌ SKIP: "We can figure it out without research"
❌ SKIP: "This is just a quick task, no need to log"
❌ SKIP: "I already know the solution, no research needed"
❌ SKIP: "Let me try one more time before researching"
❌ SKIP: Research verbally but don't record findings
❌ SKIP: Write a test that passes by mocking core behavior
```

## Metrics to Track

Output to `.forgewright/asip-metrics.json`:

```json
{
  "projectAdaptation": {
    "totalResearchGates": 15,
    "totalSkillUpdates": 23,
    "uniquePatterns": 8,
    "lessonsLearned": 42,
    "failuresAvoided": 7,
    "sessionsWithEvolution": 5
  }
}
```

## Relationship to Other Protocols

| Protocol | Role | ASIP Relationship |
|----------|------|-------------------|
| **graceful-failure.md** | Stuck detection, retry limits, graceful exit | Detection only → delegates to ASIP after 2 failures |
| **execution-blocker-loop.md** | DEPRECATED — execution-specific blockers | Merged into ASIP Phase 2 |
| **plan-quality-loop.md** | Plan scoring and rubric | ASIP Phase 1 wraps Plan Quality Loop |
| **circuit-breaker.md** | System-wide failure protection | Independent, runs in parallel |
| **quality-gate.md** | Post-execution quality check | Independent, runs after ASIP |
