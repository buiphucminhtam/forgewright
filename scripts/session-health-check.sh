#!/bin/bash
# =============================================================================
# Session Health Check Script
# 
# Purpose: Verify and fix stale session data automatically
# Usage:   bash scripts/session-health-check.sh [--fix]
# 
# What it checks:
#   1. session-log.json - marks stale sessions as interrupted
#   2. Memory Bank freshness - warns if older than 7 days
#   3. MCP manifest path - verifies correct workspace
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SESSION_LOG="$FORGEWRIGHT_DIR/.forgewright/session-log.json"
MEMORY_BANK="$FORGEWRIGHT_DIR/.forgewright/memory-bank"
PROGRESS_FILE="$MEMORY_BANK/progress.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Functions
# =============================================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_stale_session() {
    log_info "Checking session-log.json..."
    
    if [ ! -f "$SESSION_LOG" ]; then
        log_warn "No session-log.json found. Skipping."
        return 0
    fi
    
    # Check if session is stale (in_progress > 24h)
    if grep -q '"status": "in_progress"' "$SESSION_LOG"; then
        LAST_UPDATE=$(grep -o '"last_update": "[^"]*"' "$SESSION_LOG" | head -1 | cut -d'"' -f4)
        
        if [ -n "$LAST_UPDATE" ]; then
            # Check if older than 24 hours
            LAST_UPDATE_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${LAST_UPDATE%.000Z}" +%s 2>/dev/null || echo "0")
            NOW_EPOCH=$(date +%s)
            DIFF=$((NOW_EPOCH - LAST_UPDATE_EPOCH))
            
            if [ "$DIFF" -gt 86400 ]; then
                log_warn "Stale session detected (last_update: $LAST_UPDATE)"
                
                if [ "$1" == "--fix" ]; then
                    log_info "Fixing session-log.json..."
                    
                    # Backup first
                    cp "$SESSION_LOG" "$SESSION_LOG.bak"
                    
                    # Update status to interrupted
                    sed -i.bak 's/"status": "in_progress"/"status": "interrupted"/' "$SESSION_LOG"
                    
                    # Add last_update if missing
                    if ! grep -q '"last_update"' "$SESSION_LOG"; then
                        sed -i 's/"status": "interrupted"/"status": "interrupted",\n      "last_update": "'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'",\n      "interrupted_reason": "Session health check - stale data detected"/' "$SESSION_LOG"
                    fi
                    
                    log_info "Fixed: status set to 'interrupted'"
                else
                    log_info "Run with --fix to auto-fix"
                fi
            else
                log_info "Session is fresh (< 24h old)"
            fi
        else
            log_warn "Session has no last_update timestamp"
            if [ "$1" == "--fix" ]; then
                log_info "Adding timestamp..."
                NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
                sed -i 's/"status": "in_progress"/"status": "in_progress",\n      "last_update": "'"$NOW"'"/' "$SESSION_LOG"
            fi
        fi
    else
        log_info "No stale sessions found"
    fi
}

check_memory_bank() {
    log_info "Checking Memory Bank freshness..."
    
    if [ ! -d "$MEMORY_BANK" ]; then
        log_warn "Memory Bank directory not found. Run Phase 1 to create it."
        return 0
    fi
    
    if [ ! -f "$PROGRESS_FILE" ]; then
        log_warn "progress.md not found. Memory Bank may be incomplete."
        return 0
    fi
    
    # Extract last_updated from file header
    LAST_UPDATED=$(grep -i "Last Updated:" "$PROGRESS_FILE" | head -1 | sed 's/.*: *//' || echo "")
    
    if [ -n "$LAST_UPDATED" ]; then
        # Check if older than 7 days
        LAST_EPOCH=$(date -j -f "%Y-%m-%d" "$LAST_UPDATED" +%s 2>/dev/null || echo "0")
        NOW_EPOCH=$(date +%s)
        DIFF=$((NOW_EPOCH - LAST_EPOCH))
        
        if [ "$DIFF" -gt 604800 ]; then
            log_warn "Memory Bank may be stale (last update: $LAST_UPDATED)"
            log_info "Update progress.md at session end"
        else
            log_info "Memory Bank is fresh"
        fi
    else
        log_info "Could not determine Memory Bank age"
    fi
    
    # List Memory Bank files
    log_info "Memory Bank files:"
    ls -la "$MEMORY_BANK/" 2>/dev/null || log_warn "Could not list Memory Bank"
}

check_mcp_manifest() {
    log_info "Checking MCP manifest..."
    
    MANIFEST="$FORGEWRIGHT_DIR/.antigravity/mcp-manifest.json"
    
    if [ ! -f "$MANIFEST" ]; then
        log_warn "MCP manifest not found. Run /mcp to generate."
        return 0
    fi
    
    # Check workspace path
    WORKSPACE=$(grep -o '"workspace": "[^"]*"' "$MANIFEST" | head -1 | cut -d'"' -f4 || echo "")
    
    if [ -n "$WORKSPACE" ] && [ "$WORKSPACE" != "$FORGEWRIGHT_DIR" ]; then
        log_warn "MCP manifest has wrong workspace path: $WORKSPACE"
        log_info "Expected: $FORGEWRIGHT_DIR"
        log_info "Run /mcp to regenerate"
    else
        log_info "MCP manifest is correct"
    fi
}

run_mem0_check() {
    log_info "Checking mem0 stats..."
    
    MEM0_SCRIPT="$SCRIPT_DIR/mem0-v2.py"
    
    if [ -f "$MEM0_SCRIPT" ]; then
        python3 "$MEM0_SCRIPT" stats 2>/dev/null || log_warn "Could not get mem0 stats"
    else
        log_info "mem0-v2.py not found - skipping"
    fi
}

show_summary() {
    echo ""
    log_info "=========================================="
    log_info "  Session Health Check Summary"
    log_info "=========================================="
    echo ""
    log_info "Run 'bash scripts/session-health-check.sh --fix' to auto-fix issues"
    echo ""
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    log_info "=========================================="
    log_info "  Forgewright Session Health Check"
    log_info "=========================================="
    echo ""
    
    check_stale_session "$1"
    echo ""
    check_memory_bank
    echo ""
    check_mcp_manifest
    echo ""
    run_mem0_check
    
    show_summary
}

# Run
main "$@"
