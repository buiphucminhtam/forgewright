---
title: Conversation memory handoff from cloud to Mac
status: historical-handoff
owner: Forgewright maintainers
scope: Native memory injection and cloud persistence acceptance
last_reviewed: 2026-10-16
canonical: false
---

# Bàn giao memory từ cloud sang Mac

Snapshot bàn giao được người dùng yêu cầu commit để tiếp tục trên Mac. Đây là
trạng thái tại thời điểm bàn giao; đối chiếu lại Git, host và quyền hiện tại khi
tiếp tục. Nguồn hướng dẫn chuẩn là [Memory Manager](../../skills/memory-manager/SKILL.md),
[project state](../project-state.json) và [auto-bootstrap](../guides/auto-bootstrap.md).
Tài liệu này nằm ngoài Docs Hub truth set.

## Lấy đúng bản đang làm

- Repo: `buiphucminhtam/forgewright`.
- Nhánh: `upgrade/memory-flow-20261016`; tiếp tục nhánh này, không tạo nhánh theo từng phase.
- PR: <https://github.com/buiphucminhtam/forgewright/pull/24>.
- Source đã review: `463abe6ebaaf52e4abe343618ee78c4aefd83aa3`.
- Git tree của source trên: `a69663524f2ee7675565cae13cbce4d87e7d9e3b`.
- Main quan sát lúc bàn giao: `9266d0970736e8215337028191f479b978f093bb`.

Kiểm tra working tree và worktree đang được chat/task khác sử dụng trước khi switch.
Sau đó, tại checkout của repo trên Mac:

```bash
git status --short --branch
git worktree list
git fetch origin --prune
git switch upgrade/memory-flow-20261016
git pull --ff-only origin upgrade/memory-flow-20261016
git log -3 --oneline
```

Nếu Git báo xung đột hoặc nhánh đang được worktree khác sử dụng, giữ nguyên dữ liệu
và đối chiếu task đang sở hữu nó. Không reset/clean để lấy được trạng thái sạch.
Commit bàn giao chỉ bổ sung tài liệu này; source runtime vẫn là commit đã review ở trên.

## Phần đã làm và bằng chứng lịch sử

Lõi hiện có capture structured summary vào continuity + SQLite, receipt/idempotency,
scope project/chat, redaction, bounded cited retrieval, incremental FTS, backup nhất
quán và migration explicit. Legacy entrypoints dùng cùng hợp đồng; test runner kiểm
tra exit code và số test thực sự chạy. Chi tiết lệnh/giới hạn ở Memory Manager.

Quan sát trên Linux cloud, tại source commit nêu trên:

| Kiểm tra | Kết quả đã quan sát | Giới hạn |
| --- | --- | --- |
| Review Astra | Đóng 8 finding Important và 1 robustness issue; reviewer chạy 54 test và 3 smoke mode đạt | Không chứng nhận Mac/native/cloud recreation |
| Hook commit chuẩn | Python 1693 pass, 11 skip có sẵn; MCP 567 pass; CLI 207 pass, 1 skip có sẵn | Kết quả Linux, không tự chuyển thành kết quả Mac |
| Legacy memory runner | 130/130 thực thi đạt | Fixture cách ly |
| Concurrent capture | 8 process x 25 event, 200 unique acknowledgment | Không chứng minh power-loss/disk-full durability |
| API / CLI / consumer | RED -> GREEN -> cố tình đưa lỗi replay trở lại thì FAIL -> khôi phục đúng bytes thì GREEN; 3 gate v2 OPEN | CLI-E2E, chưa phải native automatic injection |
| Live cloud canary | Capture project fact, process mới và context-manager đọc citation `mem0:1`, 231/600 ký tự; doctor báo acknowledged | Canary TTL 24 giờ; dùng canary mới khi tiếp tục |
| Retrieval eval cố định | 48 query, Recall@3 80.95% -> 95.24%, MRR 78.57% -> 95.24%, unrelated 0/6 cả hai | Synthetic; còn 2 synonym query chưa tìm được |
| Latency ở 1000 record | Warm FTS p95 3.202 -> 0.517 ms; cold CLI median 42.535 -> 60.489 ms | Startup chậm hơn; không có production SLO/player-benefit claim |

Raw audit/review/receipt/log nằm trên cloud trong
`.forgewright/runtime/memory-flow-audit/20261016/` và `.forgewright/verify/`.
Chúng bị Git ignore, không đi theo lần pull trên Mac. DB cũng không được commit hay
chuyển theo handover. Không copy credentials, trust records, Linux virtualenv hoặc
machine caches sang Mac. Bộ eval/test source để chạy lại đã nằm trong Git.

Fingerprint local của feature evidence là
`TREE:3e6995bf597c850a16921d34d1e5377d98aced4fd459620f376aeb0071a0bd9e`.
Nó bao gồm state ngoài Git và chỉ bind candidate lúc đó. Commit handover làm đổi
HEAD/tree; không dùng receipt cũ làm chứng nhận cho tree mới hoặc Mac. Không sửa
timestamp để làm mới evidence. Review-2 bind exact bytes nhưng không xác thực danh
tính chống giả mạo bởi cùng OS user.

## Vì sao còn hai phần chưa xác minh

**Auto-injection:** đã chứng minh consumer trả context, nhưng chưa quan sát native
host tự dispatch hook và chuyển packet vào phiên mới. Tool inventory hiện tại không
expose API hook/context injection. Cần probe khả năng của host thực, không suy từ
comment/config hoặc output stdout.

**Cloud persistence:** đã restart process trên cùng filesystem, chưa tái tạo cloud.
DB ở `<workspace>/.forgewright/memory.db`, ngoài Git. Cloud status không xác nhận
snapshot/persistent volume/restore contract. Mount hiện tại là overlay; riêng chi
tiết này không kết luận được chính sách snapshot của provider. Restart app hoặc
Mac chỉ kiểm chứng vòng đời tương ứng, không kiểm chứng cloud recreation.

## Plan tiếp tục trên Mac

### 1. Probe host và baseline trước khi thay đổi

- Đọc AGENTS.md và kiểm tra phiên bản host, installation source/hash, hook thực sự
  hỗ trợ, trust scope, session ID, project root và jobs đang chạy. Tận dụng adapter
  đang có; tránh tạo thêm memory service hoặc ghi mỗi message.
- Chạy doctor read-only. Giữ nguyên disable flags của người dùng. Nếu Mac có DB cũ,
  inventory schema/scope và backup trước; không auto-migrate hay ghi đè DB.
- Xác nhận cơ chế snapshot/persistent volume của cloud bằng tài liệu/config/API
  thực. Nếu cần thao tác UI/provider, ghi dependency rõ; không giả định Mac có API đó.

```bash
python3 scripts/memory/mem0-v2.py doctor --json
python3 evals/memory/smoke.py api
python3 evals/memory/smoke.py cli
python3 evals/memory/smoke.py consumer
```

Các smoke mode dùng fixture riêng. Dùng Python/dependencies đã xác minh trên Mac;
không chạy script/venv đường dẫn `/tmp` của cloud. Khi sửa source, chạy những test
memory bị ảnh hưởng và check bắt buộc của repo; không viết test hiển nhiên hay thêm skip.

### 2. Đóng native automatic capture/context injection

1. Chọn event startup/resume/context mà phiên bản host thực sự hỗ trợ, qua đường
   cài đặt/trust đúng của host. Ghép vào consumer/capture hiện có, dùng stable native
   session/event identity; không tạo một writer song song.
2. Chỉ capture quyết định, blocker, handoff/task-close có ý nghĩa bằng structured
   summary. Default private; project scope phải explicit. Current workspace vẫn
   ưu tiên hơn memory; memory không cấp quyền thực hiện hành động.
3. Đưa packet có citation vào context của đúng phiên, hard cap tính cả wrapper.
   Disable thắng mọi adapter; missing/timeout/degraded memory không chặn task thường.
4. Dùng canary ngẫu nhiên mới trong fixture: lưu qua event thật, mở phiên mới với
   scope phù hợp, không chép canary vào prompt mới. Giữ bằng chứng native dispatch,
   capture receipt và packet thực sự được host chuyển vào context. Câu trả lời của
   agent hoặc stdout riêng lẻ không đủ chứng minh auto-injection.
5. Kiểm tra foreign project/chat, private vs project scope, replay conflict,
   stale source, expired fact, secret redaction, disable và unavailable/timeout.

Đạt khi có chuỗi native event -> acknowledgment -> fresh-session retrieval ->
observed host context, cùng negative paths. Nếu host không expose hook, có thể dùng
entrypoint do Forgewright quản lý nếu phù hợp; báo đúng phạm vi tự động ở entrypoint,
giữ explicit CLI fallback và native auto-injection ở trạng thái chưa hỗ trợ/xác minh.

### 3. Đóng persistence qua cloud recreation

1. Dùng một cloud thử nghiệm riêng. Ưu tiên snapshot/persistent volume sẵn có của
   provider; nếu không có, xác định nơi backup bền vững ngoài instance và quyền truy
   cập trước khi thêm integration. Backup cùng máy không đủ cho việc xoá máy.
2. Backup bằng SQLite online backup API, gồm dữ liệu đã commit trong WAL, lưu riêng
   tư và verify integrity. Physical backup chứa nhiều scope cần explicit all-scopes
   authorization. Không đưa DB/raw conversation vào Git.
3. Thiết kế restore trước capture đầu tiên: lock, kiểm schema/integrity/expected IDs
   và FTS, atomic publication. DB đang có dữ liệu mới phải được bảo toàn/reconcile;
   không restore snapshot cũ đè lên writes mới.
4. Project identity mặc định phụ thuộc canonical workspace path. Đổi host/path có
   thể làm record cũ không thuộc scope hiện tại. Chọn identity/mapping có chủ đích,
   validate ownership khi restore; không đoán scope theo basename hoặc nới lọc để đọc
   được dữ liệu. Giữ private conversation ID và source revalidation/TTL.
5. Lưu canary có ID/hash, backup, ghi identity của cloud cũ, tái tạo cloud thử nghiệm,
   restore, rồi đọc lại qua process/phiên mới. Kiểm tra đúng ID/content, không trùng
   event, không leakage và consumer packet có citation. Test missing/corrupt backup,
   interrupted restore và unavailable storage; ghi rõ kết quả từng trường hợp.

Đạt khi có bằng chứng trước/sau từ hai instance thực cùng các negative paths. Nếu
provider không cho thao tác lifecycle/restore, giữ blocker đó; thử trên Mac hoặc
container cùng máy không thay thế được cloud recreation acceptance.

### 4. Review, docs và publication

- Nhờ reviewer độc lập đánh giá source/host/storage boundaries sau khi có thay đổi.
  Chạy evidence v2 hiện tại trên final tree thực, với giới hạn đo được; cập nhật
  Memory Manager, project state và README cho capability thực sự đã chứng minh.
- Tại lúc bàn giao, PR #24 OPEN/MERGEABLE nhưng ordinary squash merge bị policy
  chặn: ruleset `15463107` có `Restrict updates`; auto-merge tắt. Không có pending
  status check/review được trả về. Không dùng `--admin`, force-push hoặc đổi ruleset
  trong phiên cloud này.
- Normal push nhánh đã được GitHub tự áp dụng bypass privileges cho ref creation,
  unsigned source commit và một merge commit trong lịch sử; việc này đã báo người
  dùng. Khi tiếp tục, kiểm tra quyền/policy thực thay vì suy rằng push được thì merge được.
- Người dùng đã yêu cầu merge main và xoá nhánh sau merge; handover không huỷ yêu
  cầu đó. Xử lý giới hạn quyền/policy theo thẩm quyền chủ repo, verify remote SHA sau
  merge, rebind final evidence nếu HEAD thay đổi, rồi mới xoá nhánh tạm local/remote.
  Giữ nhánh khi PR còn mở; không xoá nhánh/worktree của task khác.
