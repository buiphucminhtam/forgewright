#!/usr/bin/env bash
set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Forgewright Local Memory Manager
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Zero-dependency local-first memory. Falls back to Mem0 if configured.
#
# Usage:
#   memory-local.sh add <text> [--category cat]   — add memory
#   memory-local.sh search <query> [--limit N]    — search memories
#   memory-local.sh list [--limit N]              — list all memories
#   memory-local.sh refresh                       — re-read project files
#   memory-local.sh clear                         — clear all memories
#   memory-local.sh help                          — show this help
#
# Storage: .forgewright/memory.json
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORGEWRIGHT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -d "$FORGEWRIGHT_DIR/.forgewright" ]]; then
  PROJECT_ROOT="$FORGEWRIGHT_DIR"
elif [[ -d "$FORGEWRIGHT_DIR/../.forgewright" ]]; then
  PROJECT_ROOT="$(cd "$FORGEWRIGHT_DIR/.." && pwd)"
else
  PROJECT_ROOT="$(pwd)"
fi

WORKSPACE="$PROJECT_ROOT/.forgewright"
MEMORY_FILE="$WORKSPACE/memory.json"
MEM0_CLI="$SCRIPT_DIR/mem0-cli.py"

mkdir -p "$WORKSPACE"

# ── Check Mem0 availability ───────────────────────────
use_mem0() {
  [[ -n "${MEM0_API_KEY:-}" ]] && [[ -f "$MEM0_CLI" ]]
}

# ── Ensure memory file ────────────────────────────────
ensure_memory() {
  if [[ ! -f "$MEMORY_FILE" ]]; then
    echo '{"memories":[]}' > "$MEMORY_FILE"
  fi
}

# ── Add ───────────────────────────────────────────────
cmd_add() {
  local text=""
  local category="general"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --category) category="$2"; shift 2 ;;
      *)          text="$text $1"; shift ;;
    esac
  done
  text=$(echo "$text" | xargs)  # trim

  if [[ -z "$text" ]]; then
    echo "Usage: memory-local.sh add <text> [--category cat]"
    exit 1
  fi

  # Delegate to Mem0 if available
  if use_mem0; then
    python3 "$MEM0_CLI" add "$text" --category "$category"
    return
  fi

  ensure_memory

  node -e "
    const fs = require('fs');
    const mem = JSON.parse(fs.readFileSync('$MEMORY_FILE', 'utf8'));
    mem.memories.push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      text: $(node -e "console.log(JSON.stringify('$text'))" 2>/dev/null),
      category: '$category',
      created_at: new Date().toISOString(),
      keywords: $(node -e "
        const text = '$text'.toLowerCase();
        const stop = new Set(['the','a','an','is','was','are','were','be','been','to','of','and','in','for','on','with','at','by','from','this','that','it','as','or','but','not','no','has','had','have','do','does','did','will','would','could','should','may','might','can']);
        const words = text.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w));
        console.log(JSON.stringify([...new Set(words)]));
      " 2>/dev/null)
    });
    
    // Keep max 200 memories (FIFO)
    if (mem.memories.length > 200) {
      mem.memories = mem.memories.slice(-200);
    }
    
    fs.writeFileSync('$MEMORY_FILE', JSON.stringify(mem, null, 2));
  "

  echo "✓ Memory added ($category): $text"
}

# ── Search ────────────────────────────────────────────
cmd_search() {
  local query=""
  local limit=5

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --limit) limit="$2"; shift 2 ;;
      *)       query="$query $1"; shift ;;
    esac
  done
  query=$(echo "$query" | xargs)

  if [[ -z "$query" ]]; then
    echo "Usage: memory-local.sh search <query> [--limit N]"
    exit 1
  fi

  if use_mem0; then
    python3 "$MEM0_CLI" search "$query" --limit "$limit" --format compact
    return
  fi

  ensure_memory

  node -e "
    const fs = require('fs');
    const mem = JSON.parse(fs.readFileSync('$MEMORY_FILE', 'utf8'));
    const query = '$query'.toLowerCase();
    const queryWords = query.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    
    // Score each memory by keyword overlap
    const scored = mem.memories.map(m => {
      const keywords = m.keywords || [];
      const textLower = m.text.toLowerCase();
      let score = 0;
      
      // Keyword match
      for (const qw of queryWords) {
        if (keywords.includes(qw)) score += 2;
        if (textLower.includes(qw)) score += 1;
      }
      
      // Exact phrase match bonus
      if (textLower.includes(query)) score += 5;
      
      return { ...m, score };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, $limit);
    
    if (scored.length === 0) {
      console.log('No matching memories found.');
      process.exit(0);
    }
    
    scored.forEach((m, i) => {
      console.log((i+1) + '. [' + m.category + '] ' + m.text);
      console.log('   (' + m.created_at.split('T')[0] + ', relevance: ' + m.score + ')');
    });
  "
}

# ── List ──────────────────────────────────────────────
cmd_list() {
  local limit=20
  [[ $# -gt 0 && "$1" == "--limit" ]] && limit="$2"

  ensure_memory

  node -e "
    const fs = require('fs');
    const mem = JSON.parse(fs.readFileSync('$MEMORY_FILE', 'utf8'));
    const items = mem.memories.slice(-$limit);
    
    if (items.length === 0) {
      console.log('No memories stored yet.');
      process.exit(0);
    }
    
    console.log('Memories (' + mem.memories.length + ' total, showing last $limit):');
    console.log('');
    items.forEach((m, i) => {
      console.log((i+1) + '. [' + m.category + '] ' + m.text);
      console.log('   ' + m.created_at);
    });
  "
}

# ── Refresh ───────────────────────────────────────────
cmd_refresh() {
  echo "⧖ Refreshing memory from project files..."

  ensure_memory

  # Read key project files and add as context
  local project_name
  project_name=$(basename "$PROJECT_ROOT")

  if [[ -f "$WORKSPACE/project-profile.json" ]]; then
    local lang framework arch
    lang=$(node -e "console.log(require('$WORKSPACE/project-profile.json').fingerprint?.language || 'unknown')" 2>/dev/null || echo "unknown")
    framework=$(node -e "console.log(require('$WORKSPACE/project-profile.json').fingerprint?.framework || 'unknown')" 2>/dev/null || echo "unknown")
    arch=$(node -e "console.log(require('$WORKSPACE/project-profile.json').fingerprint?.architecture || 'unknown')" 2>/dev/null || echo "unknown")
    cmd_add "Project $project_name: $lang, $framework, $arch architecture" --category context
  fi

  if [[ -f "$WORKSPACE/code-conventions.md" ]]; then
    local conventions
    conventions=$(head -5 "$WORKSPACE/code-conventions.md" | tr '\n' ' ')
    cmd_add "Code conventions: $conventions" --category context
  fi

  if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    local deps_count
    deps_count=$(node -e "const p=require('$PROJECT_ROOT/package.json');console.log(Object.keys(p.dependencies||{}).length+Object.keys(p.devDependencies||{}).length)" 2>/dev/null || echo "0")
    cmd_add "Project has $deps_count npm dependencies" --category context
  fi

  echo "✓ Memory refreshed"
}

# ── Clear ─────────────────────────────────────────────
cmd_clear() {
  echo '{"memories":[]}' > "$MEMORY_FILE"
  echo "✓ All memories cleared"
}

# ── Dispatch ──────────────────────────────────────────
CMD="${1:-help}"
shift || true

case "$CMD" in
  add)     cmd_add "$@" ;;
  search)  cmd_search "$@" ;;
  list)    cmd_list "$@" ;;
  refresh) cmd_refresh ;;
  clear)   cmd_clear ;;
  help)    head -17 "$0" | tail -13 ;;
  *)       echo "Unknown: $CMD. Run: memory-local.sh help"; exit 1 ;;
esac
