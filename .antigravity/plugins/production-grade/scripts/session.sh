#!/usr/bin/env bash
set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Forgewright Session Lifecycle Manager
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Usage:
#   session.sh start <mode> <request>    — create new session
#   session.sh task <id> <status> <summary>  — update task status
#   session.sh phase <name> <summary>    — mark phase complete
#   session.sh gate <number> <decision> [feedback]  — log gate decision
#   session.sh error <task_id> <type> <details>  — log error
#   session.sh end [summary]             — finalize session
#   session.sh resume                    — show last interrupted session
#   session.sh status                    — show current session state
#   session.sh help                      — show this help
#
# Files:
#   .forgewright/session-log.json        — session history
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ── Resolve paths ──────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORGEWRIGHT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -d "$FORGEWRIGHT_DIR/.forgewright" ]]; then
  PROJECT_ROOT="$FORGEWRIGHT_DIR"
elif [[ -d "$FORGEWRIGHT_DIR/../.forgewright" ]]; then
  PROJECT_ROOT="$(cd "$FORGEWRIGHT_DIR/.." && pwd)"
else
  PROJECT_ROOT="$(pwd)"
fi

WORKSPACE="$PROJECT_ROOT/.forgewright"
SESSION_LOG="$WORKSPACE/session-log.json"
PROFILE="$WORKSPACE/project-profile.json"

mkdir -p "$WORKSPACE"

# ── Helpers ────────────────────────────────────────────
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
session_id() { echo "session-$(date +%Y%m%d-%H%M)"; }

ensure_log() {
  if [[ ! -f "$SESSION_LOG" ]]; then
    echo '{"sessions":[]}' > "$SESSION_LOG"
  fi
}

get_project_name() {
  if [[ -f "$PROFILE" ]]; then
    node -e "console.log(require('$PROFILE').fingerprint?.name || 'unknown')" 2>/dev/null || echo "unknown"
  elif [[ -f "$PROJECT_ROOT/package.json" ]]; then
    node -e "console.log(require('$PROJECT_ROOT/package.json').name || 'unknown')" 2>/dev/null || echo "unknown"
  else
    basename "$PROJECT_ROOT"
  fi
}

# ── Commands ───────────────────────────────────────────

cmd_start() {
  local mode="${1:-unknown}"
  local request="${2:-}"
  local sid
  sid=$(session_id)
  local ts
  ts=$(timestamp)
  local project
  project=$(get_project_name)

  ensure_log

  node -e "
    const fs = require('fs');
    const log = JSON.parse(fs.readFileSync('$SESSION_LOG', 'utf8'));
    
    // Mark any in_progress sessions as interrupted
    log.sessions.forEach(s => {
      if (s.status === 'in_progress') s.status = 'interrupted';
    });
    
    log.sessions.push({
      session_id: '$sid',
      project: '$project',
      started_at: '$ts',
      status: 'in_progress',
      mode: '$mode',
      request: $(node -e "console.log(JSON.stringify('$request'))" 2>/dev/null),
      current_phase: null,
      completed_phases: [],
      tasks: {},
      gates: {},
      errors: [],
      quality_scores: [],
      files_changed: 0,
      summary: null,
      next_steps: []
    });
    
    fs.writeFileSync('$SESSION_LOG', JSON.stringify(log, null, 2));
  "

  echo "✓ Session started: $sid"
  echo "  Project: $project"
  echo "  Mode: $mode"
  echo "  Request: $request"
}

cmd_task() {
  local task_id="${1:-}"
  local status="${2:-}"
  local summary="${3:-}"
  local ts
  ts=$(timestamp)

  if [[ -z "$task_id" || -z "$status" ]]; then
    echo "Usage: session.sh task <id> <status> <summary>"
    exit 1
  fi

  ensure_log

  node -e "
    const fs = require('fs');
    const log = JSON.parse(fs.readFileSync('$SESSION_LOG', 'utf8'));
    const current = log.sessions[log.sessions.length - 1];
    
    if (!current || current.status !== 'in_progress') {
      console.error('No active session. Run: session.sh start <mode> <request>');
      process.exit(1);
    }
    
    current.tasks['$task_id'] = {
      status: '$status',
      summary: $(node -e "console.log(JSON.stringify('$summary'))" 2>/dev/null),
      updated_at: '$ts'
    };
    
    fs.writeFileSync('$SESSION_LOG', JSON.stringify(log, null, 2));
  "

  local icon="⧖"
  [[ "$status" == "completed" ]] && icon="✓"
  [[ "$status" == "failed" ]] && icon="✗"
  echo "$icon $task_id: $summary ($status)"
}

cmd_phase() {
  local phase_name="${1:-}"
  local summary="${2:-}"
  local ts
  ts=$(timestamp)

  if [[ -z "$phase_name" ]]; then
    echo "Usage: session.sh phase <name> <summary>"
    exit 1
  fi

  ensure_log

  node -e "
    const fs = require('fs');
    const log = JSON.parse(fs.readFileSync('$SESSION_LOG', 'utf8'));
    const current = log.sessions[log.sessions.length - 1];
    
    if (!current || current.status !== 'in_progress') {
      console.error('No active session.');
      process.exit(1);
    }
    
    if (!current.phases) current.phases = {};
    current.phases['$phase_name'] = {
      status: 'completed',
      summary: $(node -e "console.log(JSON.stringify('$summary'))" 2>/dev/null),
      completed_at: '$ts'
    };
    current.current_phase = '$phase_name';
    if (!current.completed_phases.includes('$phase_name')) {
      current.completed_phases.push('$phase_name');
    }
    
    fs.writeFileSync('$SESSION_LOG', JSON.stringify(log, null, 2));
  "

  echo "✓ Phase $phase_name completed: $summary"
}

cmd_gate() {
  local gate_number="${1:-}"
  local decision="${2:-}"
  local feedback="${3:-}"
  local ts
  ts=$(timestamp)

  if [[ -z "$gate_number" || -z "$decision" ]]; then
    echo "Usage: session.sh gate <number> <decision> [feedback]"
    exit 1
  fi

  ensure_log

  node -e "
    const fs = require('fs');
    const log = JSON.parse(fs.readFileSync('$SESSION_LOG', 'utf8'));
    const current = log.sessions[log.sessions.length - 1];
    
    if (!current || current.status !== 'in_progress') {
      console.error('No active session.');
      process.exit(1);
    }
    
    current.gates['$gate_number'] = {
      decision: '$decision',
      feedback: $(node -e "console.log(JSON.stringify('$feedback'))" 2>/dev/null),
      decided_at: '$ts'
    };
    
    fs.writeFileSync('$SESSION_LOG', JSON.stringify(log, null, 2));
  "

  echo "🚪 Gate $gate_number: $decision"
}

cmd_error() {
  local task_id="${1:-}"
  local error_type="${2:-}"
  local details="${3:-}"
  local ts
  ts=$(timestamp)

  ensure_log

  node -e "
    const fs = require('fs');
    const log = JSON.parse(fs.readFileSync('$SESSION_LOG', 'utf8'));
    const current = log.sessions[log.sessions.length - 1];
    
    if (!current || current.status !== 'in_progress') {
      console.error('No active session.');
      process.exit(1);
    }
    
    current.errors.push({
      task_id: '$task_id',
      error_type: '$error_type',
      details: $(node -e "console.log(JSON.stringify('$details'))" 2>/dev/null),
      occurred_at: '$ts'
    });
    
    fs.writeFileSync('$SESSION_LOG', JSON.stringify(log, null, 2));
  "

  echo "✗ Error in $task_id ($error_type): $details"
}

cmd_end() {
  local summary="${1:-Session completed}"
  local ts
  ts=$(timestamp)

  ensure_log

  node -e "
    const fs = require('fs');
    const log = JSON.parse(fs.readFileSync('$SESSION_LOG', 'utf8'));
    const current = log.sessions[log.sessions.length - 1];
    
    if (!current || current.status !== 'in_progress') {
      console.error('No active session to end.');
      process.exit(1);
    }
    
    // Compute stats
    const tasks = Object.entries(current.tasks || {});
    const completed = tasks.filter(([,t]) => t.status === 'completed').length;
    const failed = tasks.filter(([,t]) => t.status === 'failed').length;
    const phases = (current.completed_phases || []).length;
    const gates = Object.keys(current.gates || {}).length;
    const errors = (current.errors || []).length;
    
    // Compute duration
    const startMs = new Date(current.started_at).getTime();
    const endMs = new Date('$ts').getTime();
    const durationMin = Math.round((endMs - startMs) / 60000);
    
    current.status = 'completed';
    current.completed_at = '$ts';
    current.duration_minutes = durationMin;
    current.summary = $(node -e "console.log(JSON.stringify('$summary'))" 2>/dev/null);
    current.stats = { tasks_completed: completed, tasks_failed: failed, phases: phases, gates: gates, errors: errors };
    
    fs.writeFileSync('$SESSION_LOG', JSON.stringify(log, null, 2));
    
    console.log('');
    console.log('━━━ Session Complete ━━━━━━━━━━━━━━━━━━━━');
    console.log('  ID:       ' + current.session_id);
    console.log('  Duration: ' + durationMin + ' min');
    console.log('  Tasks:    ' + completed + ' completed, ' + failed + ' failed');
    console.log('  Phases:   ' + phases);
    console.log('  Gates:    ' + gates);
    console.log('  Errors:   ' + errors);
    console.log('  Summary:  ' + current.summary);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  "
}

cmd_resume() {
  ensure_log

  node -e "
    const fs = require('fs');
    const log = JSON.parse(fs.readFileSync('$SESSION_LOG', 'utf8'));
    
    const interrupted = log.sessions.filter(s => s.status === 'interrupted' || s.status === 'in_progress');
    
    if (interrupted.length === 0) {
      console.log('✓ No interrupted sessions found.');
      process.exit(0);
    }
    
    const last = interrupted[interrupted.length - 1];
    const tasks = Object.entries(last.tasks || {});
    const completed = tasks.filter(([,t]) => t.status === 'completed').map(([id]) => id);
    const pending = tasks.filter(([,t]) => t.status !== 'completed').map(([id]) => id);
    
    console.log('');
    console.log('⚠ Interrupted session found:');
    console.log('  ID:      ' + last.session_id);
    console.log('  Mode:    ' + last.mode);
    console.log('  Request: ' + last.request);
    console.log('  Started: ' + last.started_at);
    console.log('  Phase:   ' + (last.current_phase || 'N/A'));
    console.log('  Done:    ' + completed.join(', '));
    console.log('  Pending: ' + (pending.length ? pending.join(', ') : 'N/A'));
    console.log('');
    console.log('To resume, re-invoke the pipeline with the same request.');
  "
}

cmd_status() {
  ensure_log

  node -e "
    const fs = require('fs');
    const log = JSON.parse(fs.readFileSync('$SESSION_LOG', 'utf8'));
    
    if (log.sessions.length === 0) {
      console.log('No sessions recorded yet.');
      process.exit(0);
    }
    
    const current = log.sessions[log.sessions.length - 1];
    const tasks = Object.entries(current.tasks || {});
    
    console.log('');
    console.log('━━━ Session Status ━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ID:      ' + current.session_id);
    console.log('  Status:  ' + current.status);
    console.log('  Mode:    ' + current.mode);
    console.log('  Phase:   ' + (current.current_phase || 'not started'));
    console.log('  Tasks:   ' + tasks.length + ' tracked');
    
    tasks.forEach(([id, t]) => {
      const icon = t.status === 'completed' ? '✓' : t.status === 'failed' ? '✗' : '⧖';
      console.log('    ' + icon + ' ' + id + ': ' + (t.summary || t.status));
    });
    
    const gates = Object.entries(current.gates || {});
    if (gates.length > 0) {
      console.log('  Gates:');
      gates.forEach(([n, g]) => {
        console.log('    🚪 Gate ' + n + ': ' + g.decision);
      });
    }
    
    const errors = current.errors || [];
    if (errors.length > 0) {
      console.log('  Errors:  ' + errors.length);
      errors.forEach(e => {
        console.log('    ✗ ' + e.task_id + ': ' + e.details);
      });
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  "
}

# ── Command dispatch ───────────────────────────────────
CMD="${1:-help}"
shift || true

case "$CMD" in
  start)   cmd_start "$@" ;;
  task)    cmd_task "$@" ;;
  phase)   cmd_phase "$@" ;;
  gate)    cmd_gate "$@" ;;
  error)   cmd_error "$@" ;;
  end)     cmd_end "$@" ;;
  resume)  cmd_resume ;;
  status)  cmd_status ;;
  help)    head -18 "$0" | tail -15 ;;
  *)       echo "Unknown command: $CMD. Run: session.sh help"; exit 1 ;;
esac
