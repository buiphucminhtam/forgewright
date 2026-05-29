#!/bin/bash
# forgewright-session-tracker.sh
# Tracks session quality and ASIP evolution metrics
# Part of Phase 1 - Task 1.4

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TRACK_FILE="$PROJECT_DIR/.forgewright/session-tracker-v2.json"
METRICS_FILE="$PROJECT_DIR/.forgewright/asip-metrics.json"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log() { echo -e "${BLUE}[TRACK]${NC} $*"; }
pass() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }

# ---------------------------------------------------------------------------
# Initialize session tracking
# ---------------------------------------------------------------------------

init_track() {
    mkdir -p "$(dirname "$TRACK_FILE")" 2>/dev/null || true
    if [ ! -f "$TRACK_FILE" ]; then
        cat > "$TRACK_FILE" << 'EOF'
{
  "sessions": [],
  "current_session": null,
  "planScores": [],
  "planFailures": 0,
  "consecutiveFailures": 0,
  "consecutiveFailureThreshold": 2,
  "evolutionTriggered": false,
  "lastUpdated": null
}
EOF
    fi
}

# ---------------------------------------------------------------------------
# Start a new session
# ---------------------------------------------------------------------------

start_session() {
    local mode="${1:-unknown}"
    local request="${2:-}"
    
    init_track
    
    local session_id="session_$(date +%Y%m%d_%H%M%S)"
    local session_start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    # Update current session
    python3 -c "
import json

data = {}
try:
    with open('$TRACK_FILE') as f:
        data = json.load(f)
except:
    pass

data['current_session'] = {
    'id': '$session_id',
    'mode': '$mode',
    'request': '$request',
    'start': '$session_start',
    'status': 'active'
}
data['lastUpdated'] = '$session_start'

with open('$TRACK_FILE', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true
    
    log "Session started: $session_id (mode: $mode)"
}

# ---------------------------------------------------------------------------
# Record a plan score
# ---------------------------------------------------------------------------

record_plan() {
    local score="$1"
    local threshold="${2:-9.0}"
    
    init_track
    
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    # Determine pass/fail using Python for reliable comparison
    local passed
    passed=$(python3 -c "
score = float('$score')
threshold = float('$threshold')
print('true' if score >= threshold else 'false')
" 2>/dev/null)
    
    # Update tracking
    python3 -c "
import json

data = {}
try:
    with open('$TRACK_FILE') as f:
        data = json.load(f)
except:
    pass

# Add to plan scores
if 'planScores' not in data:
    data['planScores'] = []

data['planScores'].append({
    'score': float('$score'),
    'passed': $passed,
    'timestamp': '$timestamp'
})

# Update failure tracking
if $passed:
    data['consecutiveFailures'] = 0
else:
    data['consecutiveFailures'] = data.get('consecutiveFailures', 0) + 1
    data['planFailures'] = data.get('planFailures', 0) + 1

data['lastUpdated'] = '$timestamp'

with open('$TRACK_FILE', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true
    
    if [ "$passed" = "true" ]; then
        pass "Plan score: $score (PASSED)"
    else
        warn "Plan score: $score (FAILED - below $threshold)"
        
        # Trigger ASIP on failure
        if [ -f "$PROJECT_DIR/scripts/forgewright-lesson-migrator.sh" ]; then
            warn "Triggering ASIP lesson migration..."
            bash "$PROJECT_DIR/scripts/forgewright-lesson-migrator.sh" migrate
        fi
    fi
}

# ---------------------------------------------------------------------------
# End session
# ---------------------------------------------------------------------------

end_session() {
    local status="${1:-completed}"
    local summary="${2:-}"
    
    init_track
    
    local session_end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    python3 -c "
import json

data = {}
try:
    with open('$TRACK_FILE') as f:
        data = json.load(f)
except:
    pass

# Move current session to history
if 'current_session' in data and data['current_session']:
    session = data['current_session']
    session['end'] = '$session_end'
    session['status'] = '$status'
    session['summary'] = '$summary'
    
    if 'sessions' not in data:
        data['sessions'] = []
    data['sessions'].append(session)
    
    # Keep only last 100 sessions
    if len(data['sessions']) > 100:
        data['sessions'] = data['sessions'][-100:]
    
    data['current_session'] = None

data['lastUpdated'] = '$session_end'

with open('$TRACK_FILE', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true
    
    log "Session ended: $status"
}

# ---------------------------------------------------------------------------
# Check consecutive failures (triggers ASIP)
# ---------------------------------------------------------------------------

check_asip_trigger() {
    init_track
    
    local consecutive=$(python3 -c "
import json
try:
    with open('$TRACK_FILE') as f:
        data = json.load(f)
    print(data.get('consecutiveFailures', 0))
except:
    print(0)
" 2>/dev/null)
    
    local threshold=$(python3 -c "
import json
try:
    with open('$TRACK_FILE') as f:
        data = json.load(f)
    print(data.get('consecutiveFailureThreshold', 2))
except:
    print(2)
" 2>/dev/null)
    
    if [ "$consecutive" -ge "$threshold" ]; then
        warn "ASIP trigger threshold reached: $consecutive consecutive failures"
        warn "Triggering forced ASIP evolution..."
        
        # Trigger lesson migrator
        if [ -f "$PROJECT_DIR/scripts/forgewright-lesson-migrator.sh" ]; then
            bash "$PROJECT_DIR/scripts/forgewright-lesson-migrator.sh" migrate
        fi
        
        # Reset consecutive failures after ASIP
        python3 -c "
import json
try:
    with open('$TRACK_FILE') as f:
        data = json.load(f)
    data['consecutiveFailures'] = 0
    data['evolutionTriggered'] = True
    with open('$TRACK_FILE', 'w') as f:
        json.dump(data, f, indent=2)
except:
    pass
" 2>/dev/null || true
        
        return 0
    fi
    
    return 1
}

# ---------------------------------------------------------------------------
# Get status
# ---------------------------------------------------------------------------

show_status() {
    init_track
    
    echo ""
    echo "=== Session Tracker Status ==="
    echo ""
    
    if [ -f "$TRACK_FILE" ]; then
        python3 -c "
import json
try:
    with open('$TRACK_FILE') as f:
        data = json.load(f)
    
    print('Sessions tracked:', len(data.get('sessions', [])))
    print('Plan failures:', data.get('planFailures', 0))
    print('Consecutive failures:', data.get('consecutiveFailures', 0))
    print('Evolution triggered:', data.get('evolutionTriggered', False))
    
    if data.get('current_session'):
        cs = data['current_session']
        print('')
        print('Current session:')
        print('  ID:', cs.get('id', 'N/A'))
        print('  Mode:', cs.get('mode', 'N/A'))
        print('  Status:', cs.get('status', 'N/A'))
    
    print('')
    print('Recent plan scores:')
    for ps in data.get('planScores', [])[-5:]:
        status = 'PASS' if ps.get('passed') else 'FAIL'
        print(f\"  {ps.get('score')}: {status} ({ps.get('timestamp', 'N/A')[:10]})\")
except Exception as e:
    print('Error reading track file:', e)
" 2>/dev/null || cat "$TRACK_FILE"
    else
        echo "No tracking data found."
    fi
    
    echo ""
}

# ---------------------------------------------------------------------------
# CLI Dispatcher
# ---------------------------------------------------------------------------

case "${1:-status}" in
    start)
        start_session "${2:-}" "${3:-}"
        ;;
    plan)
        record_plan "${2:-0}" "${3:-9.0}"
        ;;
    end)
        end_session "${2:-completed}" "${3:-}"
        ;;
    check)
        check_asip_trigger
        ;;
    status)
        show_status
        ;;
    init)
        init_track
        pass "Session tracker initialized"
        ;;
    *)
        echo "Usage: $0 {start|plan|end|check|status|init}"
        echo ""
        echo "Commands:"
        echo "  start <mode> <request>   - Start a new session"
        echo "  plan <score> [threshold] - Record plan score (triggers ASIP on failure)"
        echo "  end [status] [summary]   - End current session"
        echo "  check                    - Check and trigger ASIP if needed"
        echo "  status                   - Show current status"
        echo "  init                     - Initialize tracker"
        exit 1
        ;;
esac
