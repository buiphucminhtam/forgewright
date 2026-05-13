#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# fw-mcp.sh — Unified ForgeWright MCP Manager
#
# Single script for all MCP operations: setup, check, diagnose,
# uninstall, and wizard mode.
#
# USAGE:
#   bash fw-mcp.sh setup           # Full MCP setup
#   bash fw-mcp.sh check           # Verify installation
#   bash fw-mcp.sh diagnose        # Troubleshooting
#   bash fw-mcp.sh uninstall      # Remove setup
#   bash fw-mcp.sh wizard         # Interactive setup
#
# FLAGS:
#   --help        Show this help
#   --version     Show version
#   --verbose     Debug output
#   --force       Force re-run (skip checks)
#
# EXIT CODES:
#   0 = success
#   1 = error
#   2 = invalid arguments
#   3 = prerequisites missing
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Version ─────────────────────────────────────────────────────
VERSION="3.0.0"

# ─── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# ─── Logging Functions ───────────────────────────────────────────
log_step()  { echo -e "  ${BLUE}➜${NC} $1"; }
log_ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "  ${RED}✗${NC} $1"; }
log_info()  { echo -e "  $1"; }
log_debug() {
    if [[ "${FW_MCP_VERBOSE:-0}" == "1" ]]; then
        echo -e "  ${MAGENTA}DBG${NC} $1" >&2;
    fi
}

# ─── Script Directory Detection ───────────────────────────────────
detect_forgewright_dir() {
    local script="${BASH_SOURCE[0]}"
    local resolved

    # Resolve script path to absolute
    if [[ "$script" == /* ]]; then
        resolved="$(cd "$(dirname "$script")" && pwd -P)"
    else
        resolved="$(cd "$PWD" && cd "$(dirname "$script")" && pwd -P)"
    fi

    # Determine forgewright directory
    # Pattern 1: scripts/ under forgewright root
    if [[ "$resolved" == */scripts ]]; then
        local possible_fw="$(dirname "$resolved")"
        if [[ -f "${possible_fw}/AGENTS.md" ]] || [[ -f "${possible_fw}/CLAUDE.md" ]]; then
            echo "$possible_fw"
            return
        fi
    fi

    # Pattern 2: .antigravity/plugins/production-grade/scripts
    if [[ "$resolved" == */.antigravity/plugins/*/scripts ]]; then
        local plugin_root="$(dirname "$(dirname "$(dirname "$resolved")")")"
        if [[ -d "${plugin_root}/forgewright" ]]; then
            echo "${plugin_root}/forgewright"
            return
        fi
        if [[ -f "${plugin_root}/AGENTS.md" ]]; then
            echo "$plugin_root"
            return
        fi
    fi

    # Fallback: parent of scripts/
    local parent="$(dirname "$resolved")"
    if [[ -f "${parent}/AGENTS.md" ]]; then
        echo "$parent"
        return
    fi

    # Last resort
    echo "$(dirname "$resolved")"
}

FORGEWRIGHT_DIR="$(detect_forgewright_dir)"
PROJECT_ROOT="$(pwd -P)"

# ─── CLI Parsing ─────────────────────────────────────────────────
show_help() {
    cat << 'EOF'
fw-mcp.sh — Unified ForgeWright MCP Manager

USAGE:
  fw-mcp.sh <command> [options]

COMMANDS:
  setup           Set up MCP for this project
  check           Verify MCP installation
  diagnose        Show detailed diagnostics
  uninstall       Remove MCP setup
  wizard          Interactive setup wizard
  gitnexus        Setup GitNexus (recommended)

FLAGS:
  --help          Show this help
  --version       Show version
  --verbose       Enable debug output
  --force         Force re-run (skip checks)

EXAMPLES:
  # Quick setup
  bash fw-mcp.sh setup

  # Check status
  bash fw-mcp.sh check

  # Interactive wizard
  bash fw-mcp.sh wizard

  # Debug
  FW_MCP_VERBOSE=1 bash fw-mcp.sh diagnose

For more information, see: docs/SETUP.md
EOF
}

show_version() {
    echo "fw-mcp.sh version $VERSION"
}

# ─── Prerequisites ────────────────────────────────────────────────
check_prerequisites() {
    log_step "Checking prerequisites..."

    # Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Install from: https://nodejs.org"
        return 3
    fi

    local node_major
    node_major=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$node_major" -lt 18 ]]; then
        log_warn "Node.js $(node -v) may be too old (recommended: >=18)"
    else
        log_ok "Node.js $(node -v)"
    fi

    # npm
    if ! command -v npm &> /dev/null; then
        log_warn "npm not found (some features may be limited)"
    else
        log_ok "npm $(npm -v)"
    fi

    # Git
    if ! command -v git &> /dev/null; then
        log_warn "git not found (workspace detection may be limited)"
    else
        log_ok "git $(git --version | cut -d' ' -f3)"
    fi

    return 0
}

# ─── IDE Detection ────────────────────────────────────────────────
detect_ide() {
    local ide="unknown"
    local config_path=""

    if command -v cursor &> /dev/null; then
        ide="cursor"
        config_path="$HOME/.cursor/mcp.json"
    elif [[ -d "$HOME/Library/Application Support/Claude" ]]; then
        if grep -q "claude_desktop_config" <<< "$(ls -la "$HOME/Library/Application Support/Claude/" 2>/dev/null || echo "")"; then
            ide="claude"
            config_path="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
        fi
    elif [[ -f "$HOME/.config/Claude/claude_desktop_config.json" ]]; then
        ide="claude"
        config_path="$HOME/.config/Claude/claude_desktop_config.json"
    fi

    echo "$ide:$config_path"
}

# ─── Workspace Detection ──────────────────────────────────────────
detect_workspace() {
    local workspace=""

    # Priority 1: Environment variables
    if [[ -n "${FORGEWRIGHT_WORKSPACE:-}" ]]; then
        workspace="$FORGEWRIGHT_WORKSPACE"
        log_debug "Using FORGEWRIGHT_WORKSPACE: $workspace"
    elif [[ -n "${MCP_WORKSPACE_ROOT:-}" ]]; then
        workspace="$MCP_WORKSPACE_ROOT"
        log_debug "Using MCP_WORKSPACE_ROOT: $workspace"
    # Priority 2: Git root
    elif git rev-parse --show-toplevel 2>/dev/null | grep -q '^/'; then
        workspace="$(git rev-parse --show-toplevel)"
        log_debug "Using git root: $workspace"
    # Priority 3: Current directory
    else
        workspace="$(pwd -P)"
        log_debug "Using PWD: $workspace"
    fi

    # Normalize path
    workspace="$(cd "$workspace" 2>/dev/null && pwd -P)" || {
        log_error "Invalid workspace path: $workspace"
        return 1
    }

    echo "$workspace"
}

# ─── Setup Command ───────────────────────────────────────────────
cmd_setup() {
    local force="${FW_MCP_FORCE:-0}"

    echo ""
    echo -e "${CYAN}⚡ ForgeWright MCP Setup${NC} v$VERSION"
    echo ""

    # Check prerequisites
    if ! check_prerequisites; then
        log_error "Prerequisites check failed"
        exit 3
    fi

    echo ""

    # Detect IDE
    local ide_info
    ide_info=$(detect_ide)
    local ide="${ide_info%%:*}"
    local config_path="${ide_info##*:}"

    log_step "Detected IDE: $ide"
    if [[ "$ide" == "unknown" ]]; then
        log_warn "Could not detect AI IDE (Cursor/Claude)"
        log_info "Manual configuration may be required"
    fi
    echo ""

    # Check if already set up
    local manifest="${PROJECT_ROOT}/.antigravity/mcp-manifest.json"
    if [[ -f "$manifest" ]] && [[ "$force" != "1" ]]; then
        log_ok "MCP already set up for this project"
        log_info "Use --force to re-generate"
        echo ""
        cmd_check
        exit 0
    fi

    # Create directories
    log_step "Creating directories..."
    mkdir -p "${PROJECT_ROOT}/.forgewright"
    mkdir -p "${PROJECT_ROOT}/.antigravity"
    log_ok "Directories created"

    # Generate manifest
    log_step "Generating MCP manifest..."
    cat > "$manifest" <<EOF
{
  "manifest_version": "2.0",
  "workspace": "${PROJECT_ROOT}",
  "forgewright_path": "${FORGEWRIGHT_DIR}",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "forgewright_version": "${VERSION}",
  "code_intelligence": {
    "tool": "gitnexus",
    "description": "GitNexus code intelligence graph"
  },
  "servers": [
    {
      "name": "forgewright",
      "type": "forgewright",
      "enabled": true,
      "description": "ForgeWright project intelligence"
    },
    {
      "name": "gitnexus",
      "type": "gitnexus",
      "enabled": true,
      "description": "GitNexus code intelligence"
    }
  ]
}
EOF
    log_ok "Manifest created"

    # Create launcher
    log_step "Creating launcher script..."
    local launcher="${PROJECT_ROOT}/.forgewright/fw-mcp-launcher.sh"
    cat > "$launcher" << 'LAUNCHER'
#!/usr/bin/env bash
# MCP Launcher for ForgeWright
# Auto-generated by fw-mcp.sh

set -euo pipefail

FORGEWRIGHT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

# Detect workspace
if [[ -n "${FORGEWRIGHT_WORKSPACE:-}" ]]; then
    WORKSPACE="$FORGEWRIGHT_WORKSPACE"
elif [[ -n "${MCP_WORKSPACE_ROOT:-}" ]]; then
    WORKSPACE="$MCP_WORKSPACE_ROOT"
elif git rev-parse --show-toplevel 2>/dev/null | grep -q '^/'; then
    WORKSPACE="$(git rev-parse --show-toplevel)"
else
    WORKSPACE="$(pwd -P)"
fi

LAUNCHER
    chmod +x "$launcher"
    log_ok "Launcher created"

    # Update global config
    if [[ "$ide" != "unknown" ]] && [[ -f "$config_path" ]]; then
        log_step "Updating $ide global config..."
        local server_name="forgewright-$(basename "$PROJECT_ROOT" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' | head -c 15)"
        local launcher_path="${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-launcher.sh"

        if [[ -f "$config_path" ]]; then
            cp "$config_path" "${config_path}.bak.$(date +%Y%m%d%H%M%S)"
        fi

        # GitNexus is auto-configured by 'gitnexus setup' command
        # Just verify it's working
        if command -v gitnexus &> /dev/null; then
            log_ok "GitNexus: available (run 'gitnexus setup' to configure editors)"
        else
            log_warn "GitNexus: not installed (run 'npm install -g gitnexus')"
        fi

        node -e "
var fs = require('fs');
var cfg = {mcpServers: {}};
try {
    cfg = JSON.parse(fs.readFileSync('$config_path', 'utf8'));
    if (!cfg.mcpServers) cfg.mcpServers = {};
} catch(e) {}

cfg.mcpServers['forgewright'] = {
    command: 'bash',
    args: ['$launcher_path']
};

fs.writeFileSync('$config_path', JSON.stringify(cfg, null, 2));
" 2>/dev/null && log_ok "Config updated" || log_warn "Config update failed"
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e " ${GREEN}✓ MCP Setup Complete${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Project: $(basename "$PROJECT_ROOT")"
    echo "  IDE: $ide"
    echo ""
    echo "  Next steps:"
    echo "    1. Restart your AI IDE (Cursor/Claude)"
    echo "    2. Verify: bash fw-mcp.sh check"
    echo ""
}

# ─── Check Command ───────────────────────────────────────────────
cmd_check() {
    echo ""
    echo -e "${CYAN}━━━ MCP Status ━━━${NC}"
    echo ""

    log_step "Project: $PROJECT_ROOT"
    log_step "ForgeWright: $FORGEWRIGHT_DIR"
    echo ""

    # Manifest
    local manifest="${PROJECT_ROOT}/.antigravity/mcp-manifest.json"
    if [[ -f "$manifest" ]]; then
        log_ok "Manifest: ✓"
        node -e "
var m = JSON.parse(require('fs').readFileSync('$manifest', 'utf8'));
console.log('  Version: ' + m.forgewright_version);
console.log('  Generated: ' + m.generated_at);
console.log('  Servers: ' + (m.servers || []).length + ' configured');
" 2>/dev/null
    else
        log_error "Manifest: ✗ (not set up)"
    fi
    echo ""

    # ForgeWright launcher
    local fw_launcher="${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-launcher.sh"
    if [[ -f "$fw_launcher" ]]; then
        log_ok "ForgeWright Launcher: ✓"
    else
        log_error "ForgeWright Launcher: ✗"
    fi

    # GitNexus status
    echo ""
    log_info "GitNexus Status:"
    if command -v gitnexus &> /dev/null; then
        log_ok "GitNexus: installed ($(gitnexus --version))"
        gitnexus status 2>/dev/null | head -5 || echo "  (run 'gitnexus analyze' to index)"
    else
        log_error "GitNexus: not installed"
        log_info "Install: npm install -g gitnexus"
    fi
    echo ""

    # IDE Config
    local ide_info
    ide_info=$(detect_ide)
    local ide="${ide_info%%:*}"
    local config_path="${ide_info##*:}"

    log_step "IDE: $ide"
    if [[ -f "$config_path" ]]; then
        log_ok "Config: ✓"
        if grep -q "forgewright" "$config_path" 2>/dev/null; then
            log_ok "ForgeWright: configured"
        else
            log_warn "ForgeWright: not in config"
        fi
    else
        log_warn "Config: not found"
    fi
    echo ""

    # Workspace info
    echo "━━━ Workspace ━━━"
    echo ""
    local workspace
    workspace=$(detect_workspace)
    log_info "Current: $workspace"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━"
}

# ─── Diagnose Command ─────────────────────────────────────────────
cmd_diagnose() {
    echo ""
    echo -e "${CYAN}━━━ MCP Diagnostics ━━━${NC}"
    echo ""

    log_info "Environment:"
    echo "  PWD:        $(pwd)"
    echo "  HOME:       $HOME"
    echo "  NODE:       $(command -v node || echo 'not found') $(node -v 2>/dev/null || echo '')"
    echo "  NPM:        $(command -v npm || echo 'not found') $(npm -v 2>/dev/null || echo '')"
    echo "  GIT:        $(command -v git || echo 'not found')"
    echo "  VERBOSE:    ${FW_MCP_VERBOSE:-0}"
    echo ""

    log_info "Paths:"
    echo "  FORGEWRIGHT_DIR: $FORGEWRIGHT_DIR"
    echo "  PROJECT_ROOT:    $PROJECT_ROOT"
    echo ""

    log_info "Workspace Detection:"
    local workspace
    workspace=$(detect_workspace)
    echo "  Detected: $workspace"
    echo "  Git root:  $(git rev-parse --show-toplevel 2>/dev/null || echo '<not a git repo>')"
    echo ""

    log_info "Files:"
    for f in \
        "${FORGEWRIGHT_DIR}/AGENTS.md" \
        "${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-launcher.sh" \
        "${FORGEWRIGHT_DIR}/scripts/forgenexus-mcp-launcher.sh" \
        "${PROJECT_ROOT}/.antigravity/mcp-manifest.json" \
        "${PROJECT_ROOT}/.forgewright/fw-mcp-launcher.sh" \
        "$HOME/.cursor/mcp.json" \
        "$HOME/Library/Application Support/Claude/claude_desktop_config.json"; do
        if [[ -f "$f" ]]; then
            echo "  ✓ ${f/$HOME/~}"
        else
            echo "  ✗ ${f/$HOME/~}"
        fi
    done
    echo ""

    log_info "GitNexus Status:"
    if command -v gitnexus &> /dev/null; then
        log_ok "GitNexus CLI: installed ($(gitnexus --version))"
        echo "  Run 'gitnexus status' for details"
    else
        log_error "GitNexus CLI: not installed"
        echo "  Install: npm install -g gitnexus"
    fi
    echo ""

    log_info "GitNexus MCP:"
    if [[ -f "$HOME/.gitnexus/registry.json" ]]; then
        local repo_count
        repo_count=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$HOME/.gitnexus/registry.json', 'utf8')).repos || {}).length)" 2>/dev/null || echo "0")
        log_ok "Registry: $repo_count indexed repos"
    else
        log_warn "Registry: not found (run 'gitnexus analyze')"
    fi
    echo ""

    echo "━━━━━━━━━━━━━━━━━━"
}

# ─── Uninstall Command ────────────────────────────────────────────
cmd_uninstall() {
    echo ""
    echo -e "${CYAN}━━━ Uninstall MCP ━━━${NC}"
    echo ""

    log_warn "This will remove MCP setup from this project."
    read -p "  Continue? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cancelled"
        exit 0
    fi

    log_step "Removing files..."
    rm -rf "${PROJECT_ROOT}/.forgewright/mcp-server"
    rm -rf "${PROJECT_ROOT}/.antigravity/mcp-manifest.json"
    rm -rf "${PROJECT_ROOT}/.forgewright/fw-mcp-launcher.sh"
    log_ok "Project files removed"

    # Remove from global config
    local ide_info
    ide_info=$(detect_ide)
    local config_path="${ide_info##*:}"

    if [[ -f "$config_path" ]]; then
        log_step "Removing from $ide config..."
        node -e "
var fs = require('fs');
var cfg = JSON.parse(fs.readFileSync('$config_path', 'utf8'));
delete cfg.mcpServers['forgewright'];
fs.writeFileSync('$config_path', JSON.stringify(cfg, null, 2));
" 2>/dev/null && log_ok "Config updated" || log_warn "Config update failed"
    fi

    echo ""
    log_ok "Uninstall complete"
    echo "  Restart your IDE to apply changes"
    echo ""
}

# ─── Wizard Command ──────────────────────────────────────────────
cmd_wizard() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  ForgeWright MCP Setup Wizard                   ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""

    # Step 1: IDE selection
    echo "Step 1/4: Select your IDE"
    echo ""
    echo "  [1] Cursor"
    echo "  [2] Claude Desktop"
    echo "  [3] Other (manual config)"
    echo ""
    read -p "  Your choice [1]: " ide_choice
    ide_choice="${ide_choice:-1}"

    case "$ide_choice" in
        1) selected_ide="cursor" ;;
        2) selected_ide="claude" ;;
        *) selected_ide="manual" ;;
    esac
    echo ""
    log_ok "Selected: $selected_ide"
    echo ""

    # Step 2: Setup type
    echo "Step 2/4: Setup type"
    echo ""
    echo "  [1] Full setup (ForgeWright + GitNexus) - RECOMMENDED"
    echo "  [2] GitNexus only (code intelligence)"
    echo "  [3] ForgeWright only"
    echo ""
    read -p "  Your choice [1]: " setup_choice
    setup_choice="${setup_choice:-1}"
    echo ""

    local setup_type=""
    case "$setup_choice" in
        1) setup_type="full" ;;
        2) setup_type="gitnexus" ;;
        3) setup_type="forgewright" ;;
    esac
    log_ok "Setup type: $setup_type"
    echo ""

    # Step 3: Project path
    echo "Step 3/4: Project directory"
    echo ""
    echo "  Current: $PROJECT_ROOT"
    read -p "  Press Enter to use current or enter path: " project_path
    project_path="${project_path:-$PROJECT_ROOT}"
    echo ""

    # Step 4: Confirm
    echo "Step 4/4: Confirmation"
    echo ""
    echo "  IDE:       $selected_ide"
    echo "  Type:      $setup_type"
    echo "  Project:   $project_path"
    echo ""
    read -p "  Start setup? [Y/n] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        log_info "Cancelled"
        exit 0
    fi

    # Run setup
    cd "$project_path"
    export FORGEWRIGHT_WORKSPACE="$project_path"

    if [[ "$setup_type" == "full" ]] || [[ "$setup_type" == "forgewright" ]]; then
        echo ""
        echo "━━━ Setting up ForgeWright MCP ━━━"
        cmd_setup
    fi

    if [[ "$setup_type" == "full" ]] || [[ "$setup_type" == "gitnexus" ]]; then
        echo ""
        echo "━━━ Setting up GitNexus ━━━"
        if command -v gitnexus &> /dev/null; then
            gitnexus setup
            log_ok "GitNexus MCP configured"
        else
            log_error "GitNexus not installed"
            log_info "Install: npm install -g gitnexus"
        fi
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e " ${GREEN}✓ Wizard Complete!${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Restart your IDE to activate MCP servers."
    echo ""
}

# ─── GitNexus Command ──────────────────────────────────────────
cmd_gitnexus() {
    echo ""
    echo -e "${CYAN}━━━ GitNexus Setup ━━━${NC}"
    echo ""

    # Check if gitnexus is installed
    if ! command -v gitnexus &> /dev/null; then
        log_error "GitNexus not installed"
        echo ""
        log_step "Installing GitNexus..."
        npm install -g gitnexus
        echo ""
    fi

    # Run gitnexus setup
    log_step "Running gitnexus setup..."
    gitnexus setup

    echo ""
    log_ok "GitNexus setup complete!"

    # Check if current repo is indexed
    if git rev-parse --show-toplevel &> /dev/null; then
        local repo_root
        repo_root="$(git rev-parse --show-toplevel)"
        echo ""
        log_info "Indexing current repository..."
        cd "$repo_root"
        gitnexus analyze
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e " ${GREEN}✓ GitNexus Ready!${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Next steps:"
    echo "    1. Restart your AI IDE"
    echo "    2. Use 'gitnexus status' to check index"
    echo ""
}

# ─── Main ───────────────────────────────────────────────────────
main() {
    local command=""
    local force=0
    local verbose=0

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help|-h)
                show_help
                exit 0
                ;;
            --version|-v)
                show_version
                exit 0
                ;;
            --verbose)
                verbose=1
                export FW_MCP_VERBOSE=1
                shift
                ;;
            --force)
                force=1
                export FW_MCP_FORCE=1
                shift
                ;;
            *)
                if [[ -z "$command" ]]; then
                    command="$1"
                fi
                shift
                ;;
        esac
    done

    # Default command
    command="${command:-help}"

    # Run command
    case "$command" in
        setup)
            cmd_setup
            ;;
        check)
            cmd_check
            ;;
        diagnose)
            cmd_diagnose
            ;;
        uninstall)
            cmd_uninstall
            ;;
        wizard)
            cmd_wizard
            ;;
        gitnexus|gn)
            cmd_gitnexus
            ;;
        help)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            show_help
            exit 2
            ;;
    esac
}

main "$@"
