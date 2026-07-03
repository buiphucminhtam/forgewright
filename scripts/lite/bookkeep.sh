#!/usr/bin/env bash
# scripts/lite/bookkeep.sh
# Upgraded Stage E0 (Part B) session, memory, and token bookkeeping.
# Works on macOS and Windows/Git-Bash.

set -euo pipefail

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[BOOKKEEP]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[BOOKKEEP] WARNING:${NC} $*" >&2; }
log_error() { echo -e "${RED}[BOOKKEEP] ERROR:${NC} $*" >&2; }

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# Ensure essential scripts are present
MEMORY_SESSION="scripts/memory-session.sh"
SESSION_TRACKER="scripts/forgewright-session-tracker.sh"

run_bg() {
  # Run a command in the background (fire-and-forget)
  # Redirecting output to a central bookkeeping log
  local log_file=".forgewright/bookkeep.log"
  mkdir -p "$(dirname "$log_file")"
  
  (
    echo "=== [$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Background Task Starting: $* ===" >> "$log_file"
    "$@" >> "$log_file" 2>&1
    echo "=== [$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Background Task Completed ===" >> "$log_file"
  ) &
  disown
}

create_git_baseline_snapshot() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    log_warn "Not in a Git worktree. Skipping baseline snapshot."
    return 0
  fi

  if [[ -n "$(git status --porcelain)" ]]; then
    log_info "Repo is dirty on boot. Generating git baseline snapshot..."
    
    local snapshot_file=".forgewright/git-baseline.json"
    mkdir -p "$(dirname "$snapshot_file")"
    
    local commit_hash; commit_hash=$(git rev-parse HEAD 2>/dev/null || echo "none")
    local branch_name; branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "none")
    local status_output; status_output=$(git status --porcelain)
    
    python3 -c "
import json, sys
status_lines = sys.argv[3].splitlines()
modified = []
untracked = []
deleted = []

for line in status_lines:
    if not line.strip(): continue
    state = line[:2]
    file_path = line[3:].strip()
    if 'M' in state:
        modified.append(file_path)
    elif '??' in state:
        untracked.append(file_path)
    elif 'D' in state:
        deleted.append(file_path)

snapshot = {
    'commit': sys.argv[1],
    'branch': sys.argv[2],
    'dirty': True,
    'files': {
        'modified': modified,
        'untracked': untracked,
        'deleted': deleted
    }
}
with open('$snapshot_file', 'w') as f:
    json.dump(snapshot, f, indent=2)
" "$commit_hash" "$branch_name" "$status_output"
    log_info "Saved git baseline snapshot to $snapshot_file"
  else
    log_info "Repo is clean. No baseline snapshot needed."
  fi
}

cmd_start() {
  local mode="${1:-unknown}"
  local request="${2:-}"
  
  # 1. Perform git baseline snapshot if dirty
  create_git_baseline_snapshot
  
  # 2. Initialize sessions in background
  log_info "Initializing session ($mode) in background..."
  run_bg bash "$MEMORY_SESSION" start
  run_bg bash "$SESSION_TRACKER" start "$mode" "$request"
}

cmd_tick() {
  log_info "Logging conversation tick in background..."
  run_bg bash "$MEMORY_SESSION" tick
}

cmd_checkpoint() {
  local reason="${1:-manual}"
  log_info "Recording memory checkpoint ($reason) in background..."
  run_bg bash "$MEMORY_SESSION" checkpoint
}

cmd_end() {
  local status="${1:-completed}"
  local summary="${2:-}"
  log_info "Closing session ($status) in background..."
  run_bg bash "$SESSION_TRACKER" end "$status" "$summary"
  run_bg bash "$MEMORY_SESSION" checkpoint
}

cmd_status() {
  # Run in foreground so the user sees it
  echo "=========================================="
  echo "       Forgewright Bookkeep Status"
  echo "=========================================="
  if [[ -f "$SESSION_TRACKER" ]]; then
    bash "$SESSION_TRACKER" status
  else
    log_warn "Session tracker script not found."
  fi
  
  if [[ -f "$MEMORY_SESSION" ]]; then
    bash "$MEMORY_SESSION" status
  else
    log_warn "Memory session script not found."
  fi
}

cmd_log_tokens() {
  local model="$1"
  local provider="$2"
  local input_tokens="$3"
  local output_tokens="$4"
  local latency_ms="${5:-0}"
  local skill="${6:-escalate}"
  local mode="${7:-hard-task}"

  log_info "Logging token usage ($input_tokens input, $output_tokens output) in background..."
  
  python3 -c "
import json, os, datetime, sys
from pathlib import Path

try:
    model = sys.argv[1]
    provider = sys.argv[2]
    input_tokens = int(sys.argv[3])
    output_tokens = int(sys.argv[4])
    latency_ms = int(sys.argv[5])
    skill = sys.argv[6]
    mode = sys.argv[7]

    home = os.path.expanduser('~')
    project_name = 'forgewright'
    project_path = '$PROJECT_ROOT'
    
    usage_dir = Path(home) / '.forgewright' / 'usage' / project_name
    usage_dir.mkdir(parents=True, exist_ok=True)
    
    date_str = datetime.datetime.now().strftime('%Y-%m-%d')
    log_file = usage_dir / f'{date_str}.jsonl'
    
    record = {
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
        'sessionId': 'session_' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S'),
        'project': project_name,
        'projectPath': project_path,
        'model': model,
        'provider': provider,
        'inputTokens': input_tokens,
        'outputTokens': output_tokens,
        'latencyMs': latency_ms,
        'skill': skill,
        'mode': mode
    }
    
    with open(log_file, 'a') as f:
        f.write(json.dumps(record) + '\n')
except Exception as e:
    sys.stderr.write(f'[BOOKKEEP] Error logging tokens: {e}\n')
" "$model" "$provider" "$input_tokens" "$output_tokens" "$latency_ms" "$skill" "$mode" &
  disown
}

# Router
CMD="${1:-status}"
shift || true

case "$CMD" in
  start)
    cmd_start "${1:-}" "${2:-}"
    ;;
  tick)
    cmd_tick
    ;;
  checkpoint|cp)
    cmd_checkpoint "${1:-}"
    ;;
  end)
    cmd_end "${1:-}" "${2:-}"
    ;;
  status)
    cmd_status
    ;;
  log-tokens|log_tokens)
    if [[ $# -lt 4 ]]; then
      log_error "Usage: bookkeep.sh log-tokens <model> <provider> <input_tokens> <output_tokens> [latency_ms] [skill] [mode]"
      exit 1
    fi
    cmd_log_tokens "$@"
    ;;
  *)
    echo "Usage: $0 {start|tick|checkpoint|end|status|log-tokens}"
    echo ""
    echo "Commands:"
    echo "  start <mode> <request>                  - Start session and tracking"
    echo "  tick                                    - Increment tick count"
    echo "  checkpoint [reason]                     - Force memory checkpoint"
    echo "  end [status] [summary]                  - Close session and save"
    echo "  status                                  - Display foreground status info"
    echo "  log-tokens <model> <provider> <in> <out> [latency] [skill] [mode] - Record token usage"
    exit 1
    ;;
esac

exit 0
