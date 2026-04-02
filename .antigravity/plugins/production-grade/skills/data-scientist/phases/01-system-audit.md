# Phase 1: System Analysis & Audit

## Objective

Understand what kind of AI/ML/LLM the system uses. Produce a rigorous audit of current usage with quantified optimization opportunities and cost analysis.

## Workflow

### Step 0: Orientation & Scope Discovery

Detect the tech stack by scanning for:

- **LLM API calls:** `openai`, `anthropic`, `google.generativeai`, `cohere`, `langchain`, `llamaindex`, `litellm`
- **ML frameworks:** `scikit-learn`, `torch`, `tensorflow`, `xgboost`, `transformers`, `huggingface`
- **Data tools:** `pandas`, `polars`, `dbt`, `airflow`, `prefect`, `dagster`, `spark`
- **Analytics:** `posthog`, `amplitude`, `mixpanel`, `segment`, `snowplow`
- **Vector DBs:** `pinecone`, `weaviate`, `chromadb`, `qdrant`, `milvus`, `pgvector`
- **Feature stores:** `feast`, `tecton`, `hopsworks`
- **Experiment tracking:** `mlflow`, `wandb`, `neptune`, `comet`

Classify the system:
- **LLM-Powered App** — Primary value comes from LLM API calls (chatbots, copilots, content generation)
- **ML-Enhanced Product** — Uses trained ML models for recommendations, search, classification
- **Data-Intensive Platform** — Heavy analytics, reporting, data pipelines
- **Hybrid** — Combination of the above

Scope the engagement based on classification:
- LLM-Powered App -> Phases 1, 2, 3, 6 are primary
- ML-Enhanced Product -> Phases 1, 3, 5, 6 are primary
- Data-Intensive Platform -> Phases 1, 3, 4, 6 are primary
- Hybrid -> All phases

Present findings to user:

```
## System Classification

**Type:** [LLM-Powered App / ML-Enhanced / Data-Intensive / Hybrid]

**AI/ML Components Found:**
- [Component 1]: [description, location in codebase]
- [Component 2]: [description, location in codebase]

**Recommended Phases:** [list]
**Estimated Complexity:** [Low / Medium / High]

Proceed with Phase 1 (System Analysis)? [Y/N]
```

> **GATE: Wait for user approval before proceeding.**

### Step 1: LLM Usage Audit (if applicable)

- Map every LLM API call in the codebase: endpoint, model, temperature, max_tokens, system prompt
- Calculate token usage patterns: average input tokens, output tokens, cost per call
- Identify redundant calls, missing caches, suboptimal model selection
- Map prompt chains and dependencies
- Check for: prompt injection vulnerabilities, missing error handling, no fallback models, hardcoded API keys

### Step 2: ML Model Audit (if applicable)

- Inventory all models: type, framework, serving method, update frequency
- Check for: model drift monitoring, A/B testing, shadow deployment capability
- Evaluate feature engineering pipeline: freshness, coverage, consistency
- Assess inference latency and throughput

### Step 3: Data Flow Audit

- Map all data sources, transformations, and sinks
- Identify analytics gaps: what should be measured but is not
- Check data quality: validation, schema enforcement, null handling
- Evaluate event tracking completeness

### Step 4: Cost Analysis

- Calculate current monthly AI/ML spend (API calls, compute, storage)
- Project costs at 2x, 5x, 10x scale
- Identify cost hotspots and optimization ROI

## Output Files

- `analysis/system-audit.md`
- `analysis/optimization-opportunities.md`
- `analysis/cost-model.md`

### system-audit.md Template

```markdown
# System Audit — AI/ML/LLM Analysis

**Date:** YYYY-MM-DD
**System:** [project name]
**Auditor:** Data Scientist Skill v1.0.0

## Executive Summary
[2-3 sentences on overall findings]

## LLM API Usage Map

| Endpoint | Model | Avg Input Tokens | Avg Output Tokens | Calls/Day | Cost/Day | Location |
|----------|-------|------------------|-------------------|-----------|----------|----------|
| [path]   | gpt-4 | 1,200            | 450               | 5,000     | $X.XX    | src/...  |

## Prompt Analysis

### [Feature Name]
- **System Prompt:** [token count] tokens — [assessment: verbose/optimal/insufficient]
- **User Prompt Template:** [token count] tokens
- **Issues Found:** [list]
- **Optimization Potential:** [X]% token reduction, [Y]% cost savings

## Data Flow Diagram
```text
[Source] -> [Transform] -> [LLM Call] -> [Post-process] -> [Storage]
                                      |
                                [Cache Layer]
```

## Cost Model

| Component | Current Monthly | At 5x Scale | At 10x Scale |
|-----------|----------------|-------------|--------------|
| LLM API   | $X,XXX         | $XX,XXX     | $XXX,XXX     |
| Compute   | $X,XXX         | $XX,XXX     | $XXX,XXX     |
| Storage   | $XXX           | $X,XXX      | $X,XXX       |

## Optimization Opportunities (Ranked by ROI)

| # | Opportunity | Effort | Impact | Est. Savings | Priority |
|---|------------|--------|--------|--------------|----------|
| 1 | [description] | [S/M/L] | [S/M/L] | $X,XXX/mo | P0 |
```

### optimization-opportunities.md Template

```markdown
# Optimization Opportunities

## Opportunity 1: [Title]

**Category:** [Token Optimization / Caching / Model Selection / Pipeline / etc.]
**Effort:** [S/M/L] — [estimated hours/days]
**Impact:** [quantified: X% cost reduction, Y ms latency improvement, etc.]
**Confidence:** [High/Medium/Low] — [basis for confidence]

### Current State
[Description with code references]

### Proposed Change
[Specific technical proposal]

### Implementation Plan
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Success Metrics
- [Metric 1]: [current value] -> [target value]
- [Metric 2]: [current value] -> [target value]

### Risks
- [Risk 1]: [mitigation]
```

## Validation

Before proceeding to Phase 2, verify:
- [ ] All AI/ML/LLM API calls in the codebase are mapped
- [ ] Token usage patterns are quantified (not estimated)
- [ ] Cost analysis includes current and projected costs
- [ ] Optimization opportunities are ranked by ROI
- [ ] System classification determines which subsequent phases to execute

> **GATE: Present audit findings. Wait for user to select optimization priorities before proceeding.**

## Quality Bar

Every claim must be backed by evidence from the codebase. "The prompt seems verbose" is not acceptable — "The system prompt is 1,200 tokens, 40% of which is redundant preamble that can be compressed to 680 tokens" is acceptable.
