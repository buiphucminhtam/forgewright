# Middleware 10 — Adaptive Self-Improving Loop (ASIP)

> **Source:** `skills/_shared/protocols/self-improving-loop.md`
> **Hook:** `after_skill()` + `on_error()`
> **Purpose:** Enforce mandatory 2-failure-then-research loop. Cannot be skipped.

## Execution Rules

```
┌─────────────────────────────────────────────────────────────────────┐
│  ASIP MIDDLEWARE — ALWAYS ENFORCED                                   │
│                                                                      │
│  Pre-Skill:    Track attempt count per skill per session            │
│  On Failure:   Increment attempt counter, check threshold           │
│  On Threshold: MANDATORY research gate + skill update               │
│  On Success:   Clear counters, log success                          │
│                                                                      │
│  ⚠️  NO SKIP ALLOWED — Research gate is non-negotiable               │
└─────────────────────────────────────────────────────────────────────┘
```

## State Tracking

Maintain per-session state in `.forgewright/session/asip-state.json`:

```json
{
  "sessionId": "uuid",
  "planAttempts": {
    "[skill-name]": {
      "[task-id]": {
        "attempts": 2,
        "lastScore": 7.5,
        "researchGateTriggered": true,
        "notebookId": "uuid",
        "timestamp": "ISO8601"
      }
    }
  },
  "executionAttempts": {
    "[skill-name]": {
      "[problem-id]": {
        "attempts": 2,
        "blockerType": "Technical",
        "lastError": "...",
        "researchGateTriggered": true,
        "notebookId": "uuid",
        "timestamp": "ISO8601"
      }
    }
  },
  "totalResearchGates": 0,
  "skillUpdates": []
}
```

## Pre-Skill Hook

```
1. Load asip-state.json
2. Check if skill has existing attempt tracking
3. Reset success counters on new task
4. Log skill invocation start
```

## Post-Skill Hook: Success Path

```
IF skill completes successfully:
  1. Check if research gate was triggered this session
  2. IF yes:
     - Verify lessons were written to skill files
     - Save lesson to L2 graph: python3 scripts/mem0-v2.py graph-add-node "lesson_[id]" "semantic" "Lesson" "Problem: ... | Research: ... | Lesson: ..."
     - Link to skill node: python3 scripts/mem0-v2.py graph-link "lesson_[id]" "skill_[name]" --weight 1.5 --type "improves"
  3. Strengthen the path: python3 scripts/mem0-v2.py graph-reinforce "current-session" "plan-quality" --factor 1.2
  4. Clear attempt counters for completed tasks
  5. Log: SKILL_COMPLETED_WITH_IMPROVEMENT
  6. Update .forgewright/asip-metrics.json
```

## Post-Skill Hook: Failure Path (Plan Quality Loop)

```
IF plan scores < 9.0:
  1. Increment planAttempts[skill][task]
  2. Log attempt with score breakdown
  3. Decay edge in L2 graph: python3 scripts/mem0-v2.py graph-decay "current-session" "plan-quality" --factor 0.5
  
  IF attempts == 1:
    → Return to skill: "Plan scored X. Improve on [weak criteria]. Try again."
    → Allow one free improvement without research
    
  IF attempts >= 2:
    → TRIGGER MANDATORY RESEARCH GATE (Plan Quality)
    → Cannot proceed until research + skill update complete
```

## Post-Skill Hook: Failure Path (Execution Blocker Loop)

```
IF execution fails with blocker:
  1. Increment executionAttempts[skill][problem]
  2. Record failure fact: python3 scripts/mem0-v2.py add "Execution Blocker: [description] in skill [name]" --category blockers --importance 7
  3. Decay edge: python3 scripts/mem0-v2.py graph-decay "current-session" "skill_[name]" --factor 0.5
  
  IF attempts == 1:
    → Return to skill: "Attempt 1 failed. Try alternative approach."
    → Allow one free retry without research
    
  IF attempts >= 2:
    → TRIGGER MANDATORY RESEARCH GATE (Execution Blocker)
    → Cannot proceed until research + skill update complete
```

## Mandatory Research Gate

```
┌─ Research Gate Triggered ──────────────────────────────────────────┐
│                                                                      │
│  Reason: [Plan quality / Execution blocker]                         │
│  Attempts: [N]                                                       │
│  Last failure: [description]                                         │
│                                                                      │
│  ════════════════════════════════════════════════════════════════════  │
│                                                                      │
│  NEXT STEPS (MANDATORY - cannot skip):                             │
│                                                                      │
│  1. RESEARCH via NotebookLM                                          │
│     - Create notebook: "[Project] - [Skill] - [Topic]"             │
│     - nlm research start "[query]" --mode deep                      │
│     - Import sources, generate study guide                           │
│                                                                      │
│  2. UPDATE skill files                                               │
│     - Append to skills/*/SKILL.md                                   │
│     - Append to .forgewright/plan-lessons.md OR execution-lessons.md │
│                                                                      │
│  3. RETRY with updated skill                                        │
│                                                                      │
│  ════════════════════════════════════════════════════════════════════  │
│                                                                      │
│  Progress: [ ] Research done  [ ] Skill updated  [ ] Ready to retry│
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Research Gate Implementation

### Step 1: Research via NotebookLM

```bash
# 1. Create notebook
nlm notebook create "[Project] - [Skill] - [Topic]"

# 2. Deep research
nlm research start "[specific problem/weak criteria]" \
  --notebook-id <id> \
  --mode deep

# 3. Wait for completion
nlm research status <id> --max-wait 300

# 4. Import sources
nlm research import <id> <task-id>

# 5. Generate study materials
nlm report create <id> --format "Study Guide" --confirm
nlm flashcards create <id> --difficulty medium --confirm

# 6. Query for solutions
nlm notebook query <id> "What are the best practices for [topic]?"
```

### Step 2: Update Skill Files

After research completes:

```markdown
<!-- Append to skills/[skill-name]/SKILL.md -->

## Execution Learnings (or Planning Improvements)

### [Date] — [Type]: [Brief Description]
- **Problem:** [What was blocking/weak]
- **Failed Attempts:** [What was tried]
- **Research Source:** [NotebookLM notebook URL]
- **Solution:** [What fixed it]
- **Key Insight:** [1-sentence takeaway]
- **Apply When:** [When to apply]
```

### Step 3: Retry

```markdown
After skill files updated:
1. Re-read skills/*/SKILL.md (now includes new lesson)
2. Re-read .forgewright/plan-lessons.md OR execution-lessons.md
3. Retry task with updated skill
4. If successful: Log improvement, clear counters
5. If fails again: ESCALATE to user
```

## Escalation Template

```
┌─ ASIP Escalation ────────────────────────────────────────────────┐
│                                                                       │
│  ⚠️  UNRESOLVED AFTER 3 RESEARCH CYCLES                             │
│                                                                       │
│  Problem: [description]                                              │
│  Research cycles: 3                                                   │
│  Last research: [NotebookLM notebook URL]                            │
│                                                                       │
│  Research findings:                                                   │
│  - [Source 1]: [finding]                                             │
│  - [Source 2]: [finding]                                             │
│                                                                       │
│  Failed approaches:                                                  │
│  1. [Approach 1]: [why failed]                                      │
│  2. [Approach 2]: [why failed]                                      │
│  3. [Approach 3]: [why failed]                                      │
│                                                                       │
│  Possible alternatives:                                               │
│  - [Alternative 1]                                                   │
│  - [Alternative 2]                                                   │
│                                                                       │
│  Recommendation: [suggest next step]                                  │
│                                                                       │
│  Lessons learned (will be added to skill):                           │
│  - [Lesson 1]                                                       │
│  - [Lesson 2]                                                       │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Enforcement Checks

Before allowing skill to proceed:

```
✅ IF researchGateTriggered == false → Allow execution
❌ IF researchGateTriggered == true AND lessons not written → BLOCK
❌ IF researchGateTriggered == true AND skill not updated → BLOCK
❌ IF researchGateTriggered == true AND notebook not created → BLOCK
```

## Logging

After each ASIP cycle:

```json
{
  "event": "ASIP_CYCLE_COMPLETED",
  "type": "plan_quality | execution_blocker",
  "skill": "[skill-name]",
  "attempts": 2,
  "researchGateTriggered": true,
  "notebookId": "[uuid]",
  "notebookUrl": "https://notebooklm.google.com/notebook/[uuid]",
  "skillUpdated": true,
  "lessonsWritten": true,
  "retrySuccessful": true | false,
  "timestamp": "ISO8601"
}
```

## Metrics Update

Update `.forgewright/asip-metrics.json`:

```json
{
  "projectAdaptation": {
    "totalResearchGates": 15,
    "totalSkillUpdates": 23,
    "uniquePatterns": 8,
    "lessonsLearned": 42,
    "failuresAvoided": 7
  },
  "bySkill": {
    "software-engineer": {
      "researchGates": 5,
      "skillUpdates": 8
    }
  },
  "byBlockerType": {
    "Technical": 10,
    "Architectural": 3,
    "Tooling": 2
  }
}
```

## Configuration

```yaml
# .production-grade.yaml
asip:
  enabled: true
  enforceResearchGate: true  # Cannot be disabled - safety critical
  planQuality:
    threshold: 9.0
    maxIterations: 3
    mandatoryResearchAfter: 2
  executionBlocker:
    failureThreshold: 2
    maxResearchCycles: 3
    escalateAfter: 3
```

## Middleware Order

ASIP middleware runs:
- **Post-Skill** (after QualityGate ⑥, BrownfieldSafety ⑦, TaskTracking ⑧)
- **On Error** (triggered by GracefulFailure ⑩)

```
⑥ QualityGate → ⑦ BrownfieldSafety → ⑧ TaskTracking → ⑨ Memory → ⑩ ASIP
```
