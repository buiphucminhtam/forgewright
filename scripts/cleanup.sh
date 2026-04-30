#!/bin/bash
# =============================================================================
# Cleanup Script
# 
# Purpose: Remove temporary files and cache directories
# Usage:   bash scripts/cleanup.sh [--dry-run]
# 
# What it removes:
#   - Python cache (__pycache__, *.pyc, *.pyo)
#   - Node modules cache (.cache, .next if build fails)
#   - Temporary files (*~, .DS_Store, Thumbs.db)
#   - Git merge conflict markers (only with --conflicts)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=false
REMOVE_CONFLICTS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --conflicts)
            REMOVE_CONFLICTS=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--dry-run] [--conflicts]"
            echo ""
            echo "Options:"
            echo "  --dry-run     Show what would be deleted without deleting"
            echo "  --conflicts   Also remove git merge conflict markers"
            echo "  --help, -h    Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_conflict() { echo -e "${RED}[CONFLICT]${NC} $1"; }

# =============================================================================
# Cleanup Patterns
# =============================================================================

echo ""
log_info "=========================================="
log_info "  Forgewright Cleanup Script"
log_info "=========================================="
echo ""

if [ "$DRY_RUN" = true ]; then
    log_warn "DRY RUN MODE - No files will be deleted"
    echo ""
fi

cd "$PROJECT_DIR"

# Counters
TOTAL_SIZE=0
FILE_COUNT=0

# -----------------------------------------------------------------------------
# Python Cache
# -----------------------------------------------------------------------------
log_info "Cleaning Python cache..."
PY_PATTERNS=(
    "__pycache__"
    "*.pyc"
    "*.pyo"
    "*.pyd"
    ".Python"
    "*.egg-info"
    ".pytest_cache"
    ".mypy_cache"
    ".ruff_cache"
)

for pattern in "${PY_PATTERNS[@]}"; do
    while IFS= read -r -d '' file; do
        size=$(du -sb "$file" 2>/dev/null | cut -f1 || echo "0")
        TOTAL_SIZE=$((TOTAL_SIZE + size))
        ((FILE_COUNT++))
        
        if [ "$DRY_RUN" = true ]; then
            echo -e "  ${CYAN}  Would delete:${NC} $file ($(numfmt --to=iec-i --suffix=B $size 2>/dev/null || echo "${size}B"))"
        else
            rm -rf "$file" 2>/dev/null || true
            echo -e "  ${GREEN}✓${NC} Deleted: $file"
        fi
    done < <(find . -type d -name "$pattern" -o -type f -name "$pattern" 2>/dev/null | grep -v ".git/" | grep -v "node_modules/" | tr '\n' '\0')
done

# -----------------------------------------------------------------------------
# Node/JS Cache
# -----------------------------------------------------------------------------
log_info "Cleaning Node/JS cache..."
NODE_PATTERNS=(
    ".cache"
    ".parcel-cache"
    ".nuxt"
    ".output"
    "dist"
    "build"
)

for pattern in "${NODE_PATTERNS[@]}"; do
    while IFS= read -r -d '' file; do
        # Skip if it's in node_modules (usually should keep dist in packages)
        if [[ "$file" == *"node_modules"* ]]; then
            continue
        fi
        
        size=$(du -sb "$file" 2>/dev/null | cut -f1 || echo "0")
        TOTAL_SIZE=$((TOTAL_SIZE + size))
        ((FILE_COUNT++))
        
        if [ "$DRY_RUN" = true ]; then
            echo -e "  ${CYAN}  Would delete:${NC} $file"
        else
            rm -rf "$file" 2>/dev/null || true
            echo -e "  ${GREEN}✓${NC} Deleted: $file"
        fi
    done < <(find . -type d -name "$pattern" 2>/dev/null | grep -v ".git/" | grep -v "node_modules/" | tr '\n' '\0')
done

# -----------------------------------------------------------------------------
# Temporary Files
# -----------------------------------------------------------------------------
log_info "Cleaning temporary files..."
TEMP_PATTERNS=(
    "*~"
    ".*.swp"
    ".*.swo"
    ".DS_Store"
    "Thumbs.db"
    "desktop.ini"
    "._*"
)

for pattern in "${TEMP_PATTERNS[@]}"; do
    while IFS= read -r -d '' file; do
        size=$(du -sb "$file" 2>/dev/null | cut -f1 || echo "0")
        TOTAL_SIZE=$((TOTAL_SIZE + size))
        ((FILE_COUNT++))
        
        if [ "$DRY_RUN" = true ]; then
            echo -e "  ${CYAN}  Would delete:${NC} $file"
        else
            rm -f "$file" 2>/dev/null || true
            echo -e "  ${GREEN}✓${NC} Deleted: $file"
        fi
    done < <(find . -type f -name "$pattern" 2>/dev/null | grep -v ".git/" | tr '\n' '\0')
done

# -----------------------------------------------------------------------------
# Log Files
# -----------------------------------------------------------------------------
log_info "Cleaning log files..."
LOG_PATTERNS=(
    "*.log"
    "npm-debug.log*"
    "yarn-debug.log*"
    "yarn-error.log*"
)

for pattern in "${LOG_PATTERNS[@]}"; do
    while IFS= read -r -d '' file; do
        size=$(du -sb "$file" 2>/dev/null | cut -f1 || echo "0")
        TOTAL_SIZE=$((TOTAL_SIZE + size))
        ((FILE_COUNT++))
        
        if [ "$DRY_RUN" = true ]; then
            echo -e "  ${CYAN}  Would delete:${NC} $file"
        else
            rm -f "$file" 2>/dev/null || true
            echo -e "  ${GREEN}✓${NC} Deleted: $file"
        fi
    done < <(find . -type f -name "$pattern" 2>/dev/null | grep -v ".git/" | tr '\n' '\0')
done

# -----------------------------------------------------------------------------
# Git Merge Conflicts (optional)
# -----------------------------------------------------------------------------
if [ "$REMOVE_CONFLICTS" = true ]; then
    log_warn "Removing git merge conflict markers..."
    
    CONFLICT_FILES=$(grep -r -l "^<<<<<<< " . 2>/dev/null | grep -v ".git/" || true)
    
    if [ -n "$CONFLICT_FILES" ]; then
        for file in $CONFLICT_FILES; do
            log_conflict "Found conflicts in: $file"
        done
        log_warn "Please resolve conflicts manually in the files above"
    else
        log_info "No merge conflicts found"
    fi
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
log_info "=========================================="
log_info "  Cleanup Summary"
log_info "=========================================="
echo ""

if [ "$DRY_RUN" = true ]; then
    log_info "Files that would be deleted: $FILE_COUNT"
    log_info "Space that would be freed: $(numfmt --to=iec-i --suffix=B $TOTAL_SIZE 2>/dev/null || echo "${TOTAL_SIZE}B")"
else
    log_info "Files deleted: $FILE_COUNT"
    log_info "Space freed: $(numfmt --to=iec-i --suffix=B $TOTAL_SIZE 2>/dev/null || echo "${TOTAL_SIZE}B")"
fi

echo ""
