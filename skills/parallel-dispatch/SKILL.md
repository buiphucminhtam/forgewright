---
name: parallel-dispatch
description: >
  Orchestrates parallel task execution using git worktrees. Analyzes
  the task dependency graph, generates Task Contracts for each worker,
  spawns isolated Gemini CLI instances in separate worktrees, validates
  outputs, and merges results back into the main branch. Used by the
  production-grade orchestrator when parallel mode is selected.
---

# Parallel Dispatch Orchestrator

## Overview

Manages the parallel execution of independent tasks in the Forge17 pipeline. Uses **git worktrees** for process isolation, **Task Contracts** for explicit input/output boundaries, and **automated validation** to prevent hallucination and ensure clean architecture.

**Max concurrent workers:** 4 (configurable via `MAX_WORKERS` env var)

## When to Use

The production-grade orchestrator invokes this skill when:
1. User selected **Parallel** execution strategy
2. The current phase has **2+ independent tasks** (e.g., BUILD: T3a + T3b + T3c + T4)
3. Execution mode is set to `parallel` in `Antigravity-Production-Grade-Suite/.orchestrator/settings.md`

## Parallel Groups

Based on the Forge17 task dependency graph, these groups can run in parallel:

```
┌─────────────────────────────────────────────────────┐
│ Group A — BUILD Phase (after Gate 2)                │
│   T3a: software-engineer  (services/, libs/)        │
│   T3b: frontend-engineer  (frontend/)               │
│   T3c: mobile-engineer    (mobile/)     [conditional]│
│   T4:  devops             (Dockerfiles) [after T3a] │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Group B — HARDEN Phase (after BUILD)                │
│   T5:  qa-engineer        (tests/)                  │
│   T6a: security-engineer  (workspace only)          │
│   T6b: code-reviewer      (workspace only)          │
└─────────────────────────────────────────────────────┘
```

**Note:** T4 (DevOps) depends on T3a (Backend) for service discovery, so it starts after T3a or runs in a second wave if group size exceeds MAX_WORKERS.

## Execution Flow

### Phase 1 — Dependency Analysis

```
1. Read Antigravity-Production-Grade-Suite/.orchestrator/settings.md
   - Confirm execution: parallel
   - Read engagement mode

2. Read the current phase dispatcher (e.g., phases/build.md)
   - Identify tasks in this phase
   - Check .production-grade.yaml for skip conditions
   - Apply conditional rules (skip frontend if features.frontend: false, etc.)

3. Build execution plan:
   - Wave 1: Tasks with NO inter-dependencies (T3a, T3b, T3c)
   - Wave 2: Tasks depending on Wave 1 output (T4 depends on T3a)
   - If total tasks ≤ MAX_WORKERS: single wave
   - If Code Intelligence is available (code_intelligence.indexed == true):
     use community clusters to refine task boundaries — each functional
     community maps to a potential worktree scope, improving isolation
```

### Phase 2 — Contract Generation

For each task in the execution plan, generate a Task Contract:

```
Read skills/_shared/protocols/task-contract.md for the contract format.

For each task:
1. Determine skill from task ID
2. Determine input files from Context Bridging table (in production-grade/SKILL.md)
3. Determine output directories from the same table
4. Set forbidden writes = all OTHER workers' output directories
5. Set acceptance criteria from skill requirements
6. Write CONTRACT.json

Contract templates by task:

T3a (Backend):
  inputs: api/, schemas/, docs/architecture/, BRD, protocols
  outputs: services/, libs/shared/
  forbidden: frontend/, mobile/, infrastructure/
  tests: must pass

T3b (Frontend):
  inputs: api/, BRD, design tokens, protocols
  outputs: frontend/
  forbidden: services/, mobile/, infrastructure/
  tests: must pass

T3c (Mobile):
  inputs: api/, BRD, design tokens, protocols
  outputs: mobile/
  forbidden: services/, frontend/, infrastructure/
  tests: must pass

T4 (DevOps):
  inputs: services/, docs/architecture/, .production-grade.yaml
  outputs: Dockerfile*, docker-compose.yml
  forbidden: services/*/src/, frontend/src/, mobile/src/
  tests: docker build must succeed

T5 (QA):
  inputs: services/, frontend/, api/, protocols
  outputs: tests/
  forbidden: services/*/src/, frontend/src/
  tests: all tests must execute

T6a (Security):
  inputs: ALL implementation code (read-only)
  outputs: workspace only (Antigravity-Production-Grade-Suite/security-engineer/)
  forbidden: ALL source code (read-only audit)

T6b (Code Review):
  inputs: ALL implementation + architecture (read-only)
  outputs: workspace only (Antigravity-Production-Grade-Suite/code-reviewer/)
  forbidden: ALL source code (read-only review)
```

### Phase 3 — Worktree Setup

```
For each task in current wave:
  1. Run: scripts/worktree-manager.sh create <task_id> parallel/<task_id>-<name>
  2. Copy CONTRACT.json into worktree root
  3. Copy readonly input files into worktree (from contract.inputs)
  4. Copy skill SKILL.md into worktree
  5. Verify worktree is ready

Example:
  scripts/worktree-manager.sh create T3a parallel/T3a-backend
  scripts/worktree-manager.sh create T3b parallel/T3b-frontend
  scripts/worktree-manager.sh create T3c parallel/T3c-mobile
```

### Phase 4 — Worker Dispatch

Spawn Gemini CLI instances for each worktree. Each worker runs in its own shell process:

```bash
# For each worktree, spawn a Gemini CLI worker in the background
for task in T3a T3b T3c; do
  worktree_path=".worktrees/${task}"

  # Create worker instruction file
  cat > "${worktree_path}/WORKER_INSTRUCTIONS.md" <<INSTRUCTIONS
  # Worker Instructions for ${task}

  You are a parallel worker in the Forge17 pipeline.

  ## Your Contract
  Read CONTRACT.json in this directory. It defines:
  - What files you CAN read (inputs)
  - What directories you CAN write to (outputs)
  - What you cannot do (constraints)
  - What you need to deliver (acceptance criteria)

  ## Your Skill
  Read the skill file specified in the contract. Follow its instructions exactly.

  ## Rules
  1. ONLY read files listed in contract inputs
  2. ONLY write files in contract output directories
  3. DO NOT fabricate imports — verify every import path exists
  4. DO NOT create stub code — all code must be fully implemented
  5. Run tests before delivering — all must pass
  6. Write DELIVERY.json when complete (format in contract protocol)

  ## Anti-Hallucination Checklist (run before delivering)
  - [ ] All imports resolve to real files
  - [ ] All API endpoints match the OpenAPI spec
  - [ ] All database models match schema definitions
  - [ ] Type checker passes (tsc/mypy/go vet)
  - [ ] No TODO/FIXME/stub comments in production code
  - [ ] All tests pass

  ## When Done
  Write DELIVERY.json with your results. Do not attempt to merge.
  INSTRUCTIONS

  # Dispatch worker (background process)
  (
    cd "${worktree_path}"
    gemini -p "Read WORKER_INSTRUCTIONS.md and CONTRACT.json, then execute the task following the skill instructions. Work autonomously until complete. Write DELIVERY.json when done." \
      2>&1 | tee "worker-${task}.log"
  ) &

  echo "Worker ${task} dispatched (PID: $!)"
done

# Wait for all workers to complete
wait
echo "All workers completed."
```

**Alternative dispatch (for environments without `gemini` CLI):**

The CEO agent can also dispatch by reading each skill sequentially in separate Antigravity sessions, using the worktree paths as working directories.

### Phase 5 — Result Collection & Validation

After all workers complete:

```
For each task in the wave:
  1. Read DELIVERY.json from worktree
  2. If missing → mark as FAILED
  3. Run: scripts/worktree-manager.sh validate <task_id>
  4. Read skills/_shared/protocols/task-validator.md and execute full validation pipeline
  5. Write VALIDATION.json in the worktree

Status summary:
  ━━━ Parallel Dispatch: Wave 1 Results ━━━━━━━━━━
  T3a (Backend):   ✓ PASS  — 5 services, 42 tests passed
  T3b (Frontend):  ✓ PASS  — 8 pages, 28 tests passed
  T3c (Mobile):    ⊘ SKIP  — not required
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 6 — Merge

Read `skills/_shared/protocols/merge-arbiter.md` and follow merge protocol:

```
1. Merge in dependency order (infrastructure → backend → frontend → mobile)
2. Run post-merge validation after each merge
3. Run full integration test after all merges
4. Log to Antigravity-Production-Grade-Suite/.orchestrator/merge-log.md
5. Clean up worktrees: scripts/worktree-manager.sh cleanup-all
```

### Phase 7 — Wave 2 (if needed)

If there are Wave 2 tasks (e.g., T4 depends on T3a):

```
1. T3a is now merged into main
2. Create new worktrees for Wave 2 tasks
3. These worktrees see T3a's output (it's in main)
4. Repeat Phases 2-6 for Wave 2
```

## Failure Handling

| Scenario | Action |
|----------|--------|
| Worker times out | Kill process, mark FAILED, retry with extended timeout |
| Worker DELIVERY missing | Mark FAILED, retry from checkpoint (WORKER_INSTRUCTIONS + failed context) |
| Validation FAIL (High) | Feed VALIDATION.json back to worker, retry (max 3) |
| Validation FAIL (Critical) | Escalate to CEO agent immediately |
| Merge conflict (auto-resolvable) | Apply auto-resolution per merge-arbiter.md |
| Merge conflict (code) | Escalate to CEO agent |
| Integration test failure | Identify culprit branch, revert, re-dispatch |
| All retries exhausted | Fall back to sequential mode for the failed task |

## Checkpoint & Resume

Each worker's state is preserved in its worktree:

```
.worktrees/T3a/
├── CONTRACT.json            # Input contract (immutable)
├── WORKER_INSTRUCTIONS.md   # Dispatch instructions
├── DELIVERY.json            # Worker output (written by worker)
├── VALIDATION.json          # Validation results (written by validator)
├── worker-T3a.log           # Worker stdout/stderr
└── services/                # Actual work output
```

To resume a failed task:
```bash
scripts/worktree-manager.sh resume T3a
# Worker re-reads CONTRACT.json + VALIDATION.json feedback
# Fixes issues and regenerates DELIVERY.json
```

## Progress Tracking

Update `Antigravity-Production-Grade-Suite/.orchestrator/task.md` with parallel status:

```markdown
## BUILD Phase (Parallel)
- [x] T3a: Backend Engineering — ✓ 5 services (Wave 1)
- [x] T3b: Frontend Engineering — ✓ 8 pages (Wave 1)
- [⊘] T3c: Mobile Engineering — skipped (not required)
- [x] T4: DevOps Containers — ✓ 5 Dockerfiles (Wave 2)
- [x] Merge — ✓ all branches merged, integration tests pass
```

## Security Notes

- Each worktree is isolated — workers cannot read each other's output
- Forbidden writes are enforced by validation, not filesystem permissions
- All worker processes run with the same user credentials
- No network isolation between workers (they may all need package registries)
- Secrets/credentials should NOT be in any contract input
