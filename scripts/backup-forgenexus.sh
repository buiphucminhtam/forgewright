#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# backup-forgenexus.sh — Backup ForgeNexus index
#
# Usage:
#   ./scripts/backup-forgenexus.sh [project_path]
# ─────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_PATH="${1:-$(pwd)}"
FORGENEXUS_DIR="${PROJECT_PATH}/.forgenexus"
BACKUP_DIR="${PROJECT_PATH}/.forgenexus-backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "Backing up ForgeNexus index..."
echo "  Source: ${FORGENEXUS_DIR}"
echo "  Backup: ${BACKUP_DIR}"

# Check if index exists
if [[ ! -d "$FORGENEXUS_DIR" ]]; then
    echo "❌ No .forgenexus directory found at ${PROJECT_PATH}"
    exit 1
fi

# Create backup directory with timestamp
BACKUP_PATH="${BACKUP_DIR}_${TIMESTAMP}"
mkdir -p "$BACKUP_PATH"

# Copy index files
cp -r "$FORGENEXUS_DIR"/* "$BACKUP_PATH/" 2>/dev/null || true

# Also backup registry if exists
if [[ -f "${PROJECT_PATH}/.forgewright/registry.json" ]]; then
    mkdir -p "$BACKUP_PATH"
    cp "${PROJECT_PATH}/.forgewright/registry.json" "$BACKUP_PATH/" 2>/dev/null || true
fi

echo ""
echo "✅ Backup created at: ${BACKUP_PATH}"
echo ""
echo "To restore this backup:"
echo "  cp -r ${BACKUP_PATH}/* ${FORGENEXUS_DIR}/"
echo ""
echo "To list all backups:"
echo "  ls -la ${BACKUP_DIR}_* | head -10"
