#!/usr/bin/env bash
# test-memory-suggest.sh — Tests for memory-suggest.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(git -C "$(dirname "$SCRIPT_DIR")" rev-parse --show-toplevel 2>/dev/null || dirname "$SCRIPT_DIR")"
SUGGEST_SCRIPT="$FORGEWRIGHT_DIR/scripts/memory-suggest.sh"

PASS=0; FAIL=0; TESTS=0
pass() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

cd "$FORGEWRIGHT_DIR"

echo ""
echo "━━━ test-memory-suggest.sh ━━━"

# T1: Executable
((TESTS++))
if [[ -x "$SUGGEST_SCRIPT" ]]; then
    pass "Script is executable"
else
    fail "Script is not executable"
fi

# T2: Has header
echo ""
echo "T2: Has MEMORY SUGGESTIONS header"
((TESTS++))
output=$(bash "$SUGGEST_SCRIPT" "add JWT auth feature" 2>&1)
if echo "$output" | grep -q "MEMORY SUGGESTIONS\|Convention"; then
    pass "Header present"
else
    fail "Header missing"
fi

# T3: Classifies request type
echo ""
echo "T3: Classifies request type"
((TESTS++))
output=$(bash "$SUGGEST_SCRIPT" "add JWT auth feature" 2>&1)
if echo "$output" | grep -qi "feature\|feature request\|Request type"; then
    pass "Request type classified"
else
    fail "Request type not classified"
fi

# T4: Keywords extracted
echo ""
echo "T4: Keywords extracted"
((TESTS++))
output=$(bash "$SUGGEST_SCRIPT" "implement user authentication" 2>&1)
if echo "$output" | grep -qi "Keywords:\|authentication\|implement"; then
    pass "Keywords extracted"
else
    fail "Keywords not extracted"
fi

# T5: Feature suggestions
echo ""
echo "T5: Feature suggestions generated"
((TESTS++))
output=$(bash "$SUGGEST_SCRIPT" "add new feature" 2>&1)
if echo "$output" | grep -qi "Feature\|architecture\|decisions"; then
    pass "Feature suggestions generated"
else
    fail "Feature suggestions missing"
fi

# T6: Review suggestions
echo ""
echo "T6: Review suggestions for review requests"
((TESTS++))
output=$(bash "$SUGGEST_SCRIPT" "review my code quality" 2>&1)
if echo "$output" | grep -qi "review\|Code Review\|quality"; then
    pass "Review suggestions generated"
else
    fail "Review suggestions missing"
fi

# T7: Debug suggestions
echo ""
echo "T7: Debug suggestions for bug reports"
((TESTS++))
output=$(bash "$SUGGEST_SCRIPT" "fix authentication bug error" 2>&1)
if echo "$output" | grep -qi "debug\|blocker\|error"; then
    pass "Debug suggestions generated"
else
    fail "Debug suggestions missing"
fi

# T8: Test suggestions
echo ""
echo "T8: Test suggestions for test requests"
((TESTS++))
output=$(bash "$SUGGEST_SCRIPT" "write tests for auth module" 2>&1)
if echo "$output" | grep -qi "test\|coverage\|qa"; then
    pass "Test suggestions generated"
else
    fail "Test suggestions missing"
fi

# T9: Deploy suggestions
echo ""
echo "T9: Deploy suggestions for deployment requests"
((TESTS++))
output=$(bash "$SUGGEST_SCRIPT" "deploy to production" 2>&1)
if echo "$output" | grep -qi "deploy\|pipeline\|ship"; then
    pass "Deploy suggestions generated"
else
    fail "Deploy suggestions missing"
fi

# T10: Handles no request
echo ""
echo "T10: Handles empty request gracefully"
((TESTS++))
output=$(bash "$SUGGEST_SCRIPT" 2>&1 || true)
if [[ -n "$output" ]] && echo "$output" | grep -qi "no request\|warning\|usage"; then
    pass "Empty request handled"
else
    fail "Empty request not handled: $output"
fi

echo ""
echo "━━━ Results: $PASS/$TESTS passed ━━━"
