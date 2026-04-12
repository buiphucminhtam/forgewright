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
    ✅ All subagent review reports from .forgewright/subagent-context/ (SPEC_REVIEW_*.md, QUALITY_REVIEW_*.md, SECURITY_AUDIT_*.md)
    ✅ VERIFIER_REPORT.md — overall delivery confirmation
    ✅ Merge conflict log (if any)
    ✅ Full pipeline context (not compressed)

  CURSOR SUBAGENT CONTEXT (for reviewers — .forgewright/subagent-context/):
    ✅ PIPELINE_SUMMARY.md     — project + phase + architecture context
    ✅ WORKER_INSTRUCTIONS_TEMPLATE.md — worker boundary rules
    ✅ REVIEWER_CONTRACT_TEMPLATE.md  — reviewer contract template  
    ✅ SECURITY_STANDARDS.md    — OWASP checklist + severity guide
    ✅ VERIFIER_REPORT.md       — verifier findings (read before quality review)

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

### Phase 4 — Circuit Breaker Check

Before dispatching workers, check circuit breaker state for each worker type:

```bash
# Load circuit breaker config
CIRCUIT_FILE="${CIRCUIT_FILE:-.forgewright/circuits.json}"

# Source circuit breaker functions
source "$(dirname "$0")/../_shared/scripts/circuit-breaker.sh" 2>/dev/null || true

# Check circuit state for each worker
for task in T3a T3b T3c T4 T5 T6a T6b; do
  circuit_key="${task,,}"  # lowercase

  # Check if circuit allows request
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

**Circuit Breaker per Worker Type:**

| Worker | Circuit Key | Default Config |
|--------|-------------|----------------|
| T3a (Backend) | `t3a` | failure_threshold: 3 |
| T3b (Frontend) | `t3b` | failure_threshold: 3 |
| T3c (Mobile) | `t3c` | failure_threshold: 3 |
| T4 (DevOps) | `t4` | failure_threshold: 3 |
| T5 (QA) | `t5` | failure_threshold: 3 |
| T6a (Security) | `t6a` | failure_threshold: 3 |
| T6b (Code Review) | `t6b` | failure_threshold: 3 |

**State Tracking:**

```json
{
  "t3a": { "state": "CLOSED", "failure_count": 0, "last_failure": null },
  "t3b": { "state": "OPEN", "failure_count": 5, "last_failure": 1712912400 },
  "t4": { "state": "HALF_OPEN", "failure_count": 3, "last_failure": 1712912400 }
}
```

**Recording Results:**

After each worker completes, record the outcome:

```bash
# On worker success
record_success "$circuit_key"

# On worker failure
record_failure "$circuit_key" 3  # 3 = threshold
```

### Phase 4.1 — Worker Dispatch

Spawn Gemini CLI instances for each worktree. Each worker runs in its own shell process with bulkhead limits:

```bash
# Load bulkhead config from .production-grade.yaml
BULKHEAD_MEMORY="${BULKHEAD_MEMORY_MB:-512}"
BULKHEAD_CPU="${BULKHEAD_CPU_PERCENT:-80}"
BULKHEAD_DURATION="${BULKHEAD_DURATION_MINUTES:-30}"

# Apply bulkhead limits to this shell
# NOTE: bulkhead-limits expects: <memory_mb> <cpu_percent> <duration_min>
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

  # Get worker-specific limits
  limits="${WORKER_LIMITS[$task]}"
  mem_mb=$(echo "$limits" | cut -d' ' -f1)
  duration_min=$(echo "$limits" | cut -d' ' -f2)

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

  # Dispatch worker with watchdog
  scripts/worktree-manager.sh bulkhead-watchdog "$task" "$worktree_path" "$mem_mb" "$duration_min" &
  echo "Worker ${task} dispatched with bulkhead (mem=${mem_mb}MB, time=${duration_min}m)"
done

# Wait for all workers to complete
wait
echo "All workers completed."
```

**Bulkhead Failure Containment:**

| Worker | Memory | Time | On OOM | On Timeout |
|--------|--------|------|--------|-----------|
| T3a (Backend) | 512MB | 30min | Kill + Skip | Kill + Skip |
| T3b (Frontend) | 512MB | 30min | Kill + Skip | Kill + Skip |
| T3c (Mobile) | 512MB | 30min | Kill + Skip | Kill + Skip |
| T4 (DevOps) | 768MB | 45min | Kill + Skip | Kill + Skip |
| T5 (QA) | 512MB | 30min | Kill + Skip | Kill + Skip |
| T6 (Review) | 256MB | 20min | Kill + Skip | Kill + Skip |

**Key Safety Guarantees:**
1. One worker OOM/timeout does NOT crash other workers
2. Main process remains stable
3. All bulkhead events logged to `.forgewright/bulkhead-log.md`
4. Workers can be monitored via `scripts/worktree-manager.sh bulkhead-status`

**Alternative dispatch (for environments without `gemini` CLI):**

The CEO agent can also dispatch by reading each skill sequentially in separate Antigravity sessions, using the worktree paths as working directories.

### Phase 5 — Result Collection & Two-Stage Review

> **Inspired by [Superpowers](https://github.com/obra/superpowers) two-stage review methodology**

After all workers complete, perform a **two-stage review** for each task:

**Stage 1: Spec Compliance Review — Cursor Subagent (MUST pass before Stage 2)**

After all workers in the wave complete, run the Cursor `spec-reviewer` subagent for each task:

```
Invoke: /spec-reviewer Review [task-id] worktree against CONTRACT.json
Example: /spec-reviewer Review T3a backend services against CONTRACT.json
Example: /spec-reviewer Review T3b frontend pages against CONTRACT.json
```

**Before invoking — generate REVIEWER_CONTRACT.md:**

```bash
# For each task, generate reviewer contract from CONTRACT.json
for task in T3a T3b T3c; do
  # Extract acceptance criteria from worktree CONTRACT.json
  # Write to .forgewright/subagent-context/REVIEWER_CONTRACT_$task.md
done
```

**The spec-reviewer subagent performs:**
1. Reads `PIPELINE_SUMMARY.md` for phase context
2. Reads `REVIEWER_CONTRACT.md` for scope and acceptance criteria
3. Reads worktree output files
4. Checks every acceptance criterion: PASS / FAIL / PARTIAL
5. Detects over-building (out of scope features)
6. Detects under-building (missing requirements)
7. Writes report to `.forgewright/subagent-context/SPEC_REVIEW_[task-id].md`
8. Appends one-line status to `.forgewright/subagent-context/REVIEW_STATUS.md`

**Retry protocol:**
- If spec compliance FAILS: feed issues back to worker → worker fixes → re-submit → re-invoke spec-reviewer (max 3 iterations)
- After 3 failures → escalate to CEO agent with SPEC_REPORT attached

**Escalation triggers:**
- Worker claims DONE but DELIVERY.json missing
- Worker touched forbidden paths
- Acceptance criteria cannot be verified (required file missing)

If ALL spec reviews PASS → proceed to Stage 2.

**Stage 2: Code Quality Review — Cursor Subagent (ONLY after spec compliance passes)**

For each task that passed Stage 1, run Cursor `quality-reviewer` and `security-auditor` subagents:

```
Invoke: /quality-reviewer Assess code quality for [task-id]
Example: /quality-reviewer Assess T3a services code quality
Example: /quality-reviewer Assess T3b frontend code quality
```

**The quality-reviewer subagent performs:**
1. Reads `PIPELINE_SUMMARY.md` for architecture context
2. Reads `QUALITY_STANDARDS.md` if exists
3. Reads SPEC_REVIEW_[task-id].md (confirms spec passed)
4. Reads REVIEWER_CONTRACT.md for scope
5. Assesses: naming, error handling, architecture conformance, test quality
6. Scores per file: Correctness, Readability, Maintainability, Testability, Performance
7. Runs anti-hallucination checks: imports resolve, API calls match spec, no invented endpoints
8. Writes report to `.forgewright/subagent-context/QUALITY_REVIEW_[task-id].md`

**For HARDEN phase — run security-auditor additionally:**

```
Invoke: /security-auditor Perform read-only OWASP audit on [task-id] [scope]
Example: /security-auditor Perform OWASP audit on T3a auth and payment code
```

**The security-auditor subagent performs:**
1. Reads `PIPELINE_SUMMARY.md` and `SECURITY_STANDARDS.md`
2. Checks all 10 OWASP Top 10 categories
3. Checks MITRE CWE Top 25
4. Writes report to `.forgewright/subagent-context/SECURITY_AUDIT_[task-id].md`
5. **readonly: true** — never modifies any file

**Retry protocol:**
- If quality review FAIL (score < 6/10): worker fixes → re-review (max 3 iterations)
- If security-auditor finds CRITICAL/HIGH: escalate to CEO agent immediately
- After 3 failures → escalate to CEO agent

**Write consolidated VALIDATION.json:**

```json
{
  "task_id": "[task-id]",
  "stage1_spec_review": "PASS/FAIL",
  "stage2_quality_review": "PASS/FAIL",
  "stage2_security_audit": "PASS/FAIL (if run)",
  "overall": "PASS/FAIL/PARTIAL",
  "reports": {
    "spec": ".forgewright/subagent-context/SPEC_REVIEW_[task-id].md",
    "quality": ".forgewright/subagent-context/QUALITY_REVIEW_[task-id].md",
    "security": ".forgewright/subagent-context/SECURITY_AUDIT_[task-id].md"
  },
  "validated_at": "[ISO timestamp]"
}
```

**Why this order matters:**
- Reviewing code quality on code that doesn't match the spec = wasted effort
- Spec compliance catches over/under-building early (cheaper to fix)
- Code quality review is more valuable after scope is confirmed correct

**Status summary (updated with Cursor subagent workflow):**
```
  ━━━ Parallel Dispatch: Wave 1 Results ━━━━━━━━━━
  T3a (Backend):   ✓ PASS  — Spec ✓ Quality ✓ Security ✓ — 5 services, 42 tests
  T3b (Frontend):  ✓ PASS  — Spec ✓ Quality ✓ — 8 pages, 28 tests
  T3c (Mobile):    ⊘ SKIP  — not required

  Cursor Subagent Reports:
  • SPEC_REVIEW_T3a.md      — spec-reviewer (fast model): PASS
  • QUALITY_REVIEW_T3a.md   — quality-reviewer (inherit): Score 8.5/10
  • SECURITY_AUDIT_T3a.md   — security-auditor (inherit): SECURE
  • VERIFIER_REPORT.md       — verifier (fast model): PASS
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

**Apply to Cursor subagent roles (model field in .cursor/agents/):**

| Subagent | model | Why |
|----------|-------|-----|
| `explore` | built-in (fast) | 10 parallel searches, automatic |
| `verifier` | `fast` | Mechanical compliance checks, no judgment needed |
| `spec-reviewer` | `fast` | Binary PASS/FAIL against spec, no deep reasoning needed |
| `quality-reviewer` | `inherit` | Needs deep reasoning for architecture quality assessment |
| `security-auditor` | `inherit` | Needs deep reasoning for OWASP vulnerability assessment |

**Cost-efficiency tips:**
- Use `fast` for any task with a clear checklist (verifier, spec-reviewer)
- Use `inherit` only for tasks requiring design judgment or broad understanding
- The `fast` model is ~10x cheaper and ~3-5x faster than standard models
- For HIGH risk projects, consider using `inherit` for spec-reviewer too (worth the cost)

**For implementer workers (git worktree):**
- Implementer workers use `inherit` (full reasoning required for implementation)
- spec-reviewer using `fast` on a mechanical task: ~2K tokens, <$0.01
- quality-reviewer using `inherit` on a complex service: ~15K tokens, ~$0.05

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
