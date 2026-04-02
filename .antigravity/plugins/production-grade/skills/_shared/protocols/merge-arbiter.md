# Merge Arbiter Protocol

**Manages the merge of validated parallel worker branches into the main branch. Handles conflicts, integration testing, and rollback.**

## Merge Order

Merge branches in dependency order to minimize conflicts:

```
Priority 1 (Infrastructure):
  T4 (DevOps containers) — Dockerfiles, docker-compose.yml

Priority 2 (Backend):
  T3a (Backend services) — services/, libs/shared/

Priority 3 (Frontend):
  T3b (Frontend) — frontend/

Priority 4 (Mobile):
  T3c (Mobile) — mobile/

HARDEN Phase (all read-only findings, minimal conflicts):
  T5, T6a, T6b — workspace artifacts only
```

## Merge Procedure

For each validated branch, in order:

### Step 1 — Pre-Merge Check

```bash
# Ensure branch is up to date with main
git checkout main
git merge --no-commit --no-ff parallel/<task_id>-<name>

# Check for conflicts
if [ $? -ne 0 ]; then
  # Conflicts detected — go to conflict resolution
  git merge --abort
fi
```

### Step 2 — Conflict Resolution

| File Pattern | Auto-Resolve Strategy |
|-------------|----------------------|
| `package.json` | Merge `dependencies` and `devDependencies` objects. Union of both. |
| `go.mod` | Append unique `require` entries. Run `go mod tidy`. |
| `requirements.txt` | Union of lines. Run `pip-compile` if using pip-tools. |
| `docker-compose.yml` | Merge `services` blocks. Each worker owns its own service. |
| `.env.example` | Union of environment variables. |
| `tsconfig.json` | Merge `paths` and `references`. |
| Source code conflicts | **Cannot auto-resolve.** Escalate to CEO agent. |

### Step 3 — Commit Merge

```bash
git merge --no-ff parallel/<task_id>-<name> \
  -m "merge: T<id> <task_name> (parallel dispatch)"

# Example:
# merge: T3a Backend Engineering (parallel dispatch)
```

### Step 4 — Post-Merge Validation

After EACH merge (not just the final one):

```bash
# 1. Build check
npm run build  # or equivalent

# 2. Type check
npx tsc --noEmit  # or equivalent

# 3. Existing tests still pass
npm test  # or equivalent
```

If post-merge validation fails:

1. `git revert HEAD` — undo the merge
2. Log the failure reason in `.forgewright/merge-log.md`
3. Return task to CEO agent for re-dispatch

## Integration Test Phase

After ALL branches are merged:

### Full Stack Verification

```bash
# 1. Full build
npm run build  # all services

# 2. Docker build
docker-compose build

# 3. Docker smoke test
docker-compose up -d
# Wait for health checks
sleep 10
# Basic health check — hit /health on each service
docker-compose down

# 4. Full test suite
npm test -- --coverage

# 5. Type check entire project
npx tsc --noEmit
```

### Integration Failure Protocol

If integration tests fail after all merges:

1. **Identify culprit** — check which service/component is failing
2. **Targeted rollback** — revert only the failing branch's merge
3. **Re-dispatch** — create new contract with additional context about the integration failure
4. **Re-merge** — after fix, merge again and re-run integration tests
5. **Escalate** — after 2 failed cycles, escalate to user via notify_user

## Merge Log Format

Write to `.forgewright/merge-log.md`:

```markdown
# Parallel Merge Log

## Merge Session: <ISO-8601 timestamp>

| Order | Task | Branch | Status | Conflicts | Post-Merge Tests |
|-------|------|--------|--------|-----------|-----------------|
| 1 | T4 | parallel/T4-devops | ✓ Merged | None | ✓ Pass |
| 2 | T3a | parallel/T3a-backend | ✓ Merged | package.json (auto) | ✓ Pass |
| 3 | T3b | parallel/T3b-frontend | ✓ Merged | None | ✓ Pass |
| 4 | T3c | parallel/T3c-mobile | ⊘ Skipped | — | — |

### Integration Test: ✓ PASS
- Build: ✓
- Docker: ✓
- Tests: 142 passed, 0 failed
- Coverage: 84%
```

## Cleanup

After successful merge and integration:

```bash
# Remove worktrees
for task in T3a T3b T3c T4; do
  ./scripts/worktree-manager.sh cleanup $task
done

# Remove remote branches (optional)
git branch -D parallel/T3a-backend parallel/T3b-frontend \
  parallel/T3c-mobile parallel/T4-devops
```

## Workspace Artifact Merge

Worker workspace artifacts (reports, logs) are NOT merged via git. Instead:

1. Copy from each worktree's `.forgewright/<skill>/` to main workspace
2. These are informational — no conflict risk
3. Done after code merge succeeds
