#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# ⚠️ DEPRECATED: Use fw-global-launcher.sh instead
#
# This script redirects to the global launcher.
# Please use:
#   ~/.config/forgewright/global-launcher.sh
#
# After running: bash scripts/fw-global-setup.sh
# ─────────────────────────────────────────────────────────────────

# Try to find the new global launcher
GLOBAL_LAUNCHER="${HOME}/.config/forgewright/global-launcher.sh"

if [[ -f "$GLOBAL_LAUNCHER" ]]; then
    exec bash "$GLOBAL_LAUNCHER" "$@"
else
    # Fallback to the new script in scripts/
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "${SCRIPT_DIR}/fw-global-launcher.sh" ]]; then
        exec bash "${SCRIPT_DIR}/fw-global-launcher.sh" "$@"
    else
        echo -e "\033[0;31m✗ Global launcher not found.\033[0m"
        echo "Run: bash scripts/fw-global-setup.sh"
        exit 1
    fi
fi

# ─────────────────────────────────────────────────────────────────
# LEGACY CODE BELOW - KEPT FOR REFERENCE
# This legacy code is now handled by fw-global-launcher.sh
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Debug Logging ─────────────────────────────────────────────

DEBUG="${FORGEWRIGHT_DEBUG:-0}"

log_debug() {
    if [[ "$DEBUG" == "1" ]]; then
        echo "[forgewright-unified DEBUG] $*" >&2
    fi
}

log_error() {
    echo "[forgewright-unified ERROR] $*" >&2
}

log_info() {
    echo "[forgewright-unified] $*" >&2
}

# ─── Constants ─────────────────────────────────────────────────

FORGEWRIGHT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
FORGEWRIGHT_DIR="${FORGEWRIGHT_DIR%/scripts}"

# ─── Workspace Detection ────────────────────────────────────────

resolve_workspace() {
    local workspace=""

    log_debug "Detecting workspace..."

    # Priority 1: Environment variable (set by Antigravity or user)
    if [[ -n "${FORGEWRIGHT_WORKSPACE:-}" ]]; then
        workspace="$FORGEWRIGHT_WORKSPACE"
        log_debug "  → Using FORGEWRIGHT_WORKSPACE: $workspace"
    # Priority 2: MCP standard workspace root
    elif [[ -n "${MCP_WORKSPACE_ROOT:-}" ]]; then
        workspace="$MCP_WORKSPACE_ROOT"
        log_debug "  → Using MCP_WORKSPACE_ROOT: $workspace"
    # Priority 3: Claude Desktop workspace (standard env var)
    elif [[ -n "${CLAUDE_DESKTOP_WORKSPACE:-}" ]]; then
        workspace="$CLAUDE_DESKTOP_WORKSPACE"
        log_debug "  → Using CLAUDE_DESKTOP_WORKSPACE: $workspace"
    # Priority 4: Git repository root
    elif git rev-parse --show-toplevel 2>/dev/null | grep -q '^/'; then
        workspace="$(git rev-parse --show-toplevel)"
        log_debug "  → Using git root: $workspace"
    # Priority 5: Current working directory
    else
        workspace="$(pwd -P)"
        log_debug "  → Using PWD: $workspace"
    fi

    # Validate and normalize path
    if [[ -z "$workspace" ]]; then
        log_error "Could not determine workspace"
        exit 1
    fi

    # Convert relative to absolute
    if [[ "$workspace" != /* ]]; then
        workspace="$(pwd)/$workspace"
    fi

    # Normalize (resolve symlinks, remove trailing slashes)
    workspace="$(cd "$workspace" 2>/dev/null && pwd -P)" || {
        log_error "Invalid workspace path: $workspace"
        exit 1
    }

    log_debug "  → Resolved workspace: $workspace"

    # Verify workspace exists and is accessible
    if [[ ! -d "$workspace" ]]; then
        log_error "Workspace does not exist or is not accessible: $workspace"
        exit 1
    fi

    echo "$workspace"
}

# ─── GitNexus MCP ──────────────────────────────────────────────

check_gitnexus_mcp() {
    # Check if GitNexus MCP server is available
    if command -v gitnexus &> /dev/null; then
        # Check if gitnexus has mcp command
        if gitnexus mcp --help 2>/dev/null | grep -q "mcp"; then
            return 0
        fi
        # Check if gitnexus mcp is installed as npm package
        if [[ -d "$HOME/.npm/_npx" ]] || npm list -g gitnexus-mcp &>/dev/null; then
            return 0
        fi
    fi
    return 1
}

launch_gitnexus_mcp() {
    local workspace="$1"
    log_debug "Launching GitNexus MCP for $workspace..."

    # Try to find gitnexus MCP binary
    local mcp_bin=""

    # Check common locations
    for path in \
        "$HOME/.npm/_npx/*/node_modules/gitnexus-mcp/dist/index.js" \
        "$(npm root -g)/gitnexus-mcp/dist/index.js" \
        "$HOME/.cargo/bin/gitnexus-mcp"; do
        if [[ -f "$path" ]]; then
            mcp_bin="$path"
            break
        fi
    done

    # If found, launch it
    if [[ -n "$mcp_bin" ]]; then
        log_debug "  → Using GitNexus MCP at: $mcp_bin"
        eval "node '$mcp_bin' '$workspace'"
        return $?
    fi

    log_error "GitNexus MCP not found"
    return 1
}

# ─── ForgeWright MCP Server ────────────────────────────────────

find_forgewright() {
    local workspace="$1"

    log_debug "Searching for forgewright in $workspace..."

    # Pattern 1: .forgewright/ directory in workspace
    if [[ -d "$workspace/.forgewright" ]]; then
        log_debug "  → Found .forgewright in workspace"
        echo "$workspace/.forgewright"
        return 0
    fi

    # Pattern 2: forgewright/ submodule
    if [[ -d "$workspace/forgewright" ]]; then
        log_debug "  → Found forgewright/ submodule"
        echo "$workspace/forgewright"
        return 0
    fi

    # Pattern 3: Look up directory tree for forgewright
    local current="$workspace"
    while [[ "$current" != "/" ]]; do
        if [[ -d "$current/.forgewright" ]]; then
            log_debug "  → Found .forgewright at $current"
            echo "$current/.forgewright"
            return 0
        fi
        if [[ -f "$current/AGENTS.md" ]] || [[ -f "$current/CLAUDE.md" ]]; then
            log_debug "  → Workspace IS the forgewright project"
            echo "$current"
            return 0
        fi
        current="$(dirname "$current")"
    done

    # Pattern 4: Use FORGEWRIGHT_DIR (from script location)
    if [[ -d "${FORGEWRIGHT_DIR}" ]]; then
        log_debug "  → Using FORGEWRIGHT_DIR: $FORGEWRIGHT_DIR"
        echo "$FORGEWRIGHT_DIR"
        return 0
    fi

    log_debug "  → No forgewright found"
    echo ""
    return 1
}

setup_project() {
    local workspace="$1"
    local forgewright="$2"

    log_info "Auto-setting up MCP for $workspace..."

    # Find mcp-generate.sh
    local generate_script=""
    if [[ -f "${forgewright}/scripts/mcp-generate.sh" ]]; then
        generate_script="${forgewright}/scripts/mcp-generate.sh"
    elif [[ -f "${forgewright}/.antigravity/plugins/production-grade/scripts/mcp-generate.sh" ]]; then
        generate_script="${forgewright}/.antigravity/plugins/production-grade/scripts/mcp-generate.sh"
    fi

    if [[ -z "$generate_script" ]]; then
        log_error "Cannot find mcp-generate.sh"
        return 1
    fi

    # Run generation script
    if bash "$generate_script" > /dev/null 2>&1; then
        log_info "  → Setup complete"
        return 0
    else
        log_error "  → Setup failed"
        return 1
    fi
}

resolve_server_cmd() {
    local workspace="$1"
    local forgewright="$2"

    log_debug "Resolving server command..."

    # Check for ForgeWright MCP server
    local mcp_server=""

    # Priority 1: Project's own mcp-server
    if [[ -f "$workspace/.forgewright/mcp-server/server.ts" ]]; then
        mcp_server="$workspace/.forgewright/mcp-server/server.ts"
        log_debug "  → Found project MCP server: $mcp_server"
        echo "npx tsx '$mcp_server'"
        return 0
    fi

    # Priority 2: ForgeWright's mcp-server (if workspace IS forgewright)
    if [[ -f "$forgewright/mcp-server/server.ts" ]]; then
        mcp_server="$forgewright/mcp-server/server.ts"
        log_debug "  → Found forgewright MCP server: $mcp_server"
        echo "npx tsx '$mcp_server'"
        return 0
    fi

    # Priority 3: Look for any server.ts in common locations
    for path in \
        "$workspace/.forgewright/mcp-server/server.ts" \
        "$workspace/mcp/server.ts" \
        "$workspace/forgewright/mcp-server/server.ts"; do
        if [[ -f "$path" ]]; then
            log_debug "  → Found server at common path: $path"
            echo "npx tsx '$path'"
            return 0
        fi
    done

    log_debug "  → No server found"
    return 1
}

# ─── Adaptive Server Selection ──────────────────────────────────

launch_adaptive() {
    local workspace="$1"

    log_debug "=== ForgeWright Unified Launcher ==="
    log_debug "FORGEWRIGHT_WORKSPACE: ${FORGEWRIGHT_WORKSPACE:-<not set>}"
    log_debug "MCP_WORKSPACE_ROOT: ${MCP_WORKSPACE_ROOT:-<not set>}"
    log_debug "PWD: $(pwd)"
    log_debug "FORGEWRIGHT_DIR: $FORGEWRIGHT_DIR"

    # Option 1: Use GitNexus MCP (always works if indexed)
    if [[ "${FORGEWRIGHT_USE_GITNEXUS:-1}" != "0" ]] && check_gitnexus_mcp; then
        log_debug "Using GitNexus MCP (available for all indexed repos)"

        # Check if this repo is indexed
        if gitnexus list 2>/dev/null | grep -q "$(basename "$workspace")"; then
            log_debug "  → Repo is indexed, using GitNexus MCP"
            launch_gitnexus_mcp "$workspace"
            return $?
        fi
    fi

    # Option 2: Use ForgeWright MCP Server
    log_debug "Checking for ForgeWright MCP server..."

    # Find forgewright
    local forgewright
    forgewright="$(find_forgewright "$workspace")" || {
        log_error "ForgeWright not found in workspace: $workspace"
        log_info ""
        log_info "Available options:"
        log_info "  1. Add ForgeWright to project: git submodule add <forgewright-repo>"
        log_info "  2. Use GitNexus: npm install -g gitnexus && gitnexus setup"
        exit 1
    }

    # Find server
    local server_cmd
    if server_cmd="$(resolve_server_cmd "$workspace" "$forgewright")"; then
        log_debug "Found ForgeWright MCP server"
        eval "$server_cmd"
        return $?
    fi

    # Auto-setup if needed
    if [[ "${FORGEWRIGHT_FORCE_SETUP:-0}" == "1" ]] || [[ ! -f "${workspace}/.antigravity/mcp-manifest.json" ]]; then
        if setup_project "$workspace" "$forgewright"; then
            # Try again after setup
            if server_cmd="$(resolve_server_cmd "$workspace" "$forgewright")"; then
                log_debug "Launching server after setup"
                eval "$server_cmd"
                return $?
            fi
        fi
    fi

    # Fallback to GitNexus if available
    if check_gitnexus_mcp; then
        log_info "Falling back to GitNexus MCP..."
        launch_gitnexus_mcp "$workspace"
        return $?
    fi

    log_error "No MCP server available for $workspace"
    log_info ""
    log_info "Solutions:"
    log_info "  1. Run setup in project: bash '$FORGEWRIGHT_DIR/scripts/forgewright-mcp-setup.sh'"
    log_info "  2. Or install GitNexus: npm install -g gitnexus"
    exit 1
}

# ─── Main ─────────────────────────────────────────────────────

main() {
    local workspace

    # Step 1: Detect workspace
    workspace="$(resolve_workspace)" || exit 1

    # Step 2: Launch adaptive MCP server
    launch_adaptive "$workspace"
}

# ─── Entry Point ────────────────────────────────────────────────

main "$@"
