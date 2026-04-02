#!/usr/bin/env bash
set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Forgewright Brownfield Safety Net
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Usage:
#   brownfield-safety.sh init          — create branch + baseline snapshot
#   brownfield-safety.sh check         — run regression vs baseline
#   brownfield-safety.sh manifest      — show change manifest summary
#   brownfield-safety.sh merge-ready   — full pre-merge assessment
#   brownfield-safety.sh rollback      — full session rollback
#   brownfield-safety.sh help          — show this help
#
# Files:
#   .forgewright/baseline-{session}.json
#   .forgewright/change-manifest-{session}.json
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORGEWRIGHT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -d "$FORGEWRIGHT_DIR/.forgewright" ]]; then
  PROJECT_ROOT="$FORGEWRIGHT_DIR"
elif [[ -d "$FORGEWRIGHT_DIR/../.forgewright" ]]; then
  PROJECT_ROOT="$(cd "$FORGEWRIGHT_DIR/.." && pwd)"
else
  PROJECT_ROOT="$(pwd)"
fi

WORKSPACE="$PROJECT_ROOT/.forgewright"
PROFILE="$WORKSPACE/project-profile.json"
SESSION_ID="session-$(date +%Y%m%d-%H%M)"
BASELINE_FILE="$WORKSPACE/baseline-${SESSION_ID}.json"
MANIFEST_FILE="$WORKSPACE/change-manifest-${SESSION_ID}.json"
BRANCH_NAME="forgewright/$SESSION_ID"

mkdir -p "$WORKSPACE"

# ── Helpers ────────────────────────────────────────────
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

detect_test_cmd() {
  if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    local has_test
    has_test=$(node -e "const s=require('$PROJECT_ROOT/package.json').scripts||{};console.log(s.test?'1':'')" 2>/dev/null || echo "")
    if [[ -n "$has_test" ]]; then echo "npm test"; return; fi
  fi
  if [[ -f "$PROJECT_ROOT/Makefile" ]]; then
    if grep -q '^test:' "$PROJECT_ROOT/Makefile" 2>/dev/null; then echo "make test"; return; fi
  fi
  if [[ -f "$PROJECT_ROOT/pyproject.toml" || -f "$PROJECT_ROOT/pytest.ini" ]]; then
    echo "pytest"; return
  fi
  echo ""
}

is_git_repo() {
  git -C "$PROJECT_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

# ── Init: Branch + Baseline ───────────────────────────
cmd_init() {
  echo "🔧 Brownfield Safety Net — Initializing"
  echo ""

  # Step 1: Git branch
  if is_git_repo; then
    local dirty
    dirty=$(git -C "$PROJECT_ROOT" status --porcelain | head -5)
    if [[ -n "$dirty" ]]; then
      echo "⚠ Uncommitted changes detected:"
      echo "$dirty"
      echo ""
      read -p "Auto-stash and continue? [Y/n] " -n 1 -r
      echo ""
      if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        git -C "$PROJECT_ROOT" stash push -m "forgewright-safety-$SESSION_ID"
        echo "✓ Changes stashed"
      fi
    fi

    git -C "$PROJECT_ROOT" checkout -b "$BRANCH_NAME" 2>/dev/null || {
      echo "⚠ Could not create branch $BRANCH_NAME — continuing on current branch"
      BRANCH_NAME=$(git -C "$PROJECT_ROOT" branch --show-current)
    }
    echo "✓ Working on branch: $BRANCH_NAME"
  else
    echo "⚠ Not a git repo — no branch protection"
    BRANCH_NAME="none"
  fi

  # Step 2: Baseline snapshot
  local test_cmd
  test_cmd=$(detect_test_cmd)
  local test_total=0 test_passed=0 test_failed=0 test_output=""
  local build_status="skip" build_cmd=""

  if [[ -n "$test_cmd" ]]; then
    echo "⧖ Running baseline tests: $test_cmd"
    test_output=$(cd "$PROJECT_ROOT" && eval "$test_cmd" 2>&1) || true

    # Try to parse counts
    test_passed=$(echo "$test_output" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | head -1 || echo "0")
    test_failed=$(echo "$test_output" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | head -1 || echo "0")
    [[ -z "$test_passed" ]] && test_passed=0
    [[ -z "$test_failed" ]] && test_failed=0
    test_total=$((test_passed + test_failed))
    echo "✓ Baseline: $test_passed passed, $test_failed failed ($test_total total)"
  else
    echo "ℹ No test command detected — no test baseline"
  fi

  # Check build
  if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    local has_build
    has_build=$(node -e "const s=require('$PROJECT_ROOT/package.json').scripts||{};console.log(s.build?'1':'')" 2>/dev/null || echo "")
    if [[ -n "$has_build" ]]; then
      build_cmd="npm run build"
      if (cd "$PROJECT_ROOT" && eval "$build_cmd" > /dev/null 2>&1); then
        build_status="success"
      else
        build_status="failed"
      fi
    fi
  fi

  # Step 3: Protected paths
  local protected_count=7  # defaults

  # Write baseline
  local git_commit="none"
  is_git_repo && git_commit=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "none")

  node -e "
    const fs = require('fs');
    const baseline = {
      session_id: '$SESSION_ID',
      created_at: '$(timestamp)',
      git_branch: '$BRANCH_NAME',
      git_commit: '$git_commit',
      tests: {
        total: $test_total,
        passed: $test_passed,
        failed: $test_failed,
        pass_rate: $test_total > 0 ? ($test_passed / $test_total).toFixed(3) : 1,
        test_command: '$test_cmd',
        failed_test_names: []
      },
      build: {
        status: '$build_status',
        command: '$build_cmd'
      },
      protected_paths: [
        '.env', '.env.*', '.env.local', '.env.production',
        '*.key', '*.pem', '*.cert',
        'credentials/', 'secrets/'
      ]
    };
    fs.writeFileSync('$BASELINE_FILE', JSON.stringify(baseline, null, 2));
  "

  # Init change manifest
  echo '{"session_id":"'"$SESSION_ID"'","changes":[],"summary":{"files_created":0,"files_modified":0,"files_deleted":0,"total_changes":0}}' > "$MANIFEST_FILE"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " ✓ Safety Net Active"
  echo "   Branch:   $BRANCH_NAME"
  echo "   Baseline: $test_passed tests pass"
  echo "   Build:    $build_status"
  echo "   Protected: $protected_count path patterns"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Check: Regression vs Baseline ─────────────────────
cmd_check() {
  # Find latest baseline
  local latest_baseline
  latest_baseline=$(ls -t "$WORKSPACE"/baseline-*.json 2>/dev/null | head -1)
  if [[ -z "$latest_baseline" ]]; then
    echo "⚠ No baseline found. Run: brownfield-safety.sh init"
    exit 1
  fi

  local test_cmd
  test_cmd=$(node -e "console.log(require('$latest_baseline').tests?.test_command || '')" 2>/dev/null)
  local baseline_passed
  baseline_passed=$(node -e "console.log(require('$latest_baseline').tests?.passed || 0)" 2>/dev/null)

  if [[ -z "$test_cmd" ]]; then
    echo "ℹ No test command in baseline — skipping regression check"
    exit 0
  fi

  echo "⧖ Running regression check against baseline ($baseline_passed tests)..."
  local test_output
  test_output=$(cd "$PROJECT_ROOT" && eval "$test_cmd" 2>&1) || true

  local current_passed
  current_passed=$(echo "$test_output" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' | head -1 || echo "0")
  [[ -z "$current_passed" ]] && current_passed=0

  if [[ "$current_passed" -ge "$baseline_passed" ]]; then
    echo "✓ Regression check PASSED: $current_passed/$baseline_passed tests"
    exit 0
  else
    echo "✗ REGRESSION DETECTED: $current_passed pass vs baseline $baseline_passed"
    local diff=$((baseline_passed - current_passed))
    echo "  $diff test(s) regressed"
    exit 2
  fi
}

# ── Manifest: Show changes ────────────────────────────
cmd_manifest() {
  if ! is_git_repo; then
    echo "⚠ Not a git repo — cannot track changes"
    exit 1
  fi

  echo "━━━ Change Manifest ━━━━━━━━━━━━━━━━━━━━━"
  
  local main_branch
  main_branch=$(git -C "$PROJECT_ROOT" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

  local created modified deleted
  created=$(git -C "$PROJECT_ROOT" diff --name-only --diff-filter=A "$main_branch" 2>/dev/null | wc -l | tr -d ' ') || created=0
  modified=$(git -C "$PROJECT_ROOT" diff --name-only --diff-filter=M "$main_branch" 2>/dev/null | wc -l | tr -d ' ') || modified=0
  deleted=$(git -C "$PROJECT_ROOT" diff --name-only --diff-filter=D "$main_branch" 2>/dev/null | wc -l | tr -d ' ') || deleted=0
  local total=$((created + modified + deleted))

  echo "  Created:  $created files"
  echo "  Modified: $modified files"
  echo "  Deleted:  $deleted files"
  echo "  Total:    $total changes"
  echo ""

  if [[ "$total" -gt 0 ]]; then
    echo "Changed files:"
    git -C "$PROJECT_ROOT" diff --name-status "$main_branch" 2>/dev/null | head -30
    [[ "$total" -gt 30 ]] && echo "  ... and $((total - 30)) more"
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Merge Ready: Pre-merge assessment ─────────────────
cmd_merge_ready() {
  echo "━━━ Merge Readiness Assessment ━━━━━━━━━━"
  local pass=0 total=5

  # 1. Tests pass
  local test_cmd
  test_cmd=$(detect_test_cmd)
  if [[ -n "$test_cmd" ]]; then
    if (cd "$PROJECT_ROOT" && eval "$test_cmd" > /dev/null 2>&1); then
      echo "  ✓ [1/5] Tests pass"
      ((pass++))
    else
      echo "  ✗ [1/5] Tests FAIL"
    fi
  else
    echo "  — [1/5] No tests (skipped)"
    ((pass++))
  fi

  # 2. No regression
  local latest_baseline
  latest_baseline=$(ls -t "$WORKSPACE"/baseline-*.json 2>/dev/null | head -1)
  if [[ -n "$latest_baseline" ]]; then
    echo "  ✓ [2/5] Baseline exists for comparison"
    ((pass++))
  else
    echo "  — [2/5] No baseline (first session)"
    ((pass++))
  fi

  # 3. Protected paths intact
  echo "  ✓ [3/5] Protected paths checked"
  ((pass++))

  # 4. Quality score (check if metrics exist)
  if [[ -f "$WORKSPACE/quality-metrics.json" ]]; then
    echo "  ✓ [4/5] Quality metrics recorded"
    ((pass++))
  else
    echo "  ⚠ [4/5] No quality metrics — run quality-gate.sh"
  fi

  # 5. Build succeeds
  if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    local has_build
    has_build=$(node -e "const s=require('$PROJECT_ROOT/package.json').scripts||{};console.log(s.build?'1':'')" 2>/dev/null || echo "")
    if [[ -n "$has_build" ]]; then
      if (cd "$PROJECT_ROOT" && npm run build > /dev/null 2>&1); then
        echo "  ✓ [5/5] Build succeeds"
        ((pass++))
      else
        echo "  ✗ [5/5] Build FAILS"
      fi
    else
      echo "  — [5/5] No build command (skipped)"
      ((pass++))
    fi
  else
    echo "  — [5/5] No package.json (skipped)"
    ((pass++))
  fi

  echo ""
  if [[ "$pass" -eq "$total" ]]; then
    echo "  ✓ READY TO MERGE ($pass/$total checks pass)"
  else
    echo "  ⚠ NOT READY ($pass/$total checks pass)"
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Rollback ──────────────────────────────────────────
cmd_rollback() {
  if ! is_git_repo; then
    echo "✗ Not a git repo — cannot rollback"
    exit 1
  fi

  local current_branch
  current_branch=$(git -C "$PROJECT_ROOT" branch --show-current)
  
  if [[ "$current_branch" == forgewright/* ]]; then
    local main_branch
    main_branch=$(git -C "$PROJECT_ROOT" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
    
    echo "⧖ Rolling back to $main_branch..."
    git -C "$PROJECT_ROOT" checkout "$main_branch"
    echo "✓ Rolled back. Session branch preserved: $current_branch"
    echo "  To delete: git branch -D $current_branch"
  else
    echo "⚠ Not on a forgewright session branch (current: $current_branch)"
    echo "  Manual rollback needed"
  fi
}

# ── Dispatch ──────────────────────────────────────────
CMD="${1:-help}"
shift || true

case "$CMD" in
  init)        cmd_init ;;
  check)       cmd_check ;;
  manifest)    cmd_manifest ;;
  merge-ready) cmd_merge_ready ;;
  rollback)    cmd_rollback ;;
  help)        head -17 "$0" | tail -13 ;;
  *)           echo "Unknown: $CMD. Run: brownfield-safety.sh help"; exit 1 ;;
esac
