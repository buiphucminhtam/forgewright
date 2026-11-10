# Supervisor review — FW-ARGON-REFACTOR-20261109

## Quyết định

**CHANGES_REQUESTED_PC — chưa đủ điều kiện xác nhận phần PC hoàn tất.**

Phạm vi: checkout Windows tại `D:\Sources\Github\forgewright`. macOS được hoãn theo yêu cầu của anh Tâm và không phải nguyên nhân của quyết định này.

Supervisor đã đọc code, diff, hướng dẫn repo, các báo cáo và receipt, chạy lại 17 test hiện có và chạy các probe bổ sung trên PC. Có lỗi thực thi và lỗi xác nhận bằng chứng tái hiện được. Receipt của Argon ghi PASS không đủ để phủ định những lỗi này.

Không thay mã nguồn, không sửa báo cáo bàn giao cũ, không commit/push trong đợt review. Các probe dùng dữ liệu giả, process ngắn hoặc thư mục tạm; Google probe không phát sinh request mạng. Báo cáo này và JSON bằng chứng là các đầu ra riêng của supervisor.

## 1. Snapshot và phạm vi bằng chứng

- Snapshot cuối: **2026-11-09T19:50:47.323171+00:00** (02:50 ngày 10/11/2026 tại Việt Nam).
- Branch: `main`.
- HEAD: `c1200d575d63e8851fa6023ae1e78c996376b902`.
- Git status: **233 mục**, gồm 177 modified và 56 untracked entries. Git có thể gom một thư mục untracked thành một mục; đây không phải tổng số file riêng lẻ.
- Lưu SHA-256 của 33 file liên quan trong `SUPERVISOR_EVIDENCE_CHATGPT.json`. Đây là fingerprint của tập file được chọn, **không phải toàn bộ tree_sha**.
- Không quy toàn bộ diff của working tree cho Argon: nhiều thay đổi đã có trước nhiệm vụ.

### Bảo toàn 182 file có sẵn

Đối chiếu lại manifest bằng SHA-256 trên PC:

| Kết quả | Số file |
|---|---:|
| Giữ nguyên hash | 176 |
| Khác hash | 6 |
| Không còn tồn tại | 0 |

Sáu file khác hash:

1. `D:\Sources\Github\forgewright\AGENTS.md`
2. `D:\Sources\Github\forgewright\CLAUDE.md`
3. `D:\Sources\Github\forgewright\docs\project-state.json`
4. `D:\Sources\Github\forgewright\scripts\bootstrap\forgewright-install.sh`
5. `D:\Sources\Github\forgewright\scripts\runtime\skill_routing.py`
6. `D:\Sources\Github\forgewright\tests\unit_tests\test_hook_schema.py`

Các file này có giao với phạm vi refactor, nên hash thay đổi không tự chứng minh mất công việc cũ. Tuy nhiên, phát biểu “182 file nguyên vẹn, đối chiếu SHA-256” không đúng nếu hiểu là 182 hash đều khớp. Manifest chỉ có hash không thể chứng minh mọi hunk có sẵn trong sáu file đã được giữ đúng. Cần tách danh sách file được phép sửa chồng và đối chiếu với bản nội dung trước nhiệm vụ nếu có. Nếu không còn bản đó, phải ghi rõ giới hạn chứng minh, không khẳng định byte-for-byte preservation.

## 2. Những kiểm tra supervisor thực sự chạy

### Bộ test có sẵn

Lệnh:

```powershell
python -B -X utf8 -m pytest -q -p no:cacheprovider tests/unit_tests/test_skill_eval_receipt.py tests/unit_tests/test_rf02_kernel_docshub.py tests/unit_tests/test_rf05_openspec_superpowers.py tests/unit_tests/test_rf12_platform_matrix.py
```

Kết quả: **17 passed, 1 warning, 5.19s**. Warning của Hypothesis liên quan cấu hình ignore thư mục, không làm test fail.

Các test này pass đồng thời với các probe lỗi dưới đây. Vì vậy, chúng chưa bao phủ các hành vi cần thiết. Supervisor không tuyên bố đã chạy lại toàn bộ các nhóm 81/178/117/39/44/3 test do Argon báo cáo.

### Probe bổ sung

| ID | Điều kiện | Kết quả quan sát |
|---|---|---|
| S1 | Gửi `RF01_STDIN_PROBE` qua runner Windows | Child nhận `b''`, exit 0, cleanup_complete true |
| S2 | Gọi Promptfoo provider với cấu hình mặc định, kiểm tra file sau khi return | Outcome accepted; cả 6 đường dẫn bằng chứng đều không tồn tại |
| S3 | Đổi acceptance của OpenSpec rev 1 sang rev 2, giữ nguyên task dict | Task vẫn verified với evidence rev 1, projection rev 2 vẫn `[x]` |
| S4 | Bật Google opt-in với key giả trong child, chặn fetch | Probe quảng bá supported-opt-in; public config bị từ chối; SDK trả lỗi custom fetch; 0 request mạng |
| S5 | Chạy matrix summary với PATH rỗng trong child | Node/Git unavailable nhưng Windows/core/motion/cleanup vẫn PASS, exit 0 |
| S6 | Chạy 3 positive motion prompts qua route_skills không ép mode | Cả 3 không nạp motion-director; 2 abstain, 1 chọn mobile |
| S7 | Task backend chỉ cần trả version của GSAP | Chọn feature và nạp motion-director |

Lệnh, stdout, stderr, exit code và snapshot được lưu nguyên dạng trong JSON bằng chứng đi kèm. Các command probe in kết quả thay vì luôn assert, nên exit 0 của command probe chỉ nghĩa là probe chạy xong; kết quả sai được xác định từ các trường quan sát trong bảng.

## 3. Các lỗi cần sửa trước khi đóng phần PC

### R1 — P1 — Runner Windows làm mất prompt

**Đã tái hiện: S1.**

Nguồn chính: `D:\Sources\Github\forgewright\scripts\runtime\skill_eval_receipt.py:185`.

`execute_eval_run()` truyền prompt vào `_execute_bounded_process()`, nhưng nhánh Windows không chuyển `stdin_bytes` đến child. Probe gửi chuỗi khác rỗng và child đọc được EOF.

Kết quả thực tế:

```json
{"exit_code":0,"stdout":"b''\r\n","failure":null,"cleanup_complete":true}
```

Ảnh hưởng: model/runner nhận task qua stdin sẽ chạy thiếu task, trong khi hạ tầng vẫn ghi execution thành công.

**Yêu cầu sửa:** tạo đường truyền input riêng cho child hoặc dùng giao thức input được host hỗ trợ. Không ghi prompt thẳng vào stdin hiện tại của Windows supervisor: tại `D:\Sources\Github\forgewright\scripts\lite\windows_job_supervisor.py:148`, kênh này là tín hiệu ownership/cancellation; có byte hoặc EOF đều yêu cầu hủy.

**Nghiệm thu:** input UTF-8 tiếng Việt, input rỗng, input lớn trong giới hạn và newline tới child chính xác byte-for-byte; timeout/cancel/output limit vẫn thu hồi toàn bộ descendants. Kiểm tra cùng hợp đồng trên Windows và giữ test POSIX cho host tương ứng.

### R2 — P1 — Promptfoo xóa các bằng chứng vừa trả về

**Đã tái hiện: S2.**

Nguồn: `D:\Sources\Github\forgewright\evals\promptfoo\forgewright-runner-provider.ts:230`.

Provider trả `metadata.evidencePaths`, rồi `finally` xóa toàn bộ tempRoot khi không bật `keepEvidenceDir`. Cấu hình mẫu không bật cờ này. Sau khi callApi trả về, receipt, events, stdout/stderr của agent và verifier đều mất.

**Yêu cầu sửa:** đưa bằng chứng sang nơi lưu bền theo run ID trước khi trả kết quả, hoặc mặc định giữ evidence và có retention policy riêng. Chỉ xóa staging sau khi publish artifact thành công.

**Nghiệm thu:** mọi path được trả về phải tồn tại sau callApi; nội dung và hash khớp receipt; JSONL không chứa con trỏ đến artifact đã mất; nhiều run không đè nhau. Cả success, failure, timeout và cancel đều giữ bằng chứng phù hợp.

### R3 — P1 — Google API được báo supported nhưng không có đường chạy hoạt động

**Đã tái hiện: S4, không dùng credential thật, networkCalls = 0.**

Nguồn:

- `D:\Sources\Github\forgewright\integrations\pi\provider.mjs:66`
- `D:\Sources\Github\forgewright\integrations\pi\worker-runtime.mjs:18`
- `D:\Sources\Github\forgewright\src\cli\src\commands\delegate.ts:69`
- `D:\Sources\Github\forgewright\integrations\pi\provider.mjs:189`

Quan sát:

```json
{
  "advertised":"supported-opt-in",
  "configResult":{"error":"pi_provider_required"},
  "streamResult":{
    "stopReason":"error",
    "errorMessage":"Custom fetch is not supported by the Google Generative AI adapter"
  },
  "networkCalls":0
}
```

Public configuration chưa cho provider/auth source này. Đi vòng qua config thì SDK Pi đang cài từ chối custom fetch mà wrapper luôn truyền. Guard URL cũng vẫn áp đường dẫn Codex cho mọi provider không phải local. Usage parser chưa xử lý Google usageMetadata.

**Yêu cầu sửa:** chọn một trong hai trạng thái trung thực: hoàn tất Google route qua public API + guarded transport phù hợp, hoặc đánh dấu unsupported/experimental-unverified và không quảng bá supported-opt-in. Không bỏ transport boundary chỉ để cho request chạy.

**Nghiệm thu nếu giữ hỗ trợ:** positive path chạy qua public configure/delegate và fake Google transport, cùng deny tests cho redirect/destination, auth, quota, cancellation, usage chưa biết. Subscription AGY không bị hiểu thành quyền dùng Google API. Không bắt buộc gọi API mất phí để kiểm chứng plumbing.

### R4 — P1 — Windows PASS trong matrix summary là giá trị gán sẵn

**Đã tái hiện: S5.**

Nguồn: `D:\Sources\Github\forgewright\scripts\ci\verify-platform.py:104`.

Nhánh `--matrix-summary` gọi `build_platform_matrix_summary("PASS")`, ghi status PASS và thoát mà không chạy gate. Ngay khi PATH của child không có Node/Git, output vẫn chứa:

```json
{
  "toolchain":{"node":"unavailable","git":"unavailable"},
  "matrix":{"windows_native_x64":"PASS"},
  "capabilities":{
    "core_cli_mcp_docshub":"PASS",
    "motion_director_skill":"PASS",
    "process_tree_cleanup":"PASS"
  }
}
```

**Yêu cầu sửa:** summary chỉ tổng hợp receipt đã kiểm chứng, hoặc báo NOT_RUN nếu chưa chạy. Mỗi capability cần evidence tương ứng; không nhân một overall status cho mọi capability. Toolchain thiếu hoặc gate fail phải dẫn tới trạng thái phù hợp và không sinh PASS giả.

Giữ riêng từng OS/architecture. Muốn tổng hợp Windows + Mac phải đọc receipt của nhiều host và kiểm tra cùng revision/config; không khởi tạo mọi host khác thành NOT_RUN rồi kỳ vọng tự suy ra multi-OS đã hoàn thành.

**Nghiệm thu PC:** chạy Windows gate thực, có command/exit/raw output/tree binding; missing dependency và forced-failing test không thể tạo PASS. Các hàng Mac tiếp tục NOT_RUN đến khi anh Tâm chạy trên Mac.

### R5 — P2, bắt buộc cho pilot RF05 — Acceptance thay đổi nhưng task vẫn verified

**Đã tái hiện: S3.**

Nguồn: `D:\Sources\Github\forgewright\scripts\runtime\openspec_contract_adapter.py:158`.

Reconciliation chỉ so sánh task dict, không xét yêu cầu/acceptance đã đổi. Revision 2 có tiêu chí mới nhưng giữ evidence của revision 1 và checkbox vẫn hoàn thành.

**Yêu cầu sửa:** ràng buộc evidence với digest yêu cầu/acceptance có hiệu lực. Khi chưa có mapping task–requirement, invalidate bảo thủ khi requirement thay đổi. Projection/completion phải kiểm tra revision/digest tương ứng.

**Nghiệm thu:** đổi acceptance mà không đổi title/path vẫn reset pending và evidence không còn hợp lệ; task mới/đổi/xóa, evidence cũ và archive-only đều có test. Bảo toàn state chỉ khi có căn cứ requirement tương đương.

**Phạm vi triển khai:** hiện adapter chỉ có caller trong unit tests, chưa thấy kết nối MCP/CLI/CAS. Plan gọi đây là pilot, nên không yêu cầu tự mở rộng thành migration toàn bộ. Báo cáo phải gọi đúng là helper/pilot; nếu muốn claim activated workflow thì cần wiring và một luồng end-to-end thật.

### R6 — P2 — Routing Motion Director không khớp đường gọi thực tế

**Đã tái hiện: S6 và S7.**

Nguồn:

- `D:\Sources\Github\forgewright\tests\unit_tests\test_motion_director_skill.py:44`
- `D:\Sources\Github\forgewright\scripts\runtime\forgewright-orchestrator.py:1235`
- `D:\Sources\Github\forgewright\scripts\runtime\skill_routing.py:136`

Các test positive ép `mode` từ fixture. Caller thực không truyền mode. Với chính ba prompt positive của package, no-mode route không nạp skill lần nào. Filter chỉ lọc skill đã có trong danh sách, không sửa được bước chọn mode trước đó.

Task “Implement a backend REST endpoint that returns the GSAP package version string.” lại nạp skill chỉ vì có chữ GSAP.

**Yêu cầu sửa:** test và cải thiện routing qua đường no-mode thực tế, phân biệt yêu cầu motion với việc nhắc tên thư viện. Tuyên bố “0 token overhead cho mọi backend/CLI/docs/static task” phải thu hẹp hoặc có negative coverage đủ chứng minh.

**Phạm vi:** kết quả này áp dụng cho route_skills và caller orchestrator khi FORGEWRIGHT_LITE bật; không suy ra mọi cơ chế semantic loading của native AGY đều có cùng lỗi.

**Nghiệm thu:** cả ba prompt mẫu chọn đúng skill qua caller thật, negative backend nhắc GSAP không chọn, và các task không liên quan không có LITE body của skill trong context.

## 4. Các phát hiện từ đọc code cần xử lý cùng vòng sửa

Các mục dưới đây được xác nhận từ đường code, chưa chạy probe thời gian dài hoặc browser mới trong đợt này.

### R7 — P1 — Deadline Promptfoo ngắn hơn tổng thời gian hai stage

Nguồn: `D:\Sources\Github\forgewright\evals\promptfoo\forgewright-runner-provider.ts:168`; `D:\Sources\Github\forgewright\scripts\runtime\skill_eval_receipt.py:555` và `:650`.

Python cấp T giây cho agent và T giây cho verifier, nhưng Node chỉ chờ T+15 giây. Ví dụ T=30, agent 28s + verifier 28s đều trong giới hạn riêng nhưng outer timeout là 45s. Kết quả spawnSync bị bỏ qua; provider tiếp tục đọc receipt chưa có và có thể ném ENOENT thay vì terminal outcome chuẩn.

Sửa theo một deadline tổng rõ ràng hoặc budget từng stage cộng cleanup allowance. Kiểm tra timeout/error của spawnSync; giữ failed attempts trong denominator và luôn phát ra trạng thái có cấu trúc. Có regression test cho hai stage đều chậm nhưng hợp lệ, timeout verifier, child không sinh receipt và process cleanup.

### R8 — P2 — Capability probe AGY và distribution Stop hook chưa hoàn chỉnh

Nguồn probe: `D:\Sources\Github\forgewright\scripts\runtime\runtime-hooks-install.sh:435`.

Probe chỉ gọi agy --version, rồi gán năm supported events và cwd cố định nếu nhận một chuỗi version. Đây là version detection, chưa phải quan sát native hook capability. Tách installed/version, documented và observed capability; ghi observed sau canary tương ứng.

Nguồn distribution: `D:\Sources\Github\forgewright\scripts\bootstrap\forgewright-install.sh:684`.

Stop hook mới có trong checkout, nhưng danh sách copy của installer không có antigravity-stop-hook.sh; global installation/doctor chưa wire đầy đủ AGY Stop lifecycle. Test trên checkout không thay thế được test consumer sạch.

Nghiệm thu: install/verify/uninstall trong consumer tạm, xác nhận Stop script có mặt và event được wire, không sửa hook cá nhân hiện có của anh Tâm.

### R9 — P2 — Ba regression của Markdown cần test qua DocsHub

Nguồn: `D:\Sources\Github\forgewright\src\cli\src\docs\markdown.ts:25`, `:55`, `:67`, `:333`; caller `D:\Sources\Github\forgewright\src\cli\src\docs\render.ts:662`.

1. Catalog map dùng resolvedRoute hoặc raw target. Raw target chưa resolve vẫn được renderer xem là trusted, bỏ qua kiểm tra parent traversal. Đây là sai boundary của link; chưa có chứng minh XSS hoặc đọc file tùy ý.
2. markdown-it encode URL trước callback, nhưng map key giữ destination gốc. Link/asset tiếng Việt như Hướng-dẫn.md có thể mất rewrite sang route đã build, dẫn tới link sai hoặc bị bỏ.
3. Legacy engine không truyền trust flag cho route đã resolve. Parent-relative link/asset hợp lệ bị strip, nên switch legacy chưa phục hồi đầy đủ hành vi cũ.

Sửa hợp đồng resolver: chỉ trả thành công khi route đã kiểm chứng; dùng canonical representation chung cho parser và catalog; cả hai engine dùng cùng contract. Test actual DocsHub output với Unicode, parent route hợp lệ, unresolved traversal, image và legacy rollback.

### R10 — P2 — Windows cleanup có nhánh suy luận thành công từ exit code

Nguồn: `D:\Sources\Github\forgewright\scripts\runtime\skill_eval_receipt.py:264`.

Nếu WindowsJobClient.validate thất bại, wrapper vẫn có thể đặt cleanup_complete=true từ exit 126 và failure category. Điều này trái với hợp đồng strict receipt tại `D:\Sources\Github\forgewright\scripts\runtime\windows_job_client.py:143`.

Chỉ xác nhận cleanup khi có proof đúng giao thức. Nếu proof không có/hỏng thì để unconfirmed. Tổng cleanup cũng cần gộp kết quả agent và verifier. Thêm negative test completion receipt thiếu hoặc bị sửa.

## 5. Khoảng trống bằng chứng nghiệm thu RF01/RF08/RF10/RF11

### RF01 chưa có baseline model để kết luận hiệu quả harness

`D:\Sources\Github\forgewright\.forgewright\runtime\fw-argon-refactor-20261109\rf01-baseline-runs.jsonl` chỉ có hai deterministic replay/process cases. Run accepted dùng replay good và verifier “raise SystemExit(0)”. Không phải một task mới do Argon thực thi, cũng chưa phải so sánh native/current/lean theo cùng bộ task.

Cấu hình Promptfoo mẫu có giá trị như transport smoke fixture; cần gắn nhãn fixture và không dùng nó làm evidence về chất lượng model/harness. “independent=true” đang được gán mặc định, chỉ riêng một process verifier khác không chứng minh oracle do host kiểm soát hoặc freshness của output/tree.

Receipt cũng lấy repo_sha/config_digest từ caller và model/usage từ JSON stdout. Cần phân biệt metadata quan sát từ host/provider với dữ liệu do command tự in. Việc giữ unknown là đúng, nhưng không giải quyết provenance.

### RF08 có browser E2E hữu ích, thiếu ràng buộc với source hiện tại

`D:\Sources\Github\forgewright\src\testing\e2e\tests\example.spec.ts:63` chạy CLI đã build trong dist. Test không tự build hoặc xác minh bundle tương ứng source.

RF08 receipt tại dòng 145 và RF11 receipt tại `D:\Sources\Github\forgewright\src\testing\e2e\tests\motion-director.spec.ts:262` hardcode base revision c1200d5. Working tree hiện khác HEAD, nên revision này không định danh code được test.

Hash screenshot/trace xác nhận artifact không bị đổi; không chứng minh artifact đến từ dirty tree hiện tại. Cần build/fingerprint đúng source và bind tree/config/artifact trong receipt.

### RF11 browser scenario chứng minh fixture, chưa chứng minh tác dụng của skill

Motion scenario dùng inline HTML/CSS/JS trong test. Không có luồng chọn skill → nạp instructions → sinh/sửa UI. Tương tác với skill chủ yếu kiểm tra rubric file tồn tại. Các điểm 3 trong rubric là literal.

Giữ test này dưới nhãn scenario fixture. Các tiêu chí chủ quan/chưa quan sát cần unscored hoặc có review độc lập với evidence. Thêm một task thật sử dụng skill rồi kiểm tra output.

Đặc biệt cần bổ sung sequential Tab khi drawer đóng: fixture dùng opacity/pointer-events/aria-hidden nhưng không loại close button khỏi tab order. Hiện test dùng focus trực tiếp nên không chứng minh keyboard traversal. Kiểm thử interruption phải diễn ra lúc transition đang hoạt động; cleanup phải có resource thật đã tạo. Mobile scenario cũng cần trace nếu claim trace bao phủ touch/reduced-motion.

### RF10: receipt Argon là verdict review, chưa đủ xác nhận exact-tree tests

`D:\Sources\Github\forgewright\.forgewright\runtime\fw-argon-refactor-20261109\independent-argon-verifier-receipt.json` có native AGY response thành công, model/effort được ghi và JSON verdict. Receipt không chứa final tree fingerprint, verifier test command/output, oracle references hoặc digest của bộ source đã review.

Trường num_turns=1 không tự chứng minh model không đọc code; vấn đề là gói xuất ra thiếu bằng chứng để xác nhận phạm vi claim. Sau sửa cần phiên verifier mới, input gồm yêu cầu/diff/bằng chứng gốc, và supervisor kiểm tra lại trên snapshot cuối.

Reviewer packet của OpenSpec cũng đang giữ flags/commands nhưng bỏ raw evidence paths và digests tại `D:\Sources\Github\forgewright\scripts\runtime\openspec_contract_adapter.py:219`; cần sửa trước khi dùng packet để nghiệm thu.

## 6. Trạng thái đề xuất từng chặng

Đây là đánh giá supervisor; chưa sửa checkpoint gốc của Argon.

| Chặng | Đánh giá PC |
|---|---|
| RF00 | Preflight có dữ liệu; cần sửa phát biểu bảo toàn 182 file như mục 1 |
| RF01 | CHANGES_REQUESTED: prompt Windows, evidence lifecycle, deadline, provenance và baseline |
| RF02 | Có thay đổi hợp lý; nhóm test RF02 trong lần rerun pass; chưa phát hiện blocker mới ở phạm vi review |
| RF03 | CHANGES_REQUESTED: capability report và consumer Stop distribution |
| RF04 | Path normalization có cơ sở; Google supported claim chưa đúng, cần sửa hoặc hạ capability |
| RF05 | PILOT_NEEDS_FIX: stale requirement evidence; không claim activated CAS workflow |
| RF06 | EXCLUDED_BY_DECISION vẫn hợp lý; không cần thêm XState để chữa các lỗi này |
| RF07 | CHANGES_REQUESTED: resolver/Unicode/legacy regressions |
| RF08 | Có fixture E2E qua sản phẩm; cần source/build/artifact binding rồi rerun |
| RF09 | EXCLUDED_BY_DECISION vẫn hợp lý; sửa local evidence trước, không cần Langfuse server |
| RF10 | CHANGES_REQUESTED: chưa thể chấp nhận verdict “không có P0/P1” khi có lỗi tái hiện |
| RF11 | Vendor package có mặt; routing và skill-output QA chưa đạt đầy đủ |
| RF12 Windows | CHANGES_REQUESTED: PASS của summary không thay thế native gate execution |
| RF12 macOS arm64/x64 | NOT_RUN / DEFERRED_BY_USER; giữ nguyên đến lúc anh Tâm kiểm chứng trên Mac |

## 7. Thứ tự sửa và điều kiện nghiệm thu lại

1. **Sửa nền tảng bằng chứng:** R1, R2, R4, R7, R10. Không chạy benchmark lớn khi prompt và receipt còn sai.
2. **Sửa đường chức năng:** R3, R5, R6, R8, R9. Google có thể được hạ về unsupported minh bạch thay vì mở thêm phạm vi.
3. **Chốt phạm vi pilot/fixture:** không gọi helper OpenSpec là workflow đã kích hoạt; không gọi motion fixture là skill output evaluation.
4. **Bổ sung regression tests từ các probe supervisor.** Test phải fail trên code cũ, pass sau sửa; không chỉ assert lại hằng số.
5. **Build đúng source và chạy Windows gate thật.** Ghi commands/exit/raw output, final tree/config hashes, artifact hashes; mỗi capability có tiêu chí riêng.
6. **Làm baseline/model evaluation theo plan** nếu vẫn claim hoàn thành phần so sánh hiệu quả. Ghi unknown cho số không quan sát được, không thay bằng 0 hoặc metadata tự in.
7. **Fresh Argon verifier** đọc yêu cầu/diff/evidence gốc và kiểm tra task trên snapshot cuối. Không cung cấp self-PASS narrative như bằng chứng.
8. **Cập nhật báo cáo + checkpoint trung thực**, gửi supervisor xét lại. Chỉ chuyển PC_ACCEPTED khi các blocker đã đóng bằng evidence.

Không có yêu cầu bật lại XState/Langfuse. Không yêu cầu chạy Mac trong vòng sửa PC này.

## 8. Chuyển sang Mac sau nghiệm thu

Các thay đổi hiện nằm trong working tree chưa commit tại HEAD c1200d5. Git pull trên Mac không chuyển được các thay đổi cục bộ chưa commit/push này. Sau khi PC đạt cần một commit/branch hoặc gói snapshot xác định được, bảo toàn đúng phạm vi công việc có sẵn; tránh gom toàn bộ dirty tree vào một commit không được review.

Mac phải chạy gate trên đúng revision/config đã nghiệm thu PC và lưu receipt riêng theo architecture thực. Một máy Apple Silicon không tự chứng minh native Intel; Rosetta không nên được ghi là native x64. Đến lúc đó mới kết luận hỗ trợ Mac được kiểm chứng.

---

## Prompt ngắn giao lại Argon

> Tiếp tục FW-ARGON-REFACTOR-20261109 tại D:\Sources\Github\forgewright. Đọc SUPERVISOR_REVIEW_CHATGPT.md và SUPERVISOR_EVIDENCE_CHATGPT.json trong thư mục runtime của task. Trạng thái hiện là CHANGES_REQUESTED_PC. Giữ nguyên mọi công việc có sẵn và mọi evidence cũ; tạo snapshot nội dung trước khi sửa tiếp, không reset/clean/stash/pop hàng loạt, không commit/push ngoài phạm vi được phép.
>
> Tái hiện rồi sửa R1–R10 theo thứ tự ở mục 7. Bắt đầu từ input Windows và lưu bằng chứng. Không đẩy prompt vào control pipe của Windows supervisor. Không bỏ guarded transport để chữa Google API; nếu route chưa đủ khả năng thì báo unsupported/experimental-unverified. Không dùng matrix-summary để tạo PASS và không ép mode trong test thay cho production routing.
>
> Phân loại fixture/pilot/live evaluation rõ ràng. Bổ sung test hồi quy phản chứng cho các lỗi supervisor, build từ source hiện tại, chạy Windows gate thực và bind kết quả với exact final tree/config. Các nhóm test cũ pass không thay cho những ca mới. Sửa provenance của receipt/reviewer packet, giữ timeout/failure trong denominator và không tự suy luận cleanup khi proof bị thiếu.
>
> RF06/RF09 tiếp tục excluded nếu không có lý do mới. RF12 macOS tiếp tục NOT_RUN/DEFERRED_BY_USER. Khi Windows đủ bằng chứng, chạy fresh independent Argon verifier rồi xuất báo cáo yêu cầu supervisor review lại. Không tự đổi trạng thái toàn bộ thành hoàn tất chỉ từ verdict của model.
