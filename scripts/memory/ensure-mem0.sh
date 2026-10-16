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

if [[ "${MEM0_DISABLED:-}" =~ ^(true|1|yes)$ ]] || [[ "${FORGEWRIGHT_SKIP_MEM0:-}" =~ ^(true|1|yes)$ ]]; then
  echo "[Forgewright] Optional memory disabled; no initialization." >&2
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [ -n "${1:-}" ]; then
  PROJECT_ROOT="$(cd "$1" && pwd)"
else
  if [ -f "${FORGEWRIGHT_DIR}/../.git" ] || [ -d "${FORGEWRIGHT_DIR}/../.git" ]; then
    PROJECT_ROOT="$(cd "${FORGEWRIGHT_DIR}/.." && pwd)"
  else
    PROJECT_ROOT="$FORGEWRIGHT_DIR"
  fi
fi

MEMORY_SCRIPT="${FORGEWRIGHT_DIR}/scripts/memory/mem0-v2.py"
if ! command -v python3 &>/dev/null; then
  echo "[Forgewright] Optional memory unavailable: Python 3 missing." >&2
  exit 1
fi
MEMORY_DB=$(FORGEWRIGHT_WORKSPACE="$PROJECT_ROOT" python3 -c 'import sys; sys.path.insert(0,sys.argv[1]); from memory_common import database_path; print(database_path())' "$SCRIPT_DIR")
if [ -f "$MEMORY_DB" ]; then
  if FORGEWRIGHT_WORKSPACE="$PROJECT_ROOT" python3 "$MEMORY_SCRIPT" doctor --json |
      python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin)["storage"]["status"] == "ready" else 1)'; then
    exit 0
  fi
  echo "[Forgewright] Existing memory requires explicit maintenance; no migration was performed." >&2
  exit 1
fi

# Initialize memory (creates the DB)
cd "$PROJECT_ROOT"
if ! FORGEWRIGHT_WORKSPACE="$PROJECT_ROOT" python3 "$MEMORY_SCRIPT" setup; then
  echo "[Forgewright] ERROR: Memory database setup failed." >&2
  exit 1
fi

if [ ! -f "$MEMORY_DB" ]; then
  echo "[Forgewright] ERROR: Memory setup did not create ${MEMORY_DB}" >&2
  exit 1
fi

# Ensure SQLite memory and GitNexus files are gitignored in target project
GITIGNORE_FILE="${PROJECT_ROOT}/.gitignore"
if [ -f "$GITIGNORE_FILE" ]; then
  if ! grep -q "memory.db\*" "$GITIGNORE_FILE"; then
    echo -e "\n# Forgewright local binary memory databases\n.forgewright/memory.db*" >> "$GITIGNORE_FILE"
  fi
  if ! grep -q "gitnexus/" "$GITIGNORE_FILE"; then
    echo -e "\n# GitNexus local index databases and code intelligence\n.gitnexus/\n.forgenexus/" >> "$GITIGNORE_FILE"
  fi
else
  echo -e "# Forgewright local binary memory databases\n.forgewright/memory.db*\n\n# GitNexus local index databases and code intelligence\n.gitnexus/\n.forgenexus/" > "$GITIGNORE_FILE"
fi

echo "[Forgewright] Memory initialized (.forgewright/memory.db)" >&2
