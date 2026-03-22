#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Forgewright MCP Server Manager
# Usage: forgewright-mcp [start|stop|status|config]
# ─────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MCP_DIR="${PROJECT_ROOT}/.forgewright/mcp-server"
PID_FILE="${MCP_DIR}/.mcp-server.pid"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}ℹ${NC} $1"; }
log_ok()    { echo -e "${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# ─── Commands ────────────────────────────────────────────

cmd_start() {
  if [ ! -d "$MCP_DIR" ]; then
    log_error "MCP server not generated yet."
    log_info  "Run '/onboard' or generate with MCP Generator skill first."
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
  echo "━━━ Forgewright MCP Server Status ━━━"
  echo ""

  if [ ! -d "$MCP_DIR" ]; then
    log_error "Not generated — run /onboard first"
    exit 1
  fi

  log_ok "Server directory: $MCP_DIR"

  if [ -f "$MCP_DIR/mcp-config.json" ]; then
    local tools resources prompts
    tools=$(grep -c '"enabled": true' "$MCP_DIR/mcp-config.json" 2>/dev/null | head -1 || echo "?")
    log_ok "Config: mcp-config.json"
    log_info "Active primitives: see mcp-config.json for details"
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

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

cmd_config() {
  if [ ! -f "$MCP_DIR/mcp-config.json" ]; then
    log_error "MCP config not found. Generate server first."
    exit 1
  fi

  local project_name server_path
  project_name=$(basename "$PROJECT_ROOT")
  server_path="$MCP_DIR/server.ts"

  echo ""
  echo "━━━ MCP Client Configuration ━━━"
  echo ""
  echo "Add this to your MCP client config:"
  echo ""
  echo -e "${YELLOW}Claude Desktop / Antigravity:${NC}"
  echo "  File: ~/Library/Application Support/Claude/claude_desktop_config.json"
  echo ""
  cat <<EOF
  {
    "mcpServers": {
      "${project_name}": {
        "command": "npx",
        "args": ["tsx", "${server_path}"]
      }
    }
  }
EOF
  echo ""
  echo -e "${YELLOW}Cursor:${NC}"
  echo "  File: .cursor/mcp.json"
  echo ""
  cat <<EOF
  {
    "mcpServers": {
      "${project_name}": {
        "command": "npx",
        "args": ["tsx", "${server_path}"]
      }
    }
  }
EOF
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ─── Main ────────────────────────────────────────────────

case "${1:-help}" in
  start)  cmd_start  ;;
  stop)   cmd_stop   ;;
  status) cmd_status ;;
  config) cmd_config ;;
  *)
    echo "Usage: forgewright-mcp [start|stop|status|config]"
    echo ""
    echo "Commands:"
    echo "  start   Start the MCP server (stdio transport)"
    echo "  stop    Stop a running MCP server"
    echo "  status  Show server status and config"
    echo "  config  Print client integration snippets"
    exit 1
    ;;
esac
