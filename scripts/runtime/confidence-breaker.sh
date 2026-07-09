#!/bin/bash
# Forgewright Confidence Breaker (Anti-Loop mechanism)
# Usage:
#   ./confidence-breaker.sh record <task_id> <confidence_score>
#   ./confidence-breaker.sh check <task_id>
#   ./confidence-breaker.sh reset <task_id>

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$DIR")"
STATE_DIR="$PROJECT_ROOT/.forgewright"
STATE_FILE="$STATE_DIR/confidence-state.json"
MAX_RETRIES=3

mkdir -p "$STATE_DIR"

if [ ! -f "$STATE_FILE" ]; then
    echo "{}" > "$STATE_FILE"
fi

COMMAND=$1
TASK_ID=$2
SCORE=$3

case "$COMMAND" in
    record)
        if [ -z "$TASK_ID" ] || [ -z "$SCORE" ]; then
            echo "Usage: $0 record <task_id> <confidence_score>"
            exit 1
        fi
        
        # Determine if it's a pass (>= 99)
        is_pass=$(echo "$SCORE >= 99" | bc -l 2>/dev/null || echo 0)
        
        if [ "$is_pass" = "1" ]; then
            # Reset on pass
            jq "del(.\"$TASK_ID\")" "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
            echo "✅ Confidence $SCORE%. Gate unlocked for $TASK_ID."
            exit 0
        fi

        # Increment failure count
        current_fails=$(jq -r ".\"$TASK_ID\" // 0" "$STATE_FILE")
        new_fails=$((current_fails + 1))
        
        jq ".\"$TASK_ID\" = $new_fails" "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
        
        echo "⚠️ Confidence $SCORE% (< 99%). Attempt $new_fails/$MAX_RETRIES recorded."
        
        if [ "$new_fails" -ge "$MAX_RETRIES" ]; then
            echo "🛑 CONFIDENCE BREAKER TRIGGERED: 3 consecutive failures to reach 99% confidence."
            echo "🛑 AI MUST STOP AND ESCALATE TO USER IMMEDIATELY."
            exit 1
        fi
        exit 0
        ;;
        
    check)
        if [ -z "$TASK_ID" ]; then
            echo "Usage: $0 check <task_id>"
            exit 1
        fi
        current_fails=$(jq -r ".\"$TASK_ID\" // 0" "$STATE_FILE")
        if [ "$current_fails" -ge "$MAX_RETRIES" ]; then
            echo "🛑 GATE LOCKED for $TASK_ID. Need manual intervention."
            exit 1
        else
            echo "✅ Gate open for $TASK_ID. Fails: $current_fails/$MAX_RETRIES"
            exit 0
        fi
        ;;
        
    reset)
        if [ -z "$TASK_ID" ]; then
            echo "Usage: $0 reset <task_id>"
            exit 1
        fi
        jq "del(.\"$TASK_ID\")" "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
        echo "✅ Counter reset for $TASK_ID."
        exit 0
        ;;
        
    *)
        echo "Usage: $0 {record|check|reset} <task_id> [score]"
        exit 1
        ;;
esac
