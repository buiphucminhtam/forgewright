#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# forgenexus-setup.sh — One-Command ForgeNexus Installer
#
# Installs ForgeNexus (code intelligence) in a single command.
# Handles npm 404 fallback, GitHub install, and auto-build.
#
# USAGE:
#   bash forgenexus-setup.sh           # Install to current project
#   bash forgenexus-setup.sh --check   # Check status only
#   bash forgenexus-setup.sh --force   # Re-install
#   bash forgenexus-setup.sh --help    # Show help
#
# EXIT CODES:
#   0 = success
#   1 = error
#   2 = invalid arguments
#   3 = prerequisites missing
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Version ─────────────────────────────────────────────────────
VERSION="2.0.0"

# ─── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# ─── Logging ─────────────────────────────────────────────────────
log_step()  { echo -e "  ${BLUE}➜${NC} $1"; }
log_ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "  ${RED}✗${NC} $1"; }
log_info()  { echo -e "  $1"; }
log_debug() {
    if [[ "${FNX_VERBOSE:-0}" == "1" ]]; then
        echo -e "  ${MAGENTA}DBG${NC} $1" >&2;
    fi
}

# ─── Detect ForgeWright ────────────────────────────────────────────
detect_forgewright() {
    local script="${BASH_SOURCE[0]}"
    local resolved

    if [[ "$script" == /* ]]; then
        resolved="$(cd "$(dirname "$script")" && pwd -P)"
    else
        resolved="$(cd "$PWD" && cd "$(dirname "$script")" && pwd -P)"
    fi

    # Pattern: scripts/ under forgewright
    if [[ "$resolved" == */scripts ]]; then
        local possible_fw="$(dirname "$resolved")"
        if [[ -f "${possible_fw}/AGENTS.md" ]]; then
            echo "$possible_fw"
            return
        fi
    fi

    # Pattern: plugin scripts
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

    # Fallback
    echo "$(dirname "$resolved")"
}

FORGEWRIGHT_DIR="$(detect_forgewright)"
PROJECT_ROOT="$(pwd -P)"
FORGENEXUS_DIR="${FORGEWRIGHT_DIR}/forgenexus"

# ─── CLI Parsing ─────────────────────────────────────────────────
show_help() {
    cat << 'EOF'
forgenexus-setup.sh — One-Command ForgeNexus Installer

USAGE:
  forgenexus-setup.sh [options]

OPTIONS:
  --check      Check installation status only
  --force      Force re-install
  --verbose    Enable debug output
  --help       Show this help

EXAMPLES:
  # Install ForgeNexus
  bash forgenexus-setup.sh

  # Check status
  bash forgenexus-setup.sh --check

  # Re-install
  bash forgenexus-setup.sh --force

  # Debug
  FNX_VERBOSE=1 bash forgenexus-setup.sh

For more information, see: docs/SETUP.md
EOF
}

# ─── Prerequisites ────────────────────────────────────────────────
check_prerequisites() {
    log_step "Checking prerequisites..."

    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Install from: https://nodejs.org"
        return 3
    fi
    log_ok "Node.js $(node -v)"

    if ! command -v npm &> /dev/null; then
        log_error "npm not found"
        return 3
    fi
    log_ok "npm $(npm -v)"

    if ! command -v git &> /dev/null; then
        log_warn "git not found (recommended for updates)"
    fi

    return 0
}

# ─── Check if ForgeNexus Exists ─────────────────────────────────
check_installation() {
    echo ""
    echo -e "${CYAN}━━━ ForgeNexus Status ━━━${NC}"
    echo ""

    local fnx_cli="${FORGENEXUS_DIR}/dist/cli/index.js"

    if [[ -f "$fnx_cli" ]]; then
        log_ok "ForgeNexus CLI: installed"
        node "$fnx_cli" status 2>/dev/null | head -15
    else
        log_error "ForgeNexus CLI: not installed"
        log_info "Run 'forgenexus-setup.sh' to install"
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━"
}

# ─── Install ForgeNexus ─────────────────────────────────────────
install_forgenexus() {
    local force="${1:-0}"

    echo ""
    echo -e "${CYAN}⚡ ForgeNexus Installation${NC} v$VERSION"
    echo ""

    # Check prerequisites
    if ! check_prerequisites; then
        log_error "Prerequisites check failed"
        exit 3
    fi

    echo ""

    # Check if already installed
    local fnx_cli="${FORGENEXUS_DIR}/dist/cli/index.js"
    if [[ -f "$fnx_cli" ]] && [[ "$force" != "1" ]]; then
        log_ok "ForgeNexus already installed"
        echo ""
        log_info "Use --force to re-install"
        check_installation
        return 0
    fi

    # Step 1: Ensure ForgeNexus directory exists
    log_step "Ensuring ForgeNexus directory..."
    if [[ ! -d "$FORGENEXUS_DIR" ]]; then
        log_info "Cloning ForgeNexus..."
        git clone --depth 1 https://github.com/buiphucminhtam/forgewright.git /tmp/forgewright-temp
        mv /tmp/forgewright-temp/forgenexus "$FORGENEXUS_DIR" || {
            log_error "Failed to clone ForgeNexus"
            exit 1
        }
        rm -rf /tmp/forgewright-temp
    fi
    log_ok "ForgeNexus directory ready"

    # Step 2: Install dependencies
    log_step "Installing dependencies..."
    cd "$FORGENEXUS_DIR"

    if npm install --prefer-offline 2>&1 | tail -3; then
        log_ok "Dependencies installed"
    else
        log_warn "npm install had issues, continuing..."
    fi

    # Step 3: Build
    log_step "Building ForgeNexus..."
    if npm run build 2>&1 | tail -5; then
        log_ok "Build complete"
    else
        log_error "Build failed"
        exit 1
    fi

    cd "$PROJECT_ROOT"

    # Step 4: Verify
    if [[ -f "$fnx_cli" ]]; then
        log_ok "Installation verified"
    else
        log_error "Verification failed - CLI not found"
        exit 1
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e " ${GREEN}✓ ForgeNexus Installed${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Next steps:"
    echo "    1. Index your project:"
    echo "       node $fnx_cli analyze"
    echo ""
    echo "    2. Check status:"
    echo "       node $fnx_cli status"
    echo ""
}

# ─── Analyze Command ──────────────────────────────────────────────
cmd_analyze() {
    local fnx_cli="${FORGENEXUS_DIR}/dist/cli/index.js"

    if [[ ! -f "$fnx_cli" ]]; then
        log_error "ForgeNexus not installed. Run 'forgenexus-setup.sh' first."
        exit 1
    fi

    echo ""
    log_step "Analyzing codebase..."
    echo ""

    node "$fnx_cli" analyze "$PROJECT_ROOT"
}

# ─── Main ───────────────────────────────────────────────────────
main() {
    local command="install"
    local force=0

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help|-h)
                show_help
                exit 0
                ;;
            --check)
                command="check"
                shift
                ;;
            --force|-f)
                force=1
                shift
                ;;
            --verbose)
                export FNX_VERBOSE=1
                shift
                ;;
            analyze)
                command="analyze"
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    case "$command" in
        check)
            check_installation
            ;;
        analyze)
            cmd_analyze
            ;;
        install)
            install_forgenexus "$force"
            ;;
    esac
}

main "$@"
