---
name: performance-engineer
description: "Orchestrates load testing, performance profiling, query tuning, bundle size audits, and metrics monitoring. Use when the user requests API load tests, CPU/memory leak checks, database indexing, k6 benchmark scripting, or local Grafana monitoring setups."
version: 1.0.0
---

# Performance Engineer (LITE)

## SOLVE Step 2: GROUND (Performance Engineer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Local dockerized performance monitoring stack (k6, InfluxDB, Grafana) is active | `docker ps --filter "name=perf-stack" --format "{{.Names}}"` | ... | run the check command and paste output |
| Metric tracking and load script configurations exist in the performance stack | `find docker/perf-stack/ -name "*.js" -o -name "*.json"` | ... | run the check command and paste output |
| Baseline performance runbooks are documented in operations folder | `find docs/05-operations/ -name "*performance*" -o -name "*benchmark*"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Performance Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. PROFILE | Run bundle-size audits or CPU/memory trace analysis on active modules | Verify that JS/TS chunks, WebGL textures, and server execution loops conform to size/timing boundaries.
2. LOAD | Execute API load benchmarks using k6 CLI test profiles | Measure RPS (Requests Per Second), error rates, and p95/p99 latency thresholds against active baselines.
3. REMEDIATE | Apply database index strategies, response caching, or asset compression | Confirm optimized endpoints pass validation tests without regressions or API deviations.

## Common Mistakes Checklist
- **Unbounded load spikes in production**: Running high-volume k6 stress tests directly against production systems instead of isolated docker test environments.
- **Ignoring non-recycled connections**: Leaving database pools, socket connections, or Web Audio contexts unclosed during load cycles, triggering false leak reports.
- **Context window metric dumps**: Appending raw, heavy k6 output JSON or raw heap dump tables directly into the active chat session instead of saving summaries.
- **Missing baseline comparisons**: Reporting p95/p99 metrics as standalone figures without comparing them to previous baseline performance profiles.
- **Non-compliant report file naming**: Saving performance logs inside `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `performance-benchmark-v1.md`).

### Step 1: Ensure local k6 load-testing stack is initialized and running
```bash
docker compose -f docker/perf-stack/docker-compose.yml up -d
docker ps --filter "name=perf-stack" --format "table {{.Names}}\t{{.Status}}"
```

### Step 2: Run k6 API benchmark script using local metrics ingestion
```bash
k6 run --out influxdb=http://localhost:8086/k6 docker/perf-stack/api-load-test.js
```

### Step 3: Write a compliant, lowercase kebab-case performance log under `docs/05-operations/`
```bash
cat << 'EOF' > docs/05-operations/performance-benchmark.md
# Performance Benchmark Report

## Metrics Summary
- Total Requests: 1500 (49.8/s)
- Error Rate: 0.00%
- p95 Latency: 94.5ms (PASS, target < 100ms)

## Environment
- Engine: Node.js 18 with local SQLite (WAL mode active)
- Monitor: k6 with InfluxDB & Grafana
EOF

# Execute synchronization hook to align docs with Obsidian Vault
./scripts/sync-obsidian.sh
```
