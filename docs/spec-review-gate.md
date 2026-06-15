# Quy Trình Spec Review Gate & Definition of Done (DoD)

> **Mục tiêu:** Thiết lập các chốt chặn chất lượng (quality gates) tại khâu tiếp nhận yêu cầu và bàn giao code để loại bỏ hoàn toàn các lỗi logic và lỗi biên ngay từ đầu.

---

## 1. Quy Trình Spec Review Gate (Three-Way Handshake)

Trước khi bất kỳ một tính năng hay ticket nào được phép đưa vào lập trình (trạng thái "In Progress"), tài liệu mô tả yêu cầu (Specs / Ticket Description) bắt buộc phải trải qua khâu duyệt **Spec Review Gate** bằng sự đồng thuận của 3 vai trò:

```
┌──────────────┐      ┌────────────────┐      ┌──────────────┐
│  Product PM  │ ───> │  Lead Dev Tech │ ───> │   QA Lead    │
└──────────────┘      └────────────────┘      └──────────────┘
  (Viết Specs)         (Duyệt kỹ thuật)         (Duyệt Edge-cases)
```

### 1.1. Trách nhiệm của từng vai trò tại Gate
1. **Product Manager (PM):** Viết tài liệu Specs mô tả rõ ràng luồng chạy chuẩn (happy path) và các giá trị mong muốn của người dùng.
2. **Lead Developer (Tech Lead):** Đánh giá tính khả thi về mặt kỹ thuật, kiến trúc cơ sở dữ liệu, các điểm tích hợp hệ thống, và hiệu năng.
3. **QA Lead:** Thực hiện phân tích các trường hợp biên, các kịch bản ngoại lệ, kịch bản lỗi, và thiết lập bộ khung kiểm thử.

### 1.2. Checklist đánh giá để vượt qua Spec Review Gate
Một tài liệu yêu cầu được coi là đạt yêu cầu và cho phép Dev lập trình khi trả lời đầy đủ các câu hỏi sau:
- [ ] Mọi trường dữ liệu đầu vào đều có quy định rõ ràng về **giới hạn độ dài, kiểu dữ liệu, định dạng chấp nhận**.
- [ ] Có specs cụ thể mô tả hành vi của hệ thống khi **xảy ra lỗi** (ví dụ: lỗi mạng, lỗi database, API bên thứ ba không phản hồi).
- [ ] Có specs mô tả cách xử lý khi **người dùng thao tác dị** (ví dụ: click nút gửi 2 lần liên tiếp, đóng trình duyệt khi đang thanh toán).
- [ ] Specs có các quy tắc phân quyền rõ ràng (role-based access control).

---

## 2. Tiêu Chuẩn Hoàn Thành Công Việc (Definition of Done - DoD) Mới

Để đảm bảo chất lượng đầu ra tối đa, mọi Pull Request (PR) của Developers muốn được phê duyệt và trộn vào nhánh chính (`main` / `master`) phải đáp ứng 100% tiêu chuẩn DoD sau:

### 2.1. Yêu cầu về Code & Linting
- [ ] Mã nguồn đã được định dạng và quét linting thành công, không còn cảnh báo đỏ (0 errors, 0 warnings).
- [ ] Đã qua review của ít nhất một thành viên khác trong đội ngũ phát triển và giải quyết xong toàn bộ bình luận.

### 2.2. Yêu cầu về Kiểm Thử (Mandatory Testing)
- [ ] **100% Unit Test chạy pass** trên môi trường local và CI.
- [ ] **Độ bao phủ code (Code Coverage):** Đạt tối thiểu **80%** cho các file logic mới hoặc file sửa đổi (chỉ tính file logic nghiệp vụ, loại trừ file config/UI thuần).
- [ ] **Property-Based Testing:** Bắt buộc viết ít nhất một test case PBT cho các hàm xử lý tính toán hoặc chuyển đổi dữ liệu phức tạp.
- [ ] **Mutation Testing Score:** Đạt tối thiểu **75%** lượng mutants bị tiêu diệt đối với các file thay đổi thuộc vùng logic nghiệp vụ lõi (được quét tự động bởi Stryker/mutmut).

### 2.3. Yêu cầu về Regression & Lỗi Lọt
- [ ] Nếu PR này nhằm mục đích sửa một lỗi (Bug Fix) từ production, bắt buộc phải viết kèm một bài Unit Test mô phỏng lại lỗi đó (Regression Test). Bài test này phải bị Fail trước khi sửa code và Pass sau khi sửa code thành công.
