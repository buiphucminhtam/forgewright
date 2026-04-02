# Phase 2: SLO Refinement

## Objective

Transform DevOps monitoring into business-aligned SLOs with actionable error budgets. SRE is the SOLE AUTHORITY on SLO definitions — DevOps implements the thresholds SRE defines, but does not set them.

## Context Bridge

Read Phase 1 findings from `production-readiness/findings.md` to understand known reliability risks before defining SLO targets.

## Inputs

- `infrastructure/monitoring/` — existing Prometheus rules, Grafana dashboards
- `.forgewright/product-manager/` or requirements — availability promises, user expectations
- Architecture docs — request flow, critical paths, dependency chains
- Phase 1 findings — known reliability risks

## Workflow

### Step 1: Identify SLIs

For each service, identify SLIs using these categories:

- **Availability:** proportion of successful requests (HTTP 5xx exclusion, gRPC status codes)
- **Latency:** proportion of requests faster than threshold (p50, p95, p99)
- **Throughput:** requests per second within acceptable range
- **Correctness:** proportion of responses returning correct data (for data pipelines)
- **Freshness:** proportion of data updated within acceptable staleness window

### Step 2: Generate SLI Definitions

Write `slo/sli-definitions.yaml` with this structure:

```yaml
slis:
  - name: api-availability
    service: api-gateway
    type: availability
    description: Proportion of HTTP requests that do not return 5xx
    good_event: http_requests_total{status!~"5.."}
    valid_event: http_requests_total
    measurement_window: 28d

  - name: api-latency-p99
    service: api-gateway
    type: latency
    description: Proportion of HTTP requests served within 500ms
    good_event: http_request_duration_seconds_bucket{le="0.5"}
    valid_event: http_request_duration_seconds_count
    threshold: 500ms
    measurement_window: 28d

slos:
  - name: api-availability-slo
    sli: api-availability
    target: 99.9
    window: 28d
    consequences: |
      If error budget exhausted: freeze deployments,
      redirect engineering effort to reliability work.

  - name: api-latency-slo
    sli: api-latency-p99
    target: 99.0
    window: 28d
    consequences: |
      If error budget below 25%: require performance review
      for all new features before deployment.
```

### Step 3: Generate Error Budget Policy

Write `slo/error-budget-policy.md` defining:
- Error budget calculation method (1 - SLO target = budget)
- Budget consumption thresholds and corresponding actions
- Who has authority to freeze deployments
- How budget resets (rolling window vs. calendar)
- Exception process for emergency deployments during budget freeze

### Step 4: Generate Burn-Rate Alerts

Write `slo/burn-rate-alerts.yaml` using multi-window, multi-burn-rate alerting (Google SRE workbook method):

```yaml
groups:
  - name: slo-burn-rate
    rules:
      # Fast burn — 2% budget consumed in 1 hour (page)
      - alert: SLOHighBurnRate_Critical
        expr: |
          (
            sum(rate(http_requests_total{status=~"5.."}[1h]))
            / sum(rate(http_requests_total[1h]))
          ) > (14.4 * (1 - 0.999))
          AND
          (
            sum(rate(http_requests_total{status=~"5.."}[5m]))
            / sum(rate(http_requests_total[5m]))
          ) > (14.4 * (1 - 0.999))
        for: 2m
        labels:
          severity: critical
          slo: api-availability
        annotations:
          summary: "High SLO burn rate — 2% error budget consumed in 1h"
          runbook: "../runbooks/api/high-error-rate.md"

      # Slow burn — 5% budget consumed in 6 hours (ticket)
      - alert: SLOHighBurnRate_Warning
        expr: |
          (
            sum(rate(http_requests_total{status=~"5.."}[6h]))
            / sum(rate(http_requests_total[6h]))
          ) > (6 * (1 - 0.999))
          AND
          (
            sum(rate(http_requests_total{status=~"5.."}[30m]))
            / sum(rate(http_requests_total[30m]))
          ) > (6 * (1 - 0.999))
        for: 5m
        labels:
          severity: warning
          slo: api-availability
        annotations:
          summary: "Elevated SLO burn rate — 5% error budget consumed in 6h"
          runbook: "../runbooks/api/high-error-rate.md"
```

### Step 5: Generate SLO Dashboard

Write `slo/slo-dashboard.json` as a Grafana dashboard JSON containing:
- SLO status panel (current attainment vs. target)
- Error budget remaining (percentage and time-based)
- Burn rate over time
- Budget consumption trend (projected exhaustion date)
- Per-service SLI breakdown

## Validation

Before proceeding to Phase 3, verify:
- [ ] Every user-facing endpoint has at least one SLO (availability + latency)
- [ ] SLO targets are realistic (not 99.99% for every service)
- [ ] Error budget policy specifies concrete enforcement actions
- [ ] Burn-rate alerts use multi-window approach (not just threshold-based)
- [ ] Dashboard includes budget projection (exhaustion date)

## Quality Bar

SLOs must be based on user-observable impact, not internal metrics. Internal services get lower targets than user-facing services. Every SLO must have a documented consequence for budget exhaustion — SLOs without enforcement are aspirational fiction.
