#!/usr/bin/env bash
#────────────────────────────────────────────────────────────────────────────
# Forgewright Hook Doctor
#────────────────────────────────────────────────────────────────────────────
# Purpose: Diagnose hook health and configuration across all AI IDEs
#
# Usage:
#   bash forgewright/scripts/forgewright-hook-doctor.sh          # Full diagnosis
#   bash forgewright/scripts/forgewright-hook-doctor.sh --quick  # Quick check
#   bash forgewright/scripts/forgewright-hook-doctor.sh --fix     # Auto-fix issues
#
# Checks:
#   - Hook script exists and is executable
#   - Memory session script exists
#   - Environment variables configured
#   - Claude Code hooks.json configured
#   - Profile settings valid
#   - Disk space for memory storage
#────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/forgewright-memory-hook.sh"
MEMORY_SESSION="${SCRIPT_DIR}/memory-session.sh"
MEMORY_DB_DIR="${HOME}/.forgewright/sessions"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
PASS=0 FAIL=0 WARN=0

# ─── Logging Functions ────────────────────────────────────────────────────────

log_pass() { echo -e "${GREEN}  ✓${NC} $1"; PASS=$((PASS + 1)); }
log_fail() { echo -e "${RED}  ✗${NC} $1"; FAIL=$((FAIL + 1)); }
log_warn() { echo -e "${YELLOW}  ⚠${NC} $1"; WARN=$((WARN + 1)); }
log_info() { echo -e "  $1"; }
log_header() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ─── Argument Parsing ─────────────────────────────────────────────────────────

QUICK_MODE=false
AUTO_FIX=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --quick) QUICK_MODE=true; shift ;;
        --fix) AUTO_FIX=true; shift ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --quick   Quick health check (skip detailed tests)"
            echo "  --fix     Auto-fix detected issues"
            echo "  --help    Show this help"
            exit 0
            ;;
        *) shift ;;
    esac
done

# ─── Banner ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}⚕️  Forgewright Hook Doctor${NC}"
echo ""
echo "  Hook Script: $HOOK_SCRIPT"
echo "  Memory Session: $MEMORY_SESSION"
echo "  Profile: ${FORGEWRIGHT_HOOK_PROFILE:-standard}"
echo ""

# ─── Check 1: Script Existence ────────────────────────────────────────────────

log_header "Script Files"

# Hook script
if [[ -f "$HOOK_SCRIPT" ]]; then
    log_pass "Hook script exists: $HOOK_SCRIPT"
    if [[ -x "$HOOK_SCRIPT" ]]; then
        log_pass "Hook script is executable"
    else
        log_fail "Hook script is NOT executable"
        if [[ "$AUTO_FIX" == "true" ]]; then
            chmod +x "$HOOK_SCRIPT"
            log_info "  → Fixed: Made executable"
        fi
    fi
else
    log_fail "Hook script MISSING: $HOOK_SCRIPT"
fi

# Memory session script
if [[ -f "$MEMORY_SESSION" ]]; then
    log_pass "Memory session script exists: $MEMORY_SESSION"
    if [[ -x "$MEMORY_SESSION" ]]; then
        log_pass "Memory session script is executable"
    else
        log_fail "Memory session script is NOT executable"
        if [[ "$AUTO_FIX" == "true" ]]; then
            chmod +x "$MEMORY_SESSION"
            log_info "  → Fixed: Made executable"
        fi
    fi
else
    log_fail "Memory session script MISSING: $MEMORY_SESSION"
fi

# ─── Check 2: Directory Structure ──────────────────────────────────────────────

log_header "Directory Structure"

# Forgewright directories
for dir in \
    "${HOME}/.forgewright" \
    "${HOME}/.forgewright/sessions" \
    "${SCRIPT_DIR}/.." \
    "${HOME}/.claude"
do
    if [[ -d "$dir" ]]; then
        log_pass "Directory exists: $dir"
    else
        log_warn "Directory missing: $dir"
        if [[ "$AUTO_FIX" == "true" ]]; then
            mkdir -p "$dir"
            log_info "  → Fixed: Created directory"
        fi
    fi
done

# ─── Check 3: Environment Variables ───────────────────────────────────────────

log_header "Environment Configuration"

# Profile
if [[ -n "${FORGEWRIGHT_HOOK_PROFILE:-}" ]]; then
    case "$FORGEWRIGHT_HOOK_PROFILE" in
        minimal|standard|strict)
            log_pass "Profile set: $FORGEWRIGHT_HOOK_PROFILE"
            ;;
        *)
            log_warn "Profile invalid: $FORGEWRIGHT_HOOK_PROFILE (expected: minimal|standard|strict)"
            ;;
    esac
else
    log_info "Profile not set (default: standard)"
fi

# Tick interval
if [[ -n "${FORGEWRIGHT_MEMORY_TICK_INTERVAL:-}" ]]; then
    log_pass "Tick interval: $FORGEWRIGHT_MEMORY_TICK_INTERVAL"
elif [[ -n "${MEMORY_CHECKPOINT_INTERVAL:-}" ]]; then
    log_pass "Legacy tick interval (MEMORY_CHECKPOINT_INTERVAL): $MEMORY_CHECKPOINT_INTERVAL"
else
    log_info "Tick interval not set (default: 3)"
fi

# Disabled hooks
if [[ -n "${FORGEWRIGHT_DISABLED_HOOKS:-}" ]]; then
    log_pass "Disabled hooks: $FORGEWRIGHT_DISABLED_HOOKS"
else
    log_info "No disabled hooks"
fi

# Session start max chars
if [[ -n "${FORGEWRIGHT_SESSION_START_MAX_CHARS:-}" ]]; then
    log_pass "Session start max chars: $FORGEWRIGHT_SESSION_START_MAX_CHARS"
else
    log_info "Session start max chars not set (default: 50000)"
fi

# ─── Check 4: Claude Code Hooks Configuration ──────────────────────────────────

log_header "Claude Code Configuration"

CLAUDE_SETTINGS="${HOME}/.claude/settings.json"
if [[ -f "$CLAUDE_SETTINGS" ]]; then
    log_pass "Claude Code settings file exists"

    # Check if hooks are configured
    if grep -q "forgewright-memory-hook" "$CLAUDE_SETTINGS" 2>/dev/null; then
        log_pass "Hook script referenced in settings"

        # Check if PostMessage hook is set
        if grep -q '"PostMessage".*forgewright-memory-hook' "$CLAUDE_SETTINGS" 2>/dev/null || \
           grep -q 'PostMessage.*forgewright-memory-hook' "$CLAUDE_SETTINGS" 2>/dev/null; then
            log_pass "PostMessage hook configured"
        else
            log_warn "PostMessage hook may not be configured"
        fi
    else
        log_warn "Hook script NOT referenced in Claude Code settings"
        if [[ "$AUTO_FIX" == "true" ]]; then
            # Backup
            cp "$CLAUDE_SETTINGS" "${CLAUDE_SETTINGS}.bak.$(date +%Y%m%d%H%M%S)"
            # Add hooks using Node.js
            node -e "
var fs = require('fs');
var cfg = JSON.parse(fs.readFileSync('$CLAUDE_SETTINGS', 'utf8'));
if (!cfg.hooks) cfg.hooks = {};
cfg.hooks.PostMessage = '$HOOK_SCRIPT tick';
cfg.hooks.PostToolUse = '$HOOK_SCRIPT checkpoint';
fs.writeFileSync('$CLAUDE_SETTINGS', JSON.stringify(cfg, null, 2));
"
            log_info "  → Fixed: Added hook references to settings"
        fi
    fi
else
    log_warn "Claude Code settings file not found: $CLAUDE_SETTINGS"
    log_info "  Run 'claude' once to generate settings, then re-run doctor"
fi

# ─── Check 5: Memory Session Status ───────────────────────────────────────────

if [[ "$QUICK_MODE" == "false" ]]; then
    log_header "Memory Session Status"

    if [[ -f "$MEMORY_SESSION" ]]; then
        # Run status check
        status_output=$("$MEMORY_SESSION" status 2>&1) || true

        if [[ -n "$status_output" ]]; then
            log_info "Session status:"
            echo "$status_output" | while IFS= read -r line; do
                log_info "  $line"
            done
        else
            log_warn "Could not get session status"
        fi
    fi

    # ─── Check 6: Disk Space ──────────────────────────────────────────────────

    log_header "Disk Space"

    session_size=$(du -sh "$MEMORY_DB_DIR" 2>/dev/null | cut -f1 || echo "unknown")
    log_info "Memory database size: $session_size"

    # Check available disk space
    available=$(df -h "$HOME" 2>/dev/null | tail -1 | awk '{print $4}')
    log_info "Available disk space: $available"

    # ─── Check 7: Hook Initialization State ────────────────────────────────────

    log_header "Hook Initialization"

    init_file="${HOME}/.forgewright/hooks-initialized-standard"
    if [[ -f "$init_file" ]]; then
        log_pass "Hooks initialized (standard profile)"
        log_info "  Last init: $(stat -f "%Sm" "$init_file" 2>/dev/null || stat -c "%y" "$init_file" 2>/dev/null || echo "unknown")"
    else
        log_warn "Hooks not yet initialized (first run after config)"
    fi
fi

# ─── Check 8: Profile Validation ─────────────────────────────────────────────

log_header "Profile Validation"

get_profile_hooks() {
    local profile="$1"
    case "$profile" in
        minimal) echo "tick" ;;
        standard) echo "tick checkpoint status" ;;
        strict) echo "tick checkpoint status verbose token_warn" ;;
        *) echo "" ;;
    esac
}

current_profile="${FORGEWRIGHT_HOOK_PROFILE:-standard}"
profile_hooks=$(get_profile_hooks "$current_profile")

if [[ -n "$profile_hooks" ]]; then
    log_pass "Profile '$current_profile' is valid"
    log_info "  Enabled hooks: $profile_hooks"
else
    log_fail "Profile '$current_profile' is invalid"
    log_info "  Valid profiles: minimal standard strict"
fi

# ─── Check 9: Quick Syntax Check ─────────────────────────────────────────────

if [[ "$QUICK_MODE" == "false" ]]; then
    log_header "Script Syntax"

    if bash -n "$HOOK_SCRIPT" 2>/dev/null; then
        log_pass "Hook script syntax is valid"
    else
        log_fail "Hook script has syntax errors"
    fi

    if bash -n "$MEMORY_SESSION" 2>/dev/null; then
        log_pass "Memory session script syntax is valid"
    else
        log_fail "Memory session script has syntax errors"
    fi
fi

# ─── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${CYAN}Summary${NC}"

total=$((PASS + FAIL + WARN))
echo "  Total checks: $total"
echo -e "  ${GREEN}Passed${NC}: $PASS"
echo -e "  ${RED}Failed${NC}: $FAIL"
echo -e "  ${YELLOW}Warnings${NC}: $WARN"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo -e "${RED}⚠️  Some checks failed. Run with --fix to attempt auto-repair.${NC}"
    exit 1
elif [[ $WARN -gt 0 ]]; then
    echo -e "${YELLOW}⚠️  Some warnings - review above.${NC}"
    exit 0
else
    echo -e "${GREEN}✓ All checks passed! Hooks are healthy.${NC}"
    exit 0
fi
