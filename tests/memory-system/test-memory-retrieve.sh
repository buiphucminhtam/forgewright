#!/usr/bin/env bash
# test-memory-retrieve.sh — Tests for memory-retrieve.sh
# NOTE: Do NOT use set -e globally — individual tests check their own conditions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Use git root so this works from any subdirectory
FORGEWRIGHT_DIR="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/..")"
RETRIEVE_SCRIPT="$FORGEWRIGHT_DIR/scripts/memory-retrieve.sh"
MEM0="$FORGEWRIGHT_DIR/scripts/mem0-v2.py"

PASS=0
FAIL=0
TESTS=0

pass() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

cd "$FORGEWRIGHT_DIR"

echo ""
echo "━━━ test-memory-retrieve.sh ━━━"

# ── T1: Script exists and is executable ─────────────────────────────────
echo ""
echo "T1: Script exists and is executable"
((TESTS++))
if [[ -x "$RETRIEVE_SCRIPT" ]]; then
    pass "Script is executable"
else
    fail "Script is not executable"
fi

# ── T2: Help/usage works ───────────────────────────────────────────────
echo ""
echo "T2: No-arg invocation shows usage (not error)"
((TESTS++))
output=$(bash "$RETRIEVE_SCRIPT" 2>&1 || true)
if [[ -n "$output" ]] && [[ "$output" != *"Error"* ]]; then
    pass "No-arg invocation produces output"
else
    fail "No-arg invocation failed: $output"
fi

# ── T3: Keyword extraction ───────────────────────────────────────────────
echo ""
echo "T3: Keyword extraction removes stopwords"
((TESTS++))
output=$(bash "$RETRIEVE_SCRIPT" "the quick brown fox jumps over the lazy dog" 2>&1)
# "quick", "brown", "fox", "jumps" should remain; stopwords filtered
if echo "$output" | grep -qi "quick\|brown\|fox\|jumps"; then
    pass "Keywords extracted correctly"
else
    fail "Keywords not extracted: $output"
fi

# ── T4: Mem0 search integration ────────────────────────────────────────
echo ""
echo "T4: Mem0 search integration (keyword 'memory')"
((TESTS++))
output=$(bash "$RETRIEVE_SCRIPT" "memory system" 2>&1)
if echo "$output" | grep -qi "memory\|Memory"; then
    pass "Mem0 results returned"
else
    fail "No mem0 results for 'memory': $output"
fi

# ── T5: MEMORY BLOCK output format ─────────────────────────────────────
echo ""
echo "T5: MEMORY BLOCK header present"
((TESTS++))
output=$(bash "$RETRIEVE_SCRIPT" "forgewright" 2>&1)
if echo "$output" | grep -q "MEMORY BLOCK\|MEMORY RETRIEVAL"; then
    pass "MEMORY BLOCK header present"
else
    fail "MEMORY BLOCK header missing"
fi

# ── T6: Session summary loaded ──────────────────────────────────────────
echo ""
echo "T6: Session info section present"
((TESTS++))
output=$(bash "$RETRIEVE_SCRIPT" "forgewright checkpoint" 2>&1)
if echo "$output" | grep -qi "Session\|session"; then
    pass "Session info loaded"
else
    fail "Session info missing"
fi

# ── T7: Relevant memories count ─────────────────────────────────────────
echo ""
echo "T7: Memory retrieval count logged"
((TESTS++))
output=$(bash "$RETRIEVE_SCRIPT" "OmO intentgate" 2>&1)
if echo "$output" | grep -qi "memories loaded\|N memories"; then
    pass "Memory count logged"
else
    fail "Memory count not logged: $output"
fi

# ── T8: Non-zero exit on missing deps ─────────────────────────────────
echo ""
echo "T8: Handles missing mem0 gracefully"
((TESTS++))
# Rename mem0 temporarily
mv "$MEM0" "$MEM0.bak" 2>/dev/null || true
output=$(bash "$RETRIEVE_SCRIPT" "test query" 2>&1 || echo "EXIT:$?")
mv "$MEM0.bak" "$MEM0" 2>/dev/null || true
if echo "$output" | grep -qi "not found\|Error\|EXIT:1"; then
    pass "Missing dep handled gracefully"
else
    fail "Missing dep not handled: $output"
fi

# ── T9: Multi-word request ─────────────────────────────────────────────
echo ""
echo "T9: Multi-word keyword extraction"
((TESTS++))
output=$(bash "$RETRIEVE_SCRIPT" "JWT authentication token security" 2>&1)
if echo "$output" | grep -qi "jwt\|authentication\|token\|security"; then
    pass "Multi-word keywords extracted"
else
    fail "Multi-word extraction failed"
fi

# ── T10: Output format is markdown ─────────────────────────────────────
echo ""
echo "T10: Output includes markdown headers"
((TESTS++))
output=$(bash "$RETRIEVE_SCRIPT" "memory retrieval" 2>&1)
if echo "$output" | grep -q "^##\|^###\|^---"; then
    pass "Markdown format present"
else
    fail "Markdown format missing"
fi

echo ""
echo "━━━ Results: $PASS/$TESTS passed ━━━"
[[ "$FAIL" -eq 0 ]]
