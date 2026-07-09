---
id: circuit-breaker
title: Circuit Breaker Protocol
summary: Core protocol for circuit breaker.
status: active
version: 1.0.0
owners: [core]
triggers: []
used_by: [all]
related: []
supersedes: []
superseded_by: null
---
# Circuit Breaker Protocol

> **Purpose:** Prevent cascading failures in parallel execution by stopping requests to failing workers.
> **Pattern:** Inspired by Michael Nygard's Circuit Breaker pattern (*Release It!* 2nd Edition).

## States

```
CLOSED ──(failure_threshold)──► OPEN
  ▲                              │
  │                         (timeout)
  │                              ▼
  └──(success)──── HALF_OPEN ──(failure)
```

| State | Behavior | Next Transition |
|-------|----------|-----------------|
| **CLOSED** | Normal operation, requests pass through | After `failure_threshold` failures → OPEN |
| **OPEN** | All requests fail immediately | After `timeout_duration` seconds → HALF_OPEN |
| **HALF_OPEN** | Limited requests allowed to test recovery | Success → CLOSED; Failure → OPEN |

## Configuration

Add to `.production-grade.yaml`:

```yaml
circuitBreaker:
  failure_threshold: 3      # failures before OPEN
  timeout_duration: 60     # seconds OPEN before HALF_OPEN
  recovery_timeout: 120    # seconds in HALF_OPEN before CLOSED
```

## When to Apply

- Parallel dispatch workers in `parallel-dispatch/SKILL.md`
- External API calls in skills
- Any skill with retry logic

## Implementation

### State Machine

```typescript
interface CircuitBreaker {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failure_count: number;
  last_failure_time: number;
  success_count: number;
}

function shouldAllowRequest(cb: CircuitBreaker): boolean {
  switch (cb.state) {
    case 'CLOSED':
      return true;
    case 'OPEN':
      if (Date.now() - cb.last_failure_time > cb.config.timeout_duration * 1000) {
        cb.state = 'HALF_OPEN';
        return true;
      }
      return false;
    case 'HALF_OPEN':
      return true;
  }
}

function recordSuccess(cb: CircuitBreaker): void {
  cb.failure_count = 0;
  cb.success_count++;
  if (cb.state === 'HALF_OPEN' && cb.success_count >= 2) {
    cb.state = 'CLOSED';
    cb.success_count = 0;
  }
}

function recordFailure(cb: CircuitBreaker): void {
  cb.failure_count++;
  cb.last_failure_time = Date.now();
  if (cb.state === 'HALF_OPEN') {
    cb.state = 'OPEN';
  } else if (cb.failure_count >= cb.config.failure_threshold) {
    cb.state = 'OPEN';
  }
}
```

### Per-Worker Circuit Keys

| Worker | Circuit Key | Config |
|--------|-------------|--------|
| T3a (Backend) | `backend` | Use global config |
| T3b (Frontend) | `frontend` | Use global config |
| T3c (Mobile) | `mobile` | Use global config |
| T4 (DevOps) | `devops` | Use global config |
| T5 (QA) | `qa` | Use global config |
| T6a/6b (Review) | `review` | Use global config |

### Example State Tracking

```json
{
  "circuits": {
    "backend":  { "state": "CLOSED", "failure_count": 0, "last_failure": null },
    "frontend": { "state": "CLOSED", "failure_count": 0, "last_failure": null },
    "devops":   { "state": "OPEN", "failure_count": 5, "last_failure": "2026-04-13T10:30:00Z" }
  }
}
```

## Integration Points

1. **parallel-dispatch/SKILL.md** — Add circuit breaker check in worker dispatch
2. **graceful-failure.md** — Reference circuit breaker in retry logic
3. **middleware-chain.md** — Add CircuitBreaker middleware (optional)

## Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | 3 failures in CLOSED | State → OPEN |
| 2 | Request in OPEN | Fail immediately |
| 3 | After 60s in OPEN | State → HALF_OPEN |
| 4 | Success in HALF_OPEN | State → CLOSED after 2 successes |
| 5 | Failure in HALF_OPEN | State → OPEN |
