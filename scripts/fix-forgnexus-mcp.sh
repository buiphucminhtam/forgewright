#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# fix-forgnexus-mcp — Add ForgeNexus MCP server to Cursor global config
#
# Usage:
#   ./scripts/fix-forgnexus-mcp.sh
#   ./scripts/fix-forgnexus-mcp.sh --check    # Dry run
#   ./scripts/fix-forgnexus-mcp.sh --undo     # Rollback
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
FORGEWRIGHT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
FORGENEXUS_PATH="${FORGEWRIGHT_ROOT}/forgenexus/dist/mcp/server.js"
MCP_CONFIG="${HOME}/.cursor/mcp.json"

# ─── Colors ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step()  { echo -e "${BLUE}  ➜${NC} $1"; }
log_ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}  ⚠${NC} $1"; }
log_error() { echo -e "${RED}  ✗${NC} $1"; }
log_info()  { echo -e "  $1"; }

# ─── Help ──────────────────────────────────────────────────────────────────
show_help() {
    cat << 'EOF'
fix-forgnexus-mcp — Add ForgeNexus MCP server to Cursor

USAGE:
  fix-forgnexus-mcp.sh [OPTIONS]

OPTIONS:
  --check    Dry run - show what would be changed
  --undo     Rollback to previous backup
  --help     Show this help

EXAMPLES:
  ./scripts/fix-forgnexus-mcp.sh        # Run the fix
  ./scripts/fix-forgnexus-mcp.sh --check # Preview changes
EOF
}

# ─── Parse Args ────────────────────────────────────────────────────────────
DRY_RUN="false"
UNDO="false"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --check) DRY_RUN="true"; shift ;;
        --undo)  UNDO="true"; shift ;;
        --help)  show_help; exit 0 ;;
        *)       echo "Unknown option: $1"; show_help; exit 1 ;;
    esac
done

# ─── Rollback ───────────────────────────────────────────────────────────────
rollback() {
    local backup
    backup=$(ls -t "${MCP_CONFIG}.backup-"* 2>/dev/null | head -1)
    
    if [[ -z "$backup" ]]; then
        log_error "No backup found to restore"
        exit 1
    fi
    
    log_step "Rolling back to: $backup"
    cp "$backup" "$MCP_CONFIG"
    log_ok "Rolled back successfully"
    log_info "Config restored to:"
    jq '.' "$MCP_CONFIG"
}

if [[ "$UNDO" == "true" ]]; then
    rollback
    exit 0
fi

# ─── Step 1: Prerequisites ─────────────────────────────────────────────────
echo ""
echo "━━━ ForgeNexus MCP Fix ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log_step "Checking prerequisites..."

# Check ForgeNexus MCP server
if [[ ! -f "$FORGENEXUS_PATH" ]]; then
    log_error "ForgeNexus MCP server not found:"
    log_info "  $FORGENEXUS_PATH"
    echo ""
    log_info "Build it first:"
    log_info "  cd forgenexus && npm run build"
    exit 1
fi
log_ok "ForgeNexus MCP server: $FORGENEXUS_PATH"

# Check MCP config
if [[ ! -f "$MCP_CONFIG" ]]; then
    log_error "MCP config not found: $MCP_CONFIG"
    exit 1
fi
log_ok "MCP config: $MCP_CONFIG"

# Check jq
if ! command -v jq &> /dev/null; then
    log_warn "jq not found - installing..."
    if command -v brew &> /dev/null; then
        brew install jq
    elif command -v apt &> /dev/null; then
        sudo apt install jq
    else
        log_error "Cannot install jq automatically. Please install it manually:"
        log_info "  macOS: brew install jq"
        log_info "  Ubuntu: sudo apt install jq"
        exit 1
    fi
fi
log_ok "jq installed"

# ─── Step 2: Backup ─────────────────────────────────────────────────────────
log_step "Creating backup..."
BACKUP="${MCP_CONFIG}.backup-$(date +%Y%m%d-%H%M%S)"
cp "$MCP_CONFIG" "$BACKUP"
log_ok "Backup: $BACKUP"

# ─── Step 3: Check Existing ────────────────────────────────────────────────
log_step "Checking existing config..."

CONFIG_CONTENT=$(cat "$MCP_CONFIG")

if echo "$CONFIG_CONTENT" | grep -q '"forgenexus"'; then
    log_warn "forgenexus already exists in MCP config"
    
    if echo "$CONFIG_CONTENT" | grep -q "$FORGENEXUS_PATH"; then
        log_ok "Entry path matches - no changes needed"
        echo ""
        log_info "ForgeNexus MCP is already configured correctly."
        log_info "Restart Cursor to use it."
        exit 0
    else
        log_warn "Path mismatch - updating entry..."
    fi
else
    log_ok "forgenexus not in config - will add"
fi

# ─── Step 4: Add forgenexus Entry ─────────────────────────────────────────
log_step "Adding forgenexus to MCP config..."

# Create the new entry JSON (properly escaped)
cat > /tmp/forgenexus_entry.json << ENTRY
{
  "command": "node",
  "args": [
    "${FORGENEXUS_PATH}",
    "mcp",
    "${FORGEWRIGHT_ROOT}"
  ],
  "cwd": "${FORGEWRIGHT_ROOT}"
}
ENTRY

# Use jq to merge (add or replace)
jq --argjson entry "$(cat /tmp/forgenexus_entry.json)" \
   '.mcpServers.forgenexus = $entry' \
   "$MCP_CONFIG" > /tmp/mcp_config_new.json

# Validate JSON
if ! jq empty /tmp/mcp_config_new.json 2>/dev/null; then
    log_error "Invalid JSON generated - restoring backup"
    cp "$BACKUP" "$MCP_CONFIG"
    rm -f /tmp/forgenexus_entry.json /tmp/mcp_config_new.json
    exit 1
fi

# Apply
cp /tmp/mcp_config_new.json "$MCP_CONFIG"
rm -f /tmp/forgenexus_entry.json /tmp/mcp_config_new.json

log_ok "forgenexus added to MCP config"

# ─── Step 5: Verify ────────────────────────────────────────────────────────
echo ""
log_step "Verification:"
echo ""
log_info "Updated MCP config:"
echo ""
jq '.' "$MCP_CONFIG"

# Count servers
SERVER_COUNT=$(jq '.mcpServers | keys | length' "$MCP_CONFIG")
log_ok "Total MCP servers: $SERVER_COUNT"

# ─── Done ──────────────────────────────────────────────────────────────────
echo ""
echo "━━━ Fix Complete ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_ok "ForgeNexus MCP server added to Cursor config"
echo ""
echo "📌 Next steps:"
echo "   1. Restart Cursor IDE (fully quit and reopen)"
echo "   2. Check MCP tools - you should see forgenexus_* tools"
echo "   3. Test: Ask 'How does auth work in this codebase?'"
echo ""
echo "🔧 Rollback if needed:"
echo "   cp $BACKUP ~/.cursor/mcp.json"
echo ""
echo "━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
