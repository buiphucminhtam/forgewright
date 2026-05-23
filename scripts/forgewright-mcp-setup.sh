#!/usr/bin/env bash
# =============================================================================
# forgewright-mcp-setup — Universal MCP Setup (Cursor + Claude Code + Antigravity)
#
# Single command to set up Forgewright MCP for ALL three AI clients simultaneously.
# Works for Cursor, Claude Code, and Antigravity plugins.
#
# USAGE:
#   bash forgewright/scripts/forgewright-mcp-setup.sh
#
# OPTIONS:
#   --check       Check MCP status across all platforms
#   --cursor      Setup Cursor only
#   --claude-code Setup Claude Code only
#   --antigravity Setup Antigravity only
#   --all         Setup all platforms (default)
#   --force       Re-generate even if already set up
#   --uninstall   Remove MCP setup from all platforms
#   --diagnose    Show detailed diagnostics
#   --help        Show this help
#
# CONFIG PATHS:
#   Cursor:       ~/.cursor/mcp.json
#   Claude Code:  ~/.claude/settings.json
#   Antigravity:  ~/.cursor/projects/<hash>/mcps/<server>/tools/*.json
# =============================================================================

set -euo pipefail

# ─── Detect Forgewright Location ────────────────────────────────────────────────

declare FORGEWRIGHT_DIR=""
declare FORGEWRIGHT_IS_PROJECT="false"

detect_forgewright() {
    local script_path="${BASH_SOURCE[0]}"
    local resolved

    if [[ "$script_path" == /* ]]; then
        resolved="$(cd "$(dirname "$script_path")" && pwd -P)"
    else
        resolved="$(cd "$PWD" && cd "$(dirname "$script_path")" && pwd -P)"
    fi

    # If this script is in scripts/ under Antigravity plugin
    if [[ "$resolved" == */.antigravity/plugins/production-grade/scripts ]]; then
        local plugin_root="$(dirname "$(dirname "$(dirname "$resolved")")")"
        local current="$plugin_root"
        local found_forgewright=""
        while [[ "$current" != "/" ]] && [[ "$current" != "$HOME" ]]; do
            if [[ -d "${current}/forgewright" ]]; then
                found_forgewright="${current}/forgewright"
                break
            fi
            if [[ -f "${current}/AGENTS.md" ]] || [[ -f "${current}/CLAUDE.md" ]]; then
                found_forgewright="$current"
                break
            fi
            current="$(dirname "$current")"
        done

        if [[ -n "$found_forgewright" ]]; then
            FORGEWRIGHT_DIR="$found_forgewright"
            [[ "$found_forgewright" == "$plugin_root" ]] && FORGEWRIGHT_IS_PROJECT="true" || FORGEWRIGHT_IS_PROJECT="false"
        else
            FORGEWRIGHT_DIR="$plugin_root"
            FORGEWRIGHT_IS_PROJECT="false"
        fi
    elif [[ "$resolved" == */scripts ]]; then
        local possible_fw="$(dirname "$resolved")"
        FORGEWRIGHT_DIR="$possible_fw"
        if [[ -f "${possible_fw}/AGENTS.md" ]] || [[ -f "${possible_fw}/CLAUDE.md" ]]; then
            FORGEWRIGHT_IS_PROJECT="true"
        else
            local current="$possible_fw"
            while [[ "$current" != "/" ]] && [[ "$current" != "$HOME" ]]; do
                if [[ -f "${current}/AGENTS.md" ]] || [[ -f "${current}/CLAUDE.md" ]]; then
                    FORGEWRIGHT_DIR="$current"
                    FORGEWRIGHT_IS_PROJECT="true"
                    break
                fi
                [[ -d "${current}/.git" ]] && FORGEWRIGHT_IS_PROJECT="true" && break
                current="$(dirname "$current")"
            done
            [[ "$FORGEWRIGHT_IS_PROJECT" != "true" ]] && FORGEWRIGHT_IS_PROJECT="false"
        fi
    else
        FORGEWRIGHT_DIR="$(dirname "$resolved")"
        FORGEWRIGHT_IS_PROJECT="false"
    fi
}

detect_actual_project_root() {
    local pwd_root
    pwd_root="$(pwd -P)"
    if [[ "$FORGEWRIGHT_DIR" == "$pwd_root"/* ]]; then
        echo "$pwd_root"; return
    fi
    if [[ "$pwd_root" == "$FORGEWRIGHT_DIR" ]]; then
        echo "$FORGEWRIGHT_DIR"; return
    fi
    if [[ "$pwd_root" == "${FORGEWRIGHT_DIR}"/* ]]; then
        echo "$FORGEWRIGHT_DIR"; return
    fi
    echo "$pwd_root"
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

# ─── CLI Args ────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
forgewright-mcp-setup — Universal MCP Setup (Cursor + Claude Code + Antigravity)

USAGE:
  forgewright-mcp-setup.sh [OPTIONS]

OPTIONS:
  --all         Setup all platforms (Cursor + Claude Code + Antigravity) [DEFAULT]
  --cursor      Setup Cursor MCP only
  --claude-code Setup Claude Code MCP only
  --antigravity Setup Antigravity MCP only
  --check       Check MCP status across all platforms
  --force       Re-generate even if already set up
  --uninstall   Remove MCP setup from all platforms
  --diagnose    Show detailed diagnostics
  --help        Show this help

PLATFORMS:
  Cursor        ~/.cursor/mcp.json
  Claude Code   ~/.claude/settings.json  (mcpServers key)
  Antigravity   ~/.cursor/projects/<hash>/mcps/user-forgewright/

EXAMPLES:
  # Setup all platforms
  forgewright-mcp-setup.sh

  # Check status
  forgewright-mcp-setup.sh --check

  # Setup Claude Code only
  forgewright-mcp-setup.sh --claude-code

  # Setup Antigravity only
  forgewright-mcp-setup.sh --antigravity
EOF
}

# ─── Prerequisite Checks ────────────────────────────────────────────────────────

check_prerequisites() {
    log_step "Checking prerequisites..."

    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Install Node.js >= 18:"
        log_info "  macOS: brew install node"
        exit 1
    fi

    local node_version
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$node_version" -lt 18 ]]; then
        log_error "Node.js version too old (found $(node -v), need >=18)"
        exit 1
    fi
    log_ok "Node.js $(node -v)"

    # Check for MCP server generation script
    local script_dir
    script_dir="$(dirname "${BASH_SOURCE[0]}")"
    if [[ ! -f "${script_dir}/mcp-generate.sh" ]]; then
        log_error "MCP generation script not found: ${script_dir}/mcp-generate.sh"
        exit 1
    fi
    log_ok "MCP generation script found"
    log_ok "Forgewright found at $FORGEWRIGHT_DIR"
}

# ─── Platform Detection ─────────────────────────────────────────────────────────

# Detect which platforms are available/installed
detect_platforms() {
    local cursor_config="$HOME/.cursor/mcp.json"
    local claude_config="$HOME/.claude/settings.json"

    PLATFORM_CURSOR="false"
    PLATFORM_CLAUDE_CODE="false"
    PLATFORM_ANTIGRAVITY="false"

    # Cursor: ~/.cursor/mcp.json exists and is readable
    if [[ -f "$cursor_config" ]] && grep -q "cursor" "$cursor_config" 2>/dev/null; then
        PLATFORM_CURSOR="true"
    elif [[ -d "$HOME/.cursor" ]]; then
        PLATFORM_CURSOR="true"
    fi

    # Claude Code: ~/.claude/settings.json exists and is readable
    if [[ -f "$claude_config" ]]; then
        PLATFORM_CLAUDE_CODE="true"
    elif command -v claude &>/dev/null; then
        PLATFORM_CLAUDE_CODE="true"
    fi

    # Antigravity: MCP project folder exists
    if [[ -d "$HOME/.cursor/projects" ]]; then
        local ag_count
        ag_count=$(find "$HOME/.cursor/projects" -name "SERVER_METADATA.json" -path "*user-forgewright*" 2>/dev/null | wc -l | tr -d ' ')
        if [[ "$ag_count" -gt 0 ]]; then
            PLATFORM_ANTIGRAVITY="true"
        fi
    fi
}

# ─── Step 1: Generate MCP Server ───────────────────────────────────────────────

setup_mcp_server() {
    log_step "Generating MCP server..."
    local script_dir
    script_dir="$(dirname "${BASH_SOURCE[0]}")"

    if FORGEWRIGHT_DIR_OVERRIDE="$FORGEWRIGHT_DIR" PROJECT_ROOT_OVERRIDE="$PROJECT_ROOT" \
        bash "${script_dir}/mcp-generate.sh"; then
        log_ok "MCP server generated"
    else
        log_error "Failed to generate MCP server"
        exit 1
    fi

    # Generate manifest
    local manifest="${PROJECT_ROOT}/.antigravity/mcp-manifest.json"
    mkdir -p "$(dirname "$manifest")"
    cat > "$manifest" <<EOF
{
  "forgewright_version": "1.0.0",
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "workspace": "${PROJECT_ROOT}",
  "forgewright_path": "${FORGEWRIGHT_DIR}",
  "platforms": {
    "cursor": "${CURSOR_CONFIG}",
    "claude_code": "${CLAUDE_CODE_CONFIG}",
    "antigravity": "${ANTIGRAVITY_CONFIG}"
  }
}
EOF
    log_ok "Manifest generated at $manifest"

    # Copy launcher scripts to FORGEWRIGHT_DIR/scripts/
    mkdir -p "${FORGEWRIGHT_DIR}/scripts"
    if cp "${script_dir}/forgewright-mcp-launcher.sh" "${FORGEWRIGHT_DIR}/scripts/" 2>/dev/null; then
        chmod +x "${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-launcher.sh"
        log_ok "Copied forgewright-mcp-launcher.sh"
    fi
    if cp "${script_dir}/forgenexus-mcp-launcher.sh" "${FORGEWRIGHT_DIR}/scripts/" 2>/dev/null; then
        chmod +x "${FORGEWRIGHT_DIR}/scripts/forgenexus-mcp-launcher.sh"
        log_ok "Copied forgenexus-mcp-launcher.sh"
    fi
}

# ─── Canonical MCP Server ─────────────────────────────────────────────────────
# The canonical MCP server lives at ~/.forgewright/mcp-server/
# ALL global configs (Cursor, Claude Code) MUST point here — NEVER a submodule path.
# Submodule projects get their own .antigravity/mcp-manifest.json but the server
# they reference is always the canonical ~/.forgewright/mcp-server/server.ts.

CANONICAL_SERVER_DIR="$HOME/.forgewright/mcp-server"
CANONICAL_SERVER_TS="$CANONICAL_SERVER_DIR/server.ts"

sync_canonical_server() {
    local src_dir="${FORGEWRIGHT_DIR}/.forgewright/mcp-server"
    if [[ ! -d "$src_dir" ]]; then
        log_error "Source MCP server not found: $src_dir"
        return 1
    fi

    log_step "Syncing MCP server to canonical location..."
    mkdir -p "$CANONICAL_SERVER_DIR"

    # Sync files (preserve node_modules if already installed)
    if [[ ! -d "$CANONICAL_SERVER_DIR/node_modules" ]] || [[ -d "$src_dir/node_modules" ]] && [[ -z "$(ls -A "$CANONICAL_SERVER_DIR/node_modules" 2>/dev/null)" ]]; then
        rsync -a --exclude='node_modules' "$src_dir/" "$CANONICAL_SERVER_DIR/" 2>/dev/null || cp -r "$src_dir/"* "$CANONICAL_SERVER_DIR/" 2>/dev/null
    else
        rsync -a --exclude='node_modules' "$src_dir/" "$CANONICAL_SERVER_DIR/" 2>/dev/null || cp -r "$src_dir/"* "$CANONICAL_SERVER_DIR/" 2>/dev/null
    fi

    # Ensure node_modules is usable (reinstall if broken)
    if [[ ! -f "$CANONICAL_SERVER_DIR/node_modules/.bin/tsx" ]]; then
        log_info "  Reinstalling dependencies..."
        (cd "$CANONICAL_SERVER_DIR" && npm install --silent 2>&1 | tail -2) || true
    fi

    log_ok "Canonical MCP server synced → $CANONICAL_SERVER_DIR"
}

# ─── Platform: Cursor ──────────────────────────────────────────────────────────

CURSOR_CONFIG=""

setup_cursor() {
    CURSOR_CONFIG="$HOME/.cursor/mcp.json"
    log_step "Setting up Cursor MCP..."

    # CRITICAL: Always use CANONICAL path for global config, never submodule path
    if [[ ! -f "$CANONICAL_SERVER_TS" ]]; then
        log_error "Canonical MCP server not found: $CANONICAL_SERVER_TS"
        log_info "  Run setup from the canonical forgewright installation first."
        return 1
    fi

    mkdir -p "$(dirname "$CURSOR_CONFIG")"

    # Backup
    if [[ -f "$CURSOR_CONFIG" ]]; then
        cp "$CURSOR_CONFIG" "${CURSOR_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
    fi

    # Read existing config or create empty
    local existing="{}"
    if [[ -f "$CURSOR_CONFIG" ]]; then
        existing=$(cat "$CURSOR_CONFIG")
    fi

    # Build new config with all servers
    # NOTE: Uses CANONICAL_SERVER_TS — not $FORGEWRIGHT_DIR
    local new_config
    new_config=$(node -e "
var fs = require('fs');
var cfg;
try {
    var raw = fs.readFileSync('$CURSOR_CONFIG', 'utf8');
    cfg = JSON.parse(raw);
} catch(e) {
    cfg = {mcpServers: {}};
}
if (!cfg.mcpServers) cfg.mcpServers = {};

// forgewright MCP server — CANONICAL PATH (do not change to submodule path)
cfg.mcpServers['forgewright'] = {
    command: 'npx',
    args: ['tsx', '$CANONICAL_SERVER_TS'],
    env: {
        FORGEWRIGHT_WORKSPACE: '\${workspaceFolder}'
    }
};

// gitnexus (native CLI)
cfg.mcpServers['gitnexus'] = {
    command: '/opt/homebrew/bin/gitnexus',
    args: ['mcp']
};

// cursor-ide-browser (already present, keep it)
if (!cfg.mcpServers['cursor-ide-browser']) {
    cfg.mcpServers['cursor-ide-browser'] = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '\${workspaceFolder}']
    };
}

console.log(JSON.stringify(cfg, null, 2));
" 2>/dev/null) || {
        log_error "Failed to update Cursor config"
        return 1
    }

    echo "$new_config" > "$CURSOR_CONFIG"
    log_ok "Updated $CURSOR_CONFIG"
    log_info "  forgewright → npx tsx (CANONICAL: ~/.forgewright/mcp-server/)"
    log_info "  gitnexus    → /opt/homebrew/bin/gitnexus"
}

# ─── Platform: Claude Code ─────────────────────────────────────────────────────

CLAUDE_CODE_CONFIG=""

setup_claude_code() {
    CLAUDE_CODE_CONFIG="$HOME/.claude/settings.json"
    log_step "Setting up Claude Code MCP..."

    # CRITICAL: Always use CANONICAL path for global config, never submodule path
    if [[ ! -f "$CANONICAL_SERVER_TS" ]]; then
        log_error "Canonical MCP server not found: $CANONICAL_SERVER_TS"
        log_info "  Run setup from the canonical forgewright installation first."
        return 1
    fi

    mkdir -p "$(dirname "$CLAUDE_CODE_CONFIG")"

    # Backup
    if [[ -f "$CLAUDE_CODE_CONFIG" ]]; then
        cp "$CLAUDE_CODE_CONFIG" "${CLAUDE_CODE_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
    fi

    # Read existing config (may have other settings, mcpServers, hooks, etc.)
    local existing="{}"
    if [[ -f "$CLAUDE_CODE_CONFIG" ]]; then
        existing=$(cat "$CLAUDE_CODE_CONFIG")
    fi

    # Add MCP servers to existing config
    # NOTE: Uses CANONICAL_SERVER_TS — not $FORGEWRIGHT_DIR
    local new_config
    new_config=$(node -e "
var fs = require('fs');
var cfg;
try {
    var raw = fs.readFileSync('$CLAUDE_CODE_CONFIG', 'utf8');
    cfg = JSON.parse(raw);
} catch(e) {
    cfg = {};
}
if (!cfg.mcpServers) cfg.mcpServers = {};

// forgewright MCP server — CANONICAL PATH (do not change to submodule path)
cfg.mcpServers['forgewright'] = {
    command: 'npx',
    args: ['tsx', '$CANONICAL_SERVER_TS'],
    env: {
        FORGEWRIGHT_WORKSPACE: '\${workspaceFolder}'
    }
};

// gitnexus
cfg.mcpServers['gitnexus'] = {
    command: '/opt/homebrew/bin/gitnexus',
    args: ['mcp']
};

console.log(JSON.stringify(cfg, null, 2));
" 2>/dev/null) || {
        log_error "Failed to update Claude Code config"
        return 1
    }

    echo "$new_config" > "$CLAUDE_CODE_CONFIG"
    log_ok "Updated $CLAUDE_CODE_CONFIG"
    log_info "  forgewright → npx tsx (CANONICAL: ~/.forgewright/mcp-server/)"
    log_info "  gitnexus    → /opt/homebrew/bin/gitnexus"
}

# ─── Platform: Antigravity ─────────────────────────────────────────────────────

ANTIGRAVITY_CONFIG=""

setup_antigravity() {
    log_step "Setting up Antigravity MCP..."

    # Find existing Antigravity MCP server folder for forgewright
    local ag_server_dir=""
    local ag_project_dir=""

    if [[ -d "$HOME/.cursor/projects" ]]; then
        # Look for user-forgewright server directory
        while IFS= read -r -d '' dir; do
            if [[ -d "${dir}/tools" ]] && [[ -f "${dir}/SERVER_METADATA.json" ]]; then
                # Check if it's the forgewright server
                local meta
                meta=$(cat "${dir}/SERVER_METADATA.json" 2>/dev/null)
                if echo "$meta" | grep -q "forgewright"; then
                    ag_server_dir="$dir"
                    ag_project_dir="$(dirname "$(dirname "$(dirname "$dir")")")"
                    break
                fi
            fi
        done < <(find "$HOME/.cursor/projects" -type d -name "user-forgewright" -print0 2>/dev/null)
    fi

    if [[ -z "$ag_server_dir" ]]; then
        log_warn "Antigravity forgewright server not found in ~/.cursor/projects/"
        log_info "Looking for: ~/.cursor/projects/<hash>/mcps/user-forgewright/"
        log_info "You may need to reinstall the Antigravity plugin to register the server."
        ANTIGRAVITY_CONFIG="not_found"
        return 0
    fi

    ANTIGRAVITY_CONFIG="$ag_server_dir"
    log_ok "Found Antigravity server: $ag_server_dir"

    # The Antigravity launcher also uses CANONICAL_SERVER_TS
    local launcher="${ag_server_dir}/launcher.sh"
    if [[ ! -f "$launcher" ]]; then
        # Create launcher that uses the CANONICAL MCP server (never a submodule path)
        cat > "$launcher" <<LAUNCHER_EOF
#!/usr/bin/env bash
# Antigravity Forgewright MCP Launcher
# Uses CANONICAL server at ~/.forgewright/mcp-server/ (never a submodule path)
set -euo pipefail

# Auto-detect workspace
if [[ -n "\${FORGEWRIGHT_WORKSPACE:-}" ]]; then
    WORKSPACE="\$FORGEWRIGHT_WORKSPACE"
elif [[ -n "\${MCP_WORKSPACE_ROOT:-}" ]]; then
    WORKSPACE="\$MCP_WORKSPACE_ROOT"
elif [[ -d ".git" ]]; then
    WORKSPACE="\$(pwd)"
else
    WORKSPACE="$PROJECT_ROOT"
fi

export FORGEWRIGHT_WORKSPACE="\$WORKSPACE"
export FORGEWRIGHT_DIR="$FORGEWRIGHT_DIR"

exec npx tsx "$CANONICAL_SERVER_TS"
LAUNCHER_EOF
        chmod +x "$launcher"
        log_ok "Created Antigravity launcher: $launcher"
    fi

    log_ok "Antigravity MCP setup complete"
    log_info "  Server dir: $ag_server_dir"
    log_info "  Workspace: auto-detected from git root"
}

# ─── Verify Manifest ────────────────────────────────────────────────────────────

verify_manifest() {
    local manifest="${PROJECT_ROOT}/.antigravity/mcp-manifest.json"
    if [[ ! -f "$manifest" ]]; then
        log_error "Manifest not found: $manifest"
        return 1
    fi
    local ws_path
    ws_path=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$manifest','utf8')).workspace)}catch{e}" 2>/dev/null)
    if [[ "$ws_path" != "$PROJECT_ROOT" ]]; then
        log_warn "Manifest workspace mismatch: expected $PROJECT_ROOT, got $ws_path"
        return 1
    fi
    log_ok "Manifest verified"
}

# ─── Write Settings ─────────────────────────────────────────────────────────────

write_forgewright_settings() {
    log_step "Writing Forgewright settings..."
    local settings_dir="${PROJECT_ROOT}/.forgewright"
    mkdir -p "$settings_dir"

    local SHELL_COMPRESSOR=""
    if command -v rtk &> /dev/null; then SHELL_COMPRESSOR="rtk"
    elif command -v chop &> /dev/null; then SHELL_COMPRESSOR="chop"
    elif command -v snip &> /dev/null; then SHELL_COMPRESSOR="snip"
    elif command -v ctx &> /dev/null; then SHELL_COMPRESSOR="ctx"
    elif command -v tkill &> /dev/null; then SHELL_COMPRESSOR="tkill"
    else SHELL_COMPRESSOR="forgewright-shell-filter"; fi

    cat > "${settings_dir}/settings.env" <<SETTINGS_EOF
# Forgewright Settings — Generated by forgewright-mcp-setup.sh
export FORGEWRIGHT_SHELL_COMPRESSOR="${SHELL_COMPRESSOR}"
export FORGEWRIGHT_SHELL_FILTER_PATH="${FORGEWRIGHT_DIR}/scripts/forgewright-shell-filter.sh"
export FORGEWRIGHT_TOKEN_BUDGET="120000"
export FORGEWRIGHT_DEDUP_WINDOW="10"
export FORGEWRIGHT_SESSION_DEDUP="true"
export FORGEWRIGHT_TOOL_SANDBOX="true"
export FORGEWRIGHT_MEMORY_ENABLED="true"
if command -v token-savior &> /dev/null; then
    export FORGEWRIGHT_CODE_NAV="token-savior"
else
    export FORGEWRIGHT_CODE_NAV="gitnexus"
fi
SETTINGS_EOF
    chmod 644 "${settings_dir}/settings.env"
    log_ok "Settings written"
}

# ─── Verify Installation ────────────────────────────────────────────────────────

verify_installation() {
    log_step "Verifying installation..."

    local checks=0 passed=0
    local server_dir="${PROJECT_ROOT}/.forgewright/mcp-server"

    ((checks++)); [[ -d "$server_dir" ]] && ((passed++)) && log_ok "Server dir" || log_error "Server dir missing"
    ((checks++)); [[ -f "$server_dir/server.ts" ]] && ((passed++)) && log_ok "server.ts" || log_error "server.ts missing"
    ((checks++)); [[ -f "${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-launcher.sh" ]] && ((passed++)) && log_ok "Launcher script" || log_error "Launcher script missing"
    ((checks++)); [[ -f "${PROJECT_ROOT}/.antigravity/mcp-manifest.json" ]] && ((passed++)) && log_ok "Manifest" || log_error "Manifest missing"

    # Platform-specific checks
    ((checks++)); [[ -f "$CURSOR_CONFIG" ]] && ((passed++)) && log_ok "Cursor config" || log_error "Cursor config missing"
    ((checks++)); [[ -f "$CLAUDE_CODE_CONFIG" ]] && ((passed++)) && log_ok "Claude Code config" || log_error "Claude Code config missing"
    [[ "$ANTIGRAVITY_CONFIG" != "not_found" ]] && [[ -d "$ANTIGRAVITY_CONFIG" ]] && ((passed++)) && ((checks++)) && log_ok "Antigravity server" || true

    echo ""
    log_info "Passed: $passed/$checks checks"
}

# ─── Check Command ──────────────────────────────────────────────────────────────

cmd_check() {
    echo ""
    echo "━━━ MCP Status (All Platforms) ━━━"
    echo ""
    log_step "Project: $PROJECT_ROOT"
    echo ""

    # Cursor
    if [[ -f "$CURSOR_CONFIG" ]]; then
        log_ok "Cursor: $CURSOR_CONFIG"
        if grep -q "forgewright" "$CURSOR_CONFIG" 2>/dev/null; then
            log_ok "  forgewright: CONFIGURED"
        else
            log_warn "  forgewright: NOT configured"
        fi
        if grep -q "gitnexus" "$CURSOR_CONFIG" 2>/dev/null; then
            log_ok "  gitnexus: CONFIGURED"
        else
            log_warn "  gitnexus: NOT configured"
        fi
    else
        log_error "Cursor: NOT FOUND"
    fi
    echo ""

    # Claude Code
    if [[ -f "$CLAUDE_CODE_CONFIG" ]]; then
        log_ok "Claude Code: $CLAUDE_CODE_CONFIG"
        if grep -q "forgewright" "$CLAUDE_CODE_CONFIG" 2>/dev/null; then
            log_ok "  forgewright: CONFIGURED"
        else
            log_warn "  forgewright: NOT configured"
        fi
        if grep -q "gitnexus" "$CLAUDE_CODE_CONFIG" 2>/dev/null; then
            log_ok "  gitnexus: CONFIGURED"
        else
            log_warn "  gitnexus: NOT configured"
        fi
    else
        log_error "Claude Code: NOT FOUND"
    fi
    echo ""

    # Antigravity
    log_step "Antigravity:"
    if [[ "$ANTIGRAVITY_CONFIG" != "not_found" ]] && [[ -d "$ANTIGRAVITY_CONFIG" ]]; then
        log_ok "  Server: $ANTIGRAVITY_CONFIG"
        if grep -q "forgewright" "${ANTIGRAVITY_CONFIG}/SERVER_METADATA.json" 2>/dev/null; then
            log_ok "  forgewright: CONFIGURED"
        fi
    else
        log_warn "  Antigravity forgewright server not found"
        log_info "  (Install Antigravity plugin to register)"
    fi
    echo ""

    # Manifest
    local manifest="${PROJECT_ROOT}/.antigravity/mcp-manifest.json"
    if [[ -f "$manifest" ]]; then
        log_ok "Manifest: $manifest"
    else
        log_error "Manifest: NOT FOUND (run setup)"
    fi
    echo ""

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ─── Diagnose Command ──────────────────────────────────────────────────────────

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

    log_step "Launchers"
    echo "  forgewright: ${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-launcher.sh"
    echo "  EXISTS: $([ -f "${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-launcher.sh" ] && echo YES || echo NO)"
    echo "  forgenexus:  ${FORGEWRIGHT_DIR}/scripts/forgenexus-mcp-launcher.sh"
    echo "  EXISTS: $([ -f "${FORGEWRIGHT_DIR}/scripts/forgenexus-mcp-launcher.sh" ] && echo YES || echo NO)"
    echo ""

    log_step "MCP Server"
    local server_dir="${PROJECT_ROOT}/.forgewright/mcp-server"
    echo "  PATH:  $server_dir"
    echo "  EXISTS: $([ -d "$server_dir" ] && echo YES || echo NO)"
    echo ""

    log_step "Platform Configs"
    echo "  Cursor:       $CURSOR_CONFIG ($(ls -la "$CURSOR_CONFIG" 2>/dev/null | awk '{print $5" "$9}')"
    echo "  Claude Code:  $CLAUDE_CODE_CONFIG ($(ls -la "$CLAUDE_CODE_CONFIG" 2>/dev/null | awk '{print $5" "$9}')"
    echo "  Antigravity:  $ANTIGRAVITY_CONFIG"
    echo ""

    echo "━━━━━━━━━━━━━━━━━━━━━━"
}

# ─── Uninstall ────────────────────────────────────────────────────────────────

cmd_uninstall() {
    log_step "Removing MCP setup from all platforms..."

    # Remove from Cursor
    if [[ -f "$CURSOR_CONFIG" ]]; then
        node -e "
var fs = require('fs');
var cfg = JSON.parse(fs.readFileSync('$CURSOR_CONFIG', 'utf8'));
delete cfg.mcpServers['forgewright'];
delete cfg.mcpServers['gitnexus'];
fs.writeFileSync('$CURSOR_CONFIG', JSON.stringify(cfg, null, 2));
" 2>/dev/null && log_ok "Removed from Cursor" || log_warn "Cursor: could not clean"
    fi

    # Remove from Claude Code
    if [[ -f "$CLAUDE_CODE_CONFIG" ]]; then
        node -e "
var fs = require('fs');
var cfg = JSON.parse(fs.readFileSync('$CLAUDE_CODE_CONFIG', 'utf8'));
delete cfg.mcpServers['forgewright'];
delete cfg.mcpServers['gitnexus'];
fs.writeFileSync('$CLAUDE_CODE_CONFIG', JSON.stringify(cfg, null, 2));
" 2>/dev/null && log_ok "Removed from Claude Code" || log_warn "Claude Code: could not clean"
    fi

    # Remove server + manifest
    rm -rf "${PROJECT_ROOT}/.forgewright/mcp-server"
    rm -rf "${PROJECT_ROOT}/.antigravity/mcp-manifest.json"

    log_ok "Uninstall complete. Restart your AI clients."
}

# ─── Main ─────────────────────────────────────────────────────────────────────

declare PLATFORM_CURSOR="false"
declare PLATFORM_CLAUDE_CODE="false"
declare PLATFORM_ANTIGRAVITY="false"

main() {
    local mode="install"
    local force=false
    local skip_mcp_generate=false

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --all)           mode="install"; shift ;;
            --cursor)        mode="cursor-only"; shift ;;
            --claude-code)   mode="claude-code-only"; shift ;;
            --antigravity)   mode="antigravity-only"; shift ;;
            --check)         mode="check"; shift ;;
            --force)         force=true; shift ;;
            --uninstall)     mode="uninstall"; shift ;;
            --diagnose)      mode="diagnose"; shift ;;
            --help|-h)      show_help; exit 0 ;;
            *)               shift ;;
        esac
    done

    # Detect paths
    detect_forgewright
    PROJECT_ROOT="$(detect_actual_project_root)"

    # Set default config paths
    CURSOR_CONFIG="$HOME/.cursor/mcp.json"
    CLAUDE_CODE_CONFIG="$HOME/.claude/settings.json"
    ANTIGRAVITY_CONFIG=""

    # Auto-detect Antigravity
    if [[ -d "$HOME/.cursor/projects" ]]; then
        while IFS= read -r -d '' dir; do
            if [[ -d "${dir}/tools" ]] && grep -q "forgewright" "${dir}/SERVER_METADATA.json" 2>/dev/null; then
                ANTIGRAVITY_CONFIG="$dir"
                break
            fi
        done < <(find "$HOME/.cursor/projects" -type d -name "user-forgewright" -print0 2>/dev/null)
    fi
    [[ -z "$ANTIGRAVITY_CONFIG" ]] && ANTIGRAVITY_CONFIG="not_found"

    echo ""
    echo -e "${CYAN}⚡ Forgewright Universal MCP Setup${NC}"
    echo ""
    echo "  Forgewright: $FORGEWRIGHT_DIR"
    echo "  Project:     $PROJECT_ROOT"
    echo "  Platforms:   Cursor + Claude Code + Antigravity"
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
        install|cursor-only|claude-code-only|antigravity-only)
            # Check prerequisites for install modes
            [[ "$mode" == "install" ]] && check_prerequisites

            # Determine which platforms to setup
            local do_cursor=false do_claude=false do_antigravity=false

            case "$mode" in
                install)
                    do_cursor=true; do_claude=true; do_antigravity=true
                    ;;
                cursor-only)       do_cursor=true ;;
                claude-code-only)  do_claude=true ;;
                antigravity-only)  do_antigravity=true ;;
            esac

            # Skip MCP server regen if already exists and not forced
            if [[ "$force" == "false" ]] && [[ -f "${PROJECT_ROOT}/.antigravity/mcp-manifest.json" ]]; then
                skip_mcp_generate=true
            fi

            # Sync canonical MCP server first (MUST be done before platform setup)
            if [[ "$skip_mcp_generate" == "false" ]]; then
                setup_mcp_server
                sync_canonical_server
                echo ""
                verify_manifest || true
                echo ""
                write_forgewright_settings
                echo ""
            else
                log_ok "MCP server already exists (use --force to re-generate)"
                # Still sync canonical server even when skipping generate
                sync_canonical_server
                echo ""
            fi

            # Setup platforms
            if [[ "$do_cursor" == "true" ]]; then
                setup_cursor
                echo ""
            fi

            if [[ "$do_claude" == "true" ]]; then
                setup_claude_code
                echo ""
            fi

            if [[ "$do_antigravity" == "true" ]]; then
                setup_antigravity
                echo ""
            fi

            verify_installation
            echo ""

            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo -e " ${GREEN}✓ Universal MCP Setup Complete${NC}"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            echo "  Configured for:"
            [[ "$do_cursor" == "true" ]] && echo "    ✓ Cursor (~/.cursor/mcp.json)"
            [[ "$do_claude" == "true" ]] && echo "    ✓ Claude Code (~/.claude/settings.json)"
            [[ "$do_antigravity" == "true" ]] && echo "    ✓ Antigravity (MCP workspace)"
            echo ""
            echo "  Next: Restart your AI clients to activate MCP servers"
            echo "        Verify: bash ${BASH_SOURCE[0]} --check"
            echo ""
            ;;
    esac
}

main "$@"
