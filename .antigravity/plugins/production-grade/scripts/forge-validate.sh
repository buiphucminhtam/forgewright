#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# forge-validate.sh — Quality Gate Validation CLI
# Part of Forgewright Production Grade Pipeline
#
# Automates Quality Gate Levels 1-3:
#   Level 1: Build & Syntax (critical)
#   Level 2: Regression Safety (critical for brownfield)
#   Level 3: Code Standards (configurable)
#
# Usage: ./scripts/forge-validate.sh [options]
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Scoring
SCORE_BUILD=0
SCORE_REGRESSION=0
SCORE_STANDARDS=0
TOTAL_SCORE=0
ISSUES=()
WARNINGS=()

# Config
OUTPUT_DIR=".forgewright"
REPORT_FILE=""
QUIET=false
JSON_OUTPUT=false
STRICT=false

log()  { $QUIET || echo -e "${BLUE}[validate]${NC} $*"; }
ok()   { $QUIET || echo -e "  ${GREEN}✓${NC} $*"; }
warn() { WARNINGS+=("$*"); $QUIET || echo -e "  ${YELLOW}⚠${NC} $*"; }
fail() { ISSUES+=("$*"); $QUIET || echo -e "  ${RED}✗${NC} $*"; }
info() { $QUIET || echo -e "  ${DIM}$*${NC}"; }

# ━━━ Level 1: Build & Syntax ━━━━━━━━━━━━━━━━━━━━━━━━━━

level1_build() {
  $QUIET || echo ""
  $QUIET || echo -e "${BOLD}━━━ Level 1: Build & Syntax (25 points) ━━━${NC}"

  local passed=true

  # Detect and run build
  if [ -f "package.json" ]; then
    if command -v npx &>/dev/null; then
      # TypeScript check
      if grep -q '"typescript"' package.json 2>/dev/null; then
        log "Running TypeScript check..."
        if npx tsc --noEmit 2>/dev/null; then
          ok "TypeScript compiles"
        else
          fail "TypeScript compilation errors"
          passed=false
        fi
      fi

      # Build check
      if grep -q '"build"' package.json 2>/dev/null; then
        log "Running build..."
        if npm run build --silent 2>/dev/null; then
          ok "Build succeeds"
        else
          fail "Build failed"
          passed=false
        fi
      else
        info "No build script found, skipping"
      fi
    fi

  elif [ -f "pyproject.toml" ] || [ -f "setup.py" ] || [ -f "requirements.txt" ]; then
    log "Python project detected"
    # Check syntax of .py files changed recently
    local py_errors=0
    for f in $(git diff --name-only HEAD~1 2>/dev/null | grep '\.py$' || true); do
      if [ -f "$f" ]; then
        if ! python3 -m py_compile "$f" 2>/dev/null; then
          fail "Syntax error in $f"
          py_errors=$((py_errors + 1))
        fi
      fi
    done
    if [ $py_errors -eq 0 ]; then
      ok "Python syntax OK"
    else
      passed=false
    fi

  elif [ -f "go.mod" ]; then
    log "Go project detected"
    if go vet ./... 2>/dev/null; then
      ok "Go vet passes"
    else
      fail "Go vet errors"
      passed=false
    fi

  elif [ -f "Cargo.toml" ]; then
    log "Rust project detected"
    if cargo check 2>/dev/null; then
      ok "Cargo check passes"
    else
      fail "Cargo check errors"
      passed=false
    fi

  else
    info "No recognized project type, syntax check skipped"
  fi

  # Lint check (detect common linters)
  if [ -f ".eslintrc.json" ] || [ -f ".eslintrc.js" ] || [ -f "eslint.config.js" ] || [ -f "eslint.config.mjs" ]; then
    log "Running ESLint..."
    local lint_count
    lint_count=$(npx eslint . --format compact 2>/dev/null | grep -c "Error" || echo "0")
    if [ "$lint_count" -eq 0 ]; then
      ok "No lint errors"
    else
      warn "$lint_count lint errors found"
    fi
  fi

  if $passed; then
    SCORE_BUILD=25
    ok "Level 1: PASS (25/25)"
  else
    SCORE_BUILD=0
    fail "Level 1: FAIL (0/25)"
  fi
}

# ━━━ Level 2: Regression Safety ━━━━━━━━━━━━━━━━━━━━━━━

level2_regression() {
  $QUIET || echo ""
  $QUIET || echo -e "${BOLD}━━━ Level 2: Regression Safety (25 points) ━━━${NC}"

  local passed=true
  local is_greenfield=true

  # Check if baseline exists
  if [ -f "$OUTPUT_DIR/project-profile.json" ]; then
    is_greenfield=false
  fi

  if $is_greenfield; then
    info "Greenfield project (no baseline), auto-pass"
    SCORE_REGRESSION=25
    ok "Level 2: PASS (25/25, greenfield)"
    return
  fi

  # Run existing test suite
  if [ -f "package.json" ] && grep -q '"test"' package.json 2>/dev/null; then
    log "Running test suite..."
    if npm test --silent 2>/dev/null; then
      ok "Tests pass"
    else
      fail "Test suite has failures"
      passed=false
    fi
  elif [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then
    log "Running pytest..."
    if python3 -m pytest --tb=no -q 2>/dev/null; then
      ok "Tests pass"
    else
      fail "Test suite has failures"
      passed=false
    fi
  elif [ -f "go.mod" ]; then
    log "Running go test..."
    if go test ./... 2>/dev/null; then
      ok "Tests pass"
    else
      fail "Test suite has failures"
      passed=false
    fi
  else
    info "No test runner detected, skipping regression check"
  fi

  # Scope boundary check
  local changed_files
  changed_files=$(git diff --name-only HEAD~1 2>/dev/null | wc -l | tr -d ' ')
  info "$changed_files files changed since last commit"

  if $passed; then
    SCORE_REGRESSION=25
    ok "Level 2: PASS (25/25)"
  else
    SCORE_REGRESSION=0
    fail "Level 2: FAIL (0/25)"
  fi
}

# ━━━ Level 3: Code Standards ━━━━━━━━━━━━━━━━━━━━━━━━━━

level3_standards() {
  $QUIET || echo ""
  $QUIET || echo -e "${BOLD}━━━ Level 3: Code Standards (30 points) ━━━${NC}"

  local points=30

  # 3.1 Check for stubs/TODOs (10 points)
  local stub_count=0
  for pattern in "TODO" "FIXME" "HACK" "XXX" "Not implemented" "throw new Error" "raise NotImplementedError"; do
    local matches
    matches=$(grep -rn "$pattern" \
      --include="*.ts" --include="*.py" --include="*.go" \
      --include="*.java" --include="*.rs" --include="*.js" --include="*.tsx" --include="*.jsx" \
      --exclude-dir="node_modules" --exclude-dir=".git" \
      --exclude-dir="vendor" --exclude-dir="dist" --exclude-dir="build" \
      --exclude-dir="__pycache__" \
      2>/dev/null | head -20 || true)
    if [ -n "$matches" ]; then
      local count
      count=$(echo "$matches" | wc -l | tr -d ' ')
      stub_count=$((stub_count + count))
    fi
  done

  if [ $stub_count -eq 0 ]; then
    ok "No stubs/TODOs in production code (10/10)"
  else
    warn "$stub_count stubs/TODOs found"
    points=$((points - 10))
    if $STRICT; then
      fail "Stubs found (strict mode)"
    fi
  fi

  # 3.2 Check for hardcoded secrets (10 points)
  local secret_count=0
  for pattern in 'sk-[a-zA-Z0-9]' 'AKIA[A-Z0-9]' 'password\s*=' 'secret\s*=' 'api_key\s*=' 'Bearer [a-zA-Z0-9]'; do
    local matches
    matches=$(grep -rn -E "$pattern" \
      --include="*.ts" --include="*.py" --include="*.go" \
      --include="*.java" --include="*.rs" --include="*.js" --include="*.tsx" --include="*.jsx" \
      --exclude-dir="node_modules" --exclude-dir=".git" \
      --exclude-dir="vendor" --exclude-dir="dist" \
      --exclude="*.test.*" --exclude="*.spec.*" --exclude="*.md" \
      2>/dev/null | grep -v '\.env\.' | grep -v 'example' | head -10 || true)
    if [ -n "$matches" ]; then
      local count
      count=$(echo "$matches" | wc -l | tr -d ' ')
      secret_count=$((secret_count + count))
    fi
  done

  if [ $secret_count -eq 0 ]; then
    ok "No hardcoded secrets detected (10/10)"
  else
    fail "$secret_count potential hardcoded secrets found"
    points=$((points - 10))
  fi

  # 3.3 Import resolution check (5 points)
  # Quick check: look for common import errors
  local unresolved=0
  if [ -f "package.json" ] && command -v npx &>/dev/null; then
    # Check if tsc can resolve imports (already covered in Level 1)
    ok "Import resolution covered by build check (5/5)"
  else
    info "Import resolution: skipped (no tooling detected)"
  fi

  # 3.4 Convention compliance (5 points)
  if [ -f "$OUTPUT_DIR/code-conventions.md" ]; then
    ok "Code conventions file exists (5/5)"
  else
    info "No code-conventions.md, skipping convention check"
  fi

  SCORE_STANDARDS=$points
  if [ $points -ge 25 ]; then
    ok "Level 3: PASS ($points/30)"
  else
    warn "Level 3: WARN ($points/30)"
  fi
}

# ━━━ Report ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

generate_report() {
  TOTAL_SCORE=$((SCORE_BUILD + SCORE_REGRESSION + SCORE_STANDARDS))

  # Grade
  local grade="F"
  if [ $TOTAL_SCORE -ge 90 ]; then grade="A"
  elif [ $TOTAL_SCORE -ge 80 ]; then grade="B"
  elif [ $TOTAL_SCORE -ge 70 ]; then grade="C"
  elif [ $TOTAL_SCORE -ge 60 ]; then grade="D"
  fi

  # Progress bar
  local filled=$((TOTAL_SCORE / 5))
  local empty=$((20 - filled))
  local bar=""
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done

  if ! $QUIET; then
    echo ""
    echo -e "${BOLD}┌─────────────────────────────────────────┐${NC}"
    echo -e "${BOLD}│          Quality Gate Report             │${NC}"
    echo -e "${BOLD}├─────────────────────────────────────────┤${NC}"
    echo -e "│ Build & Syntax:      ${SCORE_BUILD}/25               │"
    echo -e "│ Regression Safety:   ${SCORE_REGRESSION}/25               │"
    echo -e "│ Code Standards:      ${SCORE_STANDARDS}/30               │"
    echo -e "${BOLD}├─────────────────────────────────────────┤${NC}"
    echo -e "│ Total: ${BOLD}${TOTAL_SCORE}/80${NC} (${grade}) ${bar}  │"
    echo -e "${BOLD}└─────────────────────────────────────────┘${NC}"

    if [ ${#ISSUES[@]} -gt 0 ]; then
      echo ""
      echo -e "${RED}${BOLD}Issues (${#ISSUES[@]}):${NC}"
      for issue in "${ISSUES[@]}"; do
        echo -e "  ${RED}✗${NC} $issue"
      done
    fi

    if [ ${#WARNINGS[@]} -gt 0 ]; then
      echo ""
      echo -e "${YELLOW}${BOLD}Warnings (${#WARNINGS[@]}):${NC}"
      for warning in "${WARNINGS[@]}"; do
        echo -e "  ${YELLOW}⚠${NC} $warning"
      done
    fi
  fi

  # Write JSON report
  if $JSON_OUTPUT || [ -n "$REPORT_FILE" ]; then
    local report_path="${REPORT_FILE:-$OUTPUT_DIR/quality-report-$(date +%Y%m%d-%H%M%S).json}"
    mkdir -p "$(dirname "$report_path")"
    cat > "$report_path" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "score": $TOTAL_SCORE,
  "max_score": 80,
  "grade": "$grade",
  "levels": {
    "build": { "score": $SCORE_BUILD, "max": 25 },
    "regression": { "score": $SCORE_REGRESSION, "max": 25 },
    "standards": { "score": $SCORE_STANDARDS, "max": 30 }
  },
  "issues_count": ${#ISSUES[@]},
  "warnings_count": ${#WARNINGS[@]}
}
EOF
    if ! $QUIET; then
      echo ""
      info "Report saved: $report_path"
    fi
  fi

  # Exit code
  if [ $TOTAL_SCORE -lt 60 ]; then
    return 1
  fi
  return 0
}

# ━━━ Usage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

usage() {
  cat <<EOF

  ${BOLD}forge-validate.sh${NC} — Quality Gate Validation CLI
  Part of Forgewright Production Grade Pipeline

  ${BOLD}Usage:${NC} ./scripts/forge-validate.sh [options]

  ${BOLD}Options:${NC}
    --quiet, -q       Suppress output (exit code only)
    --json            Write JSON report to .forgewright/
    --report FILE     Write JSON report to specific file
    --strict          Treat Level 3 warnings as failures
    --help, -h        Show this help

  ${BOLD}Exit Codes:${NC}
    0    Score >= 60 (D or better)
    1    Score < 60 (F, unacceptable quality)

  ${BOLD}Examples:${NC}
    ./scripts/forge-validate.sh               # Full validation with display
    ./scripts/forge-validate.sh --json        # Save JSON report
    ./scripts/forge-validate.sh --quiet       # CI mode (exit code only)
    ./scripts/forge-validate.sh --strict      # Block on any standards issue

EOF
}

# ━━━ Main ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --quiet|-q) QUIET=true; shift ;;
      --json) JSON_OUTPUT=true; shift ;;
      --report) REPORT_FILE="$2"; shift 2 ;;
      --strict) STRICT=true; shift ;;
      --help|-h) usage; exit 0 ;;
      *) echo "Unknown option: $1"; usage; exit 1 ;;
    esac
  done

  if ! $QUIET; then
    echo ""
    echo -e "${BOLD}${CYAN}Forgewright Quality Gate Validation${NC}"
    echo -e "${DIM}Running Level 1-3 automated checks...${NC}"
  fi

  level1_build
  level2_regression
  level3_standards
  generate_report
}

main "$@"
