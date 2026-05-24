# Middleware 10 — GracefulFailure

> **Source:** `skills/_shared/protocols/graceful-failure.md`
> **Hook:** `on_error()`
> **Purpose:** Stuck detection, retry limits, graceful exit. **Research and skill self-improvement are handled by ASIP (middleware 11 / self-improving-loop.md).**

## Execution

```
1. Retry management
   → After failed attempt: retry with adjusted strategy
   → Max 3 retries before escalation

2. Stuck detection
   → Monitor for repeated failed attempts
   → If same error pattern repeats 3x → likely impossible task

3. Escalation triggers
   → After 3 failed attempts → escalate with:
     - What failed
     - What was tried
     - Root cause analysis
     - Remaining options

4. Delegate to ASIP
   → After 2+ failed attempts:
     - GracefulFailure marks the failure
     - ASIP (middleware 11) triggers mandatory research gate
     - Skill self-improvement handled by ASIP

5. Graceful exit format
   → Structured report with all context for next session
   → Saved to .forgewright/session-log.json
```

## Failure Categories

| Category | Behavior |
|----------|---------|
| Transient | Retry with backoff |
| Configuration | Fix config, retry |
| External | Log, skip, continue |
| Impossible | Escalate to user |

## Stuck Detection

| Pattern | Detection | Action |
|---------|-----------|--------|
| Same action loop | Same tool call 2+ times | STOP immediately |
| Oscillation | A→B→A→B | STOP after 2nd cycle |
| No progress | 3+ steps without progress | STOP |
| Error cascade | 3+ consecutive errors | STOP |

## Note

This prevents skills from looping indefinitely on impossible tasks. Research and skill self-improvement are delegated to ASIP (self-improving-loop.md).
