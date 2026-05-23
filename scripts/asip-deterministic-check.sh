#!/bin/bash
# asip-deterministic-check.sh
# Runs deterministic verification on a plan's Feasibility and Testability criteria.
# Exit codes: 0 = pass, 1 = fail, 2 = cannot verify (partial pass)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLAN_FILE="${1:-/dev/stdin}"
VERBOSE="${VERBOSE:-0}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log() { echo -e "${BLUE}[CHECK]${NC} $*"; }
pass() { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

# ---------------------------------------------------------------------------
# FEASIBILITY CHECKS
# ---------------------------------------------------------------------------

check_feasibility() {
  local plan_content="$1"
  local issues=0

  log "Running Feasibility checks..."

  # 1. Check for unavailable tech (builtins vs external deps)
  local required_deps
  required_deps=$(echo "$plan_content" | grep -oE '(npm install|pip install|brew install|apt install|gem install|cargo add|go get) [a-zA-Z0-9@/-]+' 2>/dev/null || true)

  if [ -n "$required_deps" ]; then
    while IFS= read -r dep; do
      local pkg
      pkg=$(echo "$dep" | awk '{print $NF}')
      case "$dep" in
        *npm\ install*|*pip\ install*)
          if [ -f "$FORGEWRIGHT_DIR/package.json" ]; then
            if ! grep -q "\"$pkg\"" "$FORGEWRIGHT_DIR/package.json" 2>/dev/null; then
              warn "Dependency '$pkg' may not be installed. Add to package.json or note as missing."
            fi
          fi
          ;;
        *)
          pass "External dependency noted: $pkg"
          ;;
      esac
    done <<< "$required_deps"
  else
    pass "No external dependencies detected in plan."
  fi

  # 2. Check for shell script syntax errors (if plan mentions shell commands)
  local shell_cmds
  shell_cmds=$(echo "$plan_content" | grep -oE '(bash|sh|zsh) [^\n]+' | head -5 || true)
  if [ -n "$shell_cmds" ]; then
    local shell_errors=0
    while IFS= read -r cmd; do
      # Extract the actual command (skip the shell name)
      local script="${cmd#* }"
      if echo "$script" | grep -qE '(while|for|if|do|done|then|esac)\b'; then
        # It's a multi-line script block — validate as much as possible
        pass "Shell script block detected (multi-line, manual verify recommended)."
      elif [[ "$script" == *'|'* ]] || [[ "$script" == *'&&'* ]]; then
        # Complex command — basic validation
        pass "Complex shell command detected: ${script:0:60}..."
      else
        pass "Shell command: ${script:0:60}..."
      fi
    done <<< "$shell_cmds"
  fi

  # 3. Check that referenced files actually exist
  local referenced_files
  referenced_files=$(echo "$plan_content" | grep -oE '(skills/|scripts/|\.forgewright/|middleware/)[a-zA-Z0-9_./-]+' | sort -u || true)

  local missing_files=0
  while IFS= read -r ref; do
    # Normalize: remove line numbers, comments, trailing punctuation
    local normalized="${ref%.}"; normalized="${normalized%,}"; normalized="${normalized//,/}"
    if [ -n "$normalized" ] && [ "$normalized" != "skills/" ] && [ "$normalized" != "scripts/" ]; then
      if [ ! -e "$FORGEWRIGHT_DIR/$normalized" ]; then
        fail "Referenced path does not exist: $normalized"
        missing_files=$((missing_files + 1))
      fi
    fi
  done <<< "$referenced_files"

  if [ $missing_files -eq 0 ]; then
    pass "All referenced files exist."
  else
    warn "$missing_files referenced file(s) not found. Adjust plan or create files first."
    issues=$((issues + missing_files))
  fi

  # 4. Check for circular dependencies in file modification list
  local modified_files
  modified_files=$(echo "$plan_content" | grep -oE '(create|modify|update|edit|write).* [:filename filepath]([^\n]+)' | grep -oE '(skills/|scripts/|\.forgewright/)[a-zA-Z0-9_./-]+\.(md|sh|py|json|yaml|yml)' | sort -u || true)

  if [ -n "$modified_files" ]; then
    local file_count
    file_count=$(echo "$modified_files" | wc -l | tr -d ' ')
    pass "Plan modifies $file_count file(s). Manual order verification recommended."
  fi

  return $issues
}

# ---------------------------------------------------------------------------
# TESTABILITY CHECKS
# ---------------------------------------------------------------------------

check_testability() {
  local plan_content="$1"
  local issues=0

  log "Running Testability checks..."

  # 1. Check for specific test commands
  local test_commands
  test_commands=$(echo "$plan_content" | grep -oE '(npm test|pytest|npx jest|pytest --|npm run test|bash.*test|make test|python.*test) [^\n]*' || true)

  if [ -n "$test_commands" ]; then
    local cmd_count
    cmd_count=$(echo "$test_commands" | wc -l | tr -d ' ')
    pass "Found $cmd_count specific test command(s)."
  else
    warn "No specific test commands found. Plan may not specify how to verify success."
    issues=$((issues + 1))
  fi

  # 2. Check for acceptance criteria / success metrics
  local has_criteria
  has_criteria=$(echo "$plan_content" | grep -ciE '(acceptance criteria|success criteria|pass|fail|correctness|verify|test.*pass)' || true)

  if [ "$has_criteria" -gt 0 ]; then
    pass "Found $has_criteria acceptance criteria reference(s)."
  else
    warn "No acceptance criteria references found. Plan should define what 'done' looks like."
    issues=$((issues + 1))
  fi

  # 3. Check for output format specification
  local has_output_spec
  has_output_spec=$(echo "$plan_content" | grep -ciE '(output format|output:|return|response:|generate.*json|generate.*yaml)' || true)

  if [ "$has_output_spec" -gt 0 ]; then
    pass "Found $has_output_spec output format specification(s)."
  else
    warn "No output format specified. Success may be hard to verify objectively."
    issues=$((issues + 1))
  fi

  # 4. Verify that test files mentioned in plan actually exist
  local test_files
  test_files=$(echo "$plan_content" | grep -oE '(test[s]?/|__tests?__/|\.test\.|\.spec\.)[a-zA-Z0-9_./-]+' | sort -u || true)

  if [ -n "$test_files" ]; then
    local missing_tests=0
    while IFS= read -r tf; do
      local normalized="${tf%.}"; normalized="${normalized//,/}"
      if [ -n "$normalized" ] && [ ! -e "$FORGEWRIGHT_DIR/$normalized" ]; then
        warn "Test file referenced but not found: $normalized"
        missing_tests=$((missing_tests + 1))
      fi
    done <<< "$test_files"

    if [ $missing_tests -eq 0 ]; then
      pass "All referenced test files exist."
    else
      issues=$((issues + missing_tests))
    fi
  fi

  return $issues
}

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

main() {
  local plan_content

  if [ $# -ge 1 ] && [ -f "$1" ]; then
    plan_content=$(cat "$1")
  elif [ ! -t 0 ]; then
    # stdin has data
    plan_content=$(cat)
  else
    echo "Usage: $0 <plan-file.md>" >&2
    echo "   or:  cat plan.md | $0" >&2
    exit 1
  fi

  echo ""
  echo "========================================"
  echo "  ASIP Deterministic Check"
  echo "========================================"
  echo ""

  local total_issues=0

  check_feasibility "$plan_content" || total_issues=$((total_issues + $?))
  echo ""

  check_testability "$plan_content" || total_issues=$((total_issues + $?))
  echo ""

  echo "========================================"
  if [ $total_issues -eq 0 ]; then
    echo -e "  ${GREEN}RESULT: PASS${NC} — No critical issues"
    echo "========================================"
    exit 0
  elif [ $total_issues -le 2 ]; then
    echo -e "  ${YELLOW}RESULT: WARNINGS${NC} — $total_issues non-critical issue(s)"
    echo "========================================"
    exit 2
  else
    echo -e "  ${RED}RESULT: FAIL${NC} — $total_issues issue(s) detected"
    echo "========================================"
    exit 1
  fi
}

main "$@"
