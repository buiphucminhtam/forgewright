# Webhook State & Telemetry Protocol

> **Lưu ý:** Giao thức này thay thế hoàn toàn hệ thống OSC và WebSocket RPC cũ. Tất cả các báo cáo trạng thái Pipeline và Token Usage phải được thực hiện thông qua Local Webhook HTTP POST.

## 1. Phát hiện Webhook URL

Mọi công cụ CLI, AI Agent, hoặc scripts khi chạy đều phải lấy Webhook URL theo một trong hai cách:

1. Đọc trực tiếp từ biến môi trường: `FORGEWRIGHT_WEBHOOK_URL`
2. Đọc dự phòng từ file tĩnh: `~/.forgewright-console/webhook.env` hoặc lấy port từ `~/.forgewright-console/webhook-port.txt`.

*Lưu ý: Nếu không tìm thấy Webhook URL, các tiến trình được phép bỏ qua (graceful fail) mà không làm gián đoạn workflow chính.*

## 2. Báo cáo Token (Sau mỗi lần kết thúc Stream/LLM Call)

**KHÔNG** chờ người dùng yêu cầu, hệ thống / AI agent phải tự động bóc tách metrics (input/output tokens) từ response của LLM và gọi POST request ngay khi stream kết thúc.

**Endpoint:** `POST {FORGEWRIGHT_WEBHOOK_URL}/api/v1/telemetry`

**Payload:**
```json
{
  "workspacePath": "<Thư mục làm việc hiện tại, VD: /Users/username/project>",
  "payload": {
    "model": "<Tên model, VD: claude-3.5-sonnet>",
    "inputTokens": 1024,
    "outputTokens": 512,
    "cost": 0.003
  }
}
```

**Ví dụ bằng cURL (tích hợp vào CLI/Bash):**
```bash
curl -X POST "$FORGEWRIGHT_WEBHOOK_URL/api/v1/telemetry" \
  -H "Content-Type: application/json" \
  -d '{"workspacePath": "'"$PWD"'", "payload": {"model": "claude", "inputTokens": 100, "outputTokens": 50, "cost": 0.0}}'
```

## 3. Điều phối State (Trước mỗi lần chuyển Phase / Skill)

**KHÔNG** in ra stdout bằng OSC `\033]1337;...`. AI phải sử dụng công cụ hoặc script gọi webhook để thông báo cho IDE Console về việc thay đổi trạng thái của Pipeline.

**Endpoint:** `POST {FORGEWRIGHT_WEBHOOK_URL}/api/v1/state`

**Payload:**
```json
{
  "workspacePath": "<Thư mục làm việc hiện tại>",
  "payload": {
    "phase": "<Tên phase: interpret | define | build | harden | ship | sustain>",
    "status": "<Trạng thái: running | passed | failed | waiting_review>",
    "progress": 0.5,
    "action": "<Mô tả ngắn gọn hành động đang làm>"
  }
}
```

## 4. Ràng buộc (Rule) cho Forgewright Orchestrator

Mỗi khi Forgewright Orchestrator (hoặc bất kỳ Skill nào) quyết định điều phối công việc cho Sub-agent / Skill khác:
1. **BẮT BUỘC** gọi `/api/v1/state` webhook với `status: "running"` và chỉ định rõ `phase` chuẩn bị diễn ra.
2. **BẮT BUỘC** gọi `/api/v1/telemetry` webhook ngay lập tức để tổng kết lượng token đã tiêu thụ trong quá trình tư duy (reasoning) và lập kế hoạch vừa xong.
3. Chỉ sau khi gọi xong 2 webhook trên thì mới tiến hành invoke (gọi) sub-agent/skill tiếp theo.
