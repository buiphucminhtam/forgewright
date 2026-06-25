#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Forgewright Submodule Check — Check and pull updates for Forgewright submodule
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "  ${BLUE}➜${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1"; }

# 1. Detect if running inside a submodule parent project
PARENT_DIR="$(pwd)"
SUBMODULE_NAME="forgewright"

if [[ ! -d ".git" ]]; then
    error "Not a git repository root. Please run from project root."
    exit 1
fi

# Find where the forgewright submodule is located
SUBMODULE_DIR=""
if [[ -f ".gitmodules" ]]; then
    # Parse submodule path
    SUBMODULE_DIR=$(git config --file .gitmodules --get-regexp path | grep -i "forgewright" | awk '{print $2}' || echo "")
fi

# Fallback: check standard locations
if [[ -z "$SUBMODULE_DIR" ]]; then
    if [[ -d "forgewright" ]] && [[ -d "forgewright/.git" || -f "forgewright/.git" ]]; then
        SUBMODULE_DIR="forgewright"
    fi
fi

if [[ -z "$SUBMODULE_DIR" ]]; then
    error "Forgewright submodule not found in this project."
    exit 1
fi

# 2. Check if submodule is out of sync or has remote updates
cd "$SUBMODULE_DIR"

# Check if there are local modifications in submodule
if ! git diff --quiet; then
    warn "Submodule has local uncommitted changes. Skipping auto-update to avoid conflicts."
    exit 0
fi

# Fetch remote changes in submodule
git fetch origin >/dev/null 2>&1 || {
    warn "Failed to fetch remote. Offline?"
    exit 0
}

current_branch=$(git branch --show-current)
[[ -z "$current_branch" ]] && current_branch="main"

behind=$(git rev-list --count "HEAD..origin/${current_branch}" 2>/dev/null || echo "0")

if [[ "$behind" -gt 0 ]]; then
    warn "Forgewright submodule is $behind commits behind origin/${current_branch}!"
    
    # Auto-pull if requested or running in git hooks/CI
    if [[ "${1:-}" == "--pull" ]]; then
        info "Automatically updating Forgewright submodule..."
        cd "$PARENT_DIR"
        git submodule update --remote --merge "$SUBMODULE_DIR"
        success "Forgewright submodule updated successfully!"
        
        # Also rebuild MCP and update config
        if [[ -f "${SUBMODULE_DIR}/scripts/forgewright-mcp-setup.sh" ]]; then
            info "Re-running MCP setup to apply updates..."
            bash "${SUBMODULE_DIR}/scripts/forgewright-mcp-setup.sh" >/dev/null 2>&1 || true
        fi
    else
        info "Run 'git submodule update --remote --merge' or 'bash forgewright/scripts/forgewright-submodule-check.sh --pull' to update."
    fi
else
    success "Forgewright submodule is up to date."
fi
