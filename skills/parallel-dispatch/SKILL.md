---
name: parallel-dispatch
description: >
  Orchestrates parallel task execution using git worktrees. Analyzes
  the task dependency graph, generates Task Contracts for each worker,
  spawns isolated Gemini CLI instances in separate worktrees, validates
  outputs, and merges results back into the main branch. Used by the
  production-grade orchestrator when parallel mode is selected.
version: 2.0.0
---

# Parallel Dispatch Orchestrator

## Identity

You are the **Parallel Dispatch Orchestrator**. You manage the parallel execution of independent tasks using git worktrees for process isolation. You generate Task Contracts, coordinate worker execution, validate outputs, and merge results.

You are NOT an executor — you orchestrate. You delegate implementation to worker agents while maintaining quality gates.

---

## Critical Rules

### Rule 1: Dependency Order First
> **Never execute dependent tasks in parallel.** Always resolve dependencies before spawning workers.

### Rule 2: Contract Before Execution
> **Every worker gets a Task Contract.** No worker executes without explicit input/output/constraint definitions.

### Rule 3: Quality Gates Before Merge
> **Every worker's output passes through spec-reviewer AND quality-reviewer.** No merge without validation.

### Rule 4: Fail Fast, Fail Loud
> **Circuit breakers prevent cascade failures.** If a worker type repeatedly fails, throttle it.

### Rule 5: Checkpoint Everything
> **Every worker state is preserved.** Resume from failure, don't restart from scratch.

---

## Overview

Manages parallel execution of independent tasks in the Forgewright pipeline. Uses **git worktrees** for process isolation, **Task Contracts** for explicit input/output boundaries, and **automated validation** to prevent hallucination.

**Max concurrent workers:** 4 (configurable via `MAX_WORKERS` env var)

> **⚠️ Compatibility Note:** Parallel dispatch requires **Gemini CLI** with concurrent process spawning. In **Antigravity**, **Cursor**, **Claude Desktop**, or other single-session AI clients, the pipeline runs **sequentially**. The orchestrator automatically falls back to sequential mode when parallel dispatch is unavailable.

---

## Parallel Groups

Based on the Forgewright task dependency graph:

```
┌─────────────────────────────────────────────────────┐
│ Group A — BUILD Phase (after Gate 2)                │
│   T3a: software-engineer  (services/, libs/)        │
│   T3b: frontend-engineer  (frontend/)              │
│   T3c: mobile-engineer    (mobile/)  [conditional]│
│   T4:  devops             (Dockerfiles) [after T3a]│
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Group B — HARDEN Phase (after BUILD)                │
│   T5:  qa-engineer        (tests/)                 │
│   T6a: security-engineer  (workspace only)         │
│   T6b: code-reviewer      (workspace only)         │
└─────────────────────────────────────────────────────┘
```

**Note:** T4 (DevOps) depends on T3a (Backend) for service discovery, so it starts after T3a.

---

## Subagent Parallel Protocol

Follow `skills/_shared/protocols/parallel-protocol.md`:

```
Quick Reference:
- Spawn independent tasks simultaneously
- Surface BLOCKED agents immediately (never skip)
- Produce partial reports if some fail
- Wait for wave completion before next wave
```

---

## Execution Flow

### Phase 1 — Dependency Analysis

```bash
# Step 1: Read settings
view_file_outline .forgewright/settings.md
# Confirm execution: parallel
# view_file_outline engagement mode

# Step 2: view_file_outline phase dispatcher
view_file_outline phases/build.md
# Identify tasks in this phase
# Check .production-grade.yaml for skip conditions
# Apply conditional rules (skip frontend if features.frontend: false)

# Step 3: Build execution plan
# Wave 1: Tasks with NO inter-dependencies (T3a, T3b, T3c)
# Wave 2: Tasks depending on Wave 1 output (T4 depends on T3a)
# If total tasks ≤ MAX_WORKERS: single wave

# Step 4: If Code Intelligence available (code_intelligence.indexed == true):
#   use community clusters to refine task boundaries
```

### Phase 2 — Contract Generation

Read `skills/_shared/protocols/task-contract.md` for the contract format:

```typescript
// Task Contract Interface
interface TaskContract {
  taskId: string;
  skill: string;                    // Skill to invoke
  inputs: string[];                // Directories/files worker can READ
  outputs: string[];               // Directories/files worker can WRITE
  forbidden: string[];             // Directories/files worker CANNOT access
  constraints: {
    maxDuration: number;            // Minutes
    maxMemoryMB: number;
    testRequirement: 'all' | 'critical' | 'none';
  };
  acceptanceCriteria: string[];      // What constitutes "done"
  dependencies?: string[];          // Task IDs that must complete first
  handoff?: {
    nextTasks: string[];          // Tasks that consume this output
    files: string[];               // Specific files to hand off
  };
}
```

#### Contract Templates by Task

```typescript
// T3a (Backend)
const t3aContract: TaskContract = {
  taskId: 'T3a',
  skill: 'software-engineer',
  inputs: ['api/', 'schemas/', 'docs/architecture/', '.forgewright/product-manager/'],
  outputs: ['services/', 'libs/shared/'],
  forbidden: ['frontend/', 'mobile/', 'infrastructure/'],
  constraints: {
    maxDuration: 30,
    maxMemoryMB: 512,
    testRequirement: 'all',
  },
  acceptanceCriteria: [
    'All services implement their API contracts',
    'Database migrations are idempotent',
    'Unit tests pass with >80% coverage',
    'API endpoints match OpenAPI spec',
    'Health endpoints respond correctly',
  ],
  handoff: {
    nextTasks: ['T4'],
    files: ['services/', 'libs/shared/', 'docs/architecture/services/'],
  },
};

// T3b (Frontend)
const t3bContract: TaskContract = {
  taskId: 'T3b',
  skill: 'frontend-engineer',
  inputs: ['api/', '.forgewright/product-manager/', 'docs/design-tokens/'],
  outputs: ['frontend/'],
  forbidden: ['services/', 'mobile/', 'infrastructure/'],
  constraints: {
    maxDuration: 30,
    maxMemoryMB: 512,
    testRequirement: 'all',
  },
  acceptanceCriteria: [
    'All pages implement their designs',
    'All API calls use the shared API client',
    'Components match design tokens',
    'Accessibility tests pass',
    'Responsive at all breakpoints',
  ],
};

// T4 (DevOps)
const t4Contract: TaskContract = {
  taskId: 'T4',
  skill: 'devops',
  inputs: ['services/', 'docs/architecture/', '.production-grade.yaml'],
  outputs: ['Dockerfile*', 'docker-compose*.yml', '.dockerignore'],
  forbidden: ['services/*/src/', 'frontend/src/', 'mobile/src/'],
  constraints: {
    maxDuration: 45,
    maxMemoryMB: 768,
    testRequirement: 'critical',
  },
  dependencies: ['T3a'],
  acceptanceCriteria: [
    'Dockerfile builds successfully',
    'docker-compose up works',
    'Health check endpoints work in container',
    'Environment variables are configurable',
  ],
};

// T5 (QA)
const t5Contract: TaskContract = {
  taskId: 'T5',
  skill: 'qa-engineer',
  inputs: ['services/', 'frontend/', 'api/'],
  outputs: ['tests/'],
  forbidden: ['services/*/src/', 'frontend/src/'],
  constraints: {
    maxDuration: 30,
    maxMemoryMB: 512,
    testRequirement: 'all',
  },
  acceptanceCriteria: [
    'All acceptance criteria have tests',
    'Integration tests pass',
    'E2E tests pass',
    'Test coverage report generated',
  ],
};

// T6a (Security)
const t6aContract: TaskContract = {
  taskId: 'T6a',
  skill: 'security-engineer',
  inputs: ['services/', 'frontend/', 'mobile/'],  // read-only
  outputs: [],  // workspace only
  forbidden: [],  // read-only audit
  constraints: {
    maxDuration: 20,
    maxMemoryMB: 256,
    testRequirement: 'none',
  },
  acceptanceCriteria: [
    'OWASP Top 10 vulnerabilities addressed',
    'No CRITICAL security findings',
    'No HIGH findings without mitigation',
    'Security report generated',
  ],
};

// T6b (Code Review)
const t6bContract: TaskContract = {
  taskId: 'T6b',
  skill: 'code-reviewer',
  inputs: ['services/', 'frontend/', 'docs/architecture/'],  // read-only
  outputs: [],  // workspace only
  forbidden: [],  // read-only review
  constraints: {
    maxDuration: 20,
    maxMemoryMB: 256,
    testRequirement: 'none',
  },
  acceptanceCriteria: [
    'All files reviewed',
    'Code quality score >= 7/10',
    'No blocking issues',
    'Review report generated',
  ],
};
```

---

## Phase 3 — Worktree Setup

```bash
# For each task in current wave:
scripts/worktree-manager.sh create <task_id> parallel/<task_id>-<name>

# Example:
scripts/worktree-manager.sh create T3a parallel/T3a-backend
scripts/worktree-manager.sh create T3b parallel/T3b-frontend
scripts/worktree-manager.sh create T3c parallel/T3c-mobile

# Copy CONTRACT.json into worktree root
cp .forgewright/contracts/T3a.json parallel/T3a-backend/CONTRACT.json

# Copy readonly input files into worktree (from contract.inputs)
cp -r api parallel/T3a-backend/
cp -r schemas parallel/T3a-backend/

# Copy skill SKILL.md into worktree
cp skills/software-engineer/SKILL.md parallel/T3a-backend/SKILL.md

# Verify worktree is ready
scripts/worktree-manager.sh status parallel/T3a-backend
```

---

## Phase 3.5 — Context Isolation (DeerFlow Pattern)

**Each worker operates in a sealed context scope:**

### What Workers Receive

```
Context Isolation Rules:

  EACH WORKER RECEIVES (scoped context):
    ✅ Its CONTRACT.json (task-specific inputs/outputs/constraints)
    ✅ Its SKILL.md (skill instructions only)
    ✅ Shared API contracts (api/, schemas/ — read-only)
    ✅ .forgewright/code-conventions.md (pattern consistency)
    ✅ Compressed pipeline summary (max 2K tokens)

  EACH WORKER DOES NOT RECEIVE:
    ❌ Other workers' DELIVERY.json or work output
    ❌ Full session-log.json history
    ❌ Memory entries unrelated to their contracted scope
    ❌ Quality reports from other skills
    ❌ Other skills' SKILL.md files
```

### Context Size Budget per Worker

| Component | Token Budget |
|-----------|-------------|
| CONTRACT.json | ~2K tokens |
| SKILL.md | ~5K tokens |
| Shared contracts | ~3K tokens |
| Code conventions | ~1K tokens |
| Pipeline summary | ~2K tokens |
| **Total** | ~13K tokens |

**Without isolation:** ~70K tokens (unmanageable)

### Guardrail Enforcement

Workers attempting to read files outside their contract inputs → **WARN**
Workers attempting to write outside their contract outputs → **DENY**

---

## Phase 4 — Circuit Breaker Check

### Before Dispatching Workers

```bash
# Load circuit breaker config
CIRCUIT_FILE="${CIRCUIT_FILE:-.forgewright/circuits.json}"

# Source circuit breaker functions
source scripts/circuit-breaker.sh

# Check circuit state for each worker
for task in T3a T3b T3c T4 T5 T6a T6b; do
  circuit_key="${task,,}"

  state=$(should_allow "$circuit_key" 60)  # 60s timeout

  if [ "$state" = "OPEN" ]; then
    echo "[CIRCUIT_BREAKER] Skipping ${task}: circuit is OPEN"
    continue
  elif [ "$state" = "HALF_OPEN" ]; then
    echo "[CIRCUIT_BREAKER] ${task}: circuit is HALF_OPEN (limited requests)"
  else
    echo "[CIRCUIT_BREAKER] ${task}: circuit is CLOSED"
  fi
done
```

### Circuit Breaker Configuration

| Worker | Circuit Key | Default Config |
|--------|-------------|---------------|
| T3a (Backend) | `t3a` | failure_threshold: 3 |
| T3b (Frontend) | `t3b` | failure_threshold: 3 |
| T3c (Mobile) | `t3c` | failure_threshold: 3 |
| T4 (DevOps) | `t4` | failure_threshold: 3 |
| T5 (QA) | `t5` | failure_threshold: 3 |
| T6a (Security) | `t6a` | failure_threshold: 3 |
| T6b (Code Review) | `t6b` | failure_threshold: 3 |

### State Tracking

```json
{
  "t3a": { "state": "CLOSED", "failure_count": 0, "last_failure": null },
  "t3b": { "state": "OPEN", "failure_count": 5, "last_failure": 1712912400 },
  "t4": { "state": "HALF_OPEN", "failure_count": 3, "last_failure": 1712912400 }
}
```

---

## Phase 4.1 — Worker Dispatch

### Dispatch Script

```bash
# Load bulkhead config from .production-grade.yaml
BULKHEAD_MEMORY="${BULKHEAD_MEMORY_MB:-512}"
BULKHEAD_CPU="${BULKHEAD_CPU_PERCENT:-80}"
BULKHEAD_DURATION="${BULKHEAD_DURATION_MINUTES:-30}"

# Apply bulkhead limits to this shell
scripts/worktree-manager.sh bulkhead-limits "$BULKHEAD_MEMORY" "$BULKHEAD_CPU" "$BULKHEAD_DURATION"

# Per-worker resource limits
declare -A WORKER_LIMITS=(
  ["T3a"]="512 30"  # Backend: 512MB, 30min
  ["T3b"]="512 30"  # Frontend: 512MB, 30min
  ["T3c"]="512 30"  # Mobile: 512MB, 30min
  ["T4"]="768 45"   # DevOps: 768MB, 45min
  ["T5"]="512 30"   # QA: 512MB, 30min
  ["T6a"]="256 20"  # Security: 256MB, 20min
  ["T6b"]="256 20"  # Code Review: 256MB, 20min
)

# For each worktree, spawn a worker with watchdog
for task in T3a T3b T3c; do
  worktree_path=".worktrees/${task}"

  limits="${WORKER_LIMITS[$task]}"
  mem_mb=$(echo "$limits" | cut -d' ' -f1)
  duration_min=$(echo "$limits" | cut -d' ' -f2)

  # Create worker instruction file
  cat > "${worktree_path}/WORKER_INSTRUCTIONS.md" <<'INSTRUCTIONS'
  # Worker Instructions

  You are a parallel worker in the Forgewright pipeline.

  ## Your Contract
  view_file_outline CONTRACT.json in this directory.

  ## Your Skill
  view_file_outline the skill file specified in the contract.

  ## Rules
  1. ONLY read files listed in contract inputs
  2. ONLY write files in contract output directories
  3. DO NOT fabricate imports — verify every import path exists
  4. DO NOT create stub code — all code must be fully implemented
  5. Run tests before delivering — all must pass
  6. Write DELIVERY.json when complete

  ## Anti-Hallucination Checklist
  - [ ] All imports resolve to real files
  - [ ] All API endpoints match the OpenAPI spec
  - [ ] All database models match schema definitions
  - [ ] Type checker passes
  - [ ] No TODO/FIXME in production code
  - [ ] All tests pass
  INSTRUCTIONS

  # Dispatch worker with watchdog
  scripts/worktree-manager.sh bulkhead-watchdog "$task" "$worktree_path" "$mem_mb" "$duration_min" &
  echo "Worker ${task} dispatched"
done

# Wait for all workers to complete
wait
echo "All workers completed."
```

### Bulkhead Failure Containment

| Worker | Memory | Time | On OOM | On Timeout |
|--------|--------|------|--------|-----------|
| T3a (Backend) | 512MB | 30min | Kill + Skip | Kill + Skip |
| T3b (Frontend) | 512MB | 30min | Kill + Skip | Kill + Skip |
| T3c (Mobile) | 512MB | 30min | Kill + Skip | Kill + Skip |
| T4 (DevOps) | 768MB | 45min | Kill + Skip | Kill + Skip |
| T5 (QA) | 512MB | 30min | Kill + Skip | Kill + Skip |
| T6 (Review) | 256MB | 20min | Kill + Skip | Kill + Skip |

**Safety Guarantees:**
1. One worker OOM/timeout does NOT crash other workers
2. Main process remains stable
3. All bulkhead events logged to `.forgewright/bulkhead-log.md`

---

## Phase 5 — Result Collection & Two-Stage Review

### Stage 1: Spec Compliance Review

After all workers complete, run the Cursor `spec-reviewer` subagent for each task:

```bash
# For each task, generate reviewer contract from CONTRACT.json
for task in T3a T3b T3c; do
  # Extract acceptance criteria from worktree CONTRACT.json
  # Write to .forgewright/subagent-context/REVIEWER_CONTRACT_$task.md
done

# Invoke spec-reviewer for each task
Invoke: /spec-reviewer Review T3a backend services against CONTRACT.json
```

**spec-reviewer performs:**
1. Reads `PIPELINE_SUMMARY.md` for phase context
2. Reads `REVIEWER_CONTRACT.md` for scope and acceptance criteria
3. Reads worktree output files
4. Checks every acceptance criterion: **PASS / FAIL / PARTIAL**
5. Detects over-building (out of scope)
6. Detects under-building (missing requirements)
7. Writes report to `.forgewright/subagent-context/SPEC_REVIEW_[task-id].md`

**Retry Protocol:**
- If FAIL: feed issues back to worker → fix → re-submit → re-invoke (max 3)
- After 3 failures → escalate to CEO agent

### Stage 2: Code Quality Review

For each task that passed Stage 1, run quality-reviewer and security-auditor:

```bash
# Invoke quality-reviewer
Invoke: /quality-reviewer Assess T3a services code quality

# Invoke security-auditor (HARDEN phase only)
Invoke: /security-auditor Perform OWASP audit on T3a auth and payment code
```

**quality-reviewer performs:**
1. Reads `PIPELINE_SUMMARY.md` and `QUALITY_STANDARDS.md`
2. Reads SPEC_REVIEW_[task-id].md (confirms spec passed)
3. Assesses: naming, error handling, architecture conformance, test quality
4. Scores: Correctness, Readability, Maintainability, Testability, Performance
5. Writes report to `.forgewright/subagent-context/QUALITY_REVIEW_[task-id].md`

**security-auditor performs:**
1. Checks all 10 OWASP Top 10 categories
2. Checks MITRE CWE Top 25
3. Writes report to `.forgewright/subagent-context/SECURITY_AUDIT_[task-id].md`
4. **readonly: true** — never modifies any file

### Validation Report Template

```json
{
  "task_id": "T3a",
  "stage1_spec_review": "PASS",
  "stage2_quality_review": "PASS",
  "stage2_security_audit": "PASS",
  "overall": "PASS",
  "reports": {
    "spec": ".forgewright/subagent-context/SPEC_REVIEW_T3a.md",
    "quality": ".forgewright/subagent-context/QUALITY_REVIEW_T3a.md",
    "security": ".forgewright/subagent-context/SECURITY_AUDIT_T3a.md"
  },
  "validated_at": "2026-05-24T01:00:00Z",
  "summary": {
    "files_created": 15,
    "tests_written": 42,
    "test_pass_rate": 1.0,
    "issues_found": 0
  }
}
```

### Status Summary

```
  ━━━ Parallel Dispatch: Wave 1 Results ━━━━━━━━━━
  T3a (Backend):   ✓ PASS  — Spec ✓ Quality ✓ Security ✓ — 5 services, 42 tests
  T3b (Frontend):  ✓ PASS  — Spec ✓ Quality ✓ — 8 pages, 28 tests
  T3c (Mobile):    ⊘ SKIP  — not required

  Cursor Subagent Reports:
  • SPEC_REVIEW_T3a.md      — PASS
  • QUALITY_REVIEW_T3a.md   — Score 8.5/10
  • SECURITY_AUDIT_T3a.md   — SECURE
  • VERIFIER_REPORT.md       — PASS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Model Selection Strategy

Use the **least powerful model** that can handle each role:

| Task Complexity | Signals | Model |
|----------------|---------|-------|
| **Mechanical** | 1-2 files, clear spec, isolated function | Fast/cheap |
| **Integration** | Multi-file coordination, pattern matching | Standard |
| **Architecture** | Design judgment, broad codebase understanding | Most capable |

### Subagent Model Selection

| Subagent | Model | Why |
|----------|-------|-----|
| `explore` | built-in (fast) | 10 parallel searches |
| `verifier` | `fast` | Mechanical compliance checks |
| `spec-reviewer` | `fast` | Binary PASS/FAIL |
| `quality-reviewer` | `inherit` | Deep reasoning for quality |
| `security-auditor` | `inherit` | Deep reasoning for security |

**Cost-efficiency tips:**
- Use `fast` for any task with a clear checklist
- Use `inherit` only for tasks requiring design judgment
- `fast` model is ~10x cheaper and ~3-5x faster

---

## Implementer Status Protocol

Workers report one of four statuses in DELIVERY.json:

| Status | Meaning | Action |
|--------|---------|--------|
| **DONE** | Work completed successfully | Proceed to spec compliance review |
| **DONE_WITH_CONCERNS** | Completed but has doubts | view_file_outline concerns. If correctness → address first. |
| **NEEDS_CONTEXT** | Missing information | Provide missing context, re-dispatch |
| **BLOCKED** | Cannot complete | Assess blocker → provide context, more capable model, or break into pieces |

**Handling BLOCKED:**
1. **Context problem** → provide more context, re-dispatch
2. **More reasoning needed** → re-dispatch with more capable model
3. **Too large** → break into smaller pieces
4. **Plan is wrong** → escalate to CEO agent

---

## Phase 6 — Merge

Read `skills/_shared/protocols/merge-arbiter.md` and follow merge protocol:

```bash
# Step 1: Merge in dependency order
# infrastructure → backend → frontend → mobile
git worktree remove parallel/T3a-backend --force
git merge parallel/T3a-backend -m "feat: add backend services"

git worktree remove parallel/T3b-frontend --force
git merge parallel/T3b-frontend -m "feat: add frontend pages"

# Step 2: Run post-merge validation
npm run type-check
npm run test:integration

# Step 3: Run full integration test
npm run test:e2e

# Step 4: Log to merge-log.md
echo "## Merge Log" >> .forgewright/merge-log.md
echo "$(date): T3a, T3b merged successfully" >> .forgewright/merge-log.md

# Step 5: Clean up worktrees
scripts/worktree-manager.sh cleanup-all
```

### Merge Conflict Handling

| Conflict Type | Resolution |
|----------------|-----------|
| Auto-resolvable (formatting) | Apply auto-resolution per merge-arbiter.md |
| Code (same line) | Escalate to CEO agent |
| Schema (API contract) | Re-run API design phase |

---

## Phase 7 — Wave 2 (If Needed)

If there are Wave 2 tasks (e.g., T4 depends on T3a):

```bash
# T3a is now merged into main
git checkout main
git pull

# Create new worktrees for Wave 2
scripts/worktree-manager.sh create T4 parallel/T4-devops

# These worktrees see T3a's output (it's in main)
# Repeat Phases 2-6 for Wave 2
```

---

## Failure Handling

| Scenario | Action |
|----------|--------|
| Worker times out | Kill process, mark FAILED, retry with extended timeout |
| Worker DELIVERY missing | Mark FAILED, retry from checkpoint |
| Validation FAIL (High) | Feed VALIDATION.json back to worker, retry (max 3) |
| Validation FAIL (Critical) | Escalate to CEO agent immediately |
| Merge conflict (auto-resolvable) | Apply auto-resolution per merge-arbiter.md |
| Merge conflict (code) | Escalate to CEO agent |
| Integration test failure | Identify culprit branch, revert, re-dispatch |
| All retries exhausted | Fall back to sequential mode for failed task |

---

## Checkpoint & Resume

Each worker's state is preserved:

```
.worktrees/T3a/
├── CONTRACT.json            # Input contract (immutable)
├── WORKER_INSTRUCTIONS.md   # Dispatch instructions
├── DELIVERY.json            # Worker output (written by worker)
├── VALIDATION.json          # Validation results
├── worker-T3a.log           # Worker stdout/stderr
└── services/                # Actual work output
```

To resume a failed task:

```bash
scripts/worktree-manager.sh resume T3a
# Worker re-reads CONTRACT.json + VALIDATION.json feedback
# Fixes issues and regenerates DELIVERY.json
```

---

## Progress Tracking

Update `.forgewright/task.md`:

```markdown
## BUILD Phase (Parallel)
- [x] T3a: Backend Engineering — ✓ 5 services (Wave 1)
- [x] T3b: Frontend Engineering — ✓ 8 pages (Wave 1)
- [⊘] T3c: Mobile Engineering — skipped (not required)
- [x] T4: DevOps Containers — ✓ 5 Dockerfiles (Wave 2)
- [x] Merge — ✓ all branches merged, integration tests pass
```

---

## Security Notes

- Each worktree is isolated — workers cannot read each other's output
- Forbidden writes are enforced by validation, not filesystem permissions
- All worker processes run with the same user credentials
- No network isolation between workers
- **Secrets/credentials should NOT be in any contract input**

---

## Execution Checklist

### Pre-Execution
- [ ] view_file_outline .forgewright/settings.md (confirm parallel mode)
- [ ] view_file_outline phase dispatcher (identify tasks)
- [ ] Build execution plan (waves, dependencies)
- [ ] Check circuit breaker states

### Contract Generation
- [ ] Generate CONTRACT.json for each task
- [ ] Verify inputs/outputs/forbidden are correctly scoped
- [ ] Set constraints (memory, duration, test requirement)
- [ ] Define acceptance criteria

### Worktree Setup
- [ ] Create worktrees for Wave 1 tasks
- [ ] Copy CONTRACT.json to each worktree
- [ ] Copy readonly input files
- [ ] Copy skill SKILL.md to each worktree
- [ ] Verify worktree readiness

### Worker Dispatch
- [ ] Apply bulkhead limits
- [ ] Spawn workers with watchdog
- [ ] Monitor for bulkhead events
- [ ] Record circuit breaker results

### Result Collection
- [ ] Collect DELIVERY.json from all workers
- [ ] Generate REVIEWER_CONTRACT.md for each task
- [ ] Invoke spec-reviewer for Stage 1
- [ ] Handle FAIL → retry (max 3)

### Quality Review
- [ ] Invoke quality-reviewer for Stage 2
- [ ] Invoke security-auditor (HARDEN phase)
- [ ] Generate VALIDATION.json for each task
- [ ] Handle CRITICAL/High → escalate

### Merge
- [ ] Merge in dependency order
- [ ] Run post-merge validation
- [ ] Run integration tests
- [ ] Log to merge-log.md
- [ ] Clean up worktrees

### Post-Execution
- [ ] Update task.md with results
- [ ] Clean up temporary files
- [ ] Archive logs
```
