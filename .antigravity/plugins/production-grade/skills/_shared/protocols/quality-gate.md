# Universal Quality Gate Protocol

**Applies to ALL modes (sequential AND parallel). Every skill output goes through this validation before the pipeline advances. This replaces ad-hoc validation with a consistent, measurable quality standard.**

## When to Run

- **After EACH skill completes** in any mode (Feature, Full Build, Harden, etc.)
- **After EACH parallel worker merge** (in addition to task-validator checks)
- **At each strategic gate** (aggregated scorecard)
- **At pipeline completion** (final quality dashboard)

## Validation Levels

Execute levels in order. Each level has a severity that determines whether to STOP or WARN.

### Level 0 — Plan Quality (Critical — blocks implementation)

**Runs BEFORE implementation, not after.** See `plan-quality-loop.md` for full protocol.

```
1. Every planning step scores the plan against 8 criteria (completeness, specificity,
   feasibility, risk awareness, scope control, dependency ordering, testability, impact)

2. Score < threshold (default 8.0/10.0) → LEARN + RESEARCH + IMPROVE loop
   - Identify weak criteria
   - Research best practices and codebase patterns for weak areas
   - Log lessons to .forgewright/plan-lessons.md
   - Re-plan with lessons + research context (max 3 iterations)

3. Score ≥ threshold → proceed to implementation
```

**On failure (3 iterations, still below threshold):** Escalate to user with best plan + quality report.

**Applies to:** ALL skill invocations. Every skill must plan before acting, score the plan, and improve until ≥ threshold. Plan depth scales by skill type (see protocol for details).

### Level 1 — Syntax & Build (Critical — blocks pipeline)

```
1. All new/modified files parse without syntax errors
   - TypeScript: npx tsc --noEmit
   - Python: python -m py_compile [files]
   - Go: go vet ./...
   - Rust: cargo check

2. Project builds successfully
   - Detect build command from package.json, Makefile, etc.
   - Run build → must exit 0

3. No new lint errors introduced
   - IF lint tool detected in project-profile.json:
     - Run linter on changed files only
     - Compare error count with baseline (from project-profile health)
     - New errors = WARN (don't block, projects may have pre-existing lint issues)
```

**On failure:** STOP pipeline. Report exact error. Skill must self-fix (up to 3 retries).

### Level 2 — Regression Safety (Critical for Brownfield — blocks pipeline)

```
1. Existing tests still pass
   - Read baseline test count from .forgewright/project-profile.json
   - Run existing test suite
   - Compare: pass_count >= baseline_pass_count
   - IF any previously-passing test now fails → REGRESSION DETECTED → STOP

2. Scope boundary check
   - List files modified by skill (git diff --name-only)
   - Compare with skill's expected scope:
     - T3a: services/, libs/
     - T3b: frontend/
     - T5: tests/
     - etc.
   - Files outside expected scope → WARN + log

3. API contract integrity (if API exists)
   - IF api/ directory has OpenAPI specs:
     - Check that existing endpoints are not removed
     - Check that existing response schemas are not broken
     - New endpoints OK, removals → STOP
```

**For greenfield projects:** Level 2 is automatically satisfied (no baseline, no existing tests).

**On failure:** STOP pipeline. Skill must revert breaking changes and re-implement.

### Level 3 — Quality Standards (High — warns, configurable to block)

```
1. No stubs in production code
   - grep for: TODO, FIXME, HACK, XXX, "Not implemented", "throw new Error('Not implemented')", "pass  # TODO", "raise NotImplementedError"
   - Exclude: test files, documentation, comments marked as intentional
   - Found in production code → WARN (default) or STOP (if strict mode)

2. No hardcoded secrets
   - grep for patterns: sk-*, key-*, Bearer *, password=*, SECRET=*
   - Check for .env values hardcoded in source
   - Found → STOP (always critical, regardless of mode)

3. Import resolution
   - For each new file: verify all imports resolve to real modules
   - Relative imports → check file exists
   - Package imports → check in package.json/go.mod/requirements.txt
   - Unresolvable → WARN

4. Convention compliance (brownfield only)
   - IF .forgewright/code-conventions.md exists:
     - Check naming convention matches (high-confidence patterns only)
     - Check file organization matches detected pattern
     - Deviations → WARN with suggestion
```

### Level 4 — Acceptance Traceability (Medium — informational)

```
1. Output maps to requirement
   - IF BRD exists (.forgewright/product-manager/BRD/):
     - Check that skill output addresses at least one acceptance criterion
     - Unmapped output → INFO (logged, not blocking)

2. Test coverage for new code
   - IF in BUILD phase AND QA has not run yet:
     - Check if TDD was followed (test files exist alongside implementation)
     - No test files → WARN: "Implementation without corresponding tests"

3. Documentation exists
   - Workspace artifacts written to .forgewright/<skill>/
   - If workspace directory empty → WARN: "No workspace artifacts produced"
```

## Quality Scoring

After each validation run, compute a quality score (0-100):

```
Score Calculation:
  Level 1 (Build):        25 points — all-or-nothing (passes: 25, fails: 0)
  Level 2 (Regression):   25 points — all-or-nothing (passes: 25, N/A for greenfield: 25)
  Level 3 (Standards):    30 points — proportional
    - No stubs:           10 points (found any: 0)
    - No secrets:         10 points (found any: 0)
    - Imports resolve:    5 points (proportional to % resolved)
    - Conventions match:  5 points (proportional to % match, or full if N/A)
  Level 4 (Traceability): 20 points — proportional
    - Mapped to req:      10 points (proportional to coverage)
    - Has tests:          5 points (yes: 5, no: 0)
    - Has docs:           5 points (yes: 5, no: 0)

Total: sum of all points
```

### Quality Thresholds

| Score | Grade | Action |
|-------|-------|--------|
| 95-100 | A | ✓ Proceed immediately |
| 90-94 | B | ✓ Proceed with minor warnings logged |
| 60-89 | C | ⚠ Pause — show quality report, ask user to continue or fix |
| 0-59 | F | ✗ Stop — unacceptable quality, must remediate |

**Configurable in `.production-grade.yaml`:**
```yaml
quality:
  minimum_score: 90          # default: pass threshold (aligned with plan-quality-loop 9.0/10)
  block_score: 60            # default: stop below this
  strict_mode: false         # if true: Level 3 violations also block
  skip_regression: false     # if true: skip Level 2 (not recommended)
```

## Quality Scorecard Display

After each skill, display mini-scorecard:

```
┌─ Quality Gate: T3a Backend ──────────┐
│ Build:       ✓ Compiles              │
│ Regression:  ✓ 142/142 tests pass    │
│ Standards:   ⚠ 1 TODO found         │
│ Traceability: ✓ Mapped to AC-001-007 │
│ Score: 92/100 (A)                    │
└──────────────────────────────────────┘
```

## Aggregate Scorecard (at Gates)

At each strategic gate, show aggregate quality across all completed tasks:

```
━━━ Quality Summary (Gate 3) ━━━━━━━━━━━━━━━━━━━━
Task          Build  Regr.  Standards  Trace   Score
T3a Backend    ✓      ✓       ⚠         ✓      92
T3b Frontend   ✓      ✓       ✓         ✓      96
T5 QA          ✓      ✓       ✓         ✓      100
T6a Security   ✓      ✓       ✓         ✓      100
T6b Review     ✓      ✓       ✓         ✓      100
─────────────────────────────────────────────────
Overall: 97/100 (A) ████████████████████░
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Integration with Existing Protocols

- **task-validator.md:** Quality Gate is a SUPERSET of task-validator. In parallel mode, task-validator runs first (contract compliance), then quality gate runs on merged output.
- **input-validation.md:** Quality Gate runs AFTER skill execution; input-validation runs BEFORE. They are complementary.
- **conflict-resolution.md:** Authority boundaries are enforced regardless of quality score. A skill cannot bypass authority by having a high quality score.

## Metrics Storage

Write quality metrics to `.forgewright/quality-metrics.json` after each run:

```json
{
  "session_id": "session-20260314-1324",
  "measurements": [
    {
      "task_id": "T3a",
      "skill": "software-engineer",
      "measured_at": "ISO-8601",
      "levels": {
        "build": { "status": "pass", "points": 25 },
        "regression": { "status": "pass", "points": 25, "tests_baseline": 142, "tests_current": 142 },
        "standards": { "status": "warn", "points": 27, "issues": ["1 TODO in services/auth/handler.ts:42"] },
        "traceability": { "status": "pass", "points": 20 }
      },
      "total_score": 97,
      "grade": "A"
    }
  ]
}
```
