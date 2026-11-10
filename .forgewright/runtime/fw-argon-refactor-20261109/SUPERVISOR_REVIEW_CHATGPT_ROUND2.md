# Supervisor re-review — vòng 2

**Task:** FW-ARGON-REFACTOR-20261109  
**Quyết định:** CHANGES_REQUESTED_PC  
**Phạm vi:** D:\Sources\Github\forgewright — Windows native x64  
**Thời điểm đối chiếu cuối:** 10/11/2026, 04:25 giờ Việt Nam (2026-11-09T21:25:07.512735+00:00).  
**Mac:** NOT_RUN / DEFERRED_BY_USER, không phải nguyên nhân của quyết định.

## 1. Kết luận

Vòng sửa đã đóng được các lỗi gốc **R1, R2, R3, R6, R7 và R10** trong phạm vi Windows được kiểm tra. Các ca R9 literal traversal, Unicode và legacy cũng đã được sửa đúng hướng.

**Chưa chuyển PC_ACCEPTED:** còn **1 vấn đề P1 ở gate** và **4 vấn đề P2** liên quan trực tiếp đến các tiêu chí đã giao: OpenSpec thiếu binding, standalone AGY Stop hook, encoded traversal, và verifier của output motion thật.

Không yêu cầu mở rộng sang Mac, đưa XState/Langfuse trở lại, hay biến OpenSpec pilot thành workflow production. Vòng tiếp chỉ cần xử lý năm mục mở tại phần 4.

Supervisor không sửa mã nguồn, không commit/push, không gọi thêm model. Các kiểm tra dùng process ngắn, fixture tạm và browser cục bộ; không sửa hook cá nhân. Browser đã đóng, process pytest đã kết thúc. Evidence của lượt này được lưu riêng.

## 2. Bằng chứng độc lập đã xác nhận

### 2.1. Snapshot và bảo toàn công việc có sẵn

- HEAD: `c1200d575d63e8851fa6023ae1e78c996376b902`.
- Branch quan sát: `main`; working tree vẫn dirty.
- Git status cuối: **236 entries**; không đồng nghĩa 236 file riêng lẻ vì untracked có thể được gom theo thư mục.
- **44/44 file trong file_digests của verifier receipt khớp SHA-256 với PC hiện tại**, trước và sau các kiểm tra supervisor.
- **175/182 file pre-existing giữ nguyên hash**, 7 file giao phạm vi refactor khác hash, không có file bị mất. Danh sách đúng như báo cáo mới:
  AGENTS.md; CLAUDE.md; docs/project-state.json; scripts/bootstrap/forgewright-install.sh; scripts/hooks/forgewright-hook-doctor.sh; scripts/runtime/skill_routing.py; tests/unit_tests/test_hook_schema.py.
- Đây là xác nhận file-level của tập manifest. Không gọi tập 44 file đó là fingerprint toàn bộ repository.
- Chuỗi aggregate `manifest_sha256` được ghi nhận từ receipt. Đợt này xác nhận từng file; không khẳng định đã tái tạo aggregate digest khi chưa có hợp đồng serialization của manifest.

### 2.2. Regression suite

Đã chạy trực tiếp:

```powershell
python -B -X utf8 -m pytest -q -p no:cacheprovider tests/unit_tests/test_skill_eval_receipt.py tests/unit_tests/test_rf02_kernel_docshub.py tests/unit_tests/test_rf03_native_agy_hooks.py tests/unit_tests/test_rf04_pi_capabilities.py tests/unit_tests/test_rf05_openspec_superpowers.py tests/unit_tests/test_motion_director_skill.py tests/unit_tests/test_rf12_platform_matrix.py
```

**Kết quả: 38 passed, 1 warning, 132.01 giây, exit 0.**

Warning của Hypothesis liên quan cấu hình ignore thư mục. Không phải lỗi test. Các nhóm CLI 280 tests, MCP 629 tests và các suite lớn khác được implementer báo cáo; supervisor không chạy lại toàn bộ những nhóm đó trong lượt này.

### 2.3. Các probe quan trọng

| Probe | Kết quả |
|---|---|
| Input rỗng qua Windows runner | Đúng byte, cleanup true |
| Input UTF-8 chứa Đ và CRLF | Đúng byte và SHA-256 |
| Input đúng 65.536 byte | Đúng byte và SHA-256, cleanup true |
| Agent 18s + verifier 18s, timeout từng stage 20s | accepted sau **36.889s**, vượt outer budget cũ 35s |
| Bằng chứng sau provider return | Tồn tại đầy đủ, artifact digests khớp |
| Current FAIL + receipt Windows PASS cũ | Matrix Windows bị ghi đè thành PASS — lỗi |
| OpenSpec state thiếu revision/requirement_digest | Vẫn [x] và accepted — lỗi |
| Standalone AGY install/verify, registry tạm, gate/sweep files có thật | Cả hai exit 0, registry không có Stop, verify báo sweep n/a — lỗi |
| Encoded traversal ở cả hai Markdown engines | Vẫn xuất href, trong khi literal traversal bị strip — lỗi |
| Generated HTML current arm trên Chromium mobile 390×844 | Mở được bằng chạm; nút toggle bị drawer che; chạm để đóng timeout — lỗi |
| Generated HTML: Escape và reduced-motion | Escape đóng được; computed transitionDuration = 0s |

Lệnh và raw results nằm trong `SUPERVISOR_EVIDENCE_CHATGPT_ROUND2.json`. Các probe in observations nên exit 0 của probe không đồng nghĩa hành vi sản phẩm đạt; kết luận dựa trên giá trị quan sát và invariant.

## 3. Các mục đã đóng và phần đã sửa đúng

| Mục | Disposition |
|---|---|
| R1 | **CLOSED_WINDOWS**: feeder file riêng, không dùng cancellation pipe; byte preservation đã chạy lại |
| R2 | **CLOSED_WINDOWS**: evidence giữ bền theo run ID; paths và SHA-256 đã đối chiếu sau return |
| R3 | **CLOSED**: Google API được báo unsupported trung thực; không yêu cầu triển khai transport mới |
| R4 | **PARTIAL**: missing-toolchain/forced-failure đã có tests, nhưng merge receipt còn ghi đè current FAIL |
| R5 | **PARTIAL**: đổi acceptance đã invalidate đúng; thiếu binding vẫn được coi là verified |
| R6 | **CLOSED_IN_REVIEWED_ROUTING_PATH**: suite kiểm tra no-mode positives và backend GSAP negative pass |
| R7 | **ORIGINAL_DEADLINE_DEFECT_CLOSED**: probe hai stage dài pass; structured fallback hiện có |
| R8 | **PARTIAL**: bootstrap + doctor đã copy/wire/repair Stop; standalone runtime installer còn thiếu |
| R9 | **PARTIAL**: literal traversal/Unicode/legacy đã sửa; encoded dot segments vẫn lọt |
| R10 | **CLOSED_WINDOWS**: strict CompletionError làm cleanup false; aggregate agent + verifier hiện có; regression suite pass |
| Mục 5 / RF11 | **PARTIAL**: live output tồn tại và logs khớp hash; behavioral verifier chưa nhận diện lỗi UI thật |

R6 áp dụng cho route_skills và caller LITE được kiểm tra; không suy diễn thành chứng nhận mọi native semantic-loader path.

## 4. Năm mục cần sửa để nghiệm thu PC

### V2-01 — P1 — R4: receipt cùng host ghi đè FAIL hiện tại

**Đã tái hiện trên function thật.**

Nguồn:
`D:\Sources\Github\forgewright\scripts\ci\verify-platform.py`, vòng merge trong `build_platform_matrix_summary()` và cách nhánh full gate suy ra `report.status` từ hàng current host.

Probe truyền trạng thái hiện tại FAIL, core capability FAIL, và chính receipt Windows PASS của lần bàn giao. Kết quả:

```json
{
  "matrix": {"windows_native_x64": "PASS"},
  "capabilities": {"core_cli_mcp_docshub": "FAIL"},
  "full_gate_derived_status": "PASS"
}
```

Vòng merge chấp nhận `other_key == current_host_key` rồi ghi đè vào matrix. Nhánh full gate cuối file dùng giá trị matrix đó để tính status/exit. Vì vậy, với `--merge-receipt` chỉ vào receipt Windows cũ cùng revision, kết quả lỗi của lần chạy hiện tại có thể bị che.

**Phạm vi kết luận:** đây là lỗi nhánh merge receipt; không nói mọi lần chạy --matrix-summary mặc định đều false-pass. Ca missing-toolchain cũ đã được sửa.

**Sửa tối thiểu và acceptance:**

- Receipt từ host khác chỉ cập nhật hàng host đó; same-host receipt không được thay kết quả hiện tại.
- Current FAIL phải giữ FAIL và exit khác 0 sau mọi merge.
- Kiểm tra schema, status, capability records và revision của receipt nhập; không chỉ lấy một chuỗi PASS trong matrix.
- Thêm test current FAIL + old same-host PASS; malformed receipt; mismatched revision; foreign-host merge hợp lệ.
- Binding cần đại diện cho code/test/config thực sự được gate kiểm tra. Hiện KEY_REVISION_FILES chỉ có sáu file; không gọi source_digest này là toàn bộ tree.

Không cần chạy Mac để sửa hoặc test logic merge bằng fixture.

### V2-02 — P2 — R5: evidence không có binding vẫn được coi là hiện hành

**Đã tái hiện.**

Nguồn:
`D:\Sources\Github\forgewright\scripts\runtime\openspec_contract_adapter.py`, `_task_is_currently_verified()`.

Code chỉ từ chối revision/digest sai nếu trường đó có tồn tại. State:

```json
{"status":"verified","evidence_ref":"old-unbound-evidence"}
```

vẫn hiển thị `[x]` trong contract revision 2. Với accepted receipt mapping đúng contract_digest, completion trả `all_tasks_verified: true` và `accepted: true`.

**Sửa tối thiểu:** verified phải có revision đúng và requirement_digest đúng. Thiếu binding phải unverified/pending. Reconcile không tự thêm binding hiện tại vào legacy state rồi giữ verified.

**Acceptance:** missing revision, missing digest, wrong revision, wrong digest đều không được checked/accepted. Ca bound evidence hợp lệ vẫn pass; changed acceptance tiếp tục invalidate. Giữ phạm vi pilot helper, không mở rộng thành CAS integration.

### V2-03 — P2 — R8: standalone runtime installer vẫn thiếu Stop

**Đã tái hiện trong registry tạm, với gate/sweep files tồn tại thật. Không sửa hook cá nhân.**

Nguồn:
`D:\Sources\Github\forgewright\scripts\runtime\runtime-hooks-install.sh`, `agy_apply()`, `do_install()`, `do_verify()`.

Kết quả của entrypoint đang được hỗ trợ:

```text
--install --platform agy --agy-hooks <temporary-registry> : exit 0
--verify  --platform agy --agy-hooks <temporary-registry> : exit 0
registry: forgewright-runtime-guard.PreToolUse only
Stop: absent
verify: sweep n/a
```

Bootstrap và doctor đã sửa đúng, nhưng chúng không làm standalone entrypoint này tự có Stop. Đây là đường gọi đã nêu trong R8 vòng trước.

**Sửa tối thiểu:** standalone install/check/uninstall phải quản lý Stop phù hợp, hoặc khai báo và kiểm tra prerequisite Stop do bootstrap cung cấp. Verify phải phát hiện thiếu Stop; không tiếp tục báo thành công với sweep n/a.

**Acceptance:** consumer tạm, giữ custom hooks; install idempotent; Stop hiện hữu; verify phát hiện khi xóa Stop; uninstall chỉ bỏ entry thuộc owner tương ứng.

### V2-04 — P2 — R9: encoded traversal chưa bị chặn

**Đã tái hiện bằng module source hiện tại, bundle trong bộ nhớ, không sửa source/bundle trên PC.**

Nguồn:
`D:\Sources\Github\forgewright\src\cli\src\docs\markdown.ts`, `safeUrl()`.

Kết quả ở cả markdown-it và legacy:

```text
../../outside.md
→ <p>outside</p>

%2e%2e/%2e%2e/outside.md
→ <p><a href="%2e%2e/%2e%2e/outside.md">outside</a></p>
```

Browser URL resolution đưa URL encoded về cùng đường dẫn traversal. safeUrl kiểm tra raw literal '..', nên hai đầu vào tương đương không nhận cùng quyết định.

Đây là vi phạm yêu cầu strip unresolved traversal, **chưa phải bằng chứng XSS hoặc arbitrary file read**.

**Sửa tối thiểu:** canonicalize path phù hợp với cách browser hiểu trước khi kiểm tra dot segments; chỉ tin route do catalog thực sự resolve. Giữ nguyên hỗ trợ link/asset Unicode và parent-relative hợp lệ.

**Acceptance:** link và image encoded dot segments ở cả hai engine bị từ chối khi unresolved; trusted catalog routes, Unicode và legacy regression hiện tại vẫn pass.

### V2-05 — P2 — Mục 5/RF11: verifier chấp nhận output có lỗi touch

**Đã chạy browser trên chính artifact của current arm.**

Artifact:
`D:\Sources\Github\forgewright\.forgewright\runtime\fw-argon-refactor-20261109\rf01-live-current-workspace\drawer-motion.html`

SHA-256:
`c1f0c1463c7590f6fe95cc909e632ce08dd135810f3a9e8ca2f9d220417c09dd`

Môi trường: Chromium channel chrome, viewport 390×844, isMobile=true, hasTouch=true. Browser được nạp nguyên nội dung artifact; request mạng bị chặn.

Quan sát:

```json
{
  "openedByTouch":"true",
  "drawerCoversToggle":true,
  "closeTap":"TimeoutError",
  "openAfterCloseAttempt":"true",
  "buttonsInsideDrawer":0,
  "escapeCloses":true,
  "reducedMotionDuration":"0s"
}
```

Drawer che nút toggle khi mở và không có nút đóng bên trong. Người dùng cảm ứng không có action đóng khả dụng theo UI hiện tại. Escape vẫn hoạt động cho bàn phím.

Verifier của live run chỉ assert file tồn tại và có các chuỗi CSS/ARIA. Nó không chạy browser nên vẫn accepted. Browser suite hiện có kiểm tra SCENARIO_HTML inline, không mở generated artifact này.

**Điều kiện đóng đúng:**

- Behavioral verifier phải mở generated artifact và kiểm tra các hành vi đã yêu cầu, gồm open/close bằng touch, keyboard, reduced-motion và interruption.
- Bind digest của generated HTML, verifier/test source và skill/context đã dùng vào receipt.
- Kết quả current artifact trước sửa phải là FAIL cho touch-close.
- Có thể giữ arm FAIL như một kết quả eval hợp lệ, tính trong denominator. Harness đạt yêu cầu khi phân loại đúng kết quả model; không bắt buộc ép cả ba arm thành PASS.
- Nếu sửa artifact, ghi revision mới và chạy lại verifier. Không gán kết quả của artifact đã sửa cho receipt của artifact cũ.
- Các điểm chất lượng chưa quan sát tiếp tục unscored.

Không cần gọi lại model chỉ để phát hiện hành vi hiện tại bằng browser. Việc chỉnh output hay tạo một run mới tùy mục tiêu eval đã chọn.

## 5. Đánh giá bằng chứng mới

### Phần có thể xác nhận

- Có ba live run artifacts, các command khai báo model Argon medium và effort medium.
- SHA-256 của toàn bộ artifact logs/events được liệt kê trong ba receipt đều khớp.
- Token totals ghi trong receipt đúng các số báo cáo: native 27.637; current 7.545; lean 27.423. Cached tokens được ghi riêng, cost unknown.
- Model resolved/effort resolved vẫn unknown trong receipt. Không chuyển model_requested thành identity đã được provider xác nhận.
- Canary event log có PreToolUse và Stop với cwd kết thúc bằng .agents.
- Verifier receipt v2 đã có file-level manifest; 44 file được đối chiếu thành công. Đây là cải thiện so với vòng trước.
- RF08 receipt đã thêm bundle/source hashes. RF11 fixture đã gắn nhãn scenario-fixture-and-routing-verification và cải thiện keyboard/cleanup/mobile trace.

### Giới hạn còn lại, không mở thêm scope

- Ba live calls là một pilot trên một task; không dùng riêng ba số token để kết luận hiệu quả tổng quát của harness.
- Generated HTML không nằm trong artifact_digests của live receipt; supervisor đã hash artifact hiện tại riêng để ràng buộc probe browser.
- RF08 test vẫn chạy dist có sẵn; entrypoint cần build hoặc chứng minh bundle freshness trước lượt E2E nghiệm thu cuối.
- RF11 sourceBindings trong fixture chủ yếu hash skill/rubric và routing result; cần bind đúng artifact/test source cho behavioral verification.
- AGY capability importer đọc canary JSON nhưng chưa tự xác minh version/schema/log binding. Lần bàn giao này có event log để review riêng; không gọi importer là cơ chế tự chứng thực host.
- R7 fallback timing còn hardcode wall_time_ms/elapsed_ms = 0 trong nhánh missing receipt. Đây không tạo false acceptance, nhưng phải sửa hoặc loại khỏi phân tích latency trước khi dùng số liệu đó làm KPI.
- Fixture tên large_64k trong test có khoảng 40 KB UTF-8; supervisor đã chạy riêng input **65.536 byte** để xác nhận hành vi thật.

## 6. Plan vòng sửa tiếp — giữ phạm vi hẹp

1. Sửa V2-01 trước: current FAIL không thể bị receipt cũ ghi đè; thêm regression qua full-gate status/exit.
2. Sửa V2-02, V2-03, V2-04 bằng các negative cases đã tái hiện.
3. Đưa generated output vào behavioral verifier theo V2-05; ghi đúng accepted/failed và artifact digest.
4. Chạy focused regression + build/E2E cần thiết trên snapshot cuối; giữ raw output và binding.
5. Cập nhật báo cáo, nhấn rõ mục đã đóng, mục đã fail, fixture/pilot/live; gửi supervisor re-review.

R1/R2/R3/R6/R7/R10 không cần làm lại implementation nếu không có thay đổi liên quan. RF06/RF09 giữ excluded. Mac tiếp tục deferred. Đợt này chưa cấp PC_ACCEPTED, chưa commit/push.

## Prompt giao lại Argon

> Tiếp tục FW-ARGON-REFACTOR-20261109 trên PC. Đọc SUPERVISOR_REVIEW_CHATGPT_ROUND2.md và SUPERVISOR_EVIDENCE_CHATGPT_ROUND2.json. Giữ nguyên source/evidence đã có; snapshot trước khi sửa. Chỉ xử lý V2-01 đến V2-05, cùng các thay đổi trực tiếp cần thiết.
>
> V2-01: same-host merge không được thay current FAIL; full gate phải exit khác 0 khi current checks fail. V2-02: thiếu revision/requirement_digest phải unverified. V2-03: standalone AGY installer phải có Stop hoặc verify fail rõ prerequisite. V2-04: encoded '..' unresolved phải bị chặn ở cả hai renderer, giữ Unicode/catalog trust. V2-05: verifier phải kiểm tra generated HTML thật; touch-close của artifact current hiện fail, phải ghi đúng failure hoặc tạo revision sửa và verify lại.
>
> Đóng regression từ observations của supervisor; giữ failed eval attempts trong denominator. Một arm FAIL được ghi nhận đúng là kết quả hợp lệ, không sửa assertion để ép PASS. Bind generated artifacts và final source/test/config với evidence. R1/R2/R3/R6/R7/R10 đã đóng ở phạm vi Windows được kiểm tra. RF06/RF09 tiếp tục excluded; Mac deferred. Xuất handoff cho supervisor xét PC_ACCEPTED, không tự suy ra từ verdict model.
