# Plan Quality Scoring Test Cases
# Tests for 8-criteria scoring rubric

## Completeness Criterion

```yaml
test_id: plan-001
criterion: Completeness
description: "Plan covers all required elements"
weight: 1.0
test_cases:
  - name: "Full coverage"
    input: "Plan with all 8 sections present"
    expected_score: 1.0
  - name: "Missing 1 section"
    input: "Plan missing 1 of 8 required sections"
    expected_score: 0.875
  - name: "Missing 2 sections"
    input: "Plan missing 2 of 8 required sections"
    expected_score: 0.75
```

## Specificity Criterion

```yaml
test_id: plan-002
criterion: Specificity
description: "Plan has concrete, actionable steps"
weight: 1.0
test_cases:
  - name: "Highly specific"
    input: "Each step has file paths, function names, expected outputs"
    expected_score: 1.0
  - name: "Some specificity"
    input: "Most steps are concrete, some are vague"
    expected_score: 0.75
  - name: "Vague throughout"
    input: "Steps are generic descriptions without specifics"
    expected_score: 0.5
```

## Feasibility Criterion

```yaml
test_id: plan-003
criterion: Feasibility
description: "Plan can realistically be executed"
weight: 1.0
test_cases:
  - name: "Fully feasible"
    input: "All steps are achievable with available tools/time"
    expected_score: 1.0
  - name: "Mostly feasible"
    input: "1-2 steps may need adjustment"
    expected_score: 0.75
  - name: "Infeasible"
    input: "Steps require unavailable resources or impossible timelines"
    expected_score: 0.25
```

## Risk Awareness Criterion

```yaml
test_id: plan-004
criterion: RiskAwareness
description: "Plan identifies and mitigates risks"
weight: 1.0
test_cases:
  - name: "Comprehensive risks"
    input: "Identifies 3+ risks with mitigation strategies"
    expected_score: 1.0
  - name: "Some risks"
    input: "Identifies 1-2 risks"
    expected_score: 0.625
  - name: "No risks"
    input: "No risk identification"
    expected_score: 0.0
```

## Scope Control Criterion

```yaml
test_id: plan-005
criterion: ScopeControl
description: "Plan maintains clear scope boundaries"
weight: 1.0
test_cases:
  - name: "Clear boundaries"
    input: "Explicit in-scope and out-of-scope sections"
    expected_score: 1.0
  - name: "Implicit scope"
    input: "Scope implied but not explicitly stated"
    expected_score: 0.75
  - name: "Scope creep"
    input: "Multiple features or unclear boundaries"
    expected_score: 0.5
```

## Dependency Ordering Criterion

```yaml
test_id: plan-006
criterion: DependencyOrdering
description: "Tasks are in correct dependency order"
weight: 1.0
test_cases:
  - name: "Perfect order"
    input: "All tasks follow logical dependency chain"
    expected_score: 1.125
  - name: "Minor reordering"
    input: "1-2 tasks could be reordered for efficiency"
    expected_score: 1.0
  - name: "Wrong order"
    input: "Dependent tasks come before their prerequisites"
    expected_score: 0.5
```

## Testability Criterion

```yaml
test_id: plan-007
criterion: Testability
description: "Plan can be verified with concrete criteria"
weight: 1.0
test_cases:
  - name: "Fully testable"
    input: "Each task has pass/fail criteria"
    expected_score: 1.0
  - name: "Partially testable"
    input: "Some tasks have verification criteria"
    expected_score: 0.625
  - name: "Untestable"
    input: "No verification criteria defined"
    expected_score: 0.0
```

## Impact Assessment Criterion

```yaml
test_id: plan-008
criterion: ImpactAssessment
description: "Plan considers downstream effects"
weight: 1.0
test_cases:
  - name: "Full analysis"
    input: "Identifies affected files, systems, and mitigation"
    expected_score: 1.0
  - name: "Partial analysis"
    input: "Mentions some affected areas"
    expected_score: 0.625
  - name: "No analysis"
    input: "No downstream impact considered"
    expected_score: 0.0
```

## Evidence Verification Criterion

```yaml
test_id: plan-evidence
criterion: EvidenceVerification
description: "Plan lists assumptions and details how they will be verified (Evidence-First)"
weight: 1.0
test_cases:
  - name: "Comprehensive verification"
    input: "Lists all key assumptions with exact files to read or commands to verify"
    expected_score: 1.0
  - name: "Partial verification"
    input: "Lists assumptions but lacks concrete verification steps"
    expected_score: 0.625
  - name: "No verification plan"
    input: "No assumptions declared, guessing proposed"
    expected_score: 0.0
```

## Overall Scoring Tests

```yaml
test_id: plan-009
description: "Perfect plan scores 9.0+"
input:
  completeness: 1.0
  specificity: 1.0
  feasibility: 1.0
  risk_awareness: 1.0
  scope_control: 1.0
  dependency_ordering: 1.125
  testability: 1.0
  impact_assessment: 1.0
  evidence_verification: 1.0
expected_total: 9.125
pass_threshold: 9.0
notes: "Bonus points from Dependency Ordering can push total above 9.0"

---
test_id: plan-010
description: "Average plan scores around 6.0-7.0"
input:
  completeness: 0.875
  specificity: 0.75
  feasibility: 0.875
  risk_awareness: 0.5
  scope_control: 0.75
  dependency_ordering: 1.0
  testability: 0.625
  impact_assessment: 0.5
  evidence_verification: 0.625
expected_total: 6.5
pass_threshold: 9.0
notes: "This plan would fail the quality gate"

---
test_id: plan-011
description: "Plan just passes threshold at 9.0"
input:
  completeness: 1.0
  specificity: 1.0
  feasibility: 1.0
  risk_awareness: 1.0
  scope_control: 1.0
  dependency_ordering: 1.125
  testability: 1.0
  impact_assessment: 1.0
  evidence_verification: 0.875
expected_total: 9.0
pass_threshold: 9.0
notes: "High evidence verification score required to hit threshold"
```
