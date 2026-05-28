#!/usr/bin/env bash
# test-memory-middleware.sh — Tests for memory-middleware.py checkpoint + session-log
# NOTE: Do NOT use set -e — individual tests handle their own conditions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(git -C "$(dirname "$SCRIPT_DIR")" rev-parse --show-toplevel 2>/dev/null || dirname "$SCRIPT_DIR")"
MIDDLEWARE="$FORGEWRIGHT_DIR/scripts/memory-middleware.py"
TMP_SESSION="$FORGEWRIGHT_DIR/.forgewright/test-session-$$.json"
export FORGEWRIGHT_SESSION_LOG="$TMP_SESSION"

PASS=0
FAIL=0
TESTS=0

pass() { PASS=$((PASS+1)); TESTS=$((TESTS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); TESTS=$((TESTS+1)); echo "  ❌ $1"; }

cd "$FORGEWRIGHT_DIR"

cleanup() { rm -f "$TMP_SESSION" "$TMP_SESSION.corrupt" "$TMP_SESSION.bak" 2>/dev/null; }
trap cleanup EXIT

echo ""
echo "━━━ test-memory-middleware.sh ━━━"

# Setup: ensure clean session
rm -f "$TMP_SESSION"
python3 "$MIDDLEWARE" session-log create >/dev/null 2>&1

# T1: checkpoint command works
echo ""
echo "T1: checkpoint command works"
TESTS=$((TESTS+1))
output=$(python3 "$MIDDLEWARE" checkpoint --reason "test-checkpoint" 2>&1)
if echo "$output" | grep -qi "Checkpoint created\|checkpoint"; then
    pass "Checkpoint created"
else
    fail "Checkpoint failed: $output"
fi

# T2: checkpoint includes rich context (not just files_changed)
echo ""
echo "T2: checkpoint uses rich context (not files_changed)"
TESTS=$((TESTS+1))
output=$(bash "$FORGEWRIGHT_DIR/scripts/checkpoint-extract.sh" --reason test 2>&1)
if echo "$output" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if 'intent' in d else 1)" 2>/dev/null; then
    pass "Rich context in checkpoint"
else
    fail "Checkpoint not rich: $output"
fi

# T3: status command works
echo ""
echo "T3: status command works"
TESTS=$((TESTS+1))
output=$(python3 "$MIDDLEWARE" status 2>&1)
if echo "$output" | grep -qi "Session\|checkpoints"; then
    pass "Status command works"
else
    fail "Status command failed"
fi

# T4: mem0 stats in status
echo ""
echo "T4: mem0 stats in status output"
TESTS=$((TESTS+1))
output=$(python3 "$MIDDLEWARE" status 2>&1)
if echo "$output" | grep -qi "mem0\|Memory Stats\|Observations"; then
    pass "mem0 stats shown"
else
    fail "mem0 stats missing"
fi

# T5: session-log create
echo ""
echo "T5: session-log create works"
TESTS=$((TESTS+1))
rm -f "$TMP_SESSION"
output=$(python3 "$MIDDLEWARE" session-log create 2>&1)
if echo "$output" | grep -q "ready"; then
    pass "session-log created"
else
    fail "session-log create failed: $output"
fi

# T6: session-log start
echo ""
echo "T6: session-log start works"
TESTS=$((TESTS+1))
output=$(python3 "$MIDDLEWARE" session-log start "Architect" "test request" 2>&1)
if echo "$output" | grep -qi "Session started"; then
    pass "session-log start works"
else
    fail "session-log start failed: $output"
fi

# T7: session-log task tracking
echo ""
echo "T7: session-log task tracking works"
TESTS=$((TESTS+1))
output=$(python3 "$MIDDLEWARE" session-log task "T1" "completed" "test task summary" 2>&1)
if echo "$output" | grep -qi "T1"; then
    pass "Task tracking works"
else
    fail "Task tracking failed: $output"
fi

# T8: session-log end (depends on T6 being run first)
echo ""
echo "T8: session-log end works"
TESTS=$((TESTS+1))
output=$(python3 "$MIDDLEWARE" session-log end "test session complete" 2>&1)
if echo "$output" | grep -qi "ended\|completed"; then
    pass "session-log end works"
else
    fail "session-log end failed: $output"
fi

# T9: session-log list
echo ""
echo "T9: session-log list works"
TESTS=$((TESTS+1))
output=$(python3 "$MIDDLEWARE" session-log list 2>&1)
if echo "$output" | grep -qi "session\|completed\|interrupted"; then
    pass "session-log list works"
else
    fail "session-log list failed"
fi

# T10: session-log status (use BEFORE end so there's an active session)
echo ""
echo "T10: session-log status works (active session)"
TESTS=$((TESTS+1))
rm -f "$TMP_SESSION"
python3 "$MIDDLEWARE" session-log create >/dev/null 2>&1
python3 "$MIDDLEWARE" session-log start "Architect" "test" >/dev/null 2>&1
output=$(python3 "$MIDDLEWARE" session-log status 2>&1)
if echo "$output" | grep -qi "Session Status\|Status:\|session-log.json"; then
    pass "session-log status works"
else
    fail "session-log status failed: $output"
fi

echo ""
echo "━━━ Results: $PASS/$TESTS passed ━━━"
