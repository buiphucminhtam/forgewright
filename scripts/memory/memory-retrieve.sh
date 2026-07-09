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
PERSONA_FILE="$FORGEWRIGHT_DIR/.forgewright/memory-bank/persona.md"
SCENARIOS_DIR="$FORGEWRIGHT_DIR/.forgewright/memory-bank/scenarios"
MAX_TOKENS="${MEM0_MAX_TOKENS:-500}"
SEARCH_LIMIT="${MEM0_SEARCH_LIMIT:-3}"
INDEX_LIMIT="${MEM0_INDEX_LIMIT:-5}"
PERSONA_TOKEN_LIMIT="${MEM0_PERSONA_TOKENS:-120}"
SCENARIO_TOKEN_LIMIT="${MEM0_SCENARIO_TOKENS:-180}"
SCENARIO_LIMIT="${MEM0_SCENARIO_LIMIT:-2}"
GEMINI_CACHE_THRESHOLD="${GEMINI_CACHE_THRESHOLD:-4096}"
TOKEN_BUDGET_USED=0
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

estimate_tokens() {
    python3 -c "import sys; print((len(sys.stdin.read()) + 3) // 4)"
}

remaining_tokens() {
    local remaining=$((MAX_TOKENS - TOKEN_BUDGET_USED))
    if [[ "$remaining" -lt 0 ]]; then
        echo 0
    else
        echo "$remaining"
    fi
}

truncate_to_tokens() {
    local max_tokens="$1"
    python3 -c "
import sys
max_chars = max(0, int(sys.argv[1]) * 4)
text = sys.stdin.read()
if len(text) <= max_chars:
    print(text.rstrip())
else:
    print(text[:max_chars].rstrip())
    print('...[truncated]')
" "$max_tokens"
}

emit_limited_section() {
    local title="$1"
    local body="$2"
    local max_tokens="$3"
    local remaining
    remaining=$(remaining_tokens)

    if [[ -z "$body" || "$remaining" -le 0 ]]; then
        return
    fi
    if [[ "$max_tokens" -gt "$remaining" ]]; then
        max_tokens="$remaining"
    fi

    local emitted
    emitted=$(printf "%s" "$body" | truncate_to_tokens "$max_tokens")
    if [[ -z "$emitted" ]]; then
        return
    fi

    local used
    used=$(printf "%s" "$emitted" | estimate_tokens)
    TOKEN_BUDGET_USED=$((TOKEN_BUDGET_USED + used))

    echo ""
    echo "### $title"
    echo ""
    printf "%s\n" "$emitted"
    echo ""
}

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
        emit_limited_section "Conversation Summary (previous turns)" "$(tail -20 "$CONVERSATION_SUMMARY")" 120
    fi
}

# Load active context if exists
load_active_context() {
    if [[ -f "$ACTIVE_CONTEXT" ]]; then
        info "Loading active context: $ACTIVE_CONTEXT"
        emit_limited_section "Active Context" "$(cat "$ACTIVE_CONTEXT")" 100
    fi
}

# Load BA scope if exists
load_ba_scope() {
    if [[ -f "$BA_SCOPE" ]]; then
        info "Loading BA scope: $BA_SCOPE"
        emit_limited_section "BA Scope" "$(head -50 "$BA_SCOPE")" 120
    fi
}

# Load persona layer before atom-level search.
load_persona_context() {
    if [[ -f "$PERSONA_FILE" ]]; then
        info "Loading persona memory: $PERSONA_FILE"
        emit_limited_section "Persona Memory" "$(cat "$PERSONA_FILE")" "$PERSONA_TOKEN_LIMIT"
    fi
}

# Load scenario layer before atom-level search.
load_scenario_context() {
    local keywords="$1"
    if [[ ! -d "$SCENARIOS_DIR" ]]; then
        return
    fi

    local scenario_body
    scenario_body=$(python3 - "$SCENARIOS_DIR" "$keywords" "$SCENARIO_LIMIT" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1])
keywords = [part.lower() for part in sys.argv[2].split() if part.strip()]
limit = int(sys.argv[3])
ranked = []

for path in sorted(root.glob("*.md")):
    text = path.read_text()
    haystack = text.lower()
    score = sum(1 for keyword in keywords if keyword in haystack)
    ranked.append((score, path.name, text))

ranked.sort(key=lambda item: (-item[0], item[1]))
selected = ranked[:limit]
if selected:
    for _, name, text in selected:
        print(f"#### {name}")
        print("")
        print(text.strip())
        print("")
PY
)

    if [[ -n "$scenario_body" ]]; then
        info "Loading scenario memory: $SCENARIOS_DIR"
        emit_limited_section "Relevant Scenarios" "$scenario_body" "$SCENARIO_TOKEN_LIMIT"
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
    local max_tokens="${2:-240}"
    local remaining
    remaining=$(remaining_tokens)
    if [[ "$remaining" -le 0 ]]; then
        return
    fi
    if [[ "$max_tokens" -gt "$remaining" ]]; then
        max_tokens="$remaining"
    fi
    local count
    count=$(echo "$results" | python3 -c "import json,sys; data=json.load(sys.stdin); print(len(data) if isinstance(data,list) else 0)" 2>/dev/null || echo "0")
    if [[ "$count" -eq 0 ]]; then
        return
    fi
    local formatted
    formatted=$(echo "$results" | python3 -c "
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
" 2>/dev/null || true)
    emit_limited_section "Relevant Memories (mem0)" "$formatted" "$max_tokens"
}

effective_search_limit() {
    local remaining
    remaining=$(remaining_tokens)
    if [[ "$remaining" -lt 60 ]]; then
        echo 0
    elif [[ "$remaining" -lt 140 ]]; then
        echo 1
    else
        echo "$SEARCH_LIMIT"
    fi
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
    load_persona_context
    load_scenario_context "$keywords"
    load_conversation_summary
    load_active_context
    load_ba_scope

    # Run mem0 search (Layer 2 - FTS + BM25)
    local search_results
    local actual_search_limit
    actual_search_limit=$(effective_search_limit)
    if [[ "$actual_search_limit" -gt 0 ]]; then
        search_results=$(run_mem0_search "$keywords" "$actual_search_limit")
        format_search_results "$search_results" 240
    else
        search_results="[]"
        info "Skipping mem0 atom search — context budget already used by higher layers"
    fi

    # Run mem0 index (Layer 1 - compact)
    local index_results
    if [[ "$(remaining_tokens)" -ge 60 ]]; then
        index_results=$(run_mem0_index "$keywords" "$INDEX_LIMIT")
    else
        index_results="[]"
    fi

    echo ""
    echo "--- END MEMORY BLOCK ---"
    echo ""

    # Count memories loaded
    local mem_count
    mem_count=$(echo "$search_results" | python3 -c "import json,sys; data=json.load(sys.stdin); print(len(data) if isinstance(data,list) else 0)" 2>/dev/null || echo "0")
    info "Memory retrieval done — $mem_count memories loaded (budget: ${MAX_TOKENS} tokens, higher-layer estimate: ${TOKEN_BUDGET_USED})"
}

main "$@"
