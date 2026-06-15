# Master Plan: Nâng Cấp Tư Duy & Quy Trình Kiểm Thử Phần Mềm

> **Tổng quan:** Bản kế hoạch tổng thể thiết lập quy trình kiểm thử nâng cao nhằm mục tiêu triệt tiêu hoàn toàn lỗi lọt lưới (escaped defects). Không bị giới hạn bởi thời gian tiến độ, mọi hành động tập trung vào chất lượng đầu ra tối đa.

---

## 1. Mục Tiêu Chiến Dịch (Strategic Objectives)
1. **100% Zero Escaped Bugs:** Thiết lập rào cản ngăn chặn lỗi lọt lên sản phẩm thực tế.
2. **Shift-Left Culture:** Biến hoạt động kiểm thử thành nhiệm vụ ngay từ khâu viết yêu cầu (Specs Review) thay vì chờ code xong mới test.
3. **Advanced Automation:** Đưa Property-Based Testing và Mutation Testing vào làm công cụ đo lường chất lượng code tự động.
4. **Developer Empowerment:** Cung cấp tài liệu và mẫu kiểm thử để lập trình viên tự tin viết test case chất lượng cao trước khi bàn giao.

---

## 2. Các Mốc Quan Trọng (Milestones)

Không giới hạn deadline gấp rút, các mốc được thực hiện cuốn chiếu và nghiệm thu kỹ lưỡng:

### 📍 Mốc 1: Chuẩn Hóa Quy Trình & Tạo Tài Liệu Mẫu (Process & Templates)
* **Mục tiêu:** Xây dựng quy chuẩn làm việc cho đội ngũ.
* **Kết quả đầu ra:**
  * Quy trình **Spec Review Gate** (Three-Way Handshake) hoạt động.
  * Bản **Checklist Thiết Kế Test Case Biên Tiêu Chuẩn** được phê duyệt.
  * Quy trình họp **Post-Mortem / RCA** khi xảy ra lỗi.

### 📍 Mốc 2: Tích Hợp Thư Viện Kiểm Thử Nâng Cao & Code Mẫu (Advanced Test Integration)
* **Mục tiêu:** Cung cấp công cụ kỹ thuật thực tế cho dự án.
* **Kết quả đầu ra:**
  * Viết code test mẫu sử dụng `fast-check` (TS/JS) và `Hypothesis` (Python) trực tiếp trong thư mục `tests/`.
  * Thiết lập và cấu hình chạy thử nghiệm `Stryker` và `mutmut` thành công cục bộ.
  * Cài đặt Git Hooks ngăn chặn đẩy code lỗi từ local máy Dev.

### 📍 Mốc 3: Nâng Cấp CI/CD Pipeline (CI/CD Quality Enforcement)
* **Mục tiêu:** Tự động hóa kiểm soát chất lượng trên GitHub Actions.
* **Kết quả đầu ra:**
  * Thiết lập tự động quét linting, format code và chạy test khi mở PR.
  * Thiết lập pipeline chạy ban đêm (Nightly build) chuyên chạy các bộ test nặng và đột biến (Mutation test).

---

## 3. Các Quyết Định Chiến Lược (Key Decisions)

### Quyết định 1: Quality Over Speed (Chất lượng trên hết)
* Mọi ticket tính năng và pull request chỉ được phép trộn (merge) nếu đáp ứng đầy đủ tiêu chí Definition of Done (DoD) mới về kiểm thử. Không chấp nhận ngoại lệ vì lý do gấp tiến độ.

### Quyết định 2: Tự Động Hóa Tìm Lỗi Biên (Property-Based Testing)
* Thay vì chỉ viết các bộ test case tĩnh, các module logic tính toán phức tạp bắt buộc phải sử dụng Property-Based Testing để sinh hàng nghìn bộ dữ liệu ngẫu nhiên stress-test code.

### Quyết định 3: Đo lường chất lượng test bằng Mutation Testing
* Không dựa vào Code Coverage đơn thuần (chỉ đếm dòng code chạy qua). Sử dụng Mutation Testing để đảm bảo các assert trong test thực sự bắt được lỗi khi logic code thay đổi.
