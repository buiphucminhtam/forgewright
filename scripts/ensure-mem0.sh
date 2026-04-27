#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Ensures Forgewright memory is initialized
# Uses SQLite + FTS5 (mem0-v2.py) — zero dependencies
#
# Usage (from host project):
#   bash <path-to-forgewright>/scripts/ensure-mem0.sh [PROJECT_ROOT]
#   ./forgewright/scripts/ensure-mem0.sh
#
# If PROJECT_ROOT is omitted: same resolution as mcp-generate.sh (sibling of
# this repo with a .git, else this repo root).
#
# Skip (CI / headless only): MEM0_DISABLED=true
# ─────────────────────────────────────────────────────────

set -euo pipefail

if [ "${MEM0_DISABLED:-}" = "true" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -n "${1:-}" ]; then
  PROJECT_ROOT="$(cd "$1" && pwd)"
else
  if [ -f "${FORGEWRIGHT_DIR}/../.git" ] || [ -d "${FORGEWRIGHT_DIR}/../.git" ]; then
    PROJECT_ROOT="$(cd "${FORGEWRIGHT_DIR}/.." && pwd)"
  else
    PROJECT_ROOT="$FORGEWRIGHT_DIR"
  fi
fi

MEMORY_DB="${PROJECT_ROOT}/.forgewright/memory.db"
MEMORY_SCRIPT="${FORGEWRIGHT_DIR}/scripts/mem0-v2.py"

# Check if memory DB already exists
if [ -f "$MEMORY_DB" ]; then
  exit 0
fi

if ! command -v python3 &>/dev/null; then
  echo "[Forgewright] Memory requires python3. Install Python 3 and re-run:" >&2
  echo "  bash ${FORGEWRIGHT_DIR}/scripts/ensure-mem0.sh" >&2
  exit 1
fi

# Initialize memory (creates the DB)
cd "$PROJECT_ROOT"
python3 "$MEMORY_SCRIPT" setup &>/dev/null || true

if [ ! -f "$MEMORY_DB" ]; then
  echo "[Forgewright] Memory setup did not create ${MEMORY_DB}" >&2
  exit 1
fi

echo "[Forgewright] Memory initialized (.forgewright/memory.db)" >&2
