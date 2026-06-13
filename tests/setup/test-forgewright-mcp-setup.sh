#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# test-forgewright-mcp-setup.sh — Automated Test Suite for ForgeWright MCP Setup
# ─────────────────────────────────────────────────────────────────

set -uo pipefail

# ─── Config ─────────────────────────────────────────────────────
SCRIPT_DIR="/Users/buiphucminhtam/GitHub/forgewright/scripts"
FORGEWRIGHT_DIR="/Users/buiphucminhtam/GitHub/forgewright"
PROJECT_ROOT="$FORGEWRIGHT_DIR"
TEST_PROJECT="/tmp/fw-test-project"

# ─── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── State ───────────────────────────────────────────────────────
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
VERBOSE=0
FAST=0

# ─── Logging ─────────────────────────────────────────────────────
pass() { echo -e "  ${GREEN}✓${NC} $1"; ((TESTS_PASSED++)) || true; }
fail() { echo -e "  ${RED}✗${NC} $1"; ((TESTS_FAILED++)) || true; }
skip() { echo -e "  ${YELLOW}⊘${NC} $1"; ((TESTS_SKIPPED++)); }
info() { echo -e "  ${BLUE}➜${NC} $1"; }

# ─── Setup ─────────────────────────────────────────────────────
setup_test_project() {
    rm -rf "$TEST_PROJECT"
    mkdir -p "$TEST_PROJECT"
    cd "$TEST_PROJECT"
    git init -q
    echo "# Test" > README.md
}

cleanup() {
    cd "$SCRIPT_DIR"
    rm -rf "$TEST_PROJECT"
}

# ─── Tests ─────────────────────────────────────────────────────
test_help() {
    echo ""
    echo -e "${CYAN}━━━ Help Commands ━━━${NC}"

    bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --help > /dev/null 2>&1
    [[ $? -eq 0 ]] && pass "forgewright-mcp-setup.sh --help" || fail "forgewright-mcp-setup.sh --help"
}

test_check() {
    echo ""
    echo -e "${CYAN}━━━ Check Command ━━━${NC}"

    cd "$PROJECT_ROOT"
    info "Testing forgewright-mcp-setup.sh --check"
    bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --check > /dev/null 2>&1 && pass "forgewright-mcp-setup.sh --check" || fail "forgewright-mcp-setup.sh --check"
}

test_diagnose() {
    echo ""
    echo -e "${CYAN}━━━ Diagnose Command ━━━${NC}"

    cd "$PROJECT_ROOT"
    info "Testing forgewright-mcp-setup.sh --diagnose"
    bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --diagnose > /dev/null 2>&1 && pass "forgewright-mcp-setup.sh --diagnose" || fail "forgewright-mcp-setup.sh --diagnose"
}

test_setup() {
    [[ "$FAST" == "1" ]] && { skip "Setup test (--fast mode)"; return; }

    echo ""
    echo -e "${CYAN}━━━ Setup Command ━━━${NC}"

    setup_test_project
    cd "$TEST_PROJECT"

    info "Testing fresh setup (--cursor only)"
    bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --cursor > /dev/null 2>&1 && pass "Setup completed" || fail "Setup failed"

    [[ -f "${TEST_PROJECT}/.antigravity/mcp-manifest.json" ]] && pass "Manifest created" || fail "Manifest not created"

    cleanup
}

test_platform_flags() {
    [[ "$FAST" == "1" ]] && { skip "Platform Flags test (--fast mode)"; return; }

    echo ""
    echo -e "${CYAN}━━━ Platform Flags ━━━${NC}"

    cd "$PROJECT_ROOT"
    bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --cursor > /dev/null 2>&1 && pass "--cursor flag" || fail "--cursor flag"
    bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --claude-code > /dev/null 2>&1 && pass "--claude-code flag" || fail "--claude-code flag"
    bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --codex > /dev/null 2>&1 && pass "--codex flag" || fail "--codex flag"
}

test_gitnexus() {
    [[ "$FAST" == "1" ]] && { skip "GitNexus test (--fast mode)"; return; }

    echo ""
    echo -e "${CYAN}━━━ GitNexus ━━━${NC}"

    cd "$PROJECT_ROOT"
    info "Testing gitnexus binary"
    if which gitnexus > /dev/null 2>&1; then
        pass "gitnexus is installed"
    else
        skip "gitnexus is not installed locally"
    fi
}

test_docs() {
    echo ""
    echo -e "${CYAN}━━━ Documentation ━━━${NC}"

    [[ -f "${FORGEWRIGHT_DIR}/docs/SETUP.md" ]] && pass "SETUP.md exists" || fail "SETUP.md missing"
    [[ -f "${FORGEWRIGHT_DIR}/docs/SETUP-QUICK.md" ]] && pass "SETUP-QUICK.md exists" || fail "SETUP-QUICK.md missing"
    [[ -f "${FORGEWRIGHT_DIR}/docs/SETUP-REFERENCE.md" ]] && pass "SETUP-REFERENCE.md exists" || fail "SETUP-REFERENCE.md missing"

    info "Checking SETUP.md uses correct script name"
    grep -q "forgewright-mcp-setup.sh" "${FORGEWRIGHT_DIR}/docs/SETUP.md" && pass "SETUP.md: forgewright-mcp-setup.sh" || fail "SETUP.md: wrong script name"

    info "Checking SETUP-QUICK.md uses correct script name"
    grep -q "forgewright-mcp-setup.sh" "${FORGEWRIGHT_DIR}/docs/SETUP-QUICK.md" && pass "SETUP-QUICK.md: forgewright-mcp-setup.sh" || fail "SETUP-QUICK.md: wrong script name"
}

test_templates() {
    echo ""
    echo -e "${CYAN}━━━ Config Templates ━━━${NC}"

    [[ -f "${SCRIPT_DIR}/templates/mcp.cursor.json" ]] && pass "mcp.cursor.json exists" || fail "mcp.cursor.json missing"
    [[ -f "${SCRIPT_DIR}/templates/mcp.claude.json" ]] && pass "mcp.claude.json exists" || fail "mcp.claude.json missing"
    [[ -f "${SCRIPT_DIR}/templates/mcp.antigravity.json" ]] && pass "mcp.antigravity.json exists" || fail "mcp.antigravity.json missing"

    info "Checking templates use correct script name"
    grep -q "forgewright-mcp-setup.sh" "${SCRIPT_DIR}/templates/mcp.cursor.json" && pass "mcp.cursor.json: correct script name" || fail "mcp.cursor.json: wrong script name"
}

# ─── Main ─────────────────────────────────────────────────────
main() {
    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --fast|-f) FAST=1 ;;
            --verbose|-v) VERBOSE=1 ;;
            --help|-h)
                echo "Usage: test-forgewright-mcp-setup.sh [--fast] [--verbose]"
                exit 0
                ;;
        esac
        shift
    done

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  ForgeWright MCP Setup Test Suite              ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"

    test_help
    test_check
    test_diagnose
    test_setup
    test_platform_flags
    test_gitnexus
    test_docs
    test_templates

    cleanup > /dev/null 2>&1

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}Passed:  ${TESTS_PASSED}${NC}"
    echo -e "  ${RED}Failed:  ${TESTS_FAILED}${NC}"
    echo -e "  ${YELLOW}Skipped: ${TESTS_SKIPPED}${NC}"
    echo ""

    [[ $TESTS_FAILED -eq 0 ]] && echo -e "  ${GREEN}✓ All tests passed!${NC}" || echo -e "  ${RED}✗ Some tests failed${NC}"
    echo ""

    [[ $TESTS_FAILED -eq 0 ]]
}

main "$@"
