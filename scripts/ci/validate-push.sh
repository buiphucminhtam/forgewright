#!/bin/bash
# Forgewright Pre-Push Validation Hook
# Inspired by CCGS validate-push.sh
#
# Purpose: Validate git push commands
# - Warn on push to protected branches
# - Check for uncommitted changes
# - Check for missing test files
#
# Usage: Called automatically by Claude Code hooks
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

# Parse command from stdin
INPUT=$(cat)

# Extract command
if command -v jq >/dev/null 2>&1; then
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
else
    COMMAND=$(echo "$INPUT" | grep -oE '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"command"[[:space:]]*:[[:space:]]*"//;s/"$//')
fi

# Only process git push commands
if ! echo "$COMMAND" | grep -qE '^git[[:space:]]+push'; then
    exit 0
fi

echo "=== Forgewright Push Validation ===" >&2

WARNINGS=""
BLOCKS=""

# =============================================================================
# Check 1: Protected branch protection
# =============================================================================
PROTECTED_BRANCHES="main master develop production staging"

# Extract target branch from push command
TARGET_BRANCH=$(echo "$COMMAND" | grep -oE '(main|master|develop|production|staging|origin/[a-zA-Z0-9_-]+)' | tail -1)

if [ -n "$TARGET_BRANCH" ]; then
    # Remove 'origin/' prefix if present
    TARGET_BRANCH=${TARGET_BRANCH#origin/}
    
    for protected in $PROTECTED_BRANCHES; do
        if [ "$TARGET_BRANCH" = "$protected" ]; then
            # Check if this is a force push
            if echo "$COMMAND" | grep -qE '\-\-force|-f'; then
                BLOCKS="${BLOCKS}\n  SECURITY: Force push to protected branch '$TARGET_BRANCH' is blocked."
            else
                WARNINGS="${WARNINGS}\n  WARNING: Pushing directly to protected branch '$TARGET_BRANCH'"
            fi
        fi
    done
fi

# =============================================================================
# Check 2: Uncommitted changes
# =============================================================================
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [ "$UNCOMMITTED" -gt 0 ]; then
    WARNINGS="${WARNINGS}\n  INFO: $UNCOMMITTED uncommitted change(s) in working tree"
fi

# =============================================================================
# Check 3: Missing tests
# =============================================================================
# Get files being pushed
PUSH_BRANCH=$(echo "$COMMAND" | grep -oE 'origin/[a-zA-Z0-9_-]+' | head -1 | sed 's/origin\///')
if [ -z "$PUSH_BRANCH" ]; then
    # Default to current branch
    PUSH_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
fi

# Find modified source files (not in tests/)
SRC_CHANGES=$(git diff --name-only HEAD 2>/dev/null | grep -E '^src/|^services/|^api/' | grep -vE '\.test\.|_test\.|spec\.' || true)

if [ -n "$SRC_CHANGES" ]; then
    # Count source files changed
    SRC_COUNT=$(echo "$SRC_CHANGES" | wc -l | tr -d ' ')
    
    # Count corresponding test files
    TEST_COUNT=0
    while IFS= read -r src_file; do
        # Look for test files in common locations
        base=$(basename "$src_file")
        name="${base%.*}"
        ext="${base##*.}"
        
        # Check common test patterns
        if [ -f "tests/${src_file%.$ext}.test.$ext" ] || \
           [ -f "tests/$src_file.test" ] || \
           [ -f "tests/${src_file%.$ext}_test.$ext" ] || \
           [ -f "src/${src_file%.$ext}.test.$ext" ]; then
            TEST_COUNT=$((TEST_COUNT + 1))
        fi
    done <<< "$SRC_CHANGES"
    
    if [ "$TEST_COUNT" -eq 0 ] && [ "$SRC_COUNT" -gt 0 ]; then
        WARNINGS="${WARNINGS}\n  WARNING: $SRC_COUNT source file(s) changed without corresponding test updates"
    fi
fi

# =============================================================================
# Check 4: Build status
# =============================================================================
# Check if build passes (if package.json exists)
if [ -f "package.json" ]; then
    if ! npm run build --dry-run 2>/dev/null | grep -q "error"; then
        WARNINGS="${WARNINGS}\n  WARNING: Build may have errors — run 'npm run build' before pushing"
    fi
fi

# =============================================================================
# Output results
# =============================================================================

if [ -n "$WARNINGS" ]; then
    echo -e "\n${YELLOW}=== Push Validation Warnings ===${NC}" >&2
    echo -e "$WARNINGS" >&2
fi

if [ -n "$BLOCKS" ]; then
    echo -e "\n${RED}=== Push Validation Errors ===${NC}" >&2
    echo -e "$BLOCKS" >&2
    log_error "Push blocked"
    exit 2
fi

echo "" >&2
echo "================================" >&2
log_info "Push validated successfully"

exit 0
