# Task Validator Protocol

**Run after each worker completes, before merge. Validates delivery against the Task Contract.**

## Validation Pipeline

Execute these checks in order. STOP on first Critical failure.

### Step 1 — Contract Compliance (Critical)

```
1. Read CONTRACT.json from worktree root
2. Read DELIVERY.json from worktree root
3. If DELIVERY.json missing → FAIL: "Worker did not produce delivery report"
4. If DELIVERY.status != "completed" → FAIL: "Worker reported non-completion"
```

### Step 2 — Boundary Violation Check (Critical)

```
1. List ALL files changed in the worktree branch vs base:
   git diff --name-only main...<branch>

2. For each changed file:
   - Check if path falls within contract.outputs.allowed_directories
   - If NOT → FAIL: "Boundary violation: <file> is outside allowed directories"

3. For each file in contract.constraints.forbidden_writes:
   - Check if modified → FAIL: "Forbidden write: <file>"

4. For each file in contract.constraints.forbidden_deletes:
   - Check if deleted → FAIL: "Forbidden delete: <file>"
```

### Step 3 — Required Artifacts Check (Critical)

```
For each pattern in contract.outputs.required_artifacts:
  - Resolve glob pattern
  - If no matching files → FAIL: "Missing required artifact: <pattern>"
```

### Step 4 — Forbidden Patterns Check (High)

```
For each pattern in contract.anti_hallucination.grep_forbidden_patterns:
  - grep -rn "<pattern>" <allowed_directories> --include="*.ts" --include="*.py" --include="*.go" --include="*.java" --include="*.rs"
  - Exclude test files for TODO/FIXME (tests may have pending items)
  - If found in production code → WARN or FAIL based on severity:
    - "TODO"/"FIXME" → FAIL: "Stub code detected"
    - "Not implemented" → FAIL: "Unimplemented code"
```

### Step 5 — Build Check (Critical if must_pass_tests)

```
Detect project type from worktree:
  - package.json → npm run build / npx tsc --noEmit
  - go.mod → go build ./...
  - pyproject.toml → python -m py_compile
  - Cargo.toml → cargo check
  - pom.xml → mvn compile

If build fails → FAIL: "Build failed"
```

### Step 6 — Test Check (Critical if must_pass_tests)

```
Detect test runner:
  - package.json has "test" script → npm test
  - go.mod → go test ./...
  - pyproject.toml → pytest
  - Cargo.toml → cargo test
  - pom.xml → mvn test

Compare with delivery report:
  - tests_run should be > 0
  - tests_failed should be 0
  - If mismatch → FAIL: "Test results don't match delivery report"
```

### Step 7 — Anti-Hallucination Checks (High)

#### 7a: Import Verification

```
If contract.anti_hallucination.verify_imports_exist:
  For each source file in allowed_directories:
    - Extract all import/require statements
    - For relative imports: verify target file exists in worktree
    - For package imports: verify package in package.json/go.mod/requirements.txt
    - If unresolvable → FAIL: "Hallucinated import: <import> in <file>"
```

#### 7b: API Endpoint Verification

```
If contract.anti_hallucination.verify_api_endpoints_match_spec:
  - Parse OpenAPI spec from contract.inputs.readonly_files
  - Parse implemented routes from source code
  - Diff: spec endpoints vs implemented endpoints
  - Missing implementations → WARN
  - Extra endpoints (not in spec) → WARN: "Endpoint not in spec: <route>"
```

#### 7c: Schema Verification

```
If contract.anti_hallucination.verify_schema_matches_models:
  - Parse schema definitions (Prisma/SQL/Proto)
  - Parse ORM models from code
  - Diff: schema fields vs model fields
  - Missing fields → WARN
  - Extra fields (not in schema) → FAIL: "Hallucinated field: <field> in <model>"
```

## Validation Result Format

Write `VALIDATION.json` in the worktree root:

```json
{
  "task_id": "T3a",
  "validated_at": "ISO-8601",
  "overall_status": "PASS|FAIL|WARN",
  "checks": [
    {
      "name": "contract_compliance",
      "status": "PASS",
      "severity": "Critical",
      "details": null
    },
    {
      "name": "boundary_violation",
      "status": "PASS",
      "severity": "Critical",
      "details": null
    },
    {
      "name": "forbidden_patterns",
      "status": "FAIL",
      "severity": "High",
      "details": "Found TODO in services/auth/src/handler.ts:42"
    }
  ],
  "summary": {
    "critical_failures": 0,
    "high_failures": 1,
    "warnings": 0,
    "total_checks": 7
  }
}
```

## Decision Matrix

| Overall Status | Critical Failures | High Failures | Action |
|---------------|-------------------|---------------|--------|
| **PASS** | 0 | 0 | Proceed to merge |
| **WARN** | 0 | 0 (warnings only) | Proceed to merge, log warnings |
| **FAIL** | 0 | 1+ | Retry (up to max_retries), then escalate |
| **FAIL** | 1+ | any | Immediate escalation to CEO agent |

## Retry Protocol

When a check fails with retry allowed:

1. Feed failure details back to the worker as context
2. Worker reads VALIDATION.json and fixes the issues
3. Worker regenerates DELIVERY.json
4. Re-run validation pipeline
5. After `max_retries` failures → escalate to CEO agent via notify_user
