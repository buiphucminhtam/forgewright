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
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Workspace Detection ───────────────────────────────────

resolve_workspace() {
    local workspace

    if [[ -n "${FORGEWRIGHT_WORKSPACE:-}" ]]; then
        workspace="$FORGEWRIGHT_WORKSPACE"
    elif [[ -n "${MCP_WORKSPACE_ROOT:-}" ]]; then
        workspace="$MCP_WORKSPACE_ROOT"
    elif git rev-parse --show-toplevel 2>/dev/null; then
        workspace="$(git rev-parse --show-toplevel)"
    else
        workspace="$(pwd)"
    fi

    if [[ "$workspace" != /* ]]; then
        workspace="$(pwd)/$workspace"
    fi

    workspace="$(cd "$workspace" && pwd -P)"
    echo "$workspace"
}

find_manifest() {
    local workspace="$1"

    if [[ -f "$workspace/.antigravity/mcp-manifest.json" ]]; then
        echo "$workspace/.antigravity/mcp-manifest.json"
    elif [[ -f "$workspace/.forgewright/mcp-manifest.json" ]]; then
        echo "$workspace/.forgewright/mcp-manifest.json"
    else
        echo ""
    fi
}

validate_manifest_path() {
    local path="$1"
    local workspace="$2"

    [[ -f "$path" ]] || return 1

    local real_path real_workspace
    real_path="$(realpath "$path" 2>/dev/null || echo "$path")"
    real_workspace="$(realpath "$workspace" 2>/dev/null || echo "$workspace")"

    [[ "$real_path" == "$real_workspace"/* ]] || return 1

    [[ "$path" != *"/.git/"* ]] && [[ "$path" != *"/.git" ]] || return 1
    [[ "$path" != *"/.env" ]] && [[ "$path" != *"/.env."* ]] || return 1

    return 0
}

# ─── Server Resolution ─────────────────────────────────────

resolve_server_cmd() {
    local workspace="$1"
    local manifest="$2"

    # If no manifest, try local fallback
    if [[ -z "$manifest" ]] || ! validate_manifest_path "$manifest" "$workspace"; then
        local local_server="$workspace/.forgewright/mcp-server/server.ts"
        if [[ -f "$local_server" ]]; then
            echo "npx tsx $local_server"
            return 0
        fi
        return 1
    fi

    # Use node to parse manifest (more reliable than grep for JSON)
    local server_path deps_path cmd

    # Find forgewright-mcp-server
    server_path="$(node -e "
var fs = require('fs');
var path = require('path');
try {
  var m = JSON.parse(fs.readFileSync('$manifest', 'utf8'));
  var server = (m.servers || []).find(function(s){return s.type==='forgewright-mcp-server'&&s.enabled;});
  if (server) {
    var sp = path.join('$workspace', '.forgewright', 'mcp-server', 'server.ts');
    if (fs.existsSync(sp)) process.stdout.write(sp);
    else process.exit(1);
  } else {
    process.exit(1);
  }
} catch(e) { process.exit(1); }
" 2>/dev/null)" || {
        # Fallback to forgenexus
        local fnx_path
        fnx_path="$(node -e "
var fs = require('fs');
var path = require('path');
try {
  var m = JSON.parse(fs.readFileSync('$manifest', 'utf8'));
  var fnx = (m.servers || []).find(function(s){return s.type==='forgenexus'&&s.enabled;});
  if (fnx && fnx.config && fnx.config.forgenexus_path) {
    process.stdout.write(fnx.config.forgenexus_path + '|' + fnx.name);
  } else {
    process.exit(1);
  }
} catch(e) { process.exit(1); }
" 2>/dev/null)" || {
            # Last fallback: local forgewright server
            local local_server="$workspace/.forgewright/mcp-server/server.ts"
            if [[ -f "$local_server" ]]; then
                echo "npx tsx $local_server"
                return 0
            fi
            return 1
        }

        # Parse forgenexus result
        local fnx_binary="${fnx_path%%|*}"
        local fnx_name="${fnx_path#*|}"
        echo "node $fnx_binary mcp $workspace"
        return 0
    }

    # Check node_modules
    deps_path="$(dirname "$server_path")/node_modules"
    if [[ -d "$deps_path" ]]; then
        cmd="npx tsx $server_path"
    else
        cmd="npx --yes tsx $server_path"
    fi

    echo "$cmd"
    return 0
}

# ─── Main ─────────────────────────────────────────────────

main() {
    local workspace manifest server_cmd

    workspace="$(resolve_workspace)"
    manifest="$(find_manifest "$workspace")"

    server_cmd="$(resolve_server_cmd "$workspace" "$manifest")" || {
        echo '[forgewright-launcher] No MCP server found in workspace' >&2
        exit 1
    }

    # Execute MCP server — stdio passthrough
    # The MCP server receives JSON-RPC on stdin and responds on stdout
    eval "$server_cmd"
}

main "$@"
