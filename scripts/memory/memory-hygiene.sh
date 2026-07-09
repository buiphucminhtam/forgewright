#!/usr/bin/env bash
# memory-hygiene.sh — Memory Maintenance: GC + Deduplication + Archive
# Usage: bash memory-hygiene.sh [--dry-run] [--max-obs <N>]
# Runs garbage collection, deduplication, and archival on mem0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEM0_SCRIPT="$SCRIPT_DIR/mem0-v2.py"
DRY_RUN=false
MAX_OBS="${MEM0_MAX_OBS:-200}"

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --max-obs)
            # handled below
            ;;
    esac
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Memory Hygiene — Maintenance & Cleanup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show stats before
echo "=== Before Hygiene ==="
python3 "$MEM0_SCRIPT" stats 2>/dev/null | grep -v "^$" || echo "(no stats)"

if [[ "$DRY_RUN" == "true" ]]; then
    echo ""
    echo "[DRY RUN] Skipping actual cleanup"
    echo ""
fi

# Step 1: GC
echo ""
echo "=== Step 1: Garbage Collection ==="
if [[ "$DRY_RUN" == "false" ]]; then
    result=$(python3 "$MEM0_SCRIPT" gc --max-obs "$MAX_OBS" 2>&1)
    echo "$result"
else
    echo "[DRY RUN] Would run: mem0-v2.py gc --max-obs $MAX_OBS"
fi

# Step 2: Check for potential duplicates
echo ""
echo "=== Step 2: Duplicate Analysis ==="
python3 -c "
import subprocess, json
from collections import Counter

result = subprocess.run(['python3', '$MEM0_SCRIPT', 'list', '--limit', '500'], capture_output=True, text=True)
lines = [l.strip() for l in result.stdout.split('\n') if l.strip() and '[' in l]

titles = []
for line in lines:
    # Extract title from '  [id] [category] title...' format
    parts = line.split(']', 1)
    if len(parts) > 1:
        title = parts[1].strip()[:60]
        titles.append(title)

# Find similar titles (rough dedup)
from difflib import SequenceMatcher
similar = []
seen = []
for t in titles:
    for s in seen:
        if SequenceMatcher(None, t.lower(), s.lower()).ratio() > 0.85:
            similar.append((s, t, round(SequenceMatcher(None, t.lower(), s.lower()).ratio(), 2)))
            break
    seen.append(t)

if similar:
    print(f'Found {len(similar)} potentially duplicate observations:')
    for a, b, score in similar[:10]:
        print(f'  ({score:.0%} similar): \"{a}\" vs \"{b}\"')
else:
    print('No near-duplicates found.')
" 2>/dev/null || echo "(skipping duplicate analysis)"

# Step 3: Archive very old sessions
echo ""
echo "=== Step 3: Old Session Cleanup ==="
if [[ "$DRY_RUN" == "false" ]]; then
    result=$(python3 -c "
import subprocess, json
from datetime import datetime, timezone, timedelta

result = subprocess.run(['python3', '$MEM0_SCRIPT', 'list', '--category', 'session', '--limit', '100'], capture_output=True, text=True)
lines = [l.strip() for l in result.stdout.split('\n') if l.strip() and '[' in l]

# Count old sessions (>30 days)
old_count = 0
for line in lines:
    # Extract timestamp if present
    if '2026' in line or '2025' in line:
        old_count += 1

if old_count > 20:
    print(f'Old sessions: {old_count} (consider running: mem0-v2.py gc --category session --older-than 30d)')
else:
    print(f'Old sessions: {old_count} (OK)')
" 2>/dev/null)
    echo "$result"
else
    echo "[DRY RUN] Would analyze old sessions"
fi

# Show stats after
echo ""
echo "=== After Hygiene ==="
if [[ "$DRY_RUN" == "false" ]]; then
    python3 "$MEM0_SCRIPT" stats 2>/dev/null | grep -v "^$" || echo "(no stats)"
else
    echo "[DRY RUN] Stats would be updated"
fi

echo ""
echo "Hygiene complete."
echo "Next: Run this weekly via cron: 0 2 * * 0 cd <project> && bash scripts/memory-hygiene.sh"
