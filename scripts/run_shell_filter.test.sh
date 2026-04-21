#!/usr/bin/env bash
# Unit tests for run_shell_filter.sh
#
# Run with: bash run_shell_filter.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="$(mktemp -d)"

trap "rm -rf $TEST_DIR" EXIT

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

log_pass() { echo -e "${GREEN}✓${NC} $1"; ((TESTS_PASSED++)) || true; }
log_fail() { echo -e "${RED}✗${NC} $1"; ((TESTS_FAILED++)) || true; }

run_test() {
    local name="$1"
    local test_cmd="$2"
    if eval "$test_cmd" 2>/dev/null; then
        log_pass "$name"
    else
        log_fail "$name"
    fi
}

# ── Test: detect_compressor function ──────────────────────────────────────

echo "═══════════════════════════════════════"
echo "  run_shell_filter.sh Tests"
echo "═══════════════════════════════════════"
echo ""

echo "── detect_compressor ──"

# Test 1: env var takes precedence
run_test "env var takes precedence" '
    export SHELL_COMPRESSOR="rtk" && 
    source '"$SCRIPT_DIR"'/run_shell_filter.sh &&
    [[ "$(detect_compressor)" == "rtk" ]]
'

# Test 2: settings.env file
run_test "reads from settings.env" '
    mkdir -p "'"$TEST_DIR"'/.forgewright" &&
    echo "SHELL_COMPRESSOR=\"chop\"" > "'"$TEST_DIR"'/.forgewright/settings.env" &&
    export FORGEWRIGHT_DIR="'"$TEST_DIR"'" &&
    unset SHELL_COMPRESSOR &&
    source '"$SCRIPT_DIR"'/run_shell_filter.sh &&
    [[ "$(detect_compressor)" == "chop" ]]
'

# Test 3: auto-detect fallback
run_test "falls back to native filter" '
    export FORGEWRIGHT_DIR="/nonexistent" &&
    unset SHELL_COMPRESSOR &&
    source '"$SCRIPT_DIR"'/run_shell_filter.sh &&
    [[ "$(detect_compressor)" == "forgewright-shell-filter" ]]
'

echo ""

# ── Test: run_shell_filter function ─────────────────────────────────────────

echo "── run_shell_filter ──"

# Test: pipe mode with input
run_test "pipe mode works" '
    export FORGEWRIGHT_DIR="'"$FORGEWRIGHT_DIR"'" &&
    unset SHELL_COMPRESSOR &&
    source '"$SCRIPT_DIR"'/run_shell_filter.sh &&
    result=$(echo "Hello World" | run_shell_filter) &&
    [[ "$result" == *"Hello World"* ]]
'

# Test: run_shell_filter with input from pipe (simulating real usage)
run_test "pipe mode with filter args" '
    export FORGEWRIGHT_DIR="'"$FORGEWRIGHT_DIR"'" &&
    unset SHELL_COMPRESSOR &&
    source '"$SCRIPT_DIR"'/run_shell_filter.sh &&
    result=$(echo "test" | run_shell_filter) &&
    [[ -n "$result" ]]
'

echo ""

# ── Test: native filter exists ─────────────────────────────────────────────

echo "── native filter ──"

NATIVE_FILTER="$SCRIPT_DIR/../scripts/forgewright-shell-filter.sh"
[[ -f "$NATIVE_FILTER" ]] && \
    log_pass "native filter exists" || log_fail "native filter missing"

# ── Test: settings.env format ──────────────────────────────────────────────

echo ""

echo "── settings ──"

echo "export SHELL_COMPRESSOR=\"test\"" > "$TEST_DIR/.forgewright/settings.env"
source "$TEST_DIR/.forgewright/settings.env" 2>/dev/null && \
    log_pass "settings.env sourceable" || log_fail "settings.env not sourceable"

# ── Summary ────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════"
if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All $TESTS_PASSED tests passed!${NC}"
else
    echo -e "${RED}❌ $TESTS_PASSED passed, $TESTS_FAILED failed${NC}"
fi
echo "═══════════════════════════════════════"

exit $TESTS_FAILED
