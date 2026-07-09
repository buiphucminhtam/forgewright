#!/bin/bash
# unity-workflow.sh - Vibe coding workflow for Unity projects
# Usage: ./unity-workflow.sh <command>

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Find Unity executable
find_unity() {
    local paths=(
        "/Applications/Unity/Unity.app/Contents/MacOS/Unity"
        "/Applications/Unity Hub/Editors/*/Unity.app/Contents/MacOS/Unity"
        "/usr/local/unity-editor/Editor/Unity"
        "/opt/unity-editor/Editor/Unity"
        "C:/Program Files/Unity/Editor/Unity.exe"
        "C:/Program Files/Unity Hub/Editor/*/Editor/Unity.exe"
    )
    
    for path in "${paths[@]}"; do
        # Handle wildcards
        if [[ "$path" == *"*"* ]]; then
            matches=($path)
            if [ ${#matches[@]} -gt 0 ]; then
                # Use the latest version (last in array)
                echo "${matches[-1]}"
                return 0
            fi
        elif [ -f "$path" ]; then
            echo "$path"
            return 0
        fi
    done
    
    echo "Unity not found. Please install Unity or set UNITY_PATH environment variable." >&2
    return 1
}

UNITY="${UNITY_PATH:-$(find_unity)}"
PROJECT_PATH="${UNITY_PROJECT_PATH:-.}"

# Colors helper
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check Unity exists
check_unity() {
    if [ ! -f "$UNITY" ]; then
        error "Unity not found at: $UNITY"
        error "Set UNITY_PATH environment variable or install Unity"
        exit 1
    fi
}

# Run EditMode tests
run_edit_tests() {
    info "Running EditMode tests..."
    check_unity
    
    "$UNITY" -batchmode \
        -projectPath "$PROJECT_PATH" \
        -testResults "./test-results-edit.xml" \
        -testPlatform editmode \
        -logFile "./edit-tests.log" \
        -quit
    
    if [ -f "./test-results-edit.xml" ]; then
        local failed=$(grep -o 'failures="[0-9]*"' "./test-results-edit.xml" | grep -o '[0-9]*' || echo "0")
        if [ "$failed" -eq "0" ]; then
            success "All EditMode tests passed!"
            return 0
        else
            error "EditMode tests failed: $failed failures"
            return 1
        fi
    else
        error "No test results generated"
        return 1
    fi
}

# Run PlayMode tests
run_play_tests() {
    info "Running PlayMode tests..."
    check_unity
    
    "$UNITY" -batchmode \
        -projectPath "$PROJECT_PATH" \
        -testResults "./test-results-play.xml" \
        -testPlatform playmode \
        -playerHeartbeatTimeout 300 \
        -logFile "./play-tests.log" \
        -quit
    
    if [ -f "./test-results-play.xml" ]; then
        local failed=$(grep -o 'failures="[0-9]*"' "./test-results-play.xml" | grep -o '[0-9]*' || echo "0")
        if [ "$failed" -eq "0" ]; then
            success "All PlayMode tests passed!"
            return 0
        else
            error "PlayMode tests failed: $failed failures"
            return 1
        fi
    else
        error "No test results generated"
        return 1
    fi
}

# Run all tests
run_all_tests() {
    info "Running all tests..."
    
    run_edit_tests
    local edit_result=$?
    
    run_play_tests
    local play_result=$?
    
    if [ $edit_result -eq 0 ] && [ $play_result -eq 0 ]; then
        success "All tests passed!"
        return 0
    else
        error "Some tests failed"
        return 1
    fi
}

# Run specific test filter
run_test_filter() {
    local filter="$1"
    info "Running tests matching: $filter"
    check_unity
    
    "$UNITY" -batchmode \
        -projectPath "$PROJECT_PATH" \
        -testResults "./test-results-filter.xml" \
        -testPlatform editmode \
        -testFilter "$filter" \
        -logFile "./filter-tests.log" \
        -quit
    
    if [ -f "./test-results-filter.xml" ]; then
        local failed=$(grep -o 'failures="[0-9]*"' "./test-results-filter.xml" | grep -o '[0-9]*' || echo "0")
        if [ "$failed" -eq "0" ]; then
            success "Tests matching '$filter' passed!"
            return 0
        else
            error "Tests matching '$filter' failed"
            return 1
        fi
    fi
}

# Build project
build_project() {
    local platform="${1:-WindowsStandalone}"
    local output="${2:-./Build/Game}"
    info "Building for $platform..."
    check_unity
    
    "$UNITY" -batchmode \
        -projectPath "$PROJECT_PATH" \
        -buildTarget "$platform" \
        -buildPath "$output" \
        -logFile "./build.log" \
        -quit
    
    if [ -f "$output" ] || [ -d "$output" ]; then
        success "Build successful: $output"
        return 0
    else
        error "Build failed - check build.log"
        return 1
    fi
}

# Open Unity Editor
open_editor() {
    check_unity
    info "Opening Unity Editor..."
    open -a "$UNITY" --args -projectPath "$PROJECT_PATH"
}

# Show help
show_help() {
    echo "Unity Workflow - Vibe Coding Automation"
    echo ""
    echo "Usage: ./unity-workflow.sh <command> [options]"
    echo ""
    echo "Commands:"
    echo "  edit-tests              Run EditMode tests"
    echo "  play-tests             Run PlayMode tests"
    echo "  all-tests              Run all tests (edit + play)"
    echo "  test <filter>          Run tests matching filter"
    echo "  build [platform]        Build project (default: WindowsStandalone)"
    echo "  open                   Open Unity Editor"
    echo "  help                   Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  UNITY_PATH             Path to Unity executable"
    echo "  UNITY_PROJECT_PATH     Path to Unity project (default: .)"
    echo ""
    echo "Examples:"
    echo "  ./unity-workflow.sh edit-tests"
    echo "  ./unity-workflow.sh all-tests"
    echo "  ./unity-workflow.sh test DamageCalculator"
    echo "  UNITY_PATH=/path/to/unity ./unity-workflow.sh build"
}

# Main
case "${1:-help}" in
    edit-tests)
        run_edit_tests
        ;;
    play-tests)
        run_play_tests
        ;;
    all-tests)
        run_all_tests
        ;;
    test)
        if [ -z "$2" ]; then
            error "Please provide a test filter"
            exit 1
        fi
        run_test_filter "$2"
        ;;
    build)
        build_project "${2:-WindowsStandalone}" "${3:-./Build/Game}"
        ;;
    open)
        open_editor
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
