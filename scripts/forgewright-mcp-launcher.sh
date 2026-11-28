#!/usr/bin/env bash
# Thin compatibility shim -> scripts/mcp/forgewright-mcp-launcher.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/mcp/forgewright-mcp-launcher.sh" "$@"
