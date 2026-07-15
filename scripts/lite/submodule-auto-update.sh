#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Forgewright Submodule Auto-Updater Hook
# Tự động kiểm tra và pull bản cập nhật mới nhất khi Forgewright là submodule
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FW_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$FW_ROOT"

SUPERPROJECT="$(git rev-parse --show-superproject-working-tree 2>/dev/null || true)"
if [[ -z "$SUPERPROJECT" ]]; then
    exit 0
fi

LOCK_FILE="$(git rev-parse --git-path forgewright-auto-update.lock)"
if [[ "$LOCK_FILE" != /* ]]; then
    LOCK_FILE="$FW_ROOT/$LOCK_FILE"
fi
OWNER_FILE="${LOCK_FILE}.owner.$$"
printf '%s\n' "$$" > "$OWNER_FILE"
if ! ln "$OWNER_FILE" "$LOCK_FILE" 2>/dev/null; then
    LOCK_PID="$(cat "$LOCK_FILE" 2>/dev/null || true)"
    if [[ "$LOCK_PID" =~ ^[0-9]+$ ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
        rm -f "$OWNER_FILE"
        exit 0
    fi
    STALE_FILE="${LOCK_FILE}.stale.$$"
    if ! mv "$LOCK_FILE" "$STALE_FILE" 2>/dev/null; then
        rm -f "$OWNER_FILE"
        exit 0
    fi
    echo "⚠️ [Forgewright] Đã thu hồi stale lock từ lần chạy trước." >&2
    if ! ln "$OWNER_FILE" "$LOCK_FILE" 2>/dev/null; then
        rm -f "$OWNER_FILE" "$STALE_FILE"
        exit 0
    fi
    rm -f "$STALE_FILE"
fi
rm -f "$OWNER_FILE"
cleanup() {
    local lock_pid
    lock_pid="$(cat "$LOCK_FILE" 2>/dev/null || true)"
    if [[ "$lock_pid" == "$$" ]]; then
        rm -f "$LOCK_FILE"
    fi
}
trap cleanup EXIT HUP INT TERM

if ! git fetch origin main -q; then
    echo "⚠️ [Forgewright] Không thể kiểm tra origin/main; giữ nguyên phiên bản hiện tại." >&2
    exit 0
fi

LOCAL="$(git rev-parse HEAD 2>/dev/null || true)"
REMOTE="$(git rev-parse origin/main 2>/dev/null || true)"
if [[ -z "$LOCAL" || -z "$REMOTE" || "$LOCAL" == "$REMOTE" ]]; then
    exit 0
fi

echo "🔄 [Forgewright] Phát hiện bản cập nhật mới từ remote. Đang tiến hành auto-update..."
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
    echo "⚠️ [Forgewright] Bỏ qua auto-update vì submodule có thay đổi cục bộ chưa commit." >&2
    exit 0
fi
if ! git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
    echo "⚠️ [Forgewright] Bỏ qua auto-update vì local HEAD đã phân kỳ với origin/main." >&2
    exit 0
fi
if ! git merge --ff-only -q "$REMOTE"; then
    echo "❌ [Forgewright] Không thể fast-forward submodule đến origin/main." >&2
    exit 1
fi

NEW_HEAD="$(git rev-parse HEAD)"
echo "✅ [Forgewright] Đã tự động cập nhật submodule lên ${NEW_HEAD:0:8}."

INSTALLER="$FW_ROOT/scripts/forgewright-install.sh"
DOCTOR="$FW_ROOT/scripts/forgewright-hook-doctor.sh"
MCP_SETUP="$FW_ROOT/scripts/forgewright-mcp-setup.sh"

if [[ -x "$INSTALLER" ]]; then
    if ! FORGEWRIGHT_SOURCE_DIR="$FW_ROOT" bash "$INSTALLER" \
        --profile minimal --yes --skip-mcp --skip-skills --skip-config; then
        echo "❌ [Forgewright] Code đã cập nhật nhưng không refresh được global hook runtime." >&2
        exit 1
    fi
fi
if [[ -x "$DOCTOR" ]]; then
    if ! bash "$DOCTOR" --quick --fix; then
        echo "⚠️ [Forgewright] Doctor còn cảnh báo; hãy chạy lại doctor thủ công để xem chi tiết." >&2
    fi
fi
if [[ -x "$MCP_SETUP" ]]; then
    if ! (cd "$SUPERPROJECT" && bash "$MCP_SETUP" --force); then
        echo "⚠️ [Forgewright] MCP refresh thất bại; code và policy hook vẫn đã được cập nhật." >&2
    fi
fi

echo "💡 Parent repo cần commit con trỏ submodule mới: $SUPERPROJECT"
