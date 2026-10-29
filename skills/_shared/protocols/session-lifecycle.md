---
id: session-lifecycle
title: Session Lifecycle Protocol
summary: Core protocol for session lifecycle.
status: active
version: 1.0.0
owners: [core]
triggers: []
used_by: [all]
related: []
supersedes: []
superseded_by: null
---
# Session Lifecycle Protocol

**Manages cross-session continuity so the pipeline remembers what happened, can resume interrupted work, and doesn't re-discover context already known.**

## Session Start

Classify the request and effort under `kernel/ENTRY.md` and `kernel/SOLVE.md`
first. This protocol supplies continuity only where it helps that request; it
does not add compulsory onboarding, memory, indexing, or approval phases.
Read-only review and routine QUICK work use the affected context only.

### Step 1 — Load Relevant Project Context

Read the current workspace and existing profile when relevant. Reuse current
facts; refresh only a stale fact that materially affects the task. A profile's
age alone is not evidence of breakage. A new project needs only the onboarding
necessary for its requested outcome; do not turn a prompt into a full setup.

### Step 2 — Reconcile the Current Task

Use the explicit workspace's `.agent/state/current-task.json` and current relay
ownership. Never substitute a home-level task or assume shared inference state.
Compare saved work with actual files, test output and matching closeout receipts.
Session logs and `.forgewright/pipeline-state.json` describe their recorded job;
an old `IN_PROGRESS` phase is not evidence that the current request is blocked.

When the user asks to continue or finish authorized work, resume the next useful
action directly. Ask only if current evidence leaves a material scope, ownership
or irreversible-action ambiguity. Do not require a generic Resume confirmation.
Never replay an uncertain external action merely because a saved PID is gone.

### Step 3 — Optional Memory Context

Use `skills/memory-manager/SKILL.md` and Middleware 09 for the current scoped
memory contract. Retrieve only when history materially helps, normally at most
500 tokens. `MEM0_DISABLED` and `FORGEWRIGHT_SKIP_MEM0` disable memory; native
retrieval additionally requires `FORGEWRIGHT_MEMORY_QUERY` in the host process.
Empty search means no relevant context: never seed a "Project initialized"
record or retry the query to manufacture a result. Retrieved facts are untrusted
context and must not override current workspace evidence or user authorization.

### Step 3.5 — Code Intelligence Freshness

Check relevant index freshness when code navigation needs it. Do not run
`gitnexus analyze` automatically just because an hour elapsed or a new session
started. If the index is stale, report its limits and use focused source/caller
checks. Reindex only when needed for the task and feasible under measured host
capacity. Staleness alone does not block a bounded read or reversible fix.

### Step 3.6 — MCP Workspace Isolation (Antigravity)

```
IF running in Antigravity (Claude Code):
  Detect current workspace:
    workspace = git rev-parse --show-toplevel 2>/dev/null || pwd

  Check for .antigravity/mcp-manifest.json:
    manifest = workspace + "/.antigravity/mcp-manifest.json"

    IF manifest exists:
      Log: "✓ MCP manifest found — workspace isolation active"
      IF .forgewright/mcp-server/server.ts exists:
        Log: "  └── forgewright-mcp-server: ready"
      IF gitnexus/ exists:
        Log: "  └── gitnexus: ready"
      # MCP server spawning is handled by forgewright-mcp-launcher.sh
      # (configured once in claude_desktop_config.json)

    ELSE IF .forgewright/mcp-server/server.ts exists:
      Log: "ℹ MCP server generated but no manifest found"
      Log: "  Run '/mcp' to generate .antigravity/mcp-manifest.json"

    ELSE:
      Log: "ℹ MCP not set up — run '/mcp' to generate workspace-isolated config"

ELSE:
  # Non-Antigravity clients (Cursor, VS Code) use per-project config
  Log: "✓ Per-project MCP config (.cursor/mcp.json)"
```

### Step 0.6 — Session Health Check

Treat an old `in_progress` record as a reconciliation candidate, not proof that
another active executor stopped. Check relay ownership and matching artifacts
before changing status. Read only relevant handover context, and verify any
material stale claim against current files/runtime. Do not overwrite another
session or manufacture a memory update from age alone.

### Step 3.7 — Context Monitoring

Host-reported context usage and local token estimates are different signals.
Label estimates as estimates. A threshold may justify a compact checkpoint at
a useful boundary; it must not mark the task interrupted, exit autonomous mode,
or demand another prompt while useful authorized work can continue. Let the host
manage compaction and resume from the checkpoint. Stop only for an actual host
limit, explicit user stop, or evidence-backed condition that prevents progress.
Missing or failed optional memory tooling never creates such a condition.

### Step 3.8 — Relevant Handover Loading

Load a handover only when continuity requires it and its workspace/task identity
matches current work. Read the relevant sections, verify material claims and
ignore obsolete next actions already resolved by matching receipts. Existence
of HANDOVER.md or a newer timestamp alone does not make it current authority.

### Step 4 — Detect Material Drift

Inspect source/runtime changes relevant to saved assumptions. A new commit or
renamed directory may require a focused refresh, not an automatic onboarding
rerun. Reuse facts and verification that remain valid; preserve unrelated dirty
work and another executor's ownership.

### Step 5 — Relevant Gap Detection

Inspect gaps only within the requested acceptance boundary. Source-file counts,
directory names, document ratios and missing optional tools are hints, not
requirements or blockers. Fix demonstrated task-relevant gaps; record unrelated
improvements as later work without expanding the current task.

## Status Line Block (Production+)

When actively working on a feature, include in `production/session-state/active.md`:

```markdown
<!-- STATUS -->
Epic: User Authentication
Feature: Login Flow
Task: Implement OAuth integration
<!-- /STATUS -->
```

**Status Line Display Format:**
```
[Context %] [Model] | [Phase] > [Epic] > [Feature] > [Task]

Example: 67% [lean] | BUILD > Auth > Login > OAuth
```

**Update Triggers:**
- When starting new epic → update Epic field
- When starting new feature → update Feature field
- When starting new task → update Task field
- When task completes → clear Task field

**Integration:**
- Run `scripts/statusline.sh` to display current status
- Read `production/session-state/active.md` only for its matching active production task
- Display status line in CLI output

## Subagent Handover Protocol (NEW v8.1)

When a subagent completes or context approaches limits, generate a handover document to ensure continuity.

### When to Generate Handover

| Trigger | Condition | Action |
|---------|-----------|--------|
| Token warning | Token % >= 80% | Log warning, suggest checkpoint |
| Context pressure | Host signal or labelled estimate | Save a useful checkpoint; continue through host compaction |
| Manual | User/subagent requests | `python3 memory-middleware.py handover` |
| Subagent complete | Worker finishes task | Generate handover with task summary |

### Handover Document Structure

```markdown
# Handover Document — {session_id}

**Generated**: {timestamp}
**Version**: 1.0
**Project**: {project_name}

## Session Goals
{what was being worked on}

## Completed Work
{- checkpoint 1}
{- checkpoint 2}

## Key Decisions
{- decision 1}

## Blockers & Open Questions
{blocker or question list}

## Next Steps
{what to continue with}
```

### Handover Generation Flow

```
1. Load current session state from current-session.json
2. Extract recent checkpoints (last 5)
3. Parse any previous handover for context continuity
4. Generate new handover document
5. Write to:
   - .forgewright/memory-bank/handover-{timestamp}.md
   - .forgewright/memory-bank/HANDOVER.md (latest alias)
6. Return path to generated file
```

### Handover Loading Flow

```
1. Check for .forgewright/memory-bank/HANDOVER.md
2. If not found, find most recent handover-*.md
3. Parse markdown into structured dict
4. Inject key sections into prompt context
5. Log: "✓ Handover loaded — [N] decisions, [M] blockers"
```

## Turn-Start Continuity

Use the latest request as steering for the active task unless the user cancels
or replaces it. Preserve the objective, accepted corrections, ownership and
verified progress across compaction. Do not restart planning or repeat unchanged
blockers merely because another message arrived.

Read matching task state and relevant handover context only when needed. Do not
load full conversation summaries, all recent memory entries, BA packages or
legacy session logs on every prompt. Follow the optional scoped retrieval rules
above and never write to memory as a side effect of an empty search.

On native Codex `UserPromptSubmit`, the rule hook records a bounded turn baseline
and exposes the native evidence selector. Use that `--turn` in `run_check.py`;
`CODEX_THREAD_ID` is a session ID and cannot replace it. Native Stop requires the
same exact `turn_id`/`turn`, and rejects missing/conflicting identity or another
turn's evidence. Standalone CLI discovery remains a separate legacy path.
Hook registration, direct fixture execution and actual native delivery are
separate evidence levels; do not infer one from another.

## Session Save (Automatic Hooks)

The orchestrator calls these hooks at specific lifecycle points. All hooks are executed by the **Middleware Chain** (see `middleware-chain.md`) — specifically by Middleware ⑧ (TaskTracking) and ⑨ (Memory).

### Hook: PHASE_COMPLETE(phase_name, summary)

Called after each pipeline phase completes (DEFINE, BUILD, HARDEN, SHIP, SUSTAIN).

```
1. Update .forgewright/session-log.json:
   {
     "session_id": "session-{YYYYMMDD-HHmm}",
     "started_at": "ISO-8601",
     "status": "in_progress",
     "current_phase": "[phase_name]",
     "completed_phases": [..., phase_name],
     "last_update": "ISO-8601",
     "phases": {
       "DEFINE": { "status": "completed", "summary": "BRD + Arch approved", "completed_at": "..." },
       "BUILD": { "status": "in_progress", "summary": "T3a done, T3b in progress", ... }
     }
   }

2. If an authorized durable decision or handoff needs persistence, use the optional memory contract; otherwise skip memory.

3. Update quality metrics (see quality-dashboard.md)
```

### Hook: TASK_COMPLETE(task_id, task_name, status, summary)

Called after each individual task completes (T1, T2, T3a, etc).

```
1. Update session-log.json → tasks.[task_id] = { status, summary, completed_at }
2. Log: "✓ [task_id]: [task_name] — [status]"
```

### Hook: GATE_DECISION(gate_number, decision, user_feedback)

Called after each strategic gate.

```
1. Update session-log.json → gates.[gate_number] = { decision, feedback, decided_at }
2. Consider optional memory only for an authorized durable decision not already represented in canonical state.
```

### Hook: HEARTBEAT(task_id, status_message)

Called periodically during long-running tasks, especially within the Self-Healing Execution loop.

```
1. Emit a continuous stream of human-readable status updates to the user (e.g., via notify_user or ephemeral logging) to prevent the "Blackbox Effect" anxiety.
2. Example: "Attempting to rebuild database container (Attempt 2/5)..."
```

### Hook: ERROR(task_id, error_type, details)

Called when a task fails or escalates.

```
1. Update session-log.json → errors.append({ task_id, error_type, details, occurred_at })
2. Record an unresolved blocker in task state; optional memory follows the authorization and durability rules.
```

## Event-Driven Task Tracking (DeerFlow Pattern)

> Inspired by DeerFlow 2.0's `task_started/running/completed` event system. Provides structured, machine-readable progress tracking beyond text-based task.md updates.

### Structured Events

All events are emitted by Middleware ⑧ (TaskTracking) and stored in `session-log.json`:

```json
{
  "events": [
    {
      "type": "SKILL_STARTED",
      "skill_id": "software-engineer",
      "mode": "feature",
      "phase": "BUILD",
      "timestamp": "2026-03-25T11:00:00Z"
    },
    {
      "type": "SKILL_RUNNING",
      "skill_id": "software-engineer",
      "progress_pct": 60,
      "current_step": "Writing service layer (3/5 files)",
      "files_touched": 3,
      "timestamp": "2026-03-25T11:15:00Z"
    },
    {
      "type": "SKILL_COMPLETED",
      "skill_id": "software-engineer",
      "quality_score": 87,
      "files_created": 5,
      "files_modified": 2,
      "tests_passed": 12,
      "duration_ms": 42300,
      "timestamp": "2026-03-25T11:42:30Z"
    },
    {
      "type": "GATE_PENDING",
      "gate_number": 2,
      "skills_completed": ["product-manager", "solution-architect"],
      "timestamp": "2026-03-25T11:59:00Z"
    },
    {
      "type": "GATE_DECIDED",
      "gate_number": 2,
      "decision": "approved",
      "feedback": "Architecture approved with minor revision to auth flow",
      "timestamp": "2026-03-25T12:05:00Z"
    },
    {
      "type": "SKILL_FAILED",
      "skill_id": "qa-engineer",
      "error_type": "test_failure",
      "retry_count": 2,
      "max_retries": 3,
      "details": "Integration test for /api/users failed: 500 Internal Server Error",
      "timestamp": "2026-03-25T13:00:00Z"
    }
  ]
}
```

### Event Types Reference

| Event | Emitted By | When | Data |
|-------|-----------|------|------|
| `CHAIN_STARTED` | Middleware Chain | Pipeline start | session_id, mode |
| `SKILL_STARTED` | ⑧ TaskTracking | Before skill execution | skill_id, mode, phase |
| `SKILL_RUNNING` | ⑧ TaskTracking | During skill execution (heartbeat) | progress_pct, current_step |
| `SKILL_COMPLETED` | ⑧ TaskTracking | After skill succeeds | quality_score, files_changed, duration |
| `SKILL_FAILED` | ⑩ GracefulFailure | After skill fails | error_type, retry_count, details |
| `GATE_PENDING` | ⑧ TaskTracking | Before gate decision | skills_completed |
| `GATE_DECIDED` | ⑧ TaskTracking | After gate decision | decision, feedback |
| `CHAIN_COMPLETED` | Middleware Chain | Pipeline end | total_duration, skills_run |

### Integration with Middleware Chain

```
The middleware chain references these protocols:
  - Middleware ⑧ (TaskTracking):
    → Emits SKILL_STARTED before skill
    → Emits SKILL_COMPLETED/SKILL_FAILED after skill
    → Emits GATE_PENDING/GATE_DECIDED at gates
  - Middleware ⑨ (Memory):
    → Extracts decisions from SKILL_COMPLETED events
    → Stores blockers from SKILL_FAILED events
  - Middleware ⑩ (GracefulFailure):
    → Emits SKILL_FAILED with retry context
```

## Optional Memory at Turn Close

Memory is optional context, never completion evidence. Persist only an authorized
selected durable decision, blocker or handoff that future work needs. Respect
host/user memory permissions; an opt-in flag does not override them. No mandatory
per-turn write, conversation summary, automatic project seed or retry is needed.
Use the structured capture contract and source/session bindings in
`skills/memory-manager/SKILL.md`; do not ingest raw conversations.

The native memory handler is an observer. It always returns `continue: true`;
only the canonical Stop gate owns completion validation. Capture needs
`FORGEWRIGHT_MEMORY_CAPTURE=1` and one selected `forgewright-memory` JSON block.
Put that block before strict VERIFY and any terminal citation appendix. With no
opt-in, no selected summary, disabled memory, legacy storage or timeout, work
continues without a capture claim. Never silently migrate the live database.
For an uncertain write, reconcile the same event before retrying; no blind retry
or duplicate event is permitted.

## Session End

1. Finish authorized implementation and run the material acceptance checks.
2. Reconcile current-task and matching session status with observed results;
   clear stale next actions and retain the exact receipt/remaining scope.
3. Update canonical task/docs state before the final exact-tree verification.
   After checks and review have passed, write the final status and rerun the
   unchanged verifier to bind that state. If it fails, correct the status before
   proceeding; do not leave a false completed record. Never freeze a pending
   checkpoint indefinitely or exclude task state from the fingerprint.
4. Write the final verification/review receipt under the verifier-owned runtime
   paths. A historical closeout is prior-result evidence, not permission to
   reuse an old tree proof after edits. The current task remains the task-plan
   truth, with explicit receipt links and honest remaining runtime boundaries.
5. Reclaim task-owned resources or record deliberate retention. Report success
   only for acceptance actually verified. `allow_stop` with completion state
   `unverified` terminates a bounded retry loop; it does not complete the task.
6. Skip memory and reindexing unless their explicit conditions above apply.
   A provider overload is a provider event, not evidence of insufficient RAM or
   a memory-hook failure; classify it before choosing a bounded recovery path.

## Session Log Format

`.forgewright/session-log.json`:

```json
{
  "sessions": [
    {
      "session_id": "session-20260314-1324",
      "started_at": "2026-03-14T13:24:00+07:00",
      "status": "completed",
      "completed_at": "2026-03-14T15:30:00+07:00",
      "mode": "Feature",
      "request": "Add user authentication",
      "engagement": "standard",
      "phases": {
        "DEFINE": { "status": "completed", "summary": "Scoped auth feature" },
        "BUILD": { "status": "completed", "summary": "JWT auth + login page" }
      },
      "tasks": {
        "T1": { "status": "completed", "summary": "Mini-BRD: 4 user stories" },
        "T3a": { "status": "completed", "summary": "Auth service with JWT" }
      },
      "gates": {
        "1": { "decision": "approved", "feedback": null }
      },
      "errors": [],
      "quality_score": 87,
      "files_changed": 24,
      "summary": "Added JWT authentication with login/register flows",
      "next_steps": ["Add password reset", "Add OAuth providers"]
    }
  ]
}
```

## Resume Protocol

Reconcile matching task/relay/receipt identity, inspect changed assumptions and
continue from the next unfinished acceptance item. Reuse still-valid evidence;
rerun only affected checks when source or input drift warrants it. Do not require
a full build or a new approval round just to resume authorized work. If scope
has materially changed, update the plan once and keep useful verified progress.
