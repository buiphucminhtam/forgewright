# Phase 1: Production Readiness Review

## Objective

Systematically evaluate every service for production survivability. This is not a rubber stamp — it is an adversarial review. Every checklist item that fails gets documented with severity and specific evidence.

## Inputs

- `infrastructure/kubernetes/` — pod specs, probes, resource limits
- `infrastructure/terraform/` — infrastructure sizing, redundancy
- Application source code — connection pooling, retry logic, timeout configs
- Architecture docs — dependency map, data stores, external integrations

## Workflow

### Step 1: Read Kubernetes Manifests

Extract from all Kubernetes manifests:
- Readiness probes, liveness probes, startup probes
- Resource requests and limits
- PodDisruptionBudgets
- Topology spread constraints
- Graceful shutdown configuration (preStop hooks, terminationGracePeriodSeconds)

### Step 2: Read Application Configuration

Analyze application configs for:
- Connection pool sizes (database, HTTP clients, Redis)
- Timeout values (connect, read, write, idle)
- Retry policies (max retries, backoff strategy, jitter)
- Circuit breaker thresholds

### Step 3: Read Infrastructure Configs

Analyze Terraform/infrastructure configs for:
- Multi-AZ deployment
- Load balancer health checks
- Auto-scaling policies
- Backup schedules
- Encryption at rest and in transit

### Step 4: Generate Production Readiness Checklist

Write `production-readiness/checklist.md` using this structure:

```markdown
# Production Readiness Checklist

## Service: <service-name>
Review Date: <date>
Reviewer: SRE Skill (automated)

### Health Checks
- [ ] Readiness probe configured with appropriate path and thresholds
- [ ] Liveness probe configured (distinct from readiness)
- [ ] Startup probe configured for slow-starting services
- [ ] Health check endpoints verify downstream dependencies
- [ ] Health checks do NOT perform expensive operations

### Graceful Shutdown
- [ ] preStop hook configured with sleep or drain logic
- [ ] terminationGracePeriodSeconds > preStop + drain time
- [ ] Application handles SIGTERM and drains in-flight requests
- [ ] Long-running connections (WebSocket, gRPC streams) are drained

### Connection Management
- [ ] Database connection pool sized correctly (not default)
- [ ] HTTP client connection pools configured with limits
- [ ] Idle connection timeout set to prevent stale connections
- [ ] Connection pool metrics exposed

### Timeout Tuning
- [ ] Upstream timeout > downstream timeout (no orphaned requests)
- [ ] Connect timeout distinct from read timeout
- [ ] Global request timeout configured at ingress/gateway
- [ ] Timeout values documented and justified

### Retry Configuration
- [ ] Retries configured with exponential backoff
- [ ] Jitter applied to prevent thundering herd
- [ ] Retry budget capped (e.g., max 10% additional load)
- [ ] Non-idempotent operations are NOT retried
- [ ] Circuit breaker wraps retry logic

### Resource Limits
- [ ] CPU request and limit set (limit >= 2x request for bursty services)
- [ ] Memory request and limit set (limit == request for predictable OOM behavior)
- [ ] Ephemeral storage limits set
- [ ] PodDisruptionBudget configured (minAvailable or maxUnavailable)

### Data Safety
- [ ] Backup schedule configured and verified
- [ ] Point-in-time recovery tested
- [ ] Data encryption at rest enabled
- [ ] Data encryption in transit enforced (mTLS or TLS)

### Dependency Resilience
- [ ] All external dependencies have circuit breakers
- [ ] Fallback behavior defined for each dependency failure
- [ ] Dependency health is NOT part of liveness probe
- [ ] Timeout on every outbound call
```

### Step 5: Generate Findings

Write `production-readiness/findings.md` documenting every checklist item that fails, with:
- Severity (Critical / High / Medium / Low)
- Specific evidence from the configs
- Which service is affected
- What the current value is vs. what it should be

### Step 6: Generate Remediation Plan

Write `production-readiness/remediation.md` with concrete fix instructions for every finding:
- Exact config changes
- Code snippets
- Kubernetes manifest patches
- Prioritized by severity

## Validation

Before proceeding to Phase 2, verify:
- [ ] Every service in the architecture has been reviewed
- [ ] Every checklist section has been evaluated (no blanks)
- [ ] All Critical findings have remediation instructions
- [ ] Findings are linked to specific files and line numbers where possible

## Quality Bar

A production readiness review is NOT complete if it just says "looks good." Every checklist item must have a concrete pass/fail with evidence. Vague assessments ("timeout seems reasonable") are not acceptable — state the actual value and whether it meets the criterion.
