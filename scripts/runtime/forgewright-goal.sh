#!/bin/bash
# forgewright-goal.sh - CLI wrapper for goal-driven workflow
#
# Usage:
#   forgewright goal set "condition"
#   forgewright goal status
#   forgewright goal clear

set -e

GOAL_DIR=".forgewright"
GOAL_FILE="$GOAL_DIR/active-goal.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⧗${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

ensure_goal_dir() {
    mkdir -p "$GOAL_DIR"
}

cmd_set() {
    local condition="$1"

    if [ -z "$condition" ]; then
        log_error "Usage: forgewright goal set <condition>"
        log_info "Example: forgewright goal set 'All tests pass and lint is clean'"
        exit 1
    fi

    ensure_goal_dir

    # Create goal file
    cat > "$GOAL_FILE" <<EOF
{
  "goal_id": "goal-$(date +%Y%m%d-%H%M)",
  "condition": "$condition",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "created_by": "user",
  "turns": 0,
  "last_evaluation": null,
  "status": "active",
  "history": []
}
EOF

    log_success "Goal set: $condition"
    echo ""
    log_info "Forgewright will now work continuously toward this goal."
    log_info "Use 'forgewright goal status' to check progress."
    log_info "Use 'forgewright goal clear' to cancel."
}

cmd_status() {
    if [ ! -f "$GOAL_FILE" ]; then
        log_info "No active goal"
        echo ""
        log_info "Set a goal with: forgewright goal set <condition>"
        exit 0
    fi

    local goal=$(cat "$GOAL_FILE")
    local condition=$(echo "$goal" | python3 -c "import sys,json; print(json.load(sys.stdin)['condition'])")
    local status=$(echo "$goal" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    local turns=$(echo "$goal" | python3 -c "import sys,json; print(json.load(sys.stdin)['turns'])")
    local created=$(echo "$goal" | python3 -c "import sys,json; print(json.load(sys.stdin)['created_at'])")
    local last_eval=$(echo "$goal" | python3 -c "import sys,json; d=json.load(sys.stdin).get('last_evaluation'); print(d['reason'] if d else 'No evaluation yet')")

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════${NC}"
    echo -e "${BLUE}  GOAL STATUS${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${GREEN}Condition:${NC} $condition"
    echo -e "  ${YELLOW}Status:${NC} $status"
    echo -e "  ${YELLOW}Turns:${NC} $turns"
    echo -e "  ${YELLOW}Started:${NC} $created"
    echo ""
    echo -e "  ${BLUE}Last Evaluation:${NC}"
    echo "  $last_eval"
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════${NC}"
    echo ""
}

cmd_clear() {
    if [ ! -f "$GOAL_FILE" ]; then
        log_info "No active goal to clear"
        exit 0
    fi

    rm "$GOAL_FILE"
    log_success "Goal cleared"
}

cmd_evaluate() {
    # Internal command - called by orchestrator after each turn
    if [ ! -f "$GOAL_FILE" ]; then
        echo "no_goal"
        exit 0
    fi

    local condition=$(cat "$GOAL_FILE" | python3 -c "import sys,json; print(json.load(sys.stdin)['condition'])")

    # Run evaluation
    local result=$(python3 scripts/goal-evaluate.py "$condition" 2>/dev/null)

    # Update goal state
    local goal_json=$(cat "$GOAL_FILE")
    local turns=$(echo "$goal_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['turns'])")
    local new_turns=$((turns + 1))

    local eval_result=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])")
    local eval_reason=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['reason'])")

    # Write updated state
    cat > "$GOAL_FILE" <<EOF
$(echo "$goal_json" | python3 -c "
import sys,json
d=json.load(sys.stdin)
d['turns']=$new_turns
d['last_evaluation']={'result':'$eval_result','reason':'$eval_reason','at':'$(date -u +%Y-%m-%dT%H:%M:%SZ)'}
d['history'].append({'turn':$new_turns,'result':'$eval_result','reason':'$eval_reason','at':'$(date -u +%Y-%m-%dT%H:%M:%SZ)'})
if '$eval_result' == 'met':
    d['status']='completed'
    d['completed_at']='$(date -u +%Y-%m-%dT%H:%M:%SZ)'
print(json.dumps(d, indent=2))
")
EOF

    echo "$eval_result:$eval_reason"
}

cmd_continue() {
    # Internal command - returns whether to continue
    if [ ! -f "$GOAL_FILE" ]; then
        echo "no_goal"
        exit 0
    fi

    local status=$(cat "$GOAL_FILE" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")

    if [ "$status" = "completed" ]; then
        echo "goal_completed"
        log_success "Goal achieved!"
        exit 0
    elif [ "$status" = "cleared" ]; then
        echo "goal_cleared"
        exit 0
    else
        echo "continue"
        exit 0
    fi
}

# Main
COMMAND="${1:-}"

case "$COMMAND" in
    set)
        shift
        cmd_set "$@"
        ;;
    status)
        cmd_status
        ;;
    clear)
        cmd_clear
        ;;
    evaluate)
        cmd_evaluate
        ;;
    continue)
        cmd_continue
        ;;
    help|--help|-h)
        echo "forgewright goal - Goal-driven workflow"
        echo ""
        echo "Usage:"
        echo "  forgewright goal set <condition>   Set a goal"
        echo "  forgewright goal status            Check goal status"
        echo "  forgewright goal clear             Clear the active goal"
        echo ""
        echo "Examples:"
        echo "  forgewright goal set \"All tests pass\""
        echo "  forgewright goal set \"Build succeeds and lint is clean\""
        ;;
    *)
        if [ -n "$COMMAND" ]; then
            log_error "Unknown command: $COMMAND"
            echo "Use 'forgewright goal help' for usage"
            exit 1
        fi
        cmd_status
        ;;
esac
