#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# ⚠️ DEPRECATED: Use fw-mcp.sh instead
#
# This script is deprecated and has been replaced by the unified
# IDE Adaptive MCP orchestrator: fw-mcp.sh
# ─────────────────────────────────────────────────────────────────

echo -e "\033[0;33m⚠️ WARNING: forgewright-mcp-setup.sh is deprecated.\033[0m"
echo -e "Please use the new unified IDE Adaptive script:"
echo -e "  bash scripts/fw-mcp.sh $@"
echo ""

# Forward the execution to the new script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/fw-mcp.sh" "$@"
