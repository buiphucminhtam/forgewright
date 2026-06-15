# Checklist Thiết Kế Test Case Biên & Edge Cases Tiêu Chuẩn

> **Mục tiêu:** Cung cấp bộ khung danh sách các trường hợp kiểm thử biên kinh điển để các Tester và Developers đối chiếu khi thiết kế test case, đảm bảo không bỏ sót bất kỳ kịch bản dữ liệu cực đoan nào.

---

## 1. Kiểm Thử Giao Diện & Form Nhập Liệu (Inputs & Forms)

### 1.1. Kiểu dữ liệu dạng Số (Numeric Fields)
* [ ] **Biên dưới và biên trên:** Test tại giá trị nhỏ nhất và lớn nhất chấp nhận được ($Min$ và $Max$).
* [ ] **Cận biên:** Test tại $Min-1$, $Min+1$, $Max-1$, $Max+1$.
* [ ] **Số âm và số 0:** Nếu trường chỉ nhận số dương, kiểm tra với số `0` và số âm (ví dụ: `-1`, `-99999`).
* [ ] **Định dạng số:** Nhập số thập phân (float), số thực có nhiều số sau dấu phẩy nếu trường chỉ nhận số nguyên (integer).
* [ ] **Giá trị cực đại của hệ thống:** Nhập số lớn hơn giới hạn lưu trữ của kiểu dữ liệu (ví dụ: lớn hơn `2,147,483,647` cho kiểu 32-bit int).

### 1.2. Kiểu dữ liệu dạng Chuỗi (String/Text Fields)
* [ ] **Độ dài chuỗi:** Test với chuỗi rỗng (`""`), chuỗi có độ dài bằng 1, độ dài bằng Max, độ dài bằng $Max+1$.
* [ ] **Ký tự đặc biệt:** Nhập các ký tự đặc biệt phổ biến (`!@#$%^&*()_+={}[]|\\:;"'<>,.?/~``).
* [ ] **Ký tự khoảng trắng (Whitespace):** Nhập chuỗi chỉ chứa khoảng trắng, nhập chuỗi có khoảng trắng ở đầu/cuối (trim check).
* [ ] **Chuỗi đa ngôn ngữ (Unicode):** Nhập các chữ có dấu (Tiếng Việt), chữ tượng hình (Tiếng Trung, Nhật, Hàn) hoặc ký tự viết từ phải qua trái (RTL - Tiếng Ả Rập).
* [ ] **Ký tự Emoji:** Nhập emoji đại diện để kiểm tra lỗi font hoặc lỗi encode cơ sở dữ liệu (UTF-8 vs UTF-8mb4).

### 1.3. Kiểu dữ liệu dạng Ngày/Giờ (Date/Time Fields)
* [ ] **Định dạng ngày:** Nhập ngày không tồn tại (ví dụ: ngày 30/02, ngày 31/11, ngày 29/02 của năm không nhuận).
* [ ] **Múi giờ khác biệt (Timezone):** Kiểm tra hiển thị và lưu trữ ngày giờ khi người dùng ở các múi giờ khác nhau (ví dụ: GMT+7 vs UTC).
* [ ] **Điểm mốc thời gian:** Test ngày trong quá khứ, ngày hiện tại, và ngày trong tương lai (tùy thuộc yêu cầu nghiệp vụ).

---

## 2. Kiểm Thử Nghiệp Vụ API & Tích Hợp (API & Integration)

### 2.1. Payload & Định dạng API
* [ ] **Thiếu trường bắt buộc (Missing fields):** Gửi request API thiếu các tham số bắt buộc trong Header, Query Params hoặc Body.
* [ ] **Trường dư thừa:** Gửi kèm các trường dữ liệu lạ không nằm trong specs để kiểm tra khả năng lọc của API.
* [ ] **Sai kiểu dữ liệu:** Gửi chuỗi cho trường số, gửi mảng cho trường object.

### 2.2. Kiểm soát lỗi hệ thống (Error Handling)
* [ ] **Lỗi 500 Internal Server Error:** Mô phỏng database bị crash hoặc ngắt kết nối đột ngột để kiểm tra API có trả về mã lỗi bảo mật (như lộ stack trace) hay không.
* [ ] **Lỗi Timeout:** Giả lập API bên thứ ba phản hồi cực chậm để kiểm tra cơ chế Timeout và Circuit Breaker của hệ thống.
* [ ] **Gọi API liên tiếp (Rate Limit):** Gửi hàng loạt request API liên tục trong thời gian ngắn để kiểm tra hệ thống bảo vệ chống DDoS.

---

## 3. Kiểm Thử Trạng Thái Bất Đồng Bộ & Độc Lạ (Async & UX Edge Cases)

### 3.1. Thao tác double click / Click liên tiếp
* [ ] Nhấp liên tục vào nút **Submit** / **Thanh toán** để kiểm tra hệ thống có sinh ra giao dịch trùng lặp hay không (Idempotency check).

### 3.2. Gián đoạn kết nối (Network Interruptions)
* [ ] Đang tải dữ liệu hoặc đang thanh toán thì ngắt kết nối mạng (hoặc bật chế độ máy bay) để kiểm tra ứng dụng có crash hay hiển thị thông báo lỗi thân thiện không.

### 3.3. Thao tác trên trình duyệt
* [ ] Nhấn nút **Back** của trình duyệt sau khi đã đăng xuất (Logout) hoặc sau khi đã thanh toán thành công để xem có truy cập lại trang bảo mật được không.
* [ ] Tải lại trang (F5/Reload) khi luồng dữ liệu đang xử lý dở dang.
