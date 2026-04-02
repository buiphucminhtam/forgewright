# Phase 3: Chaos Engineering

## Objective

Proactively discover failure modes before users do. Build confidence that the system degrades gracefully. Every chaos experiment validates against a measurable steady-state hypothesis.

## Context Bridge

- Read Phase 1 findings from `production-readiness/findings.md` for known weaknesses to target
- Read Phase 2 SLOs from `slo/sli-definitions.yaml` for steady-state metrics to monitor during experiments
- Read architecture docs for dependency map and single points of failure

## Inputs

- Architecture docs — dependency map, single points of failure
- `infrastructure/kubernetes/` — deployment topology
- Phase 1 findings — known weaknesses to target
- Phase 2 SLOs — steady-state metrics to monitor during experiments

## Workflow

### Step 1: Define Steady-State Hypothesis

Write `chaos/steady-state-hypothesis.md` defining what "healthy" looks like in measurable terms:

```markdown
# Steady-State Hypothesis

## Definition
The system is in steady state when ALL of the following are true:

### Service Health
- API availability SLI > 99.9% over the last 5 minutes
- API p99 latency < 500ms over the last 5 minutes
- All readiness probes passing
- No pods in CrashLoopBackOff

### Data Integrity
- Database replication lag < 1 second
- Message queue consumer lag < 1000 messages
- Cache hit rate > 80%

### Business Metrics
- Order completion rate > 95% of baseline
- User-facing error rate < 0.1%
```

### Step 2: Generate Chaos Scenarios

Write chaos scenario files in `chaos/scenarios/` using Chaos Mesh CRD format (with Litmus and Gremlin equivalents in comments).

**`pod-failure.yaml`** — Kill random pods to validate self-healing:
```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: pod-kill-api
  namespace: chaos-testing
spec:
  action: pod-kill
  mode: one
  selector:
    namespaces: [production]
    labelSelectors:
      app: api-gateway
  duration: "60s"
  scheduler:
    cron: "@every 5m"  # Only during game days
---
# Expected behavior:
# - Kubernetes reschedules the pod within 30s
# - Readiness probe prevents traffic to new pod until ready
# - No user-visible errors (other pods absorb traffic)
# - SLO burn rate does not spike
#
# Litmus equivalent: pod-delete experiment
# Gremlin equivalent: State > Shutdown
```

**`network-partition.yaml`** — Simulate network failures between services:
```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: network-partition-db
  namespace: chaos-testing
spec:
  action: partition
  mode: all
  selector:
    namespaces: [production]
    labelSelectors:
      app: api-gateway
  direction: to
  target:
    selector:
      namespaces: [production]
      labelSelectors:
        app: database
  duration: "120s"
---
# Expected behavior:
# - Circuit breaker trips within 10s
# - Fallback responses served (cached data or graceful degradation)
# - Alerts fire within 2 minutes
# - System recovers automatically when partition heals
```

**`dependency-failure.yaml`** — Simulate external dependency outages:
```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: external-dependency-failure
  namespace: chaos-testing
spec:
  action: loss
  mode: all
  selector:
    namespaces: [production]
    labelSelectors:
      app: payment-service
  loss:
    loss: "100"
  direction: to
  externalTargets:
    - "payment-provider.example.com"
  duration: "300s"
---
# Expected behavior:
# - Payment requests fail fast (circuit breaker)
# - Orders queue for retry (not lost)
# - User sees "payment processing delayed" (not a 500)
# - Alerting escalates to on-call within 5 minutes
```

**`resource-pressure.yaml`** — Simulate CPU/memory/disk pressure:
```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: StressChaos
metadata:
  name: cpu-stress-api
  namespace: chaos-testing
spec:
  mode: one
  selector:
    namespaces: [production]
    labelSelectors:
      app: api-gateway
  stressors:
    cpu:
      workers: 4
      load: 80
    memory:
      workers: 2
      size: "512MB"
  duration: "180s"
---
# Expected behavior:
# - HPA triggers scale-out within 2 minutes
# - Latency degrades but stays within SLO
# - No OOMKills (memory limits correctly set)
# - CPU throttling visible in metrics
```

### Step 3: Generate Game-Day Playbook

Write `chaos/game-day-playbook.md`:

```markdown
# Game Day Playbook

## Pre-Game Day (1 week before)
- [ ] Schedule game day window (2-4 hours, business hours)
- [ ] Notify all on-call engineers and stakeholders
- [ ] Verify steady-state hypothesis metrics are accessible
- [ ] Confirm rollback procedures for each experiment
- [ ] Set up dedicated Slack channel for game day comms
- [ ] Verify chaos tooling is installed and authorized in target namespace
- [ ] Brief participants on experiment sequence and abort criteria

## Abort Criteria
Immediately halt ALL experiments if:
- User-facing error rate exceeds 1% for more than 2 minutes
- Data corruption is detected
- Payment processing completely stops
- On-call receives customer reports of outages

## Experiment Sequence

### Round 1: Pod Resilience (Low Risk)
1. Record steady-state metrics baseline
2. Execute pod-failure.yaml against non-critical service
3. Observe for 5 minutes, record behavior
4. Execute pod-failure.yaml against critical service (api-gateway)
5. Observe for 5 minutes, record behavior
6. Document findings

### Round 2: Network Chaos (Medium Risk)
1. Verify steady state restored from Round 1
2. Execute network-partition.yaml (service-to-database)
3. Observe circuit breaker behavior for 3 minutes
4. Remove partition, observe recovery
5. Document time-to-detect, time-to-recover

### Round 3: Dependency Failure (Medium Risk)
1. Verify steady state restored from Round 2
2. Execute dependency-failure.yaml
3. Observe fallback behavior
4. Verify queued operations retry after recovery
5. Document data integrity check results

### Round 4: Resource Pressure (Higher Risk)
1. Verify steady state restored from Round 3
2. Execute resource-pressure.yaml
3. Observe HPA behavior and scaling timeline
4. Verify SLOs maintained during scale-out
5. Document scaling decisions and latency impact

## Post-Game Day
- [ ] Compile findings into incident-style report
- [ ] File tickets for every unexpected behavior
- [ ] Update runbooks with discoveries
- [ ] Schedule follow-up game day in 30 days
- [ ] Present findings to engineering team
```

## Validation

Before proceeding to Phase 4, verify:
- [ ] Steady-state hypothesis is defined with measurable metrics
- [ ] At least 4 chaos scenarios exist (pod failure, network partition, dependency failure, resource pressure)
- [ ] Each scenario documents expected behavior
- [ ] Game-day playbook has explicit abort criteria
- [ ] Experiment sequence progresses from low to high risk

## Quality Bar

Chaos experiments without a steady-state hypothesis are dangerous guesswork. Every scenario must define: (1) what "normal" looks like before the experiment, (2) what behavior is expected during the experiment, (3) what recovery should look like after. Scenarios that say "see what happens" are not acceptable.
