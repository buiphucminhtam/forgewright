#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# forgewright-mcp-launcher — Zero-Friction MCP Workspace Forwarder
#
# A thin bash/stdio bridge for Antigravity MCP integration.
# Detects current workspace, then FORWARDS all MCP protocol traffic
# to the project's forgewright MCP server.
#
# HOW IT WORKS:
#   Antigravity → stdio JSON-RPC → launcher → project's MCP server
#
# USAGE (single entry in claude_desktop_config.json):
#   {
#     "mcpServers": {
#       "forgewright": {
#         "command": "bash",
#         "args": ["/path/to/scripts/forgewright-mcp-launcher.sh"]
#       }
#     }
#   }
#
# DEBUG MODE:
#   FORGEWRIGHT_DEBUG=1 forgewright-mcp-launcher.sh
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Debug Logging ─────────────────────────────────────────────

DEBUG="${FORGEWRIGHT_DEBUG:-0}"

log_debug() {
    if [[ "$DEBUG" == "1" ]]; then
        echo "[forgewright-launcher DEBUG] $*" >&2
    fi
}

log_error() {
    echo "[forgewright-launcher ERROR] $*" >&2
}

log_info() {
    echo "[forgewright-launcher] $*" >&2
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

# ─── Manifest Detection ─────────────────────────────────────────

find_manifest() {
    local workspace="$1"

    log_debug "Searching for manifest in $workspace..."

    # Check .antigravity/ first (Antigravity standard)
    if [[ -f "$workspace/.antigravity/mcp-manifest.json" ]]; then
        log_debug "  → Found: $workspace/.antigravity/mcp-manifest.json"
        echo "$workspace/.antigravity/mcp-manifest.json"
        return 0
    fi

    # Check .forgewright/ (legacy/project-level)
    if [[ -f "$workspace/.forgewright/mcp-manifest.json" ]]; then
        log_debug "  → Found: $workspace/.forgewright/mcp-manifest.json"
        echo "$workspace/.forgewright/mcp-manifest.json"
        return 0
    fi

    # Check root level
    if [[ -f "$workspace/mcp-manifest.json" ]]; then
        log_debug "  → Found: $workspace/mcp-manifest.json"
        echo "$workspace/mcp-manifest.json"
        return 0
    fi

    log_debug "  → No manifest found"
    echo ""
    return 1
}

validate_manifest() {
    local manifest="$1"
    local workspace="$2"

    log_debug "Validating manifest: $manifest"

    # Check file exists
    if [[ ! -f "$manifest" ]]; then
        log_debug "  → Manifest file not found"
        return 1
    fi

    # Check workspace matches
    local manifest_workspace
    manifest_workspace="$(node -e "
        try {
            var m = JSON.parse(require('fs').readFileSync('$manifest', 'utf8'));
            console.log(m.workspace || '');
        } catch(e) {
            console.log('');
        }
    " 2>/dev/null)" || manifest_workspace=""

    if [[ -n "$manifest_workspace" ]]; then
        # Normalize for comparison
        local normalized_manifest
        local normalized_workspace
        normalized_manifest="$(cd "$manifest_workspace" 2>/dev/null && pwd -P)" || normalized_manifest="$manifest_workspace"
        normalized_workspace="$(cd "$workspace" 2>/dev/null && pwd -P)" || normalized_workspace="$workspace"

        if [[ "$normalized_manifest" != "$normalized_workspace" ]]; then
            log_debug "  → Workspace mismatch (expected: $workspace, found: $normalized_manifest)"
            log_debug "  → Manifest may be stale - will regenerate"
            return 2  # Special code for stale manifest
        fi
    fi

    # Check manifest has servers
    local server_count
    server_count="$(node -e "
        try {
            var m = JSON.parse(require('fs').readFileSync('$manifest', 'utf8'));
            console.log((m.servers || []).length);
        } catch(e) {
            console.log('0');
        }
    " 2>/dev/null)" || server_count="0"

    if [[ "$server_count" == "0" ]]; then
        log_debug "  → No servers defined in manifest"
        return 1
    fi

    log_debug "  → Valid manifest with $server_count server(s)"
    return 0
}

# ─── Forgewright Detection ──────────────────────────────────────

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
            # This is the forgewright project itself
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

# ─── Server Resolution ─────────────────────────────────────────

resolve_server_cmd() {
    local workspace="$1"
    local manifest="$2"
    local forgewright="$3"

    log_debug "Resolving server command..."

    # ── Path A: Use manifest to find server ──────────────────────

    if [[ -n "$manifest" ]] && [[ -f "$manifest" ]]; then
        log_debug "  → Parsing manifest..."

        # Find forgewright-mcp-server from manifest
        local server_path
        server_path="$(node -e "
var fs = require('fs');
var path = require('path');
try {
  var m = JSON.parse(fs.readFileSync('$manifest', 'utf8'));
  var server = (m.servers || []).find(function(s){return s.type==='forgewright-mcp-server'&&s.enabled;});
  if (server) {
    var sp = path.join('$workspace', '.forgewright', 'mcp-server', 'server.ts');
    if (fs.existsSync(sp)) {
        process.stdout.write(sp);
    } else {
        process.exit(1);
    }
  } else {
    process.exit(1);
  }
} catch(e) { process.exit(1); }
" 2>/dev/null)" || server_path=""

        if [[ -n "$server_path" ]] && [[ -f "$server_path" ]]; then
            log_debug "  → Found forgewright-mcp-server: $server_path"
            echo "npx tsx $server_path"
            return 0
        fi

        # Try forgenexus from manifest
        local fnx_result
        fnx_result="$(node -e "
var fs = require('fs');
var path = require('path');
try {
  var m = JSON.parse(fs.readFileSync('$manifest', 'utf8'));
  var fnx = (m.servers || []).find(function(s){return s.type==='forgenexus'&&s.enabled;});
  if (fnx && fnx.config && fnx.config.forgenexus_path) {
    process.stdout.write(fnx.config.forgenexus_path);
  } else {
    process.exit(1);
  }
} catch(e) { process.exit(1); }
" 2>/dev/null)" || fnx_result=""

        if [[ -n "$fnx_result" ]] && [[ -f "$fnx_result" ]]; then
            log_debug "  → Found forgenexus: $fnx_result"
            echo "node $fnx_result mcp $workspace"
            return 0
        fi
    fi

    # ── Path B: Scan for forgewright and find MCP server ──────────

    if [[ -n "$forgewright" ]]; then
        local mcp_server="$forgewright/mcp-server/server.ts"
        if [[ -f "$mcp_server" ]]; then
            log_debug "  → Found MCP server at: $mcp_server"
            echo "npx tsx $mcp_server"
            return 0
        fi

        # Try forgewright MCP server (project has its own)
        local project_mcp="$workspace/.forgewright/mcp-server/server.ts"
        if [[ -f "$project_mcp" ]]; then
            log_debug "  → Found project MCP server: $project_mcp"
            echo "npx tsx $project_mcp"
            return 0
        fi
    fi

    # ── Path C: Try common locations ──────────────────────────────

    local common_paths=(
        "$workspace/.forgewright/mcp-server/server.ts"
        "$workspace/mcp/server.ts"
        "$workspace/forgewright/mcp-server/server.ts"
    )

    for path in "${common_paths[@]}"; do
        if [[ -f "$path" ]]; then
            log_debug "  → Found server at common path: $path"
            echo "npx tsx $path"
            return 0
        fi
    done

    log_debug "  → No server found"
    return 1
}

# ─── Manifest Auto-Generation ─────────────────────────────────

auto_generate_manifest() {
    local workspace="$1"
    local forgewright="$2"

    log_debug "Attempting auto-generation of manifest..."

    local forgewright_path=""
    if [[ -d "$workspace/forgewright" ]]; then
        forgewright_path="$workspace/forgewright"
    elif [[ "$forgewright" != "$workspace" ]]; then
        forgewright_path="$forgewright"
    fi

    if [[ -z "$forgewright_path" ]] || [[ ! -f "$forgewright_path/scripts/mcp-generate.sh" ]]; then
        log_debug "  → Cannot auto-generate: mcp-generate.sh not found"
        return 1
    fi

    log_info "Auto-generating MCP manifest for $workspace..."

    # Run generation script
    if bash "$forgewright_path/scripts/mcp-generate.sh" > /dev/null 2>&1; then
        log_info "  → Manifest generated successfully"
        return 0
    else
        log_error "  → Failed to generate manifest"
        return 1
    fi
}

# ─── Main ─────────────────────────────────────────────────────

main() {
    local workspace manifest forgewright server_cmd

    log_debug "=== Forgewright MCP Launcher Started ==="
    log_debug "FORGEWRIGHT_WORKSPACE: ${FORGEWRIGHT_WORKSPACE:-<not set>}"
    log_debug "MCP_WORKSPACE_ROOT: ${MCP_WORKSPACE_ROOT:-<not set>}"
    log_debug "PWD: $(pwd)"
    log_debug "FORGEWRIGHT_DIR: $FORGEWRIGHT_DIR"

    # Step 1: Detect workspace
    workspace="$(resolve_workspace)" || exit 1

    # Step 2: Find forgewright
    forgewright="$(find_forgewright "$workspace")" || {
        log_error "Forgewright not found in workspace: $workspace"
        log_info "To fix: Run 'forgewright-mcp-setup.sh' in the project directory"
        exit 1
    }

    # Step 3: Find manifest
    manifest="$(find_manifest "$workspace")" || manifest=""

    # Step 4: Validate manifest
    if [[ -n "$manifest" ]]; then
        if ! validate_manifest "$manifest" "$workspace"; then
            # Try to auto-generate
            if auto_generate_manifest "$workspace" "$forgewright"; then
                manifest="$(find_manifest "$workspace")" || manifest=""
            else
                manifest=""
            fi
        fi
    fi

    # Step 5: Resolve server command
    server_cmd="$(resolve_server_cmd "$workspace" "$manifest" "$forgewright")" || {
        log_error "Could not find MCP server in workspace: $workspace"
        log_info ""
        log_info "Possible solutions:"
        log_info "  1. Run 'forgewright-mcp-setup.sh' in the project"
        log_info "  2. Ensure .forgewright/mcp-server/server.ts exists"
        log_info "  3. Check that the project has been onboarded"
        exit 1
    }

    log_debug "=== Launching MCP Server ==="
    log_debug "Command: $server_cmd"

    # Step 6: Execute MCP server
    # The MCP server communicates via stdio JSON-RPC
    eval "$server_cmd"
}

# ─── Entry Point ────────────────────────────────────────────────

main "$@"
