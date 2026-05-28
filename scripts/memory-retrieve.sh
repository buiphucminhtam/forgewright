#!/usr/bin/env bash
# memory-retrieve.sh — Adaptive Memory Retrieval for Forgewright
# Usage: bash memory-retrieve.sh "<user_request>"
# Output: Markdown MEMORY BLOCK for injection into context

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="${FORGEWRIGHT_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
MEM0_SCRIPT="$SCRIPT_DIR/mem0-v2.py"
CONVERSATION_SUMMARY="$FORGEWRIGHT_DIR/.forgewright/subagent-context/CONVERSATION_SUMMARY.md"
ACTIVE_CONTEXT="$FORGEWRIGHT_DIR/.forgewright/memory-bank/activeContext.md"
BA_SCOPE="$FORGEWRIGHT_DIR/.forgewright/business-analyst/handoff/ba-package.md"
SESSION_LOG="$FORGEWRIGHT_DIR/.forgewright/session-log.json"
MAX_TOKENS="${MEM0_MAX_TOKENS:-500}"
SEARCH_LIMIT="${MEM0_SEARCH_LIMIT:-3}"
INDEX_LIMIT="${MEM0_INDEX_LIMIT:-5}"
# ── Colors ───────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
# ── Helpers ──────────────────────────────────────────────────────────────
info()  { echo -e "${GREEN}[memory-retrieve]${NC} $1"; }
warn()  { echo -e "${YELLOW}[memory-retrieve]${NC} WARNING: $1" >&2; }
error() { echo -e "${RED}[memory-retrieve]${NC} ERROR: $1" >&2; exit 1; }

# Check mem0 availability
check_deps() {
    if [[ ! -f "$MEM0_SCRIPT" ]]; then
        error "mem0-v2.py not found at $MEM0_SCRIPT"
    fi
    if ! command -v python3 &>/dev/null; then
        error "python3 not found"
    fi
}

# Extract keywords from user request using simple NLP heuristics
# Removes stopwords, keeps nouns and verbs
extract_keywords() {
    local request="$1"
    # Convert to lowercase using tr, remove punctuation, split into words
    local words
    words=$(echo "$request" \
        | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz' \
        | tr -cs 'a-z0-9' '\n' \
        | grep -vE '^(the|a|an|and|or|but|in|on|at|to|for|of|with|by|from|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|this|that|these|those|it|its|they|their|we|our|you|your|i|my|me|how|what|when|where|why|which|who|whom|whose|please|thanks|thank)$' \
        | sort -u \
        | tr '\n' ' ' \
        | sed 's/  */ /g' \
        | sed 's/^ //;s/ $//' || true)
    echo "$words"
}

# Run mem0 search and capture output
run_mem0_search() {
    local query="$1"
    local limit="$2"
    if [[ -z "$query" ]]; then
        echo "[]"
        return
    fi
    python3 "$MEM0_SCRIPT" search "$query" --limit "$limit" --format full 2>/dev/null || echo "[]"
}

# Run mem0 index and capture output
run_mem0_index() {
    local query="$1"
    local limit="$2"
    if [[ -z "$query" ]]; then
        echo "[]"
        return
    fi
    python3 "$MEM0_SCRIPT" index "$query" --limit "$limit" 2>/dev/null || echo "[]"
}

# Load conversation summary if exists
load_conversation_summary() {
    if [[ -f "$CONVERSATION_SUMMARY" ]]; then
        info "Loading conversation summary: $CONVERSATION_SUMMARY"
        echo ""
        echo "### Conversation Summary (previous turns)"
        echo ""
        tail -20 "$CONVERSATION_SUMMARY"
        echo ""
    fi
}

# Load active context if exists
load_active_context() {
    if [[ -f "$ACTIVE_CONTEXT" ]]; then
        info "Loading active context: $ACTIVE_CONTEXT"
        echo ""
        echo "### Active Context"
        echo ""
        cat "$ACTIVE_CONTEXT"
        echo ""
    fi
}

# Load BA scope if exists
load_ba_scope() {
    if [[ -f "$BA_SCOPE" ]]; then
        info "Loading BA scope: $BA_SCOPE"
        echo ""
        echo "### BA Scope"
        echo ""
        head -50 "$BA_SCOPE"
        echo ""
    fi
}

# Get session info
get_session_info() {
    if [[ -f "$SESSION_LOG" ]]; then
        # Get last completed session summary
        local last_summary
        last_summary=$(python3 -c "
import json, sys
try:
    data = json.load(open('$SESSION_LOG'))
    sessions = data.get('sessions', [])
    # Find last completed session
    completed = [s for s in sessions if s.get('status') == 'completed']
    if completed:
        s = completed[-1]
        print(f\"Session: {s.get('session_id', '?')} | Mode: {s.get('mode', '?')} | Summary: {s.get('summary', 'none') or 'none'}\")
except:
    print('')
" 2>/dev/null || echo "")
        if [[ -n "$last_summary" ]]; then
            echo ""
            echo "### Last Session"
            echo "$last_summary"
            echo ""
        fi
    fi
}

# Format search results as markdown
format_search_results() {
    local results="$1"
    local count
    count=$(echo "$results" | python3 -c "import json,sys; data=json.load(sys.stdin); print(len(data) if isinstance(data,list) else 0)" 2>/dev/null || echo "0")
    if [[ "$count" -eq 0 ]]; then
        return
    fi
    echo ""
    echo "### Relevant Memories (mem0)"
    echo ""
    echo "$results" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        for item in data:
            cat = item.get('category', item.get('type', ''))
            mem = item.get('memory', item.get('title', ''))
            print(f'- **[{cat}]** {mem[:200]}')
    elif isinstance(data, dict) and 'results' in data:
        for item in data['results']:
            cat = item.get('category', item.get('type', ''))
            mem = item.get('memory', item.get('title', ''))
            print(f'- **[{cat}]** {mem[:200]}')
except Exception as e:
    pass
" 2>/dev/null || true
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
    local request="${1:-}"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  MEMORY RETRIEVAL — Forgewright Step 0.5"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    check_deps

    if [[ -z "$request" ]]; then
        warn "No request provided — loading recent memories only"
        request="recent session"
    fi

    info "Request: $request"

    # Step 1: Extract keywords
    local keywords
    keywords=$(extract_keywords "$request")
    info "Keywords: $keywords"

    # Step 2: Run layered retrieval
    echo ""
    echo "--- MEMORY BLOCK ---"
    echo ""

    # Load context files
    get_session_info
    load_conversation_summary
    load_active_context
    load_ba_scope

    # Run mem0 search (Layer 2 - FTS + BM25)
    local search_results
    search_results=$(run_mem0_search "$keywords" "$SEARCH_LIMIT")
    format_search_results "$search_results"

    # Run mem0 index (Layer 1 - compact)
    local index_results
    index_results=$(run_mem0_index "$keywords" "$INDEX_LIMIT")

    echo ""
    echo "--- END MEMORY BLOCK ---"
    echo ""

    # Count memories loaded
    local mem_count
    mem_count=$(echo "$search_results" | python3 -c "import json,sys; data=json.load(sys.stdin); print(len(data) if isinstance(data,list) else 0)" 2>/dev/null || echo "0")
    info "Memory retrieval done — $mem_count memories loaded (budget: ${MAX_TOKENS} tokens)"
}

main "$@"
