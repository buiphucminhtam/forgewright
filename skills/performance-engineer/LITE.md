---
name: performance-engineer
description: "Orchestrates load testing, performance profiling, query tuning, bundle size audits, and metrics monitoring. Use when the user requests API load tests, CPU/memory leak checks, database indexing, k6 benchmark scripting, or local Grafana monitoring setups."
version: 1.0.0
---

# Performance Engineer (LITE)

## SOLVE Step 2: GROUND (Performance Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Local dockerized performance monitoring stack (k6, InfluxDB, Grafana) is active | `docker ps --filter "name=perf-stack" --format "{{.Names}}"` | Lists active performance containers (e.g., grafana, Influxdb) | |
| Metric tracking and load script configurations exist in the performance stack | `find docker/perf-stack/ -name "*.js" -o -name "*.json"` | Identifies k6 test scripts or dashboard JSON configurations | |
| Baseline performance runbooks are documented in operations folder | `find docs/05-operations/ -name "*performance*" -o -name "*benchmark*"` | Lists lowercase, kebab-case benchmarking docs | |
| Local token trackers and spending budget boundaries are configured | `cat .forgewright/budget.yaml` | Verifies spend limits prior to initiating heavy model evaluations | |

## SOLVE Step 3: DECOMPOSE (Performance Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. PROFILE | Run bundle-size audits or CPU/memory trace analysis on active modules | Verify that JS/TS chunks, WebGL textures, and server execution loops conform to size/timing boundaries.
2. LOAD | Execute API load benchmarks using k6 CLI test profiles | Measure RPS (Requests Per Second), error rates, and p95/p99 latency thresholds against active baselines.
3. REMEDIATE | Apply database index strategies, response caching, or asset compression | Confirm optimized endpoints pass validation tests without regressions or API deviations.
4. SYNC | Export benchmark markdown logs to `docs/05-operations/` and run sync hooks | Trigger post-skill script execution to symlink the output files to the Shared Obsidian Vault.

## Common Mistakes Checklist
- **Unbounded load spikes in production**: Running high-volume k6 stress tests directly against production systems instead of isolated docker test environments.
- **Ignoring non-recycled connections**: Leaving database pools, socket connections, or Web Audio contexts unclosed during load cycles, triggering false leak reports.
- **Context window metric dumps**: Appending raw, heavy k6 output JSON or raw heap dump tables directly into the active chat session instead of saving summaries.
- **Missing baseline comparisons**: Reporting p95/p99 metrics as standalone figures without comparing them to previous baseline performance profiles.
- **Non-compliant report file naming**: Saving performance logs inside `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `performance-benchmark-v1.md`).

## Worked Example

### Step 1: Ensure local k6 load-testing stack is initialized and running
```bash
docker compose -f docker/perf-stack/docker-compose.yml up -d
docker ps --filter "name=perf-stack" --format "table {{.Names}}\t{{.Status}}"
```
Output:
```
NAMES                         STATUS
perf-stack-grafana-1          Up 2 minutes
perf-stack-influxdb-1         Up 2 minutes
```

### Step 2: Run k6 API benchmark script using local metrics ingestion
```bash
k6 run --out influxdb=http://localhost:8086/k6 docker/perf-stack/api-load-test.js
```
Output:
```
          /\      |‾‾| /‾‾/   /‾‾/   
     /\  /  \     |  |/  /   /  /    
    /  \/    \    |     (   /   ‾‾\  
   /          \   |  |\  \ |  (‾)  | 
  / __________ \  |__| \__\ \_____/ .io

  execution: local
     script: docker/perf-stack/api-load-test.js
     scenarios: (100.00%) 1 scenario, 50 max VUs, 30s duration

     ✓ status was 200

     checks.........................: 100.00% ✓ 1500      ✗ 0   
     data_received..................: 452 kB   15 kB/s
     data_sent......................: 89 kB    3.0 kB/s
     http_req_duration..............: avg=42.12ms min=5.1ms med=28.4ms max=182ms p(90)=82ms p(95)=94.5ms
     http_reqs......................: 1500     49.871583/s
     vus............................: 50       min=50      max=50

[SUCCESS] Performance test completed. All 1500 requests passed validation rules (p95 < 100ms).
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
Output:
```
[SUCCESS] Symlinked docs/05-operations/performance-benchmark.md to /workspace/shared-obsidian-vault/forgewright/05-operations/performance-benchmark.md.
```
