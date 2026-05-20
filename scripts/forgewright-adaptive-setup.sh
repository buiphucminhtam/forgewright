#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# forgewright-adaptive-setup — ONE-TIME setup for ALL projects
#
# This script:
#   1. Indexes all Git repos with GitNexus (for code intelligence)
#   2. Sets up GitNexus MCP (the universal, project-agnostic MCP)
#   3. Updates ~/.cursor/mcp.json or ~/Library/Application Support/Claude/
#
# After this, Forgewright works for ALL projects without per-project setup.
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────

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

# ─── Detect Forgewright Location ─────────────────────────────────────

FORGEWRIGHT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
FORGEWRIGHT_DIR="${FORGEWRIGHT_DIR%/scripts}"

# ─── Find All Git Repos ──────────────────────────────────────────────

find_git_repos() {
    local base_dir="$1"
    local depth="${2:-2}"

    find "$base_dir" -maxdepth "$depth" -type d -name ".git" 2>/dev/null | while read -r git_dir; do
        dirname "$git_dir"
    done
}

# ─── Index Repos with GitNexus ────────────────────────────────────────

index_repos() {
    local repos=("$@")
    local total=${#repos[@]}
    local current=0

    echo ""
    echo "━━━ Indexing Repos with GitNexus ━━━"
    echo ""

    for repo in "${repos[@]}"; do
        ((current++))
        local name
        name="$(basename "$repo")"

        echo -ne "  [$current/$total] Indexing $name... "

        if [[ -d "$repo/.git" ]]; then
            if gitnexus analyze "$repo" > /dev/null 2>&1; then
                echo -e "${GREEN}✓${NC}"
            else
                echo -e "${YELLOW}⚠${NC}"
            fi
        else
            echo -e "${YELLOW}○${NC} (not a git repo)"
        fi
    done

    echo ""
}

# ─── Setup GitNexus MCP ─────────────────────────────────────────────

setup_gitnexus_mcp() {
    echo ""
    echo "━━━ Setting up GitNexus MCP ━━━"
    echo ""

    # Check if gitnexus mcp is available
    if gitnexus mcp --help &>/dev/null; then
        log_ok "GitNexus MCP is available"
    else
        log_warn "GitNexus MCP not found, installing..."
        if npm install -g gitnexus &>/dev/null; then
            log_ok "GitNexus installed"
        else
            log_error "Failed to install GitNexus"
            return 1
        fi
    fi

    # Find gitnexus MCP binary
    local mcp_bin=""
    for path in \
        "$(npm root -g)/gitnexus-mcp/dist/index.js" \
        "$HOME/.npm/_npx/*/node_modules/gitnexus-mcp/dist/index.js"; do
        if [[ -f "$path" ]]; then
            mcp_bin="$path"
            break
        fi
    done

    if [[ -z "$mcp_bin" ]]; then
        # Try to find it
        mcp_bin=$(find "$HOME/.npm/_npx" -name "index.js" -path "*/gitnexus-mcp/*" 2>/dev/null | head -1 || true)
    fi

    if [[ -n "$mcp_bin" ]] && [[ -f "$mcp_bin" ]]; then
        log_ok "GitNexus MCP binary found: $mcp_bin"
        echo "$mcp_bin"
        return 0
    fi

    log_warn "GitNexus MCP binary not found"
    log_info "GitNexus MCP will be auto-detected at runtime"
    return 1
}

# ─── Update MCP Config ───────────────────────────────────────────────

update_mcp_config() {
    echo ""
    echo "━━━ Updating MCP Config ━━━"
    echo ""

    # Detect client type
    local config_path=""
    local client_type=""

    if [[ -d "$HOME/Library/Application Support/Claude" ]]; then
        config_path="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
        client_type="Claude Desktop"
    elif [[ -d "$HOME/.cursor" ]]; then
        config_path="$HOME/.cursor/mcp.json"
        client_type="Cursor"
    else
        log_error "Could not detect Claude Desktop or Cursor"
        return 1
    fi

    log_step "Client: $client_type"
    log_step "Config: $config_path"

    # Get GitNexus MCP command
    local mcp_bin
    mcp_bin=$(setup_gitnexus_mcp) || mcp_bin="gitnexus mcp"

    # Get unified launcher path
    local launcher="${FORGEWRIGHT_DIR}/scripts/forgewright-unified-launcher.sh"

    # Create backup
    if [[ -f "$config_path" ]]; then
        cp "$config_path" "${config_path}.bak.$(date +%Y%m%d%H%M%S)"
    fi

    # Update config using Node.js
    local new_config
    new_config=$(node -e "
var fs = require('fs');
var cfg;
try {
    cfg = JSON.parse(fs.readFileSync('$config_path', 'utf8'));
} catch(e) {
    cfg = { mcpServers: {} };
}
if (!cfg.mcpServers) cfg.mcpServers = {};

// Add GitNexus MCP server
cfg.mcpServers['gitnexus'] = {
    command: 'node',
    args: ['$mcp_bin']
};

// Add ForgeWright unified launcher (fallback)
cfg.mcpServers['forgewright'] = {
    command: 'bash',
    args: ['$launcher']
};

console.log(JSON.stringify(cfg, null, 2));
" 2>/dev/null) || {
        log_error "Failed to update config"
        return 1
    }

    echo "$new_config" > "$config_path"
    log_ok "Updated $config_path"

    echo ""
}

# ─── List Indexed Repos ───────────────────────────────────────────────

list_indexed_repos() {
    echo ""
    echo "━━━ GitNexus Indexed Repos ━━━"
    echo ""

    local repos
    repos=$(gitnexus list 2>/dev/null || echo "")

    if [[ -z "$repos" ]]; then
        log_warn "No repositories indexed"
        log_info "Run 'gitnexus analyze <repo-path>' to index a repository"
    else
        echo "$repos"
    fi

    echo ""
}

# ─── Main ────────────────────────────────────────────────────────────

main() {
    echo ""
    echo -e "${CYAN}⚡ ForgeWright Adaptive Setup${NC}"
    echo "  Multi-project, zero-config MCP setup"
    echo ""

    # Find all Git repos
    log_step "Scanning for Git repositories..."
    local repos=()

    for dir in "$HOME/GitHub" "$HOME/Documents/GitHub" "$HOME/Projects"; do
        if [[ -d "$dir" ]]; then
            while IFS= read -r repo; do
                repos+=("$repo")
            done < <(find_git_repos "$dir" 3)
        fi
    done

    if [[ ${#repos[@]} -eq 0 ]]; then
        log_error "No git repositories found"
        exit 1
    fi

    log_ok "Found ${#repos[@]} repository(s)"
    echo ""

    # Show all repos
    echo "━━━ Repositories ━━━"
    echo ""
    for repo in "${repos[@]}"; do
        echo "  • $(basename "$repo")"
        echo "    $repo"
    done
    echo ""

    # Ask for confirmation
    read -p "Proceed with indexing and setup? [Y/n] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]] && [[ -n $REPLY ]]; then
        echo "Cancelled."
        exit 0
    fi

    # Index all repos
    index_repos "${repos[@]}"

    # Show indexed repos
    list_indexed_repos

    # Update MCP config
    update_mcp_config

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e " ${GREEN}✓ Adaptive Setup Complete${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  • GitNexus indexed ${#repos[@]} repositories"
    echo "  • GitNexus MCP configured"
    echo "  • ForgeWright unified launcher configured"
    echo ""
    echo "  Restart your AI client to activate MCP"
    echo ""
}

main "$@"
