#!/bin/bash
# forgewright-session-tracker.sh
# Tracks consecutive plan/execution failures for ASIP Research Gate.
# Uses Python for reliable JSON manipulation.

set -euo pipefail

SESSION_FILE="${FORGEWRIGHT_DIR:-.forgewright}/session-track.json"

# ---------------------------------------------------------------------------
# Python helpers (inline to avoid external dependencies)
# ---------------------------------------------------------------------------

python3_json() {
    python3 -c "
import json, sys

state = {}
try:
    with open('$SESSION_FILE') as f:
        state = json.load(f)
except: pass

action = '$1'
key = '${2:-}'
val = '${3:-}'

if action == 'get':
    result = state.get(key, None)
    if result is None:
        sys.exit(1)
    print(result)
elif action == 'set':
    # Parse val — handle numbers, strings, booleans, null
    if val == 'null' or val == '':
        parsed = None
    elif val == 'true':
        parsed = True
    elif val == 'false':
        parsed = False
    elif val.isdigit():
        parsed = int(val)
    elif val.replace('.', '', 1).isdigit():
        parsed = float(val)
    elif val.startswith('\"') and val.endswith('\"'):
        parsed = val[1:-1]
    elif val.startswith(\"'\") and val.endswith(\"'\"):
        parsed = val[1:-1]
    else:
        parsed = val
    state[key] = parsed
    with open('$SESSION_FILE', 'w') as f:
        json.dump(state, f, indent=2)
elif action == 'init':
    state = {
        'plan_failures': 0,
        'execution_failures': 0,
        'last_plan_score': None,
        'last_execution_result': None,
        'last_update': None,
        'research_gate_triggered': False
    }
    with open('$SESSION_FILE', 'w') as f:
        json.dump(state, f, indent=2)
" 2>&1
}

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

do_init() {
    mkdir -p "$(dirname "$SESSION_FILE")" 2>/dev/null || true
    python3_json init
    echo -e "${GREEN}[TRACKER]${NC} Session tracking initialized."
}

# ---------------------------------------------------------------------------
# Record plan attempt
# ---------------------------------------------------------------------------

do_record_plan() {
    local score="$1"
    python3_json set "last_plan_score" "$score"
    python3_json set "last_update" "\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""

    local pass
    pass=$(python3 -c "
import json
with open('$SESSION_FILE') as f:
    s = json.load(f)
# Extract numeric score
val = s.get('last_plan_score')
if val is None:
    print(0)
elif isinstance(val, (int, float)):
    print(1 if val >= 9.0 else 0)
else:
    print(0)
" 2>/dev/null || echo "0")

    if [ "$pass" -eq 1 ]; then
        python3_json set "plan_failures" 0
        echo -e "${GREEN}[TRACKER]${NC} Plan score $score/10 ≥ 9.0. Failures reset."
    else
        local failures
        failures=$(python3_json get "plan_failures" 2>/dev/null || echo "0")
        python3_json set "plan_failures" $((failures + 1))
        local new_failures
        new_failures=$(python3_json get "plan_failures" 2>/dev/null || echo "?")
        echo -e "${YELLOW}[TRACKER]${NC} Plan score $score/10 < 9.0. Consecutive failures: $new_failures"
    fi
}

# ---------------------------------------------------------------------------
# Record execution attempt
# ---------------------------------------------------------------------------

do_record_exec() {
    local result="$1"  # "success" or "failure"
    python3_json set "last_execution_result" "\"$result\""
    python3_json set "last_update" "\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""

    if [ "$result" = "success" ]; then
        python3_json set "execution_failures" 0
        echo -e "${GREEN}[TRACKER]${NC} Execution succeeded. Failures reset."
    else
        local failures
        failures=$(python3_json get "execution_failures" 2>/dev/null || echo "0")
        python3_json set "execution_failures" $((failures + 1))
        local new_failures
        new_failures=$(python3_json get "execution_failures" 2>/dev/null || echo "?")
        echo -e "${YELLOW}[TRACKER]${NC} Execution failed. Consecutive failures: $new_failures"
    fi
}

# ---------------------------------------------------------------------------
# Check research gate
# ---------------------------------------------------------------------------

do_check() {
    local failures
    failures=$(python3_json get "plan_failures" 2>/dev/null || echo "0")
    if [ "$failures" -ge 2 ]; then
        echo -e "${RED}[TRACKER]${NC} RESEARCH_GATE_REQUIRED: Plan failures = $failures (≥2)"
        python3_json set "research_gate_triggered" "true"
        return 0  # Gate required
    fi

    local exec_failures
    exec_failures=$(python3_json get "execution_failures" 2>/dev/null || echo "0")
    if [ "$exec_failures" -ge 2 ]; then
        echo -e "${RED}[TRACKER]${NC} RESEARCH_GATE_REQUIRED: Execution failures = $exec_failures (≥2)"
        python3_json set "research_gate_triggered" "true"
        return 0
    fi

    echo -e "${GREEN}[TRACKER]${NC} No research gate required."
    return 1
}

# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

do_reset() {
    python3_json set "plan_failures" 0
    python3_json set "execution_failures" 0
    python3_json set "research_gate_triggered" "false"
    python3_json set "last_plan_score" "null"
    python3_json set "last_execution_result" "null"
    echo -e "${GREEN}[TRACKER]${NC} Tracking reset."
}

# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

do_status() {
    echo "=== Forgewright Session Tracking ==="
    if [ -f "$SESSION_FILE" ]; then
        python3 -c "
import json, sys
with open('$SESSION_FILE') as f:
    data = json.load(f)
# Pretty print
for k, v in data.items():
    print(f'  {k}: {v}')
" 2>/dev/null || cat "$SESSION_FILE"
    else
        echo "  (not initialized — run: bash scripts/forgewright-session-tracker.sh init)"
    fi
}

# ---------------------------------------------------------------------------
# CLI dispatcher
# ---------------------------------------------------------------------------

case "${1:-status}" in
    init)       do_init ;;
    plan)       do_record_plan "${2:-0}" ;;
    exec)       do_record_exec "${2:-failure}" ;;
    check)      do_check ;;
    reset)      do_reset ;;
    status|*)   do_status ;;
esac
