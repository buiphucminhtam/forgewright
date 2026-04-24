#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# forgeNexus-quick-setup — Easiest way to set up ForgeNexus MCP
#
# Just run this ONE COMMAND from any project:
#   curl -sL https://raw.githubusercontent.com/buiphucminhtam/forgewright/main/scripts/forgeNexus-quick-setup.sh | bash
#
# Or download and run locally:
#   bash <path-to>/forgeNexus-quick-setup.sh
# ─────────────────────────────────────────────────────────

set -euo pipefail

# Configuration
FORGEWRIGHT_DEFAULT="${HOME}/Documents/GitHub/forgewright"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[i]${NC} $1"; }
success()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()     { echo -e "${YELLOW}[!]${NC} $1"; }
error()    { echo -e "${RED}[✗]${NC} $1"; }

# ─── Main Setup ─────────────────────────────────────────────────────────────

main() {
    local project_root
    project_root="$(pwd -P)"

    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    echo "║  ForgeNexus Quick Setup                         ║"
    echo "║  Project: $(basename "$project_root")                            ║"
    echo "╚══════════════════════════════════════════════════╝"
    echo ""

    # Step 1: Find ForgeWright
    info "Looking for ForgeWright..."
    local fw_dir=""

    # Check common locations
    for dir in \
        "${FORGEWRIGHT_DEFAULT}" \
        "${HOME}/Projects/forgewright" \
        "${HOME}/code/forgewright" \
        "${project_root}/forgewright"; do

        if [[ -f "${dir}/.cursor/forgenexus-mcp.js" ]] || \
           [[ -f "${dir}/forgenexus/dist/cli/index.js" ]]; then
            fw_dir="$dir"
            break
        fi
    done

    # Not found? Use default
    if [[ -z "$fw_dir" ]]; then
        if [[ -d "${FORGEWRIGHT_DEFAULT}" ]]; then
            fw_dir="${FORGEWRIGHT_DEFAULT}"
        else
            error "ForgeWright not found!"
            echo ""
            echo "  Please clone ForgeWright first:"
            echo "    git clone https://github.com/buiphucminhtam/forgewright.git ${FORGEWRIGHT_DEFAULT}"
            exit 1
        fi
    fi

    success "Found ForgeWright at: ${fw_dir}"

    # Step 2: Check ForgeNexus build
    local forgenexus_main="${fw_dir}/forgenexus/dist/cli/index.js"

    if [[ ! -f "$forgenexus_main" ]]; then
        info "Building ForgeNexus..."
        if [[ -f "${fw_dir}/forgenexus/package.json" ]]; then
            cd "${fw_dir}/forgenexus"
            npm install --silent 2>/dev/null || true
            npm run build 2>&1 | tail -3
            cd "$project_root"
        fi
    fi

    if [[ -f "$forgenexus_main" ]]; then
        success "ForgeNexus ready"
    else
        error "ForgeNexus build failed"
        exit 1
    fi

    # Step 3: Detect AI client
    local client=""
    local config_path=""
    local launcher=""

    if command -v cursor &> /dev/null; then
        client="Cursor"
        config_path="$HOME/.cursor/mcp.json"
        launcher="${fw_dir}/.cursor/forgenexus-mcp.js"
    elif [[ -d "$HOME/Library/Application Support/Claude" ]]; then
        client="Claude Desktop"
        config_path="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
        launcher="${fw_dir}/.cursor/forgenexus-mcp.js"
    fi

    if [[ -z "$client" ]]; then
        warn "Could not detect AI client"
        client="Unknown"
    fi

    info "Detected: ${client}"

    # Step 4: Create project manifest
    info "Creating MCP manifest..."
    mkdir -p "${project_root}/.antigravity"

    cat > "${project_root}/.antigravity/mcp-manifest.json" <<EOF
{
  "forgewright_version": "2.2.1",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "workspace": "${project_root}",
  "forgewright_path": "${fw_dir}"
}
EOF
    success "Manifest created"

    # Step 5: Update global MCP config
    if [[ -n "$config_path" ]]; then
        # Create config if not exists
        if [[ ! -f "$config_path" ]]; then
            mkdir -p "$(dirname "$config_path")"
            echo '{"mcpServers":{}}' > "$config_path"
        fi

        # Generate server name from project
        local safe_name
        safe_name=$(basename "$project_root" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' | head -c 20)
        [[ -z "$safe_name" ]] && safe_name="workspace"
        local server_name="forge-${safe_name}"

        info "Adding MCP server: ${server_name}"

        # Update config using Node.js
        node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('${config_path}', 'utf8'));
if (!cfg.mcpServers) cfg.mcpServers = {};
cfg.mcpServers['${server_name}'] = {
    command: 'node',
    args: ['${launcher}'],
    cwd: '${project_root}'
};
fs.writeFileSync('${config_path}', JSON.stringify(cfg, null, 2));
console.log('Config updated');
" && success "Global config updated" || warn "Failed to update config"
    fi

    # ─── Summary ─────────────────────────────────────────────────────────────

    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    echo "║  ✓ Setup Complete                               ║"
    echo "╚══════════════════════════════════════════════════╝"
    echo ""
    echo "  Project:      $(basename "$project_root")"
    echo "  ForgeWright:  $(basename "$fw_dir")"
    echo "  Client:       ${client}"
    echo ""
    echo "  Next steps:"
    echo "    1. Restart your AI client (Cursor/Claude)"
    echo "    2. The MCP server should auto-connect"
    echo ""

    # Show config location
    if [[ -n "$config_path" ]]; then
        echo "  Config file:  ${config_path}"
        echo ""
    fi
}

# Run
main "$@"
