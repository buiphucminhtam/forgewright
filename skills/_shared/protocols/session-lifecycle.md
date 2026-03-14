# Session Lifecycle Protocol

**Manages cross-session continuity so the pipeline remembers what happened, can resume interrupted work, and doesn't re-discover context already known.**

## Session Start

Every pipeline invocation begins here, BEFORE mode classification.

### Step 1 — Load Project Profile

```
IF .forge17/project-profile.json exists:
  Read it → set project context
  Check file age:
    IF < 24 hours AND no new git commits since onboarded_at:
      Log: "✓ Project profile loaded (fresh)"
      Skip re-onboarding
    ELSE:
      Log: "⧖ Project profile stale — refreshing health check"
      Re-run project-onboarding.md Phase 2 (Health Check) only
      Update health section + checked_at timestamp
ELSE:
  Log: "⧖ New project detected — running onboarding"
  Run full project-onboarding.md protocol
```

### Step 2 — Load Last Session State

```
IF .forge17/session-log.json exists:
  Read last_session entry
  Determine session state:
    IF last_session.status == "interrupted" OR "in_progress":
      → Offer resume via notify_user:
        "Last session was interrupted during [phase/task]. Resume?"
        1. **Resume from [last_task] (Recommended)** — Continue where you left off
        2. **Start fresh** — New request on this codebase
        3. **Chat about this** — Review what happened last time
    IF last_session.status == "completed":
      → Log: "✓ Last session completed: [summary]"
      → Continue to new request
ELSE:
  Log: "✓ First session on this project"
```

### Step 3 — Load Memory Context

```
IF memory-manager is configured (MEM0_DISABLED != true):
  Run: python3 scripts/mem0-cli.py search "<project-name> <user-request-keywords>" --limit 5 --format compact
  IF no results returned:
    Run: python3 scripts/mem0-cli.py refresh
    Run search again with same query
  Inject results into prompt context (max 800 tokens)
  Log: "✓ Memory loaded: [N] relevant items"
ELSE:
  Read .forge17/code-conventions.md if exists
  Log: "✓ Conventions loaded (memory not configured)"
```

### Step 4 — Detect Manual Changes

```
IF git is available AND last session timestamp known:
  git log --since="[last_session.completed_at]" --oneline
  IF commits found:
    Log: "⚠ [N] commits since last session — context may have changed"
    IF commits touch project structure (new services, renamed dirs):
      Re-run project-onboarding.md Phase 1 (Fingerprint) + Phase 3 (Patterns)
    ELSE:
      Continue with existing profile
ELSE:
  Continue without drift detection
```

## Session Save (Automatic Hooks)

The orchestrator calls these hooks at specific lifecycle points.

### Hook: PHASE_COMPLETE(phase_name, summary)

Called after each pipeline phase completes (DEFINE, BUILD, HARDEN, SHIP, SUSTAIN).

```
1. Update .forge17/session-log.json:
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

2. Save phase summary to memory:
   Run: python3 scripts/mem0-cli.py add "Phase [phase_name] completed: [summary]" --category tasks

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
2. Save to memory:
   Run: python3 scripts/mem0-cli.py add "Gate [N] [decision]: [feedback summary]" --category decisions
```

### Hook: ERROR(task_id, error_type, details)

Called when a task fails or escalates.

```
1. Update session-log.json → errors.append({ task_id, error_type, details, occurred_at })
2. If error_type == "escalation": save to memory as blocker
```

## Session End

Called when pipeline completes OR when session is explicitly ended.

```
1. Compute session summary:
   - Tasks completed: [list]
   - Phases completed: [list]
   - Quality score: [from quality-dashboard]
   - Time elapsed: [duration]

2. Write final session-log.json:
   {
     "status": "completed",  // or "interrupted" if not all phases done
     "completed_at": "ISO-8601",
     "summary": "Built auth service + frontend dashboard. 142 tests pass. Quality: 91/100.",
     "files_changed": [from change manifest],
     "quality_score": 91,
     "next_steps": ["Deploy to staging", "Add payment integration"]
   }

3. Save to memory:
   Run: python3 scripts/mem0-cli.py add "Session completed: [summary]. Next: [next_steps]" --category session

4. Refresh project identity:
   Run: python3 scripts/mem0-cli.py refresh

5. Update project profile:
   .forge17/project-profile.json → forge17.last_session = session_id, total_sessions++
```

## Session Log Format

`.forge17/session-log.json`:

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

When resuming an interrupted session:

```
1. Read session-log.json → find last in_progress session
2. Determine last completed task
3. Verify project state:
   a. Check if expected files from completed tasks exist
   b. Run quick health check (build + tests)
   c. If state matches expectations → resume from next task
   d. If state differs → warn user, offer re-run from last gate
4. Restore context:
   a. Load workspace artifacts from completed tasks
   b. Load BRD, architecture docs
   c. Set engagement mode from saved settings
5. Continue pipeline from resume point
```
