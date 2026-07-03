#!/bin/bash
# verify-compilation.sh - Automated compiler verification loop for Forgewright.
# Auto-detects project types (Unity, Godot, WebGL/Three.js/Phaser 3) and validates compilation.

set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

PROJECT_ROOT=$(pwd)

# Detect Project Type
detect_project_type() {
    if [ -f "$PROJECT_ROOT/Assets/SceneTemplate.unity" ] || [ -d "$PROJECT_ROOT/Assets" ] || [ -f "$PROJECT_ROOT/ProjectSettings/ProjectSettings.asset" ]; then
        echo "unity"
    elif [ -f "$PROJECT_ROOT/project.godot" ]; then
        echo "godot"
    elif [ -f "$PROJECT_ROOT/package.json" ]; then
        echo "web"
    else
        echo "unknown"
    fi
}

PROJECT_TYPE=$(detect_project_type)
info "Detected project type: $PROJECT_TYPE"

# 1. Web / HTML5 Compilation Check
check_web() {
    info "Running Web TypeScript/JavaScript verification..."
    if [ -f "tsconfig.json" ]; then
        npx tsc --noEmit
        local exit_code=$?
        if [ $exit_code -eq 0 ]; then
            success "TypeScript typecheck passed!"
            return 0
        else
            error "TypeScript typecheck failed with exit code $exit_code"
            return 1
        fi
    elif npm run build -- --help &>/dev/null || grep -q '"build":' package.json; then
        npm run build
        local exit_code=$?
        if [ $exit_code -eq 0 ]; then
            success "NPM build passed!"
            return 0
        else
            error "NPM build failed with exit code $exit_code"
            return 1
        fi
    else
        warn "No tsconfig.json or NPM build script found. Skipping compile check."
        return 0
    fi
}

# 2. Godot Headless Compile Check
check_godot() {
    info "Running Godot compiler verification..."
    
    # Look for godot path
    local godot_cmd="godot"
    if ! command -v godot &> /dev/null; then
        # Check Mac paths
        if [ -f "/Applications/Godot.app/Contents/MacOS/Godot" ]; then
            godot_cmd="/Applications/Godot.app/Contents/MacOS/Godot"
        else
            error "Godot executable not found. Make sure it is in PATH or installed in Applications."
            return 1
        fi
    fi

    info "Validating GDScript scripts headlessly..."
    "$godot_cmd" --headless --check-only --path .
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        success "Godot scripts verified successfully!"
        return 0
    else
        error "Godot script validation failed with exit code $exit_code"
        return 1
    fi
}

# 3. Unity Batchmode Compile Check
check_unity() {
    info "Running Unity compiler verification..."
    
    # Try using unity-workflow helper
    if [ -f "./scripts/unity-workflow.sh" ]; then
        # Unity compilation is checked implicitly during builds or test runs
        # We run a quick check by looking for compilation errors in LogFiles
        local unity_path=""
        if [ -f "./scripts/unity-workflow.sh" ]; then
            # Extract Unity path dynamically
            # If not custom, try fallback search
            if command -v find_unity &>/dev/null; then
                unity_path=$(find_unity)
            else
                # Mac fallback search
                unity_path="/Applications/Unity/Unity.app/Contents/MacOS/Unity"
                if [ ! -f "$unity_path" ]; then
                    unity_path=$(find /Applications/Unity\ Hub/Editors/ -name "Unity" -type f -maxdepth 4 | head -n 1)
                fi
            fi
        fi

        if [ -z "$unity_path" ] || [ ! -f "$unity_path" ]; then
            error "Unity editor path not found. Cannot verify compilation."
            return 1
        fi

        info "Running Unity compiler batch mode..."
        # Triggering a compile check via running compilation log
        "$unity_path" -batchmode -quit -projectPath . -logFile "./compile-check.log"
        local exit_code=$?

        # Parse compile-check.log for errors
        if [ -f "./compile-check.log" ]; then
            # Search for "error CS" (C# compiler errors)
            local errors=$(grep -E "error CS[0-9]+" "./compile-check.log" || true)
            if [ ! -z "$errors" ]; then
                error "Unity C# compilation failed. Errors found:"
                echo "$errors"
                return 1
            fi
        fi

        if [ $exit_code -eq 0 ]; then
            success "Unity compilation passed!"
            return 0
        else
            error "Unity exited with non-zero code $exit_code"
            return 1
        fi
    else
        error "unity-workflow.sh not found."
        return 1
    fi
}

# Main Execution Routing
case "$PROJECT_TYPE" in
    web)
        check_web
        ;;
        
    godot)
        check_godot
        ;;
        
    unity)
        check_unity
        ;;
        
    *)
        error "Unknown project type or no game project config found in root folder."
        exit 1
        ;;
esac
