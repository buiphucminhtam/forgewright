---
name: goal-driven
description: >
  Autonomous goal-pursuit workflow for Forgewright. Inspired by Codex /goal
  and Claude Code /goal. Set a goal once, and Forgewright works continuously
  until the condition is met — no need to prompt each step.
---

# Goal-Driven Workflow

> **Set it and forget it.** Inspired by Codex `/goal` and Claude Code `/goal`.

## Overview

Goal-Driven Workflow allows Forgewright to work autonomously toward a single
objective across multiple turns without requiring user input at each step. Once
a goal is set with a clear completion condition, Forgewright:

1. Works continuously toward the goal
2. Evaluates progress after each turn
3. Continues until the condition is met
4. Reports completion automatically

```
┌─────────────────────────────────────────────────────────────────────┐
│  GOAL-DRIVEN WORKFLOW                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User: "Set goal: Migrate auth to JWT until all tests pass"        │
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐         │
│  │ Turn 1      │────▶│ Evaluate     │────▶│ Turn 2       │        │
│  │ Implement   │     │ Condition?   │     │ Continue      │        │
│  │ JWT auth     │     │ NO → Continue│     │               │        │
│  └──────────────┘     └──────────────┘     └───────┬──────┘        │
│                                                     │               │
│                              ┌──────────────┐       │               │
│                              │ Goal Met!    │◀──────┘               │
│                              │ Report Done  │                       │
│                              └──────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

## When to Use

| Use Case | Example Goal |
|----------|--------------|
| Code migration | "Migrate auth to JWT until all tests pass" |
| Large refactor | "Split monolith into microservices until each compiles" |
| Feature implementation | "Implement user dashboard until all acceptance criteria pass" |
| Bug fix | "Fix login bug until no related test failures" |
| Test coverage | "Add tests until coverage > 80%" |
| Documentation | "Document all API endpoints until no undocumented routes remain" |

## Trigger Signals

- User says "set goal", "work toward", "keep going until", "don't stop until"
- User says "autonomous", "continuous", "keep working"
- User mentions `/goal` directly
- Long-running task with clear end state

## Goal vs Normal Mode

| Aspect | Normal Mode | Goal Mode |
|--------|-------------|-----------|
| **User input** | Every turn | Once (at start) |
| **Evaluation** | User decides when done | Auto-evaluate after each turn |
| **Persistence** | Session-scoped | Survives context resets |
| **Stop condition** | User says "done" | Verifiable condition met |
| **Progress tracking** | Manual | Automatic via goal tracker |

## Usage

### Setting a Goal

```
/goal [completion condition]

Examples:
/goal All tests in test/auth pass and lint is clean
/goal Migrate database schema until all migrations run successfully
/goal Implement user dashboard until all acceptance criteria are met
```

### Checking Status

```
/goal status
```

Shows:
- Current goal and condition
- Turns elapsed
- Last evaluation result
- Token spend (if tracked)

### Clearing a Goal

```
/goal clear
```

## Implementation

### Goal State File

Goals are persisted in `.forgewright/active-goal.json`:

```json
{
  "goal_id": "goal-20260513-1647",
  "condition": "All tests in test/auth pass and lint is clean",
  "created_at": "2026-05-13T16:47:00+07:00",
  "created_by": "user",
  "turns": 3,
  "last_evaluation": {
    "at": "2026-05-13T17:02:00+07:00",
    "result": "not_met",
    "reason": "3 tests passing, 1 failing in test/auth/test_jwt.py"
  },
  "status": "active"
}
```

### Evaluation Loop

After each skill execution turn:

```
1. Load goal condition from active-goal.json
2. Run evaluation:
   a. Check verifiable outputs (test results, file counts, build status)
   b. Check explicit conditions (git status, lint output, coverage %)
   c. Check constraints (no regressions, scope maintained)
3. If MET:
   a. Log: "✓ Goal achieved: [condition]"
   b. Save to session-log.json
   c. Report completion to user
   d. Clear goal from active state
4. If NOT MET:
   a. Log: "⧗ Working toward goal: [reason why not met]"
   b. Continue to next turn
   c. User does NOT need to prompt again
```

### Auto-Continue Mechanism

Forgewright's goal mode uses a session hook to auto-continue:

```
After each assistant turn in goal mode:
1. Check if goal exists in active-goal.json
2. If goal exists AND status == "active":
   a. Run evaluation
   b. If NOT MET:
      - Inject system prompt: "Continue working toward your goal..."
      - DO NOT wait for user input
      - Proceed to next turn
3. If goal cleared or achieved:
   - Return to normal mode
   - Wait for user input
```

### Writing Effective Conditions

An effective goal condition has:

1. **One measurable end state**: test result, build status, file count
2. **A stated check**: how to prove it (`npm test` exits 0, `git status` clean)
3. **Constraints that matter**: what must NOT change on the way there

| Good Condition | Bad Condition |
|----------------|----------------|
| "All tests pass" | "Make it work" |
| "`npm test` exits 0 and `npm run lint` exits 0" | "Improve the codebase" |
| "3 new services in services/ directory" | "Add more services" |
| "No regression in existing tests" | "Don't break anything" |

## Integration with Forgewright Pipeline

### Goal Mode Activation

When a goal is set, Forgewright enters **Autonomous Mode**:

```
1. Parse and validate goal condition
2. Create active-goal.json
3. Set engagement mode to "autonomous"
4. Begin first work turn
5. After each turn: evaluate → continue or complete
```

### Goal + Skill Execution

Goals work with any Forgewright skill:

```
Goal: "Implement auth until all acceptance criteria pass"

├── T3a: Backend Engineering (JWT auth)
├── T3b: Frontend Engineering (login page)
└── QA: Tests pass

Each skill runs, then evaluator checks:
- Backend: "auth service compiles + tests pass"
- Frontend: "login page renders + integration tests pass"
- QA: "all acceptance criteria verified"
```

### Interrupt Handling

Goals survive context resets:

```
If context resets mid-goal:
1. Load active-goal.json on session resume
2. Log: "⧖ Resuming goal: [condition]"
3. Continue from where left off
4. User does NOT need to re-explain the goal
```

## Configuration

### Auto Mode (Token Efficiency)

Enable auto-approval for tool calls during goal mode:

```yaml
# .production-grade.yaml
goal:
  auto_mode: true  # Approve tool calls without prompting
  max_turns: 50    # Safety limit (0 = unlimited)
  stop_after:
    turns: 50      # or stop after N turns
    minutes: 120   # or stop after N minutes
```

### Evaluation Model

Configure the evaluator (default: same model as assistant):

```yaml
# .production-grade.yaml
goal:
  evaluator:
    model: "haiku"  # Use smaller/faster model for evaluation
    provider: "anthropic"
```

## Best Practices

### For Users

1. **Be specific**: "All tests pass" > "Make it work"
2. **Include constraints**: "Until tests pass AND no regressions elsewhere"
3. **Set bounds**: "or stop after 20 turns" to prevent runaway
4. **Start simple**: Complex multi-step goals may need breaking down

### For Skills

1. **Emit progress**: Write intermediate results to `.forgewright/goal-progress.md`
2. **Log evaluations**: After each significant step, log what was done
3. **Be verifiable**: Make outputs that can be checked (test results, file counts)
4. **Respect constraints**: If goal says "no regressions", check before claiming done

## Comparison with Other Workflows

| Approach | Next turn starts when | Stops when |
|----------|------------------------|------------|
| **Goal Mode** | Previous turn finishes | Evaluator confirms condition met |
| **Normal Mode** | User prompts | User says done |
| **/loop** | Time interval elapses | User stops or limit reached |
| **Stop Hook** | Previous turn finishes | Custom script decides |

## Fallback

If evaluator cannot determine if condition is met:

1. Log: "⚠️ Cannot verify goal condition automatically"
2. Ask user: "Has the goal been achieved? [describe what was done]"
3. User confirms → clear goal
4. User denies → continue with guidance

## Security Considerations

- Goals run in the same trust context as normal Forgewright
- No additional permissions required
- User can always `/goal clear` to stop
- Safety limits (max_turns, timeout) prevent runaway loops
