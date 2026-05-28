#!/usr/bin/env bash
# test-memory-hygiene.sh — Tests for memory-hygiene.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(git -C "$(dirname "$SCRIPT_DIR")" rev-parse --show-toplevel 2>/dev/null || dirname "$SCRIPT_DIR")"
HYGIENE_SCRIPT="$FORGEWRIGHT_DIR/scripts/memory-hygiene.sh"

PASS=0; FAIL=0; TESTS=0
pass() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

cd "$FORGEWRIGHT_DIR"

echo ""
echo "━━━ test-memory-hygiene.sh ━━━"

# T1: Executable
((TESTS++))
if [[ -x "$HYGIENE_SCRIPT" ]]; then
    pass "Script is executable"
else
    fail "Script is not executable"
fi

# T2: Shows before/after stats
echo ""
echo "T2: Shows Before Hygiene stats"
((TESTS++))
output=$(bash "$HYGIENE_SCRIPT" --dry-run 2>&1)
if echo "$output" | grep -q "Before Hygiene"; then
    pass "Before Hygiene section present"
else
    fail "Before Hygiene section missing"
fi

# T3: Shows GC step
echo ""
echo "T3: Shows GC step"
((TESTS++))
output=$(bash "$HYGIENE_SCRIPT" --dry-run 2>&1)
if echo "$output" | grep -qi "Garbage\|gc\|GC"; then
    pass "GC step shown"
else
    fail "GC step missing"
fi

# T4: Shows dedup analysis
echo ""
echo "T4: Shows duplicate analysis"
((TESTS++))
output=$(bash "$HYGIENE_SCRIPT" --dry-run 2>&1)
if echo "$output" | grep -qi "duplicate\|similar"; then
    pass "Duplicate analysis shown"
else
    fail "Duplicate analysis missing"
fi

# T5: Shows old session cleanup
echo ""
echo "T5: Shows old session cleanup"
((TESTS++))
output=$(bash "$HYGIENE_SCRIPT" --dry-run 2>&1)
if echo "$output" | grep -qi "session\|cleanup\|old"; then
    pass "Old session cleanup shown"
else
    fail "Old session cleanup missing"
fi

# T6: Dry run does not modify
echo ""
echo "T6: Dry run does not modify mem0"
((TESTS++))
count_before=$(python3 "$FORGEWRIGHT_DIR/scripts/mem0-v2.py" stats 2>/dev/null | grep "Observations:" | grep -oE "[0-9]+" || echo "0")
sleep 1
output=$(bash "$HYGIENE_SCRIPT" --dry-run 2>&1)
count_after=$(python3 "$FORGEWRIGHT_DIR/scripts/mem0-v2.py" stats 2>/dev/null | grep "Observations:" | grep -oE "[0-9]+" || echo "0")
if [[ "$count_before" -eq "$count_after" ]]; then
    pass "Dry run unchanged: $count_before obs"
else
    fail "Dry run modified: $count_before → $count_after"
fi

# T7: Cron hint shown
echo ""
echo "T7: Cron hint shown"
((TESTS++))
output=$(bash "$HYGIENE_SCRIPT" --dry-run 2>&1)
if echo "$output" | grep -q "cron\|weekly"; then
    pass "Cron hint present"
else
    fail "Cron hint missing"
fi

# T8: Full run completes without error
echo ""
echo "T8: Full run completes"
((TESTS++))
output=$(bash "$HYGIENE_SCRIPT" 2>&1)
if echo "$output" | grep -q "complete"; then
    pass "Full run completes"
else
    fail "Full run did not complete"
fi

echo ""
echo "━━━ Results: $PASS/$TESTS passed ━━━"
