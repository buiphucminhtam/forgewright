# Phase 5: Capacity Planning

## Objective

Model current and future load, validate auto-scaling, project costs, and identify bottlenecks before they hit production. Size for peaks, not averages.

## Context Bridge

- Read Phase 1 findings for resource limit issues
- Read Phase 2 SLOs for performance baselines
- Read Phase 3 chaos results for scaling behavior under stress
- Read architecture docs for request fan-out ratios and data growth patterns

## Inputs

- `infrastructure/monitoring/` — current traffic metrics, resource utilization
- `infrastructure/kubernetes/` — HPA configs, resource limits
- `infrastructure/terraform/` — infrastructure sizing, instance types
- Architecture docs — request fan-out ratios, data growth patterns
- Business requirements — growth projections, seasonal patterns

## Workflow

### Step 1: Generate Load Model

Write `capacity/load-model.md`:

```markdown
# Load Model

## Current Baseline
| Metric | Value | Source |
|--------|-------|--------|
| Peak RPS (requests/sec) | <measured> | Prometheus: rate(http_requests_total[5m]) |
| Average RPS | <measured> | Prometheus: rate(http_requests_total[1h]) |
| P99 latency at peak | <measured> | Prometheus: histogram_quantile(0.99, ...) |
| Daily active users | <measured> | Analytics |
| Database QPS | <measured> | Database metrics |
| Message queue throughput | <measured> | Queue metrics |

## Request Fan-Out
For each user-facing request, the internal amplification:
| User Action | Internal Requests | Database Queries | Cache Operations | Queue Messages |
|-------------|-------------------|------------------|------------------|----------------|
| Page load | 5 API calls | 12 queries | 8 reads | 0 |
| Submit order | 3 API calls | 8 queries, 3 writes | 2 reads, 4 invalidations | 3 messages |
| Search | 2 API calls | 1 query (Elasticsearch) | 1 read | 0 |

## Growth Projections
| Scale | RPS | DB QPS | Storage Growth/mo | Est. Monthly Cost |
|-------|-----|--------|-------------------|-------------------|
| Current (1x) | <val> | <val> | <val> | <val> |
| 10x | <val> | <val> | <val> | <val> |
| 100x | <val> | <val> | <val> | <val> |

## Seasonal Patterns
- <Document known traffic patterns: day-of-week, time-of-day, holidays, marketing events>
```

### Step 2: Generate Scaling Configurations

Write `capacity/scaling-configs.yaml` with validated HPA/VPA/KEDA configurations:

```yaml
# Horizontal Pod Autoscaler — validated against load model
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3          # Never go below 3 for redundancy
  maxReplicas: 50         # Ceiling based on cost projection
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60    # Respond quickly to load spikes
      policies:
        - type: Percent
          value: 100      # Double pods if needed
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300   # Cool down slowly to avoid flapping
      policies:
        - type: Percent
          value: 25       # Scale down 25% at a time
          periodSeconds: 120
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65  # Scale before saturation
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"    # Based on load test: 1200 RPS causes p99 degradation
```

### Step 3: Generate Cost Projection

Write `capacity/cost-projection.md` with compute, storage, network, and managed-service costs at 1x, 10x, and 100x scale. Include recommendations for cost optimization (reserved instances, spot instances, right-sizing).

### Step 4: Generate Bottleneck Analysis

Write `capacity/bottleneck-analysis.md` identifying the first component that will fail at each scale tier:

```markdown
# Bottleneck Analysis

## Methodology
Bottlenecks identified through: load testing results, resource utilization trends,
theoretical throughput limits, and architectural analysis.

## Bottleneck Ranking (First to Saturate)

### 1. Database Connection Pool
- **Current utilization:** 60% of max connections
- **Saturates at:** ~1.7x current load
- **Symptom:** Connection timeout errors, request queuing
- **Mitigation:** Connection pooler (PgBouncer), read replicas, query optimization
- **Cost to fix:** Low (configuration change)

### 2. Single Redis Instance
- **Current utilization:** 40% CPU, 70% memory
- **Saturates at:** ~3x current load
- **Symptom:** Cache latency increase, evictions spike
- **Mitigation:** Redis Cluster, key-space partitioning
- **Cost to fix:** Medium (architecture change)

### 3. Message Queue Consumer Throughput
- **Current utilization:** 200 msg/s of 500 msg/s capacity
- **Saturates at:** ~2.5x current load
- **Symptom:** Consumer lag grows, processing delays
- **Mitigation:** Add consumer instances, partition optimization
- **Cost to fix:** Low (scaling change)
```

## Validation

Before marking SRE skill as complete, verify:
- [ ] Load model covers 1x, 10x, and 100x projections
- [ ] Request fan-out ratios documented for key user actions
- [ ] Bottleneck analysis identifies the first 3 components to saturate
- [ ] HPA/VPA configs validated against load model
- [ ] Cost projections include compute, storage, network, and managed services
- [ ] Seasonal patterns documented
- [ ] Scaling behavior aligns with Phase 3 chaos engineering findings

## Quality Bar

Capacity planning based on averages will fail. Model peak load (p99 of daily traffic), seasonal spikes, and known events. Size for peaks, not averages. Cost projections must include not just compute but also data transfer, managed services, and storage growth.
