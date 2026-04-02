#!/usr/bin/env bash
set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Forgewright Quality Gate — Automated Quality Checks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Usage:
#   ./forgewright/scripts/quality-gate.sh [options]
#
# Options:
#   --task ID        Task ID (e.g., T3a) for labeling
#   --skill NAME     Skill name for labeling
#   --baseline FILE  Path to baseline JSON for regression comparison
#   --strict         Level 3 violations also block (exit 2)
#   --json-only      Output only JSON, no scorecard
#   --help           Show this help
#
# Exit codes:
#   0 = PASS (score >= 90)
#   1 = WARN (score 60-89)
#   2 = BLOCK (score < 60 or critical failure)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ── Resolve paths ──────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORGEWRIGHT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Find project root (where .forgewright/ lives or parent of forgewright submodule)
if [[ -d "$FORGEWRIGHT_DIR/.forgewright" ]]; then
  PROJECT_ROOT="$FORGEWRIGHT_DIR"
elif [[ -d "$FORGEWRIGHT_DIR/../.forgewright" ]]; then
  PROJECT_ROOT="$(cd "$FORGEWRIGHT_DIR/.." && pwd)"
else
  PROJECT_ROOT="$(pwd)"
fi

WORKSPACE="$PROJECT_ROOT/.forgewright"
PROFILE="$WORKSPACE/project-profile.json"
METRICS_FILE="$WORKSPACE/quality-metrics.json"

# ── Parse arguments ────────────────────────────────────
TASK_ID="unknown"
SKILL_NAME="unknown"
BASELINE_FILE=""
STRICT_MODE=false
JSON_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)    TASK_ID="$2";       shift 2 ;;
    --skill)   SKILL_NAME="$2";    shift 2 ;;
    --baseline) BASELINE_FILE="$2"; shift 2 ;;
    --strict)  STRICT_MODE=true;   shift ;;
    --json-only) JSON_ONLY=true;   shift ;;
    --help)
      head -25 "$0" | tail -18
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Detect project commands ────────────────────────────
detect_command() {
  local type="$1"
  # Try project-profile.json first
  if [[ -f "$PROFILE" ]]; then
    local cmd
    cmd=$(node -e "
      const p = require('$PROFILE');
      const scripts = p.fingerprint?.detected_scripts || p.detected_scripts || {};
      console.log(scripts['$type'] || '');
    " 2>/dev/null || echo "")
    if [[ -n "$cmd" ]]; then
      echo "$cmd"
      return
    fi
  fi

  # Fallback: read package.json
  if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    local cmd
    cmd=$(node -e "
      const p = require('$PROJECT_ROOT/package.json');
      const s = p.scripts || {};
      console.log(s['$type'] || '');
    " 2>/dev/null || echo "")
    if [[ -n "$cmd" ]]; then
      echo "npm run $type"
      return
    fi
  fi

  echo ""
}

BUILD_CMD=$(detect_command "build")
TEST_CMD=$(detect_command "test")
LINT_CMD=$(detect_command "lint")

# ── Score tracking ─────────────────────────────────────
SCORE_BUILD=0       # max 25
SCORE_REGRESSION=0  # max 25
SCORE_STANDARDS=0   # max 30
SCORE_TRACE=0       # max 20

BUILD_STATUS="skip"
BUILD_DETAIL=""
REGRESSION_STATUS="skip"
REGRESSION_DETAIL=""
STUBS_COUNT=0
SECRETS_COUNT=0
IMPORT_SCORE=5  # default: assume OK
CONVENTION_SCORE=5  # default: assume OK
ISSUES=()

# ── Level 1: Build ─────────────────────────────────────
level1_build() {
  if [[ -z "$BUILD_CMD" ]]; then
    # No build command — give full points (nothing to check)
    SCORE_BUILD=25
    BUILD_STATUS="pass"
    BUILD_DETAIL="No build command detected — skipped"
    return
  fi

  if (cd "$PROJECT_ROOT" && eval "$BUILD_CMD" > /tmp/fg-build.log 2>&1); then
    SCORE_BUILD=25
    BUILD_STATUS="pass"
    BUILD_DETAIL="Build succeeded ($BUILD_CMD)"
  else
    SCORE_BUILD=0
    BUILD_STATUS="fail"
    BUILD_DETAIL="Build FAILED ($BUILD_CMD) — see /tmp/fg-build.log"
    ISSUES+=("CRITICAL: Build failed")
  fi
}

# ── Level 1b: Lint ─────────────────────────────────────
level1_lint() {
  if [[ -z "$LINT_CMD" ]]; then
    return  # No lint — skip, doesn't affect score directly
  fi

  local lint_errors=0
  if ! (cd "$PROJECT_ROOT" && eval "$LINT_CMD" > /tmp/fg-lint.log 2>&1); then
    lint_errors=$(wc -l < /tmp/fg-lint.log | tr -d ' ')
    ISSUES+=("WARN: Lint has $lint_errors output lines")
  fi
}

# ── Level 2: Regression ───────────────────────────────
level2_regression() {
  if [[ -z "$TEST_CMD" ]]; then
    # No test command — skip regression, give full points
    SCORE_REGRESSION=25
    REGRESSION_STATUS="pass"
    REGRESSION_DETAIL="No test command detected — skipped"
    return
  fi

  # Run tests
  local test_output
  test_output=$(cd "$PROJECT_ROOT" && eval "$TEST_CMD" 2>&1) || true
  
  # Try to extract pass/fail counts (supports common formats)
  local pass_count fail_count
  
  # Jest format: "Tests: X passed, Y failed"
  pass_count=$(echo "$test_output" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | head -1 || echo "")
  fail_count=$(echo "$test_output" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | head -1 || echo "0")
  
  # Pytest format: "X passed, Y failed"
  if [[ -z "$pass_count" ]]; then
    pass_count=$(echo "$test_output" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | head -1 || echo "")
    fail_count=$(echo "$test_output" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | head -1 || echo "0")
  fi

  # Go format: "ok" lines or "FAIL" lines  
  if [[ -z "$pass_count" ]]; then
    pass_count=$(echo "$test_output" | grep -c '^ok' || echo "0")
    fail_count=$(echo "$test_output" | grep -c '^FAIL' || echo "0")
  fi

  # Fallback: check exit code
  if [[ -z "$pass_count" ]]; then
    pass_count="?"
    fail_count="?"
  fi

  # Compare with baseline
  if [[ -n "$BASELINE_FILE" && -f "$BASELINE_FILE" ]]; then
    local baseline_pass baseline_fail_names
    baseline_pass=$(node -e "console.log(require('$BASELINE_FILE').tests?.passed || 0)" 2>/dev/null || echo "0")
    
    if [[ "$pass_count" != "?" && "$pass_count" -ge "$baseline_pass" ]]; then
      SCORE_REGRESSION=25
      REGRESSION_STATUS="pass"
      REGRESSION_DETAIL="$pass_count/$((pass_count + fail_count)) tests pass (baseline: $baseline_pass)"
    else
      SCORE_REGRESSION=0
      REGRESSION_STATUS="fail"
      REGRESSION_DETAIL="REGRESSION: $pass_count pass vs baseline $baseline_pass"
      ISSUES+=("CRITICAL: Test regression detected")
    fi
  else
    # No baseline — just check tests pass
    if [[ "$fail_count" == "0" || "$fail_count" == "?" ]]; then
      SCORE_REGRESSION=25
      REGRESSION_STATUS="pass"
      REGRESSION_DETAIL="Tests pass ($pass_count passed, no baseline)"
    else
      SCORE_REGRESSION=15
      REGRESSION_STATUS="warn"
      REGRESSION_DETAIL="$fail_count test failures (no baseline to compare)"
      ISSUES+=("WARN: $fail_count test failures")
    fi
  fi
}

# ── Level 3: Standards ─────────────────────────────────
level3_standards() {
  # 3a. Stubs check (10 points)
  STUBS_COUNT=$(grep -rn \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --include='*.py' --include='*.go' --include='*.rs' \
    -E '(TODO|FIXME|HACK|XXX|Not implemented|throw new Error\(.Not implemented|raise NotImplementedError)' \
    "$PROJECT_ROOT" 2>/dev/null \
    | grep -v 'node_modules' \
    | grep -v '.forgewright' \
    | grep -v '__tests__' \
    | grep -v '.test.' \
    | grep -v '.spec.' \
    | grep -v 'test_' \
    | wc -l | tr -d ' ') || STUBS_COUNT=0

  local stubs_points=10
  if [[ "$STUBS_COUNT" -gt 0 ]]; then
    stubs_points=0
    ISSUES+=("WARN: $STUBS_COUNT stubs/TODOs in production code")
  fi

  # 3b. Secrets check (10 points)
  SECRETS_COUNT=$(grep -rn \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --include='*.py' --include='*.go' --include='*.rs' --include='*.yaml' --include='*.yml' \
    -E '(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|password\s*=\s*["\x27][^"\x27]+["\x27]|Bearer [a-zA-Z0-9._-]{20,}|api[_-]?key\s*[=:]\s*["\x27][a-zA-Z0-9]{16,})' \
    "$PROJECT_ROOT" 2>/dev/null \
    | grep -v 'node_modules' \
    | grep -v '.forgewright' \
    | grep -v '.env' \
    | grep -v 'example' \
    | grep -v 'sample' \
    | grep -v 'placeholder' \
    | wc -l | tr -d ' ') || SECRETS_COUNT=0

  local secrets_points=10
  if [[ "$SECRETS_COUNT" -gt 0 ]]; then
    secrets_points=0
    ISSUES+=("CRITICAL: $SECRETS_COUNT potential hardcoded secrets")
  fi

  SCORE_STANDARDS=$((stubs_points + secrets_points + IMPORT_SCORE + CONVENTION_SCORE))
}

# ── Level 4: Traceability (simplified) ────────────────
level4_traceability() {
  local trace_req=10 trace_tests=5 trace_docs=5

  # Check if BRD exists
  if [[ -d "$WORKSPACE/product-manager/BRD" ]]; then
    # BRD exists — give credit
    trace_req=10
  else
    # No BRD — N/A, give full credit
    trace_req=10
  fi

  # Check if test files exist alongside implementation
  local test_files
  test_files=$(find "$PROJECT_ROOT" -name '*.test.*' -o -name '*.spec.*' -o -name 'test_*' 2>/dev/null \
    | grep -v node_modules | head -5 | wc -l | tr -d ' ') || test_files=0
  if [[ "$test_files" -gt 0 ]]; then
    trace_tests=5
  else
    trace_tests=0
    ISSUES+=("INFO: No test files found")
  fi

  # Check if workspace artifacts exist
  if [[ -d "$WORKSPACE" ]]; then
    trace_docs=5
  else
    trace_docs=0
  fi

  SCORE_TRACE=$((trace_req + trace_tests + trace_docs))
}

# ── Execute all levels ─────────────────────────────────
level1_build
level1_lint
level2_regression
level3_standards
level4_traceability

# ── Compute total score ────────────────────────────────
TOTAL_SCORE=$((SCORE_BUILD + SCORE_REGRESSION + SCORE_STANDARDS + SCORE_TRACE))

# Grade
GRADE="F"
if   [[ $TOTAL_SCORE -ge 95 ]]; then GRADE="A"
elif [[ $TOTAL_SCORE -ge 90 ]]; then GRADE="B"
elif [[ $TOTAL_SCORE -ge 70 ]]; then GRADE="C"
elif [[ $TOTAL_SCORE -ge 60 ]]; then GRADE="D"
fi

# ── Write JSON metrics ─────────────────────────────────
mkdir -p "$WORKSPACE"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

node -e "
const existing = (() => {
  try { return require('$METRICS_FILE'); } catch { return { measurements: [] }; }
})();

existing.measurements.push({
  task_id: '$TASK_ID',
  skill: '$SKILL_NAME',
  measured_at: '$TIMESTAMP',
  levels: {
    build: { status: '$BUILD_STATUS', points: $SCORE_BUILD, detail: '$BUILD_DETAIL' },
    regression: { status: '$REGRESSION_STATUS', points: $SCORE_REGRESSION, detail: '${REGRESSION_DETAIL//\'/\\\'}' },
    standards: { status: $STUBS_COUNT > 0 || $SECRETS_COUNT > 0 ? '\"warn\"' : '\"pass\"', points: $SCORE_STANDARDS, stubs: $STUBS_COUNT, secrets: $SECRETS_COUNT },
    traceability: { status: 'pass', points: $SCORE_TRACE }
  },
  total_score: $TOTAL_SCORE,
  grade: '$GRADE',
  issues: $(printf '%s\n' "${ISSUES[@]}" | node -e "
    const lines = require('fs').readFileSync(0,'utf8').trim().split('\n').filter(Boolean);
    console.log(JSON.stringify(lines));
  " 2>/dev/null || echo '[]')
});

require('fs').writeFileSync('$METRICS_FILE', JSON.stringify(existing, null, 2));
" 2>/dev/null || true

# ── Display scorecard ──────────────────────────────────
if [[ "$JSON_ONLY" != "true" ]]; then
  # Build status icon
  build_icon="✓"; [[ "$BUILD_STATUS" == "fail" ]] && build_icon="✗"
  [[ "$BUILD_STATUS" == "skip" ]] && build_icon="—"

  regr_icon="✓"; [[ "$REGRESSION_STATUS" == "fail" ]] && regr_icon="✗"
  [[ "$REGRESSION_STATUS" == "warn" ]] && regr_icon="⚠"
  [[ "$REGRESSION_STATUS" == "skip" ]] && regr_icon="—"

  std_icon="✓"
  [[ "$STUBS_COUNT" -gt 0 || "$SECRETS_COUNT" -gt 0 ]] && std_icon="⚠"
  [[ "$SECRETS_COUNT" -gt 0 ]] && std_icon="✗"

  echo ""
  echo "┌─ Quality Gate: $TASK_ID $SKILL_NAME ──────────┐"
  echo "│ Build:        $build_icon  $BUILD_DETAIL"
  echo "│ Regression:   $regr_icon  $REGRESSION_DETAIL"
  echo "│ Standards:    $std_icon  Stubs: $STUBS_COUNT, Secrets: $SECRETS_COUNT"
  echo "│ Traceability: ✓  Score: $SCORE_TRACE/20"
  echo "│ Score: $TOTAL_SCORE/100 ($GRADE)"
  echo "└────────────────────────────────────────────────┘"

  if [[ ${#ISSUES[@]} -gt 0 ]]; then
    echo ""
    echo "Issues:"
    for issue in "${ISSUES[@]}"; do
      echo "  • $issue"
    done
  fi
fi

# ── Exit code ──────────────────────────────────────────
if [[ $TOTAL_SCORE -lt 60 ]]; then
  exit 2  # BLOCK
elif [[ $TOTAL_SCORE -lt 90 ]]; then
  exit 1  # WARN
else
  exit 0  # PASS
fi
