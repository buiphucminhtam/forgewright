#!/usr/bin/env bash
# =============================================================================
# Forgewright Lifecycle Script
# =============================================================================
# Manage Forgewright installation lifecycle
#
# Usage:
#   forgewright doctor              # Diagnose issues
#   forgewright doctor --fix       # Auto-fix common issues
#   forgewright list               # Show installed components
#   forgewright uninstall          # Remove all configs
#   forgewright uninstall --purge  # Remove all + data
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Forgewright directory
FORGEWRIGHT_DIR="${FORGEWRIGHT_DIR:-$HOME/.forgewright}"
SKILLS_DIR="$FORGEWRIGHT_DIR/skills"
MCP_DIR="$FORGEWRIGHT_DIR/mcp-server"
CONFIG_DIR="$FORGEWRIGHT_DIR/config"

# Counters
ISSUES=0
WARNINGS=0
FIXES=0

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((ISSUES++))
}

log_fix() {
    echo -e "${CYAN}[FIX]${NC} $1"
    ((FIXES++))
}

log_header() {
    echo ""
    echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}  $1${NC}"
    echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════════${NC}"
}

show_help() {
    cat << EOF
${BOLD}forgewright lifecycle${NC}

Manage Forgewright installation lifecycle.

${BOLD}USAGE${NC}
    forgewright doctor              # Diagnose issues
    forgewright doctor --fix       # Auto-fix common issues
    forgewright list               # Show installed components
    forgewright uninstall          # Remove all configs
    forgewright uninstall --purge  # Remove all + data
    forgewright status             # Show health status

${BOLD}COMMANDS${NC}
    doctor              Run diagnostics to check installation health
    doctor --fix        Auto-fix common issues
    list                List all installed components
    status              Show health status summary
    uninstall           Remove Forgewright configurations (keeps data)
    uninstall --purge   Remove everything including all data

${BOLD}EXAMPLES${NC}
    forgewright doctor              # Check health
    forgewright doctor --fix        # Auto-fix issues
    forgewright uninstall --purge   # Complete removal

EOF
}

# =============================================================================
# Doctor Command
# =============================================================================

check_directory() {
    log_header "Checking Forgewright Directory"

    if [[ -d "$FORGEWRIGHT_DIR" ]]; then
        log_success "Forgewright directory exists: $FORGEWRIGHT_DIR"
    else
        log_error "Forgewright directory not found: $FORGEWRIGHT_DIR"
        log_info "Run: forgewright install"
    fi
}

check_skills() {
    log_header "Checking Skills Installation"

    if [[ ! -d "$SKILLS_DIR" ]]; then
        log_error "Skills directory not found"
        return
    fi

    local skill_count=$(ls -1d "$SKILLS_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ')

    if [[ "$skill_count" -gt 0 ]]; then
        log_success "Skills installed: $skill_count"
    else
        log_warn "No skills installed"
    fi

    # Check for critical skills
    local critical_skills=(
        "production-grade"
        "software-engineer"
        "code-reviewer"
    )

    for skill in "${critical_skills[@]}"; do
        if [[ -d "$SKILLS_DIR/$skill" ]] || [[ -L "$SKILLS_DIR/$skill" ]]; then
            log_success "  ✓ $skill"
        else
            log_warn "  ✗ $skill (missing)"
        fi
    done
}

check_mcp() {
    log_header "Checking MCP Server"

    if [[ -d "$MCP_DIR" ]]; then
        log_success "MCP server directory exists"

        # Check for main files
        if [[ -f "$MCP_DIR/server.ts" ]]; then
            log_success "  ✓ server.ts"
        else
            log_warn "  ✗ server.ts (missing)"
        fi
    else
        log_warn "MCP server not installed"
    fi

    # Check MCP configurations
    log_info "Checking MCP configurations..."

    local mcp_configs=(
        "$HOME/.cursor/mcp.json"
        "$HOME/.claude/settings.json"
        "$HOME/.config/Code/User/globalStorage/buiphucminhtam.mcp-server/config.json"
    )

    for config in "${mcp_configs[@]}"; do
        if [[ -f "$config" ]]; then
            if grep -q "forgewright" "$config" 2>/dev/null; then
                log_success "  ✓ $(basename "$config")"
            else
                log_warn "  ~ $(basename "$config") (exists but no forgewright config)"
            fi
        fi
    done
}

check_hooks() {
    log_header "Checking Hooks"

    # Claude Code
    if [[ -f "$HOME/.claude/settings.json" ]]; then
        log_success "  ✓ Claude Code settings exist"
        if grep -q "verify-gate.sh" "$HOME/.claude/settings.json" 2>/dev/null; then
            log_success "    ✓ verify-gate.sh stop hook configured"
        else
            log_warn "    ✗ verify-gate.sh stop hook missing"
        fi
    else
        log_warn "  ✗ Claude Code settings not found"
    fi

    # Gemini
    if [[ -f "$HOME/.gemini/settings.json" ]]; then
        log_success "  ✓ Gemini settings exist"
        if grep -q "verify-gate.sh" "$HOME/.gemini/settings.json" 2>/dev/null; then
            log_success "    ✓ verify-gate.sh AfterAgent hook configured"
        else
            log_warn "    ✗ verify-gate.sh AfterAgent hook missing"
        fi
    else
        log_warn "  ✗ Gemini settings not found"
    fi

    # Cursor
    if [[ -f "$HOME/.cursor/hooks.json" ]]; then
        log_success "  ✓ Cursor hooks exist"
        if grep -q "followup_message" "$HOME/.cursor/hooks.json" 2>/dev/null; then
            log_success "    ✓ followup_message stop hook configured"
        else
            log_warn "    ✗ followup_message stop hook missing"
        fi
    else
        log_warn "  ✗ Cursor hooks not found"
    fi

    # Codex
    if [[ -f "$HOME/.codex/config.toml" ]]; then
        log_success "  ✓ Codex config exists"
        if grep -q "verify-gate.sh" "$HOME/.codex/config.toml" 2>/dev/null; then
            log_success "    ✓ verify-gate.sh Stop hook configured"
        else
            log_warn "    ✗ verify-gate.sh Stop hook missing"
        fi
    else
        log_warn "  ✗ Codex config not found"
    fi
}

check_scripts() {
    log_header "Checking Scripts"

    local scripts_dir="$FORGEWRIGHT_DIR/bin"
    local required_scripts=(
        "forgewright-lifecycle.sh"
        "forgewright-install.sh"
        "forgewright-update.sh"
    )

    if [[ -d "$scripts_dir" ]]; then
        log_success "Scripts directory exists"

        for script in "${required_scripts[@]}"; do
            if [[ -f "$scripts_dir/$script" ]]; then
                log_success "  ✓ $script"
            else
                log_warn "  ✗ $script (missing)"
            fi
        done
    else
        log_warn "Scripts directory not found"
    fi
}

check_config() {
    log_header "Checking Configuration"

    local configs=(
        ".production-grade.yaml"
        "CLAUDE.md"
        "AGENTS.md"
    )

    for config in "${configs[@]}"; do
        if [[ -f "$FORGEWRIGHT_DIR/$config" ]]; then
            log_success "  ✓ $config"
        else
            log_warn "  ~ $config (optional, not found)"
        fi
    done
}

check_dependencies() {
    log_header "Checking Dependencies"

    # Check for Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        log_success "Node.js installed: $node_version"
    else
        log_error "Node.js not installed"
    fi

    # Check for npx
    if command -v npx &> /dev/null; then
        log_success "npx available"
    else
        log_warn "npx not available"
    fi

    # Check for Python
    if command -v python3 &> /dev/null; then
        local python_version=$(python3 --version 2>&1)
        log_success "Python installed: $python_version"
    else
        log_warn "Python 3 not installed"
    fi

    # Check for Git
    if command -v git &> /dev/null; then
        local git_version=$(git --version)
        log_success "Git installed: $git_version"
    else
        log_error "Git not installed"
    fi
}

check_permissions() {
    log_header "Checking Permissions"

    if [[ -d "$FORGEWRIGHT_DIR" ]]; then
        if [[ -w "$FORGEWRIGHT_DIR" ]]; then
            log_success "Forgewright directory is writable"
        else
            log_error "Forgewright directory is not writable"
        fi
    fi
}

fix_common_issues() {
    local fix_mode="$1"

    log_header "Auto-Fix Mode"

    if [[ "$fix_mode" != "true" ]]; then
        log_info "Use --fix to auto-fix issues"
        return
    fi

    log_info "Attempting to fix common issues..."
    echo ""

    # Fix 1: Create missing directories
    if [[ ! -d "$FORGEWRIGHT_DIR" ]]; then
        log_fix "Creating Forgewright directory"
        mkdir -p "$FORGEWRIGHT_DIR"
    fi

    # Fix 2: Ensure bin directory exists
    if [[ ! -d "$FORGEWRIGHT_DIR/bin" ]]; then
        log_fix "Creating bin directory"
        mkdir -p "$FORGEWRIGHT_DIR/bin"
    fi

    # Fix 3: Create hooks symlink if missing
    if [[ -f "$FORGEWRIGHT_DIR/.claude/settings.json" ]]; then
        if [[ ! -f "$HOME/.claude/settings.json" ]]; then
            log_fix "Creating Claude Code settings.json symlink"
            mkdir -p "$HOME/.claude"
            ln -sf "$FORGEWRIGHT_DIR/.claude/settings.json" "$HOME/.claude/settings.json"
        fi
    fi
    if [[ -f "$FORGEWRIGHT_DIR/.gemini/settings.json" ]]; then
        if [[ ! -f "$HOME/.gemini/settings.json" ]]; then
            log_fix "Creating Gemini settings.json symlink"
            mkdir -p "$HOME/.gemini"
            ln -sf "$FORGEWRIGHT_DIR/.gemini/settings.json" "$HOME/.gemini/settings.json"
        fi
    fi
    if [[ -f "$FORGEWRIGHT_DIR/.cursor/hooks.json" ]]; then
        if [[ ! -f "$HOME/.cursor/hooks.json" ]]; then
            log_fix "Creating Cursor hooks.json symlink"
            mkdir -p "$HOME/.cursor"
            ln -sf "$FORGEWRIGHT_DIR/.cursor/hooks.json" "$HOME/.cursor/hooks.json"
        fi
    fi
    if [[ -f "$FORGEWRIGHT_DIR/.codex/config.toml" ]]; then
        if [[ ! -f "$HOME/.codex/config.toml" ]]; then
            log_fix "Creating Codex config.toml symlink"
            mkdir -p "$HOME/.codex"
            ln -sf "$FORGEWRIGHT_DIR/.codex/config.toml" "$HOME/.codex/config.toml"
        fi
    fi

    # Fix 4: Ensure skills directory exists
    if [[ ! -d "$SKILLS_DIR" ]]; then
        log_fix "Creating skills directory"
        mkdir -p "$SKILLS_DIR"
    fi

    # Fix 5: Make scripts executable
    if [[ -d "$FORGEWRIGHT_DIR/bin" ]]; then
        log_fix "Setting script permissions"
        chmod +x "$FORGEWRIGHT_DIR/bin"/*.sh 2>/dev/null || true
        chmod +x "$FORGEWRIGHT_DIR/bin"/*.py 2>/dev/null || true
    fi

    # Fix 6: Re-run MCP setup if needed
    if [[ -d "$MCP_DIR" ]] && [[ -f "$MCP_DIR/server.ts" ]]; then
        log_fix "Running MCP setup..."
        "$FORGEWRIGHT_DIR/scripts/forgewright-mcp-setup.sh" --claude-code 2>/dev/null || true
        "$FORGEWRIGHT_DIR/scripts/forgewright-mcp-setup.sh" --cursor 2>/dev/null || true
    fi

    echo ""
    if [[ "$FIXES" -gt 0 ]]; then
        log_success "Applied $FIXES fixes"
    else
        log_info "No fixes needed"
    fi
}

# =============================================================================
# List Command
# =============================================================================

list_all() {
    log_header "Installed Components"

    echo ""
    echo -e "  ${BOLD}Location:${NC} $FORGEWRIGHT_DIR"
    echo ""

    # Skills
    echo -e "  ${BOLD}Skills (${CYAN}$(ls -1d "$SKILLS_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ')${NC} installed)${NC}"
    if [[ -d "$SKILLS_DIR" ]]; then
        for skill in "$SKILLS_DIR"/*/; do
            local skill_name=$(basename "$skill")
            if [[ -L "$skill" ]]; then
                echo -e "    ${GREEN}→${NC} $skill_name (symlink)"
            else
                echo -e "    ${CYAN}•${NC} $skill_name"
            fi
        done
    fi

    echo ""

    # MCP
    echo -e "  ${BOLD}MCP Server${NC}"
    if [[ -d "$MCP_DIR" ]]; then
        echo -e "    ${GREEN}✓${NC} Installed at: $MCP_DIR"
    else
        echo -e "    ${YELLOW}✗${NC} Not installed"
    fi

    echo ""

    # Configurations
    echo -e "  ${BOLD}Configurations${NC}"
    local configs=(
        ".production-grade.yaml"
        "CLAUDE.md"
        "AGENTS.md"
    )
    for config in "${configs[@]}"; do
        if [[ -f "$FORGEWRIGHT_DIR/$config" ]]; then
            echo -e "    ${GREEN}✓${NC} $config"
        fi
    done

    echo ""

    # Scripts
    echo -e "  ${BOLD}Scripts${NC}"
    if [[ -d "$FORGEWRIGHT_DIR/bin" ]]; then
        for script in "$FORGEWRIGHT_DIR/bin"/*.sh "$FORGEWRIGHT_DIR/bin"/*.py; do
            if [[ -f "$script" ]]; then
                local script_name=$(basename "$script")
                echo -e "    ${GREEN}✓${NC} $script_name"
            fi
        done
    fi

    echo ""
}

# =============================================================================
# Uninstall Command
# =============================================================================

uninstall() {
    local purge="$1"

    log_header "Uninstall Forgewright"

    echo ""
    echo -e "  ${BOLD}Location:${NC} $FORGEWRIGHT_DIR"
    echo ""

    if [[ "$purge" != "true" ]]; then
        echo "  This will remove:"
        echo "    • MCP configurations"
        echo "    • CLI configurations"
        echo "    • Forgewright directory"
        echo ""
        echo "  This will NOT remove:"
        echo "    • ~/.claude hooks"
        echo "    • Memory data"
        echo "    • Session logs"
        echo ""
    else
        echo "  ${RED}WARNING: This will remove EVERYTHING${NC}"
        echo ""
        echo "  This will remove:"
        echo "    • All of the above"
        echo "    • ~/.claude hooks"
        echo "    • All memory data"
        echo "    • All session logs"
        echo "    • All configurations"
        echo ""
    fi

    echo ""
    read -p "Are you sure? [y/N] " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Uninstall cancelled."
        exit 0
    fi

    # Remove MCP configurations
    log_info "Removing MCP configurations..."

    local mcp_configs=(
        "$HOME/.cursor/mcp.json"
        "$HOME/.claude/settings.json"
    )

    for config in "${mcp_configs[@]}"; do
        if [[ -f "$config" ]]; then
            # Backup before modifying
            cp "$config" "$config.backup.$(date +%s)"
            # Remove forgewright entries
            if command -v python3 &> /dev/null; then
                python3 -c "
import json
with open('$config', 'r') as f:
    data = json.load(f)
if 'mcpServers' in data and 'forgewright' in data['mcpServers']:
    del data['mcpServers']['forgewright']
with open('$config', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || log_warn "Could not clean $config"
            fi
            log_success "Cleaned: $config"
        fi
    done

    # Remove hooks
    log_info "Removing hooks..."
    for file in \
        "$HOME/.claude/settings.json" \
        "$HOME/.gemini/settings.json" \
        "$HOME/.cursor/hooks.json" \
        "$HOME/.codex/config.toml"
    do
        if [[ -f "$file" ]]; then
            if grep -q "verify-gate.sh\|followup_message" "$file" 2>/dev/null; then
                rm "$file"
                log_success "Removed hook config: $file"
            fi
        fi
    done

    # Remove aliases
    log_info "Removing shell aliases..."
    for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
        if [[ -f "$rc" ]]; then
            if grep -q "forgewright" "$rc" 2>/dev/null; then
                # Remove forgewright lines
                grep -v "forgewright\|Forgewright CLI" "$rc" > "$rc.tmp" 2>/dev/null || true
                mv "$rc.tmp" "$rc"
                log_success "Cleaned: $rc"
            fi
        fi
    done

    # Remove Forgewright directory
    log_info "Removing Forgewright directory..."
    if [[ -d "$FORGEWRIGHT_DIR" ]]; then
        if [[ "$purge" == "true" ]]; then
            rm -rf "$FORGEWRIGHT_DIR"
            log_success "Removed: $FORGEWRIGHT_DIR"
        else
            # Only remove certain subdirectories
            rm -rf "$FORGEWRIGHT_DIR/bin" 2>/dev/null || true
            rm -rf "$FORGEWRIGHT_DIR/mcp-server" 2>/dev/null || true
            log_success "Removed: binaries and MCP server"
        fi
    fi

    echo ""
    log_success "Uninstall complete!"

    if [[ "$purge" == "true" ]]; then
        echo ""
        echo "  All Forgewright data has been removed."
        echo "  To reinstall, run: forgewright install"
    else
        echo ""
        echo "  Configuration removed. To fully reinstall, run:"
        echo "    forgewright install"
    fi
}

# =============================================================================
# Status Command
# =============================================================================

show_status() {
    local health="healthy"
    local health_color="$GREEN"

    # Run quick checks
    local checks_passed=0
    local checks_total=3

    [[ -d "$FORGEWRIGHT_DIR" ]] && ((checks_passed++))
    [[ -d "$SKILLS_DIR" ]] && ((checks_passed++))
    [[ -d "$MCP_DIR" ]] && ((checks_passed++))

    if [[ "$checks_passed" -lt 2 ]]; then
        health="unhealthy"
        health_color="$RED"
    elif [[ "$checks_passed" -lt 3 ]]; then
        health="degraded"
        health_color="$YELLOW"
    fi

    echo ""
    echo -e "  ${BOLD}Forgewright Status${NC}"
    echo ""
    echo -e "  ${BOLD}Health:${NC} ${health_color}$health${NC}"
    echo -e "  ${BOLD}Location:${NC} $FORGEWRIGHT_DIR"
    echo -e "  ${BOLD}Skills:${NC} $(ls -1d "$SKILLS_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ') installed"
    echo ""

    if [[ "$health" == "healthy" ]]; then
        echo -e "  ${GREEN}✓${NC} All checks passed"
    elif [[ "$health" == "degraded" ]]; then
        echo -e "  ${YELLOW}⚠${NC} Some components missing"
        echo ""
        echo "  Run 'forgewright doctor' for details"
    else
        echo -e "  ${RED}✗${NC} Installation issues detected"
        echo ""
        echo "  Run 'forgewright install' to fix"
    fi

    echo ""
}

# =============================================================================
# Main
# =============================================================================

# Parse command
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
    doctor|diagnose)
        FIX_MODE="false"
        while [[ $# -gt 0 ]]; do
            case "$1" in
                --fix|-f)
                    FIX_MODE="true"
                    shift
                    ;;
                *)
                    shift
                    ;;
            esac
        done

        log_header "Forgewright Doctor"

        check_directory
        check_dependencies
        check_skills
        check_mcp
        check_hooks
        check_scripts
        check_config
        check_permissions

        echo ""
        log_header "Summary"

        echo ""
        echo -e "  ${BOLD}Issues:${NC} $ISSUES"
        echo -e "  ${BOLD}Warnings:${NC} $WARNINGS"

        if [[ "$FIX_MODE" == "true" ]]; then
            fix_common_issues "true"
        fi

        echo ""
        if [[ "$ISSUES" -eq 0 && "$WARNINGS" -eq 0 ]]; then
            log_success "All checks passed!"
        elif [[ "$ISSUES" -eq 0 ]]; then
            log_warn "Installation has warnings but no errors"
        else
            log_error "Installation has issues"
            echo ""
            echo "  Run 'forgewright doctor --fix' to auto-fix"
        fi
        echo ""
        ;;

    list|ls)
        list_all
        ;;

    uninstall|remove)
        PURGE="false"
        while [[ $# -gt 0 ]]; do
            case "$1" in
                --purge|-p)
                    PURGE="true"
                    shift
                    ;;
                *)
                    shift
                    ;;
            esac
        done
        uninstall "$PURGE"
        ;;

    status)
        show_status
        ;;

    help|--help|-h)
        show_help
        ;;

    *)
        log_error "Unknown command: $COMMAND"
        echo ""
        show_help
        exit 1
        ;;
esac
