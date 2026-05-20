#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# fw-global-setup — One-Time Global Setup for Forgewright MCP
#
# Installs Forgewright MCP globally so it works for ALL projects
# and ALL IDEs (Cursor, Claude Desktop) with a single setup.
#
# USAGE:
#   bash scripts/fw-global-setup.sh              # Interactive setup
#   bash scripts/fw-global-setup.sh --check       # Check status only
#   bash scripts/fw-global-setup.sh --uninstall   # Remove global setup
#   bash scripts/fw-global-setup.sh --diagnose    # Debug issues
#
# WHAT IT DOES:
#   1. Creates ~/.config/forgewright/ directory
#   2. Copies/links MCP server to global location
#   3. Creates global launcher
#   4. Updates ~/.cursor/mcp.json
#   5. Updates Claude Desktop config
#   6. Creates project registry
#
# NO per-project setup required after this!
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_step()  { echo -e "${BLUE}  ➜${NC} $1"; }
log_ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}  ⚠${NC} $1"; }
log_error() { echo -e "${RED}  ✗${NC} $1"; }
log_info()  { echo -e "  $1"; }

# ─── Paths ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
GLOBAL_CONFIG_DIR="${HOME}/.config/forgewright"
GLOBAL_MCP_SERVER="${GLOBAL_CONFIG_DIR}/mcp-server"
GLOBAL_LAUNCHER="${GLOBAL_CONFIG_DIR}/global-launcher.sh"
GLOBAL_REGISTRY="${GLOBAL_CONFIG_DIR}/registry.json"
GLOBAL_SETTINGS="${GLOBAL_CONFIG_DIR}/settings.env"
BACKUP_DIR="${GLOBAL_CONFIG_DIR}/backups"

# IDE Config Paths
CURSOR_MCP_JSON="${HOME}/.cursor/mcp.json"
CLAUDE_CONFIG_JSON="${HOME}/Library/Application Support/Claude/claude_desktop_config.json"

# ─── Help ─────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
fw-global-setup — One-Time Global Setup for Forgewright MCP

SYNOPSIS
    bash scripts/fw-global-setup.sh [OPTIONS]

DESCRIPTION
    Installs Forgewright MCP globally so it works for ALL projects
    and ALL IDEs with a single setup. No per-project configuration needed.

OPTIONS
    --check       Check current global setup status
    --uninstall   Remove global setup completely
    --diagnose    Show detailed diagnostics
    --force       Re-run setup even if already installed
    --help, -h    Show this help

EXAMPLES
    # First-time setup (run once)
    bash scripts/fw-global-setup.sh

    # Check status
    bash scripts/fw-global-setup.sh --check

    # Remove and start over
    bash scripts/fw-global-setup.sh --uninstall

WHAT GETS INSTALLED
    ~/.config/forgewright/
    ├── mcp-server/          Shared MCP server (from forgewright)
    ├── global-launcher.sh    Unified adaptive launcher
    ├── registry.json         Project registry
    ├── settings.env          Global settings
    └── backups/             Configuration backups

UPDATED IDE CONFIGS
    ~/.cursor/mcp.json
    ~/Library/Application Support/Claude/claude_desktop_config.json

HOW IT WORKS
    The global launcher auto-detects the current workspace and loads
    the appropriate Forgewright MCP configuration. Works with any project
    without per-project setup.

EOF
}

# ─── Backup ─────────────────────────────────────────────────────────────────

backup_file() {
    local file="$1"
    local backup="${BACKUP_DIR}/$(basename "$file").bak.$(date +%Y%m%d%H%M%S)"
    
    if [[ -f "$file" ]]; then
        mkdir -p "$BACKUP_DIR"
        cp "$file" "$backup"
        log_info "Backed up: $file → $backup"
        echo "$backup"
    fi
}

restore_backup() {
    local backup="$1"
    local original="${backup%.bak.*}"
    
    if [[ -f "$backup" ]]; then
        cp "$backup" "$original"
        log_ok "Restored: $original"
    else
        log_error "Backup not found: $backup"
    fi
}

# ─── Prerequisite Checks ─────────────────────────────────────────────────────

check_prerequisites() {
    log_step "Checking prerequisites..."
    
    # Bash version (basic check - scripts use standard bash features)
    local bash_major
    bash_major=$(echo "${BASH_VERSION}" | cut -d. -f1)
    if [[ "${bash_major:-0}" -lt 3 ]]; then
        log_error "Bash 3.0+ required (found: ${BASH_VERSION})"
        exit 1
    fi
    log_ok "Bash ${BASH_VERSION}"
    
    # Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        log_info "Install: brew install node"
        exit 1
    fi
    log_ok "Node.js $(node -v)"
    
    # Git
    if ! command -v git &> /dev/null; then
        log_error "Git not found"
        exit 1
    fi
    log_ok "Git $(git --version | cut -d' ' -f3)"
    
    # Forgewright
    if [[ ! -f "${FORGEWRIGHT_DIR}/AGENTS.md" ]] && [[ ! -f "${FORGEWRIGHT_DIR}/CLAUDE.md" ]]; then
        log_error "Forgewright not found at ${FORGEWRIGHT_DIR}"
        log_info "Ensure you're running this from a forgewright directory"
        exit 1
    fi
    log_ok "Forgewright at ${FORGEWRIGHT_DIR}"
}

# ─── Step 1: Create Global Directory ──────────────────────────────────────────

create_global_directory() {
    log_step "Creating global config directory..."
    
    mkdir -p "$GLOBAL_CONFIG_DIR"
    mkdir -p "$BACKUP_DIR"
    
    log_ok "Created: $GLOBAL_CONFIG_DIR"
}

# ─── Step 2: Copy/Symlink MCP Server ─────────────────────────────────────────

install_mcp_server() {
    log_step "Installing MCP server globally..."
    
    local source_server="${FORGEWRIGHT_DIR}/skills/mcp-generator/templates"
    local source_mcp="${FORGEWRIGHT_DIR}/mcp-server"
    
    # Check if source exists
    if [[ ! -d "$source_mcp" ]] && [[ ! -d "$source_server" ]]; then
        log_error "MCP server source not found"
        log_info "Source: $source_mcp or $source_server"
        exit 1
    fi
    
    # Remove existing
    if [[ -d "$GLOBAL_MCP_SERVER" ]]; then
        log_info "Removing existing MCP server..."
        rm -rf "$GLOBAL_MCP_SERVER"
    fi
    
    # Create symlink to forgewright MCP server (avoids duplication)
    if [[ -d "$source_mcp" ]]; then
        ln -s "$source_mcp" "$GLOBAL_MCP_SERVER"
        log_ok "Linked: $GLOBAL_MCP_SERVER → $source_mcp"
    else
        # Copy from templates if no compiled server
        cp -r "$source_server" "$GLOBAL_MCP_SERVER"
        log_ok "Copied: $GLOBAL_MCP_SERVER"
    fi
    
    # Ensure dependencies are installed
    if [[ -f "${GLOBAL_MCP_SERVER}/package.json" ]]; then
        (cd "$GLOBAL_MCP_SERVER" && npm install --silent 2>/dev/null || true)
        log_ok "Dependencies installed"
    fi
}

# ─── Step 3: Install Global Launcher ─────────────────────────────────────────

install_global_launcher() {
    log_step "Installing global launcher..."
    
    # Copy the unified launcher as global launcher
    local source_launcher="${FORGEWRIGHT_DIR}/scripts/fw-global-launcher.sh"
    
    if [[ ! -f "$source_launcher" ]]; then
        log_error "Global launcher not found: $source_launcher"
        log_info "Create fw-global-launcher.sh first"
        exit 1
    fi
    
    cp "$source_launcher" "$GLOBAL_LAUNCHER"
    chmod +x "$GLOBAL_LAUNCHER"
    
    log_ok "Installed: $GLOBAL_LAUNCHER"
}

# ─── Step 4: Create Global Registry ──────────────────────────────────────────

init_registry() {
    log_step "Initializing project registry..."
    
    if [[ -f "$GLOBAL_REGISTRY" ]]; then
        log_info "Registry already exists"
        return 0
    fi
    
    cat > "$GLOBAL_REGISTRY" << 'EOF'
{
  "version": "1.0",
  "created_at": "",
  "updated_at": "",
  "projects": {}
}
EOF
    
    # Update timestamps
    update_registry_timestamp
    
    log_ok "Created: $GLOBAL_REGISTRY"
}

update_registry_timestamp() {
    if [[ -f "$GLOBAL_REGISTRY" ]]; then
        local timestamp
        timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        node -e "
var fs = require('fs');
var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
if (!reg.created_at) reg.created_at = '${timestamp}';
reg.updated_at = '${timestamp}';
fs.writeFileSync('${GLOBAL_REGISTRY}', JSON.stringify(reg, null, 2));
"
    fi
}

# ─── Step 5: Create Global Settings ──────────────────────────────────────────

create_global_settings() {
    log_step "Creating global settings..."
    
    cat > "$GLOBAL_SETTINGS" << EOF
# Forgewright Global Settings
# Auto-generated by fw-global-setup.sh

# Global config directory
FORGEWRIGHT_GLOBAL_CONFIG="${GLOBAL_CONFIG_DIR}"

# Forgewright installation path
FORGEWRIGHT_DIR="${FORGEWRIGHT_DIR}"

# Project registry
FORGEWRIGHT_REGISTRY="${GLOBAL_REGISTRY}"

# Auto-detect workspace (enabled by default)
FORGEWRIGHT_AUTO_WORKSPACE="1"

# Code navigation tool priority
FORGEWRIGHT_CODE_NAV="gitnexus"

# Memory enabled
FORGEWRIGHT_MEMORY_ENABLED="true"

# Token budget
FORGEWRIGHT_TOKEN_BUDGET="120000"
EOF
    
    chmod 644 "$GLOBAL_SETTINGS"
    log_ok "Created: $GLOBAL_SETTINGS"
}

# ─── Step 6: Update Cursor MCP Config ────────────────────────────────────────

update_cursor_config() {
    log_step "Updating Cursor MCP config..."
    
    # Check if cursor config exists
    if [[ -d "${HOME}/.cursor" ]]; then
        # Backup existing
        backup_file "$CURSOR_MCP_JSON"
        
        # Create or update config
        if [[ -f "$CURSOR_MCP_JSON" ]]; then
            # Merge with existing
            node -e "
var fs = require('fs');
var cfg = JSON.parse(fs.readFileSync('${CURSOR_MCP_JSON}', 'utf8'));
if (!cfg.mcpServers) cfg.mcpServers = {};

// Update forgewright to global launcher
cfg.mcpServers['forgewright'] = {
    command: 'bash',
    args: ['${GLOBAL_LAUNCHER}']
};

fs.writeFileSync('${CURSOR_MCP_JSON}', JSON.stringify(cfg, null, 2));
"
            log_ok "Updated: $CURSOR_MCP_JSON"
        else
            # Create new
            cat > "$CURSOR_MCP_JSON" << EOF
{
  "mcpServers": {
    "forgewright": {
      "command": "bash",
      "args": ["${GLOBAL_LAUNCHER}"]
    }
  }
}
EOF
            log_ok "Created: $CURSOR_MCP_JSON"
        fi
    else
        log_warn "Cursor config directory not found: ${HOME}/.cursor"
        log_info "Cursor will auto-create on first launch"
    fi
}

# ─── Step 7: Update Claude Desktop Config ─────────────────────────────────────

update_claude_config() {
    log_step "Updating Claude Desktop config..."
    
    # Check if Claude config exists
    if [[ -f "$CLAUDE_CONFIG_JSON" ]]; then
        # Backup existing
        backup_file "$CLAUDE_CONFIG_JSON"
        
        # Merge with existing
        node -e "
var fs = require('fs');
var cfg = JSON.parse(fs.readFileSync('${CLAUDE_CONFIG_JSON}', 'utf8'));
if (!cfg.mcpServers) cfg.mcpServers = {};

// Update forgewright to global launcher
cfg.mcpServers['forgewright'] = {
    command: 'bash',
    args: ['${GLOBAL_LAUNCHER}']
};

fs.writeFileSync('${CLAUDE_CONFIG_JSON}', JSON.stringify(cfg, null, 2));
"
        log_ok "Updated: $CLAUDE_CONFIG_JSON"
    else
        # Check common locations
        local alt_paths=(
            "${HOME}/.config/Claude/claude_desktop_config.json"
            "${HOME}/AppData/Roaming/Claude/claude_desktop_config.json"
        )
        
        for path in "${alt_paths[@]}"; do
            if [[ -f "$path" ]]; then
                backup_file "$path"
                node -e "
var fs = require('fs');
var cfg = JSON.parse(fs.readFileSync('${path}', 'utf8'));
if (!cfg.mcpServers) cfg.mcpServers = {};
cfg.mcpServers['forgewright'] = {
    command: 'bash',
    args: ['${GLOBAL_LAUNCHER}']
};
fs.writeFileSync('${path}', JSON.stringify(cfg, null, 2));
"
                log_ok "Updated: $path"
                return 0
            fi
        done
        
        log_warn "Claude Desktop config not found"
        log_info "Create it manually or launch Claude Desktop first"
    fi
}

# ─── Command: Check ──────────────────────────────────────────────────────────

cmd_check() {
    echo ""
    echo -e "${CYAN}━━━ Forgewright Global MCP Status ━━━${NC}"
    echo ""
    
    local checks=0
    local passed=0
    
    # Global directory
    ((checks++))
    if [[ -d "$GLOBAL_CONFIG_DIR" ]]; then
        ((passed++))
        log_ok "Global config: $GLOBAL_CONFIG_DIR"
    else
        log_error "Global config: NOT FOUND"
    fi
    
    # Global launcher
    ((checks++))
    if [[ -f "$GLOBAL_LAUNCHER" ]]; then
        ((passed++))
        log_ok "Global launcher: $GLOBAL_LAUNCHER"
    else
        log_error "Global launcher: NOT FOUND"
    fi
    
    # MCP server
    ((checks++))
    if [[ -d "$GLOBAL_MCP_SERVER" ]]; then
        ((passed++))
        log_ok "MCP server: $GLOBAL_MCP_SERVER"
    else
        log_error "MCP server: NOT FOUND"
    fi
    
    # Registry
    ((checks++))
    if [[ -f "$GLOBAL_REGISTRY" ]]; then
        ((passed++))
        local project_count
        project_count=$(node -e "try{console.log(Object.keys(JSON.parse(require('fs').readFileSync('${GLOBAL_REGISTRY}','utf8')).projects||{}).length)}catch{econsole.log(0)}" 2>/dev/null || echo "0")
        log_ok "Registry: $GLOBAL_REGISTRY ($project_count projects)"
    else
        log_warn "Registry: NOT FOUND (will be created on first use)"
    fi
    
    # Settings
    ((checks++))
    if [[ -f "$GLOBAL_SETTINGS" ]]; then
        ((passed++))
        log_ok "Settings: $GLOBAL_SETTINGS"
    else
        log_warn "Settings: NOT FOUND (will be created on first use)"
    fi
    
    echo ""
    
    # IDE configs
    log_step "IDE MCP Configs:"
    echo ""
    
    # Cursor
    if [[ -f "$CURSOR_MCP_JSON" ]]; then
        if grep -q "global-launcher.sh" "$CURSOR_MCP_JSON" 2>/dev/null; then
            log_ok "Cursor: $CURSOR_MCP_JSON (global)"
        elif grep -q "forgewright" "$CURSOR_MCP_JSON" 2>/dev/null; then
            log_warn "Cursor: $CURSOR_MCP_JSON (legacy - needs update)"
        else
            log_info "Cursor: $CURSOR_MCP_JSON (no forgewright)"
        fi
    else
        log_info "Cursor: $CURSOR_MCP_JSON (not configured)"
    fi
    
    # Claude Desktop
    if [[ -f "$CLAUDE_CONFIG_JSON" ]]; then
        if grep -q "global-launcher.sh" "$CLAUDE_CONFIG_JSON" 2>/dev/null; then
            log_ok "Claude Desktop: $CLAUDE_CONFIG_JSON (global)"
        elif grep -q "forgewright" "$CLAUDE_CONFIG_JSON" 2>/dev/null; then
            log_warn "Claude Desktop: legacy launcher (needs update)"
        else
            log_info "Claude Desktop: $CLAUDE_CONFIG_JSON (no forgewright)"
        fi
    else
        log_info "Claude Desktop: config not found"
    fi
    
    echo ""
    echo "━━━ Summary ━━━"
    echo ""
    echo -e "  ${GREEN}${passed}/${checks} checks passed${NC}"
    echo ""
    
    if [[ $passed -eq $checks ]]; then
        echo -e "  ${GREEN}✓ Global setup complete!${NC}"
        echo "  Restart your IDEs to apply changes."
    else
        echo -e "  ${YELLOW}⚠ Global setup incomplete${NC}"
        echo "  Run: bash scripts/fw-global-setup.sh"
    fi
    
    echo ""
}

# ─── Command: Uninstall ───────────────────────────────────────────────────────

cmd_uninstall() {
    echo ""
    echo -e "${YELLOW}━━━ Uninstalling Forgewright Global Setup ━━━${NC}"
    echo ""
    
    log_step "Removing global config directory..."
    if [[ -d "$GLOBAL_CONFIG_DIR" ]]; then
        rm -rf "$GLOBAL_CONFIG_DIR"
        log_ok "Removed: $GLOBAL_CONFIG_DIR"
    else
        log_info "Already clean"
    fi
    
    # Restore IDE configs from backups
    log_step "Restoring IDE configs from backups..."
    
    local cursor_backup
    cursor_backup=$(find "$BACKUP_DIR" -name "mcp.json.bak.*" | head -1)
    if [[ -n "$cursor_backup" ]] && [[ -f "$cursor_backup" ]]; then
        restore_backup "$cursor_backup"
    fi
    
    local claude_backup
    claude_backup=$(find "$BACKUP_DIR" -name "claude_desktop_config.json.bak.*" | head -1)
    if [[ -n "$claude_backup" ]] && [[ -f "$claude_backup" ]]; then
        restore_backup "$claude_backup"
    fi
    
    echo ""
    echo -e "${GREEN}✓ Uninstall complete${NC}"
    echo "  Restart your IDEs to apply changes."
    echo ""
}

# ─── Command: Diagnose ────────────────────────────────────────────────────────

cmd_diagnose() {
    echo ""
    echo -e "${CYAN}━━━ Forgewright Global MCP Diagnostics ━━━${NC}"
    echo ""
    
    log_step "Environment"
    echo "  PWD:              $(pwd)"
    echo "  FORGEWRIGHT_DIR:  ${FORGEWRIGHT_DIR}"
    echo "  HOME:             ${HOME}"
    echo "  Bash version:     ${BASH_VERSION}"
    echo ""
    
    log_step "Global Config"
    echo "  Config dir:      $GLOBAL_CONFIG_DIR"
    echo "  Exists:         $([ -d "$GLOBAL_CONFIG_DIR" ] && echo YES || echo NO)"
    echo "  Launcher:        $GLOBAL_LAUNCHER"
    echo "  Exists:         $([ -f "$GLOBAL_LAUNCHER" ] && echo YES || echo NO)"
    echo "  MCP server:      $GLOBAL_MCP_SERVER"
    echo "  Exists:         $([ -d "$GLOBAL_MCP_SERVER" ] && echo YES || echo NO)"
    echo "  Registry:       $GLOBAL_REGISTRY"
    echo "  Exists:         $([ -f "$GLOBAL_REGISTRY" ] && echo YES || echo NO)"
    echo ""
    
    log_step "IDE Configs"
    echo "  Cursor MCP:      $CURSOR_MCP_JSON"
    echo "  Exists:         $([ -f "$CURSOR_MCP_JSON" ] && echo YES || echo NO)"
    if [[ -f "$CURSOR_MCP_JSON" ]]; then
        echo "  Content:"
        cat "$CURSOR_MCP_JSON" | sed 's/^/    /'
    fi
    echo ""
    echo "  Claude Desktop:   $CLAUDE_CONFIG_JSON"
    echo "  Exists:         $([ -f "$CLAUDE_CONFIG_JSON" ] && echo YES || echo NO)"
    echo ""
    
    log_step "Backups"
    if [[ -d "$BACKUP_DIR" ]]; then
        echo "  Location: $BACKUP_DIR"
        ls -la "$BACKUP_DIR" | sed 's/^/  /'
    else
        echo "  No backups found"
    fi
    echo ""
    
    log_step "Launcher Test"
    if [[ -f "$GLOBAL_LAUNCHER" ]]; then
        echo "  Testing launcher detection..."
        if bash "$GLOBAL_LAUNCHER" --version 2>/dev/null; then
            log_ok "Launcher is functional"
        else
            log_error "Launcher has issues"
        fi
    else
        log_error "Launcher not found"
    fi
    echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
    local mode="install"
    local force=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check)       mode="check"; shift ;;
            --uninstall)   mode="uninstall"; shift ;;
            --diagnose)    mode="diagnose"; shift ;;
            --force)       force=true; shift ;;
            --help|-h)     show_help; exit 0 ;;
            *)             shift ;;
        esac
    done
    
    echo ""
    echo -e "${CYAN}⚡ Forgewright Global MCP Setup${NC}"
    echo -e "${CYAN}   One setup for ALL projects and IDEs${NC}"
    echo ""
    
    case "$mode" in
        check)
            cmd_check
            ;;
        uninstall)
            cmd_uninstall
            ;;
        diagnose)
            cmd_diagnose
            ;;
        install)
            # Check if already installed (unless force)
            if [[ "$force" == "false" ]] && [[ -f "$GLOBAL_LAUNCHER" ]]; then
                log_ok "Global setup already exists"
                log_info "Use --force to re-install"
                cmd_check
                exit 0
            fi
            
            # Run installation
            check_prerequisites
            echo ""
            create_global_directory
            echo ""
            install_mcp_server
            echo ""
            
            # Check if launcher exists (may need to create it first)
            if [[ ! -f "${FORGEWRIGHT_DIR}/scripts/fw-global-launcher.sh" ]]; then
                log_error "fw-global-launcher.sh not found"
                log_info "Create it first, then run setup again"
                exit 1
            fi
            
            install_global_launcher
            echo ""
            init_registry
            echo ""
            create_global_settings
            echo ""
            update_cursor_config
            echo ""
            update_claude_config
            echo ""
            
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo -e " ${GREEN}✓ Global Setup Complete${NC}"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            echo "  Global config:   $GLOBAL_CONFIG_DIR"
            echo "  Launcher:       $GLOBAL_LAUNCHER"
            echo ""
            echo -e " ${YELLOW}IMPORTANT: Restart your IDEs to apply changes${NC}"
            echo ""
            echo "  Next steps:"
            echo "  1. Restart Cursor"
            echo "  2. Restart Claude Desktop (if using)"
            echo "  3. Open any project - MCP works automatically!"
            echo ""
            ;;
    esac
}

main "$@"
