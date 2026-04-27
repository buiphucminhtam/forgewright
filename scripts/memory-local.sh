#!/usr/bin/env bash
set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Forgewright Memory CLI Wrapper
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# ⚠️  DEPRECATED — This wrapper is deprecated as of v8.0.
#
# Please use `mem0-v2.py` directly:
#   python3 scripts/mem0-v2.py add <text> [--category cat]
#   python3 scripts/mem0-v2.py search <query> [--limit N]
#   python3 scripts/mem0-v2.py list [--limit N]
#   python3 scripts/mem0-v2.py stats
#
# For migration from old systems:
#   python3 scripts/mem0-v2.py migrate          # JSONL → SQLite
#   python3 scripts/migrate-chroma-to-sqlite.py  # ChromaDB → SQLite
#
# Storage: .forgewright/memory.db (SQLite + FTS5)
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

MEMORY_CLI="$SCRIPT_DIR/mem0-v2.py"

# Skip if disabled
if [[ "${MEM0_DISABLED:-}" = "true" ]]; then
  echo "Memory disabled (MEM0_DISABLED=true)"
  exit 0
fi

# ── Help ──────────────────────────────────────────────
show_help() {
  echo "Forgewright Memory CLI (mem0-v2.py wrapper)"
  echo ""
  echo "⚠️  DEPRECATED — Please use mem0-v2.py directly"
  echo ""
  echo "Usage:"
  echo "  memory-local.sh add <text> [--category cat]   — add memory"
  echo "  memory-local.sh search <query> [--limit N]  — search memories"
  echo "  memory-local.sh list [--limit N]             — list memories"
  echo "  memory-local.sh stats                        — show stats"
  echo ""
  echo "Recommended (v8.0+):"
  echo "  python3 scripts/mem0-v2.py add <text> --category <cat>"
  echo "  python3 scripts/mem0-v2.py search <query> --limit N"
}

# ── Add ───────────────────────────────────────────────
cmd_add() {
  local text=""
  local category="general"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --category) category="$2"; shift 2 ;;
      --help)     show_help; exit 0 ;;
      *)          text="$text $1"; shift ;;
    esac
  done
  text=$(echo "$text" | xargs)  # trim

  if [[ -z "$text" ]]; then
    show_help
    exit 1
  fi

  cd "$PROJECT_ROOT"
  python3 "$MEMORY_CLI" add "$text" --category "$category"
}

# ── Search ────────────────────────────────────────────
cmd_search() {
  local query=""
  local limit=5

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --limit) limit="$2"; shift 2 ;;
      --help)  show_help; exit 0 ;;
      *)       query="$query $1"; shift ;;
    esac
  done
  query=$(echo "$query" | xargs)

  if [[ -z "$query" ]]; then
    show_help
    exit 1
  fi

  cd "$PROJECT_ROOT"
  python3 "$MEMORY_CLI" search "$query" --limit "$limit"
}

# ── List ──────────────────────────────────────────────
cmd_list() {
  local limit=20
  local category=""
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --limit)    limit="$2"; shift 2 ;;
      --category) category="$2"; shift 2 ;;
      --help)     show_help; exit 0 ;;
      *)          shift ;;
    esac
  done

  cd "$PROJECT_ROOT"
  if [[ -n "$category" ]]; then
    python3 "$MEMORY_CLI" list --category "$category" --limit "$limit"
  else
    python3 "$MEMORY_CLI" list --limit "$limit"
  fi
}

# ── Stats ─────────────────────────────────────────────
cmd_stats() {
  cd "$PROJECT_ROOT"
  python3 "$MEMORY_CLI" stats
}

# ── Dispatch ──────────────────────────────────────────
CMD="${1:-help}"
shift || true

case "$CMD" in
  add)     cmd_add "$@" ;;
  search)  cmd_search "$@" ;;
  list)    cmd_list "$@" ;;
  stats)   cmd_stats ;;
  help)    show_help ;;
  *)       echo "Unknown: $CMD. Run: memory-local.sh help"; exit 1 ;;
esac
