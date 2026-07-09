#!/usr/bin/env bash
# scripts/lite/test-escalate.sh
# Deterministic dry-run test suite for escalate.sh
#
# Tests:
#   1. Exact CLI argv emitted per configured activeCli (agy, claude, codex, gemini)
#   2. Config parsing: expertMode.activeCli, fallbackCli, budget keys
#   3. Packet evidence reads real .forgewright/verify files
#   4. Redaction removes secrets before packet creation
#   5. Budget refusal when maxExpertCallsPerRun is reached
#   6. Output path: escalation records go to .forgewright/escalations/
#
# No paid CLI calls are made. All tests use --dry-run.
# Exit code: 0 = all PASS, 1 = any FAIL.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ESCALATE="$SCRIPT_DIR/escalate.sh"

PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

assert_contains() {
    local label="$1" needle="$2" haystack="$3"
    if echo "$haystack" | grep -qF -- "$needle"; then
        echo "[PASS] $label"
        (( PASS++ )) || true
    else
        echo "[FAIL] $label"
        echo "       Expected to find: $needle"
        echo "       In output:"
        echo "$haystack" | sed 's/^/         /'
        (( FAIL++ )) || true
    fi
}

assert_not_contains() {
    local label="$1" needle="$2" haystack="$3"
    if ! echo "$haystack" | grep -qF -- "$needle"; then
        echo "[PASS] $label"
        (( PASS++ )) || true
    else
        echo "[FAIL] $label"
        echo "       Did NOT expect to find: $needle"
        (( FAIL++ )) || true
    fi
}

assert_exit() {
    local label="$1" expected="$2" actual="$3"
    if [[ "$actual" == "$expected" ]]; then
        echo "[PASS] $label (exit=$actual)"
        (( PASS++ )) || true
    else
        echo "[FAIL] $label (expected exit=$expected, got $actual)"
        (( FAIL++ )) || true
    fi
}

make_config() {
    local dir="$1" active_cli="$2" fallback="${3:-null}" max_calls="${4:-5}" req_confirm="${5:-3}"
    cat > "$dir/.production-grade.yaml" <<YAML
expertMode:
  enabled: true
  activeCli: "${active_cli}"
  fallbackCli: ${fallback}
  budget:
    maxExpertCallsPerRun: ${max_calls}
    requireConfirmationAbove: ${req_confirm}
YAML
}

run_dry() {
    local root="$1"; shift
    PROJECT_ROOT="$root" bash "$ESCALATE" --dry-run "$@" 2>&1 || true
}

# ---------------------------------------------------------------------------
# Test 1: argv for agy (--print)
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 1: agy argv ---"
t1=$(mktemp -d "$tmpdir/t1.XXXX")
make_config "$t1" "agy"
out=$(run_dry "$t1" "fix the auth bug")
assert_contains "agy argv contains '--print'" "'--print'" "$out"
assert_contains "agy argv starts with 'agy'" "'agy'" "$out"
assert_not_contains "agy argv does NOT use --headless" "--headless" "$out"
assert_not_contains "agy argv does NOT use --prompt-file" "--prompt-file" "$out"

# ---------------------------------------------------------------------------
# Test 2: argv for claude (-p)
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 2: claude argv ---"
t2=$(mktemp -d "$tmpdir/t2.XXXX")
make_config "$t2" "claude"
out=$(run_dry "$t2" "review the schema")
assert_contains "claude argv contains '-p'" "'-p'" "$out"

# ---------------------------------------------------------------------------
# Test 3: argv for codex (exec)
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 3: codex argv ---"
t3=$(mktemp -d "$tmpdir/t3.XXXX")
make_config "$t3" "codex"
out=$(run_dry "$t3" "optimize the query")
assert_contains "codex argv contains 'exec'" "'exec'" "$out"

# ---------------------------------------------------------------------------
# Test 4: argv for gemini (-p)
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 4: gemini argv ---"
t4=$(mktemp -d "$tmpdir/t4.XXXX")
make_config "$t4" "gemini"
out=$(run_dry "$t4" "deploy the service")
assert_contains "gemini argv contains '-p'" "'-p'" "$out"

# ---------------------------------------------------------------------------
# Test 5: config parsing — reads expertMode keys, not expert_cli
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 5: config parsing ---"
t5=$(mktemp -d "$tmpdir/t5.XXXX")
make_config "$t5" "codex" "agy" 7 4
out=$(run_dry "$t5" "some task")
assert_contains "config: activeCli=codex in argv" "'codex'" "$out"
assert_contains "config: budget threshold shown" "7" "$out"

# ---------------------------------------------------------------------------
# Test 6: packet evidence reads .forgewright/verify files
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 6: evidence from .forgewright/verify ---"
t6=$(mktemp -d "$tmpdir/t6.XXXX")
make_config "$t6" "agy"
mkdir -p "$t6/.forgewright/verify"
echo "unit-test output: 14 passed, 0 failed" > "$t6/.forgewright/verify/run-$(date +%s).txt"
# Evidence: verify the evidence JSON slice content, not just any line in output
# The git diff may legitimately contain removed placeholder text from old code;
# assert that the VERIFY FILE content appears and that the evidence[] array
# does NOT use the old static placeholder as its sole entry.
out=$(run_dry "$t6" "check tests")
assert_contains "evidence: verify file content present" "14 passed" "$out"
# Check that the evidence section shows a real file, not '(none)'
assert_contains "evidence: real file entry not (none)" '"file"' "$out"
assert_not_contains "evidence: no (none) sentinel" '"file": "(none)"' "$out"

# ---------------------------------------------------------------------------
# Test 7: redaction removes secrets from packet
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 7: secret redaction ---"
t7=$(mktemp -d "$tmpdir/t7.XXXX")
make_config "$t7" "agy"
mkdir -p "$t7/.forgewright/verify"
echo "OPENAI_API_KEY=sk-abc123supersecretvalue999xyz" > "$t7/.forgewright/verify/env-check.txt"
out=$(run_dry "$t7" "check env")
assert_not_contains "redaction: raw secret not in output" "sk-abc123supersecretvalue999xyz" "$out"
assert_contains "redaction: REDACTED marker present" "REDACTED" "$out"

# ---------------------------------------------------------------------------
# Test 8: budget refusal when max calls reached
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 8: budget refusal ---"
t8=$(mktemp -d "$tmpdir/t8.XXXX")
make_config "$t8" "agy" "null" 2 1
mkdir -p "$t8/.forgewright/escalations"
# Simulate 2 prior escalation records for this run
RUN_ID="testrun99"
touch "$t8/.forgewright/escalations/${RUN_ID}-111-task-a.json"
touch "$t8/.forgewright/escalations/${RUN_ID}-222-task-b.json"
set +e
budget_out=$(FW_RUN_ID="$RUN_ID" PROJECT_ROOT="$t8" bash "$ESCALATE" --dry-run "another task" 2>&1)
budget_exit=$?
set -e
assert_exit "budget: exits non-zero when limit reached" "2" "$budget_exit"
assert_contains "budget: BUDGET EXCEEDED message shown" "BUDGET EXCEEDED" "$budget_out"

# ---------------------------------------------------------------------------
# Test 9: escalation log written to .forgewright/escalations (path check)
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 9: output path check ---"
t9=$(mktemp -d "$tmpdir/t9.XXXX")
make_config "$t9" "agy"
out=$(run_dry "$t9" "some task")
assert_contains "output path: .forgewright/escalations in dry-run output" ".forgewright/escalations" "$out"
assert_not_contains "output path: no escalation_cost.log in cwd" "escalation_cost.log" "$out"

# ---------------------------------------------------------------------------
# Test 10: unknown CLI rejected with error, not silent fallback
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 10: unknown CLI rejection ---"
t10=$(mktemp -d "$tmpdir/t10.XXXX")
make_config "$t10" "mycustomcli_xyz"
set +e
unknown_out=$(PROJECT_ROOT="$t10" bash "$ESCALATE" --dry-run "task" 2>&1)
unknown_exit=$?
set -e
assert_exit "unknown cli: exits 1" "1" "$unknown_exit"
assert_contains "unknown cli: error message shown" "not a supported CLI" "$unknown_out"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "======================================="
echo "Results: ${PASS} PASS, ${FAIL} FAIL"
echo "======================================="

if (( FAIL > 0 )); then
    exit 1
fi
exit 0
