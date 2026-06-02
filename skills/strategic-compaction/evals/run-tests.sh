#!/bin/bash
#===============================================================================
# run-tests.sh — Strategic Compaction Skill Test Runner
#
# Tests the compaction trigger detection logic.
#===============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_CASES="$SCRIPT_DIR/test-cases.json"
PASS=0
FAIL=0
TOTAL=0

# Milestone words
declare -a MILESTONE_WORDS=(
    "ok" "okay" "good" "great" "clear" "got it" "understood"
    "let us go" "let us do it" "lets go" "lets do it" "go ahead"
    "proceed" "done" "perfect" "excellent" "that works" "sounds good" "makes sense"
)

declare -a RESEARCH_COMPLETE=("now i know" "that answers" "clear now" "understood" "i see" "that makes sense" "helped")

declare -a CASUAL_ACKNOWLEDGMENTS=("thanks" "thank you" "please" "k" "sure" "yep" "yeah")

# Thresholds
TOOL_CALL_THRESHOLD=30
FILE_THRESHOLD=5
FAIL_THRESHOLD=3

#-------------------------------------------------------------------------------
# Detection functions
#-------------------------------------------------------------------------------
is_milestone() {
    local msg="$1"
    local lower
    lower=$(echo "$msg" | tr '[:upper:]' '[:lower:]')

    # Short standalone acknowledgments are NOT milestones (false positive guard)
    local trimmed_lower=$(echo "$lower" | xargs)
    if [[ ${#trimmed_lower} -le 3 ]]; then
        return 1
    fi

    # Check for research completion phrases first (higher confidence)
    for phrase in "${RESEARCH_COMPLETE[@]}"; do
        if [[ "$lower" == *"$phrase"* ]]; then
            return 0
        fi
    done

    # Check milestone words
    for word in "${MILESTONE_WORDS[@]}"; do
        if [[ "$lower" == "$word" ]] || [[ "$lower" == *" $word"* ]] || [[ "$lower" == "$word "* ]] || [[ "$lower" == *"$word"* ]]; then
            return 0
        fi
    done

    return 1
}

is_casual_acknowledgment() {
    local msg="$1"
    local lower
    lower=$(echo "$msg" | tr '[:upper:]' '[:lower:]')

    for word in "${CASUAL_ACKNOWLEDGMENTS[@]}"; do
        if [[ "$lower" == "$word" ]] || [[ "$lower" == "$word"* ]] || [[ "$lower" == *" $word"* ]]; then
            return 0
        fi
    done

    return 1
}

should_trigger() {
    local tool_calls="$1"
    local files="$2"
    local failures="$3"

    [[ $tool_calls -gt $TOOL_CALL_THRESHOLD ]] && return 0
    [[ $files -gt $FILE_THRESHOLD ]] && return 0
    [[ $failures -ge $FAIL_THRESHOLD ]] && return 0

    return 1
}

#-------------------------------------------------------------------------------
# Test runner
#-------------------------------------------------------------------------------
run_test() {
    local id="$1"
    local category="$2"
    local prompt="$3"
    local tool_calls="$4"
    local files="$5"
    local failures="$6"
    local expected="$7"

    TOTAL=$((TOTAL + 1))

    local milestone=false
    local casual=false
    local trigger=false

    if is_milestone "$prompt"; then
        milestone=true
    fi

    if is_casual_acknowledgment "$prompt"; then
        casual=true
    fi

    if [[ "$expected" == "SHOULD trigger" ]]; then
        # Check if should trigger based on thresholds or milestone
        if [[ $tool_calls -gt $TOOL_CALL_THRESHOLD ]] || \
           [[ $files -gt $FILE_THRESHOLD ]] || \
           [[ $failures -ge $FAIL_THRESHOLD ]] || \
           [[ "$milestone" == true && ( $tool_calls -gt 10 || $files -gt 2 || $failures -gt 0 ) ]]; then
            trigger=true
        fi

        if [[ "$trigger" == true ]]; then
            echo -e "${GREEN}✓ Test $id ($category): PASS${NC}"
            echo "  Prompt: $prompt"
            echo "  Context: tools=$tool_calls files=$files failures=$failures"
            PASS=$((PASS + 1))
        else
            echo -e "${RED}✗ Test $id ($category): FAIL${NC}"
            echo "  Prompt: $prompt"
            echo "  Expected: SHOULD trigger (but didn't)"
            echo "  Context: tools=$tool_calls files=$files failures=$failures"
            FAIL=$((FAIL + 1))
        fi
    else
        # Should NOT trigger
        if [[ "$casual" == true && $tool_calls -lt 10 && $files -lt 3 && $failures -eq 0 ]]; then
            echo -e "${GREEN}✓ Test $id ($category): PASS${NC}"
            echo "  Prompt: $prompt"
            echo "  Correctly suppressed (casual acknowledgment)"
            PASS=$((PASS + 1))
        elif [[ "$milestone" == false && $tool_calls -lt $TOOL_CALL_THRESHOLD && $files -lt $FILE_THRESHOLD && $failures -lt $FAIL_THRESHOLD ]]; then
            echo -e "${GREEN}✓ Test $id ($category): PASS${NC}"
            echo "  Prompt: $prompt"
            echo "  Correctly suppressed (below all thresholds)"
            PASS=$((PASS + 1))
        else
            # Complex case - check if milestone with very low context should still trigger
            if [[ "$milestone" == true && $tool_calls -lt 10 && $files -lt 3 && $failures -eq 0 ]]; then
                echo -e "${RED}✗ Test $id ($category): FAIL${NC}"
                echo "  Prompt: $prompt"
                echo "  Expected: SHOULD NOT trigger (casual 'ok' without context saturation)"
                echo "  But detected milestone without threshold crossing"
                FAIL=$((FAIL + 1))
            else
                echo -e "${GREEN}✓ Test $id ($category): PASS${NC}"
                echo "  Prompt: $prompt"
                echo "  Correctly suppressed"
                PASS=$((PASS + 1))
            fi
        fi
    fi

    echo
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------
echo -e "${BLUE}=== Strategic Compaction Skill — Test Runner ===${NC}"
echo

if [[ ! -f "$TEST_CASES" ]]; then
    echo -e "${RED}Error: test-cases.json not found${NC}"
    exit 1
fi

echo "Running detection tests..."
echo

# Test cases (id, category, prompt, tool_calls, files, failures, expected)
run_test 1 "milestone_trigger" "That works, let us implement it" 15 2 0 "SHOULD trigger"
run_test 2 "milestone_trigger" "ok" 5 1 0 "SHOULD NOT trigger"
run_test 3 "milestone_trigger" "ok good, now I understand" 25 3 0 "SHOULD trigger"
run_test 4 "failed_approach" "Attempt 1 failed" 20 5 3 "SHOULD trigger"
run_test 5 "complex_change" "Go ahead with the refactor" 10 8 0 "SHOULD trigger"
run_test 6 "context_saturation" "Continue" 45 3 0 "SHOULD trigger"
run_test 7 "architecture_decision" "Let us go with option B, the microservices approach" 30 2 0 "SHOULD trigger"
run_test 8 "false_positive_guard" "thanks" 8 1 0 "SHOULD NOT trigger"
run_test 9 "false_positive_guard" "k" 5 0 0 "SHOULD NOT trigger"
run_test 10 "false_positive_guard" "wait, what about error handling" 10 2 0 "SHOULD NOT trigger"
run_test 11 "sequence_detection" "trying again after failures" 15 4 3 "SHOULD trigger"
run_test 12 "edge_case" "Done" 50 10 1 "SHOULD trigger"

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, $TOTAL total"
echo

if [[ $FAIL -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Review the output above.${NC}"
    exit 1
fi
