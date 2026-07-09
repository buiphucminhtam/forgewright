#!/usr/bin/env bash
#────────────────────────────────────────────────────────────────────────────
# Forgewright Memory Hook Integration
#────────────────────────────────────────────────────────────────────────────
# Purpose: Claude Code hook that triggers memory checkpoints with profile support
# Install: Add to your Claude Code config (~/.claude/settings.json)
#
# Claude Code hooks config example:
# {
#   "hooks": {
#     "PostToolUse": "./scripts/forgewright-memory-hook.sh",
#     "PostMessage": "./scripts/forgewright-memory-hook.sh tick"
#   }
# }
#
# Profile System:
#   FORGEWRIGHT_HOOK_PROFILE=minimal|standard|strict (default: standard)
#   FORGEWRIGHT_DISABLED_HOOKS=hook1,hook2 (comma-separated)
#   FORGEWRIGHT_SESSION_START_MAX_CHARS=50000 (default)
#   FORGEWRIGHT_MEMORY_TICK_INTERVAL=3 (messages between ticks)
#
# Profiles:
#   minimal  - Only essential hooks (memory tick)
#   standard - All hooks (default, backward compatible)
#   strict   - All hooks + verbose logging + token threshold warnings
#────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Memory session script
MEMORY_SESSION="${SCRIPT_DIR}/../memory/memory-session.sh"

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Default Environment Variables ────────────────────────────────────────────

# Profile: minimal | standard | strict (default: standard for backward compat)
export FORGEWRIGHT_HOOK_PROFILE="${FORGEWRIGHT_HOOK_PROFILE:-standard}"

# Disabled hooks: comma-separated list (e.g., "checkpoint,verbose")
export FORGEWRIGHT_DISABLED_HOOKS="${FORGEWRIGHT_DISABLED_HOOKS:-}"

# Session start max chars for context loading
export FORGEWRIGHT_SESSION_START_MAX_CHARS="${FORGEWRIGHT_SESSION_START_MAX_CHARS:-50000}"

# Tick interval (messages between ticks) - backward compatible default
export FORGEWRIGHT_MEMORY_TICK_INTERVAL="${FORGEWRIGHT_MEMORY_TICK_INTERVAL:-3}"

# Legacy env var support (backward compatible)
export MEMORY_CHECKPOINT_INTERVAL="${MEMORY_CHECKPOINT_INTERVAL:-$FORGEWRIGHT_MEMORY_TICK_INTERVAL}"
export MEMORY_TOKEN_THRESHOLD="${MEMORY_TOKEN_THRESHOLD:-70}"

# Verbose mode (enabled in strict profile)
FORGEWRIGHT_VERBOSE="${FORGEWRIGHT_VERBOSE:-false}"

# ─── Logging Functions ────────────────────────────────────────────────────────

log_debug() {
    if [[ "$FORGEWRIGHT_HOOK_PROFILE" == "strict" ]] || [[ "$FORGEWRIGHT_VERBOSE" == "true" ]]; then
        echo -e "${BLUE}[fw-hook]${NC} DEBUG: $1" >&2
    fi
}

log_info() {
    if [[ "$FORGEWRIGHT_HOOK_PROFILE" != "minimal" ]]; then
        echo -e "${GREEN}[fw-hook]${NC} $1" >&2
    fi
}

log_warn() {
    echo -e "${YELLOW}[fw-hook]${NC} WARNING: $1" >&2
}

log_error() {
    echo -e "${RED}[fw-hook]${NC} ERROR: $1" >&2
}

# ─── Profile Configuration ────────────────────────────────────────────────────

# Profile hooks (using simple string comparison for bash 3.2 compatibility)
get_profile_hooks() {
    local profile="${FORGEWRIGHT_HOOK_PROFILE:-standard}"
    case "$profile" in
        minimal)
            echo "tick"
            ;;
        standard)
            echo "tick checkpoint status"
            ;;
        strict)
            echo "tick checkpoint status verbose token_warn"
            ;;
        *)
            echo "tick checkpoint status"
            ;;
    esac
}

# ─── Hook State ───────────────────────────────────────────────────────────────

# Track if hooks have been initialized this session
HOOKS_INITIALIZED="${HOME}/.forgewright/hooks-initialized-${FORGEWRIGHT_HOOK_PROFILE}"
LAST_TOKEN_CHECK_FILE="${HOME}/.forgewright/last-token-check"

# ─── Helper Functions ─────────────────────────────────────────────────────────

is_hook_enabled() {
    local hook_name="$1"

    # Check if hook is in disabled list
    if [[ -n "$FORGEWRIGHT_DISABLED_HOOKS" ]]; then
        IFS=',' read -ra DISABLED <<< "$FORGEWRIGHT_DISABLED_HOOKS"
        for disabled in "${DISABLED[@]}"; do
            # Trim whitespace
            disabled=$(echo "$disabled" | xargs)
            if [[ "$hook_name" == "$disabled" ]]; then
                log_debug "Hook '$hook_name' is disabled by FORGEWRIGHT_DISABLED_HOOKS"
                return 1
            fi
        done
    fi

    # Check profile
    local profile_hooks
    profile_hooks=$(get_profile_hooks)

    if [[ "$profile_hooks" == *"$hook_name"* ]]; then
        return 0
    fi

    return 1
}

get_session_status() {
    "${MEMORY_SESSION}" status 2>/dev/null || echo "unknown"
}

# ─── Token Threshold Check (strict profile) ───────────────────────────────────

check_token_threshold() {
    local threshold="${MEMORY_TOKEN_THRESHOLD:-70}"

    # In strict profile, warn about token usage
    if [[ "$FORGEWRIGHT_HOOK_PROFILE" == "strict" ]]; then
        # This is a placeholder - actual token counting would require integration
        # with the Claude Code process or a token counter tool
        log_debug "Token threshold check: threshold=$threshold%"
    fi
}

# ─── Hook Implementations ────────────────────────────────────────────────────

hook_tick() {
    log_debug "Executing tick hook"
    "${MEMORY_SESSION}" tick
}

hook_checkpoint() {
    log_debug "Executing checkpoint hook"
    "${MEMORY_SESSION}" checkpoint
}

hook_status() {
    log_debug "Executing status hook"
    "${MEMORY_SESSION}" status
}

hook_verbose() {
    local status
    status=$(get_session_status)
    log_info "Session status: $status"
}

hook_token_warn() {
    if [[ "$FORGEWRIGHT_HOOK_PROFILE" == "strict" ]]; then
        local threshold="${MEMORY_TOKEN_THRESHOLD:-70}"
        log_warn "Running in strict mode - token threshold: ${threshold}%"
        check_token_threshold
    fi
}

hook_resume() {
    log_debug "Executing resume hook (session resume)"
    "${MEMORY_SESSION}" resume
}

# ─── Command Router ──────────────────────────────────────────────────────────

main() {
    local action="${1:-}"

    # Initialize hooks if needed (first run this profile)
    if [[ ! -f "$HOOKS_INITIALIZED" ]]; then
        log_debug "Initializing hooks for profile: $FORGEWRIGHT_HOOK_PROFILE"
        mkdir -p "$(dirname "$HOOKS_INITIALIZED")"
        touch "$HOOKS_INITIALIZED"

        # Token warning in strict mode
        if [[ "$FORGEWRIGHT_HOOK_PROFILE" == "strict" ]]; then
            hook_token_warn
        fi
    fi

    # Route to appropriate hook
    case "${action}" in
        tick|post_message)
            if is_hook_enabled "tick"; then
                hook_tick
            fi
            ;;

        checkpoint|post_write)
            if is_hook_enabled "checkpoint"; then
                hook_checkpoint
            fi
            ;;

        resume|pre_message)
            if is_hook_enabled "tick"; then
                hook_resume
            fi
            ;;

        status)
            if is_hook_enabled "status"; then
                hook_status
            fi
            ;;

        verbose)
            if is_hook_enabled "verbose"; then
                hook_verbose
            fi
            ;;

        token_warn)
            if is_hook_enabled "token_warn"; then
                hook_token_warn
            fi
            ;;

        profile)
            # Debug: show current profile
            echo "Profile: $FORGEWRIGHT_HOOK_PROFILE"
            echo "Disabled hooks: ${FORGEWRIGHT_DISABLED_HOOKS:-none}"
            echo "Tick interval: $FORGEWRIGHT_MEMORY_TICK_INTERVAL"
            echo "Session start max chars: $FORGEWRIGHT_SESSION_START_MAX_CHARS"
            ;;

        *)
            # Default behavior: run status check if enabled (backward compatible)
            if is_hook_enabled "status"; then
                "${MEMORY_SESSION}" status 2>/dev/null || true
            fi
            ;;
    esac
}

main "$@"
