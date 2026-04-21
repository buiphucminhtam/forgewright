#!/bin/bash
# Forgewright Skill Test Runner
#
# Purpose: Run skill tests to validate skill outputs
# Usage:
#   ./test-runner.sh                    # Run all tests
#   ./test-runner.sh --all              # Run all tests
#   ./test-runner.sh <skill-name>       # Run tests for specific skill
#   ./test-runner.sh <skill-name> <test-id>  # Run specific test
#   ./test-runner.sh --tag <tag>        # Run tests by tag
#   ./test-runner.sh --list             # List available tests

set -e

# Configuration
TEST_DIR="skills/_test"
SKILLS_DIR="skills"
REPORTS_DIR="skills/_test/reports"
FRAMEWORK_DIR="skills/_test/framework"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# =============================================================================
# Helpers
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Parse arguments
SKILL_FILTER=""
TEST_FILTER=""
TAG_FILTER=""
LIST_MODE=false
RUN_ALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --all|-a)
            RUN_ALL=true
            shift
            ;;
        --list|-l)
            LIST_MODE=true
            shift
            ;;
        --tag|-t)
            TAG_FILTER="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [skill-name] [test-id] [--tag <tag>] [--all] [--list] [--help]"
            echo ""
            echo "Options:"
            echo "  --all, -a       Run all tests"
            echo "  --list, -l      List available tests"
            echo "  --tag, -t       Filter by tag"
            echo "  --help, -h      Show this help"
            echo ""
            echo "Examples:"
            echo "  $0                    # Run all tests"
            echo "  $0 software-engineer # Run software-engineer tests"
            echo "  $0 code-reviewer test-auth   # Run specific test"
            echo "  $0 --tag basic       # Run tests with 'basic' tag"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            if [ -z "$SKILL_FILTER" ]; then
                SKILL_FILTER="$1"
            elif [ -z "$TEST_FILTER" ]; then
                TEST_FILTER="$2"
                break
            fi
            shift
            ;;
    esac
done

# =============================================================================
# Setup
# =============================================================================

mkdir -p "$REPORTS_DIR"

# Create report file
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
REPORT_FILE="$REPORTS_DIR/test-report-$(date +%Y%m%d-%H%M%S).json"

# =============================================================================
# List Tests
# =============================================================================

list_tests() {
    echo -e "${CYAN}Available Skill Tests${NC}"
    echo "========================"
    
    if [ -d "$TEST_DIR/skills" ]; then
        for skill_dir in "$TEST_DIR/skills"/*; do
            if [ -d "$skill_dir" ]; then
                skill_name=$(basename "$skill_dir")
                test_file="$skill_dir/test.yaml"
                
                if [ -f "$test_file" ]; then
                    count=$(grep -c "^  - id:" "$test_file" || echo 0)
                    echo -e "\n${GREEN}$skill_name${NC} ($count tests)"
                    
                    # List individual tests
                    grep "^  - id:" "$test_file" | sed 's/  - id: /  - /'
                fi
            fi
        done
    else
        echo "No tests found in $TEST_DIR/skills/"
    fi
}

if $LIST_MODE; then
    list_tests
    exit 0
fi

# =============================================================================
# Run Test
# =============================================================================

run_test() {
    local skill_name="$1"
    local test_id="$2"
    local test_file="$TEST_DIR/skills/$skill_name/test.yaml"
    
    if [ ! -f "$test_file" ]; then
        log_warn "No test file for skill: $skill_name"
        return 1
    fi
    
    # Parse test from YAML (simplified - using grep)
    local description=$(grep -A 2 "^  - id: $test_id" "$test_file" | grep "description:" | sed 's/.*description: //')
    local timeout=$(grep -A 10 "^  - id: $test_id" "$test_file" | grep "timeout:" | sed 's/.*timeout: //' || echo "60s")
    
    echo ""
    echo -e "${CYAN}Running: ${GREEN}$skill_name${NC} > ${YELLOW}$test_id${NC}"
    if [ -n "$description" ]; then
        echo "Description: $description"
    fi
    
    # Run the test
    local start_time=$(date +%s%3N)
    local result="passed"
    local error=""
    
    # TODO: Actually invoke the skill and validate output
    # This is a placeholder - real implementation would:
    # 1. Read skill's SKILL.md
    # 2. Invoke the skill with test input
    # 3. Validate output against expected
    # 4. Record results
    
    echo -e "${YELLOW}[TODO]${NC} Test execution not yet implemented"
    echo "Test: $test_id"
    echo "Skill: $skill_name"
    echo "Timeout: $timeout"
    
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    # Return result (currently always "skipped" since not implemented)
    echo ""
    log_skip "Test not yet implemented"
    echo "  Duration: ${duration}ms"
    
    return 0
}

# =============================================================================
# Run Tests for Skill
# =============================================================================

run_skill_tests() {
    local skill_name="$1"
    local test_file="$TEST_DIR/skills/$skill_name/test.yaml"
    
    if [ ! -f "$test_file" ]; then
        log_warn "No tests found for skill: $skill_name"
        return 1
    fi
    
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Testing Skill: ${GREEN}$skill_name${NC}"
    echo -e "${CYAN}========================================${NC}"
    
    # Get test IDs
    local test_ids=$(grep "^  - id:" "$test_file" | sed 's/  - id: //')
    
    if [ -z "$test_ids" ]; then
        log_warn "No tests found in $test_file"
        return 1
    fi
    
    local passed=0
    local failed=0
    local skipped=0
    
    for test_id in $test_ids; do
        # Filter by tag if specified
        if [ -n "$TAG_FILTER" ]; then
            local tags=$(grep -A 5 "^  - id: $test_id" "$test_file" | grep "tags:" | sed 's/.*tags: //')
            if ! echo "$tags" | grep -q "$TAG_FILTER"; then
                continue
            fi
        fi
        
        # Filter by test ID if specified
        if [ -n "$TEST_FILTER" ] && [ "$test_id" != "$TEST_FILTER" ]; then
            continue
        fi
        
        if run_test "$skill_name" "$test_id"; then
            ((passed++))
        else
            ((failed++))
        fi
    done
    
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo "Results for $skill_name:"
    echo -e "  ${GREEN}Passed: $passed${NC}"
    echo -e "  ${RED}Failed: $failed${NC}"
    echo -e "  ${YELLOW}Skipped: $skipped${NC}"
    echo -e "${CYAN}========================================${NC}"
}

# =============================================================================
# Run All Tests
# =============================================================================

run_all_tests() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Running All Skill Tests${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo "Started: $(date)"
    echo ""
    
    if [ ! -d "$TEST_DIR/skills" ]; then
        log_warn "No tests found. Run with --list to see available tests."
        return 1
    fi
    
    local total_passed=0
    local total_failed=0
    local total_skipped=0
    
    for skill_dir in "$TEST_DIR/skills"/*; do
        if [ -d "$skill_dir" ]; then
            skill_name=$(basename "$skill_dir")
            
            if [ -n "$SKILL_FILTER" ] && [ "$skill_name" != "$SKILL_FILTER" ]; then
                continue
            fi
            
            run_skill_tests "$skill_name"
        fi
    done
    
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Overall Results:${NC}"
    echo -e "  ${GREEN}Passed: $total_passed${NC}"
    echo -e "  ${RED}Failed: $total_failed${NC}"
    echo -e "  ${YELLOW}Skipped: $total_skipped${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo "Completed: $(date)"
}

# =============================================================================
# Main
# =============================================================================

if [ -n "$SKILL_FILTER" ]; then
    if [ -n "$TEST_FILTER" ]; then
        run_test "$SKILL_FILTER" "$TEST_FILTER"
    else
        run_skill_tests "$SKILL_FILTER"
    fi
elif $RUN_ALL; then
    run_all_tests
else
    echo -e "${CYAN}Forgewright Skill Test Runner${NC}"
    echo ""
    echo "Usage: $0 [options] [skill-name] [test-id]"
    echo ""
    echo "Run '$0 --help' for more information."
    echo ""
    echo -e "Available skills with tests:"
    if [ -d "$TEST_DIR/skills" ]; then
        for skill_dir in "$TEST_DIR/skills"/*; do
            if [ -d "$skill_dir" ] && [ -f "$skill_dir/test.yaml" ]; then
                skill_name=$(basename "$skill_dir")
                count=$(grep -c "^  - id:" "$skill_dir/test.yaml" || echo 0)
                echo -e "  ${GREEN}$skill_name${NC} ($count tests)"
            fi
        done
    else
        echo "  No tests configured yet."
        echo ""
        echo "Run '$0 --list' to see what tests will be available."
    fi
fi
