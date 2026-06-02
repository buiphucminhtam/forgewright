#!/usr/bin/env bash
#────────────────────────────────────────────────────────────────────────────
# Forgewright Instinct Hook Integration
#────────────────────────────────────────────────────────────────────────────
# Purpose: Hook that observes tool calls and learns patterns
# Install: Add to Claude Code hooks or call from MCP server
#
# Usage:
#   ./forgewright-instinct-hook.sh observe <tool> <args_json> <success>
#   ./forgewright-instinct-hook.sh promote <session_id>
#   ./forgewright-instinct-hook.sh status
#────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="${FORGEWRIGHT_DIR:-$HOME/.forgewright}"

# Feature flag check - fast exit
if [[ "${FORGEWRIGHT_INSTINCTS_ENABLED:-1}" == "0" ]]; then
    exit 0
fi

# ─── Instincts Config ──────────────────────────────────────────────

# Determine paths based on whether we're in a project or forgewright install
WORKSPACE_ROOT="${FORGEWRIGHT_WORKSPACE:-$PWD}"
FORGEWRIGHT_INSTALL="${HOME}/.forgewright"

# Case 1: Project workspace has .forgewright/instincts
if [[ -d "${WORKSPACE_ROOT}/.forgewright/instincts" ]]; then
    INSTINCTS_DIR="${WORKSPACE_ROOT}/.forgewright/instincts"
# Case 2: Forgewright install has instincts at ~/.forgewright/instincts
elif [[ -d "${FORGEWRIGHT_INSTALL}/instincts" ]]; then
    INSTINCTS_DIR="${FORGEWRIGHT_INSTALL}/instincts"
# Case 3: Default to workspace .forgewright
else
    INSTINCTS_DIR="${WORKSPACE_ROOT}/.forgewright/instincts"
fi

STORE_PATH="${FORGEWRIGHT_INSTINCTS_STORE:-$INSTINCTS_DIR/store.json}"
NODE_PATH="${FORGEWRIGHT_DIR}/node_modules"

# ─── Main ──────────────────────────────────────────────────────────

main() {
    local action="${1:-}"
    
    case "${action}" in
        observe)
            local tool="${2:-}"
            local args="${3:-}"
            local success="${4:-true}"
            local session_id="${FORGEWRIGHT_SESSION_ID:-default}"
            local project_root="${FORGEWRIGHT_WORKSPACE:-$PWD}"
            
            observe_tool_call "${tool}" "${args}" "${success}" "${session_id}" "${project_root}"
            ;;
        promote)
            local session_id="${2:-default}"
            promote_patterns "${session_id}"
            ;;
        status)
            show_status
            ;;
        stats)
            show_stats
            ;;
        clear)
            clear_store
            ;;
        *)
            echo "Usage: $0 {observe|promote|status|stats|clear}"
            echo ""
            echo "Commands:"
            echo "  observe <tool> <args_json> <success>   Record a tool call"
            echo "  promote [session_id]                   Promote patterns to suggestions"
            echo "  status                                 Show instincts system status"
            echo "  stats                                  Show statistics"
            echo "  clear                                  Clear pattern store"
            exit 1
            ;;
    esac
}

# ─── Observe Tool Call ─────────────────────────────────────────────

observe_tool_call() {
    local tool="$1"
    local args="$2"
    local success="$3"
    local session_id="$4"
    local project_root="$5"
    
    # Create event data
    local event_json
    event_json=$(printf '{
        "toolName": "%s",
        "arguments": %s,
        "sessionId": "%s",
        "timestamp": "%s",
        "success": %s,
        "projectRoot": "%s"
    }' "${tool}" "${args}" "${session_id}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${success}" "${project_root}")
    
    # Ensure store directory exists
    mkdir -p "$(dirname "${STORE_PATH}")"
    
    # Use node to process if available, else fallback to shell
    if [[ -x "${NODE_PATH}/.bin/node" ]] || command -v node &> /dev/null; then
        local node_cmd="node"
        command -v node &> /dev/null && node_cmd="node"
        
        # Run the TypeScript observer via node
        "${node_cmd}" "${INSTINCTS_DIR}/observer.mjs" observe "${event_json}" 2>/dev/null || true
    else
        # Fallback: simple shell-based tracking
        track_shell "${tool}" "${session_id}"
    fi
}

# ─── Shell Fallback Tracking ───────────────────────────────────────

track_shell() {
    local tool="$1"
    local session_id="$2"
    
    # Simple session-based tracking (no scoring, just counting)
    local session_file="${INSTINCTS_DIR}/sessions/${session_id}.json"
    mkdir -p "$(dirname "${session_file}")"
    
    if [[ -f "${session_file}" ]]; then
        # Update existing session
        local count
        count=$(grep -c "\"${tool}\"" "${session_file}" 2>/dev/null || echo "0")
        echo "${count}" > /dev/null  # suppress unused warning
    else
        # Create new session
        cat > "${session_file}" << EOF
{
    "sessionId": "${session_id}",
    "startTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "tools": ["${tool}"],
    "lastActivity": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    fi
}

# ─── Promote Patterns ───────────────────────────────────────────────

promote_patterns() {
    local session_id="$1"
    
    if [[ ! -f "${STORE_PATH}" ]]; then
        echo "No patterns recorded yet"
        return
    fi
    
    # Read store and find patterns above threshold
    local threshold=0.7
    local patterns
    patterns=$(grep -o '"confidence": [0-9.]*' "${STORE_PATH}" 2>/dev/null || echo "")
    
    for confidence in ${patterns}; do
        local value
        value=$(echo "${confidence}" | grep -o '[0-9.]*$')
        if (( $(echo "${value} >= ${threshold}" | bc -l) )); then
            echo "Pattern with confidence ${value} ready for promotion"
        fi
    done
}

# ─── Status ─────────────────────────────────────────────────────────

show_status() {
    echo "═══ Instinct System Status ═══"
    echo ""
    echo "Enabled: ${FORGEWRIGHT_INSTINCTS_ENABLED:-1}"
    echo "Store:   ${STORE_PATH}"
    echo ""
    
    if [[ -f "${STORE_PATH}" ]]; then
        local pattern_count
        pattern_count=$(grep -c '"id":' "${STORE_PATH}" 2>/dev/null || echo "0")
        echo "Patterns: ${pattern_count}"
        
        local last_updated
        last_updated=$(grep '"lastUpdated"' "${STORE_PATH}" 2>/dev/null | head -1 | sed 's/.*: "\(.*\)".*/\1/')
        echo "Updated:  ${last_updated:-unknown}"
    else
        echo "Patterns: 0 (no store yet)"
        echo "Updated:  never"
    fi
}

# ─── Stats ─────────────────────────────────────────────────────────

show_stats() {
    show_status
    echo ""
    
    if [[ -f "${STORE_PATH}" ]]; then
        echo "Top patterns by confidence:"
        grep '"confidence":' "${STORE_PATH}" | sort -t':' -k2 -rn | head -5 || true
    fi
}

# ─── Clear Store ───────────────────────────────────────────────────

clear_store() {
    if [[ -f "${STORE_PATH}" ]]; then
        rm "${STORE_PATH}"
        echo "Pattern store cleared"
    else
        echo "No store to clear"
    fi
    
    # Clear sessions
    rm -rf "${INSTINCTS_DIR}/sessions" 2>/dev/null || true
}

main "$@"
