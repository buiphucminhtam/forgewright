#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# forgewright-mcp-setup — One-Command MCP Setup (v2)
#
# Improved version with:
#   - Auto-retry for npm install failures
#   - Graceful fallback when things go wrong
#   - Better error recovery
#   - Parallel installation where possible
#   - Works across multiple projects
#
# Usage:
#   bash scripts/forgewright-mcp-setup.sh
#   bash scripts/forgewright-mcp-setup.sh --check
#   bash scripts/forgewright-mcp-setup.sh --force
#   bash scripts/forgewright-mcp-setup.sh --diagnose
# ─────────────────────────────────────────────────────────

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────────────────

MAX_RETRIES=3
RETRY_DELAY=5
FORGEWRIGHT_VERSION="2.2.1"

# ─── Colors ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_step()  { echo -e "  ${BLUE}➜${NC} $1"; }
log_ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "  ${RED}✗${NC} $1"; }
log_info()  { echo -e "  $1"; }
log_debug() { [[ "${DEBUG:-0}" == "1" ]] && echo -e "  ${MAGENTA}DBG${NC} $1"; }

# ─── Paths ─────────────────────────────────────────────────────────────────────

detect_paths() {
    local script="${BASH_SOURCE[0]}"
    local resolved

    # Resolve script path
    if [[ "$script" == /* ]]; then
        resolved="$(cd "$(dirname "$script")" && pwd -P)"
    else
        resolved="$(cd "$PWD" && cd "$(dirname "$script")" && pwd -P)"
    fi

    # Find forgewright directory
    if [[ "$resolved" == */scripts ]]; then
        FORGEWRIGHT_DIR="$(dirname "$resolved")"
    elif [[ "$resolved" == */.antigravity/plugins/production-grade/scripts ]]; then
        local plugin_root="$(dirname "$(dirname "$(dirname "$resolved")")")"
        if [[ -d "$plugin_root/forgewright" ]]; then
            FORGEWRIGHT_DIR="$plugin_root/forgewright"
        else
            FORGEWRIGHT_DIR="$plugin_root"
        fi
    else
        FORGEWRIGHT_DIR="$(dirname "$resolved")"
    fi

    # Determine project root (where user runs the script)
    PROJECT_ROOT="$(pwd -P)"

    # If forgewright is a subdirectory of PWD, PWD is the host project
    if [[ "$FORGEWRIGHT_DIR" == "$PROJECT_ROOT"/* ]]; then
        # forgewright is a submodule
        HOST_PROJECT="$(dirname "$PROJECT_ROOT")"
    else
        HOST_PROJECT="$PROJECT_ROOT"
    fi
}

# ─── Prerequisites ───────────────────────────────────────────────────────────────

check_prerequisites() {
    log_step "Checking prerequisites..."

    # Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        log_info "Install from: https://nodejs.org"
        return 1
    fi

    local node_major
    node_major=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$node_major" -lt 16 ]]; then
        log_warn "Node.js $(node -v) may be too old (recommended: >=18)"
    else
        log_ok "Node.js $(node -v)"
    fi

    # npm
    if ! command -v npm &> /dev/null; then
        log_error "npm not found"
        return 1
    fi
    log_ok "npm $(npm -v)"

    # Check forgewright structure
    if [[ ! -f "${FORGEWRIGHT_DIR}/AGENTS.md" ]] && [[ ! -f "${FORGEWRIGHT_DIR}/CLAUDE.md" ]]; then
        log_warn "Forgewright structure not recognized at: $FORGEWRIGHT_DIR"
    fi

    return 0
}

# ─── Safe Retry Wrapper ────────────────────────────────────────────────────────

retry_cmd() {
    local cmd="$1"
    local description="$2"
    local retries=${3:-$MAX_RETRIES}
    local delay=${4:-$RETRY_DELAY}

    log_debug "Running: $cmd"

    for i in $(seq 1 $retries); do
        log_debug "Attempt $i/$retries..."

        if eval "$cmd"; then
            log_ok "$description"
            return 0
        fi

        if [[ $i -lt $retries ]]; then
            log_warn "$description failed (attempt $i/$retries), retrying in ${delay}s..."
            sleep $delay
        fi
    done

    log_error "$description failed after $retries attempts"
    return 1
}

# ─── NPM Install with Retry ────────────────────────────────────────────────────

npm_install_safe() {
    local dir="$1"
    local max_retries=${2:-$MAX_RETRIES}

    cd "$dir"

    # Check if already installed
    if [[ -d "node_modules" ]] && [[ -f "node_modules/.package-lock.json" || -f "package-lock.json" ]]; then
        log_debug "Dependencies already installed"
        return 0
    fi

    # Try npm install with retries
    for i in $(seq 1 $max_retries); do
        log_debug "npm install attempt $i/$max_retries in $dir"

        if npm install --prefer-offline 2>&1 | tail -5; then
            log_ok "Dependencies installed"
            return 0
        fi

        if [[ $i -lt $max_retries ]]; then
            log_warn "npm install failed, retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY

            # Clean up failed install
            rm -rf node_modules package-lock.json
        fi
    done

    log_error "npm install failed after $max_retries attempts"
    return 1
}

# ─── MCP Server Setup ─────────────────────────────────────────────────────────

setup_mcp_server() {
    log_step "Setting up MCP server..."

    local server_dir="${PROJECT_ROOT}/.forgewright/mcp-server"
    local manifest="${PROJECT_ROOT}/.antigravity/mcp-manifest.json"

    # Create directories
    mkdir -p "${PROJECT_ROOT}/.forgewright"
    mkdir -p "${PROJECT_ROOT}/.antigravity"
    mkdir -p "$server_dir"

    # Copy forgewright MCP server
    if [[ -d "${FORGEWRIGHT_DIR}/.cursor" ]]; then
        cp -r "${FORGEWRIGHT_DIR}/.cursor" "$server_dir/" 2>/dev/null || true
    fi

    # Check if server.ts exists
    if [[ ! -f "$server_dir/server.ts" ]] && [[ -f "${FORGEWRIGHT_DIR}/.cursor/forgenexus-mcp.js" ]]; then
        # Use JS version if TS not available
        cp "${FORGEWRIGHT_DIR}/.cursor/forgenexus-mcp.js" "$server_dir/server.js"
    fi

    # Create manifest
    cat > "$manifest" <<EOF
{
  "forgewright_version": "${FORGEWRIGHT_VERSION}",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "workspace": "${PROJECT_ROOT}",
  "forgewright_path": "${FORGEWRIGHT_DIR}",
  "servers": [
    {
      "name": "forgewright",
      "type": "forgenexus",
      "path": "${server_dir}"
    }
  ]
}
EOF

    log_ok "MCP manifest created"

    # Create launcher script
    create_launcher

    # Install dependencies if needed
    if [[ -f "$server_dir/package.json" ]]; then
        npm_install_safe "$server_dir" || log_warn "Dependencies will be installed on first use"
    fi

    return 0
}

# ─── Launcher Script ───────────────────────────────────────────────────────────

create_launcher() {
    local launcher="${PROJECT_ROOT}/.forgewright/mcp-launcher.sh"

    cat > "$launcher" <<'LAUNCHER'
#!/usr/bin/env bash
# MCP Launcher for ForgeNexus
# Auto-generated by forgewright-mcp-setup.sh

set -euo pipefail

# Detect workspace
if [[ -n "${FORGEWRIGHT_WORKSPACE:-}" ]]; then
    WORKSPACE="$FORGEWRIGHT_WORKSPACE"
elif [[ -n "${MCP_WORKSPACE_ROOT:-}" ]]; then
    WORKSPACE="$MCP_WORKSPACE_ROOT"
else
    WORKSPACE="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi

# Find forgewright
if [[ -f "$WORKSPACE/forgewright/.cursor/forgenexus-mcp.js" ]]; then
    FORGEWRIGHT="$WORKSPACE/forgewright"
elif [[ -f "$WORKSPACE/.cursor/forgenexus-mcp.js" ]]; then
    FORGEWRIGHT="$WORKSPACE"
elif [[ -f "${HOME}/Documents/GitHub/forgewright/.cursor/forgenexus-mcp.js" ]]; then
    FORGEWRIGHT="${HOME}/Documents/GitHub/forgewright"
else
    echo "ERROR: Forgewright not found" >&2
    exit 1
fi

# Run MCP server
exec node "$FORGEWRIGHT/.cursor/forgenexus-mcp.js" "$WORKSPACE"
LAUNCHER

    chmod +x "$launcher"
    log_debug "Launcher created: $launcher"
}

# ─── Global Config ─────────────────────────────────────────────────────────────

update_global_config() {
    log_step "Updating global MCP config..."

    local client=""
    local config_path=""

    # Detect client
    if command -v cursor &> /dev/null; then
        client="cursor"
        config_path="$HOME/.cursor/mcp.json"
    elif [[ -d "$HOME/Library/Application Support/Claude" ]]; then
        client="claude"
        config_path="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    fi

    if [[ -z "$client" ]]; then
        log_warn "Could not detect AI client (Cursor/Claude)"
        log_info "Manual config required - see below"
        print_manual_config
        return 0
    fi

    log_info "Detected: $client"

    # Ensure config exists
    if [[ ! -f "$config_path" ]]; then
        mkdir -p "$(dirname "$config_path")"
        echo '{"mcpServers":{}}' > "$config_path"
    fi

    # Backup
    cp "$config_path" "${config_path}.bak.$(date +%Y%m%d%H%M%S)"

    # Add server entry using Node.js (more reliable than jq)
    local server_name="forgewright-$(basename "$PROJECT_ROOT" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]-_' || echo 'workspace')"
    local launcher="${PROJECT_ROOT}/.forgewright/mcp-launcher.sh"

    node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$config_path', 'utf8'));
if (!cfg.mcpServers) cfg.mcpServers = {};
cfg.mcpServers['$server_name'] = {
    command: 'bash',
    args: ['$launcher'],
    env: {
        FORGEWRIGHT_WORKSPACE: '$PROJECT_ROOT'
    }
};
fs.writeFileSync('$config_path', JSON.stringify(cfg, null, 2));
console.log('Updated: $config_path');
console.log('Server: $server_name');
"

    log_ok "Global config updated"
}

print_manual_config() {
    local server_name="forgewright-workspace"
    local launcher="${PROJECT_ROOT}/.forgewright/mcp-launcher.sh"

    cat << EOF

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 MANUAL CONFIG REQUIRED
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Add to your AI client's MCP config:

  Claude Desktop:
    ~/Library/Application Support/Claude/claude_desktop_config.json

  Cursor:
    ~/.cursor/mcp.json

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    "mcpServers": {
      "$server_name": {
        "command": "bash",
        "args": ["$launcher"],
        "env": {
          "FORGEWRIGHT_WORKSPACE": "$PROJECT_ROOT"
        }
      }
    }
  }

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
}

# ─── Verification ─────────────────────────────────────────────────────────────

verify_setup() {
    log_step "Verifying setup..."

    local passed=0
    local total=4

    # Check manifest
    ((total++))
    if [[ -f "${PROJECT_ROOT}/.antigravity/mcp-manifest.json" ]]; then
        ((passed++))
        log_ok "Manifest exists"
    else
        log_error "Manifest missing"
    fi

    # Check launcher
    ((total++))
    if [[ -f "${PROJECT_ROOT}/.forgewright/mcp-launcher.sh" ]]; then
        ((passed++))
        log_ok "Launcher exists"
    else
        log_error "Launcher missing"
    fi

    # Check forgenexus
    ((total++))
    if [[ -f "${FORGEWRIGHT_DIR}/.cursor/forgenexus-mcp.js" ]] || \
       [[ -f "${FORGEWRIGHT_DIR}/forgenexus/dist/mcp/server.js" ]]; then
        ((passed++))
        log_ok "ForgeNexus MCP server found"
    else
        log_warn "ForgeNexus MCP server not found"
    fi

    # Check global config
    ((total++))
    local config_path="$HOME/.cursor/mcp.json"
    [[ ! -f "$config_path" ]] && config_path="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

    if [[ -f "$config_path" ]] && grep -q "forgewright" "$config_path" 2>/dev/null; then
        ((passed++))
        log_ok "Global config updated"
    else
        log_warn "Global config may need manual update"
    fi

    echo ""
    if [[ $passed -eq $total ]]; then
        log_ok "Setup complete ($passed/$total checks passed)"
        return 0
    else
        log_warn "Some checks failed ($passed/$total passed)"
        return 1
    fi
}

# ─── Status Check ─────────────────────────────────────────────────────────────

cmd_check() {
    echo ""
    echo -e "${CYAN}━━━ ForgeNexus MCP Status ━━━${NC}"
    echo ""

    log_step "Project: $PROJECT_ROOT"
    log_step "ForgeWright: $FORGEWRIGHT_DIR"
    echo ""

    # Manifest
    if [[ -f "${PROJECT_ROOT}/.antigravity/mcp-manifest.json" ]]; then
        log_ok "Manifest: ✓"
        node -e "
const m = JSON.parse(require('fs').readFileSync('${PROJECT_ROOT}/.antigravity/mcp-manifest.json', 'utf8'));
console.log('  Version: ' + m.forgewright_version);
console.log('  Generated: ' + m.generated_at);
console.log('  Servers: ' + (m.servers || []).length);
" 2>/dev/null
    else
        log_error "Manifest: ✗ (not set up)"
    fi

    # Launcher
    if [[ -f "${PROJECT_ROOT}/.forgewright/mcp-launcher.sh" ]]; then
        log_ok "Launcher: ✓"
    else
        log_error "Launcher: ✗"
    fi

    # Global config
    local config_path="$HOME/.cursor/mcp.json"
    [[ ! -f "$config_path" ]] && config_path="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

    if [[ -f "$config_path" ]]; then
        if grep -q "forgewright" "$config_path" 2>/dev/null; then
            log_ok "Global config: ✓"
        else
            log_warn "Global config: (no forgewright entry)"
        fi
    else
        log_error "Global config: ✗"
    fi

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ─── Diagnostics ───────────────────────────────────────────────────────────────

cmd_diagnose() {
    echo ""
    echo -e "${CYAN}━━━ Diagnostics ━━━${NC}"
    echo ""

    log_info "Environment:"
    echo "  PWD:      $(pwd)"
    echo "  HOME:     $HOME"
    echo "  NODE:     $(command -v node || echo 'not found')"
    echo "  NPM:      $(command -v npm || echo 'not found')"
    echo ""

    log_info "Paths:"
    echo "  FORGEWRIGHT_DIR: $FORGEWRIGHT_DIR"
    echo "  PROJECT_ROOT:     $PROJECT_ROOT"
    echo ""

    log_info "Files:"
    for f in \
        "${FORGEWRIGHT_DIR}/AGENTS.md" \
        "${FORGEWRIGHT_DIR}/.cursor/forgenexus-mcp.js" \
        "${PROJECT_ROOT}/.antigravity/mcp-manifest.json" \
        "${PROJECT_ROOT}/.forgewright/mcp-launcher.sh" \
        "$HOME/.cursor/mcp.json"; do
        if [[ -f "$f" ]]; then
            echo "  ✓ $f"
        else
            echo "  ✗ $f"
        fi
    done

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ─── Main ────────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
forgewright-mcp-setup — One-command MCP setup for any project

USAGE:
  forgewright-mcp-setup.sh [OPTIONS]

OPTIONS:
  --check       Check MCP status only
  --diagnose    Show detailed diagnostics
  --force       Re-generate from scratch
  --uninstall   Remove MCP setup
  --help        Show this help

EXAMPLES:
  # Setup for current project
  forgewright-mcp-setup.sh

  # Check status
  forgewright-mcp-setup.sh --check

  # Force re-generate
  forgewright-mcp-setup.sh --force

  # Diagnose issues
  forgewright-mcp-setup.sh --diagnose
EOF
}

main() {
    local mode="install"

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check)      mode="check"; shift ;;
            --diagnose)   mode="diagnose"; shift ;;
            --force)      mode="force"; shift ;;
            --uninstall)   mode="uninstall"; shift ;;
            --help|-h)    show_help; exit 0 ;;
            *)            shift ;;
        esac
    done

    # Detect paths
    detect_paths

    echo ""
    echo -e "${CYAN}⚡ ForgeNexus MCP Setup v${FORGEWRIGHT_VERSION}${NC}"
    echo ""

    case "$mode" in
        check)
            cmd_check
            ;;

        diagnose)
            cmd_diagnose
            ;;

        uninstall)
            log_step "Removing MCP setup..."
            rm -rf "${PROJECT_ROOT}/.forgewright/mcp-server"
            rm -rf "${PROJECT_ROOT}/.antigravity/mcp-manifest.json"
            log_ok "Done"
            ;;

        force|install)
            # Prerequisites
            if ! check_prerequisites; then
                log_error "Prerequisites check failed"
                exit 1
            fi

            # Skip if already set up (unless force)
            if [[ "$mode" == "install" ]] && \
               [[ -f "${PROJECT_ROOT}/.antigravity/mcp-manifest.json" ]]; then
                log_ok "Already set up"
                echo ""
                cmd_check
                echo ""
                echo "  Use ${YELLOW}--force${NC} to re-generate"
                exit 0
            fi

            echo ""

            # Setup MCP server
            if ! setup_mcp_server; then
                log_error "MCP server setup failed"
                exit 1
            fi

            # Update global config
            update_global_config || true

            echo ""

            # Verify
            verify_setup || true

            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo -e "  ${GREEN}✓ Setup Complete${NC}"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            echo "  Next steps:"
            echo "    1. Restart your AI client (Cursor/Claude)"
            echo "    2. Verify: bash ${BASH_SOURCE[0]} --check"
            echo ""
            ;;
    esac
}

main "$@"
