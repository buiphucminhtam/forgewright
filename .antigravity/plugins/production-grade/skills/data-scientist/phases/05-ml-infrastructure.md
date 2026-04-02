# Phase 5: ML Infrastructure

## Objective

Design production ML infrastructure — model serving (batch and real-time), model versioning and registry, monitoring (drift detection, performance degradation), retraining pipelines, GPU/compute optimization, and deployment patterns.

## Context Bridge

Read Phase 1 audit from `analysis/system-audit.md` for ML model inventory. Read Phase 4 pipeline from `data-pipeline/architecture.md` for data flow integration points.

## Workflow

### Step 1: Model Registry & Versioning

Design a registry tracking every model from training to production. Schema includes: model_id, version (semver), framework, task type, status (staging/canary/production/archived), artifact paths, lineage (training data version, parent model), and serving config (endpoint, latency SLA, throughput RPS).

Define promotion workflow: staging -> canary (5% traffic, 24h) -> production. Rollback: automatic revert if canary metrics degrade beyond thresholds.

Produce `ml-infrastructure/model-registry.md`.

### Step 2: Model Serving Architecture

Select serving pattern based on inference requirements:

| Pattern | Best For | Latency | Stack |
|---------|----------|---------|-------|
| **REST API** | Real-time, low-medium traffic | < 100ms | FastAPI + Triton / TorchServe |
| **gRPC** | High throughput, internal services | < 50ms | Triton / TF Serving |
| **Batch** | Offline scoring, recommendation refresh | Hours | Spark / Ray / Airflow |
| **Streaming** | Event-driven scoring | < 500ms | Kafka consumer + model |

Include shadow deployment pattern: run new model version alongside production, log prediction comparisons for offline analysis, shadow failures never affect primary responses.

Produce `ml-infrastructure/serving/` with architecture docs, deployment configs, and health checks.

### Step 3: Model Monitoring

Implement three monitoring dimensions:

**a. Data drift detection:** Input feature distribution shifts via PSI (Population Stability Index) and KS test. PSI thresholds: < 0.1 stable, 0.1-0.25 investigate, > 0.25 action required.

**b. Model performance:** Prediction quality metrics (accuracy, precision, recall, RMSE), latency p50/p95/p99, throughput, error rates, confidence score distribution shifts.

**c. Operational health:** Memory/CPU per model instance, queue depth, cold start latency.

Produce `ml-infrastructure/monitoring/` with drift detection configs, alerting rules, and dashboards.

### Step 4: Retraining Pipelines

Design automated retraining with safeguards:

- **Triggers:** Scheduled (weekly/monthly), drift-triggered (PSI > threshold), performance-triggered (metric below SLO)
- **Pipeline:** Data validation -> Feature engineering -> Training -> Evaluation -> Registry upload
- **Promotion gates:** Automated eval on holdout set, shadow deployment comparison, canary rollout
- **Rollback:** Automatic revert if canary metrics degrade

Produce `ml-infrastructure/retraining/` with pipeline definitions, trigger configs, and promotion gates.

### Step 5: GPU/Compute Optimization

Evaluate optimization techniques:

| Technique | Impact | Complexity |
|-----------|--------|------------|
| **Model quantization** (INT8/FP16) | 2-4x speedup, 50-75% memory reduction | Medium |
| **Batched inference** | Higher throughput, lower per-request cost | Low |
| **Model distillation** | Smaller model, similar accuracy | High |
| **Spot instances** | 60-80% training cost reduction | Low |
| **Auto-scaling** | Match capacity to demand | Medium |
| **ONNX conversion** | Framework-agnostic optimized runtime | Medium |

Produce `ml-infrastructure/compute-optimization.md` with current vs optimized cost comparison.

## Output Files

- `ml-infrastructure/model-registry.md`
- `ml-infrastructure/serving/` (architecture, deployment configs, health checks)
- `ml-infrastructure/monitoring/` (drift detection, performance alerts, dashboards)
- `ml-infrastructure/feature-store/` (feature definitions — if applicable)
- `ml-infrastructure/retraining/` (pipeline definitions, triggers, promotion gates)
- `ml-infrastructure/compute-optimization.md`

## Validation

Before proceeding to Phase 6, verify:
- [ ] Model registry covers versioning, lineage, and promotion workflow
- [ ] Serving architecture matches latency and throughput requirements
- [ ] Shadow deployment pattern implemented for safe rollout
- [ ] Drift detection covers input features and prediction distributions
- [ ] Monitoring includes data drift, model performance, and operational health
- [ ] Retraining pipeline has automated triggers and promotion gates
- [ ] Compute optimization opportunities quantified with cost impact

> **GATE: Present ML infrastructure design. Wait for user approval before proceeding.**

## Quality Bar

Every model in production must have monitoring, drift detection, and a rollback procedure. "The model is deployed" is not acceptable — "Model rec-engine-v3.1.0 serves at p99 < 85ms, PSI monitored hourly with retraining at PSI > 0.25, canary validates on 5% traffic for 24h before full rollout" is acceptable.
