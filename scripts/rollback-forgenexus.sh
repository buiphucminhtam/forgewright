#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# rollback-forgenexus.sh — Restore ForgeNexus index from backup
#
# Usage:
#   ./scripts/rollback-forgenexus.sh [project_path] [backup_timestamp]
#
# If no backup_timestamp provided, lists available backups.
# ─────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_PATH="${1:-$(pwd)}"
BACKUP_TIMESTAMP="${2:-}"
BACKUP_DIR="${PROJECT_PATH}/.forgenexus-backup"
FORGENEXUS_DIR="${PROJECT_PATH}/.forgenexus"

# List available backups
list_backups() {
    echo ""
    echo "Available backups:"
    echo ""
    local count=0
    for backup in "${BACKUP_DIR}"_*; do
        if [[ -d "$backup" ]]; then
            local name=$(basename "$backup")
            local size=$(du -sh "$backup" 2>/dev/null | cut -f1)
            local date=$(echo "$name" | sed "s/.*_//" | sed 's/_/ /')
            echo "  $name  ($size)  $date"
            count=$((count + 1))
        fi
    done
    
    if [[ $count -eq 0 ]]; then
        echo "  No backups found."
        echo ""
        echo "To create a backup first:"
        echo "  ./scripts/backup-forgenexus.sh ${PROJECT_PATH}"
        exit 1
    fi
    echo ""
}

# No timestamp provided - show list
if [[ -z "$BACKUP_TIMESTAMP" ]]; then
    echo "No backup timestamp specified."
    list_backups
    
    echo "Usage:"
    echo "  ./scripts/rollback-forgenexus.sh [project_path] [backup_timestamp]"
    echo ""
    echo "Example:"
    echo "  ./scripts/rollback-forgenexus.sh /path/to/project 20240101_120000"
    exit 0
fi

BACKUP_PATH="${BACKUP_DIR}_${BACKUP_TIMESTAMP}"

# Check if backup exists
if [[ ! -d "$BACKUP_PATH" ]]; then
    echo "❌ Backup not found: ${BACKUP_PATH}"
    echo ""
    list_backups
    exit 1
fi

echo "Rolling back ForgeNexus index..."
echo "  Backup: ${BACKUP_PATH}"
echo "  Target: ${FORGENEXUS_DIR}"
echo ""

# Confirm
read -p "This will replace the current index. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Stop any running MCP servers
echo "Stopping any running ForgeNexus processes..."
pkill -f "forgenexus serve" 2>/dev/null || true
pkill -f "forgenexus mcp" 2>/dev/null || true
sleep 1

# Backup current index before replacing
if [[ -d "$FORGENEXUS_DIR" ]]; then
    echo "Backing up current index before rollback..."
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    mv "$FORGENEXUS_DIR" "${FORGENEXUS_DIR}_pre_rollback_${TIMESTAMP}"
fi

# Restore from backup
echo "Restoring from backup..."
cp -r "$BACKUP_PATH" "$FORGENEXUS_DIR"

echo ""
echo "✅ Rollback complete!"
echo ""
echo "Current index saved to: ${FORGENEXUS_DIR}_pre_rollback_${TIMESTAMP}"
echo ""
echo "To verify:"
echo "  forgenexus status"
