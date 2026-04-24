#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ForgeWright Installer — One-Command Setup for Fresh or Existing Projects
#
# SCENARIOS HANDLED:
#   1. Fresh clone from GitHub → Full setup
#   2. Existing project → Update/fix MCP
#   3. System without ForgeWright → Install ForgeWright first
#
# USAGE:
#   bash forgewright-setup.sh              # Full setup
#   bash forgewright-setup.sh --check      # Check status
#   bash forgewright-setup.sh --diagnose   # Diagnostics
#   bash forgewright-setup.sh --force       # Reinstall everything
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

VERSION="1.0.0"
GITHUB_REPO="https://github.com/buiphucminhtam/forgewright.git"
FORGEWRIGHT_DEFAULT="${HOME}/Documents/GitHub/forgewright"
MIN_NODE_VERSION=18

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "  ${BLUE}➜${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1"; }

# ═══════════════════════════════════════════════════════════════════════════════
# DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

detect_fw_dir() {
    local script_path="${BASH_SOURCE[0]}"
    local resolved
    
    # Resolve script path
    if [[ "$script_path" == /* ]]; then
        resolved="$(dirname "$script_path")"
    else
        resolved="$(pwd)/$(dirname "$script_path")"
    fi
    resolved="$(cd "$resolved" && pwd -P)"
    
    # Common locations
    local dirs=(
        "${FORGEWRIGHT_DEFAULT}"
        "${HOME}/Projects/forgewright"
        "${HOME}/code/forgewright"
        "$(dirname "$resolved")/forgewright"
        "$(dirname "$resolved")"
    )
    
    for dir in "${dirs[@]}"; do
        if [[ -f "${dir}/AGENTS.md" ]] || [[ -f "${dir}/CLAUDE.md" ]]; then
            echo "$dir"
            return 0
        fi
    done
    
    return 1
}

detect_ai_client() {
    if command -v cursor &> /dev/null; then
        echo "cursor"
        return 0
    fi
    if [[ -d "$HOME/Library/Application Support/Claude" ]]; then
        echo "claude"
        return 0
    fi
    echo "unknown"
}

get_mcp_config_path() {
    local client="$1"
    case "$client" in
        cursor) echo "$HOME/.cursor/mcp.json" ;;
        claude) echo "$HOME/Library/Application Support/Claude/claude_desktop_config.json" ;;
        *)      echo "" ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
# PREREQUISITES
# ═══════════════════════════════════════════════════════════════════════════════

check_node() {
    info "Checking Node.js..."
    
    if ! command -v node &> /dev/null; then
        error "Node.js not found!"
        cat << 'EOF'

    Install Node.js:
      macOS:  brew install node
      Linux:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
      Windows: https://nodejs.org

EOF
        return 1
    fi
    
    local node_version
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    
    if [[ "$node_version" -lt "$MIN_NODE_VERSION" ]]; then
        warn "Node.js $(node -v) is older than recommended (need >=${MIN_NODE_VERSION})"
        return 1
    fi
    
    success "Node.js $(node -v)"
    return 0
}

check_prerequisites() {
    check_node
}

# ═══════════════════════════════════════════════════════════════════════════════
# FORGEWRIGHT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

install_forgewright() {
    info "Installing ForgeWright to ${FORGEWRIGHT_DEFAULT}..."
    
    if [[ -d "${FORGEWRIGHT_DEFAULT}" ]]; then
        warn "ForgeWright already exists at ${FORGEWRIGHT_DEFAULT}"
        read -p "  Update existing? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Keeping existing installation"
            return 0
        fi
        
        cd "${FORGEWRIGHT_DEFAULT}"
        git pull origin main
        git submodule update --init --recursive
    else
        mkdir -p "$(dirname "${FORGEWRIGHT_DEFAULT}")"
        git clone --recursive "$GITHUB_REPO" "${FORGEWRIGHT_DEFAULT}"
        cd "${FORGEWRIGHT_DEFAULT}"
    fi
    
    success "ForgeWright installed"
}

ensure_forgewright() {
    local fw_dir="$1"
    
    if [[ -z "$fw_dir" ]] || [[ ! -d "$fw_dir" ]]; then
        warn "ForgeWright not found!"
        read -p "  Install ForgeWright now? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            error "Cannot proceed without ForgeWright"
            exit 1
        fi
        install_forgewright
        fw_dir="${FORGEWRIGHT_DEFAULT}"
    fi
    
    echo "$fw_dir"
}

# ═══════════════════════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════════════════════

build_forgenexus() {
    local fw_dir="$1"
    local fn_dir="${fw_dir}/forgenexus"
    
    info "Building ForgeNexus..."
    
    if [[ ! -f "${fn_dir}/package.json" ]]; then
        error "ForgeNexus not found at ${fn_dir}"
        return 1
    fi
    
    cd "$fn_dir"
    
    # Install with retries
    local retries=3
    for i in $(seq 1 $retries); do
        info "Installing deps (attempt $i/$retries)..."
        if npm install --prefer-offline 2>&1 | tail -3; then
            break
        fi
        if [[ $i -lt $retries ]]; then
            warn "Retrying in 3s..."
            sleep 3
        fi
    done
    
    # Build
    info "Compiling..."
    if npm run build 2>&1 | tail -5; then
        success "ForgeNexus built"
    else
        error "Build failed"
        return 1
    fi
    
    cd - > /dev/null
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# MCP SETUP
# ═══════════════════════════════════════════════════════════════════════════════

setup_mcp() {
    local project_root="$1"
    local fw_dir="$2"
    local client="$3"
    local config_path="$4"
    
    info "Setting up MCP for: $(basename "$project_root")"
    
    # Create manifest
    mkdir -p "${project_root}/.antigravity"
    cat > "${project_root}/.antigravity/mcp-manifest.json" <<EOF
{
  "forgewright_version": "${VERSION}",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "workspace": "${project_root}",
  "forgewright_path": "${fw_dir}"
}
EOF
    success "Manifest created"
    
    # Update MCP config
    if [[ -n "$config_path" ]]; then
        if [[ ! -f "$config_path" ]]; then
            mkdir -p "$(dirname "$config_path")"
            echo '{"mcpServers":{}}' > "$config_path"
        fi
        
        local safe_name
        safe_name=$(basename "$project_root" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-' | head -c 20)
        [[ -z "$safe_name" ]] && safe_name="workspace"
        local server_name="forge-${safe_name}"
        
        node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('${config_path}', 'utf8'));
if (!cfg.mcpServers) cfg.mcpServers = {};
Object.keys(cfg.mcpServers).forEach(k => {
    if (k.startsWith('forge-') || k.includes('forgenexus')) {
        delete cfg.mcpServers[k];
    }
});
cfg.mcpServers['${server_name}'] = {
    command: 'node',
    args: ['${fw_dir}/.cursor/forgenexus-mcp.js'],
    cwd: '${project_root}'
};
fs.writeFileSync('${config_path}', JSON.stringify(cfg, null, 2));
console.log('Added: ${server_name}');
" && success "MCP config updated (${client})" || warn "Failed to update MCP config"
    else
        warn "AI client not detected"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# COPY FILES
# ═══════════════════════════════════════════════════════════════════════════════

copy_project_files() {
    local project_root="$1"
    local fw_dir="$2"
    
    info "Setting up project files..."
    
    if [[ -f "${fw_dir}/AGENTS.md" ]] && [[ ! -f "${project_root}/AGENTS.md" ]]; then
        cp "${fw_dir}/AGENTS.md" "${project_root}/"
        success "Copied AGENTS.md"
    fi
    
    if [[ -f "${fw_dir}/CLAUDE.md" ]] && [[ ! -f "${project_root}/CLAUDE.md" ]]; then
        cp "${fw_dir}/CLAUDE.md" "${project_root}/"
        success "Copied CLAUDE.md"
    fi
    
    if [[ -f "${fw_dir}/.cursorrules" ]] && [[ ! -f "${project_root}/.cursorrules" ]]; then
        cp "${fw_dir}/.cursorrules" "${project_root}/"
        success "Copied .cursorrules"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# STATUS & DIAGNOSTICS
# ═══════════════════════════════════════════════════════════════════════════════

cmd_check() {
    local project_root="${1:-$(pwd)}"
    local fw_dir
    fw_dir=$(detect_fw_dir) || fw_dir=""
    
    echo ""
    echo -e "${BOLD}${CYAN}━━━ ForgeWright Status ━━━${NC}"
    echo ""
    
    info "Project: ${project_root}"
    echo ""
    
    if [[ -n "$fw_dir" ]]; then
        success "ForgeWright: ${fw_dir}"
        if [[ -f "${fw_dir}/forgenexus/dist/cli/index.js" ]]; then
            success "ForgeNexus: Built"
        else
            warn "ForgeNexus: Not built"
        fi
    else
        error "ForgeWright: Not found"
    fi
    echo ""
    
    if [[ -f "${project_root}/.antigravity/mcp-manifest.json" ]]; then
        success "Manifest: Present"
    else
        warn "Manifest: Missing"
    fi
    echo ""
    
    local client
    client=$(detect_ai_client)
    local config_path
    config_path=$(get_mcp_config_path "$client")
    
    if [[ "$client" != "unknown" ]]; then
        success "AI Client: ${client}"
        if [[ -n "$config_path" ]] && [[ -f "$config_path" ]]; then
            if grep -q "forge-" "$config_path" 2>/dev/null; then
                success "MCP Config: Configured"
            else
                warn "MCP Config: No forge entry"
            fi
        fi
    else
        warn "AI Client: Unknown"
    fi
    
    echo ""
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

cmd_diagnose() {
    local project_root="${1:-$(pwd)}"
    local fw_dir
    fw_dir=$(detect_fw_dir) || fw_dir=""
    
    echo ""
    echo -e "${BOLD}${CYAN}━━━ Diagnostics ━━━${NC}"
    echo ""
    
    info "Environment:"
    echo "  PWD:        ${project_root}"
    echo "  NODE:       $(command -v node || echo 'not found')"
    echo "  NPM:        $(command -v npm || echo 'not found')"
    echo ""
    
    info "ForgeWright:"
    echo "  Searched:   ${FORGEWRIGHT_DEFAULT}"
    echo "  Found:      ${fw_dir:-<not found>}"
    echo ""
    
    info "Files:"
    for f in \
        "${fw_dir}/AGENTS.md" \
        "${fw_dir}/forgenexus/dist/cli/index.js" \
        "${fw_dir}/.cursor/forgenexus-mcp.js" \
        "${project_root}/.antigravity/mcp-manifest.json" \
        "$HOME/.cursor/mcp.json"; do
        if [[ -f "$f" ]]; then
            echo "  ✓ ${f}"
        else
            echo "  ✗ ${f}"
        fi
    done
    echo ""
    
    info "AI Client:"
    echo "  Type:   $(detect_ai_client)"
    echo ""
    
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << 'EOF'
ForgeWright Setup — One-command setup for any project

USAGE:
  forgewright-setup.sh [OPTIONS] [PROJECT_PATH]

OPTIONS:
  --check         Check status only
  --diagnose      Show diagnostics
  --install-fw    Install ForgeWright first
  --force         Reinstall everything
  --help          Show this help

EXAMPLES:
  bash forgewright-setup.sh                  # Full setup
  bash forgewright-setup.sh --check         # Check status
  bash forgewright-setup.sh --diagnose     # Diagnostics
  bash forgewright-setup.sh --install-fw   # Install FW then setup
EOF
}

main() {
    local mode="install"
    local force=false
    local install_fw=false
    local project_path=""
    
    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check)      mode="check"; shift ;;
            --diagnose)   mode="diagnose"; shift ;;
            --install-fw) install_fw=true; shift ;;
            --force)      force=true; shift ;;
            --help|-h)    show_help; exit 0 ;;
            -*)
                warn "Unknown option: $1"
                shift
                ;;
            *)
                project_path="$1"
                shift
                ;;
        esac
    done
    
    # Determine paths
    [[ -z "$project_path" ]] && project_path="$(pwd -P)"
    local fw_dir
    fw_dir=$(detect_fw_dir) || fw_dir=""
    
    # ── Header ──────────────────────────────────────────────────────────────
    
    echo ""
    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}ForgeWright Setup v${VERSION}${NC}                                       ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Project: ${BOLD}${project_path}${NC}"
    echo ""
    
    # ── Check/Diagnose Mode ────────────────────────────────────────────────
    
    if [[ "$mode" == "check" ]]; then
        cmd_check "$project_path"
        exit 0
    fi
    
    if [[ "$mode" == "diagnose" ]]; then
        cmd_diagnose "$project_path"
        exit 0
    fi
    
    # ── Prerequisites ──────────────────────────────────────────────────────
    
    if ! check_prerequisites; then
        error "Prerequisites check failed"
        exit 1
    fi
    echo ""
    
    # ── ForgeWright Installation ────────────────────────────────────────────
    
    if [[ "$install_fw" == "true" ]] || [[ -z "$fw_dir" ]]; then
        fw_dir=$(ensure_forgewright "$fw_dir")
    fi
    
    echo ""
    success "ForgeWright: ${fw_dir}"
    
    # ── Build ForgeNexus ────────────────────────────────────────────────────
    
    if [[ "$force" == "true" ]] || [[ ! -f "${fw_dir}/forgenexus/dist/cli/index.js" ]]; then
        build_forgenexus "$fw_dir" || {
            error "Failed to build ForgeNexus"
            exit 1
        }
    else
        info "ForgeNexus already built"
    fi
    echo ""
    
    # ── Copy Project Files ──────────────────────────────────────────────────
    
    copy_project_files "$project_path" "$fw_dir"
    echo ""
    
    # ── Setup MCP ───────────────────────────────────────────────────────────
    
    local client
    client=$(detect_ai_client)
    local config_path
    config_path=$(get_mcp_config_path "$client")
    
    setup_mcp "$project_path" "$fw_dir" "$client" "$config_path"
    echo ""
    
    # ── Summary ─────────────────────────────────────────────────────────────
    
    echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║${NC}  ${BOLD}${GREEN}✓ Setup Complete${NC}                                             ${BOLD}${GREEN}║${NC}"
    echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    if [[ "$client" != "unknown" ]]; then
        echo "  Next steps:"
        echo "    1. ${BOLD}Restart${NC} your AI client (Cursor/Claude)"
        echo "    2. Verify: bash $0 --check"
    else
        echo "  Note: AI client not detected"
        echo "  MCP config may need manual setup"
    fi
    echo ""
}

main "$@"
