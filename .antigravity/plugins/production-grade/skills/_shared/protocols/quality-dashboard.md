# Quality Dashboard Protocol

**Produces a comprehensive, machine-readable quality report at pipeline completion. Replaces the simple text summary with a rich dashboard that tracks quality across sessions.**

## Real-Time Quality Tracking

### After Each Skill

Update `.forgewright/quality-metrics.json` with the latest quality gate results (from quality-gate.md).

Display mini-status in task_boundary:
```
TaskStatus: "T3a complete — Quality: 92/100 (A) ✓"
```

### After Each Phase

Display phase quality summary:
```
━━━ BUILD Phase Quality ━━━━━━━━━━━━━━━━━
T3a Backend:    92/100 (A) ✓
T3b Frontend:   96/100 (A) ✓
T4  DevOps:     100/100 (A) ✓
Phase Average:  96/100 (A)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Final Quality Dashboard

Generated at pipeline completion. Replaces the existing `Final Summary Template` in the orchestrator.

```
╔══════════════════════════════════════════════════════════════╗
║              FORGE17 v7.0.0 — QUALITY DASHBOARD              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  📊 Overall Quality Score: [XX]/100  [progress bar]          ║
║  Grade: [A/B/C/D/F]                                         ║
║                                                              ║
║  ┌─ Build Health ──────────────────────────────────────┐    ║
║  │ Compilation:    [✓/✗] [details]                     │    ║
║  │ Docker:         [✓/✗/⊘] [details]                  │    ║
║  │ Dependencies:   [✓/⚠] [count] deprecated           │    ║
║  │ Lint:           [✓/⚠] [count] errors               │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                              ║
║  ┌─ Test Coverage ─────────────────────────────────────┐    ║
║  │ Unit:           [✓/✗] [pass]/[total] | [X]% cover   │    ║
║  │ Integration:    [✓/✗] [pass]/[total]                │    ║
║  │ E2E:            [✓/✗] [pass]/[total]                │    ║
║  │ Contract:       [✓/✗/⊘] [details]                  │    ║
║  │ Performance:    [✓/✗/⊘] [within/outside] SLO       │    ║
║  │ Regression:     [✓/⊘] [count] broken (vs baseline)  │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                              ║
║  ┌─ Security ──────────────────────────────────────────┐    ║
║  │ OWASP:          [✓/⚠/✗] [C] Critical [H] High     │    ║
║  │ STRIDE:         [✓/⊘] [details]                     │    ║
║  │ Dependencies:   [✓/⚠] [count] CVEs by severity     │    ║
║  │ Secrets:        [✓/✗] Hardcoded credential scan     │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                              ║
║  ┌─ Code Quality ──────────────────────────────────────┐    ║
║  │ Architecture:   [✓/⚠] Conforms to ADR decisions     │    ║
║  │ Conventions:    [✓/⚠] [count] deviations            │    ║
║  │ No Stubs:       [✓/✗] [count] TODO/FIXME            │    ║
║  │ Import Health:  [✓/⚠] All imports resolve           │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                              ║
║  ┌─ Acceptance ────────────────────────────────────────┐    ║
║  │ BRD Criteria:   [covered]/[total] covered by tests  │    ║
║  │ Untested:       [count] acceptance criteria          │    ║
║  │ Traceability:   [✓/⚠] Test↔Requirement mapping      │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                              ║
║  ┌─ Pipeline Stats ───────────────────────────────────┐    ║
║  │ Mode:           [Full Build / Feature / etc.]       │    ║
║  │ Execution:      [Sequential / Parallel]             │    ║
║  │ Duration:       [HH:MM]                             │    ║
║  │ Skills Run:     [N]/[total available]               │    ║
║  │ Files Changed:  [created] new | [modified] modified │    ║
║  │ Session Branch: [branch name or N/A]                │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

## Machine-Readable Report

Write `.forgewright/quality-report-{session}.json` at pipeline completion:

```json
{
  "schema_version": "1.0",
  "session_id": "session-20260314-1324",
  "generated_at": "ISO-8601",
  "forgewright_version": "7.0.0",
  "mode": "Full Build",
  "overall": {
    "score": 91,
    "grade": "A",
    "passed": true
  },
  "build_health": {
    "compilation": { "status": "pass", "details": "All 3 services compile" },
    "docker": { "status": "pass", "details": "3 containers build + start" },
    "dependencies": { "status": "warn", "deprecated_count": 2 },
    "lint": { "status": "warn", "error_count": 23 }
  },
  "test_coverage": {
    "unit": { "status": "pass", "passed": 142, "failed": 0, "coverage_percent": 85 },
    "integration": { "status": "pass", "passed": 38, "failed": 0 },
    "e2e": { "status": "pass", "passed": 12, "failed": 0 },
    "contract": { "status": "pass", "passed": 8, "failed": 0 },
    "performance": { "status": "pass", "within_slo": true },
    "regression": { "status": "pass", "broken_count": 0, "baseline_count": 0 }
  },
  "security": {
    "owasp": { "status": "pass", "critical": 0, "high": 0, "medium": 2, "low": 5 },
    "stride": { "status": "pass", "threats_mitigated": 12 },
    "dependencies": { "status": "warn", "cve_count": 1, "severity": "medium" },
    "secrets": { "status": "pass", "hardcoded_found": 0 }
  },
  "code_quality": {
    "architecture_conformance": { "status": "pass", "deviations": 0 },
    "conventions": { "status": "pass", "deviations": 3 },
    "stubs": { "status": "pass", "todo_count": 0, "fixme_count": 0 },
    "imports": { "status": "pass", "unresolved": 0 }
  },
  "acceptance": {
    "brd_criteria_total": 24,
    "brd_criteria_covered": 24,
    "untested_criteria": 0,
    "traceability": "complete"
  },
  "pipeline_stats": {
    "execution_mode": "sequential",
    "duration_minutes": 47,
    "skills_run": ["product-manager", "solution-architect", "software-engineer", "frontend-engineer", "devops", "qa-engineer", "security-engineer", "code-reviewer", "sre", "technical-writer"],
    "files_created": 87,
    "files_modified": 12,
    "files_deleted": 0,
    "session_branch": "forgewright/session-20260314-1324"
  },
  "per_task_scores": [
    { "task_id": "T3a", "skill": "software-engineer", "score": 92, "grade": "A" },
    { "task_id": "T3b", "skill": "frontend-engineer", "score": 96, "grade": "A" },
    { "task_id": "T5", "skill": "qa-engineer", "score": 100, "grade": "A" }
  ]
}
```

## Quality Trend (Cross-Session)

Append each session's quality summary to `.forgewright/quality-history.json`:

```json
{
  "project_id": "my-project",
  "history": [
    {
      "session_id": "session-20260310-0900",
      "date": "2026-03-10",
      "mode": "Feature",
      "score": 85,
      "grade": "B",
      "tests_total": 98,
      "coverage_percent": 72
    },
    {
      "session_id": "session-20260314-1324",
      "date": "2026-03-14",
      "mode": "Full Build",
      "score": 91,
      "grade": "A",
      "tests_total": 200,
      "coverage_percent": 85
    }
  ]
}
```

**Trend display** (at session start, if history exists):

```
📈 Quality Trend (last 5 sessions):
   Mar 10: 85 (B) ████████████████░░░░
   Mar 12: 88 (B) █████████████████░░░
   Mar 13: 90 (A) ██████████████████░░
   Mar 14: 91 (A) ██████████████████░░
   Trend: ↑ Improving (+6 over 4 sessions)
```

## Early Warning System

During pipeline execution, if quality degrades below threshold:

```
IF any task scores below quality.minimum_score (default 70):
  Immediately display:
  ⚠ Quality Alert: T3a scored 65/100 (D)
  Issues:
    - 3 TODO stubs in production code
    - 2 unresolved imports
  Pipeline will pause after this phase for review.

IF cumulative average drops below block_score (default 60):
  STOP pipeline immediately
  Display quality scorecard
  Require user decision to continue or remediate
```

## Integration with Existing Summary

The Quality Dashboard REPLACES the Final Summary Template in the orchestrator (the `╔══════╗` banner). The new dashboard includes all the same information plus quality metrics. The orchestrator should use this protocol's template instead of its built-in one.

The existing HARDEN Summary banner is KEPT as a phase-level summary. The Quality Dashboard is the pipeline-level summary that appears at the very end or at Gate 3.
