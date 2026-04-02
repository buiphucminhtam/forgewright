# Task Contract Protocol

**Every parallel worker MUST receive a Task Contract before execution. The contract defines exactly what the worker can read, write, and must deliver.**

## Contract Format

Each Task Contract is a JSON file at `.worktrees/<task_id>/CONTRACT.json`:

```json
{
  "contract_version": "1.0",
  "task_id": "T3a",
  "task_name": "Backend Engineering",
  "skill": "software-engineer",
  "skill_path": "skills/software-engineer/SKILL.md",
  "branch": "parallel/T3a-backend",
  "worktree_path": ".worktrees/T3a-backend",
  "parallel_group": "A",
  "created_at": "ISO-8601 timestamp",

  "inputs": {
    "readonly_files": [],
    "context_directories": []
  },

  "outputs": {
    "allowed_directories": [],
    "workspace_directory": "",
    "required_artifacts": []
  },

  "constraints": {
    "forbidden_writes": [],
    "forbidden_deletes": [],
    "must_pass_tests": true,
    "must_pass_typecheck": true,
    "max_retries": 3,
    "timeout_minutes": 30
  },

  "acceptance_criteria": [],

  "anti_hallucination": {
    "verify_imports_exist": true,
    "verify_api_endpoints_match_spec": true,
    "verify_schema_matches_models": true,
    "run_type_check": true,
    "grep_forbidden_patterns": [
      "TODO", "FIXME", "// implement",
      "throw new Error('Not implemented')",
      "pass  # TODO", "raise NotImplementedError"
    ]
  }
}
```

## Contract Fields

### `inputs` — What the worker CAN read

| Field | Description |
|-------|-------------|
| `readonly_files` | Exact file paths or globs the worker needs to read. These are copied into the worktree as read-only context. |
| `context_directories` | Directories copied in full (BRD, protocols, architecture docs). |

**RULE:** Workers MUST NOT read files outside their contract inputs. If a file is not in the contract, it does not exist for the worker.

### `outputs` — What the worker MUST produce

| Field | Description |
|-------|-------------|
| `allowed_directories` | Only these directories may contain new or modified files. |
| `workspace_directory` | Where workspace artifacts (logs, reports) go. |
| `required_artifacts` | Files that MUST exist after execution. Missing = contract violation. |

**RULE:** Any file written outside `allowed_directories` is a contract violation. The Merge Arbiter will reject the delivery.

### `constraints` — Hard limits

| Field | Description |
|-------|-------------|
| `forbidden_writes` | Directories the worker MUST NOT touch (other workers' territories). |
| `forbidden_deletes` | Files/dirs that must not be deleted. |
| `must_pass_tests` | If true, all tests must pass before delivery. |
| `must_pass_typecheck` | If true, type checker must pass (tsc, mypy, etc.). |
| `max_retries` | Self-debug retry limit before escalation. |
| `timeout_minutes` | Hard timeout. Worker is killed after this. |

### `acceptance_criteria` — Human-readable checklist

List of statements that must be true. The validator checks each one:
- Compilable code → verified by build command
- Tests pass → verified by test runner
- No stubs → verified by grep for forbidden patterns
- API conformance → verified by spec comparison

### `anti_hallucination` — Automated reality checks

| Check | How |
|-------|-----|
| `verify_imports_exist` | Resolve every import/require path to a real file |
| `verify_api_endpoints_match_spec` | Compare implemented routes vs OpenAPI spec |
| `verify_schema_matches_models` | Compare ORM models vs schema definitions |
| `run_type_check` | `tsc --noEmit` / `mypy` / `go vet` |
| `grep_forbidden_patterns` | Reject if any TODO/FIXME/stub patterns found |

## Contract Templates by Task

### BUILD Phase Contracts

| Task | Skill | Allowed Writes | Key Inputs |
|------|-------|---------------|------------|
| T3a | software-engineer | `services/`, `libs/shared/` | `api/`, `schemas/`, `docs/architecture/` |
| T3b | frontend-engineer | `frontend/` | `api/`, BRD, design tokens |
| T3c | mobile-engineer | `mobile/` | `api/`, BRD, design tokens |
| T4  | devops | `Dockerfile*`, `docker-compose.yml` | `services/`, `docs/architecture/` |

### HARDEN Phase Contracts

| Task | Skill | Allowed Writes | Key Inputs |
|------|-------|---------------|------------|
| T5  | qa-engineer | `tests/` | `services/`, `frontend/`, `api/` |
| T6a | security-engineer | Workspace only (findings) | All implementation code |
| T6b | code-reviewer | Workspace only (findings) | All implementation + architecture |

## Delivery Report Format

After execution, the worker writes `DELIVERY.json` in the worktree root:

```json
{
  "task_id": "T3a",
  "status": "completed",
  "started_at": "ISO-8601",
  "completed_at": "ISO-8601",
  "files_created": ["services/auth/src/main.ts", "..."],
  "files_modified": [],
  "tests_run": 42,
  "tests_passed": 42,
  "tests_failed": 0,
  "type_check_passed": true,
  "anti_hallucination_passed": true,
  "issues_found": [],
  "retry_count": 0,
  "notes": "All services implemented per architecture spec."
}
```

## Contract Lifecycle

```
CEO creates CONTRACT.json
        ↓
Worker reads CONTRACT.json
        ↓
Worker reads ONLY input files listed
        ↓
Worker executes skill (SKILL.md)
        ↓
Worker self-validates against constraints
        ↓
Worker writes DELIVERY.json
        ↓
Merge Arbiter validates delivery vs contract
        ↓
If valid → merge branch
If invalid → return to CEO with failure reason
```

## Bite-Sized Task Granularity

> **Inspired by [Superpowers](https://github.com/obra/superpowers) implementation plan methodology**

When generating Task Contracts for implementation plans, each task should be decomposed into **bite-sized steps** of 2-5 minutes each:

```
Each step is ONE action:
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step
```

### Step-Level Specificity

Every step MUST include:
- **Exact file paths** — not "update the config" but `services/auth/config.ts`
- **Complete code** — not "add validation" but the actual validation code
- **Exact commands** — not "run tests" but `npm test -- --filter auth`
- **Expected output** — what the command should print on success/failure

### Write for Zero Context

Assume the worker has:
- **Zero project context** — they don't know the codebase
- **Questionable taste** — they won't make good aesthetic decisions
- **No judgment** — they follow instructions literally
- **Skill at coding** — they CAN code, they just don't know YOUR code

This means: every instruction must be explicit, complete, and unambiguous.

## Implementer Status Field

Add `implementer_status` to the DELIVERY.json format. Workers MUST set this field:

```json
{
  "implementer_status": "DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED",
  "concerns": "Optional: describe doubts or observations",
  "blocked_reason": "Required if BLOCKED: what prevents completion",
  "missing_context": "Required if NEEDS_CONTEXT: what information is needed"
}
```

See `parallel-dispatch/SKILL.md` → Implementer Status Protocol for handling each status.
