# Bulkhead Isolation Protocol

> **Purpose:** Isolate worker failures to prevent cascading crashes. Inspired by the Bulkhead pattern from Release It! (Michael Nygard) — named after watertight compartments in ships that prevent flooding from spreading.

## Concept

A bulkhead divides a system into isolated compartments. If one compartment floods, the others remain intact. In Forgewright:

- Each parallel worker is a **compartment**
- Worker failure is **flooding**
- Main process and other workers are **protected compartments**

## Isolation Levels

| Level | Isolation | Performance Cost | Use Case |
|-------|-----------|-----------------|----------|
| **process** | Separate bash process | Low | Default, git worktrees |
| **container** | Docker/container | Medium | Full isolation needed |
| **vm** | Virtual machine | High | Untrusted code |

## Configuration

Add to `.production-grade.yaml`:

```yaml
bulkhead:
  max_memory_mb: 512       # Max memory per worker
  max_cpu_percent: 80     # Max CPU usage per worker
  max_duration_minutes: 30 # Max execution time
  isolation_level: process # process | container | vm
  auto_cleanup: true       # Cleanup on timeout
```

Per-worker overrides:

```yaml
bulkhead:
  workers:
    T3a:  # Backend
      max_memory_mb: 512
      max_duration_minutes: 30
    T4:   # DevOps
      max_memory_mb: 768
      max_duration_minutes: 45
    T6:   # Review
      max_memory_mb: 256
      max_duration_minutes: 20
```

## Resource Limits Implementation

### Process Level (Default)

> **⚠️ Platform Note:** `ulimit -v` and `ulimit -m` do NOT work on macOS. Memory limits
> are enforced via the **Watchdog** approach only. CPU time (`ulimit -t`) works on both.

```bash
# CPU time limit (works on macOS and Linux)
ulimit -t 1800             # 30 minutes CPU time

# Memory limits: via watchdog only on macOS
# See Bash Watchdog Implementation below
```

### Watchdog (Cross-Platform, Recommended)

The watchdog monitors worker processes and kills them if they exceed memory or time limits.
This approach works on macOS, Linux, and Windows (via WSL).

```bash
#!/usr/bin/env bash
# Worker watchdog with bulkhead limits

start_watched_worker() {
  local task_id="$1"
  local worktree_path="$2"
  local max_memory_mb="${3:-512}"
  local max_duration_min="${4:-30}"

  local max_mem_kb=$((max_memory_mb * 1024))
  local max_seconds=$((max_duration_min * 60))
  local log_file="${worktree_path}/worker-${task_id}.log"

  # Start worker in background
  (
    cd "$worktree_path"
    gemini -p "..." > "$log_file" 2>&1
  ) &
  local worker_pid=$!

  # Start watchdog
  local start_time=$(date +%s)
  while kill -0 "$worker_pid" 2>/dev/null; do
    local mem=$(ps -o rss= -p "$worker_pid" 2>/dev/null || echo 0)
    local elapsed=$(($(date +%s) - start_time))

    if [ "$mem" -gt "$max_mem_kb" ]; then
      kill -9 "$worker_pid" 2>/dev/null
      echo "[BULKHEAD] OOM_KILLED: ${task_id} (${mem}KB > ${max_mem_kb}KB)" >> ".forgewright/bulkhead-log.md"
      return 1
    fi

    if [ "$elapsed" -gt "$max_seconds" ]; then
      kill -9 "$worker_pid" 2>/dev/null
      echo "[BULKHEAD] TIMEOUT: ${task_id} (${elapsed}s > ${max_seconds}s)" >> ".forgewright/bulkhead-log.md"
      return 2
    fi

    sleep 5
  done

  wait "$worker_pid"
  return $?
}
```

### Container Level (Optional)

```bash
# Docker container with resource limits
docker run \
  --memory=512m \
  --cpus=0.8 \
  --memory-swap=512m \
  --pids-limit=100 \
  --ulimit nofile=1024:2048 \
  worktree-worker

# Kubernetes (for production deployments)
resources:
  limits:
    memory: "512Mi"
    cpu: "800m"
  requests:
    memory: "256Mi"
    cpu: "400m"
```

## Failure Containment

| Scenario | Behavior |
|----------|----------|
| Worker OOM | Kill worker, log event, continue other workers |
| Worker timeout | Kill worker, mark as FAILED, continue other workers |
| Worker segfault | Catch signal, cleanup, mark as FAILED |
| Worker infinite loop | Timeout watchdog kills worker |

## Bash Watchdog Implementation

```bash
#!/usr/bin/env bash
# Worker watchdog with bulkhead limits

start_watched_worker() {
  local task_id="$1"
  local worktree_path="$2"
  local max_memory_mb="${3:-512}"
  local max_duration_min="${4:-30}"

  local max_mem_kb=$((max_memory_mb * 1024))
  local max_seconds=$((max_duration_min * 60))
  local log_file="${worktree_path}/worker-${task_id}.log"

  # Start worker in background
  (
    cd "$worktree_path"
    gemini -p "..." > "$log_file" 2>&1
  ) &
  local worker_pid=$!

  # Start watchdog
  local start_time=$(date +%s)
  while kill -0 "$worker_pid" 2>/dev/null; do
    local mem=$(ps -o rss= -p "$worker_pid" 2>/dev/null || echo 0)
    local elapsed=$(($(date +%s) - start_time))

    if [ "$mem" -gt "$max_mem_kb" ]; then
      kill -9 "$worker_pid" 2>/dev/null
      echo "[BULKHEAD] OOM_KILLED: ${task_id} (${mem}KB > ${max_mem_kb}KB)" >> ".forgewright/bulkhead-log.md"
      return 1
    fi

    if [ "$elapsed" -gt "$max_seconds" ]; then
      kill -9 "$worker_pid" 2>/dev/null
      echo "[BULKHEAD] TIMEOUT: ${task_id} (${elapsed}s > ${max_seconds}s)" >> ".forgewright/bulkhead-log.md"
      return 2
    fi

    sleep 5
  done

  # Worker completed
  wait "$worker_pid"
  return $?
}
```

## Integration Points

1. **scripts/worktree-manager.sh** — Add resource limit flags to worker processes
2. **parallel-dispatch/SKILL.md** — Add bulkhead checks in worker dispatch

## Test Scenarios

| # | Scenario | Expected Result |
|---|----------|----------------|
| 1 | Worker OOM | Worker killed, main process alive, other workers continue |
| 2 | Worker timeout | Worker killed after limit, marked FAILED |
| 3 | Worker segfault | Signal caught, cleanup executed, FAILED logged |
| 4 | Memory leak | Watchdog kills worker at limit |
| 5 | CPU spin | Timeout watchdog kills worker |
| 6 | One worker fails | Other workers continue unaffected |

## Monitoring

Log bulkhead events to `.forgewright/bulkhead-log.md`:

```markdown
## Bulkhead Events Log

| Timestamp | Worker | Event | Memory | CPU | Duration |
|-----------|--------|-------|--------|-----|----------|
| 2026-04-12T10:30:00Z | T3a | OOM_KILLED | 513MB | 95% | 5m |
| 2026-04-12T10:35:00Z | T3b | TIMEOUT | 128MB | 10% | 30m |
| 2026-04-12T10:40:00Z | T3c | COMPLETED | 256MB | 45% | 12m |
```

## Safety Guarantees

1. **Main process never crashes** due to worker failure
2. **Other workers continue** when one fails
3. **Clean cleanup** of killed worker resources
4. **Audit trail** of all bulkhead events
