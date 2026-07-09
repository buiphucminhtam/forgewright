#!/usr/bin/env bash
# checkpoint-extract.sh — Semantic Checkpoint Extraction for Forgewright
# Extracts WHY, not just WHAT — key decisions, blockers, architectural choices
# Usage: bash checkpoint-extract.sh [--reason "<reason>"] [--session "<session-id>"]
# Output: Structured JSON with semantic context for memory checkpointing

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
FORGEWRIGHT_DIR="${FORGEWRIGHT_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
SESSION_LOG="$FORGEWRIGHT_DIR/.forgewright/session-log.json"
MAX_FILES_SHOWN=10
# ── Helpers ──────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[checkpoint-extract]${NC} $1"; }
warn()  { echo -e "${YELLOW}[checkpoint-extract]${NC} WARNING: $1" >&2; }
die()   { echo -e "${RED}[checkpoint-extract]${NC} ERROR: $1" >&2; exit 1; }

# ── Git context extraction ────────────────────────────────────────────────

# Get list of changed files (staged + unstaged)
get_changed_files() {
    local files=()
    # Staged
    while IFS= read -r line; do
        files+=("$line")
    done < <(git diff --cached --name-only 2>/dev/null || true)
    # Unstaged
    while IFS= read -r line; do
        files+=("$line")
    done < <(git diff --name-only 2>/dev/null || true)
    # Untracked (new files)
    while IFS= read -r line; do
        files+=("$line")
    done < <(git ls-files --others --exclude-standard 2>/dev/null || true)

    printf '%s\n' "${files[@]}" | sort -u | head -"$MAX_FILES_SHOWN"
}

# Get diff stats
get_diff_stats() {
    local stats=""
    stats=$(git diff --stat --cached 2>/dev/null | tail -1 || true)
    if [[ -n "$stats" ]]; then
        echo "staged: $stats"
    fi
    stats=$(git diff --stat 2>/dev/null | tail -1 || true)
    if [[ -n "$stats" ]]; then
        echo "unstaged: $stats"
    fi
}

# Get recent commits for context
get_recent_commits() {
    git log --oneline -5 2>/dev/null || echo "No commits"
}

# Categorize files by type
categorize_files() {
    local files="$1"
    local categories="{}"
    local skills=0; local scripts=0; local docs=0; local configs=0; local tests=0; local other=0

    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        case "$f" in
            skills/*)              ((skills++)) ;;
            scripts/*)             ((scripts++)) ;;
            *.md|docs/*)           ((docs++)) ;;
            .claude/*|*.yml|*.yaml|*.json) ((configs++)) ;;
            *test*|*spec*)        ((tests++)) ;;
            *)                     ((other++)) ;;
        esac
    done < <(echo "$files")

    python3 -c "
import json, sys
cats = json.loads('$categories')
cats['skills'] = $skills
cats['scripts'] = $scripts
cats['docs'] = $docs
cats['configs'] = $configs
cats['tests'] = $tests
cats['other'] = $other
print(json.dumps(cats, indent=2))
" 2>/dev/null || echo '{"skills":0,"scripts":0,"docs":0,"configs":0,"tests":0,"other":0}'
}

# Extract semantic intent from diff
# Looks for patterns that indicate what kind of change was made
extract_change_intent() {
    local staged_diff staged_lines
    staged_diff=$(git diff --cached 2>/dev/null | head -100 || true)
    staged_lines=$(git diff --cached 2>/dev/null | grep '^+' | grep -v '^+++' | wc -l | tr -d ' ' || echo 0)

    local intent="modified"
    local detail=""

    if [[ "$staged_lines" == "0" ]]; then
        intent="no staged changes"
        detail="only unstaged changes"
    elif echo "$staged_diff" | grep -q "Step 0\."; then
        intent="pipeline enhancement"
        detail="improved request interpretation or memory retrieval"
    elif echo "$staged_diff" | grep -q "memory\|mem0\|checkpoint\|session"; then
        intent="memory system improvement"
        detail="enhanced memory persistence or retrieval"
    elif echo "$staged_diff" | grep -q "hook\|trigger\|automation"; then
        intent="automation/hook"
        detail="added automated trigger or hook"
    elif echo "$staged_diff" | grep -q "search\|retrieve\|index\|FTS"; then
        intent="search/retrival"
        detail="improved search or information retrieval"
    elif echo "$staged_diff" | grep -q "skill\|SKILL\.md"; then
        intent="skill enhancement"
        detail="updated or added skill documentation"
    elif echo "$staged_diff" | grep -q "protocol\|PLAN\|scoring\|criteria"; then
        intent="process improvement"
        detail="updated planning or quality protocol"
    elif echo "$staged_diff" | grep -q "test\|qa\|coverage"; then
        intent="test coverage"
        detail="added or updated tests"
    fi

    echo "$intent|$detail"
}

# Get session mode from session-log
get_session_mode() {
    if [[ -f "$SESSION_LOG" ]]; then
        python3 -c "
import json, sys
try:
    data = json.load(open('$SESSION_LOG'))
    sessions = data.get('sessions', [])
    active = [s for s in sessions if s.get('status') == 'in_progress']
    if active:
        print(active[-1].get('mode', 'unknown'))
    else:
        completed = [s for s in sessions if s.get('status') == 'completed']
        if completed:
            print(completed[-1].get('mode', 'unknown'))
        else:
            print('unknown')
except:
    print('unknown')
" 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

# Get last session summary
get_last_session_summary() {
    if [[ -f "$SESSION_LOG" ]]; then
        python3 -c "
import json, sys
try:
    data = json.load(open('$SESSION_LOG'))
    sessions = data.get('sessions', [])
    completed = [s for s in sessions if s.get('status') == 'completed']
    if completed:
        s = completed[-1]
        print(s.get('summary', '') or f\"Session {s.get('session_id')} completed\")
except:
    print('')
" 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
    local reason=""
    local session_id=""

    # Parse optional args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --reason)
                reason="${2:-}"
                shift 2
                ;;
            --session)
                session_id="${2:-}"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    local changed_files
    changed_files=$(get_changed_files)

    local diff_stats
    diff_stats=$(get_diff_stats)

    local change_intent
    change_intent=$(extract_change_intent)
    local intent="${change_intent%%|*}"
    local intent_detail="${change_intent#*|}"

    local file_categories
    file_categories=$(categorize_files "$changed_files")

    local session_mode
    session_mode=$(get_session_mode)

    local session_summary
    session_summary=$(get_last_session_summary)

    local recent_commits
    recent_commits=$(get_recent_commits)

    # Count total changes
    local total_changed
    total_changed=$(echo "$changed_files" | wc -l | tr -d ' ')

    # Build structured output
    python3 -c "
import json, sys, os
from datetime import datetime, timezone

data = {
    'checkpoint_id': f\"cp-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}\",
    'timestamp': datetime.now(timezone.utc).isoformat() + 'Z',
    'session_mode': '$session_mode',
    'reason': '$reason',
    'intent': '$intent',
    'intent_detail': '$intent_detail',
    'file_counts': json.loads('''$file_categories'''),
    'total_files_changed': $total_changed,
    'files': '''$changed_files'''.split('\n')[:$MAX_FILES_SHOWN],
    'diff_stats': '''$diff_stats'''.strip(),
    'recent_commits': '''$recent_commits'''.strip(),
    'session_summary': '''$session_summary'''.strip(),
    'workspace': os.getcwd()
}
print(json.dumps(data, indent=2, default=str))
" 2>/dev/null
}

main "$@"
