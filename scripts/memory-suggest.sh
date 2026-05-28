#!/usr/bin/env bash
# memory-suggest.sh — Proactive Memory Suggestions for Forgewright
# Suggests relevant memories, conventions, and blockers before starting work
# Usage: bash memory-suggest.sh "<user_request>"
# Output: Structured suggestions for injection into context

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="${FORGEWRIGHT_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
MEM0_SCRIPT="$SCRIPT_DIR/mem0-v2.py"
PROJECT_PROFILE="$FORGEWRIGHT_DIR/.forgewright/project-profile.json"
CODE_CONVENTIONS="$FORGEWRIGHT_DIR/.forgewright/code-conventions.md"
SESSION_LOG="$FORGEWRIGHT_DIR/.forgewright/session-log.json"
MAX_TOKENS="${MEM0_MAX_TOKENS:-500}"

# ── Colors ───────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[memory-suggest]${NC} $1"; }
warn()  { echo -e "${YELLOW}[memory-suggest]${NC} WARNING: $1" >&2; }

# Check dependencies
check_deps() {
    if [[ ! -f "$MEM0_SCRIPT" ]]; then
        warn "mem0-v2.py not found at $MEM0_SCRIPT"
        return 1
    fi
}

# Extract keywords (same as memory-retrieve.sh)
extract_keywords() {
    local request="$1"
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

# Detect potential blockers from session log
detect_blockers() {
    if [[ ! -f "$SESSION_LOG" ]]; then
        return
    fi
    python3 -c "
import json, sys
try:
    data = json.load(open('$SESSION_LOG'))
    sessions = data.get('sessions', [])
    active = [s for s in sessions if s.get('status') == 'in_progress']
    if active:
        s = active[-1]
        blockers = [e for e in s.get('events', []) if e.get('type') in ('SKILL_FAILED', 'ERROR', 'BLOCKER')]
        for b in blockers[:3]:
            print(f\"BLOCKER: {b.get('type')} - {b.get('details', b.get('error_type', 'unknown'))}\")
        if blockers:
            print('__BLOCKERS_END__')
except:
    pass
" 2>/dev/null || true
}

# Suggest memories by category
suggest_by_category() {
    local keywords="$1"
    local limit=3
    python3 "$MEM0_SCRIPT" search "$keywords" --limit "$limit" --format compact 2>/dev/null || true
}

# Suggest recent decisions relevant to request
suggest_decisions() {
    local keywords="$1"
    python3 "$MEM0_SCRIPT" list --category decisions --limit 5 2>/dev/null | \
        python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    # Check if line matches keywords
    keywords = '$keywords'.lower().split()
    if any(k in line.lower() for k in keywords):
        print(line)
" 2>/dev/null || true
}

# Load project conventions
load_conventions() {
    if [[ -f "$CODE_CONVENTIONS" ]]; then
        echo "--- CODE CONVENTIONS ---"
        head -30 "$CODE_CONVENTIONS"
        echo "--- END CONVENTIONS ---"
    fi
}

# Classify request type for targeted suggestions
classify_request() {
    local request="$1"
    local req_lower
    req_lower=$(echo "$request" | tr '[:upper:]' '[:lower:]')

    if echo "$req_lower" | grep -qE '(build|create|implement|add|new feature)'; then
        echo "feature"
    elif echo "$req_lower" | grep -qE '(review|audit|check|assess)'; then
        echo "review"
    elif echo "$req_lower" | grep -qE '(fix|bug|error|crash|broken)'; then
        echo "debug"
    elif echo "$req_lower" | grep -qE '(test|coverage|qa)'; then
        echo "test"
    elif echo "$req_lower" | grep -qE '(deploy|push|release|ship|ci|cd)'; then
        echo "deploy"
    elif echo "$req_lower" | grep -qE '(design|architect|plan|schema)'; then
        echo "design"
    else
        echo "general"
    fi
}

# Generate suggestions based on request type
generate_suggestions() {
    local request="$1"
    local req_type="$2"
    local keywords="$3"

    case "$req_type" in
        feature)
            echo "### Feature Request Suggestions"
            echo "- Check existing architecture before adding: $(python3 "$MEM0_SCRIPT" list --category architecture --limit 2 2>/dev/null | head -2)"
            echo "- Review related decisions: $(python3 "$MEM0_SCRIPT" list --category decisions --limit 2 2>/dev/null | head -2)"
            ;;
        review)
            echo "### Code Review Suggestions"
            echo "- Check quality standards: $(python3 "$MEM0_SCRIPT" search "quality standard" --limit 1 --format compact 2>/dev/null | head -1)"
            echo "- Review recent changes: $(python3 "$MEM0_SCRIPT" list --category session --limit 2 2>/dev/null | head -2)"
            ;;
        debug)
            echo "### Debugging Suggestions"
            echo "- Check known blockers: $(python3 "$MEM0_SCRIPT" list --category blockers --limit 2 2>/dev/null | head -2)"
            echo "- Review related errors: $(python3 "$MEM0_SCRIPT" search "error exception" --limit 1 --format compact 2>/dev/null | head -1)"
            ;;
        test)
            echo "### Testing Suggestions"
            echo "- Check test coverage patterns: $(python3 "$MEM0_SCRIPT" search "test coverage" --limit 1 --format compact 2>/dev/null | head -1)"
            ;;
        deploy)
            echo "### Deployment Suggestions"
            echo "- Check deploy history: $(python3 "$MEM0_SCRIPT" search "deploy pipeline" --limit 1 --format compact 2>/dev/null | head -1)"
            ;;
        design)
            echo "### Design/Architecture Suggestions"
            echo "- Review architecture decisions: $(python3 "$MEM0_SCRIPT" list --category architecture --limit 2 2>/dev/null | head -2)"
            ;;
        *)
            echo "### General Suggestions"
            ;;
    esac
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
    local request="${1:-}"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  MEMORY SUGGESTIONS — Proactive Context"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    check_deps || return 1

    if [[ -z "$request" ]]; then
        warn "No request provided"
        return
    fi

    local keywords
    keywords=$(extract_keywords "$request")
    info "Request: $request"
    info "Keywords: $keywords"

    local req_type
    req_type=$(classify_request "$request")
    info "Request type: $req_type"

    # Load conventions
    echo ""
    echo "### Code Conventions"
    load_conventions
    echo ""

    # Check blockers
    echo ""
    echo "### Active Blockers"
    detect_blockers
    echo ""

    # Generate targeted suggestions
    echo ""
    generate_suggestions "$request" "$req_type" "$keywords"
    echo ""

    # Suggest relevant memories
    echo ""
    echo "### Top Relevant Memories"
    python3 "$MEM0_SCRIPT" search "$keywords" --limit 3 --format compact 2>/dev/null
    echo ""

    # Suggest related decisions
    echo ""
    echo "### Related Decisions"
    python3 "$MEM0_SCRIPT" list --category decisions --limit 5 2>/dev/null | \
        while IFS= read -r line; do
            if echo "$line" | grep -qi "$keywords"; then
                echo "$line"
            fi
        done | head -5
    echo ""

    info "Suggestions complete"
}

main "$@"
