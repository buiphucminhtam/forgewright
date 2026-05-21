#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# forgenexus-mcp-launcher — Zero-Friction ForgeNexus MCP Launcher
#
# Detects current workspace and launches ForgeNexus MCP server
# for the correct project.
#
# USAGE:
#   {
#     "mcpServers": {
#       "forgenexus": {
#         "command": "bash",
#         "args": ["/path/to/forgenexus-mcp-launcher.sh"]
#       }
#     }
#   }
#
# DEBUG MODE:
#   FORGENEXUS_DEBUG=1 forgenexus-mcp-launcher.sh
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Debug Logging ─────────────────────────────────────────────

DEBUG="${FORGENEXUS_DEBUG:-0}"

log_debug() {
    if [[ "$DEBUG" == "1" ]]; then
        echo "[forgenexus-launcher DEBUG] $*" >&2
    fi
}

log_error() {
    echo "[forgenexus-launcher ERROR] $*" >&2
}

log_info() {
    echo "[forgenexus-launcher] $*" >&2
}

# ─── Constants ─────────────────────────────────────────────────

FORGENEXUS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
FORGENEXUS_DIR="${FORGENEXUS_DIR%/scripts}"

# ─── Workspace Detection ────────────────────────────────────────

resolve_workspace() {
    local workspace=""

    # Priority 1: Environment variable
    if [[ -n "${FORGENEXUS_WORKSPACE:-}" ]]; then
        workspace="$FORGENEXUS_WORKSPACE"
        log_debug "  → Using FORGENEXUS_WORKSPACE: $workspace"
    elif [[ -n "${MCP_WORKSPACE_ROOT:-}" ]]; then
        workspace="$MCP_WORKSPACE_ROOT"
        log_debug "  → Using MCP_WORKSPACE_ROOT: $workspace"
    elif [[ -n "${FORGEWRIGHT_WORKSPACE:-}" ]]; then
        workspace="$FORGEWRIGHT_WORKSPACE"
        log_debug "  → Using FORGEWRIGHT_WORKSPACE: $workspace"
    elif git rev-parse --show-toplevel 2>/dev/null | grep -q '^/'; then
        workspace="$(git rev-parse --show-toplevel)"
        log_debug "  → Using git root: $workspace"
    else
        workspace="$(pwd -P)"
        log_debug "  → Using PWD: $workspace"
    fi

    # Normalize path
    if [[ -z "$workspace" ]]; then
        log_error "Could not determine workspace"
        exit 1
    fi

    if [[ "$workspace" != /* ]]; then
        workspace="$(pwd)/$workspace"
    fi

    workspace="$(cd "$workspace" 2>/dev/null && pwd -P)" || {
        log_error "Invalid workspace path: $workspace"
        exit 1
    }

    log_debug "  → Resolved workspace: $workspace"
    echo "$workspace"
}

# ─── ForgeNexus Detection ──────────────────────────────────────

find_forgenexus() {
    local workspace="$1"

    log_debug "Searching for ForgeNexus in $workspace..."

    # Pattern 1: forgenexus/ directory in workspace
    if [[ -d "$workspace/forgenexus" ]]; then
        log_debug "  → Found forgenexus/ in workspace"
        echo "$workspace/forgenexus"
        return 0
    fi

    # Pattern 2: .forgenexus/ directory
    if [[ -d "$workspace/.forgenexus" ]]; then
        log_debug "  → Found .forgenexus/ in workspace"
        echo "$workspace/.forgenexus"
        return 0
    fi

    # Pattern 3: Look up directory tree
    local current="$workspace"
    while [[ "$current" != "/" ]]; do
        if [[ -d "$current/forgenexus" ]]; then
            log_debug "  → Found forgenexus/ at $current"
            echo "$current/forgenexus"
            return 0
        fi
        if [[ -d "$current/.forgenexus" ]]; then
            log_debug "  → Found .forgenexus/ at $current"
            echo "$current/.forgenexus"
            return 0
        fi
        current="$(dirname "$current")"
    done

    # Pattern 4: Use FORGENEXUS_DIR (from script location)
    if [[ -d "${FORGENEXUS_DIR}" ]]; then
        log_debug "  → Using FORGENEXUS_DIR: $FORGENEXUS_DIR"
        echo "$FORGENEXUS_DIR"
        return 0
    fi

    log_debug "  → No forgenexus found"
    echo ""
    return 1
}

# ─── Index Detection ───────────────────────────────────────────

has_index() {
    local workspace="$1"
    local forgenexus="$2"

    # Check workspace-level index directory
    if [[ -d "$workspace/.forgenexus" ]]; then
        log_debug "  → Found index at $workspace/.forgenexus/"
        return 0
    fi

    # Check forgenexus-level index
    if [[ -d "$forgenexus/.forgenexus" ]]; then
        log_debug "  → Found index at $forgenexus/.forgenexus/"
        return 0
    fi

    # Check legacy .gitnexus location
    if [[ -d "$workspace/.gitnexus" ]]; then
        log_debug "  → Found legacy index at $workspace/.gitnexus/"
        return 0
    fi

    log_debug "  → No index found"
    return 1
}

# ─── Server Resolution ─────────────────────────────────────────

resolve_server_cmd() {
    local workspace="$1"
    local forgenexus="$2"

    log_debug "Resolving ForgeNexus MCP command..."

    # Find the CLI entry point
    local cli_path=""

    # Check forgenexus/dist/cli/index.js
    if [[ -f "$forgenexus/dist/cli/index.js" ]]; then
        cli_path="$forgenexus/dist/cli/index.js"
        log_debug "  → Found CLI: $cli_path"
    fi

    if [[ -z "$cli_path" ]]; then
        log_error "Could not find ForgeNexus CLI"
        exit 1
    fi

    # Build command with workspace
    echo "node $cli_path mcp $workspace"
}

# ─── Main ─────────────────────────────────────────────────────

main() {
    local workspace forgenexus server_cmd

    log_debug "=== ForgeNexus MCP Launcher Started ==="
    log_debug "FORGENEXUS_WORKSPACE: ${FORGENEXUS_WORKSPACE:-<not set>}"
    log_debug "MCP_WORKSPACE_ROOT: ${MCP_WORKSPACE_ROOT:-<not set>}"
    log_debug "PWD: $(pwd)"
    log_debug "FORGENEXUS_DIR: $FORGENEXUS_DIR"

    # Step 1: Detect workspace
    workspace="$(resolve_workspace)" || exit 1

    # Step 2: Find ForgeNexus
    forgenexus="$(find_forgenexus "$workspace")" || {
        log_error "ForgeNexus not found in workspace: $workspace"
        log_info "To fix: Run 'npx forgenexus setup' in the project directory"
        exit 1
    }

    # Step 3: Check for index
    if ! has_index "$workspace" "$forgenexus"; then
        log_error "ForgeNexus index not found in workspace: $workspace"
        log_info "To fix: Run 'npx forgenexus analyze' in the project directory"
        exit 1
    fi

    # Step 4: Resolve server command
    server_cmd="$(resolve_server_cmd "$workspace" "$forgenexus")" || exit 1

    log_debug "=== Launching ForgeNexus MCP Server ==="
    log_debug "Command: $server_cmd"

    # Step 5: Execute
    eval "$server_cmd"
}

main "$@"
