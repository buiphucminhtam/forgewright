---
name: sre
description: "Orchestrates system reliability engineering, performance benchmarking, containerized monitoring setups, CI/CD pipeline automation, and system SLO audits. Use when the user requests container setups (Docker), k6 load testing, deployment workflow configurations, dashboard metric monitoring, or system latency profiling."
version: 1.0.0
---

# Sre (LITE)

## SOLVE Step 2: GROUND (Sre Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Active project tech stack and development profile are established [1] | `cat .forgewright/project-profile.json` | Identifies active environments and baseline system health status [1] | |
| Performance monitoring stack (k6/InfluxDB/Grafana) configurations exist [2] | `find docker/perf-stack/ -name \"*.yml\" -o -name \"*.json\" \|\| ls -la docker-compose.test.yml` [2, 3] | Locates containerized load testing or metric instrumentation profiles [2] | |
| Deployment workflow and staged-rollout automation scripts exist [4] | `find .github/workflows/ -name \"*.yml\"` [3, 4] | Verifies CI/CD pipeline stages, testing gates, and benchmark workflows [4] | |
| Running token tracker parameters and spend safety budgets are configured [5, 6] | `cat .forgewright/budget.yaml` [5, 6] | Displays active session spending limits and safety cost caps [5, 7] | |

## SOLVE Step 3: DECOMPOSE (Sre Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Review deployment workflows, container structures, and monitoring endpoints [2, 4] | Ensure that health check thresholds, rate-limiting policies, and connection pool bounds are defined.
2. CONSTRUCT | Author robust k6 performance testing scripts, Docker configurations, or CI/CD pipelines [2, 4] | Verify that load test targets and deployment scripts compile without syntax errors.
3. BENCHMARK | Execute automated performance stress-tests and evaluate latency metrics [2] | Confirm that system average latencies, error rates, and resource profiles stay within SLO budgets under simulated loads.
4. SYNC | Compile SRE reports as lowercase kebab-case and trigger sync hooks [8, 9] | Run post-skill hooks to sync reliability summaries and establish absolute symlinks to Obsidian [8, 9].

## Common Mistakes Checklist
- **Running High-Load Stress Tests Directly Against Production**: Triggering unthrottled k6 load tests directly against live production systems, risking unmanaged service denial.
- **Hardcoding Deployment Credentials & API Keys**: Embedding plain-text secrets, container registries passwords, or API tokens inside workflow files or docker-compose manifests instead of referencing secure secrets.
- **Unbounded Resource Allocation in Containers**: Failing to restrict container CPU and memory bounds inside Docker definitions, leading to host resource exhaustion under heavy test loads.
- **Non-Compliant File Names for Runbooks**: Storing deploy runbooks, incident reports, or benchmark logs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case [9] (e.g., `docs/05-operations/SreRunbook.md` instead of `docs/05-operations/sre-runbook.md` [9]).
- **Unverified AI Token Spending**: Executing long, automated resource-tuning feedback loops or generating infinite benchmark configs without checking the active spend limit in `.forgewright/budget.yaml` [5, 7].

## Worked Example

### Step 1: Ground target project settings and CI/CD benchmarks
```bash
cat .forgewright/project-profile.json
ls -la docker-compose.test.yml
```
Output:
```json
{
  "project_name": "forgewright-sre-service",
  "tech_stack": ["Go", "Docker", "k6"],
  "health_status": "PASS"
}
```
```
-rw-r--r-- 1 sandbox sandbox 450 Jul  3 15:40 docker-compose.test.yml
```

### Step 2: Implement a safe, targeted k6 load testing script in `tests/performance/k6-load-test.js`
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

// Grounded Rule: Define strict, realistic target SLO bounds for SLA verification
export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp up to 20 virtual users
    { duration: '1m', target: 20 },  // Stay at 20 users
    { duration: '10s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete under 500ms
    http_req_failed: ['rate<0.01'],   // Error rate must be less than 1%
  },
};

export default function () {
  const res = http.get('http://localhost:8080/api/health');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
```

### Step 3: Spin up the local test stack and execute the k6 performance benchmark
```bash
# Start containerized target app via Docker Compose
docker-compose -f docker-compose.test.yml up -d

# Execute k6 load test runner
k6 run tests/performance/k6-load-test.js
```
Output:
```
          /\      |‾‾| /‾‾/   /‾‾/   
     /\  /  \     |  |/  /   /  /    
    /  \/    \    |     (   /   ‾‾\  
   /          \   |  |\  \ |  (‾)  | 
  / __________ \  |__| \__\ \_____/ .io

  execution: local
     script: tests/performance/k6-load-test.js
     output: -

  scenarios: (100.00%) 1 scenario, 20 max VUs, 1m50s max duration (including graceful stop)

running (1m50.0s), 00/20 VUs, 1184 complete and 0 interrupted iterations
default ✓ [======================================] 20 VUs  1m50.0s

     ✓ status is 200

     checks.........................: 100.00% ✓ 1184     ✗ 0    
     data_received..................: 184 kB  1.7 kB/s
     data_sent......................: 98 kB   891 B/s
     http_req_blocked...............: avg=21µs    min=3µs    med=6µs    max=1.2ms  p(90)=12µs   p(95)=18µs  
     http_req_connecting............: avg=4µs     min=0s     med=0s     max=322µs  p(90)=0s     p(95)=0s    
     http_req_duration..............: avg=4.12ms  min=1.02ms med=3.14ms max=82.1ms p(90)=8.12ms p(95)=12.4ms
       { expected_response:true }...: avg=4.12ms  min=1.02ms med=3.14ms max=82.1ms p(90)=8.12ms p(95)=12.4ms
     http_req_failed................: 0.00%   ✓ 0        ✗ 1184 
     http_req_receiving.............: avg=34µs    min=5µs    med=12µs   max=2.01ms p(90)=38µs   p(95)=64µs  
     http_req_sending...............: avg=11µs    min=2µs    med=5µs    max=411µs  p(90)=10µs   p(95)=15µs  
     http_req_tls_handshaking.......: avg=0s      min=0s     med=0s     max=0s     p(90)=0s     p(95)=0s    
     http_req_waiting...............: avg=4.07ms  min=1.01ms med=3.09ms max=82.0ms p(90)=8.05ms p(95)=12.2ms
     http_reqs......................: 1184    10.7636/s
     iteration_duration.............: avg=1.00s   min=1.00s  med=1.00s  max=1.08s  p(90)=1.01s  p(95)=1.01s 
     iterations.....................: 1184    10.7636/s
     vus............................: 0       min=0      max=20 
     vus_max........................: 20      min=20     max=20 

[SUCCESS] Benchmark assertions completed successfully.
[INFO] p(95) response latency: 12.4ms (Threshold check: < 500ms PASS).
[INFO] Request error rate: 0.00% (Threshold check: < 1.00% PASS).
```

### Step 4: Tear down local test environment, compile logs, and sync to Obsidian
```bash
docker-compose -f docker-compose.test.yml down

# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/05-operations/performance-benchmarking-report.md
# Performance Benchmarking Report

## 1. Executive Summary
Executed automated system benchmarking stress-tests to verify API latency budgets and check SLO criteria.

## 2. Technical Profile
- Test Runner: k6 CLI Load Engine
- Target Stack: Containerized local server (Docker Compose)
- SLO Verification: Weighted 95th-percentile response times verified under 20ms (PASS)
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for performance-benchmarking-report.md.
[SUCCESS] Symlinked docs/05-operations/performance-benchmarking-report.md to /workspace/shared-obsidian-vault/forgewright/05-operations/performance-benchmarking-report.md.
```
