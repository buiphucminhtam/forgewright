# Middleware 08 — TaskTracking

> **Source:** `skills/_shared/protocols/session-lifecycle.md` §Hooks
> **Hook:** `after_skill()`
> **Purpose:** Update task.md, emit lifecycle events

## Execution

```
1. Update the active workspace task-plan contract with observed acceptance status; keep task.md/session logs as matching derived views

2. Emit session lifecycle hook:
   TASK_COMPLETE(task_id, name, status, summary)

3. Update session-log.json with task result
```

## Output

- task.md is a derived view of the matching canonical task-plan state
- Session log updated for resume capability

## Lifecycle Events

| Event | When | Action |
|-------|------|--------|
| PHASE_COMPLETE | Phase ends | Update matching task/session state |
| TASK_COMPLETE | Task ends | Update session-log |
| GATE_DECISION | Gate approved/rejected | Record decision and evidence in task state |
| ARCH_DECISION | Architecture approved | Update canonical architecture decision |
| ERROR | Any error | Record observed failure and next useful action |

Memory is optional under Middleware 09; lifecycle events do not independently
authorize persistent capture. Finalize task state before the final unchanged
verifier so completion evidence binds the actual final status.
