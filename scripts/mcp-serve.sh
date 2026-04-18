#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Forgewright MCP Server Manager
# Usage: forgewright-mcp [start|stop|status|config|manifest|launcher]
#
# Supports two modes:
#   1. Standalone: Direct server management for this project
#   2. Workspace-isolated: Uses .antigravity/mcp-manifest.json
#      for Antigravity multi-project conflict-free support
# ─────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MCP_DIR="${PROJECT_ROOT}/.forgewright/mcp-server"
ANTIGRAVITY_DIR="${PROJECT_ROOT}/.antigravity"
MANIFEST_PATH="${ANTIGRAVITY_DIR}/mcp-manifest.json"
PID_FILE="${MCP_DIR}/.mcp-server.pid"

# ─── Colors ───────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}ℹ${NC} $1"; }
log_ok()    { echo -e "${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# ─── Detect Forgewright Submodule Path ────────────────────

detect_forgewright_path() {
    # If forgewright IS this repo, return its path
    if [ -f "${PROJECT_ROOT}/.forgewright/version" ] || [ -f "${PROJECT_ROOT}/VERSION" ]; then
        echo "$PROJECT_ROOT"
        return
    fi

    # Otherwise, find the submodule
    if [ -f "${PROJECT_ROOT}/.git" ]; then
        local fw_path
        fw_path=$(git -C "$PROJECT_ROOT" config --get submodule.forgewright.path 2>/dev/null || true)
        if [ -n "$fw_path" ]; then
            echo "${PROJECT_ROOT}/${fw_path}"
            return
        fi
    fi

    # Fallback: look for forgewright directory
    if [ -d "${PROJECT_ROOT}/forgewright" ]; then
        echo "${PROJECT_ROOT}/forgewright"
        return
    fi

    # Last resort: use SCRIPT_DIR (this script's location)
    echo "$SCRIPT_DIR/.."
}

FORGEWRIGHT_PATH="$(detect_forgewright_path)"
LAUNCHER_PATH="${FORGEWRIGHT_PATH}/scripts/forgewright-mcp-launcher.sh"

# ─── Commands ────────────────────────────────────────────

cmd_start() {
    if [ ! -d "$MCP_DIR" ]; then
        log_error "MCP server not generated yet."
        log_info  "Run '/onboard' or '/mcp' first."
        exit 1
    fi

    if [ ! -f "$MCP_DIR/node_modules/.package-lock.json" ] && [ ! -d "$MCP_DIR/node_modules" ]; then
        log_info "Installing dependencies..."
        (cd "$MCP_DIR" && npm install --silent)
    fi

    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_warn "MCP server already running (PID: $pid)"
            exit 0
        fi
        rm -f "$PID_FILE"
    fi

    log_info "Starting MCP server..."
    (cd "$MCP_DIR" && npx tsx server.ts &)
    echo $! > "$PID_FILE"
    log_ok "MCP server started (PID: $(cat "$PID_FILE"))"
}

cmd_stop() {
    if [ ! -f "$PID_FILE" ]; then
        log_warn "MCP server is not running."
        exit 0
    fi

    local pid
    pid=$(cat "$PID_FILE")

    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid"
        rm -f "$PID_FILE"
        log_ok "MCP server stopped (PID: $pid)"
    else
        rm -f "$PID_FILE"
        log_warn "MCP server was not running (stale PID file cleaned)"
    fi
}

cmd_status() {
    echo ""
    echo "━━━ Forgewright MCP Status ━━━"
    echo ""

    # MCP Server
    if [ -d "$MCP_DIR" ]; then
        log_ok "Server directory: $MCP_DIR"

        if [ -f "$MCP_DIR/mcp-config.json" ]; then
            local tools
            tools=$(grep -c '"enabled": true' "$MCP_DIR/mcp-config.json" 2>/dev/null | head -1 || echo "?")
            log_ok "MCP Config: mcp-config.json (${tools}+ primitives)"
        fi

        if [ -f "$PID_FILE" ]; then
            local pid
            pid=$(cat "$PID_FILE")
            if kill -0 "$pid" 2>/dev/null; then
                log_ok "Running (PID: $pid)"
            else
                log_warn "Not running (stale PID file)"
            fi
        else
            log_info "Not running (use 'start' to launch)"
        fi
    else
        log_warn "MCP server not generated — run '/mcp' or '/onboard'"
    fi

    # Manifest
    echo ""
    if [ -f "$MANIFEST_PATH" ]; then
        log_ok "MCP Manifest: $MANIFEST_PATH"
        local servers
        servers=$(node -e "try{const m=JSON.parse(require('fs').readFileSync('$MANIFEST_PATH','utf8'));console.log(m.servers?.length||0)}catch{console.log(0)}" 2>/dev/null || echo "0")
        log_ok "Servers in manifest: $servers"
    else
        log_warn "MCP Manifest: not found"
        log_info "Run '/mcp' to generate workspace-isolated config"
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

cmd_config() {
    local project_name
    project_name=$(basename "$PROJECT_ROOT")

    echo ""
    echo "━━━ MCP Client Configuration ━━━"
    echo ""
    echo "Choose your integration approach:"
    echo ""

    # Approach 1: Workspace-isolated (recommended for Antigravity)
    echo -e "${CYAN}Approach 1: Workspace-Isolated (RECOMMENDED for Antigravity)${NC}"
    echo "  This enables conflict-free MCP across multiple projects."
    echo ""
    echo "  1. Update Antigravity global config:"
    echo "     File: ~/Library/Application Support/Claude/claude_desktop_config.json"
    echo ""
    cat <<EOF
  {
    "mcpServers": {
      "forgewright-workspace": {
        "command": "bash",
        "args": ["${LAUNCHER_PATH}"],
        "env": {
          "FORGEWRIGHT_WORKSPACE": "\${workspaceFolder}"
        }
      }
    }
  }
EOF
    echo ""
    echo "  2. This project auto-detected via .antigravity/mcp-manifest.json"
    echo "     (Generated by running '/mcp' in this workspace)"
    echo ""

    # Approach 2: Direct (for Cursor, or if Antigravity manifest not set up)
    echo -e "${CYAN}Approach 2: Direct (for Cursor or standalone use)${NC}"
    echo "  File: $PROJECT_ROOT/.cursor/mcp.json"
    echo ""
    cat <<EOF
  {
    "mcpServers": {
      "${project_name}": {
        "command": "npx",
        "args": ["tsx", "${MCP_DIR}/server.ts"]
      }
    }
  }
EOF
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    log_info "Run '/mcp' in this workspace to generate .antigravity/mcp-manifest.json"
}

cmd_manifest() {
    echo ""
    echo "━━━ MCP Manifest ━━━"
    echo ""

    if [ -f "$MANIFEST_PATH" ]; then
        log_ok "Manifest found: $MANIFEST_PATH"
        echo ""
        node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST_PATH', 'utf8'));
console.log('  Version:   ', m.manifest_version);
console.log('  Workspace: ', m.workspace);
console.log('  Generated: ', m.generated_at);
console.log('  Forgewright:', m.forgewright_version);
console.log('');
console.log('  Servers:');
if (m.servers && m.servers.length > 0) {
    m.servers.forEach(s => {
        const status = s.enabled ? 'enabled' : 'disabled';
        console.log('    -', s.name, '(' + s.type + ') [' + status + ']');
    });
} else {
    console.log('    (none)');
}
" 2>/dev/null
    else
        log_warn "No manifest found at $MANIFEST_PATH"
        log_info "Run '/mcp' to generate it"
    fi
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

cmd_launcher() {
    echo ""
    echo "━━━ Workspace Launcher ━━━"
    echo ""

    if [ -f "$LAUNCHER_PATH" ]; then
        log_ok "Launcher found: $LAUNCHER_PATH"
        echo ""
        echo "Usage:"
        echo "  $LAUNCHER_PATH --workspace <path>   Spawn servers for specific workspace"
        echo "  $LAUNCHER_PATH --mode list          List servers in workspace"
        echo "  $LAUNCHER_PATH --mode install       Install dependencies"
        echo ""
        echo "Debug:"
        echo "  FW_MCP_DEBUG=1 $LAUNCHER_PATH ...  Enable debug output"
    else
        log_warn "Launcher not found: $LAUNCHER_PATH"
    fi
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ─── Main ────────────────────────────────────────────────

case "${1:-help}" in
    start)    cmd_start    ;;
    stop)     cmd_stop     ;;
    status)   cmd_status   ;;
    config)   cmd_config   ;;
    manifest) cmd_manifest ;;
    launcher) cmd_launcher ;;
    *)
        echo "forgewright-mcp — MCP Server & Workspace Manager"
        echo ""
        echo "Usage: forgewright-mcp <command>"
        echo ""
        echo "Commands:"
        echo "  start    Start the MCP server (stdio transport)"
        echo "  stop     Stop a running MCP server"
        echo "  status   Show server + manifest status"
        echo "  config   Print client integration snippets"
        echo "  manifest Show MCP manifest details"
        echo "  launcher Show workspace launcher info"
        echo ""
        echo "Quick start:"
        echo "  1. Run '/mcp' in this workspace"
        echo "  2. Update Antigravity global config (see 'config')"
        echo "  3. Restart Antigravity"
        exit 1
        ;;
esac
