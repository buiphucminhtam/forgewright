# Adaptive Self-Improving Loop Protocol (ASIP)

> **Purpose:** Mandatory 2-failure-then-research loop that forces knowledge acquisition via NotebookLM before retry. Builds project-specific, adaptive skill knowledge over time. **NON-NEGOTIABLE — Cannot be skipped.**

## Core Principle

```
┌─────────────────────────────────────────────────────────────┐
│                    ADAPTIVE LOOP PHILOSOPHY                  │
│                                                             │
│   Every failure is a LEARNING OPPORTUNITY, not a setback.   │
│   Every skill improves over time based on REAL failures.    │
│   The longer you use Forgewright, the SMARTER it becomes.   │
│                                                             │
│   Rule: 2 failures → Research → Update skill → Retry        │
└─────────────────────────────────────────────────────────────┘
```

## Why This Exists

| Problem | Solution |
|---------|----------|
| Skills give generic advice | Research builds project-specific knowledge |
| Same mistakes repeated | Failed approaches logged, alternatives suggested |
| No knowledge retention | Lessons appended to skill files, persist across sessions |
| Hallucination risk | NotebookLM grounds solutions in real sources |

## Two Integrated Loops

This protocol unifies:

1. **Plan Quality Loop** (pre-execution) — plans that score < 9.0 trigger research
2. **Execution Blocker Loop** (during execution) — 2+ failures trigger research

### Unified Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                    UNIFIED SELF-IMPROVING LOOP                        │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  PLAN QUALITY LOOP (Pre-Execution)                          │   │
│   │                                                             │   │
│   │  Plan → Score ≥ 9.0? ──YES──→ Execute                      │   │
│   │         │ NO                                               │   │
│   │         ↓                                                  │   │
│   │  [Attempt 1] → Score < 9.0 → [Attempt 2] → Score < 9.0   │   │
│   │         │                                                 │   │
│   │         ↓                                                  │   │
│   │  🔬 RESEARCH GATE (NotebookLM mandatory)                   │   │
│   │         │                                                 │   │
│   │  → Update SKILL.md (Planning Improvements section)        │   │
│   │  → Append to .forgewright/plan-lessons.md                 │   │
│   │  → Re-read skill + lessons                                 │   │
│   │  → RE-PLAN with injected knowledge                        │   │
│   │  → Loop (max 3 iterations total)                          │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  EXECUTION BLOCKER LOOP (During Execution)                 │   │
│   │                                                             │   │
│   │  Execute → Success? ──YES──→ Continue                     │   │
│   │         │ NO                                               │   │
│   │         ↓                                                  │   │
│   │  [Attempt 1] → Failed → [Attempt 2] → Failed              │   │
│   │         │                                                 │   │
│   │         ↓                                                  │   │
│   │  🔬 RESEARCH GATE (NotebookLM mandatory)                   │   │
│   │         │                                                 │   │
│   │  → Categorize: Technical/Architectural/Tooling/External    │   │
│   │  → Research via NotebookLM (deep mode)                    │   │
│   │  → Update SKILL.md (Execution Learnings section)           │   │
│   │  → Append to .forgewright/execution-lessons.md             │   │
│   │  → ATTEMPT 3 with updated skill                           │   │
│   │  → If fail → ESCALATE to user                             │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  POST-EXECUTION: Knowledge Consolidation                   │   │
│   │                                                             │   │
│   │  → Extract decisions, blockers, patterns from session      │   │
│   │  → Store to mem0 (long-term memory)                       │   │
│   │  → Update .forgewright/project-profile.json                │   │
│   └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## Phase 1: Plan Quality Loop (Pre-Execution)

### When to Trigger

- Every skill MUST run plan quality loop before implementation
- Trigger: Plan score < 9.0 (threshold configurable)

### Research Gate for Plans

```
IF plan scores < 9.0 TWICE consecutively (2 planning iterations):
  THEN MANDATORY RESEARCH GATE:
  
  1. Create NotebookLM notebook: "[Project] - [Skill] - [Topic]"
  2. Run: nlm research start "[specific weak criteria topics]" --mode deep
  3. Import sources to notebook
  4. Query: "Best practices for [weak criteria areas]"
  5. Generate: Study guide + flashcards
  6. Append findings to SKILL.md Planning Improvements
  7. Re-plan with grounded knowledge
```

### Research Focus by Weak Criteria

| Weak Criterion | Research Focus | Example Query |
|----------------|----------------|---------------|
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
- Trigger conditions: compile errors, persistent bugs, unknown API behavior

### Research Gate for Execution

```
IF 2 attempts fail at the SAME problem:
  THEN MANDATORY RESEARCH GATE:

  1. ASSESS: Categorize blocker type
  2. Create NotebookLM notebook: "[Project] - [Problem Category]"
  3. Run: nlm research start "[problem description]" --mode deep
  4. Import relevant sources
  5. Query: "How to solve [specific problem]"
  6. SYNTHESIZE: Extract key insight (NOT: "found 10 articles")
  7. Update SKILL.md Execution Learnings section
  8. ATTEMPT 3 with updated skill
  9. If fail → ESCALATE
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
└── ## Planning Improvements    # Pre-execution lessons (from plan failures)
└── ## Execution Learnings       # Implementation lessons (from execution failures)

### Cross-Feedback Loop: Execution → Planning (NEW v8.3)

Execution Learnings capture implementation blockers. Each execution lesson should also generate a **Planning Improvements review task** — the execution failure was predictable if the plan had been better. After migrating an execution lesson:

1. In `.forgewright/execution-lessons.md`, append a **cross-link** at the bottom:
   ```markdown
   ### Planning Review Trigger
   - **Planning Gap:** [Why the plan should have predicted this]
   - **Planning Improvement Needed:** [What to add to Planning Improvements section]
   ```
2. The lesson migrator (`forgewright-lesson-migrator.sh`) extracts this and writes a stub entry to `.forgewright/plan-lessons.md` so the next Plan Quality Loop iteration can improve planning.
3. This closes the missing link: implementation failures improve future plans, not just future implementations.
```

### Append to SKILL.md: Planning Improvements

```markdown
## Planning Improvements

> Auto-generated by ASIP. DO NOT DELETE.

### [Date] — [Weak Criterion]
- **Problem:** [What the plan missed]
- **Fixed In:** [Specific iteration]
- **Research Source:** [NotebookLM notebook URL]
- **Fix:** [What to always include when planning this type of work]
- **Example:**
  - BAD: [vague example]
  - GOOD: [specific example]
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

## Phase 4: Project-Specific Adaptation

### Knowledge Accumulation Per Project

Each project using Forgewright develops:

1. **Project Profile** (`.forgewright/project-profile.json`)
   - Technology stack learned
   - Common patterns identified
   - Pitfalls encountered
   - Team conventions

2. **Skill Adaptations** (`.forgewright/skill-adaptations/`)
   - `software-engineer.md` — project-specific patterns
   - `frontend-engineer.md` — project-specific conventions
   - `solution-architect.md` — project-specific architecture decisions

3. **Memory** (mem0)
   - Long-term facts about the project
   - Decision rationale
   - Lessons learned

### How Skills Become Adaptive

```
┌─────────────────────────────────────────────────────────────┐
│                    SKILL ADAPTATION FLOW                     │
│                                                             │
│   Project A:                                                │
│   ├── First use → Generic advice                           │
│   ├── 2 failures → Research + update skill                │
│   └── After 10 sessions → Highly project-specific          │
│                                                             │
│   Project B:                                                │
│   ├── First use → Generic advice                           │
│   ├── 2 failures → Research + update skill                │
│   └── After 10 sessions → Different from Project A!        │
│                                                             │
│   Result: Skills are MULTI-ADAPTIVE — one skill, many      │
│   project-specific versions stored in .forgewright/         │
└─────────────────────────────────────────────────────────────┘
```

## Enforcement Rules

### Rule 1: Research Gate is NON-NEGOTIABLE

```
┌─ ASIP Enforcement ─────────────────────────────────────────┐
│                                                               │
│  ⚠️  2 failures WITHOUT research = PROTOCOL VIOLATION        │
│                                                               │
│  When triggered:                                             │
│  1. STOP current execution                                   │
│  2. RUN NotebookLM research (mandatory)                      │
│  3. UPDATE skill files (mandatory)                           │
│  4. RETRY with updated skill                                 │
│  5. Only then continue or escalate                           │
│                                                               │
│  Cannot skip to step 5 without steps 2-4.                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Rule 2: Lessons Must Persist

```
✅ GOOD: Append to .forgewright/plan-lessons.md + skill SKILL.md
❌ BAD: Only log to session, forget after chat ends
❌ BAD: Skip writing lessons because "we figured it out"
❌ BAD: Research verbally but don't record findings
```

### Rule 3: Self-Improvement is Iterative

```
After research + update:
1. RE-READ the updated skill
2. RE-READ the lessons file
3. RE-PLAN or RETRY with new knowledge
4. VERIFY the fix worked
5. CONFIRM lesson was written
```

## Configuration

```yaml
# .production-grade.yaml
asip:
  enabled: true
  # Plan Quality Loop
  planQuality:
    threshold: 9.0
    maxIterations: 3
    researchOnImprove: true
    mandatoryResearchAfter: 2  # 2 failed iterations → research
  # Execution Blocker Loop
  executionBlocker:
    failureThreshold: 2  # 2 failures → research
    maxResearchCycles: 3
    escalateAfter: 3
  # Project Adaptation
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
❌ SKIP: "Research verbally but don't record it"
```

## Metrics to Track

Each project should track:
- Research gates triggered
- Failures avoided via accumulated knowledge
- Skill improvement count
- Project-specific patterns discovered

Output to `.forgewright/asip-metrics.json`:
```json
{
  "projectAdaptation": {
    "totalResearchGates": 15,
    "totalSkillUpdates": 23,
    "uniquePatterns": 8,
    "lessonsLearned": 42,
    "failuresAvoided": 7
  }
}
```
