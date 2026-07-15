#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# test-forgewright-mcp-setup.sh — Automated Test Suite for ForgeWright MCP Setup
# ─────────────────────────────────────────────────────────────────

set -uo pipefail

# ─── Config ─────────────────────────────────────────────────────
FORGEWRIGHT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
SCRIPT_DIR="$FORGEWRIGHT_DIR/scripts/mcp"
PROJECT_ROOT="$FORGEWRIGHT_DIR"
TEST_PROJECT="$(mktemp -d "${TMPDIR:-/tmp}/fw-test-project.XXXXXX")"
TEST_HOME="$TEST_PROJECT/home"
TEMPLATE_DIR="$FORGEWRIGHT_DIR/scripts/templates"

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

seed_canonical_dependencies() {
    mkdir -p "$TEST_HOME/.forgewright/mcp-server"
    ln -s "$FORGEWRIGHT_DIR/mcp/node_modules" "$TEST_HOME/.forgewright/mcp-server/node_modules"
}

cleanup() {
    cd "$SCRIPT_DIR"
    rm -rf "$TEST_PROJECT"
}
trap cleanup EXIT HUP INT TERM

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
    mkdir -p "$TEST_HOME"
    info "Testing forgewright-mcp-setup.sh --check"
    HOME="$TEST_HOME" bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --check > /dev/null 2>&1 && pass "forgewright-mcp-setup.sh --check" || fail "forgewright-mcp-setup.sh --check"
}

test_diagnose() {
    echo ""
    echo -e "${CYAN}━━━ Diagnose Command ━━━${NC}"

    cd "$PROJECT_ROOT"
    info "Testing forgewright-mcp-setup.sh --diagnose"
    local output
    if output="$(bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --diagnose 2>&1)"; then
        pass "forgewright-mcp-setup.sh --diagnose"
    else
        fail "forgewright-mcp-setup.sh --diagnose"
        return
    fi
    grep -Fq "DIR:     ${FORGEWRIGHT_DIR}" <<< "$output" && pass "diagnose: repository root" || fail "diagnose: wrong repository root"
    grep -Fq "forgewright: ${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-launcher.sh" <<< "$output" && pass "diagnose: canonical launcher path" || fail "diagnose: wrong launcher path"
    grep -Fq "PATH:  ${FORGEWRIGHT_DIR}/mcp" <<< "$output" && pass "diagnose: canonical MCP path" || fail "diagnose: wrong MCP path"
    if grep -Fq "/scripts/scripts/" <<< "$output"; then
        fail "diagnose: duplicated scripts path"
    else
        pass "diagnose: no duplicated scripts path"
    fi
}

test_setup() {
    [[ "$FAST" == "1" ]] && { skip "Setup test (--fast mode)"; return; }

    echo ""
    echo -e "${CYAN}━━━ Setup Command ━━━${NC}"

    setup_test_project
    cd "$TEST_PROJECT"
    mkdir -p "$TEST_HOME"
    seed_canonical_dependencies

    info "Testing fresh setup (--cursor only)"
    local output
    if output="$(HOME="$TEST_HOME" bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --cursor 2>&1)"; then
        pass "Setup completed"
    else
        fail "Setup failed"
        return
    fi

    [[ -f "${TEST_PROJECT}/.antigravity/mcp-manifest.json" ]] && pass "Manifest created" || fail "Manifest not created"
    [[ -x "${TEST_HOME}/.forgewright/mcp-server/node_modules/.bin/tsx" ]] && pass "Canonical tsx executable" || fail "Canonical tsx executable missing"
    [[ -s "${TEST_HOME}/.forgewright/mcp-server/node_modules/.forgewright-package-lock.sha256" ]] && pass "Dependency lock digest recorded" || fail "Dependency lock digest missing"
    [[ -f "${TEST_HOME}/.forgewright/mcp-server/build/runtime/tool-execution-gateway.js" ]] && pass "Gateway build artifact" || fail "Gateway build artifact missing"
    if grep -Fq "Server dir missing" <<< "$output"; then
        fail "Canonical server directory was reported missing"
    else
        pass "Canonical server verification reports the first check correctly"
    fi
    grep -Fq "${TEST_HOME}/.forgewright/mcp-server/node_modules/.bin/tsx" "${TEST_HOME}/.cursor/mcp.json" && pass "Cursor uses canonical tsx" || fail "Cursor does not use canonical tsx"
    grep -Fq "${TEST_HOME}/.forgewright/mcp-server/src/index.ts" "${TEST_HOME}/.cursor/mcp.json" && pass "Cursor uses canonical server source" || fail "Cursor does not use canonical server source"
    if grep -Fq "Claude Code (~/.claude/settings.json)" <<< "$output"; then
        fail "Skipped Claude Code reported as configured"
    else
        pass "Skipped platforms are not reported as configured"
    fi

    mkdir -p "${TEST_HOME}/.forgewright/mcp-server/src/stale"
    touch "${TEST_HOME}/.forgewright/mcp-server/src/stale/removed.ts"
    if HOME="$TEST_HOME" FORGEWRIGHT_FORCE_PYTHON_SYNC=1 \
        bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --cursor >/dev/null 2>&1 && \
        [[ ! -e "${TEST_HOME}/.forgewright/mcp-server/src/stale/removed.ts" ]]; then
        pass "Python canonical refresh removes nested stale source files"
    else
        fail "Python canonical refresh retained nested stale source files"
    fi

    cleanup
}

test_platform_flags() {
    [[ "$FAST" == "1" ]] && { skip "Platform Flags test (--fast mode)"; return; }

    echo ""
    echo -e "${CYAN}━━━ Platform Flags ━━━${NC}"

    setup_test_project
    mkdir -p "$TEST_HOME"
    seed_canonical_dependencies
    cd "$TEST_PROJECT"
    HOME="$TEST_HOME" bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --cursor > /dev/null 2>&1 && pass "--cursor flag" || fail "--cursor flag"
    HOME="$TEST_HOME" bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --claude-code > /dev/null 2>&1 && pass "--claude-code flag" || fail "--claude-code flag"
    HOME="$TEST_HOME" bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --codex > /dev/null 2>&1 && pass "--codex flag" || fail "--codex flag"
    mkdir -p "$TEST_HOME/.config/opencode"
    touch "$TEST_HOME/.config/opencode/config.toml"
    HOME="$TEST_HOME" bash "${SCRIPT_DIR}/forgewright-mcp-setup.sh" --opencode > /dev/null 2>&1 && pass "--opencode flag" || fail "--opencode flag"
    if grep -Fq "command = \"$TEST_HOME/.forgewright/mcp-server/node_modules/.bin/tsx\"" "$TEST_HOME/.config/opencode/config.toml" && \
        ! grep -Fq 'command = "npx"' "$TEST_HOME/.config/opencode/config.toml"; then
        pass "OpenCode TOML uses canonical tsx"
    else
        fail "OpenCode TOML does not use canonical tsx"
    fi
    cleanup
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

    [[ -f "${TEMPLATE_DIR}/mcp.cursor.json" ]] && pass "mcp.cursor.json exists" || fail "mcp.cursor.json missing"
    [[ -f "${TEMPLATE_DIR}/mcp.claude.json" ]] && pass "mcp.claude.json exists" || fail "mcp.claude.json missing"
    [[ -f "${TEMPLATE_DIR}/mcp.antigravity.json" ]] && pass "mcp.antigravity.json exists" || fail "mcp.antigravity.json missing"

    info "Checking templates use correct script name"
    grep -q "forgewright-mcp-setup.sh" "${TEMPLATE_DIR}/mcp.cursor.json" && pass "mcp.cursor.json: correct script name" || fail "mcp.cursor.json: wrong script name"
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
