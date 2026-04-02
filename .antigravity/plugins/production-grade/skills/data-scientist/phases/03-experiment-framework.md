# Phase 3: Experiment Framework

## Objective

Build a rigorous A/B testing and experimentation infrastructure — feature flag integration, experiment tracking (MLflow/W&B), statistical significance testing, metrics collection, and experiment lifecycle management.

## Context Bridge

Read Phase 2 optimization results from `llm-optimization/` for features needing A/B validation. Read Phase 1 audit from `analysis/system-audit.md` for baseline metrics.

## Workflow

### Step 1: Experiment Tracking Setup

Select and configure a tracking platform:

| Platform | Best For | Key Features |
|----------|----------|--------------|
| **MLflow** | Self-hosted, open-source | Experiment logging, model registry, artifacts |
| **Weights & Biases** | ML-heavy teams | Hyperparameter sweeps, collaborative dashboards |
| **LaunchDarkly + custom** | Feature flag-first | Targeting, gradual rollout, kill switch |
| **In-house** | LLM apps with custom metrics | Full control, prompt versioning |

Produce `experiments/framework/tracking-config.md` with platform choice, metadata schema, and integration points.

### Step 2: Feature Flag Integration

Design deterministic experiment assignment via feature flags:

- Hash-based user assignment for consistency across sessions
- Traffic percentage controls for gradual rollout
- Allowlist/blocklist targeting for internal testing
- Kill switch for immediate experiment termination

Produce `experiments/framework/flag-integration.md` with assignment logic and integration guide.

### Step 3: Statistical Significance Testing

Define methodology for evaluating experiments:

- **Sample size calculator:** Required n per variant based on MDE, baseline rate, power (0.8), alpha (0.05)
- **Sequential testing:** Alpha-spending functions (O'Brien-Fleming) for safe peeking
- **Multiple comparison correction:** Bonferroni or Benjamini-Hochberg for multi-metric tests
- **Bayesian alternative:** Posterior probability for low-traffic features

Produce `experiments/framework/significance-calculator.py` with z-test, t-test, proportion test, and correction utilities.

### Step 4: Metrics Collection

Design three metric tiers for every experiment:

- **Primary:** The metric the experiment targets (e.g., quality score, conversion rate)
- **Guardrail:** Metrics that must NOT regress (e.g., error rate, p95 latency) with auto-rollback thresholds
- **Diagnostic:** Debugging metrics (e.g., token count, cache hit rate)

Produce `experiments/framework/metrics-schema.md` with event schema for experiment exposure, LLM request/response, and user feedback events.

### Step 5: Experiment Lifecycle Management

Define lifecycle stages and registry:

```
Draft -> Review -> Running -> Analysis -> Concluded (Ship / No-Ship / Iterate)
```

Registry fields: Experiment ID, Hypothesis ("If [change], then [metric] will [direction] by [MDE]"), primary metric, guardrail metrics with rollback thresholds, required sample size (from power analysis), start/end dates, status, and decision with rationale.

Auto-rollback: if any guardrail metric breaches its threshold, experiment pauses and alerts the team.

Produce `experiments/experiment-registry.md`.

## Output Files

- `experiments/framework/tracking-config.md`
- `experiments/framework/flag-integration.md`
- `experiments/framework/metrics-schema.md`
- `experiments/framework/significance-calculator.py`
- `experiments/experiment-registry.md`

## Validation

Before proceeding to Phase 4, verify:
- [ ] Experiment tracking platform selected and configured
- [ ] Feature flag integration supports deterministic user assignment
- [ ] Statistical methodology documented (sample size, significance, multiple comparisons)
- [ ] Metrics schema includes primary, guardrail, and diagnostic metrics
- [ ] Experiment registry includes hypothesis, power analysis, and decision log
- [ ] Auto-rollback triggers defined for guardrail metrics

> **GATE: Present experiment framework design. Wait for user approval before proceeding.**

## Quality Bar

Every experiment must have a null hypothesis, power analysis, and guardrail metrics with auto-rollback. "We ran the experiment for a week" is not acceptable — "We ran for 14 days, collecting 12,400 samples per variant (required: 11,200 at 80% power, 5% MDE)" is acceptable.
