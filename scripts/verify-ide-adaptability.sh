#!/bin/bash
# Verify IDE Adaptability Fallback Implementation
# STRICT MODE: Fails loudly on missing python3/mem0/GraphRAG prerequisites
# CI-FRIENDLY: Structured output, exit codes, and verbose mode support

# ─────────────────────────────────────────────────────────────────────────────
# STRICT MODE ENFORCEMENT
# ─────────────────────────────────────────────────────────────────────────────
# Fail fast on unset variables, pipe failures, and command errors
set -euo pipefail

# CI-friendly: Support VERBOSE=1 for detailed output
VERBOSE="${VERBOSE:-0}"
CI_MODE="${CI_MODE:-0}"

# ─────────────────────────────────────────────────────────────────────────────
# OUTPUT HELPERS (CI-friendly, no emojis by default, optional in verbose)
# ─────────────────────────────────────────────────────────────────────────────
pass() { [[ "$VERBOSE" == "1" ]] && echo "[PASS] $1" || echo "[PASS] $1"; }
fail() { echo "[FAIL] $1" >&2; }
warn() { echo "[WARN] $1"; }
info() { [[ "$VERBOSE" == "1" ]] && echo "[INFO] $1" || true; }

# ─────────────────────────────────────────────────────────────────────────────
# COUNTERS (bash-safe increment)
# ─────────────────────────────────────────────────────────────────────────────
PASS=0
FAIL=0
WARN=0
SKIP=0

echo "=== IDE Adaptability Verification (STRICT MODE) ==="
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 1: Python3 Required (FATAL - no fallback)
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 1] Verifying Python3 availability..."
if ! command -v python3 &> /dev/null; then
    fail "FATAL: python3 not found in PATH"
    fail "Cannot proceed with strict verification."
    exit 1
fi
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "  ✓ Python3 found: v$PYTHON_VERSION"
PASS=$((PASS + 1))

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 2: Verify memory-middleware.py exists and is valid Python
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 2] Verifying memory-middleware.py..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORY_MIDDLEWARE="$SCRIPT_DIR/memory-middleware.py"

if [ ! -f "$MEMORY_MIDDLEWARE" ]; then
    fail "FATAL: memory-middleware.py not found at $MEMORY_MIDDLEWARE"
    exit 1
fi

if ! python3 -m py_compile "$MEMORY_MIDDLEWARE" 2>/dev/null; then
    fail "FATAL: memory-middleware.py has syntax errors"
    python3 -m py_compile "$MEMORY_MIDDLEWARE" 2>&1 || true
    exit 1
fi
echo "  ✓ memory-middleware.py exists and is valid Python"
PASS=$((PASS + 1))

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 3: Verify mem0-v2.py exists (required for memory operations)
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 3] Verifying mem0-v2.py..."
MEM0_SCRIPT="$SCRIPT_DIR/mem0-v2.py"
if [ ! -f "$MEM0_SCRIPT" ]; then
    fail "FATAL: mem0-v2.py not found at $MEM0_SCRIPT"
    fail "mem0-v2.py is REQUIRED for strict mode memory operations."
    exit 1
fi
if ! python3 -m py_compile "$MEM0_SCRIPT" 2>/dev/null; then
    fail "FATAL: mem0-v2.py has syntax errors"
    exit 1
fi
echo "  ✓ mem0-v2.py exists and is valid Python"
PASS=$((PASS + 1))

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 4: Test mem0-v2.py availability (GraphRAG/mem0 integration)
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 4] Testing mem0-v2.py integration..."
MEM0_AVAILABLE=false
if python3 "$MEM0_SCRIPT" --version &> /dev/null || \
   python3 "$MEM0_SCRIPT" list --category session --limit 1 &> /dev/null; then
    echo "  ✓ mem0-v2.py is functional"
    MEM0_AVAILABLE=true
    PASS=$((PASS + 1))
else
    fail "STRICT MODE: mem0-v2.py is not functional"
    fail "GraphRAG/mem0 integration required for strict verification."
    # In strict mode, mem0 unavailability is a failure
    FAIL=$((FAIL + 1))
fi

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 5: Verify token threshold functions in memory-middleware.py
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 5] Verifying token threshold implementation..."
if python3 -c "
import sys
sys.path.insert(0, '$SCRIPT_DIR')
import importlib.util
spec = importlib.util.spec_from_file_location('memory_middleware', '$MEMORY_MIDDLEWARE')
module = importlib.util.module_from_spec(spec)
# Don't actually load to avoid side effects, just check functions exist
content = open('$MEMORY_MIDDLEWARE').read()
required = ['check_token_threshold', 'generate_handover', 'load_handover']
for func in required:
    if func not in content:
        print(f'Missing function: {func}', file=sys.stderr)
        sys.exit(1)
print('All required functions found')
" 2>&1; then
    echo "  ✓ Token threshold functions present"
    PASS=$((PASS + 1))
else
    fail "FATAL: Required functions missing from memory-middleware.py"
    exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 6: Verify HANDOVER loading in memory-loader
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 6] Verifying HANDOVER loading in 00-memory-loader.md..."
MEMORY_LOADER="skills/production-grade/middleware/00-memory-loader.md"
if [ ! -f "$MEMORY_LOADER" ]; then
    fail "FATAL: $MEMORY_LOADER not found"
    exit 1
fi

if grep -q "HANDOVER" "$MEMORY_LOADER"; then
    echo "  ✓ HANDOVER loading present in memory-loader"
    PASS=$((PASS + 1))
else
    fail "FATAL: HANDOVER loading missing from memory-loader"
    exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 7: Verify session-lifecycle.md has handover protocol
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 7] Verifying handover protocol in session-lifecycle.md..."
SESSION_LIFECYCLE="skills/_shared/protocols/session-lifecycle.md"
if [ ! -f "$SESSION_LIFECYCLE" ]; then
    fail "FATAL: $SESSION_LIFECYCLE not found"
    exit 1
fi

if grep -q "Handover" "$SESSION_LIFECYCLE"; then
    echo "  ✓ Handover protocol documented in session-lifecycle.md"
    PASS=$((PASS + 1))
else
    fail "FATAL: Handover protocol missing from session-lifecycle.md"
    exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 8: Test plan/next_steps recovery (requires mem0)
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 8] Testing plan/next_steps recovery capability..."

PLAN_RECOVERY_OK=false
if [ "$MEM0_AVAILABLE" = true ]; then
    # Test that handover can generate with goals and next_steps
    TEST_GOALS="Test goal: verify ide adaptability"
    TEST_NEXT_STEPS="Test step: run verification script"

    if python3 -c "
import sys
import os
sys.path.insert(0, '$SCRIPT_DIR')

# Import the module directly
import importlib.util
spec = importlib.util.spec_from_file_location('memory_middleware', '$MEMORY_MIDDLEWARE')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

generate_handover = module.generate_handover
load_handover = module.load_handover

# Change to project root for file operations
os.chdir('$SCRIPT_DIR/..')

# Generate a test handover
path = generate_handover(goals='$TEST_GOALS', next_steps='$TEST_NEXT_STEPS')

# Load it back
handover = load_handover()
if handover and '$TEST_GOALS' in handover.get('raw', ''):
    print('Plan recovery: PASS')
    sys.exit(0)
else:
    print('Plan recovery: FAIL')
    sys.exit(1)
" 2>&1; then
        echo "  ✓ Plan/next_steps recovery functional"
        PLAN_RECOVERY_OK=true
        PASS=$((PASS + 1))
    else
        fail "Plan/next_steps recovery failed"
        FAIL=$((FAIL + 1))
    fi
else
    warn "SKIPPED: mem0 not available (strict mode requires mem0)"
    warn "Plan recovery requires mem0 integration."
    SKIP=$((SKIP + 1))
fi

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 9: Test technical details recovery (requires mem0)
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 9] Testing technical details recovery capability..."

TECH_DETAILS_OK=false
if [ "$MEM0_AVAILABLE" = true ]; then
    # Verify that session checkpoint data is preserved
    if python3 -c "
import sys
import os
sys.path.insert(0, '$SCRIPT_DIR')

# Import the module directly
import importlib.util
spec = importlib.util.spec_from_file_location('memory_middleware', '$MEMORY_MIDDLEWARE')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

load_session = module.load_session
do_checkpoint = module.do_checkpoint

os.chdir('$SCRIPT_DIR/..')

# Create a test checkpoint
session = load_session()
checkpoint_id = do_checkpoint('verification_test')

# Verify checkpoint was recorded
session2 = load_session()
found = any(cp.get('id') == checkpoint_id for cp in session2.get('checkpoints', []))

if found:
    print('Technical details recovery: PASS')
    sys.exit(0)
else:
    print('Technical details recovery: FAIL')
    sys.exit(1)
" 2>&1; then
        echo "  ✓ Technical details recovery functional"
        TECH_DETAILS_OK=true
        PASS=$((PASS + 1))
    else
        fail "Technical details recovery failed"
        FAIL=$((FAIL + 1))
    fi
else
    warn "SKIPPED: mem0 not available (strict mode requires mem0)"
    warn "Technical details recovery requires mem0 integration."
    SKIP=$((SKIP + 1))
fi

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 10: Verify planning directory structure (optional, warn if missing)
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 10] Verifying planning documentation..."
PLANNING_DIR="antigravity/planning/ide-adaptability"
REQUIRED_DOCS=("README.md" "PLAN.md" "SCOPE.md" "ARCHITECTURE.md" "TASKS.md")

PLANNING_DOCS_EXIST=0
for doc in "${REQUIRED_DOCS[@]}"; do
    if [ -f "$PLANNING_DIR/$doc" ]; then
        info "  ✓ $doc exists"
        PASS=$((PASS + 1))
        PLANNING_DOCS_EXIST=$((PLANNING_DOCS_EXIST + 1))
    else
        info "  - $doc not found (optional)"
        SKIP=$((SKIP + 1))
    fi
done

if [ "$PLANNING_DOCS_EXIST" -eq 0 ]; then
    warn "No planning documentation found at $PLANNING_DIR"
    warn "This is optional but recommended for IDE adaptability implementation."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STRICT CHECK 11: Verify strict mode documentation (if docs exist)
# ─────────────────────────────────────────────────────────────────────────────
echo "[CHECK 11] Verifying strict mode documentation..."

if [ -f "$PLANNING_DIR/PLAN.md" ]; then
    if grep -qi "strict" "$PLANNING_DIR/PLAN.md" && \
       grep -qi "acceptance\|criteria\|fail.*loudly\|prerequisite" "$PLANNING_DIR/PLAN.md"; then
        echo "  ✓ PLAN.md has strict mode requirements"
        PASS=$((PASS + 1))
    else
        warn "PLAN.md missing strict mode documentation"
        WARN=$((WARN + 1))
    fi
else
    info "PLAN.md not found (optional)"
    SKIP=$((SKIP + 1))
fi

if [ -f "$PLANNING_DIR/SCOPE.md" ]; then
    if grep -qi "strict\|prerequisite\|fail.*loudly" "$PLANNING_DIR/SCOPE.md"; then
        echo "  ✓ SCOPE.md has strict mode requirements"
        PASS=$((PASS + 1))
    else
        warn "SCOPE.md missing strict mode documentation"
        WARN=$((WARN + 1))
    fi
else
    info "SCOPE.md not found (optional)"
    SKIP=$((SKIP + 1))
fi

# ─────────────────────────────────────────────────────────────────────────────
# RESULTS (CI-friendly structured output)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "=== Verification Results ==="
echo ""
echo "Summary:"
echo "  PASSED:  $PASS"
echo "  FAILED:  $FAIL"
echo "  WARNINGS: $WARN"
echo "  SKIPPED: $SKIP"
echo ""

# CI-friendly: Output structured results
if [ "$CI_MODE" == "1" ]; then
    echo "CI_RESULTS=PASS=$PASS FAIL=$FAIL WARN=$WARN SKIP=$SKIP"
fi

# Strict mode exit criteria: Only critical checks (1-7) must pass
# Critical checks: python3, memory-middleware.py, mem0-v2.py, mem0 functional,
#                  token threshold functions, HANDOVER loading, handover protocol
CRITICAL_FAILURES=0
# Checks 1-7 are critical; if any failed, that's a critical failure
# Check 4 (mem0 functional) already sets FAIL if unavailable in strict mode
# So we check if FAIL > 0 for critical issues

if [ $FAIL -gt 0 ]; then
    echo "STATUS=FAILED"
    echo ""
    echo "VERIFICATION FAILED"
    echo ""
    echo "Critical checks failed. Strict mode requires:"
    echo "  1. python3 must be installed"
    echo "  2. memory-middleware.py must exist and be valid"
    echo "  3. mem0-v2.py must exist and be functional"
    echo "  4. GraphRAG/mem0 integration must be available"
    echo "  5. Required functions must be present in memory-middleware.py"
    echo "  6. HANDOVER loading must be in memory-loader"
    echo "  7. Handover protocol must be in session-lifecycle.md"
    echo ""
    echo "Recommendations:"
    echo "  - Install python3 if missing"
    echo "  - Verify mem0-v2.py is correctly installed and configured"
    echo "  - Ensure GraphRAG/mem0 is properly set up"
    [[ "$CI_MODE" == "1" ]] && echo "exit_code=1"
    exit 1
fi

if [ $WARN -gt 0 ]; then
    echo "STATUS=WARNING"
    [[ "$CI_MODE" == "1" ]] && echo "exit_code=0"
    echo ""
    echo "VERIFICATION PASSED WITH WARNINGS"
    echo ""
    echo "Non-critical checks had warnings."
    echo "Strict mode requirements are met, but some recommendations were not followed."
    exit 0
fi

echo "STATUS=PASSED"
[[ "$CI_MODE" == "1" ]] && echo "exit_code=0"
echo ""
echo "VERIFICATION PASSED (STRICT MODE)"
echo "All critical checks passed. IDE adaptability implementation verified."
exit 0
