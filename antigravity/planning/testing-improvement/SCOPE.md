# Scope Definition: Nâng Cấp Quy Trình Kiểm Thử & Đảm Bảo Chất Lượng Đầu Ra

> **Mục tiêu:** Định hình các ranh giới, giả định, ràng buộc và rủi ro cho chiến dịch nâng cấp toàn diện quy trình kiểm thử nhằm ngăn chặn triệt để tình trạng lọt lỗi (zero-escaped-bugs) mà không bị giới hạn bởi thời gian thực hiện.

---

## 1. Goal (Mục Tiêu)
Thiết lập một quy trình kiểm thử đa lớp khép kín, chuyển dịch kiểm thử về bên trái (Shift-Left), nâng cấp tư duy viết test case biên của đội ngũ, và tích hợp các công cụ kiểm thử tự động nâng cao (Property-Based Testing, Mutation Testing) vào CI/CD để đảm bảo chất lượng đầu ra đạt mức tối đa.

---

## 2. In-Scope (Phạm Vi Thực Hiện)

### 2.1. Quy Trình & Quy Chuẩn (Process & Standards)
* [ ] Thiết lập quy trình **Spec Review Gate (Three-Way Handshake)** bắt buộc giữa PM, Dev Lead và QA Lead trước khi bắt đầu code.
* [ ] Tạo tài liệu **Checklist Thiết Kế Test Case Biên Tiêu Chuẩn** để áp dụng cho mọi tính năng mới.
* [ ] Định nghĩa quy trình **Post-Mortem / RCA (Root Cause Analysis)** bắt buộc mỗi khi có bug lọt lên production.
* [ ] Thiết lập tiêu chí **Definition of Done (DoD)** mới quy định nghiêm ngặt về chất lượng kiểm thử của Developers.

### 2.2. Kỹ Thuật & Tự Động Hóa (Technical & Automation)
* [ ] Viết các đoạn mã mẫu (Templates/Examples) về **Property-Based Testing** sử dụng `fast-check` (cho TypeScript) và `Hypothesis` (cho Python) trong thư mục `tests/`.
* [ ] Triển khai cấu hình **Mutation Testing** sử dụng Stryker (TS) và mutmut (Python) để kiểm tra chất lượng bộ test case hiện tại của dự án.
* [ ] Cấu hình **Git Hooks (pre-commit & pre-push)** chạy kiểm tra linting và bộ unit test nhanh cục bộ để chặn lỗi ngay từ máy của lập trình viên.
* [ ] Cập nhật pipeline CI/CD (GitHub Actions) để tự động chạy Unit Test, Integration Test và xuất báo cáo độ bao phủ (Coverage Report).

### 2.3. Văn Hóa Chất Lượng (Quality Culture)
* [ ] Xây dựng tài liệu hướng dẫn và tổ chức buổi **Bug Bash** (săn lỗi tập thể) mẫu cho đội ngũ trước mỗi đợt release lớn.

---

## 3. Out-of-Scope (Nằm Ngoài Phạm Vi)
* ✗ Refactor lại toàn bộ mã nguồn của dự án (chỉ viết test bổ sung và sửa lỗi nếu phát hiện thông qua quá trình test).
* ✗ Mua hoặc triển khai các công cụ SaaS kiểm thử có trả phí (chỉ sử dụng các thư viện open-source và tích hợp sẵn).
* ✗ Thiết lập hạ tầng môi trường Staging/Production mới (chỉ làm việc trên hạ tầng CI/CD hiện có).

---

## 4. Constraints (Ràng Buộc)
* **Thời gian:** Không giới hạn thời gian thực hiện. Chất lượng đầu ra là ưu tiên tuyệt đối.
* **Công nghệ:** Phải tương thích hoàn toàn với nền tảng hiện có của Forgewright (Node.js/TypeScript, Python, Shell scripts).
* **Hiệu năng CI/CD:** Các bài test tự động nặng (như E2E Playwright hoặc Mutation Testing toàn diện) phải được thiết lập chạy song song hoặc chạy định kỳ (nightly build) để tránh làm nghẽn luồng Pull Request thông thường.

---

## 5. Assumptions (Giả Định)
* Dự án đã có sẵn môi trường CI/CD (GitHub Actions) đang hoạt động ổn định.
* Toàn bộ đội ngũ (PM, Dev, QA) sẵn sàng tuân thủ quy trình kiểm soát chất lượng mới dù tốc độ bàn giao tính năng có thể chậm lại.

---

## 6. Risks & Mitigations (Rủi Ro & Phương Án Giảm Thiểu)

| Rủi ro | Tác động | Phương án giảm thiểu |
| :--- | :---: | :--- |
| **Sự phản kháng từ Dev** khi phải tuân thủ DoD nghiêm ngặt và viết nhiều test. | Cao | Tổ chức buổi chia sẻ nội bộ, cung cấp sẵn code templates (Property-based test, unit test) để Dev chỉ cần copy-paste và tùy chỉnh. |
| **Thời gian chạy CI/CD tăng đột biến** do thêm Mutation Testing và Property-Based Testing với số lượt chạy lớn. | Trung bình | Chỉ chạy Mutation Testing trên các file logic nghiệp vụ lõi được thay đổi trong PR (dùng tính năng Incremental Mutation), và thiết lập chạy toàn diện vào ban đêm (Nightly build). |
| **Lọt lỗi do Specs không rõ ràng** ngay từ đầu. | Cao | Triển khai triệt để Spec Review Gate ở Bước 1. QA có quyền từ chối đưa ticket vào Sprint nếu chưa có phân tích trường hợp biên rõ ràng. |
