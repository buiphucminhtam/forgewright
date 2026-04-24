#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Ensures Forgewright local memory is initialized
# Uses ChromaDB + sentence-transformers (local, no API needed)
#
# Usage (from host project):
#   bash <path-to-forgewright>/scripts/ensure-mem0.sh [PROJECT_ROOT]
#   ./forgewright/scripts/ensure-mem0.sh
#
# If PROJECT_ROOT is omitted: same resolution as mcp-generate.sh (sibling of
# this repo with a .git, else this repo root).
#
# Skip (CI / headless only): FORGEWRIGHT_SKIP_MEMORY=1
# ─────────────────────────────────────────────────────────

set -euo pipefail

if [ "${FORGEWRIGHT_SKIP_MEMORY:-}" = "1" ]; then
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

MEMORY_DB="${PROJECT_ROOT}/.forgewright/memory_db"
LOCAL_MEMORY_CLI="${FORGEWRIGHT_DIR}/scripts/local_memory.py"

# Check if memory DB already exists
if [ -d "$MEMORY_DB" ]; then
  exit 0
fi

if ! command -v python3 &>/dev/null; then
  echo "[Forgewright] Local memory requires python3. Install Python 3 and re-run:" >&2
  echo "  bash ${FORGEWRIGHT_DIR}/scripts/ensure-mem0.sh" >&2
  exit 1
fi

# Install dependencies
echo "[Forgewright] Setting up local memory (ChromaDB + sentence-transformers)..." >&2
pip3 install --quiet chromadb sentence-transformers torch 2>/dev/null || true

# Initialize by running stats (creates the DB)
cd "$PROJECT_ROOT"
python3 "$LOCAL_MEMORY_CLI" stats &>/dev/null || true

if [ ! -d "$MEMORY_DB" ]; then
  echo "[Forgewright] Memory setup did not create ${MEMORY_DB}" >&2
  exit 1
fi

echo "[Forgewright] Local memory initialized (.forgewright/memory_db)" >&2
