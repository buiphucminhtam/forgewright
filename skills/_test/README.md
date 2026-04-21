# Forgewright Skill Testing Framework

> **Purpose:** Test skills to ensure they produce consistent, high-quality outputs over time. Inspired by CCGS Skill Testing Framework.

## Directory Structure

```
skills/_test/
├── README.md                      # This file
├── TEST-METADATA.yaml            # Test registry and configuration
├── test-runner.sh                # Main test runner
├── test-reporter.sh              # Report generator
├── framework/
│   ├── test-case.sh             # Test case runner
│   ├── assertion.sh             # Assertion library
│   └── mock.sh                  # Mock helpers
├── reports/
│   └── {date}-report.json       # Test reports
└── skills/
    ├── software-engineer/
    │   ├── test.yaml           # Test case definitions
    │   ├── expected/           # Expected output samples
    │   └── cases/
    │       └── 001-basic-endpoint.sh
    ├── code-reviewer/
    │   ├── test.yaml
    │   └── cases/
    └── [skill-name]/
        ├── test.yaml
        ├── expected/
        └── cases/
```

## Test Case Format

Test cases are defined in `test.yaml`:

```yaml
skill: software-engineer
version: "1.0.0"
tests:
  - id: test-basic-endpoint
    description: Generate a basic REST endpoint
    tags: [basic, api, rest]
    input:
      language: typescript
      framework: express
      endpoint: /api/users
      method: GET
    expected:
      contains:
        - "export default"
        - "async function"
        - "/api/users"
      files_created: 1
      min_lines: 10
    validate:
      - output_contains_all
      - file_count_matches
      - min_lines_satisfied
    timeout: 60s
  
  - id: test-auth-middleware
    description: Generate auth middleware
    tags: [auth, middleware, security]
    input:
      language: typescript
      type: auth-middleware
      auth_type: jwt
    expected:
      contains:
        - "verify"
        - "jwt"
        - "authorization"
      not_contains:
        - "TODO"
        - "FIXME"
    validate:
      - output_contains_all
      - output_excludes_none
```

## Running Tests

### Run All Tests

```bash
./scripts/test-skill.sh --all
```

### Run Specific Skill

```bash
./scripts/test-skill.sh software-engineer
```

### Run Specific Test

```bash
./scripts/test-skill.sh software-engineer test-basic-endpoint
```

### Run Tests by Tag

```bash
./scripts/test-skill.sh --tag basic
./scripts/test-skill.sh --tag api,rest
```

## Test Results

Results are saved to `skills/_test/reports/{date}-report.json`:

```json
{
  "timestamp": "2026-04-21T12:00:00Z",
  "total_tests": 45,
  "passed": 42,
  "failed": 3,
  "skipped": 0,
  "duration_ms": 123400,
  "tests": [
    {
      "id": "test-basic-endpoint",
      "skill": "software-engineer",
      "status": "passed",
      "duration_ms": 2340,
      "output": {
        "files_created": 1,
        "contains_expected": true
      }
    }
  ],
  "failures": [
    {
      "id": "test-missing-validation",
      "skill": "code-reviewer",
      "status": "failed",
      "reason": "Missing TODO check",
      "expected": "No TODO in output",
      "actual": "TODO found in output"
    }
  ]
}
```

## CI Integration

Add to CI pipeline:

```bash
# Run skill tests on PR
if ./scripts/test-skill.sh --all; then
  echo "All skill tests passed"
else
  echo "Skill tests failed"
  exit 1
fi
```

## Writing New Tests

### 1. Create Test Directory

```bash
mkdir -p skills/_test/skills/{skill-name}/cases
mkdir -p skills/_test/skills/{skill-name}/expected
```

### 2. Add Test YAML

Create `skills/_test/skills/{skill-name}/test.yaml`:

```yaml
skill: {skill-name}
version: "1.0.0"
tests:
  - id: test-{case-name}
    description: Description of what this test validates
    tags: [tag1, tag2]
    input:
      key: value
    expected:
      contains:
        - "expected string"
    validate:
      - output_contains_all
```

### 3. (Optional) Add Expected Output

Create expected output files in `expected/`:

```
skills/_test/skills/{skill-name}/expected/
├── test-{case-name}-output.md
└── test-{case-name}-files/
    └── expected-file.ts
```

## Validation Functions

Available validation functions:

| Function | Purpose |
|----------|---------|
| `output_contains_all` | All expected strings present |
| `output_excludes_none` | No forbidden strings present |
| `file_count_matches` | Correct number of files created |
| `min_lines_satisfied` | Minimum line count met |
| `no_todos` | No TODO/FIXME in output |
| `valid_syntax` | Output has valid syntax |
| `schema_valid` | JSON/YAML output is valid |

## Coverage

Track test coverage per skill:

```yaml
coverage:
  software-engineer:
    tested: 15
    total: 20
    percentage: 75
  code-reviewer:
    tested: 8
    total: 10
    percentage: 80
```

## Maintenance

### Updating Tests

When a skill changes:
1. Run existing tests
2. Update expected outputs if behavior changed
3. Add new tests for new functionality
4. Update skill version in test.yaml

### Deprecating Tests

Mark deprecated tests:

```yaml
- id: test-old-feature
  description: Old feature test (deprecated)
  deprecated: true
  deprecated_reason: "Feature removed in v2.0"
  skip: true
```

## History

- v1.0 — Initial framework (inspired by CCGS Skill Testing Framework)
