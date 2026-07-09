#!/bin/bash
# Forgewright Status Line
# Inspired by CCGS statusline.sh
#
# Purpose: Display current pipeline status in a compact format
# Format: [Context %] [Model] | [Phase] > [Epic] > [Feature] > [Task]
#
# Usage:
#   ./statusline.sh              # Show current status
#   ./statusline.sh --short      # Compact mode
#   ./statusline.sh --update     # Force refresh

set +e

# Configuration
STATUS_FILE="${1:-production/session-state/active.md}"
SESSION_LOG="${2:-.forgewright/session-log.json}"
SETTINGS_FILE="${3:-.forgewright/settings.md}"

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
SHORT_MODE=false
FORCE_REFRESH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --short|-s)
            SHORT_MODE=true
            shift
            ;;
        --update|-u)
            FORCE_REFRESH=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# =============================================================================
# Load STATUS block from active.md
# =============================================================================
parse_status_block() {
    local file="$1"
    local epic=""
    local feature=""
    local task=""
    local mode=""
    
    if [ -f "$file" ]; then
        # Parse <!-- STATUS --> block
        in_block=false
        while IFS= read -r line; do
            if echo "$line" | grep -q "<!-- STATUS -->"; then
                in_block=true
                continue
            fi
            if echo "$line" | grep -q "<!-- /STATUS -->"; then
                in_block=false
                break
            fi
            if $in_block; then
                if echo "$line" | grep -qE "^Epic:"; then
                    epic=$(echo "$line" | sed 's/Epic:[[:space:]]*//' | tr -d '\r')
                fi
                if echo "$line" | grep -qE "^Feature:"; then
                    feature=$(echo "$line" | sed 's/Feature:[[:space:]]*//' | tr -d '\r')
                fi
                if echo "$line" | grep -qE "^Task:"; then
                    task=$(echo "$line" | sed 's/Task:[[:space:]]*//' | tr -d '\r')
                fi
            fi
        done < "$file"
    fi
    
    echo "$epic|$feature|$task"
}

# =============================================================================
# Load session info
# =============================================================================
get_session_info() {
    local phase=""
    local context_pct="--"
    local model="--"
    
    # Get current phase from session log
    if [ -f "$SESSION_LOG" ]; then
        if command -v jq >/dev/null 2>&1; then
            phase=$(jq -r '.sessions[-1].current_phase // "IDLE"' "$SESSION_LOG" 2>/dev/null)
            
            # Get context percentage (approximate based on session)
            total_tokens=$(jq -r '.sessions[-1].total_tokens // 0' "$SESSION_LOG" 2>/dev/null)
            if [ "$total_tokens" -gt 0 ]; then
                # Rough estimate: 200k context window
                context_pct=$((total_tokens * 100 / 200000))
                if [ "$context_pct" -gt 99 ]; then
                    context_pct=99
                fi
            fi
        fi
    fi
    
    # Get model from settings
    if [ -f "$SETTINGS_FILE" ]; then
        model=$(grep -i "Review_Mode" "$SETTINGS_FILE" | awk '{print $2}' | tr -d '\r' || echo "lean")
        model="[$model]"
    fi
    
    # Fallback defaults
    if [ -z "$phase" ] || [ "$phase" = "null" ]; then
        phase="IDLE"
    fi
    
    echo "$phase|$context_pct|$model"
}

# =============================================================================
# Format status line
# =============================================================================
format_status() {
    local phase="$1"
    local context="$2"
    local model="$3"
    local epic="$4"
    local feature="$5"
    local task="$6"
    
    if $SHORT_MODE; then
        # Short format: phase > epic > feature
        echo -n "${CYAN}[${context}]${NC} "
        echo -n "${BLUE}${model}${NC} "
        echo -n "${YELLOW}|${NC} ${GREEN}${phase}${NC}"
        
        if [ -n "$epic" ]; then
            echo -n " ${YELLOW}>${NC} ${epic}"
            if [ -n "$feature" ]; then
                echo -n " ${YELLOW}>${NC} ${feature}"
            fi
        fi
        echo ""
    else
        # Full format
        echo ""
        echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║${NC} ${BLUE}Forgewright Status${NC}                                              ${CYAN}║${NC}"
        echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
        
        # Context and Model
        printf "${CYAN}║${NC}  Context: ${YELLOW}%3s%%${NC}  Model: %-10s" "$context" "$model"
        echo -e "${CYAN}                              ║${NC}"
        
        # Phase
        echo -e "${CYAN}║${NC}  Phase: ${GREEN}%-49s${NC} ${CYAN}║${NC}" "$phase"
        
        # Breadcrumb
        if [ -n "$epic" ]; then
            echo -e "${CYAN}║${NC}  Breadcrumb:"
            echo -ne "${CYAN}║${NC}    ${YELLOW}>${NC} ${epic}"
            if [ -n "$feature" ]; then
                echo -ne " ${YELLOW}>${NC} ${feature}"
            fi
            if [ -n "$task" ]; then
                echo -ne " ${YELLOW}>${NC} ${task}"
            fi
            echo ""
            echo -ne "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
            echo ""
        else
            echo -e "${CYAN}║${NC}  Breadcrumb: ${YELLOW}--${NC}                                              ${CYAN}║${NC}"
            echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
            echo ""
        fi
    fi
}

# =============================================================================
# Main
# =============================================================================
main() {
    # Parse status block
    STATUS=$(parse_status_block "$STATUS_FILE")
    epic=$(echo "$STATUS" | cut -d'|' -f1)
    feature=$(echo "$STATUS" | cut -d'|' -f2)
    task=$(echo "$STATUS" | cut -d'|' -f3)
    
    # Get session info
    SESSION=$(get_session_info)
    phase=$(echo "$SESSION" | cut -d'|' -f1)
    context=$(echo "$SESSION" | cut -d'|' -f2)
    model=$(echo "$SESSION" | cut -d'|' -f3)
    
    # Format and display
    format_status "$phase" "$context" "$model" "$epic" "$feature" "$task"
}

# Run
main
