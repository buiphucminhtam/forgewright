---
name: parallel-dispatch
description: "Run multiple AI agents simultaneously for parallel task execution using git worktrees. Use when the user requests concurrent agent execution, parallel task distributions, or multi-worker git worktree tasks."
version: 1.0.0
---

# Parallel Dispatch (LITE)

## SOLVE Step 2: GROUND (Parallel Dispatch Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Git is installed and supports worktrees | `git worktree list` | List of active git worktrees and branches | |
| Parallel worker configuration or script exists | `find scripts/ -name "*worktree*" -o -name "*dispatch*"` | Locates the worktree dispatch scripts | |
| Project stack and baseline profile are onboarded | `cat .forgewright/project-profile.json` | Project profile JSON with tech stack | |
| Active token budget and cost control settings are configured | `cat .forgewright/budget.yaml` | Displays configured parallel execution budgets and limits | |

## SOLVE Step 3: DECOMPOSE (Parallel Dispatch Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. PREPARE | Create target git worktrees for each parallel worker branch | Verify the target worktree directories do not conflict with active session branches.
2. DISPATCH | Spin up parallel AI agents across isolated worktree instances | Monitor concurrent agent processes and log exits or resource allocations to prevent deadlocks.
3. CONSOLIDATE | Merge completed worktree branches and resolve conflicts back to main | Ensure all changes are safely integrated and reviewed through testing pipelines prior to committing.
4. SYNC | Propagate parallel run metrics and task outcomes to Shared Obsidian Vault | Execute the post-skill sync script to generate unified markdown reports and symlink to Obsidian.

## Common Mistakes Checklist
- **Worktree path conflicts**: Creating parallel worktree directories at overlapping paths or utilizing dirty uncommitted branch states as clean baseline checkouts.
- **Concurrent SQLite file lockups**: Running multiple active workers against a single shared `.forgewright/` database without enabling WAL mode, leading to SQLITE_BUSY locking failures.
- **API rate limit exhaustion**: Dispatching multiple concurrent workers with high model budgets simultaneously without configuring rate-limit mitigations or using high-throughput endpoints (e.g., MiniMax).
- **Orphaned worktrees**: Leaving background worktree checkouts active on local disks after tasks are finished without cleanups (e.g., neglecting `git worktree prune`).
- **Ignoring gitnexus impact risk**: Skipping the mandatory impact analysis on shared repository dependencies, causing merged changes from separate parallel workers to conflict or break on main.

## Worked Example

### Step 1: Check active git worktrees
```bash
git worktree list
```
Output:
```
/workspace/forgewright   096c695 [main]
```

### Step 2: Dispatch two concurrent workers for isolated feature tasks
```bash
# Create two isolated git worktrees for parallel agents
git worktree add ../forgewright-worker-1 -b feature/auth-worker
git worktree add ../forgewright-worker-2 -b feature/db-worker
```
Output:
```
Preparing worktree (new branch 'feature/auth-worker')
HEAD is now at 096c695 feat(gemini): upgrade orchestrator rules
Preparing worktree (new branch 'feature/db-worker')
HEAD is now at 096c695 feat(gemini): upgrade orchestrator rules
```

### Step 3: Run the parallel dispatch execution harness
```bash
# Execute concurrent worker tasks (simulated parallel agent harness execution)
python3 scripts/parallel-dispatch-runner.py --worktrees "../forgewright-worker-1,../forgewright-worker-2"
```
Output:
```
[INFO] Dispatching 2 concurrent workers...
[WORKER-1] Running task: 'implement auth validation'
[WORKER-2] Running task: 'optimize sqlite cache'
[SUCCESS] Worker-1 completed successfully.
[SUCCESS] Worker-2 completed successfully.
```

### Step 4: Merge results and prune outstanding worktrees safely
```bash
# Clean up and prune isolated worktree directories
git worktree remove ../forgewright-worker-1
git worktree remove ../forgewright-worker-2
git worktree prune
```
Output:
```
[SUCCESS] Worktree directories pruned. Workspace returned to single main branch.
```
