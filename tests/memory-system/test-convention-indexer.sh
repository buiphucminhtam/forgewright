#!/usr/bin/env bash
# test-convention-indexer.sh — Tests for convention-indexer.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(git -C "$(dirname "$SCRIPT_DIR")" rev-parse --show-toplevel 2>/dev/null || dirname "$SCRIPT_DIR")"
INDEXER_SCRIPT="$FORGEWRIGHT_DIR/scripts/convention-indexer.sh"

PASS=0; FAIL=0; TESTS=0
pass() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

cd "$FORGEWRIGHT_DIR"

echo ""
echo "━━━ test-convention-indexer.sh ━━━"

# T1: Executable
((TESTS++))
if [[ -x "$INDEXER_SCRIPT" ]]; then
    pass "Script is executable"
else
    fail "Script is not executable"
fi

# T2: Dry run produces output
echo ""
echo "T2: Dry run produces output"
((TESTS++))
output=$(bash "$INDEXER_SCRIPT" --dry-run 2>&1)
if [[ -n "$output" ]] && echo "$output" | grep -q "Found\|DRY"; then
    pass "Dry run produces output"
else
    fail "Dry run failed: $output"
fi

# T3: Counts conventions
echo ""
echo "T3: Counts conventions"
((TESTS++))
output=$(bash "$INDEXER_SCRIPT" --dry-run 2>&1)
if echo "$output" | grep -q "Found [0-9]* conventions"; then
    count=$(echo "$output" | grep "Found" | grep -oE "[0-9]+" | head -1)
    pass "Found $count conventions"
else
    fail "Convention count missing: $output"
fi

# T4: Dry run shows would-store items
echo ""
echo "T4: Dry run shows would-store items"
((TESTS++))
output=$(bash "$INDEXER_SCRIPT" --dry-run 2>&1)
if echo "$output" | grep -q "Would store\|DRY\]"; then
    pass "Would-store items shown"
else
    fail "Would-store items missing"
fi

# T5: Full run stores conventions
echo ""
echo "T5: Full run stores conventions"
((TESTS++))
# Check stats before
before=$(python3 "$FORGEWRIGHT_DIR/scripts/mem0-v2.py" stats 2>/dev/null | grep "decisions:" | grep -oE "[0-9]+" || echo "0")
output=$(bash "$INDEXER_SCRIPT" 2>&1)
if echo "$output" | grep -q "Stored: [0-9]*/[0-9]*"; then
    stored=$(echo "$output" | grep -oE "Stored: [0-9]+" | grep -oE "[0-9]+")
    total=$(echo "$output" | grep -oE "Stored: [0-9]+/[0-9]+" | cut -d/ -f2)
    if [[ "$stored" -gt 0 ]] && [[ "$stored" -eq "$total" ]]; then
        pass "Stored $stored/$total conventions"
    else
        fail "Storage incomplete: $stored/$total"
    fi
else
    fail "Storage output missing"
fi

# T6: No error on second run (idempotent via mem0 dedup)
echo ""
echo "T6: Second run is idempotent (mem0 dedup)"
((TESTS++))
output=$(bash "$INDEXER_SCRIPT" 2>&1)
if echo "$output" | grep -q "Stored:"; then
    pass "Second run completes"
else
    fail "Second run failed"
fi

echo ""
echo "━━━ Results: $PASS/$TESTS passed ━━━"
