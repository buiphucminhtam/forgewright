# Session Lifecycle Protocol

**Manages cross-session continuity so the pipeline remembers what happened, can resume interrupted work, and doesn't re-discover context already known.**

## Session Start

Every pipeline invocation begins here, BEFORE mode classification.

### Step 1 — Load Project Profile

```
IF .forgewright/project-profile.json exists:
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
IF .forgewright/session-log.json exists:
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
IF LOCAL_MEMORY_DISABLED != true AND FORGEWRIGHT_SKIP_MEMORY != 1:
  Run: python3 scripts/mem0-v2.py search "<project-name> <user-request-keywords>" --limit 5
  IF no results returned:
    Run: python3 scripts/mem0-v2.py refresh
    Run search again with same query
  Inject results into prompt context (max 800 tokens)
  Log: "✓ Memory loaded: [N] relevant items"
ELSE:
  Read .forgewright/code-conventions.md if exists
  Log: "✓ Conventions loaded (memory skipped or disabled)"
```

### Step 3.5 — Check Code Intelligence Freshness

```
IF .forgenexus/ directory exists AND forgenexus CLI available:
  Check index freshness:
    last_indexed = .forgenexus/metadata.json → indexed_at
    commits_since = git rev-list --count HEAD ^<last_indexed_commit>

  IF commits_since > 0 OR index_age > 1 hour:
    Log: "⧖ Code Intelligence index stale — auto-reindexing"
    Run: npx forgenexus analyze 2>/dev/null
    IF success:
      Log: "✓ Code Intelligence refreshed ([N] symbols, [M] relationships)"
    ELSE:
      Log: "⚠ Code Intelligence reindex failed — using stale index"
      Continue with existing index (stale > nothing)
  ELSE:
    Log: "✓ Code Intelligence index fresh"

ELSE IF project-profile.json → code_intelligence.indexed == false:
  Log: "ℹ Code Intelligence not set up — run 'npx forgenexus analyze' for deep code understanding"
  Continue without Code Intelligence (graceful degradation)
```

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
      IF .antigravity/plugins/production-grade/forgenexus/ exists:
        Log: "  └── forgenexus: ready"
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

### Step 5 — Project Gap Detection (CCGS Pattern)

After loading project state, automatically detect missing pieces and warn the user. Inspired by CCGS `detect-gaps.sh`.

```
1. FRESH PROJECT CHECK:
   - If no source files + no design docs + no production artifacts:
     → Log: "🚀 NEW PROJECT: No code, no design docs, no planning."
     → Log: "  Run /onboard to get started, or tell me what you want to build."

2. CODE-TO-DESIGN RATIO:
   - If src/ has 50+ files AND design/ has < 5 files:
     → Warn: "⚠️ GAP: [N] source files but only [M] design docs"
     → Suggest: "Consider /reverse-document to capture design decisions"

3. PROTOTYPE DOCUMENTATION:
   - If prototypes/ has directories without README.md:
     → Warn: "⚠️ GAP: [N] undocumented prototype(s)"
     → Suggest: "Add README.md to each prototype"

4. ARCHITECTURE GAPS:
   - If src/core/ or src/engine/ exists but no docs/architecture/:
     → Warn: "⚠️ GAP: Core systems without architecture docs"
     → Suggest: "Run /architecture-decision or /reverse-document"

5. GAMEPLAY DESIGN GAPS:
   - If src/gameplay/ has subsystem dirs with 5+ files but no design/gdd/ doc:
     → Warn: "⚠️ GAP: Gameplay system '[name]' has no design doc"
     → Suggest: "Create design/gdd/[name]-system.md"

6. PRODUCTION PLANNING:
   - If codebase has 100+ files but no production/ directory:
     → Warn: "⚠️ GAP: Large codebase without production planning"
     → Suggest: "Create production/ or run /sprint-plan"
```

**Gap Detection Summary:**
```
Log: "=== Documentation Check ==="
Log: "[N] source files | [M] design docs | [K] architecture docs"
Log: "💡 Run /project-stage-detect for full analysis"
Log: "================================"
```

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
- Read from `production/session-state/active.md` on every turn
- Display status line in CLI output

## Turn-Start Memory Retrieval (Within-Session Continuity)

**When:** Before answering each user request within a session. Runs **before** orchestrator processes the new request.

**Why:** Without this, conversation facts written in Turn N are not retrieved in Turn N+1. The assistant loses context of what was just discussed.

**Trigger point:** After session-lifecycle Step 0.5 (session start), and **before each subsequent user request**.

### Step T1 — Load Conversation Summary

```
IF .forgewright/subagent-context/CONVERSATION_SUMMARY.md exists:
  Read it → inject into context
  Log: "✓ Conversation summary loaded — [N] exchanges summarized"
```

### Step T2 — Retrieve Recent Turns

```
IF LOCAL_MEMORY_DISABLED != true AND FORGEWRIGHT_SKIP_MEMORY != 1:
  # Search for recent conversation facts (within current session)
  python3 scripts/mem0-v2.py search "conversation recent" --limit 3
  
  # Search for task context relevant to current request
  python3 scripts/mem0-v2.py list --category session --limit 3
  
  # Inject: "Recent context: [top memories]"
  Log: "✓ Recent turns loaded — [N] relevant items"
```

### Step T3 — Detect Scope Context

```
IF .forgewright/business-analyst/handoff/ba-package.md exists:
  # BA scope persists across turns
  Read key sections → inject scope summary
  Log: "✓ BA scope context loaded"

IF .forgewright/subagent-context/PIPELINE_SUMMARY.md exists:
  # Pipeline summary from orchestrator
  Log: "✓ Pipeline summary loaded"
```

### Turn-Start Checkpoint

```
Log: "✓ Turn-Start context loaded:
  - Conversation summary: [loaded/skipped]
  - Recent turns: [N] items
  - BA scope: [loaded/skipped]
  - Pipeline context: [loaded/skipped]"
```

**Integration:** The orchestrator (production-grade/SKILL.md) calls these steps before processing each user request. This is distinct from Session Start (Step 0.5) which runs only once per session.

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

2. Save phase summary to memory:
   Run: python3 scripts/mem0-v2.py add "Phase [phase_name] completed: [summary]" --category tasks

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
   Run: python3 scripts/mem0-v2.py add "Gate [N] [decision]: [feedback summary]" --category decisions
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
2. If error_type == "escalation": save to memory as blocker
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

## Per-request memory (Turn-Close) — mandatory

**When:** After the assistant has **fully addressed** the current user message (single-turn chat, end of pipeline step, or before waiting on the next user input). **Not optional** for normal sessions (`MEM0_DISABLED` / `FORGEWRIGHT_SKIP_MEM0` exempt).

**Why:** Without this, project memory only grows at gates/phases — **conversation facts and incremental decisions are lost** between requests.

### Step TC1 — Generate Conversation Summary (Auto-Generated)

```
BEFORE running the mem0 add command, auto-generate a summary:
1. Extract key facts from the current exchange:
   - What was the user asking about?
   - What did we decide or discover?
   - What remains open?
2. Compose auto-summary (~100-200 chars):
   "Exchange: [2-3 sentences summarizing the exchange]"
3. Write to .forgewright/subagent-context/CONVERSATION_SUMMARY.md:
   # Conversation Summary — [session_id]
   - [timestamp]: [summary of exchange 1]
   - [timestamp]: [summary of exchange 2]
   ...
4. Log: "✓ Conversation summary updated"
```

### Step TC2 — Write Turn-Close Memory (Mandatory)

**MUST run at least one** `mem0-v2.py add` per turn, using a **single compact line** (redact secrets; stay under ~400 chars):

```bash
python3 scripts/mem0-v2.py add "REQ: [1-line user goal] | DONE: [what changed or decided] | OPEN: [blockers/questions or none] | SCOPE_UPDATE: [scope change or 'stable'] | CONVERSATION: [auto-summary from TC1]" --category session
```

### SCOPE_UPDATE Field

Append `SCOPE_UPDATE:` to every Turn-Close memory entry:

| Situation | SCOPE_UPDATE value |
|----------|-------------------|
| New project / first BA session | `SCOPE_UPDATE: Project scoped: [1-line description]` |
| New feature added | `SCOPE_UPDATE: Scope extended: [feature name]` |
| Scope refined / clarified | `SCOPE_UPDATE: Scope refined: [what changed]` |
| No change | `SCOPE_UPDATE: Scope stable` |

### Additional Memory Categories

**ALSO add a second line** when any of these occurred this turn (pick category):

| Situation | Category | Example prefix |
|-----------|----------|----------------|
| User or assistant locked a choice | `decisions` | `DECISION:` |
| Architecture / stack / pattern | `architecture` | `ARCH:` |
| Blocked on external factor | `blockers` | `BLOCKER:` |
| Scope / BA / requirements shift | `project` | `SCOPE:` |

### Turn-Close Self-Check

**Self-check (orchestrator):** Before ending the turn, confirm:
```
IF Turn-Close memory written:
  Log: "✓ Turn-Close memory saved"
ELSE:
  Retry once
  IF still failing:
    Log: "⚠ local_memory add failed" in session-log.json under events
    Tell user: "Memory sync failed — some context may not persist"
```

**De-duplication:** If the same summary was already added in the last 60 seconds (identical text), skip duplicate.

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
   Run: python3 scripts/mem0-v2.py add "Session completed: [summary]. Next: [next_steps]" --category session

4. Refresh project identity:
   Run: python3 scripts/mem0-v2.py refresh 2>/dev/null || true

5. Auto-reindex Code Intelligence:
   IF .forgenexus/ exists AND forgenexus CLI available:
     Run: npx forgenexus analyze 2>/dev/null
     IF success:
       Log: "✓ Code Intelligence reindexed for next session"
     ELSE:
       Log: "⚠ Code Intelligence reindex failed — will retry at next session start"
   This ensures the NEXT session starts with a fresh index reflecting
   all code changes made during this session.

6. Update project profile:
   .forgewright/project-profile.json → forge17.last_session = session_id, total_sessions++
```

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
