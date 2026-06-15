# Architecture Decision Records (ADRs)

> **Mô tả:** Nhật ký lưu trữ các quyết định kiến trúc và quy trình quan trọng trong chiến dịch cải tiến kiểm thử phần mềm.

---

## ADR 1: Áp Dụng Property-Based Testing (PBT) Cho Các Logic Phức Tạp

### Bối cảnh (Context)
Các bài test truyền thống viết tay (Unit Test thông thường) chỉ kiểm tra các kịch bản tĩnh được lập trình viên nghĩ ra trước. Điều này dẫn đến việc bỏ sót các biên dữ liệu lạ (ví dụ: mảng rỗng, chuỗi Unicode lỗi, số âm cực đại), dẫn đến lọt lỗi (escaped bugs) lên môi trường production.

### Quyết định (Decision)
Quyết định tích hợp và bắt buộc viết Property-Based Testing cho các hàm xử lý logic nghiệp vụ, tính toán phức tạp, xử lý dữ liệu đầu vào.
* **TypeScript:** Sử dụng `fast-check`.
* **Python:** Sử dụng `Hypothesis`.

### Hệ quả (Consequences)
* **Tích cực:** Tự động sinh hàng nghìn test case biên dị để stress-test code mà lập trình viên không cần tự nghĩ ra. Giúp phát hiện nhanh các lỗi Crash và lỗi biên logic.
* **Tiêu cực:** Viết PBT khó hơn vì cần xác định tính chất bất biến (Properties) của code thay vì chỉ assert kết quả tĩnh. Thời gian chạy test lâu hơn một chút (từ vài mili giây lên vài giây).

---

## ADR 2: Đánh Giá Bộ Test Bằng Mutation Testing Thay Vì Chỉ Dùng Code Coverage

### Bối cảnh (Context)
Độ bao phủ code (Code Coverage) chỉ đo lượng dòng code được chạy qua trong lúc test, không phản ánh việc bộ test có kiểm tra đúng đắn kết quả hay không. Một đoạn code có thể có 100% Code Coverage nhưng hoàn toàn không có `assert` kiểm tra kết quả, vẫn cho phép lỗi lọt qua dễ dàng.

### Quyết định (Decision)
Sử dụng Mutation Testing (Kiểm thử đột biến) để đánh giá độ tin cậy thực tế của bộ test.
* **TypeScript:** Sử dụng `Stryker Mutator`.
* **Python:** Sử dụng `mutmut`.

### Hệ quả (Consequences)
* **Tích cực:** Đảm bảo độ tin cậy tuyệt đối của bộ test. Nếu lập trình viên sửa code logic mà test vẫn chạy pass, Mutation Testing sẽ cảnh báo ngay lập tức.
* **Tiêu cực:** Mutation Testing chạy rất chậm vì nó phải biên dịch và chạy lại bộ test hàng trăm lần (cho mỗi đột biến). Cần cấu hình chạy song song và chỉ chạy định kỳ (ban đêm) hoặc chạy giới hạn trên các file thay đổi trong PR.
* **Hạn chế kỹ thuật (Python mutmut):** Đối với các script Python có dấu gạch ngang trong tên file (như `token-analyzer.py`), việc import động bằng `importlib` trong file test sẽ làm lệch module path mà mutmut theo dõi (trampoline hit mismatch). Để khắc phục, khuyến khích đặt tên file Python theo chuẩn snake_case (`token_analyzer.py` thay vì `token-analyzer.py`) đối với các module nghiệp vụ cần chạy kiểm thử đột biến, hoặc chỉ áp dụng cho các package Python chuẩn.

---

## ADR 3: Chặn Lỗi Ở Local Bằng Git Hooks (pre-commit / pre-push)

### Bối cảnh (Context)
Lập trình viên thường quên chạy test hoặc định dạng code trước khi đẩy lên PR, dẫn đến việc CI/CD pipeline liên tục bị đỏ/fail, làm lãng phí tài nguyên máy chủ CI/CD và làm gián đoạn tiến trình tích hợp liên tục.

### Quyết định (Decision)
Triển khai Husky và lint-staged để tự động chạy linter và unit test nhanh cục bộ ngay trên máy lập trình viên trước khi commit/push code.

### Hệ quả (Consequences)
* **Tích cực:** Đảm bảo 100% code được đẩy lên Github đã qua định dạng chuẩn và pass unit test cơ bản ở local. Tiết kiệm tài nguyên CI/CD.
* **Tiêu cực:** Commit và push code chậm hơn một chút do phải đợi chạy hook (khoảng 3-10 giây tùy quy mô file sửa đổi).
