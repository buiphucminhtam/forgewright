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

Manages the parallel execution of independent tasks in the Forgewright pipeline. Uses **git worktrees** for process isolation, **Task Contracts** for explicit input/output boundaries, and **automated validation** to prevent hallucination and ensure clean architecture.

**Max concurrent workers:** 4 (configurable via `MAX_WORKERS` env var)

> **⚠️ Compatibility Note:** Parallel dispatch requires **Gemini CLI** with the ability to spawn multiple concurrent processes. In **Antigravity**, **Cursor**, **Claude Desktop**, or other single-session AI clients, the pipeline runs **sequentially** — this is by design. Sequential execution ensures deterministic output and is sufficient for most real-world tasks. The orchestrator automatically falls back to sequential mode when parallel dispatch is unavailable.

## When to Use

The production-grade orchestrator invokes this skill when:
1. User selected **Parallel** execution strategy
2. The current phase has **2+ independent tasks** (e.g., BUILD: T3a + T3b + T3c + T4)
3. Execution mode is set to `parallel` in `.forgewright/settings.md`

## Parallel Groups

Based on the Forgewright task dependency graph, these groups can run in parallel:

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
1. Read .forgewright/settings.md
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
  outputs: workspace only (.forgewright/security-engineer/)
  forbidden: ALL source code (read-only audit)

T6b (Code Review):
  inputs: ALL implementation + architecture (read-only)
  outputs: workspace only (.forgewright/code-reviewer/)
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

### Phase 3.5 — Context Isolation (DeerFlow Pattern)

> Inspired by DeerFlow 2.0's sub-agent context isolation. Each worker operates in a sealed context scope to prevent information leakage and reduce token overhead.

```
Context Isolation Rules:

  EACH WORKER RECEIVES (scoped context):
    ✅ Its CONTRACT.json (task-specific inputs/outputs/constraints)
    ✅ Its SKILL.md (skill instructions only)
    ✅ Shared API contracts (api/, schemas/ — read-only)
    ✅ .forgewright/code-conventions.md (pattern consistency)
    ✅ Compressed pipeline summary (from Summarization middleware ⑤)
       → Max 2K tokens, covering completed phase decisions only

  EACH WORKER DOES NOT RECEIVE:
    ❌ Other workers' DELIVERY.json or work output
    ❌ Full session-log.json history
    ❌ Memory entries unrelated to their contracted scope
    ❌ Quality reports from other skills
    ❌ Full conversation history (replaced by compressed summary)
    ❌ Other skills' SKILL.md files

  LEAD AGENT (CEO) RECEIVES after merge:
    ✅ All workers' DELIVERY.json (synthesized)
    ✅ All VALIDATION.json reports
    ✅ Merge conflict log (if any)
    ✅ Full pipeline context (not compressed)

  Context Size Budget per Worker:
    CONTRACT.json:          ~2K tokens
    SKILL.md:               ~5K tokens
    Shared contracts:       ~3K tokens
    Code conventions:       ~1K tokens
    Pipeline summary:       ~2K tokens
    ─────────────────────────────
    Total injected context: ~13K tokens (vs ~70K without isolation)
```

Guardrail middleware (④) enforces context isolation at the tool level:
- Workers attempting to read files outside their contract inputs → WARN
- Workers attempting to write outside their contract outputs → DENY

### Phase 4 — Worker Dispatch

Spawn Gemini CLI instances for each worktree. Each worker runs in its own shell process:

```bash
# For each worktree, spawn a Gemini CLI worker in the background
for task in T3a T3b T3c; do
  worktree_path=".worktrees/${task}"

  # Create worker instruction file
  cat > "${worktree_path}/WORKER_INSTRUCTIONS.md" <<INSTRUCTIONS
  # Worker Instructions for ${task}

  You are a parallel worker in the Forgewright pipeline.

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

### Phase 5 — Result Collection & Two-Stage Review

> **Inspired by [Superpowers](https://github.com/obra/superpowers) two-stage review methodology**

After all workers complete, perform a **two-stage review** for each task:

**Stage 1: Spec Compliance Review (MUST pass before Stage 2)**

```
For each task in the wave:
  1. Read DELIVERY.json from worktree
  2. If missing → mark as FAILED
  3. Dispatch spec compliance reviewer subagent:
     - Read CONTRACT.json acceptance criteria
     - Compare every criterion against the actual delivery
     - For each criterion: PASS / FAIL / PARTIAL
     - Check for over-building (features not in spec → flag for removal)
     - Check for under-building (missing requirements)
  4. If spec compliance FAILS:
     - Feed issues back to worker
     - Worker fixes → re-submit DELIVERY.json
     - Re-review (max 3 iterations)
     - After 3 failures → escalate to CEO agent
  5. If spec compliance PASSES → proceed to Stage 2
```

**Stage 2: Code Quality Review (ONLY after spec compliance passes)**

```
For each task that passed Stage 1:
  1. Run: scripts/worktree-manager.sh validate <task_id>
  2. Read skills/_shared/protocols/task-validator.md and execute full validation
  3. Dispatch code quality reviewer subagent:
     - Check code structure, naming, error handling
     - Check test coverage and test quality
     - Check anti-hallucination checklist
  4. If quality review has issues:
     - Worker fixes → re-review (max 3 iterations)
  5. Write VALIDATION.json in the worktree
```

**Why this order matters:**
- Reviewing code quality on code that doesn't match the spec = wasted effort
- Spec compliance catches over/under-building early (cheaper to fix)
- Code quality review is more valuable after scope is confirmed correct

**Status summary:**
```
  ━━━ Parallel Dispatch: Wave 1 Results ━━━━━━━━━━
  T3a (Backend):   ✓ PASS  — Spec ✓ Quality ✓ — 5 services, 42 tests
  T3b (Frontend):  ✓ PASS  — Spec ✓ Quality ✓ — 8 pages, 28 tests
  T3c (Mobile):    ⊘ SKIP  — not required
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Model Selection Strategy

> **Inspired by [Superpowers](https://github.com/obra/superpowers) model selection methodology**

Use the least powerful model that can handle each role to conserve cost and increase speed:

| Task Complexity | Signals | Recommended Model |
|----------------|---------|-------------------|
| **Mechanical** | 1-2 files, clear spec, isolated function | Fast/cheap model (e.g., Flash) |
| **Integration** | Multi-file coordination, pattern matching | Standard model |
| **Architecture** | Design judgment, broad codebase understanding, review tasks | Most capable model |

**Complexity signals:**
- Touches 1-2 files with a complete spec → cheap model
- Touches multiple files with integration concerns → standard model
- Requires design judgment or broad codebase understanding → most capable model

**Apply to subagent roles:**
- Implementer subagents on mechanical tasks → cheap model
- Spec compliance reviewer → standard model (needs judgment)
- Code quality reviewer → most capable model (needs broad understanding)

### Implementer Status Protocol

> **Inspired by [Superpowers](https://github.com/obra/superpowers) implementer status handling**

Workers report one of four statuses in DELIVERY.json. Handle each appropriately:

| Status | Meaning | Action |
|--------|---------|--------|
| **DONE** | Work completed successfully | Proceed to spec compliance review |
| **DONE_WITH_CONCERNS** | Completed but implementer has doubts | Read concerns before proceeding. If about correctness/scope → address first. If observations ("file is large") → note and proceed. |
| **NEEDS_CONTEXT** | Missing information not in CONTRACT.json | Provide missing context. Re-dispatch with same model. |
| **BLOCKED** | Cannot complete the task | Assess the blocker (see below) |

**Handling BLOCKED status:**
1. If it's a **context problem** → provide more context, re-dispatch with same model
2. If the task requires **more reasoning** → re-dispatch with a more capable model
3. If the task is **too large** → break into smaller pieces and re-dispatch
4. If the **plan itself is wrong** → escalate to CEO agent

**Never** ignore an escalation or force the same model to retry without changes. If the worker said it's stuck, something needs to change.

### Phase 6 — Merge

Read `skills/_shared/protocols/merge-arbiter.md` and follow merge protocol:

```
1. Merge in dependency order (infrastructure → backend → frontend → mobile)
2. Run post-merge validation after each merge
3. Run full integration test after all merges
4. Log to .forgewright/merge-log.md
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

Update `.forgewright/task.md` with parallel status:

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
