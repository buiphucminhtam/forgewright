#!/bin/bash
# ============================================================================
# Production Grade Plugin — Setup & Update Script
# ============================================================================
# Usage:
#   ./setup.sh install    — First-time install as git submodule
#   ./setup.sh update     — Pull latest version
#   ./setup.sh status     — Check current version & update availability
#   ./setup.sh uninstall  — Remove the submodule
# ============================================================================

set -euo pipefail

# Configuration
REPO_URL="https://github.com/buiphucminhtam/forgewright.git"
SUBMODULE_PATH=".antigravity/plugins/production-grade"
BRANCH="main"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

print_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}Forgewright${NC} — 47 Skills for Antigravity              ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_info()    { echo -e "${BLUE}ℹ${NC} $1"; }
print_warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1"; }

get_local_version() {
    if [ -f "$SUBMODULE_PATH/VERSION" ]; then
        cat "$SUBMODULE_PATH/VERSION" | tr -d '[:space:]'
    else
        echo "unknown"
    fi
}

get_remote_version() {
    git ls-remote --refs "$REPO_URL" "refs/heads/$BRANCH" > /dev/null 2>&1 || {
        echo "unreachable"
        return
    }
    # Fetch VERSION file from remote
    local version
    version=$(git archive --remote="$REPO_URL" "$BRANCH" VERSION 2>/dev/null | tar -xO 2>/dev/null | tr -d '[:space:]' || echo "")
    if [ -z "$version" ]; then
        # Fallback: use git log date
        echo "check-manually"
    else
        echo "$version"
    fi
}

cmd_install() {
    print_header

    # Check if git repo exists
    if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        print_error "Not inside a git repository. Run 'git init' first."
        exit 1
    fi

    # Check if already installed
    if [ -d "$SUBMODULE_PATH" ]; then
        print_warn "Plugin already installed at ${BOLD}$SUBMODULE_PATH${NC}"
        print_info "Run '${BOLD}./setup.sh update${NC}' to get the latest version."
        exit 0
    fi

    print_info "Installing Production Grade Plugin as git submodule..."
    echo ""

    # Create parent directory
    mkdir -p "$(dirname "$SUBMODULE_PATH")"

    # Add submodule
    git submodule add -b "$BRANCH" "$REPO_URL" "$SUBMODULE_PATH"
    git submodule update --init --recursive

    echo ""
    print_info "Initializing Code Intelligence (GitNexus)..."
    npx --yes gitnexus analyze || print_warn "GitNexus analysis failed, skipping."
    
    print_info "Generating project MCP server..."
    bash "$SUBMODULE_PATH/scripts/mcp-generate.sh" || print_warn "MCP generation failed, skipping."

    local version
    version=$(get_local_version)

    echo ""
    print_success "Installed successfully! Version: ${BOLD}v$version${NC}"
    echo ""
    echo -e "  ${BOLD}Skills location:${NC}  $SUBMODULE_PATH/skills/"
    echo -e "  ${BOLD}Skill count:${NC}      18 skills (17 domain + parallel dispatch)"
    echo -e "  ${BOLD}Pipeline:${NC}         DEFINE → BUILD → HARDEN → SHIP → SUSTAIN"
    echo -e "  ${BOLD}Intelligence:${NC}     GitNexus indexed + MCP server active"
    echo ""
    echo -e "  ${BOLD}Next steps:${NC}"
    echo -e "  1. Commit the setup: ${CYAN}git add . && git commit -m 'feat: add forgewright v$version'${NC}"
    echo -e "  2. Start building: ${CYAN}\"Build a production-grade SaaS for [your idea]\"${NC}"
    echo -e "  3. Analyze project (optional): ${CYAN}Run /onboard to analyze stack & setup profiles${NC}"
    echo -e "  4. Check for updates: ${CYAN}./setup.sh status${NC}"
    echo ""
}

cmd_update() {
    print_header

    if [ ! -d "$SUBMODULE_PATH" ]; then
        print_error "Plugin not installed. Run '${BOLD}./setup.sh install${NC}' first."
        exit 1
    fi

    local old_version
    old_version=$(get_local_version)

    print_info "Updating from v${old_version}..."

    # Update submodule to latest
    git submodule update --remote "$SUBMODULE_PATH"

    echo ""
    print_info "Re-initializing Code Intelligence (GitNexus)..."
    npx --yes gitnexus analyze || print_warn "GitNexus analysis failed, skipping."
    
    print_info "Re-generating project MCP server..."
    bash "$SUBMODULE_PATH/scripts/mcp-generate.sh" || print_warn "MCP generation failed, skipping."

    local new_version
    new_version=$(get_local_version)

    echo ""
    if [ "$old_version" = "$new_version" ]; then
        print_success "Already on the latest version: ${BOLD}v$new_version${NC}"
    else
        print_success "Updated: ${BOLD}v$old_version${NC} → ${BOLD}v$new_version${NC}"
        echo ""
        echo -e "  ${BOLD}Don't forget to commit:${NC}"
        echo -e "  ${CYAN}git add $SUBMODULE_PATH && git commit -m 'chore: update production-grade plugin to v$new_version'${NC}"
    fi
    echo ""
}

cmd_status() {
    print_header

    if [ ! -d "$SUBMODULE_PATH" ]; then
        print_warn "Plugin not installed."
        print_info "Run '${BOLD}./setup.sh install${NC}' to install."
        exit 0
    fi

    local local_ver
    local_ver=$(get_local_version)

    echo -e "  ${BOLD}Installed version:${NC}  v$local_ver"
    echo -e "  ${BOLD}Install path:${NC}       $SUBMODULE_PATH"

    # Count skills
    if [ -d "$SUBMODULE_PATH/skills" ]; then
        local skill_count
        skill_count=$(find "$SUBMODULE_PATH/skills" -maxdepth 1 -type d | tail -n +2 | wc -l | tr -d '[:space:]')
        echo -e "  ${BOLD}Skills available:${NC}   $skill_count"
    fi

    # Check submodule status
    local sub_status
    sub_status=$(git submodule status "$SUBMODULE_PATH" 2>/dev/null || echo "unknown")

    if echo "$sub_status" | grep -q "^+"; then
        print_warn "Local changes detected in submodule (modified or ahead of pinned commit)"
    elif echo "$sub_status" | grep -q "^-"; then
        print_warn "Submodule not initialized. Run: git submodule update --init"
    else
        print_success "Submodule is clean and up to date with pinned commit"
    fi

    echo ""
    echo -e "  ${BOLD}To check for remote updates:${NC}"
    echo -e "  ${CYAN}./setup.sh update${NC}"
    echo ""
}

cmd_uninstall() {
    print_header

    if [ ! -d "$SUBMODULE_PATH" ]; then
        print_warn "Plugin not installed. Nothing to remove."
        exit 0
    fi

    print_warn "This will remove the Production Grade Plugin submodule."
    read -p "Are you sure? (y/N): " confirm

    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "Cancelled."
        exit 0
    fi

    # Remove submodule
    git submodule deinit -f "$SUBMODULE_PATH"
    git rm -f "$SUBMODULE_PATH"
    rm -rf ".git/modules/$SUBMODULE_PATH"

    print_success "Plugin removed successfully."
    echo -e "  ${BOLD}Commit the removal:${NC} ${CYAN}git commit -m 'chore: remove production-grade plugin'${NC}"
    echo ""
}

# ============================================================================
# Main
# ============================================================================

cmd_init_parallel() {
    print_header

    if [ ! -d "$SUBMODULE_PATH" ]; then
        print_error "Plugin not installed. Run '${BOLD}./setup.sh install${NC}' first."
        exit 1
    fi

    if [ ! -f "$SUBMODULE_PATH/scripts/worktree-manager.sh" ]; then
        print_error "worktree-manager.sh not found. Plugin may need updating."
        exit 1
    fi

    # Symlink worktree-manager to project root for convenience
    if [ ! -L "worktree-manager.sh" ] && [ ! -f "worktree-manager.sh" ]; then
        ln -s "$SUBMODULE_PATH/scripts/worktree-manager.sh" "worktree-manager.sh"
        print_success "Linked worktree-manager.sh to project root"
    else
        print_warn "worktree-manager.sh already exists in project root"
    fi

    # Add .worktrees/ to .gitignore if not already there
    if [ -f ".gitignore" ]; then
        if ! grep -q "^.worktrees/" ".gitignore" 2>/dev/null; then
            echo ".worktrees/" >> ".gitignore"
            print_success "Added .worktrees/ to .gitignore"
        fi
    else
        echo ".worktrees/" > ".gitignore"
        print_success "Created .gitignore with .worktrees/"
    fi

    echo ""
    print_success "Parallel dispatch ready!"
    echo -e "  ${BOLD}Worktree manager:${NC}  ./worktree-manager.sh"
    echo -e "  ${BOLD}Max workers:${NC}       4 (set MAX_WORKERS env to change)"
    echo -e "  ${BOLD}Usage:${NC}             ./worktree-manager.sh help"
    echo ""
}

case "${1:-help}" in
    install)        cmd_install ;;
    update)         cmd_update ;;
    status)         cmd_status ;;
    uninstall)      cmd_uninstall ;;
    init-parallel)  cmd_init_parallel ;;
    *)
        print_header
        echo "  Usage: ./setup.sh <command>"
        echo ""
        echo "  Commands:"
        echo "    install         First-time install as git submodule"
        echo "    update          Pull latest version from remote"
        echo "    status          Check current version & installation"
        echo "    init-parallel   Set up parallel dispatch (worktree manager + gitignore)"
        echo "    uninstall       Remove the submodule completely"
        echo ""
        ;;
esac
