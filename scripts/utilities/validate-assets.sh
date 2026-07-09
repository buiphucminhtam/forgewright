#!/bin/bash
# Forgewright Asset Validation Hook
# Inspired by CCGS validate-assets.sh
#
# Purpose: Validate asset files when they are created or modified
# - Check naming conventions
# - Validate JSON structure
# - Check file size limits
#
# Usage: Called automatically by Claude Code hooks on assets/** writes
# Exit 0 = allow, Exit 2 = block

set +e

# Color output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log_warn() {
    echo -e "${YELLOW}⚠️ $1${NC}" >&2
}

log_error() {
    echo -e "${RED}❌ $1${NC}" >&2
}

log_info() {
    echo -e "${GREEN}✓ $1${NC}" >&2
}

# Get the file being written
TARGET_FILE="$1"

# If no argument, try to get from stdin (Claude Code format)
if [ -z "$TARGET_FILE" ]; then
    INPUT=$(cat)
    if command -v jq >/dev/null 2>&1; then
        TARGET_FILE=$(echo "$INPUT" | jq -r '.tool_input.path // empty' 2>/dev/null)
    fi
fi

# Only process files in assets/ directory
if ! echo "$TARGET_FILE" | grep -qE '^assets/'; then
    exit 0
fi

echo "=== Forgewright Asset Validation ===" >&2
echo "Validating: $TARGET_FILE" >&2

WARNINGS=""
BLOCKS=""

# =============================================================================
# Check 1: Naming conventions
# =============================================================================
# General naming pattern: lowercase with hyphens
if [[ "$TARGET_FILE" =~ [A-Z] ]]; then
    BLOCKS="${BLOCKS}\n  BLOCKED: Asset file contains uppercase characters. Use lowercase with hyphens (e.g., 'player-sprite.png')."
fi

# Extension-specific checks
EXT="${TARGET_FILE##*.}"
BASE=$(basename "$TARGET_FILE" ".$EXT")

case "$EXT" in
    png|jpg|jpeg|gif|webp|svg)
        # Image naming: descriptive-lowercase.ext
        if ! echo "$BASE" | grep -qE '^[a-z][a-z0-9-]*$'; then
            WARNINGS="${WARNINGS}\n  WARNING: Image name should use lowercase with hyphens (found: '$BASE')"
        fi
        ;;
    mp3|wav|ogg|flac)
        # Audio naming: category-descriptive-lowercase.ext
        if ! echo "$BASE" | grep -qE '^[a-z][a-z0-9-]*$'; then
            WARNINGS="${WARNINGS}\n  WARNING: Audio file name should use lowercase with hyphens"
        fi
        ;;
    json)
        # JSON naming: descriptive-lowercase.ext
        if ! echo "$BASE" | grep -qE '^[a-z][a-z0-9-]*$'; then
            BLOCKS="${BLOCKS}\n  BLOCKED: JSON file name should use lowercase with hyphens"
        fi
        ;;
    tscn|tres|gd|cs|cpp)
        # Godot/Unity/Unreal resource naming
        if ! echo "$BASE" | grep -qE '^[A-Z][a-zA-Z0-9_]*$'; then
            WARNINGS="${WARNINGS}\n  WARNING: Resource file should use PascalCase (found: '$BASE')"
        fi
        ;;
esac

# =============================================================================
# Check 2: JSON validity
# =============================================================================
if [ "$EXT" = "json" ] && [ -f "$TARGET_FILE" ]; then
    PYTHON_CMD=""
    for cmd in python3 python; do
        if command -v "$cmd" >/dev/null 2>&1; then
            PYTHON_CMD="$cmd"
            break
        fi
    done
    
    if [ -n "$PYTHON_CMD" ]; then
        if ! "$PYTHON_CMD" -m json.tool "$TARGET_FILE" > /dev/null 2>&1; then
            BLOCKS="${BLOCKS}\n  BLOCKED: $TARGET_FILE is not valid JSON"
        fi
    fi
fi

# =============================================================================
# Check 3: File size limits
# =============================================================================
if [ -f "$TARGET_FILE" ]; then
    SIZE=$(stat -f%z "$TARGET_FILE" 2>/dev/null || stat -c%s "$TARGET_FILE" 2>/dev/null || echo 0)
    
    # Image size limit: 10MB
    case "$EXT" in
        png|jpg|jpeg|gif|webp)
            if [ "$SIZE" -gt 10485760 ]; then
                WARNINGS="${WARNINGS}\n  WARNING: Image file is larger than 10MB (${SIZE} bytes). Consider optimizing."
            fi
            ;;
        mp3|wav|ogg|flac)
            # Audio size limit: 50MB
            if [ "$SIZE" -gt 52428800 ]; then
                WARNINGS="${WARNINGS}\n  WARNING: Audio file is larger than 50MB (${SIZE} bytes). Consider compression."
            fi
            ;;
        json)
            # JSON size limit: 1MB
            if [ "$SIZE" -gt 1048576 ]; then
                WARNINGS="${WARNINGS}\n  WARNING: JSON file is larger than 1MB (${SIZE} bytes). Consider splitting."
            fi
            ;;
    esac
fi

# =============================================================================
# Check 4: Required directories
# =============================================================================
DIR=$(dirname "$TARGET_FILE")
case "$DIR" in
    assets/images/*|assets/img/*|assets/sprites/*)
        if [ ! -d "$DIR" ]; then
            WARNINGS="${WARNINGS}\n  INFO: Directory $DIR does not exist — will be created"
        fi
        ;;
esac

# =============================================================================
# Output results
# =============================================================================

if [ -n "$WARNINGS" ]; then
    echo -e "\n${YELLOW}=== Asset Validation Warnings ===${NC}" >&2
    echo -e "$WARNINGS" >&2
fi

if [ -n "$BLOCKS" ]; then
    echo -e "\n${RED}=== Asset Validation Errors ===${NC}" >&2
    echo -e "$BLOCKS" >&2
    log_error "Asset validation failed"
    exit 2
fi

echo "" >&2
echo "================================" >&2
log_info "Asset validated successfully"

exit 0
