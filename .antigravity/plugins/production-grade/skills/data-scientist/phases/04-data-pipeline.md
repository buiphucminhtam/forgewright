# Phase 4: Data Pipeline Architecture

## Objective

Design and implement the data pipeline layer — ETL/ELT architecture, data warehouse/lake design, real-time vs batch processing, data quality monitoring, event streaming, and analytics dashboards. Produce deployable schemas, pipeline definitions, and monitoring configs.

## Context Bridge

Read Phase 1 audit from `analysis/system-audit.md` for data flow maps and analytics gaps. Read Phase 3 metrics schema from `experiments/framework/metrics-schema.md` for events the pipeline must ingest.

## Workflow

### Step 1: Event Schema Design

Define the canonical event schema with base fields (event_id, event_name, timestamp, source, user_id, session_id, properties, context) and domain-specific extensions. Every event must include validation rules: non-null checks on required fields, enum constraints, and range validation.

Produce `data-pipeline/event-schema/` with base event YAML and domain event definitions.

### Step 2: Pipeline Architecture Selection

Evaluate architecture patterns against system needs:

| Pattern | Best For | Stack Options | Latency |
|---------|----------|---------------|---------|
| **Batch ETL** | Daily/hourly analytics, cost reports | Airflow + dbt + warehouse | Hours |
| **Micro-batch** | Near-real-time dashboards | Spark Streaming, Flink | Minutes |
| **Event Streaming** | Real-time features, live dashboards | Kafka/Redpanda + consumers | Seconds |
| **ELT (recommended)** | Warehouse-first, flexible transforms | Fivetran/Airbyte + dbt | Hours |

Produce `data-pipeline/architecture.md` with chosen pattern, data flow diagram (source -> ingestion -> transformation -> storage -> serving), tech stack per layer, and SLAs per pipeline (freshness, completeness).

### Step 3: Data Warehouse/Lake Design

Design three-layer storage: **raw** (immutable event log), **staging** (cleaned, validated, deduplicated), **marts** (business-ready aggregations). Include LLM usage daily mart (date, feature, model, calls, tokens, cost, latency percentiles, error rate, cache hit rate) and experiment metrics daily mart.

Produce `data-pipeline/warehouse/` with schema SQL, dbt models, and data dictionary.

### Step 4: Data Quality Monitoring

Implement quality checks at every pipeline stage with three severity levels:

- **Critical (pipeline halts):** Non-null on required fields, primary key uniqueness, data freshness within SLA
- **Warning (alert, continue):** Value range validation, row count within expected bounds
- **Info (log only):** Distribution shift detection, schema evolution tracking

Produce `data-pipeline/quality/` with check definitions, alerting thresholds, and quality dashboard spec.

### Step 5: Analytics Dashboards

Design dashboards per stakeholder group:

| Dashboard | Audience | Key Metrics | Refresh |
|-----------|----------|-------------|---------|
| **LLM Operations** | Engineering | Token usage, cost/call, latency p50/p95/p99, error rate, cache hits | Real-time |
| **Experiment Monitor** | Data Science | Variant metrics, sample size progress, significance status | Hourly |
| **Cost Overview** | Leadership | Monthly spend, cost per feature, budget burn rate | Daily |
| **Data Quality** | Platform | Freshness SLA, null rates, schema violations, pipeline failures | Real-time |

Produce `data-pipeline/dashboards/` with dashboard specs (Grafana JSON, Superset configs, or Metabase queries).

### Step 6: Event Streaming (if applicable)

For real-time requirements: Kafka/Redpanda topic design (partitioning, retention, schema registry), consumer group architecture (delivery semantics), dead letter queues, backpressure handling, and consumer lag monitoring.

Produce `data-pipeline/streaming/` with topic schemas and consumer configurations.

## Output Files

- `data-pipeline/architecture.md`
- `data-pipeline/event-schema/` (base + domain events)
- `data-pipeline/warehouse/` (schema SQL, dbt models, data dictionary)
- `data-pipeline/etl/` (pipeline definitions, transformation logic)
- `data-pipeline/quality/` (check definitions, alerting config)
- `data-pipeline/dashboards/` (dashboard specs per audience)
- `data-pipeline/streaming/` (topic schemas, consumer configs — if applicable)

## Validation

Before proceeding to Phase 5, verify:
- [ ] Event schema covers all analytics and experiment events with validation rules
- [ ] Pipeline architecture documented with data flow diagram and SLAs
- [ ] Warehouse schema includes raw, staging, and marts layers
- [ ] Data quality checks at every pipeline stage (non-null, freshness, uniqueness, range, volume)
- [ ] Dashboard specs cover all key stakeholder groups
- [ ] All SQL compatible with target warehouse (confirmed with user)
- [ ] Pipeline error handling includes dead letter queues and alerting

> **GATE: Present data pipeline architecture. Wait for user approval before proceeding.**

## Quality Bar

Every pipeline must have SLAs for freshness and completeness. "The data is updated regularly" is not acceptable — "The LLM usage mart refreshes every 2 hours with a freshness SLA of 3 hours, completeness target of 99.5%, and an automated alert if any quality check fails" is acceptable.
