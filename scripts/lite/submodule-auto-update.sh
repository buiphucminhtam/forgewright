#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Forgewright Submodule Auto-Updater Hook
# Tự động kiểm tra và pull bản cập nhật mới nhất khi Forgewright là submodule
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FW_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$FW_ROOT"

# 1. Kiểm tra xem Forgewright có đang chạy dưới dạng submodule không
SUPERPROJECT=$(git rev-parse --show-superproject-working-tree 2>/dev/null || true)

if [ -z "$SUPERPROJECT" ]; then
    # Không phải submodule, thoát lặng lẽ
    exit 0
fi

# 2. Fetch origin để kiểm tra bản cập nhật (chạy nhanh, không hiển thị output)
git fetch origin main -q >/dev/null 2>&1 || true

LOCAL=$(git rev-parse HEAD 2>/dev/null || true)
REMOTE=$(git rev-parse origin/main 2>/dev/null || true)

# 3. So sánh commit
if [ -n "$LOCAL" ] && [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
    echo "🔄 [Forgewright] Phát hiện bản cập nhật mới từ remote. Đang tiến hành auto-update..."
    
    # 3.1 Đảm bảo không có thay đổi chưa commit để tránh xung đột
    if ! git diff-index --quiet HEAD --; then
        echo "⚠️ [Forgewright] Bỏ qua auto-update vì phát hiện code cục bộ chưa được commit trong thư mục submodule."
        exit 0
    fi
    
    # 3.2 Kéo bản cập nhật mới nhất
    if git pull origin main -q; then
        echo "✅ [Forgewright] Đã tự động cập nhật submodule lên bản mới nhất ($(git rev-parse --short HEAD))."
        
        # 3.3 Chạy lại setup nếu file cấu hình hoặc MCP có thay đổi
        if [ -x "scripts/forgewright-mcp-setup.sh" ]; then
            bash scripts/forgewright-mcp-setup.sh >/dev/null 2>&1 || true
        fi
        
        # 3.4 Cảnh báo parent repo về con trỏ submodule đã thay đổi
        echo "💡 Ghi chú: Thư mục submodule forgewright đã có thay đổi mới. Bạn có thể cần commit lại ở thư mục dự án gốc ($SUPERPROJECT)."
    else
        echo "❌ [Forgewright] Lỗi trong quá trình auto-pull."
    fi
fi
