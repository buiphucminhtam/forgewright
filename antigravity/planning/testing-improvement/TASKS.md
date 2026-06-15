# Task Breakdown: Kế Hoạch Triển Khai Chi Tiết

> **Mô tả:** Danh sách các công việc cụ thể cần thực hiện để nâng cấp quy trình và tư duy kiểm thử, đi kèm với mức độ ưu tiên (P0/P1/P2) và tiêu chuẩn nghiệm thu (Acceptance Criteria).

---

## 1. Giai Đoạn 1: Chuẩn Hóa Quy Trình & Quy Chuẩn (P0)

### 📌 Task 1.1: Thiết lập Spec Review Gate & Tiêu chuẩn DoD
* **Độ ưu tiên:** P0 (Bắt buộc làm trước)
* **Thời gian ước lượng:** 4 giờ
* **Mô tả:** Viết quy trình phối hợp Spec Review giữa PM, Dev Lead và QA Lead. Cập nhật tiêu chí Definition of Done (DoD) nghiêm ngặt cho dự án.
* **Tiêu chuẩn nghiệm thu:** 
  * Tài liệu quy trình Spec Review Gate được lưu tại [docs/spec-review-gate.md](file:///Users/buiphucminhtam/GitHub/forgewright/docs/spec-review-gate.md) (hoặc tương đương).
  * Tiêu chuẩn DoD mới được thống nhất và đưa vào quy trình chạy thử nghiệm.

### 📌 Task 1.2: Xây dựng Checklist Thiết Kế Test Case Biên
* **Độ ưu tiên:** P0
* **Thời gian ước lượng:** 3 giờ
* **Mô tả:** Tạo file checklist tổng hợp các trường hợp cần bao phủ (Biên số, Biên chuỗi, Biên mảng, Trạng thái bất động bộ, Phân quyền API).
* **Tiêu chuẩn nghiệm thu:**
  * Có file checklist kiểm thử mẫu lưu tại [docs/test-case-checklist.md](file:///Users/buiphucminhtam/GitHub/forgewright/docs/test-case-checklist.md) để mọi thành viên đối chiếu.

---

## 2. Giai Đoạn 2: Tích Hợp Công Cụ & Viết Code Mẫu (P1)

### 📌 Task 2.1: Triển khai Git Hooks (pre-commit & pre-push)
* **Độ ưu tiên:** P0
* **Thời gian ước lượng:** 4 giờ
* **Mô tả:** Cài đặt Husky, lint-staged và cấu hình chạy quét cú pháp tự động cùng chạy Unit Test nhanh cục bộ trước khi push code.
* **Tiêu chuẩn nghiệm thu:**
  * Thử nghiệm cố ý sửa sai định dạng code hoặc viết sai logic làm hỏng unit test ở local máy dev sẽ bị chặn lại không cho commit/push.

### 📌 Task 2.2: Viết code mẫu Property-Based Testing (PBT)
* **Độ ưu tiên:** P1
* **Thời gian ước lượng:** 6 giờ
* **Mô tả:** Tích hợp thư viện `fast-check` (nếu có TypeScript test) và `Hypothesis` (cho Python test). Viết ít nhất một test case mẫu hoàn chỉnh cho mỗi ngôn ngữ.
* **Tiêu chuẩn nghiệm thu:**
  * Chạy `pytest` hoặc `npm run test` chạy qua bộ test mẫu thành công. Lập trình viên có thể tham khảo trực tiếp mã nguồn này để tự viết.

### 📌 Task 2.3: Thiết lập cấu hình Mutation Testing
* **Độ ưu tiên:** P1
* **Thời gian ước lượng:** 6 giờ
* **Mô tả:** Cài đặt và cấu hình Stryker Mutator (Node.js) và mutmut (Python) trong dự án. Cấu hình giới hạn chỉ quét các thư mục logic nghiệp vụ lõi để tối ưu thời gian chạy.
* **Tiêu chuẩn nghiệm thu:**
  * Chạy thử lệnh kiểm thử đột biến thành công ở local và xuất được báo cáo phần trăm Mutants bị tiêu diệt (Mutation Score).

---

## 3. Giai Đoạn 3: Tích Hợp CI/CD & Cải Tiến Liên Tục (P2)

### 📌 Task 3.1: Cấu hình GitHub Actions CI Pipeline
* **Độ ưu tiên:** P1
* **Thời gian ước lượng:** 6 giờ
* **Mô tả:** Viết/Cập nhật các workflows trong `.github/workflows/` để tự động hóa việc kiểm tra lint, định dạng code, chạy Unit Test & PBT trên mỗi PR.
* **Tiêu chuẩn nghiệm thu:**
  * Pipeline PR build tự động kích hoạt và chặn merge nếu lọt bất kỳ lỗi test nào.

### 📌 Task 3.2: Cấu hình Nightly Build Pipeline cho E2E & Mutation
* **Độ ưu tiên:** P2
* **Thời gian ước lượng:** 5 giờ
* **Mô tả:** Tạo workflow chạy định kỳ vào ban đêm trên GitHub Actions để chạy toàn bộ các bài test E2E Playwright nặng và Mutation Testing, tránh gây chậm trễ cho các PR trong ngày.
* **Tiêu chuẩn nghiệm thu:**
  * Workflow được kích hoạt thành công theo lịch cron và gửi báo cáo kết quả tự động.

### 📌 Task 3.3: Ban hành quy trình họp Post-Mortem / RCA
* **Độ ưu tiên:** P2
* **Thời gian ước lượng:** 3 giờ
* **Mô tả:** Thiết lập quy trình phân tích nguyên nhân lỗi lọt lưới và biểu mẫu báo cáo Post-Mortem.
* **Tiêu chuẩn nghiệm thu:**
  * File biểu mẫu [docs/post-mortem-template.md](file:///Users/buiphucminhtam/GitHub/forgewright/docs/post-mortem-template.md) được tạo.
