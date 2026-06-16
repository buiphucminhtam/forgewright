# Middleware Chain Test Cases
# Tests for 12-stage execution chain

## Stage 1: Memory Retrieval

```yaml
test_id: middleware-001
stage: 1
name: "Memory Retrieval"
description: "Load relevant memories from previous sessions"
max_latency: 500
test_cases:
  - name: "Memory hit"
    input: "Request with clear context keywords"
    expected: "Relevant memories loaded"
    latency_threshold: 200
  - name: "Memory miss"
    input: "Request with no prior context"
    expected: "Empty context, no error"
    latency_threshold: 100
  - name: "Partial hit"
    input: "Request with partial context match"
    expected: "Best-match memories loaded"
    latency_threshold: 300
```

## Stage 2: Intent Analysis

```yaml
test_id: middleware-002
stage: 2
name: "Intent Analysis"
description: "Extract 9 dimensions from user request"
max_latency: 200
test_cases:
  - name: "Clear intent"
    input: "\"build a SaaS for pet adoption\""
    expected:
      task: "Build SaaS"
      target_tool: "Full Build"
      output_format: "Application"
  - name: "Ambiguous intent"
    input: "\"help me\""
    expected:
      confidence: "low"
      clarification_needed: true
  - name: "Multiple intents"
    input: "\"build AND test the API\""
    expected:
      primary_intent: "Build"
      secondary_intent: "Test"
      clarification_needed: true
```

## Stage 3: Mode Classification

```yaml
test_id: middleware-003
stage: 3
name: "Mode Classification"
description: "Route request to appropriate execution mode"
max_latency: 100
test_cases:
  - name: "Exact match"
    input: "\"build a SaaS\""
    expected:
      mode: "Full Build"
      confidence: 0.95
  - name: "Fuzzy match"
    input: "\"make an app\""
    expected:
      mode: "Feature"
      confidence: 0.7
  - name: "No match"
    input: "\"help me think about this\""
    expected:
      mode: "Explore"
      confidence: 0.6
```

## Stage 4: Context Loading

```yaml
test_id: middleware-004
stage: 4
name: "Context Loading"
description: "Load project-specific context and conventions"
max_latency: 300
test_cases:
  - name: "Standard project"
    input: "Project with standard structure"
    expected:
      conventions_loaded: true
      patterns_detected: 3
  - name: "Brownfield project"
    input: "Legacy codebase with existing patterns"
    expected:
      conventions_loaded: true
      patterns_detected: 10
  - name: "Empty project"
    input: "New project with no context"
    expected:
      conventions_loaded: false
      patterns_detected: 0
```

## Stage 5: Plan Generation

```yaml
test_id: middleware-005
stage: 5
name: "Plan Generation"
description: "Generate implementation plan from request"
max_latency: 2000
test_cases:
  - name: "Simple plan"
    input: "\"add button to UI\""
    expected:
      steps: 3
      complexity: 2
  - name: "Complex plan"
    input: "\"build full-stack e-commerce\""
    expected:
      steps: 20+
      complexity: 8
  - name: "Plan with rollback"
    input: "\"refactor auth module\""
    expected:
      steps: 10+
      rollback_plan: true
```

## Stage 6: Plan Scoring

```yaml
test_id: middleware-006
stage: 6
name: "Plan Quality Scoring"
description: "Score plan against 9-criteria rubric"
max_latency: 500
test_cases:
  - name: "High-quality plan"
    input: "Plan with all 9 criteria met"
    expected:
      score: 9.0
      pass: true
  - name: "Low-quality plan"
    input: "Plan missing risk/testability"
    expected:
      score: 5.0
      pass: false
  - name: "Borderline plan"
    input: "Plan with score 8.5"
    expected:
      score: 8.5
      pass: false
      threshold: 9.0
```

## Stage 7: Skill Selection

```yaml
test_id: middleware-007
stage: 7
name: "Skill Selection"
description: "Select appropriate skill(s) for execution"
max_latency: 200
test_cases:
  - name: "Single skill"
    input: "\"review my code\""
    expected:
      skills: ["code-reviewer"]
  - name: "Multiple skills"
    input: "\"build and deploy to production\""
    expected:
      skills: ["software-engineer", "devops"]
  - name: "Skill chain"
    input: "\"design architecture for new service\""
    expected:
      skills: ["solution-architect"]
      sub_skills: ["api-designer", "database-engineer"]
```

## Stage 8: Skill Execution

```yaml
test_id: middleware-008
stage: 8
name: "Skill Execution"
description: "Execute selected skills with context"
max_latency: "variable"
test_cases:
  - name: "Simple execution"
    input: "\"add logging to function\""
    expected:
      files_modified: 1
      lines_added: 10
  - name: "Complex execution"
    input: "\"implement user authentication\""
    expected:
      files_modified: 5
      components_created: 3
  - name: "Execution with errors"
    input: "\"add feature with intentional bug\""
    expected:
      error_handled: true
      graceful_fallback: true
```

## Stage 9: Quality Gate

```yaml
test_id: middleware-009
stage: 9
name: "Quality Gate"
description: "Verify output meets quality standards"
max_latency: 100
test_cases:
  - name: "Pass quality gate"
    input: "Feature with tests and docs"
    expected:
      gate_passed: true
      checks: ["tests", "docs", "lint"]
  - name: "Fail quality gate"
    input: "Feature without tests"
    expected:
      gate_passed: false
      failed_checks: ["tests"]
  - name: "Conditional pass"
    input: "Hotfix with waiver"
    expected:
      gate_passed: true
      waiver: "production_critical"
```

## Stage 10: Result Validation

```yaml
test_id: middleware-010
stage: 10
name: "Result Validation"
description: "Validate outputs against plan criteria"
max_latency: 200
test_cases:
  - name: "Valid result"
    input: "All planned tasks completed"
    expected:
      valid: true
      criteria_met: 8
  - name: "Partial result"
    input: "Some tasks completed"
    expected:
      valid: true
      criteria_met: 5
      gaps: 3
  - name: "Invalid result"
    input: "Output doesn't match plan"
    expected:
      valid: false
      reason: "Output divergence"
```

## Stage 11: Memory Save

```yaml
test_id: middleware-011
stage: 11
name: "Memory Save"
description: "Persist session context and learnings"
max_latency: 300
test_cases:
  - name: "Successful save"
    input: "Session with learnings"
    expected:
      memories_saved: 5
      lessons_extracted: 2
  - name: "No learnings"
    input: "Simple session"
    expected:
      memories_saved: 1
      lessons_extracted: 0
  - name: "Save failure"
    input: "Memory system unavailable"
    expected:
      graceful_degradation: true
      memories_saved: 0
```

## Stage 12: Session Update

```yaml
test_id: middleware-012
stage: 12
name: "Session Update"
description: "Update session state and metrics"
max_latency: 100
test_cases:
  - name: "Normal update"
    input: "Completed session"
    expected:
      status: "completed"
      metrics_updated: true
      duration_recorded: true
  - name: "Interrupted session"
    input: "Session interrupted by user"
    expected:
      status: "interrupted"
      checkpoint_created: true
  - name: "Failed session"
    input: "Session with errors"
    expected:
      status: "failed"
      error_logged: true
      recovery_available: true
```
