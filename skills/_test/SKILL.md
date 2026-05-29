# Forgewright Self-Test Orchestrator

> **Purpose:** Validates Forgewright's own behavior including mode classification, plan quality scoring, and middleware chain execution.

**Source:** This skill is part of Phase 1 (Quick Wins) of the Forgewright improvement plan (v9). It ensures Forgewright tests itself systematically before shipping changes.

---

## Overview

The Test Orchestrator provides automated testing for core Forgewright behaviors:

| Category | Coverage |
|----------|----------|
| Mode Classification | 24 modes (100%) |
| Plan Quality Scoring | 8 criteria |
| Middleware Chain | 12 stages |
| Memory Retrieval | 5 key operations |
| Skill Routing | 15 edge cases |

---

## Test Runner

```bash
# Run all tests
bash scripts/run-self-tests.sh

# Run specific category
bash scripts/run-self-tests.sh --category mode-classification

# Run with verbose output
bash scripts/run-self-tests.sh --verbose

# Generate coverage report
bash scripts/run-self-tests.sh --coverage
```

---

## Test Categories

### Mode Classification Tests

Tests that verify the 24 execution modes are correctly detected from user requests.

| Mode | Trigger Phrases | Expected Classification |
|------|---------------|------------------------|
| Full Build | "build a SaaS", "from scratch", "full stack" | `Full Build` |
| Feature | "add [feature]", "implement", "new endpoint" | `Feature` |
| Review | "review my code", "code quality" | `Review` |
| Debug | "bug", "broken", "crash", "error" | `Debug` |
| Test | "write tests", "test coverage" | `Test` |
| Ship | "deploy", "CI/CD", "docker" | `Ship` |
| Architect | "design", "architecture" | `Architect` |
| Document | "document", "write docs" | `Document` |
| Explore | "explain", "how does" | `Explore` |
| Research | "research", "deep research" | `Research` |
| Optimize | "performance", "slow", "optimize" | `Optimize` |
| Design | "design UI", "wireframes" | `Design` |
| Mobile | "mobile app", "iOS", "Android" | `Mobile` |
| Game Build | "game", "Unity", "Unreal", "Godot", "Roblox" | `Game Build` |
| XR Build | "VR", "AR", "MR", "XR", "Quest" | `XR Build` |
| Marketing | "marketing", "SEO" | `Marketing` |
| Grow | "growth", "CRO", "conversion" | `Grow` |
| Analyze | "analyze requirements" | `Analyze` |
| AI Build | "AI feature", "chatbot", "RAG" | `AI Build` |
| Migrate | "migrate", "upgrade" | `Migrate` |
| Prompt | "improve prompts", "prompt engineering" | `Prompt` |
| Security | "secure", "harden", "audit" | `Harden` |
| Backend | "backend", "api", "server" | `Feature` (BE) |
| Frontend | "frontend", "react", "ui" | `Feature` (FE) |

### Plan Quality Scoring Tests

Tests that verify the 8-criteria scoring rubric works correctly.

| Criterion | Weight | Min Score |
|-----------|--------|-----------|
| Completeness | 1.0 | 0.875 (7/8) |
| Specificity | 1.0 | 0.875 (7/8) |
| Feasibility | 1.0 | 0.875 (7/8) |
| Risk Awareness | 1.0 | 0.875 (7/8) |
| Scope Control | 1.0 | 1.0 (8/8) |
| Dependency Ordering | 1.0 | 1.125 (9/8) |
| Testability | 1.0 | 0.875 (7/8) |
| Impact Assessment | 1.0 | 0.75 (6/8) |

### Middleware Chain Tests

Tests that verify the 12-stage middleware chain executes correctly.

| Stage | Description | Max Latency |
|-------|-------------|-------------|
| 1 | Memory Retrieval | 500ms |
| 2 | Intent Analysis | 200ms |
| 3 | Mode Classification | 100ms |
| 4 | Context Loading | 300ms |
| 5 | Plan Generation | 2000ms |
| 6 | Plan Scoring | 500ms |
| 7 | Skill Selection | 200ms |
| 8 | Skill Execution | Variable |
| 9 | Quality Gate | 100ms |
| 10 | Result Validation | 200ms |
| 11 | Memory Save | 300ms |
| 12 | Session Update | 100ms |

---

## Test Case Format

Each test case follows this structure:

```yaml
test_id: T1.3.1
category: mode-classification
description: "Mode classification: 'build a SaaS' triggers Full Build"
input:
  user_request: "build a SaaS for pet adoption"
expected:
  mode: "Full Build"
  confidence: ">=0.9"
  routing: "orchestrator"
```

---

## Success Criteria

| Metric | Target | Current |
|--------|--------|---------|
| Mode Coverage | 100% (24/24) | 0% |
| Plan Scoring Coverage | 100% (8/8) | 0% |
| Middleware Coverage | 100% (12/12) | 0% |
| Overall Test Pass Rate | >=95% | N/A |
| CI Integration | Yes | No |

---

## CI Integration

Add to your CI pipeline:

```yaml
# .github/workflows/self-test.yml
- name: Run Forgewright Self-Tests
  run: |
    bash scripts/run-self-tests.sh --coverage --junit results.xml
```

---

## Future Enhancements

- [ ] Add fuzzy matching tests for mode classification
- [ ] Add regression tests for known bugs
- [ ] Add performance benchmark tests
- [ ] Add integration tests with real skills

---

*Last Updated: 2026-05-29*
*Part of: Phase 1 - Task 1.3*
