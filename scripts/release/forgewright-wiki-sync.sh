#!/bin/bash
# scripts/forgewright-wiki-sync.sh

# Đường dẫn đến Shared Vault dùng chung (Thay đổi nếu bạn đặt ở thư mục khác)
SHARED_VAULT_PATH="$HOME/forgewright-shared-vault"
API_URL="http://localhost:3000"

# Tự động lấy tên dự án hiện tại dựa trên thư mục git root
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel)")
else
    PROJECT_NAME=$(basename "$(pwd)")
fi

PROJECT_RAW_DIR="$SHARED_VAULT_PATH/raw/$PROJECT_NAME"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 FORGEWRIGHT WIKI SYNC — Đồng bộ tài liệu"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 Dự án: $PROJECT_NAME"
echo "📂 Thư mục raw đích: $PROJECT_RAW_DIR"

# 1. Đảm bảo Shared Vault và thư mục raw của dự án tồn tại
mkdir -p "$PROJECT_RAW_DIR"
mkdir -p "$SHARED_VAULT_PATH/wiki"

# Tạo file purpose.md mặc định ở thư mục gốc của Vault nếu chưa có
if [ ! -f "$SHARED_VAULT_PATH/purpose.md" ]; then
    echo "Writing default purpose.md..."
    cat << 'EOF' > "$SHARED_VAULT_PATH/purpose.md"
# Project Wiki Goal
Mục tiêu: Quản lý kiến trúc, sơ đồ luồng dữ liệu, APIs và hiện trạng của tất cả các dự án phần mềm do tôi phát triển. Đảm bảo tài liệu được tối ưu cho cả lập trình viên đọc (bằng Obsidian) và các AI Agent truy vấn (qua giao thức MCP).
EOF
fi

# 2. Tạo liên kết mềm (Symlink) đến các tài liệu hiện tại (nếu có)
COPIED_FILES=0

sync_file_or_dir() {
    local source=$1
    local dest_name=$2
    if [ -e "$source" ]; then
        if [ -d "$source" ]; then
            # Nếu là thư mục, tạo thư mục thực tế ở đích và tạo symlink cho từng tệp bên trong
            echo "  📂 Đang đồng bộ cấu trúc thư mục: $dest_name"
            rm -rf "$PROJECT_RAW_DIR/$dest_name"
            mkdir -p "$PROJECT_RAW_DIR/$dest_name"
            
            # Quét đệ quy tất cả các file trong thư mục nguồn
            while IFS= read -r -d '' filepath; do
                # Lấy đường dẫn tương đối so với thư mục nguồn
                local relative_path="${filepath#$source/}"
                local dest_filepath="$PROJECT_RAW_DIR/$dest_name/$relative_path"
                local dest_parent_dir
                dest_parent_dir=$(dirname "$dest_filepath")
                
                # Tạo thư mục cha ở đích nếu chưa có
                mkdir -p "$dest_parent_dir"
                
                # Lấy đường dẫn tuyệt đối của filepath
                local abs_filepath
                abs_filepath=$(cd "$(dirname "$filepath")" && pwd)/$(basename "$filepath")
                
                # Tạo symlink cho tệp
                rm -rf "$dest_filepath"
                ln -sf "$abs_filepath" "$dest_filepath"
                COPIED_FILES=$((COPIED_FILES + 1))
            done < <(find "$source" -type f -print0)
        else
            # Nếu là tệp đơn lẻ
            local abs_source
            abs_source=$(cd "$(dirname "$source")" && pwd)/$(basename "$source")
            rm -rf "$PROJECT_RAW_DIR/$dest_name"
            ln -sf "$abs_source" "$PROJECT_RAW_DIR/$dest_name"
            echo "  ✓ Đã liên kết tệp: raw/$PROJECT_NAME/$dest_name -> $abs_source"
            COPIED_FILES=$((COPIED_FILES + 1))
        fi
    fi
}

# Đồng bộ các thư mục tài liệu phổ biến nếu tồn tại
for dir in docs architecture wiki documentation; do
    if [ -d "$dir" ]; then
        sync_file_or_dir "$dir" "$dir"
    fi
done

# Đồng bộ toàn bộ file Markdown ở thư mục gốc của dự án
for file in *.md; do
    if [ -f "$file" ]; then
        sync_file_or_dir "$file" "$file"
    fi
done

# Đồng bộ cấu hình đặc biệt của Forgewright
sync_file_or_dir ".forgewright/project-profile.json" "project-profile.json"
sync_file_or_dir ".forgewright/code-conventions.md" "code-conventions.md"

if [ $COPIED_FILES -eq 0 ]; then
    echo "  ⚠️ Cảnh báo: Không tìm thấy tài liệu nào để liên kết."
else
    echo "  ✓ Đã tạo thành công $COPIED_FILES liên kết mềm (shortcut) từ tài liệu cục bộ."
fi

# 3. Kiểm tra xem LLM Wiki API Server có online không
echo "🌐 Kiểm tra kết nối tới LLM Wiki API..."
if curl -s --connect-timeout 2 "$API_URL/health" >/dev/null 2>&1 || curl -s --connect-timeout 2 "$API_URL" >/dev/null 2>&1; then
    echo "  ✓ LLM Wiki API đang ONLINE tại $API_URL."
    echo "  🚀 Yêu cầu Ingest và biên dịch tài liệu..."
    
    # Gửi yêu cầu Ingest thông qua cURL (cần cấu hình API token nếu có bảo mật)
    # Nếu dùng Token, uncomment dòng dưới và cấu hình API_TOKEN
    # AUTH_HEADER="-H \"Authorization: Bearer $LLM_WIKI_API_TOKEN\""
    
    RESPONSE=$(curl -s -X POST "$API_URL/api/ingest" \
      -H "Content-Type: application/json" \
      -d "{\"path\": \"$PROJECT_RAW_DIR\"}")
    
    if echo "$RESPONSE" | grep -q -E "success|job|ok|started"; then
         echo "  ✓ Đã kích hoạt tiến trình ingest thành công!"
    else
         echo "  ⚠️ Gửi yêu cầu Ingest, phản hồi từ server: $RESPONSE"
    fi
else
    echo "  ❌ Cảnh báo: Không thể kết nối tới LLM Wiki API tại $API_URL."
    echo "     Vui lòng đảm bảo rằng ứng dụng LLM Wiki Desktop đang chạy và đã kích hoạt Local API Server."
    echo "     Tài liệu thô đã được đồng bộ vào Vault, llm_wiki sẽ tự động nhận diện khi bạn mở app."
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Hoàn tất đồng bộ! Hãy mở thư mục sau trong Obsidian:"
echo "👉 $SHARED_VAULT_PATH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
