#!/bin/bash
# Tiểu Mơ Task Runner - Multi-Project Queue & Execution

TASK="${1:-}"
PROJECT="${2:-default}"
CHAT_ID="${3:-}"
REPO_URL="${4:-}"

# Load tokens from environment (set in VPS)
BOT_TOKEN="${BOT_TOKEN:-}"
GH_TOKEN="${GH_TOKEN:-}"
VERCEL_TOKEN="${VERCEL_TOKEN:-}"

if [ -z "$TASK" ]; then
    echo 'Usage: task-runner.sh <task> [project] [chat_id] [repo_url]'
    exit 1
fi

PROJECT_ROOT="/root/projects/$PROJECT"
CODE_DIR="$PROJECT_ROOT/code"
FORGENEXUS_DB="$PROJECT_ROOT/forgenexus_db"

mkdir -p "$CODE_DIR"
mkdir -p "$FORGENEXUS_DB"
mkdir -p /root/state

LOCKFILE="/root/state/lock_${PROJECT}.lock"
PROGRESS_FILE="/root/state/progress_${PROJECT}.json"

update_progress() {
    local status=$1
    local clarify=$2
    local plan=$3
    local deploy=$4
    
    if [ -f "$PROGRESS_FILE" ] && jq -e . "$PROGRESS_FILE" >/dev/null 2>&1; then
        jq --arg st "$status" --arg t "$TASK" --arg cl "$clarify" --arg pl "$plan" --arg dp "$deploy" \
        '.status = $st | .task = $t | .clarify = $cl | .plan = $pl | .deploy_url = $dp' "$PROGRESS_FILE" > "${PROGRESS_FILE}.tmp" && mv "${PROGRESS_FILE}.tmp" "$PROGRESS_FILE"
    else
        jq -n --arg st "$status" --arg t "$TASK" --arg cl "$clarify" --arg pl "$plan" --arg dp "$deploy" \
        '{status: $st, task: $t, clarify: $cl, plan: $pl, deploy_url: $dp}' > "$PROGRESS_FILE"
    fi
}

send_telegram() {
    if [ -n "$CHAT_ID" ]; then
        JSON_PAYLOAD=$(jq -n --arg chat "$CHAT_ID" --arg text "$1" '{chat_id: $chat, text: $text}')
        curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" -H "Content-Type: application/json" -d "$JSON_PAYLOAD" > /dev/null
    fi
}

update_progress "QUEUED" "" "" ""

(
    flock -w 300 200 || { 
        update_progress "TIMEOUT" "" "" ""
        send_telegram "❌ Sếp ơi, tiểu dự án đang chịu tải bởi luồng khác, xíu gửi lại dùm em nha!"
        exit 1; 
    }
    
    update_progress "CLARIFY" "" "" ""
    python3 /root/scripts/memory-wrapper.py add "New Requirements for $PROJECT: $TASK" buiphucminhtam "$PROJECT" >/dev/null 2>&1

    # Extract Project Context to give Tieu Mo better background
    PROJECT_CONTEXT=""
    if [ -f "$CODE_DIR/README.md" ]; then
        PROJECT_CONTEXT=$(head -n 50 "$CODE_DIR/README.md")
    elif [ -f "$PROJECT_ROOT/.forgewright/project-profile.json" ]; then
        PROJECT_CONTEXT=$(head -n 50 "$PROJECT_ROOT/.forgewright/project-profile.json")
    elif [ -f "$CODE_DIR/package.json" ]; then
        PROJECT_CONTEXT=$(grep -A 5 '"description"' "$CODE_DIR/package.json" || echo "Không có description")
    else
        PROJECT_CONTEXT="Chưa có thông tin README.md hoặc project-profile.json. Đây có thể là dự án mới khởi tạo."
    fi

    # Extract recent memory to give Tieu Mo conversational context
    CONVO_HISTORY=$(python3 /root/scripts/memory-wrapper.py list -c "$PROJECT" -l 3 2>/dev/null || echo "Không có lịch sử trước đó.")

    MAIN_DOMAIN="${MAIN_DOMAIN:-hethongdoanhnghiep.com}"
    SYSTEM_RULES="[QUY TẮC: TUYỆT ĐỐI KHÔNG TỰ Ý thay đổi kiến trúc hệ thống gốc. ForgeNexus Context DB path is $FORGENEXUS_DB. Tôn trọng cách ly dự án!]\n[THÔNG TIN DỰ ÁN]: Tên dự án: $PROJECT\nNgữ cảnh hiện tại:\n$PROJECT_CONTEXT\n[WORKSPACE & DEPLOY]: Source code ĐÃ ĐƯỢC hệ thống tự động tải về thư mục máy chủ: $CODE_DIR. Việc deploy sẽ ĐƯỢC TỰ ĐỘNG CHẠY LÊN VERCEL bằng Script CI/CD. Subdomain sẽ được tự động tạo theo format: [ten-du-an].${MAIN_DOMAIN}. => TUYỆT ĐỐI TUYỆT ĐỐI KHÔNG HỎI MẤY CÂU NGỚ NGẨN (vu vơ) VỀ NỀN TẢNG DEPLOY HAY FOLDER SOURCE CODE (ví dụ: 'Mã nguồn nằm ở đâu?', 'Deploy trên AWS hay Vercel?').\n[LỊCH SỬ TRAO ĐỔI GẦN ĐÂY NHẤT (MEMORY)]:\n$CONVO_HISTORY"

    CLARIFY_PROMPT="${SYSTEM_RULES}\nBạn là Tiểu Mơ trưởng nhóm lập trình. Sếp đưa ra yêu cầu: '${TASK}'\n[CHỈ ĐẠO BẮT BUỘC TỪ HỆ THỐNG]: CẤM HỎI về Server/Deploy/Source Code/Github. CHỈ HỎI sâu duy nhất 1 CÂU nếu bạn thấy logic/nghiệp vụ MẬP MỜ. Nếu BẮT BUỘC phải hỏi, bạn MỚI hỏi và PHẢI BẮT ĐẦU bằng chuỗi '[CLARIFY] '. Nếu requirement ĐÃ RÕ RÀNG thì KHÔNG HỎI THÊM, bấm triển luôn và PHẢI BẮT ĐẦU bằng chuỗi '[READY] '. Đóng vai xưng 'em, sếp'. Chốt lại là 'em đã đưa Context vào Database cô lập của dự án ($PROJECT), sếp muốn triển thì hú em'. Nhớ confirm lại domain deploy sẽ là subdomain của ${MAIN_DOMAIN}."
    CLARIFY_OUT=$(python3 /root/llm/cli.py MiniMax-M2.7 "$CLARIFY_PROMPT")
    
    # Strip the tags for sending
    CLEAN_MSG=$(echo "$CLARIFY_OUT" | sed -E 's/^\[(CLARIFY|READY)\][[:space:]]*//')
    send_telegram "$CLEAN_MSG"

    if [[ "$CLARIFY_OUT" == *"[CLARIFY]"* ]]; then
        update_progress "WAITING_FOR_USER_INPUT" "$CLEAN_MSG" "" ""
        # Exit to naturally pause the pipeline here
        exit 0
    fi
    
    update_progress "PLAN" "$CLEAN_MSG" "" ""

    PLAN_PROMPT="${SYSTEM_RULES} Lên plan tóm tắt structure cho '${TASK}'."
    PLAN_OUT=$(python3 /root/llm/cli.py MiniMax-M2.1 "$PLAN_PROMPT")
    send_telegram "📝 DỰ THẢO STRUCTURE:\n\n${PLAN_OUT}"
    update_progress "EXECUTE" "$CLARIFY_OUT" "$PLAN_OUT" ""

    send_telegram "🔄 Khởi động Tiểu Mơ Engine 4.0..."
    
    EXEC_LOG="/root/state/orchestrator_${PROJECT}.log"
    python3 /root/scripts/forgewright-orchestrator.py "$PROJECT" "$TASK" "$CODE_DIR" 2>&1 | tee "$EXEC_LOG"
    ORCH_EXIT=${PIPESTATUS[0]}
    
    if [ $ORCH_EXIT -ne 0 ]; then
        send_telegram "❌ Tiểu Mơ gặp lỗi khi thực thi. Check log: $EXEC_LOG"
        update_progress "ERROR" "$CLARIFY_OUT" "$PLAN_OUT" ""
        exit 1
    fi
    
    update_progress "DEPLOY" "$CLARIFY_OUT" "$PLAN_OUT" ""
    send_telegram "🚀 Code đã xong! Bắt đầu Commit lên GitHub Repo và Deploy Vercel..."
    
    cd "$CODE_DIR"
    
    # Incremental Update Strategy
    if [ -d ".git" ]; then
        git add .
        git commit -m "Tiểu Mơ Update: $TASK" || true
        git push origin main || git push origin master || true
    else
        git init
        git checkout -b main || git branch -M main
        git add .
        git commit -m "Tiểu Mơ: Khởi tạo Codebase đầu tiên"
        git remote remove origin 2>/dev/null || true
        if [ -n "$GH_TOKEN" ]; then
            git remote add origin "https://${GH_TOKEN}@github.com/aicode82-sketch/${PROJECT}.git"
            curl -s -H "Authorization: token $GH_TOKEN" -d "{\"name\":\"$PROJECT\", \"private\":true}" https://api.github.com/user/repos > /dev/null
        fi
        git push -u origin main -f > /dev/null 2>&1
    fi
    
    if [ -n "$VERCEL_TOKEN" ]; then
        DEPLOY_OUT=$(vercel --prod --yes --token "$VERCEL_TOKEN" 2>&1)
        if echo "$DEPLOY_OUT" | grep -q "https://"; then
            RAW_DEPLOY_URL=$(echo "$DEPLOY_OUT" | grep -Eo "https://[a-zA-Z0-9./?=_-]*" | head -1)
            
            SAFE_SUBDOMAIN=$(echo "$PROJECT" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]/-/g')
            CUSTOM_DOMAIN="${SAFE_SUBDOMAIN}.${MAIN_DOMAIN}"
            vercel domains add "$CUSTOM_DOMAIN" "$PROJECT" --token "$VERCEL_TOKEN" > /dev/null 2>&1 || true
            DEPLOY_URL="https://$CUSTOM_DOMAIN"
        else
            DEPLOY_URL="Lỗi Deploy, check log VPS!"
        fi
    else
        DEPLOY_URL="Vercel token not configured"
    fi

    update_progress "READY" "$CLARIFY_OUT" "$PLAN_OUT" "$DEPLOY_URL"
    send_telegram "🎉 Xong xuôi tất cả Sếp ơi!\n\n🌐 **Live URL:** ${DEPLOY_URL}"

) 200> "$LOCKFILE"
