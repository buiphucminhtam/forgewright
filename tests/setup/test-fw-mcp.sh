#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# test-fw-mcp.sh — Automated Test Suite for ForgeWright MCP
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
pass() { echo -e "  ${GREEN}✓${NC} $1"; ((TESTS_PASSED++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((TESTS_FAILED++)); }
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

    # Test individual commands - capture exit code first
    bash "${SCRIPT_DIR}/fw-mcp.sh" --help > /dev/null 2>&1
    [[ $? -eq 0 ]] && pass "fw-mcp.sh --help" || fail "fw-mcp.sh --help"

    bash "${SCRIPT_DIR}/fw-mcp.sh" --version > /dev/null 2>&1
    [[ $? -eq 0 ]] && pass "fw-mcp.sh --version" || fail "fw-mcp.sh --version"

    bash "${SCRIPT_DIR}/forgenexus-setup.sh" --help > /dev/null 2>&1
    [[ $? -eq 0 ]] && pass "forgenexus-setup.sh --help" || fail "forgenexus-setup.sh --help"
}

test_check() {
    echo ""
    echo -e "${CYAN}━━━ Check Command ━━━${NC}"

    cd "$PROJECT_ROOT"
    info "Testing fw-mcp.sh check"
    bash "${SCRIPT_DIR}/fw-mcp.sh" check > /dev/null 2>&1 && pass "fw-mcp.sh check" || fail "fw-mcp.sh check"
}

test_diagnose() {
    echo ""
    echo -e "${CYAN}━━━ Diagnose Command ━━━${NC}"

    cd "$PROJECT_ROOT"
    info "Testing fw-mcp.sh diagnose"
    bash "${SCRIPT_DIR}/fw-mcp.sh" diagnose > /dev/null 2>&1 && pass "fw-mcp.sh diagnose" || fail "fw-mcp.sh diagnose"
}

test_setup() {
    [[ "$FAST" == "1" ]] && { skip "Setup test (--fast mode)"; return; }

    echo ""
    echo -e "${CYAN}━━━ Setup Command ━━━${NC}"

    setup_test_project
    cd "$TEST_PROJECT"

    info "Testing fresh setup"
    bash "${SCRIPT_DIR}/fw-mcp.sh" setup > /dev/null 2>&1 && pass "Setup completed" || fail "Setup failed"

    [[ -f "${TEST_PROJECT}/.antigravity/mcp-manifest.json" ]] && pass "Manifest created" || fail "Manifest not created"

    cleanup
}

test_wizard() {
    echo ""
    echo -e "${CYAN}━━━ Wizard Command ━━━${NC}"

    # Wizard is interactive - just verify the script exists and is executable
    [[ -x "${SCRIPT_DIR}/fw-mcp.sh" ]] && pass "fw-mcp.sh is executable" || fail "fw-mcp.sh not executable"
    [[ -f "${SCRIPT_DIR}/fw-mcp.sh" ]] && pass "fw-mcp.sh exists" || fail "fw-mcp.sh not found"
}

test_forgenexus() {
    [[ "$FAST" == "1" ]] && { skip "ForgeNexus test (--fast mode)"; return; }

    echo ""
    echo -e "${CYAN}━━━ ForgeNexus ━━━${NC}"

    cd "$PROJECT_ROOT"
    info "Testing forgenexus-setup.sh --check"
    bash "${SCRIPT_DIR}/forgenexus-setup.sh" --check > /dev/null 2>&1 && pass "ForgeNexus check" || fail "ForgeNexus check"

    [[ -f "${FORGEWRIGHT_DIR}/forgenexus/dist/cli/index.js" ]] && pass "ForgeNexus CLI exists" || fail "ForgeNexus CLI not found"
}

test_ext_gen() {
    [[ "$FAST" == "1" ]] && { skip "Extension gen test (--fast mode)"; return; }

    echo ""
    echo -e "${CYAN}━━━ Extension Generator ━━━${NC}"

    cd "$PROJECT_ROOT"
    info "Testing fw-ext-gen.sh --check"
    bash "${SCRIPT_DIR}/fw-ext-gen.sh" --check > /dev/null 2>&1 && pass "Extension gen check" || fail "Extension gen check"
}

test_deprecated() {
    echo ""
    echo -e "${CYAN}━━━ Deprecated Scripts ━━━${NC}"

    [[ -f "${SCRIPT_DIR}/forgewright-mcp-setup.sh" ]] && {
        grep -q "DEPRECATED" "${SCRIPT_DIR}/forgewright-mcp-setup.sh" && pass "forgewright-mcp-setup.sh deprecated" || fail "forgewright-mcp-setup.sh not deprecated"
    }

    [[ -f "${SCRIPT_DIR}/forgeNexus-quick-setup.sh" ]] && {
        grep -q "DEPRECATED" "${SCRIPT_DIR}/forgeNexus-quick-setup.sh" && pass "forgeNexus-quick-setup.sh deprecated" || fail "forgeNexus-quick-setup.sh not deprecated"
    }
}

test_docs() {
    echo ""
    echo -e "${CYAN}━━━ Documentation ━━━${NC}"

    [[ -f "${FORGEWRIGHT_DIR}/docs/SETUP.md" ]] && pass "SETUP.md exists" || fail "SETUP.md missing"
    [[ -f "${FORGEWRIGHT_DIR}/docs/SETUP-QUICK.md" ]] && pass "SETUP-QUICK.md exists" || fail "SETUP-QUICK.md missing"
    [[ -f "${FORGEWRIGHT_DIR}/docs/SETUP-REFERENCE.md" ]] && pass "SETUP-REFERENCE.md exists" || fail "SETUP-REFERENCE.md missing"
}

test_templates() {
    echo ""
    echo -e "${CYAN}━━━ Config Templates ━━━${NC}"

    [[ -f "${SCRIPT_DIR}/templates/mcp.cursor.json" ]] && pass "mcp.cursor.json exists" || fail "mcp.cursor.json missing"
    [[ -f "${SCRIPT_DIR}/templates/mcp.claude.json" ]] && pass "mcp.claude.json exists" || fail "mcp.claude.json missing"
    [[ -f "${SCRIPT_DIR}/templates/mcp.antigravity.json" ]] && pass "mcp.antigravity.json exists" || fail "mcp.antigravity.json missing"
}

# ─── Main ─────────────────────────────────────────────────────
main() {
    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --fast|-f) FAST=1 ;;
            --verbose|-v) VERBOSE=1 ;;
            --help|-h)
                echo "Usage: test-fw-mcp.sh [--fast] [--verbose]"
                exit 0
                ;;
        esac
        shift
    done

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  ForgeWright MCP Test Suite                     ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"

    test_help
    test_check
    test_diagnose
    test_setup
    test_wizard
    test_forgenexus
    test_ext_gen
    test_deprecated
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
