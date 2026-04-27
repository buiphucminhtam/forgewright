#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# forgewright-mcp-setup — ONE-COMMAND MCP Setup
#
# Single command to set up MCP for ANY project.
# No manual JSON editing. No path confusion.
#
# Usage (run from any project using Forgewright):
#   bash .antigravity/plugins/production-grade/scripts/forgewright-mcp-setup.sh
#   # or if forgewright IS the project:
#   bash scripts/forgewright-mcp-setup.sh
# ─────────────────────────────────────────────────────────

set -euo pipefail

# ─── Detect Forgewright Location ────────────────────────────────────────────────

# Capture via stdout, pass forgewright path via a global
declare FORGEWRIGHT_DIR=""
declare FORGEWRIGHT_IS_PROJECT="false"

detect_forgewright() {
    local script_path="${BASH_SOURCE[0]}"
    local resolved

    # Resolve BASH_SOURCE[0] to absolute path
    if [[ "$script_path" == /* ]]; then
        resolved="$(cd "$(dirname "$script_path")" && pwd -P)"
    else
        # Relative path — resolve from CWD
        resolved="$(cd "$PWD" && cd "$(dirname "$script_path")" && pwd -P)"
    fi

    # If this script is in scripts/ under forgewright root
    if [[ "$resolved" == */scripts ]]; then
        local possible_fw="$(dirname "$resolved")"
        FORGEWRIGHT_DIR="$possible_fw"

        # Check if this is actually forgewright (has AGENTS.md)
        if [[ -f "${possible_fw}/AGENTS.md" ]] || [[ -f "${possible_fw}/CLAUDE.md" ]]; then
            FORGEWRIGHT_IS_PROJECT="true"
        else
            # forgewright might be a submodule — walk up to find the project root
            local current="$possible_fw"
            while [[ "$current" != "/" ]] && [[ "$current" != "$HOME" ]]; do
                if [[ -f "${current}/AGENTS.md" ]] || [[ -f "${current}/CLAUDE.md" ]]; then
                    FORGEWRIGHT_DIR="$current"
                    FORGEWRIGHT_IS_PROJECT="true"
                    break
                fi
                # Also stop if we find a .git directory (not a file) — this is the repo root
                if [[ -d "${current}/.git" ]]; then
                    # This .git dir means current is the project root
                    FORGEWRIGHT_IS_PROJECT="true"
                    break
                fi
                current="$(dirname "$current")"
            done
            if [[ "$FORGEWRIGHT_IS_PROJECT" != "true" ]]; then
                FORGEWRIGHT_IS_PROJECT="false"
            fi
        fi
    # If this script is in scripts/ under Antigravity plugin
    elif [[ "$resolved" == */.antigravity/plugins/production-grade/scripts ]]; then
        local plugin_root="$(dirname "$(dirname "$(dirname "$resolved")")")"

        # Walk up from plugin_root to find forgewright submodule
        # Common patterns:
        #   project/.antigravity/plugins/production-grade/  <- plugin_root
        #   project/forgewright/                            <- actual forgewright
        #   forgewright/.antigravity/plugins/production-grade/  <- forgewright IS the project
        local current="$plugin_root"
        local found_forgewright=""
        while [[ "$current" != "/" ]] && [[ "$current" != "$HOME" ]]; do
            if [[ -d "${current}/forgewright" ]]; then
                found_forgewright="${current}/forgewright"
                break
            fi
            if [[ -f "${current}/AGENTS.md" ]] || [[ -f "${current}/CLAUDE.md" ]]; then
                # This is the forgewright project itself
                found_forgewright="$current"
                break
            fi
            current="$(dirname "$current")"
        done

        if [[ -n "$found_forgewright" ]]; then
            FORGEWRIGHT_DIR="$found_forgewright"
            # If found_forgewright == plugin_root, forgewright IS the project
            if [[ "$found_forgewright" == "$plugin_root" ]]; then
                FORGEWRIGHT_IS_PROJECT="true"
            else
                FORGEWRIGHT_IS_PROJECT="false"
            fi
        else
            FORGEWRIGHT_DIR="$plugin_root"
            FORGEWRIGHT_IS_PROJECT="false"
        fi
    # Fallback
    else
        FORGEWRIGHT_DIR="$(dirname "$resolved")"
        FORGEWRIGHT_IS_PROJECT="false"
    fi
}

# Detect the actual project root (where the user runs the script from)
# Key insight: if FORGEWRIGHT_DIR is inside PWD, then PWD is the parent project.
detect_actual_project_root() {
    local pwd_root
    pwd_root="$(pwd -P)"

    # If FORGEWRIGHT_DIR is a subdirectory of PWD, PWD is the parent project root
    if [[ "$FORGEWRIGHT_DIR" == "$pwd_root"/* ]]; then
        echo "$pwd_root"
        return
    fi

    # If PWD IS the forgewright root (forgewright IS the project)
    if [[ "$pwd_root" == "$FORGEWRIGHT_DIR" ]]; then
        echo "$FORGEWRIGHT_DIR"
        return
    fi

    # If PWD is a subdirectory of forgewright (e.g., running from forgewright/scripts/)
    if [[ "$pwd_root" == "${FORGEWRIGHT_DIR}"/* ]]; then
        echo "$FORGEWRIGHT_DIR"
        return
    fi

    # PWD is outside forgewright — it's the host project
    echo "$pwd_root"
}

# Alias for backward compatibility
detect_project_root() {
    detect_actual_project_root
}

# ─── Colors ──────────────────────────────────────────────────────────────────

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

# ─── CLI ──────────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
forgewright-mcp-setup — One-command MCP setup for any project

USAGE:
  forgewright-mcp-setup.sh [OPTIONS]

OPTIONS:
  --check       Check MCP status only (no changes)
  --force       Re-generate even if already set up
  --uninstall   Remove MCP setup from this project
  --diagnose    Show detailed diagnostics
  --help        Show this help

EXAMPLES:
  # Set up MCP for this project
  forgewright-mcp-setup.sh

  # Check status
  forgewright-mcp-setup.sh --check

  # Re-generate from scratch
  forgewright-mcp-setup.sh --force

  # Diagnose problems
  forgewright-mcp-setup.sh --diagnose

QUICK START (from any project using Forgewright):
  bash <forgewright>/scripts/forgewright-mcp-setup.sh
EOF
}

# ─── Prerequisite Checks ───────────────────────────────────────────────────────

check_prerequisites() {
    log_step "Checking prerequisites..."

    # Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Install Node.js >= 18:"
        log_info "  macOS: brew install node"
        log_info "  Linux: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -"
        log_info "  Windows: https://nodejs.org"
        exit 1
    fi

    local node_version
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$node_version" -lt 18 ]]; then
        log_error "Node.js version too old (found $(node -v), need >=18)"
        exit 1
    fi
    log_ok "Node.js $(node -v)"

    # Check forgewright dir
    if [[ ! -f "${FORGEWRIGHT_DIR}/scripts/mcp-generate.sh" ]]; then
        log_error "Forgewright MCP scripts not found at:"
        log_info "  $FORGEWRIGHT_DIR"
        exit 1
    fi
    log_ok "Forgewright found at $FORGEWRIGHT_DIR"
}

# ─── Step 1b: Detect Shell Compressor ────────────────────────────────────────

detect_shell_compressor() {
    log_step "Detecting shell output compressor..."

    local compressor="forgewright-shell-filter"

    if command -v rtk &> /dev/null; then
        compressor="rtk"; log_ok "Found: RTK (Rust Token Killer) — 60-90% compression"
    elif command -v chop &> /dev/null; then
        compressor="chop"; log_ok "Found: chop — RTK fork"
    elif command -v snip &> /dev/null; then
        compressor="snip"; log_ok "Found: snip — RTK variant"
    elif command -v ctx &> /dev/null; then
        compressor="ctx"; log_ok "Found: ctx (context-mode)"
    elif command -v tkill &> /dev/null; then
        compressor="tkill"; log_ok "Found: tkill"
    else
        log_ok "Using: forgewright-shell-filter (native awk/sed)"
    fi

    echo "$compressor"
}

write_forgewright_settings() {
    log_step "Writing Forgewright settings..."

    local settings_dir="${PROJECT_ROOT}/.forgewright"
    local settings_file="${settings_dir}/settings.env"

    mkdir -p "$settings_dir"

    local SHELL_COMPRESSOR=""
    if command -v rtk &> /dev/null; then SHELL_COMPRESSOR="rtk"
    elif command -v chop &> /dev/null; then SHELL_COMPRESSOR="chop"
    elif command -v snip &> /dev/null; then SHELL_COMPRESSOR="snip"
    elif command -v ctx &> /dev/null; then SHELL_COMPRESSOR="ctx"
    elif command -v tkill &> /dev/null; then SHELL_COMPRESSOR="tkill"
    else SHELL_COMPRESSOR="forgewright-shell-filter"; fi

    cat > "$settings_file" <<SETTINGS_EOF
# Forgewright Settings
# Generated by forgewright-mcp-setup.sh

# Shell output compressor (rtk > chop > snip > ctx > tkill > forgewright-shell-filter)
export FORGEWRIGHT_SHELL_COMPRESSOR="${SHELL_COMPRESSOR}"

# Path to native shell filter (fallback)
export FORGEWRIGHT_SHELL_FILTER_PATH="${FORGEWRIGHT_DIR}/scripts/forgewright-shell-filter.sh"

# Token budget for LLM context (tokens)
export FORGEWRIGHT_TOKEN_BUDGET="120000"

# Session deduplication window (turns)
export FORGEWRIGHT_DEDUP_WINDOW="10"

# Enable/disable features
export FORGEWRIGHT_SESSION_DEDUP="true"
export FORGEWRIGHT_TOOL_SANDBOX="true"
export FORGEWRIGHT_MEMORY_ENABLED="true"

# Code navigation tool (token-savior > forgenexus)
if command -v token-savior &> /dev/null; then
    export FORGEWRIGHT_CODE_NAV="token-savior"
    log_ok "Found: Token-Savior — 97% navigation token reduction"
else
    export FORGEWRIGHT_CODE_NAV="forgenexus"
fi

# Memory vector store (token-savior > sqlite)
if command -v token-savior &> /dev/null; then
    export FORGEWRIGHT_MEMORY_VECTOR="token-savior"
else
    export FORGEWRIGHT_MEMORY_VECTOR="sqlite"  # Uses mem0-v2.py
fi
SETTINGS_EOF

    chmod 644 "$settings_file"
    log_ok "Settings written to $settings_file"
}

# ─── Step 1: Generate MCP Server ───────────────────────────────────────────────

setup_mcp_server() {
    log_step "Generating MCP server..."
    bash "${FORGEWRIGHT_DIR}/scripts/mcp-generate.sh" > /dev/null 2>&1
    if [[ $? -eq 0 ]]; then
        log_ok "MCP server generated"
    else
        log_error "Failed to generate MCP server"
        exit 1
    fi
}

# ─── Step 2: Verify Manifest ────────────────────────────────────────────────

verify_manifest() {
    local manifest="${PROJECT_ROOT}/.antigravity/mcp-manifest.json"

    if [[ ! -f "$manifest" ]]; then
        log_error "Manifest not found: $manifest"
        return 1
    fi

    local ws_path
    ws_path=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$manifest','utf8')).workspace)}catch{e}" 2>/dev/null)

    if [[ "$ws_path" != "$PROJECT_ROOT" ]]; then
        log_warn "Manifest workspace mismatch:"
        log_info "  Expected: $PROJECT_ROOT"
        log_info "  Found:   $ws_path"
        return 1
    fi

    log_ok "Manifest verified"
}

# ─── Step 3: Update Global Config ─────────────────────────────────────────

get_client_type() {
    if command -v cursor &> /dev/null; then
        echo "cursor"
    elif [[ -d "$HOME/Library/Application Support/Claude" ]]; then
        echo "claude"
    elif [[ -d "$HOME/.config/Claude" ]]; then
        echo "claude"
    else
        echo "unknown"
    fi
}

get_config_path() {
    local client="$1"

    case "$client" in
        claude)
            echo "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
            ;;
        cursor)
            echo "$HOME/.cursor/mcp.json"
            ;;
        *)
            echo ""
            ;;
    esac
}

update_global_config() {
    local client="$1"
    local config_path
    config_path="$(get_config_path "$client")"

    log_step "Updating $client global config..."

    if [[ "$client" == "unknown" ]]; then
        log_warn "Could not detect AI client (Cursor/Claude). Manual config needed."
        print_manual_config
        return 0
    fi

    if [[ ! -f "$config_path" ]]; then
        log_warn "Config not found: $config_path"
        log_info "Creating new config..."
        mkdir -p "$(dirname "$config_path")"
        echo '{"mcpServers":{}}' > "$config_path"
    fi

    # Create backup
    cp "$config_path" "${config_path}.bak.$(date +%Y%m%d%H%M%S)"

    # Update config with jq
    local server_name="forgewright-workspace"
    local launcher_path="${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-launcher.sh"

    local new_config
    new_config=$(node -e "
var fs = require('fs');
var cfg;
try {
    cfg = JSON.parse(fs.readFileSync('$config_path', 'utf8'));
} catch(e) {
    cfg = {mcpServers: {}};
}
if (!cfg.mcpServers) cfg.mcpServers = {};
cfg.mcpServers['$server_name'] = {
    command: 'bash',
    args: ['$launcher_path'],
    env: {
        FORGEWRIGHT_WORKSPACE: '$PROJECT_ROOT'
    }
};
console.log(JSON.stringify(cfg, null, 2));
" 2>/dev/null) || {
        log_error "Failed to update config"
        return 1
    }

    echo "$new_config" > "$config_path"
    log_ok "Updated $config_path"
    log_info "  Server name: $server_name"
    log_info "  Workspace: $PROJECT_ROOT"
}

print_manual_config() {
    local server_name="forgewright-workspace"
    local launcher_path="${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-launcher.sh"

    cat << EOF

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 MANUAL CONFIG REQUIRED
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Add to your client's MCP config:

  Claude Desktop:
    ~/Library/Application Support/Claude/claude_desktop_config.json

  Cursor:
    ~/.cursor/mcp.json

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    "mcpServers": {
      "$server_name": {
        "command": "bash",
        "args": ["$launcher_path"],
        "env": {
          "FORGEWRIGHT_WORKSPACE": "$PROJECT_ROOT"
        }
      }
    }
  }

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
}

# ─── Step 4: Verify Installation ────────────────────────────────────────────

verify_installation() {
    log_step "Verifying installation..."

    local manifest="${PROJECT_ROOT}/.antigravity/mcp-manifest.json"
    local server_dir="${PROJECT_ROOT}/.forgewright/mcp-server"

    local checks=0
    local passed=0

    # Check manifest
    ((checks++))
    if [[ -f "$manifest" ]]; then
        ((passed++))
        log_ok "Manifest exists"
    else
        log_error "Manifest missing"
    fi

    # Check server
    ((checks++))
    if [[ -d "$server_dir" ]]; then
        ((passed++))
        log_ok "Server directory exists"
    else
        log_error "Server directory missing"
    fi

    # Check server.ts
    ((checks++))
    if [[ -f "$server_dir/server.ts" ]]; then
        ((passed++))
        log_ok "server.ts exists"
    else
        log_error "server.ts missing"
    fi

    # Check deps
    ((checks++))
    if [[ -d "$server_dir/node_modules" ]]; then
        ((passed++))
        log_ok "Dependencies installed"
    else
        log_warn "Dependencies not installed (will auto-install on first use)"
    fi

    # Run forgenexus doctor
    if [[ -f "${FORGEWRIGHT_DIR}/forgenexus/dist/cli/index.js" ]]; then
        ((checks++))
        log_step "Running ForgeNexus diagnostics..."
        node "${FORGEWRIGHT_DIR}/forgenexus/dist/cli/index.js" doctor "${PROJECT_ROOT}" 2>/dev/null || {
            log_warn "ForgeNexus doctor failed (index may not exist yet)"
        }
        ((passed++))
    fi

    return 0
}

# ─── Command: Check ────────────────────────────────────────────────────────

cmd_check() {
    local client
    client="$(get_client_type)"
    local config_path
    config_path="$(get_config_path "$client")"
    local manifest="${PROJECT_ROOT}/.antigravity/mcp-manifest.json"
    local server_dir="${PROJECT_ROOT}/.forgewright/mcp-server"

    echo ""
    echo "━━━ MCP Status ━━━"
    echo ""

    # Project setup
    log_step "Project: $PROJECT_ROOT"
    echo ""

    # Manifest
    if [[ -f "$manifest" ]]; then
        log_ok "Manifest: $manifest"
        node -e "
var m = JSON.parse(require('fs').readFileSync('$manifest', 'utf8'));
console.log('  Servers: ' + (m.servers || []).length + ' configured');
console.log('  Version: ' + m.forgewright_version);
console.log('  Generated: ' + m.generated_at);
" 2>/dev/null
    else
        log_error "Manifest: NOT FOUND (run setup)"
    fi
    echo ""

    # Server
    if [[ -d "$server_dir" ]]; then
        log_ok "Server: $server_dir"
    else
        log_error "Server: NOT FOUND (run setup)"
    fi
    echo ""

    # ForgeNexus status
    if [[ -f "${FORGEWRIGHT_DIR}/forgenexus/dist/cli/index.js" ]]; then
        log_step "ForgeNexus: Running quick check..."
        node "${FORGEWRIGHT_DIR}/forgenexus/dist/cli/index.js" check "${PROJECT_ROOT}" 2>/dev/null || true
    fi
    echo ""

    # Global config
    if [[ "$client" != "unknown" ]]; then
        log_ok "AI Client: $client"
        if [[ -f "$config_path" ]]; then
            log_ok "Config: $config_path"
    # Check if this workspace is configured
    local server_pattern="forgewright-$(basename "$PROJECT_ROOT")"
    local generic_pattern="forgewright-workspace"
    if grep -q "$server_pattern" "$config_path" 2>/dev/null; then
        log_ok "Server entry: FOUND ($server_pattern)"
    elif grep -q "$generic_pattern" "$config_path" 2>/dev/null; then
        log_ok "Server entry: FOUND ($generic_pattern — shared config)"
        log_info "  Note: Using shared workspace config"
    else
        log_warn "Server entry: NOT FOUND in config"
    fi
        else
            log_error "Config: NOT FOUND"
        fi
    else
        log_warn "AI Client: UNKNOWN (could not detect)"
    fi
    echo ""

    # Settings
    local settings_file="${PROJECT_ROOT}/.forgewright/settings.env"
    if [[ -f "$settings_file" ]]; then
        log_ok "Settings: $settings_file"
        local compressor
        compressor=$(grep FORGEWRIGHT_SHELL_COMPRESSOR "$settings_file" 2>/dev/null | cut -d'"' -f2)
        if [[ -n "$compressor" ]]; then
            echo "  Compressor: $compressor"
        fi
    else
        log_warn "Settings: NOT FOUND (.forgewright/settings.env)"
    fi
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━"
}

# ─── Command: Diagnose ─────────────────────────────────────────────────────

cmd_diagnose() {
    echo ""
    echo "━━━ MCP Diagnostics ━━━"
    echo ""

    log_step "Environment"
    echo "  PWD:        $(pwd)"
    echo "  FORGEWRIGHT_WORKSPACE: ${FORGEWRIGHT_WORKSPACE:-<not set>}"
    echo "  MCP_WORKSPACE_ROOT:   ${MCP_WORKSPACE_ROOT:-<not set>}"
    echo ""

    log_step "Forgewright"
    echo "  DIR:     $FORGEWRIGHT_DIR"
    echo "  PROJECT: $PROJECT_ROOT"
    echo "  EXISTS:  $([ -d "$FORGEWRIGHT_DIR" ] && echo YES || echo NO)"
    echo ""

    log_step "Manifest"
    local manifest="${PROJECT_ROOT}/.antigravity/mcp-manifest.json"
    echo "  PATH:  $manifest"
    echo "  EXISTS: $([ -f "$manifest" ] && echo YES || echo NO)"
    if [[ -f "$manifest" ]]; then
        local ws_path
        ws_path=$(node -e "
var m = JSON.parse(require('fs').readFileSync('$manifest', 'utf8'));
console.log(m.workspace || 'ERROR');
" 2>/dev/null)
        echo "  WS:     $ws_path"
    fi
    echo ""

    log_step "Server"
    local server_dir="${PROJECT_ROOT}/.forgewright/mcp-server"
    echo "  PATH:  $server_dir"
    echo "  EXISTS: $([ -d "$server_dir" ] && echo YES || echo NO)"
    echo ""

    log_step "Global Config"
    local client
    client="$(get_client_type)"
    echo "  CLIENT: $client"
    local config_path
    config_path="$(get_client_type "$client")"
    config_path="$(get_config_path "$client")"
    echo "  PATH:  $config_path"
    echo "  EXISTS: $([ -f "$config_path" ] && echo YES || echo NO)"
    echo ""

    log_step "Workspace Detection (launcher)"
    echo "  git rev-parse: $(git rev-parse --show-toplevel 2>/dev/null || echo '<not a git repo>')"
    echo ""

    log_step "Node.js"
    echo "  VERSION: $(node -v)"
    echo "  PATH:    $(command -v node)"
    echo ""

    echo "━━━━━━━━━━━━━━━━━━"
}

# ─── Command: Uninstall ──────────────────────────────────────────────────

cmd_uninstall() {
    log_step "Removing MCP setup from this project..."

    rm -rf "${PROJECT_ROOT}/.forgewright/mcp-server"
    rm -rf "${PROJECT_ROOT}/.antigravity/mcp-manifest.json"

    # Remove from global config
    local client
    client="$(get_client_type)"
    local config_path
    config_path="$(get_config_path "$client")"

    if [[ -f "$config_path" ]]; then
        local server_name="forgewright-workspace"
        node -e "
var fs = require('fs');
var cfg = JSON.parse(fs.readFileSync('$config_path', 'utf8'));
delete cfg.mcpServers['$server_name'];
fs.writeFileSync('$config_path', JSON.stringify(cfg, null, 2));
" 2>/dev/null
        log_ok "Removed from $config_path"
    fi

    log_ok "Uninstall complete"
    log_info "Restart your AI client to apply changes"
}

# ─── Main ─────────────────────────────────────────────────────────────────

main() {
    local mode="install"
    local force=false

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check)      mode="check"; shift ;;
            --force)      force=true; shift ;;
            --uninstall)  mode="uninstall"; shift ;;
            --diagnose)    mode="diagnose"; shift ;;
            --help|-h)    show_help; exit 0 ;;
            *)            shift ;;
        esac
    done

    # Detect paths (sets FORGEWRIGHT_DIR and FORGEWRIGHT_IS_PROJECT globals)
    detect_forgewright
    PROJECT_ROOT="$(detect_actual_project_root)"

    echo ""
    echo -e "${CYAN}⚡ Forgewright MCP Setup${NC}"
    echo ""

    case "$mode" in
        check)
            cmd_check
            ;;
        diagnose)
            cmd_diagnose
            ;;
        uninstall)
            cmd_uninstall
            ;;
        install)
            check_prerequisites
            echo ""

            if [[ "$force" == "false" ]]; then
                # Skip if already set up
                if [[ -f "${PROJECT_ROOT}/.antigravity/mcp-manifest.json" ]]; then
                    log_ok "MCP already set up for this project"
                    log_info "Use --force to re-generate"
                    cmd_check
                    exit 0
                fi
            fi

            setup_mcp_server
            echo ""
            verify_manifest || true
            echo ""
            write_forgewright_settings
            echo ""

            local client
            client="$(get_client_type)"
            update_global_config "$client"
            echo ""
            verify_installation
            echo ""

            if [[ "$client" == "unknown" ]]; then
                print_manual_config
            fi

            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo -e " ${GREEN}✓ MCP Setup Complete${NC}"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            echo "  Next: Restart your AI client (Cursor/Claude)"
            echo "        Then verify: bash ${BASH_SOURCE[0]} --check"
            echo ""
            ;;
    esac
}

main "$@"
