---
id: bulkhead
title: Bulkhead Isolation Protocol
summary: Core protocol for bulkhead.
status: active
version: 1.0.0
owners: [core]
triggers: []
used_by: [all]
related: []
supersedes: []
superseded_by: null
---
# Bulkhead Isolation Protocol

> **Purpose:** Isolate worker failures to prevent cascading crashes. Inspired by the Bulkhead pattern from *Release It!* (Michael Nygard) — named after watertight compartments in ships that prevent flooding from spreading.

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

Add to `parallel-dispatch` section:

```yaml
bulkhead:
  max_memory_mb: 512        # Max memory per worker
  max_cpu_percent: 80       # Max CPU usage per worker
  max_duration_minutes: 30  # Max execution time
  isolation_level: process    # process | container | vm
  auto_cleanup: true         # Cleanup on timeout
```

## Resource Limits Implementation

### Process Level (Default)

```bash
# Worker process with resource limits
ulimit -v $((512 * 1024))  # 512MB virtual memory
ulimit -m $((512 * 1024))  # 512MB physical memory
ulimit -t 1800             # 30 minutes CPU time

# Monitor worker
(
  worker_pid=$!
  while kill -0 $worker_pid 2>/dev/null; do
    # Check memory
    mem=$(ps -o rss= -p $worker_pid 2>/dev/null || echo 0)
    if [ $mem -gt $((512 * 1024)) ]; then
      kill -9 $worker_pid
      echo "Worker exceeded memory limit"
    fi
    sleep 5
  done
) &
```

### Container Level (Optional)

```bash
# Docker container with resource limits
docker run \
  --memory=512m \
  --cpus=0.8 \
  --memory-swap=512m \
  worktree-worker
```

## Failure Containment

| Scenario | Behavior |
|----------|----------|
| Worker OOM | Kill worker, log event, continue other workers |
| Worker timeout | Kill worker, mark as FAILED, continue other workers |
| Worker segfault | Catch signal, cleanup, mark as FAILED |
| Worker infinite loop | Timeout watchdog kills worker |

## Integration Points

1. **scripts/worktree-manager.sh** — Add resource limit flags to worker processes
2. **parallel-dispatch/SKILL.md** — Add bulkhead checks in worker dispatch

## Worker Resource Limits

| Worker | Memory | CPU | Time | On Limit |
|--------|--------|-----|------|----------|
| T3a (Backend) | 512MB | 80% | 30min | Kill + Skip |
| T3b (Frontend) | 512MB | 80% | 30min | Kill + Skip |
| T3c (Mobile) | 512MB | 80% | 30min | Kill + Skip |
| T4 (DevOps) | 768MB | 80% | 45min | Kill + Skip |
| T5 (QA) | 512MB | 80% | 30min | Kill + Skip |
| T6 (Review) | 256MB | 40% | 20min | Kill + Skip |

## Monitoring

Log bulkhead events:

| Timestamp | Worker | Event | Memory | CPU | Duration |
|-----------|--------|-------|--------|-----|----------|
| 2026-04-13T10:30:00Z | T3a | OOM_KILLED | 513MB | 95% | 5m |
| 2026-04-13T10:35:00Z | T3b | TIMEOUT | 128MB | 10% | 30m |

## Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Worker OOM | Worker killed, main process alive, other workers continue |
| 2 | Worker timeout | Worker killed after 30min, marked FAILED |
| 3 | Worker segfault | Signal caught, cleanup executed, FAILED logged |
| 4 | Memory leak | Watchdog kills worker at limit |
| 5 | CPU spin | Timeout watchdog kills worker |
