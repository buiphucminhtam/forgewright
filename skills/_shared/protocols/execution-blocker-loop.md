# Execution Blocker Loop Protocol

> **Purpose:** When a blocker is encountered during implementation, the system MUST autonomously research → improve skill → resolve without waiting for user prompt. This closes the loop where planning passes but implementation hits an unknown obstacle.

## When to Apply

**ANY time during implementation when:**
- Code doesn't compile after multiple attempts
- Error persists after standard fixes
- Unknown library/API behavior
- Pattern not found in codebase
- Approach keeps failing
- External dependency issue
- Performance/scaling problem

**Trigger conditions:**
- 3+ failed attempts at same problem
- Error message not understood
- No clear next step
- Need external knowledge not in training data

## Blocker Severity Levels

| Level | Description | Response Time | User Notification |
|-------|-------------|---------------|------------------|
| **Blocker** | Cannot proceed at all | Immediate | After 1 research cycle |
| **Stuck** | Taking too long (>30min) | After 15min | After 1 research cycle |
| **Slow** | Suboptimal solution found | After 1h | On resolution |

## Loop Flow

```
┌──────────────────────────────────────────────────────┐
│ Blocked in Execution                                    │
│                                                        │
│  1. ASSESS    → Categorize blocker type               │
│  2. RESEARCH  → Search web, codebase, docs             │
│  3. SYNTHESIZE → Extract solution pattern              │
│  4. ATTEMPT   → Apply solution                        │
│  5. VERIFY    → Did it work?                         │
│      ├─ YES   → ✅ Continue implementation            │
│      └─ NO    → 6. IMPROVE SKILL                   │
│                  (append lesson to SKILL.md)          │
│              → Retry from Step 2 (max 2 cycles)      │
│                  (max 3 total research cycles)        │
└──────────────────────────────────────────────────────┘
```

## Step 1: ASSESS — Categorize Blocker

Identify the blocker type to focus research:

| Type | Description | Examples |
|------|-------------|----------|
| **Technical** | Language/framework/API issue | "Python type hints not working", "React state update delay" |
| **Architectural** | Design pattern mismatch | "Microservice auth not fitting", "CRUD vs event sourcing" |
| **Tooling** | Build/deploy/config issue | "Docker build fails", "CI pipeline broken" |
| **External** | Third-party dependency | "API rate limited", "SDK bug" |
| **Performance** | Speed/memory/scaling | "Query too slow", "Memory leak" |
| **Unknown** | Not sure what the problem is | Need broader investigation |

**Assessment output:**
```
┌─ Blocker Assessment ────────────────────────────────┐
│ Type: [Technical/Architectural/Tooling/External/...]
│ Problem: [1-sentence description]
│ Failed attempts: [N]
│ Context: [relevant code snippets, error messages]
└───────────────────────────────────────────────────┘
```

## Step 2: RESEARCH — Find Solution

### Research Priority Order

1. **Web Search** (for technical/external blockers)
   - Search error message directly
   - Search technology + "best practice"
   - Search "how to [specific task] [framework]"

2. **Forgewright Knowledge** (for architectural/tooling)
   - Check `skills/*/SKILL.md` for related patterns
   - Check `skills/_shared/protocols/` for existing solutions
   - Check `antigravity/docs/` for design references

3. **Codebase Search** (for existing patterns)
   - `forgenexus_query({query: "related pattern"})`
   - Search for similar implementations
   - Check `.forgewright/` for past solutions

4. **Documentation** (for unknown blockers)
   - Official docs for the technology
   - Stack Overflow / GitHub issues
   - Library README and examples

### Research Template

```
┌─ Research Log ─────────────────────────────────────┐
│ Blocker: [problem]
│                                                    │
│ Source 1: [Title/URL]                             │
│ Finding: [What solved the problem]                │
│ Relevance: [High/Medium/Low]                      │
│                                                    │
│ Source 2: [Title/URL]                             │
│ Finding: [What solved the problem]                │
│ Relevance: [High/Medium/Low]                      │
│                                                    │
│ Synthesis: [Combined solution approach]            │
└───────────────────────────────────────────────────┘
```

## Step 3: SYNTHESIZE — Extract Solution Pattern

After research, extract the key insight:

**NOT:** "Found 10 articles"
**YES:** "For [problem], the pattern is: [solution]. Key insight: [specific thing to do]"

**Synthesis template:**
```
Solution Pattern: [Name]
Core Insight: [1-sentence]
Steps to Apply:
1. [Step 1]
2. [Step 2]
3. [Step 3]
Expected Outcome: [What success looks like]
```

## Step 4: ATTEMPT — Apply Solution

Apply the synthesized solution:
- Implement the fix
- Run relevant tests
- Verify behavior matches expectation

## Step 5: VERIFY — Confirm Resolution

| Result | Action |
|--------|--------|
| ✅ Fixed | Log solution, continue implementation |
| ❌ Not fixed | Proceed to Step 6 |

## Step 6: IMPROVE SKILL — Self-Learning

When solution worked, document it for future use:

### Append to relevant SKILL.md:

```markdown
## Execution Learnings

> Auto-generated by execution-blocker-loop protocol. DO NOT DELETE.

### [Date] — [Blocker Type]: [Brief Description]
- **Problem:** [What was blocking]
- **Solution:** [What fixed it]
- **Pattern:** [When to apply this pattern]
- **Example:** [Code snippet if applicable]

Example:
### 2026-04-10 — Technical: React useEffect infinite loop
- **Problem:** useEffect causing infinite re-render when setting state
- **Solution:** Add dependency array, use useCallback for handlers
- **Pattern:** Always specify dependencies in useEffect, use ESLint exhaustive-deps
- **Example:** `useEffect(() => { fetchData(id) }, [id])`
```

### Also append to `.forgewright/execution-lessons.md`:

```markdown
## [Date] — [Skill Name]
### Problem: [blocker]
### Solution: [what worked]
### Source: [where found]
### Apply to: [what projects/tasks]
```

## Termination Rules

| Condition | Action |
|-----------|--------|
| Fixed in cycle 1-2 | ✅ Continue, log lesson |
| Fixed in cycle 3 | ⚠️ Continue, flag as "took multiple attempts" |
| Not fixed after 3 cycles | ❌ STOP — escalate to user with: research summary, failed attempts, suggest alternatives |

## Escalation Template

When 3 cycles fail:

```
┌─ Blocker Escalation ──────────────────────────────┐
│ Problem: [description]
│ Cycles attempted: 3
│                                                    │
│ Research summary:                                  │
│ - [Source 1]: [finding]                           │
│ - [Source 2]: [finding]                           │
│                                                    │
│ Failed approaches:                                 │
│ 1. [Approach 1]: [why failed]                    │
│ 2. [Approach 2]: [why failed]                    │
│                                                    │
│ Possible alternatives:                             │
│ - [Alternative 1]                                 │
│ - [Alternative 2]                                 │
│                                                    │
│ Recommendation: [suggest next step]                 │
└───────────────────────────────────────────────────┘
```

## Integration with Plan Quality Loop

The Execution Blocker Loop complements the Plan Quality Loop:

```
┌────────────────────────────────────────────────────┐
│                    PLAN PHASE                       │
│  Plan Quality Loop → if plan fails, improve skill  │
└────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────┐
│                  EXECUTE PHASE                     │
│  Execution Blocker Loop → if blocked, research      │
│                          → if stuck, improve skill │
└────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────┐
│                   DELIVER PHASE                    │
│  Quality Gate → verify implementation quality       │
└────────────────────────────────────────────────────┘
```

## Quick Reference

| Blocker Type | Research Priority |
|--------------|-------------------|
| Technical | Web search → Docs |
| Architectural | Forgewright skills → Docs |
| Tooling | Forgewright protocols → Web |
| External | Web search → Alternatives |
| Performance | Profiling → Optimization patterns |
| Unknown | Broader web search → Experiment |

## Anti-Patterns to Avoid

- ❌ Giving up after 1 failed attempt
- ❌ Asking user immediately instead of researching
- ❌ Applying random changes hoping something works
- ❌ Not documenting the solution
- ❌ Repeating the same failed approach
