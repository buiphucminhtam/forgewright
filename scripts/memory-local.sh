#!/usr/bin/env bash
set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Forgewright Local Memory Manager
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Uses ChromaDB + sentence-transformers for fully local operation.
# No API key required.
#
# Usage:
#   memory-local.sh add <text> [--category cat]   — add memory
#   memory-local.sh search <query> [--limit N]  — search memories
#   memory-local.sh list [--limit N]             — list memories
#   memory-local.sh stats                        — show stats
#   memory-local.sh clear                        — clear all memories
#   memory-local.sh help                         — show this help
#
# Storage: .forgewright/memory_db/ (ChromaDB)
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

LOCAL_MEMORY_CLI="$SCRIPT_DIR/local_memory.py"

# Skip if disabled
if [[ "${FORGEWRIGHT_SKIP_MEMORY:-}" = "1" ]]; then
  echo "Memory disabled (FORGEWRIGHT_SKIP_MEMORY=1)"
  exit 0
fi

# ── Help ──────────────────────────────────────────────
show_help() {
  head -17 "$0" | tail -14
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
  python3 "$LOCAL_MEMORY_CLI" add "$text" --category "$category"
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
  python3 "$LOCAL_MEMORY_CLI" search "$query" --limit "$limit"
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
    python3 "$LOCAL_MEMORY_CLI" list --category "$category" --limit "$limit"
  else
    python3 "$LOCAL_MEMORY_CLI" list --limit "$limit"
  fi
}

# ── Stats ─────────────────────────────────────────────
cmd_stats() {
  cd "$PROJECT_ROOT"
  python3 "$LOCAL_MEMORY_CLI" stats
}

# ── Clear ─────────────────────────────────────────────
cmd_clear() {
  cd "$PROJECT_ROOT"
  python3 "$LOCAL_MEMORY_CLI" clear
}

# ── Dispatch ──────────────────────────────────────────
CMD="${1:-help}"
shift || true

case "$CMD" in
  add)     cmd_add "$@" ;;
  search)  cmd_search "$@" ;;
  list)    cmd_list "$@" ;;
  stats)   cmd_stats ;;
  clear)   cmd_clear ;;
  help)    show_help ;;
  *)       echo "Unknown: $CMD. Run: memory-local.sh help"; exit 1 ;;
esac
