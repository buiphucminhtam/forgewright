#!/usr/bin/env bash
# test-checkpoint-extract.sh — Tests for checkpoint-extract.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(git -C "$(dirname "$SCRIPT_DIR")" rev-parse --show-toplevel 2>/dev/null || dirname "$SCRIPT_DIR")"
EXTRACT_SCRIPT="$FORGEWRIGHT_DIR/scripts/checkpoint-extract.sh"

PASS=0; FAIL=0; TESTS=0
pass() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

cd "$FORGEWRIGHT_DIR"

echo ""
echo "━━━ test-checkpoint-extract.sh ━━━"

# T1: Executable
((TESTS++))
if [[ -x "$EXTRACT_SCRIPT" ]]; then
    pass "Script is executable"
else
    fail "Script is not executable"
fi

# T2: JSON output
echo ""
echo "T2: Outputs valid JSON"
((TESTS++))
output=$(bash "$EXTRACT_SCRIPT" --reason test 2>&1)
if echo "$output" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
    pass "Valid JSON output"
else
    fail "Invalid JSON: $output"
fi

# T3: Required fields
echo ""
echo "T3: JSON has required fields"
((TESTS++))
output=$(bash "$EXTRACT_SCRIPT" --reason test 2>&1)
required_fields=("checkpoint_id" "timestamp" "reason" "intent" "file_counts" "workspace")
missing=0
for field in "${required_fields[@]}"; do
    if ! echo "$output" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if '$field' in d else 1)" 2>/dev/null; then
        ((missing++))
    fi
done
if [[ $missing -eq 0 ]]; then
    pass "All required fields present"
else
    fail "$missing missing fields"
fi

# T4: checkpoint_id format
echo ""
echo "T4: checkpoint_id follows cp-YYYYMMDD-HHMMSS format"
((TESTS++))
output=$(bash "$EXTRACT_SCRIPT" --reason test 2>&1)
cpid=$(echo "$output" | python3 -c "import json,sys; print(json.load(sys.stdin).get('checkpoint_id',''))" 2>/dev/null)
if [[ "$cpid" =~ ^cp-[0-9]{8}-[0-9]{6}$ ]]; then
    pass "checkpoint_id format correct: $cpid"
else
    fail "Invalid checkpoint_id: $cpid"
fi

# T5: reason captured
echo ""
echo "T5: --reason flag captured in output"
((TESTS++))
output=$(bash "$EXTRACT_SCRIPT" --reason "my-custom-reason" 2>&1)
reason=$(echo "$output" | python3 -c "import json,sys; print(json.load(sys.stdin).get('reason',''))" 2>/dev/null)
if [[ "$reason" == "my-custom-reason" ]]; then
    pass "Reason captured: $reason"
else
    fail "Reason not captured: $reason"
fi

# T6: file_counts is dict
echo ""
echo "T6: file_counts is a dict"
((TESTS++))
output=$(bash "$EXTRACT_SCRIPT" --reason test 2>&1)
counts=$(echo "$output" | python3 -c "import json,sys; print(type(json.load(sys.stdin).get('file_counts','')).__name__)" 2>/dev/null)
if [[ "$counts" == "dict" ]]; then
    pass "file_counts is dict"
else
    fail "file_counts is $counts, expected dict"
fi

# T7: session_mode field
echo ""
echo "T7: session_mode field present"
((TESTS++))
output=$(bash "$EXTRACT_SCRIPT" --reason test 2>&1)
mode=$(echo "$output" | python3 -c "import json,sys; print(json.load(sys.stdin).get('session_mode',''))" 2>/dev/null)
if [[ -n "$mode" ]]; then
    pass "session_mode: $mode"
else
    fail "session_mode missing"
fi

# T8: workspace is absolute path
echo ""
echo "T8: workspace is absolute path"
((TESTS++))
output=$(bash "$EXTRACT_SCRIPT" --reason test 2>&1)
ws=$(echo "$output" | python3 -c "import json,sys; print(json.load(sys.stdin).get('workspace',''))" 2>/dev/null)
if [[ "$ws" == /* ]]; then
    pass "workspace is absolute: $ws"
else
    fail "workspace not absolute: $ws"
fi

echo ""
echo "━━━ Results: $PASS/$TESTS passed ━━━"
