#!/usr/bin/env bash
#────────────────────────────────────────────────────────────────────────────
# Forgewright Instinct Hook Integration
#────────────────────────────────────────────────────────────────────────────
# Purpose: Hook that observes tool calls and learns patterns
# Install: Add to Claude Code hooks or call from MCP server
#
# Usage:
#   ./forgewright-instinct-hook.sh observe <tool> <args_json> [success]
#   ./forgewright-instinct-hook.sh promote [session_id]
#   ./forgewright-instinct-hook.sh status
#   ./forgewright-instinct-hook.sh health
#────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="${FORGEWRIGHT_DIR:-$HOME/.forgewright}"
REPO_INSTINCTS_DIR="$(cd "${SCRIPT_DIR}/../../.forgewright/instincts" 2>/dev/null && pwd || echo "")"

WORKSPACE_ROOT="${FORGEWRIGHT_WORKSPACE:-$PWD}"
FORGEWRIGHT_INSTALL="${HOME}/.forgewright"

if [[ -d "${WORKSPACE_ROOT}/.forgewright/instincts" ]]; then
    INSTINCTS_DIR="${WORKSPACE_ROOT}/.forgewright/instincts"
elif [[ -d "${FORGEWRIGHT_INSTALL}/instincts" ]]; then
    INSTINCTS_DIR="${FORGEWRIGHT_INSTALL}/instincts"
else
    INSTINCTS_DIR="${WORKSPACE_ROOT}/.forgewright/instincts"
fi

OBSERVER_EXE=""
if [[ -f "${INSTINCTS_DIR}/observer.mjs" ]]; then
    OBSERVER_EXE="${INSTINCTS_DIR}/observer.mjs"
elif [[ -n "${REPO_INSTINCTS_DIR}" && -f "${REPO_INSTINCTS_DIR}/observer.mjs" ]]; then
    OBSERVER_EXE="${REPO_INSTINCTS_DIR}/observer.mjs"
fi

STORE_PATH="${FORGEWRIGHT_INSTINCTS_STORE:-$INSTINCTS_DIR/store.json}"
NODE_PATH="${FORGEWRIGHT_DIR}/node_modules"

main() {
    local action="${1:-}"
    
    case "${action}" in
        observe)
            if [[ "${FORGEWRIGHT_INSTINCTS_ENABLED:-0}" != "1" && "${FORGEWRIGHT_INSTINCTS_ENABLED:-0}" != "true" ]]; then
                exit 0
            fi
            local tool="${2:-}"
            local args="${3:-}"
            if [[ -z "${args}" ]]; then
                args='{}'
            fi
            local success="${4:-}"
            local session_id="${FORGEWRIGHT_SESSION_ID:-default}"
            local project_root="${FORGEWRIGHT_WORKSPACE:-$PWD}"
            
            observe_tool_call "${tool}" "${args}" "${success}" "${session_id}" "${project_root}"
            ;;
        promote)
            promote_patterns
            ;;
        status)
            show_status
            ;;
        health)
            show_health
            ;;
        stats)
            show_stats
            ;;
        clear)
            clear_store
            ;;
        *)
            echo "Usage: $0 {observe|promote|status|health|stats|clear}"
            exit 1
            ;;
    esac
}

observe_tool_call() {
    local tool="$1"
    local args="$2"
    local success="$3"
    local session_id="$4"
    local project_root="$5"
    
    if [[ "${success}" != "true" ]]; then
        success="false"
    fi
    
    local node_cmd="node"
    if [[ -x "${NODE_PATH}/.bin/node" ]]; then
        node_cmd="${NODE_PATH}/.bin/node"
    fi

    if [[ -n "${OBSERVER_EXE}" ]] && command -v "${node_cmd}" &>/dev/null; then
        "${node_cmd}" "${OBSERVER_EXE}" observe-args "${tool}" "${args}" "${success}" "${session_id}" "${project_root}" || true
    else
        echo "[InstinctHook] Warning: observer executable or node unavailable (state: unsupported)" >&2
    fi
}

promote_patterns() {
    echo "Notice: Automatic frequency promotion is deprecated. Gated learning promotion is managed exclusively through Learning Foundry review gates."
}

show_status() {
    local project_root="${FORGEWRIGHT_WORKSPACE:-$PWD}"
    if [[ -n "${OBSERVER_EXE}" ]] && command -v node &>/dev/null; then
        node "${OBSERVER_EXE}" status "${project_root}"
    else
        show_status_fallback
    fi
}

show_status_fallback() {
    echo "═══ Instinct System Status ═══"
    echo ""
    echo "Hook State:   unsupported (missing observer.mjs or node)"
    echo "Enabled:      ${FORGEWRIGHT_INSTINCTS_ENABLED:-0}"
    echo "Store:        ${STORE_PATH}"
}

show_health() {
    local project_root="${FORGEWRIGHT_WORKSPACE:-$PWD}"
    if [[ -n "${OBSERVER_EXE}" ]] && command -v node &>/dev/null; then
        node "${OBSERVER_EXE}" health "${project_root}"
    else
        cat << EOF_HEALTH
{
  "hookId": "forgewright-instinct-hook",
  "version": "1.1.0",
  "state": "unsupported",
  "lastRun": null,
  "counters": { "observed": 0, "processed": 0, "failed": 0, "skipped": 0 },
  "lastSkipReason": "missing_executable",
  "lastError": "observer.mjs not found"
}
EOF_HEALTH
    fi
}

show_stats() {
    show_status
}

clear_store() {
    local project_root="${FORGEWRIGHT_WORKSPACE:-$PWD}"
    if [[ -n "${OBSERVER_EXE}" ]] && command -v node &>/dev/null; then
        node "${OBSERVER_EXE}" clear "${project_root}"
    fi
}

main "$@"
