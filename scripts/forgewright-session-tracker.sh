#!/bin/bash
# forgewright-session-tracker.sh
# Tracks consecutive plan/execution failures for ASIP Research Gate

SESSION_FILE="${FORGEWRIGHT_DIR:-.forgewright}/session-track.json"

init_tracker() {
    mkdir -p "$(dirname "$SESSION_FILE")" 2>/dev/null
    if [ ! -f "$SESSION_FILE" ]; then
        cat > "$SESSION_FILE" << 'EOF'
{
  "plan_failures": 0,
  "execution_failures": 0,
  "last_plan_score": null,
  "last_execution_result": null,
  "last_update": null,
  "research_gate_triggered": false
}
EOF
    fi
}

get_value() {
    local key="$1"
    grep "\"$key\":" "$SESSION_FILE" | sed 's/.*: *\([^,]*\).*/\1/' | tr -d ' "'
}

set_value() {
    local key="$1"
    local val="$2"
    sed -i.bak "s/\"$key\":.*/\"$key\": $val/" "$SESSION_FILE"
    rm -f "$SESSION_FILE.bak"
}

record_plan_attempt() {
    local score="$1"
    set_value "last_plan_score" "$score"
    set_value "last_update" "\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
    
    if [ "$score" -lt 90 ]; then
        local failures=$(get_value "plan_failures")
        set_value "plan_failures" $((failures + 1))
        echo "⚠️ Plan score $score/10 < 9.0. Consecutive failures: $(get_value 'plan_failures')"
    else
        set_value "plan_failures" 0
        echo "✅ Plan score $score/10 ≥ 9.0. Failures reset."
    fi
}

record_execution_attempt() {
    local result="$1"  # "success" or "failure"
    set_value "last_execution_result" "\"$result\""
    set_value "last_update" "\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
    
    if [ "$result" = "failure" ]; then
        local failures=$(get_value "execution_failures")
        set_value "execution_failures" $((failures + 1))
        echo "⚠️ Execution failed. Consecutive failures: $(get_value 'execution_failures')"
    else
        set_value "execution_failures" 0
        echo "✅ Execution succeeded. Failures reset."
    fi
}

check_research_gate() {
    local failures=$(get_value "plan_failures")
    if [ "$failures" -ge 2 ]; then
        echo "🔴 RESEARCH_GATE_REQUIRED: Plan failures = $failures (≥2)"
        set_value "research_gate_triggered" "true"
        return 0  # Gate required
    fi
    
    local exec_failures=$(get_value "execution_failures")
    if [ "$exec_failures" -ge 2 ]; then
        echo "🔴 RESEARCH_GATE_REQUIRED: Execution failures = $exec_failures (≥2)"
        set_value "research_gate_triggered" "true"
        return 0  # Gate required
    fi
    
    echo "🟢 No research gate required."
    return 1  # Gate not required
}

reset_tracking() {
    set_value "plan_failures" 0
    set_value "execution_failures" 0
    set_value "research_gate_triggered" "false"
    echo "✅ Tracking reset."
}

status() {
    echo "=== Forgewright Session Tracking ==="
    cat "$SESSION_FILE"
}

# Main command dispatcher
case "${1:-status}" in
    init)        init_tracker ;;
    plan)        record_plan_attempt "${2:-0}" ;;
    exec)        record_execution_attempt "${2:-failure}" ;;
    check)       check_research_gate ;;
    reset)       reset_tracking ;;
    status|*)    status ;;
esac
