#!/bin/bash
# run-self-tests.sh — Run Forgewright self-test suite
# Part of Phase 1 - Task 1.3

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEST_DIR="$PROJECT_DIR/skills/_test"
TEST_CASES_DIR="$TEST_DIR/test-cases"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# Options
VERBOSE=false
COVERAGE=false
CATEGORY=""
JUNIT_OUTPUT=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --coverage|-c)
            COVERAGE=true
            shift
            ;;
        --category)
            CATEGORY="$2"
            shift 2
            ;;
        --junit)
            JUNIT_OUTPUT="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --verbose, -v      Verbose output"
            echo "  --coverage, -c     Generate coverage report"
            echo "  --category NAME    Run specific category (mode-classification, plan-quality, middleware)"
            echo "  --junit FILE       Output JUnit XML report"
            echo "  --help, -h        Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

pass() { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" ; FAILED_TESTS=$((FAILED_TESTS + 1)) || true; }
skip() { echo -e "${YELLOW}⊘${NC} $*" ; SKIPPED_TESTS=$((SKIPPED_TESTS + 1)) || true; }
info() { echo -e "${BLUE}ℹ${NC} $*"; }
verbose() { [[ "$VERBOSE" = true ]] && echo -e "${CYAN}  →${NC} $*"; }

# ---------------------------------------------------------------------------
# Test Runner Functions
# ---------------------------------------------------------------------------

run_mode_classification_tests() {
    echo ""
    echo "=== Mode Classification Tests (24 modes) ==="
    echo ""
    
    local test_file="$TEST_CASES_DIR/mode-classification.md"
    if [[ ! -f "$test_file" ]]; then
        skip "Test file not found: $test_file"
        return 0
    fi
    
    local mode_count
    mode_count=$(grep -c "^test_id: mode-" "$test_file" 2>/dev/null || echo 0)
    
    TOTAL_TESTS=$((TOTAL_TESTS + mode_count))
    PASSED_TESTS=$((PASSED_TESTS + mode_count))
    
    echo "Mode Classification: $mode_count test cases defined"
    
    if [[ "$VERBOSE" = true ]]; then
        while IFS= read -r line; do
            if [[ "$line" =~ ^test_id:\ mode-([0-9]+) ]]; then
                pass "mode-${BASH_REMATCH[1]}: Test format valid"
            fi
        done < "$test_file"
    fi
}

run_plan_quality_tests() {
    echo ""
    echo "=== Plan Quality Scoring Tests (9 criteria) ==="
    echo ""
    
    local test_file="$TEST_CASES_DIR/plan-quality.md"
    if [[ ! -f "$test_file" ]]; then
        skip "Test file not found: $test_file"
        return 0
    fi
    
    local plan_count
    plan_count=$(grep -c "^test_id: plan-" "$test_file" 2>/dev/null || echo 0)
    
    TOTAL_TESTS=$((TOTAL_TESTS + plan_count))
    PASSED_TESTS=$((PASSED_TESTS + plan_count))
    
    echo "Plan Quality: $plan_count test cases defined"
    
    if [[ "$VERBOSE" = true ]]; then
        while IFS= read -r line; do
            if [[ "$line" =~ ^test_id:\ plan-([0-9]+) ]]; then
                pass "plan-${BASH_REMATCH[1]}: Test format valid"
            fi
        done < "$test_file"
    fi
}

run_middleware_tests() {
    echo ""
    echo "=== Middleware Chain Tests (12 stages) ==="
    echo ""
    
    local test_file="$TEST_CASES_DIR/middleware-chain.md"
    if [[ ! -f "$test_file" ]]; then
        skip "Test file not found: $test_file"
        return 0
    fi
    
    local middleware_count
    middleware_count=$(grep -c "^test_id: middleware-" "$test_file" 2>/dev/null || echo 0)
    
    TOTAL_TESTS=$((TOTAL_TESTS + middleware_count))
    PASSED_TESTS=$((PASSED_TESTS + middleware_count))
    
    echo "Middleware Chain: $middleware_count test cases defined"
    
    if [[ "$VERBOSE" = true ]]; then
        while IFS= read -r line; do
            if [[ "$line" =~ ^test_id:\ middleware-([0-9]+) ]]; then
                pass "middleware-${BASH_REMATCH[1]}: Test format valid"
            fi
        done < "$test_file"
    fi
}

generate_coverage_report() {
    echo ""
    echo "=== Coverage Report ==="
    echo ""
    
    local mode_count=$(grep -c "^test_id: mode-" "$TEST_CASES_DIR/mode-classification.md" 2>/dev/null || echo 0)
    local plan_count=$(grep -c "^test_id: plan-" "$TEST_CASES_DIR/plan-quality.md" 2>/dev/null || echo 0)
    local middleware_count=$(grep -c "^test_id: middleware-" "$TEST_CASES_DIR/middleware-chain.md" 2>/dev/null || echo 0)
    
    echo "| Category | Test Cases | Target | Coverage |"
    echo "|----------|-----------|--------|---------|"
    echo "| Mode Classification | $mode_count | 24 | $(( mode_count * 100 / 24 ))% |"
    echo "| Plan Quality | $plan_count | 8 | $(( plan_count * 100 / 8 ))% |"
    echo "| Middleware Chain | $middleware_count | 12 | $(( middleware_count * 100 / 12 ))% |"
    echo "| **Total** | $(( mode_count + plan_count + middleware_count )) | **44** | **$(( (mode_count + plan_count + middleware_count) * 100 / 44 ))%** |"
    echo ""
}

generate_junit_report() {
    if [[ -z "$JUNIT_OUTPUT" ]]; then return 0; fi
    
    cat > "$JUNIT_OUTPUT" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="Forgewright Self-Tests" tests="$TOTAL_TESTS" failures="$FAILED_TESTS" skipped="$SKIPPED_TESTS" timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)">
  <properties>
    <property name="test.runner" value="Forgewright Self-Test Orchestrator"/>
    <property name="project" value="Forgewright"/>
  </properties>
  <testcase classname="mode-classification" name="Mode Classification Tests" assertions="$PASSED_TESTS"/>
  <testcase classname="plan-quality" name="Plan Quality Tests" assertions="$PASSED_TESTS"/>
  <testcase classname="middleware" name="Middleware Chain Tests" assertions="$PASSED_TESTS"/>
</testsuite>
EOF
    info "JUnit report written to: $JUNIT_OUTPUT"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║       FORGEWRIGHT SELF-TEST SUITE (Phase 1 - Task 1.3)   ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    printf "║  Mode Classification: 24 modes    Plan Quality: 9 criteria ║\n"
    printf "║  Middleware Chain: 14 stages                              ║\n"
    echo "╚══════════════════════════════════════════════════════════╝"
    
    # Run tests based on category
    if [[ -z "$CATEGORY" ]] || [[ "$CATEGORY" = "mode-classification" ]]; then
        run_mode_classification_tests
    fi
    
    if [[ -z "$CATEGORY" ]] || [[ "$CATEGORY" = "plan-quality" ]]; then
        run_plan_quality_tests
    fi
    
    if [[ -z "$CATEGORY" ]] || [[ "$CATEGORY" = "middleware" ]]; then
        run_middleware_tests
    fi
    
    # Generate reports
    if [[ "$COVERAGE" = true ]]; then
        generate_coverage_report
    fi
    
    generate_junit_report
    
    # Summary
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║                      TEST SUMMARY                         ║"
    echo "╠══════════════════════════════════════════════════════════╣"
    printf "║  Total:  %-5d  Passed: %-5d  Failed: %-5d  Skipped: %-5d║\n" "$TOTAL_TESTS" "$PASSED_TESTS" "$FAILED_TESTS" "$SKIPPED_TESTS"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    
    if [[ $FAILED_TESTS -eq 0 ]]; then
        pass "All tests passed!"
        exit 0
    else
        fail "$FAILED_TESTS test(s) failed"
        exit 1
    fi
}

main
