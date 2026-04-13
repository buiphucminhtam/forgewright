# GROW Phase — Dispatcher

>This phase manages post-launch growth optimization. Activated after SHIP phase completes or when user explicitly requests growth/marketing work.

## Pre-Flight

Read `.production-grade.yaml` for:
- `features.growth` → if false, skip GROW phase (default: true)
- `features.marketing` → if false, skip Growth Marketer (default: true)
- `features.conversion` → if false, skip Conversion Optimizer (default: true)

## Activation

GROW phase activates when:
1. SHIP phase completed and `features.grow: true`
2. User explicitly says: "growth", "marketing", "SEO", "CRO", "conversion", "A/B test"
3. Orchestrator classifies request into **Marketing** or **Grow** mode

## T5: Growth Marketer — Go-to-Market Strategy

```
Update task.md: T5 status → in_progress

Read skills/growth-marketer/SKILL.md and follow its instructions.
Context:
- Read shipped product context from: .forgewright/ship/handoff/
- Read BRD from: .forgewright/product-manager/BRD/
- Write outputs to: .forgewright/growth-marketer/

Outputs: go-to-market.md, content-plan.md, seo-audit.md, analytics-setup.md
```

## T5b: Conversion Optimizer — A/B Testing & CRO

```
Update task.md: T5b status → in_progress

Read skills/conversion-optimizer/SKILL.md and follow its instructions.
Context:
- Read analytics data from: .forgewright/growth-marketer/analytics-setup.md
- Read product context from: .forgewright/ship/handoff/

Outputs: ab-test-plan.md, conversion-analysis.md, optimization-roadmap.md
```

## Completion

```
Update task.md: T5 status → completed
Update task.md: T5b status → completed

Memory save:
python3 scripts/mem0-cli.py add "GROW phase completed for [project]. Growth strategy: [summary], Conversion optimizations: [list]" --category decisions
```

## Growth Pipeline Modes

| Mode | Skills | Output |
|------|--------|--------|
| Marketing | Growth Marketer | Go-to-market, content, SEO |
| Grow | Growth Marketer + Conversion Optimizer | Full growth strategy |
| CRO only | Conversion Optimizer | A/B tests, conversion analysis |
