#!/bin/bash
# scripts/forgewright-wiki-sync-all.sh

# Đường dẫn đến Shared Vault và Thư mục GitHub chứa các dự án
SHARED_VAULT_PATH="$HOME/forgewright-shared-vault"
GITHUB_DIR="/Users/buiphucminhtam/GitHub"
API_URL="http://localhost:3000"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 FORGEWRIGHT BATCH SYNC — Quét tất cả dự án"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📂 Thư mục gốc: $GITHUB_DIR"
echo "👉 Obsidian Vault: $SHARED_VAULT_PATH"

# Đảm bảo Vault tồn tại
mkdir -p "$SHARED_VAULT_PATH/raw"
mkdir -p "$SHARED_VAULT_PATH/wiki"

TOTAL_PROJECTS=0
SYNCED_PROJECTS=0

# Quét tất cả các thư mục con trong thư mục GitHub
for project_dir in "$GITHUB_DIR"/*; do
    # Bỏ qua nếu không phải là thư mục
    [ -d "$project_dir" ] || continue
    
    PROJECT_NAME=$(basename "$project_dir")
    
    # Bỏ qua các thư mục ẩn hoặc hệ thống
    [[ "$PROJECT_NAME" =~ ^\..* ]] && continue
    # Bỏ qua các thư mục report hoặc tạm thời
    [[ "$PROJECT_NAME" == *".bfg-report"* ]] && continue
    
    TOTAL_PROJECTS=$((TOTAL_PROJECTS + 1))
    
    PROJECT_RAW_DIR="$SHARED_VAULT_PATH/raw/$PROJECT_NAME"
    
    # Thu thập tất cả các tài liệu thực tế của dự án này
    declare -a actual_targets=()
    
    # Kiểm tra các thư mục tài liệu phổ biến
    for dir in docs architecture wiki documentation; do
        if [ -d "$project_dir/$dir" ]; then
            actual_targets+=("$dir")
        fi
    done
    
    # Quét toàn bộ file Markdown ở thư mục gốc
    while IFS= read -r -d '' file_path; do
        filename=$(basename "$file_path")
        actual_targets+=("$filename")
    done < <(find "$project_dir" -maxdepth 1 -name "*.md" -print0)
    
    # Cấu hình đặc biệt của Forgewright
    if [ -f "$project_dir/.forgewright/project-profile.json" ]; then
        actual_targets+=(".forgewright/project-profile.json")
    fi
    if [ -f "$project_dir/.forgewright/code-conventions.md" ]; then
        actual_targets+=(".forgewright/code-conventions.md")
    fi

    # Nếu dự án có tài liệu, tiến hành tạo liên kết mềm
    if [ ${#actual_targets[@]} -gt 0 ]; then
        echo "📂 Đang xử lý: $PROJECT_NAME..."
        mkdir -p "$PROJECT_RAW_DIR"
        
        # Dọn dẹp liên kết cũ để tránh rác
        rm -rf "$PROJECT_RAW_DIR"/*
        
        LINKED_FILES=0
        
        for target in "${actual_targets[@]}"; do
            source_path="$project_dir/$target"
            if [ -e "$source_path" ]; then
                # Lấy tên đích tương ứng
                dest_name=$(basename "$target")
                if [ "$target" == ".forgewright/project-profile.json" ]; then
                    dest_name="project-profile.json"
                elif [ "$target" == ".forgewright/code-conventions.md" ]; then
                    dest_name="code-conventions.md"
                fi
                
                # Tạo đường dẫn tuyệt đối
                parent_dir=$(dirname "$source_path")
                abs_source=$(cd "$parent_dir" && pwd)/$(basename "$source_path")
                
                # Xóa liên kết cũ nếu có
                rm -rf "$PROJECT_RAW_DIR/$dest_name"
                
                # Tạo liên kết mềm (Symlink)
                ln -sf "$abs_source" "$PROJECT_RAW_DIR/$dest_name"
                LINKED_FILES=$((LINKED_FILES + 1))
            fi
        done
        
        echo "  ✓ Đã tạo $LINKED_FILES liên kết mềm thành công."
        SYNCED_PROJECTS=$((SYNCED_PROJECTS + 1))
    fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 TỔNG KẾT QUÉT DỰ ÁN:"
echo "  • Quét tổng cộng: $TOTAL_PROJECTS thư mục dự án."
echo "  • Đã đồng bộ: $SYNCED_PROJECTS dự án có tài liệu vào Vault."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Gọi API của llm_wiki nếu đang chạy
echo "🌐 Kiểm tra kết nối tới LLM Wiki API..."
if curl -s --connect-timeout 2 "$API_URL/health" >/dev/null 2>&1 || curl -s --connect-timeout 2 "$API_URL" >/dev/null 2>&1; then
    echo "  ✓ LLM Wiki API đang ONLINE. Yêu cầu Ingest toàn bộ Vault..."
    
    # Kích hoạt quét toàn bộ thư mục raw chung
    RESPONSE=$(curl -s -X POST "$API_URL/api/ingest" \
      -H "Content-Type: application/json" \
      -d "{\"path\": \"$SHARED_VAULT_PATH/raw\"}")
      
    if echo "$RESPONSE" | grep -q -E "success|job|ok|started"; then
         echo "  ✓ Đã kích hoạt tiến trình ingest toàn bộ thành công!"
    else
         echo "  ⚠️ Server phản hồi: $RESPONSE"
    fi
else
    echo "  ❌ LLM Wiki API đang OFFLINE."
    echo "     Hãy mở ứng dụng LLM Wiki Desktop lên, hệ thống sẽ tự động quét và phân tích các liên kết mới tạo."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
