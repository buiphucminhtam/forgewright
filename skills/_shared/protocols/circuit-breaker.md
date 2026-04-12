# Circuit Breaker Protocol

> **Purpose:** Prevent cascading failures in parallel execution by stopping requests to failing workers.
> **Pattern:** Inspired by Michael Nygard's Circuit Breaker pattern (Release It! 2nd Edition).

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
  timeout_duration: 60       # seconds OPEN before HALF_OPEN
  recovery_timeout: 120     # seconds in HALF_OPEN before CLOSED
```

## When to Apply

- Parallel dispatch workers in `parallel-dispatch/SKILL.md`
- External API calls in skills
- Any skill with retry logic

## State Machine

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
      if (Date.now() - cb.last_failure_time > cb.config.timeout_duration) {
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

## Bash Implementation

```bash
#!/usr/bin/env bash
# Circuit Breaker State Manager

CIRCUIT_FILE="${CIRCUIT_FILE:-.forgewright/circuits.json}"

load_circuit() {
  local key="$1"
  if [ -f "$CIRCUIT_FILE" ]; then
    jq -r ".${key} // null" "$CIRCUIT_FILE" 2>/dev/null || echo "null"
  else
    echo "null"
  fi
}

save_circuit() {
  local key="$1"
  local state="$2"
  local failures="$3"
  local last_failure="$4"

  mkdir -p "$(dirname "$CIRCUIT_FILE")"
  local temp=$(mktemp)

  if [ -f "$CIRCUIT_FILE" ]; then
    jq --arg k "$key" --arg s "$state" --argjson f "$failures" --argjson l "$last_failure" \
      'setpath(split($k; "."); {state: $s, failure_count: $f, last_failure: $l})' \
      "$CIRCUIT_FILE" > "$temp" && mv "$temp" "$CIRCUIT_FILE"
  else
    echo "{\"${key}\": {\"state\": \"$state\", \"failure_count\": $failures, \"last_failure\": $last_failure}}" > "$CIRCUIT_FILE"
  fi
}

should_allow() {
  local key="$1"
  local timeout="${2:-60}"

  local data=$(load_circuit "$key")
  if [ "$data" = "null" ]; then
    echo "CLOSED"  # Default state
    return 0
  fi

  local state=$(echo "$data" | jq -r '.state')
  local last_failure=$(echo "$data" | jq -r '.last_failure // 0')
  local now=$(date +%s)
  local elapsed=$((now - last_failure))

  case "$state" in
    CLOSED)
      echo "CLOSED"
      return 0
      ;;
    OPEN)
      if [ $elapsed -ge $timeout ]; then
        echo "HALF_OPEN"
        return 0
      fi
      echo "OPEN"
      return 1
      ;;
    HALF_OPEN)
      echo "HALF_OPEN"
      return 0
      ;;
  esac
}

record_success() {
  local key="$1"
  local data=$(load_circuit "$key")

  if [ "$data" = "null" ]; then
    save_circuit "$key" "CLOSED" 0 "null"
    return
  fi

  local state=$(echo "$data" | jq -r '.state')
  local failures=$(echo "$data" | jq -r '.failure_count // 0')
  local successes=$(echo "$data" | jq -r '.success_count // 0')

  if [ "$state" = "HALF_OPEN" ]; then
    successes=$((successes + 1))
    if [ $successes -ge 2 ]; then
      save_circuit "$key" "CLOSED" 0 "null"
    else
      save_circuit "$key" "HALF_OPEN" 0 "$successes"
    fi
  else
    save_circuit "$key" "CLOSED" 0 "null"
  fi
}

record_failure() {
  local key="$1"
  local threshold="${2:-3}"

  local data=$(load_circuit "$key")
  local state="CLOSED"
  local failures=0

  if [ "$data" != "null" ]; then
    state=$(echo "$data" | jq -r '.state')
    failures=$(echo "$data" | jq -r '.failure_count // 0')
  fi

  failures=$((failures + 1))
  local now=$(date +%s)

  if [ "$state" = "HALF_OPEN" ]; then
    save_circuit "$key" "OPEN" "$failures" "$now"
  elif [ $failures -ge $threshold ]; then
    save_circuit "$key" "OPEN" "$failures" "$now"
  else
    save_circuit "$key" "CLOSED" "$failures" "$now"
  fi
}
```

## Test Scenarios

| # | Scenario | Expected Result |
|---|----------|----------------|
| 1 | 3 failures in CLOSED | State → OPEN |
| 2 | Request in OPEN | Fail immediately |
| 3 | After 60s in OPEN | State → HALF_OPEN |
| 4 | Success in HALF_OPEN | State → CLOSED after 2 successes |
| 5 | Failure in HALF_OPEN | State → OPEN |

## Integration Points

1. **parallel-dispatch/SKILL.md** — Add circuit breaker check in worker dispatch
2. **graceful-failure.md** — Reference circuit breaker in retry logic
3. **middleware-chain.md** — Add CircuitBreaker middleware (optional)

## State Tracking

Circuit state is persisted in `.forgewright/circuits.json`:

```json
{
  "backend": { "state": "CLOSED", "failure_count": 0, "last_failure": null },
  "frontend": { "state": "OPEN", "failure_count": 5, "last_failure": 1712912400 },
  "devops": { "state": "HALF_OPEN", "failure_count": 3, "last_failure": 1712912400 }
}
```
