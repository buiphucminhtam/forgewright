#!/usr/bin/env bash
#────────────────────────────────────────────────────────────────────────────
# Forgewright Memory Session Manager
#────────────────────────────────────────────────────────────────────────────
# Purpose: Automatic memory checkpoint system that works across all AI IDEs
# Triggers: Every N messages OR at token threshold
#
# Usage:
#   memory-session.sh start              # Start session tracking
#   memory-session.sh checkpoint         # Force checkpoint
#   memory-session.sh status            # Show session status
#   memory-session.sh resume            # Resume from last checkpoint
#
# Environment:
#   MEMORY_CHECKPOINT_INTERVAL=3        # Checkpoint every N messages
#   MEMORY_TOKEN_THRESHOLD=70          # Checkpoint at N% context
#────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORY_DB_DIR="${HOME}/.forgewright/sessions"
SESSION_FILE="${MEMORY_DB_DIR}/current-session.json"
SUMMARY_FILE=".forgewright/subagent-context/CONVERSATION_SUMMARY.md"

# Defaults
CHECKPOINT_INTERVAL="${MEMORY_CHECKPOINT_INTERVAL:-3}"
TOKEN_THRESHOLD="${MEMORY_TOKEN_THRESHOLD:-70}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[memory-session]${NC} $1"; }
warn() { echo -e "${YELLOW}[memory-session]${NC} WARNING: $1" >&2; }
error() { echo -e "${RED}[memory-session]${NC} ERROR: $1" >&2; }

#────────────────────────────────────────────────────────────────────────────
# Session State
#────────────────────────────────────────────────────────────────────────────

init_session() {
    mkdir -p "${MEMORY_DB_DIR}"
    mkdir -p "$(dirname "${SUMMARY_FILE}")" 2>/dev/null || true

    local session_id="session-$(date +%Y%m%d-%H%M%S)"
    local project_name
    project_name=$(git remote get-url origin 2>/dev/null | basename -s .git 2>/dev/null || echo "local")

    cat > "${SESSION_FILE}" << EOF
{
  "session_id": "${session_id}",
  "project": "${project_name}",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "message_count": 0,
  "last_checkpoint_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "checkpoints": []
}
EOF

    log "Session started: ${session_id}"
    log "Project: ${project_name}"
    log "Checkpoint interval: every ${CHECKPOINT_INTERVAL} messages"
}

load_session() {
    if [[ ! -f "${SESSION_FILE}" ]]; then
        init_session
    fi
    cat "${SESSION_FILE}"
}

save_session() {
    local session_data="$1"
    echo "${session_data}" > "${SESSION_FILE}"
}

#────────────────────────────────────────────────────────────────────────────
# Checkpoint Operations
#────────────────────────────────────────────────────────────────────────────

do_checkpoint() {
    local reason="${1:-manual}"

    # Load current session
    local session_json
    session_json=$(load_session)

    # Extract values
    local message_count
    message_count=$(echo "${session_json}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message_count',0))" 2>/dev/null || echo "0")

    local checkpoint_id="cp-$(date +%Y%m%d-%H%M%S)"

    # Generate checkpoint summary
    local summary
    summary=$(generate_checkpoint_summary "${reason}")

    # Save to memory (Legacy Token-Savior / mem0)
    if command -v python3 &>/dev/null; then
        python3 "${SCRIPT_DIR}/mem0-v2.py" add \
            "CHECKPOINT: [${checkpoint_id}] msg:${message_count} | ${summary}" \
            --category session 2>/dev/null || true
            
        # [GraphRAG V3] Save to Conversational Graph
        local graph_src="${SCRIPT_DIR}/../../antigravity/src/memory"
        if [[ -f "${graph_src}/graph_ingest.py" ]]; then
            # We assume virtual environment or global has networkx installed
            PYTHONPATH="${SCRIPT_DIR}/../../antigravity" python3 "${graph_src}/graph_ingest.py" \
                --node-id "${checkpoint_id}" \
                --type "Decision" \
                --content "${summary}" \
                --weight 5.0 2>/dev/null || true
                
            # [GraphRAG V3] Run cognitive decay and prune graph
            PYTHONPATH="${SCRIPT_DIR}/../../antigravity" python3 "${graph_src}/graph_gc.py" \
                --decay-rate 0.8 \
                --threshold 1.0 2>/dev/null || true
        fi
    fi

    # Update session
    local updated_json
    updated_json=$(echo "${session_json}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
d['message_count'] = 0  # Reset counter
d['last_checkpoint_at'] = '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
d['checkpoints'].append({
    'id': '${checkpoint_id}',
    'reason': '${reason}',
    'at': '$(date -u +%Y-%m-%dT%H:%M:%SZ)',
    'summary': '${summary}'
})
print(json.dumps(d, indent=2))
" 2>/dev/null || echo "${session_json}")

    save_session "${updated_json}"

    # Update conversation summary file
    append_to_summary "${checkpoint_id}" "${reason}" "${summary}"

    log "Checkpoint created: ${checkpoint_id} (reason: ${reason})"
}

generate_checkpoint_summary() {
    local reason="$1"
    # Generate a summary from recent git changes, file modifications
    local summary="checkpoint"
    local git_status
    git_status=$(git status --short 2>/dev/null | head -5 | tr '\n' ' ' || echo "")

    if [[ -n "${git_status}" ]]; then
        echo "files_changed:${git_status}"
    else
        echo "${reason}"
    fi
}

append_to_summary() {
    local checkpoint_id="$1"
    local reason="$2"
    local summary="$3"

    mkdir -p "$(dirname "${SUMMARY_FILE}")" 2>/dev/null || true

    if [[ ! -f "${SUMMARY_FILE}" ]]; then
        cat > "${SUMMARY_FILE}" << EOF
# Conversation Summary

## Session Log

EOF
    fi

    echo "| $(date -u +%Y-%m-%dT%H:%M:%SZ) | ${checkpoint_id} | ${reason} | ${summary} |" >> "${SUMMARY_FILE}"
}

#────────────────────────────────────────────────────────────────────────────
# Message Counter (called after each user message)
#────────────────────────────────────────────────────────────────────────────

increment_message() {
    local session_json
    session_json=$(load_session)

    local new_count
    new_count=$(echo "${session_json}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
d['message_count'] = d.get('message_count', 0) + 1
print(d['message_count'])
print(json.dumps(d))
" 2>/dev/null)

    local new_json
    new_json=$(echo "${new_count}" | tail -1)
    new_count=$(echo "${new_count}" | head -1)

    save_session "${new_json}"

    # Check if checkpoint needed
    if [[ $(( new_count % CHECKPOINT_INTERVAL )) -eq 0 ]]; then
        do_checkpoint "interval:${CHECKPOINT_INTERVAL}"
    fi
}

#────────────────────────────────────────────────────────────────────────────
# Commands
#────────────────────────────────────────────────────────────────────────────

cmd_start() {
    init_session
    log "Memory session manager ready"
    log "Use 'memory-session.sh checkpoint' to force save"
}

cmd_checkpoint() {
    do_checkpoint "manual"
}

cmd_status() {
    if [[ ! -f "${SESSION_FILE}" ]]; then
        echo "No active session"
        return
    fi

    echo "=== Memory Session Status ==="
    python3 -c "import json; d=json.load(open('${SESSION_FILE}')); print(f'Session: {d[\"session_id\"]}'); print(f'Messages since checkpoint: {d[\"message_count\"]}'); print(f'Last checkpoint: {d[\"last_checkpoint_at\"]}'); print(f'Total checkpoints: {len(d[\"checkpoints\"])}')"
}

cmd_resume() {
    log "Resuming session..."
    load_session

    if [[ -f "${SUMMARY_FILE}" ]]; then
        log "Loaded conversation summary:"
        tail -10 "${SUMMARY_FILE}"
    fi

    # Search recent memories
    if command -v python3 &>/dev/null; then
        echo ""
        log "Recent memories:"
        python3 "${SCRIPT_DIR}/mem0-v2.py" list --category session --limit 5 2>/dev/null || true
    fi
}

cmd_tick() {
    # Called by Claude Code hook after each message
    increment_message
}

#────────────────────────────────────────────────────────────────────────────
# Main
#────────────────────────────────────────────────────────────────────────────

main() {
    local cmd="${1:-status}"

    case "${cmd}" in
        start)
            cmd_start
            ;;
        checkpoint|cp)
            cmd_checkpoint
            ;;
        status)
            cmd_status
            ;;
        resume)
            cmd_resume
            ;;
        tick)
            cmd_tick
            ;;
        *)
            echo "Usage: $0 {start|checkpoint|status|resume|tick}"
            echo ""
            echo "Commands:"
            echo "  start       Initialize session tracking"
            echo "  checkpoint  Force save memory checkpoint"
            echo "  status      Show current session status"
            echo "  resume      Resume from last checkpoint"
            echo "  tick        Increment message count (call after each message)"
            exit 1
            ;;
    esac
}

main "$@"
