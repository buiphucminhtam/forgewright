# Biểu Mẫu Báo Cáo Nguyên Nhân Lỗi Lọt (Post-Mortem / Root Cause Analysis)

> **Mục tiêu:** Hướng dẫn phân tích nguyên nhân gốc rễ (RCA) của các lỗi lọt lên production, tìm ra kẽ hở trong quy trình kiểm thử và cập nhật hệ thống để lỗi tương tự không lặp lại lần thứ hai.

---

## 1. Thông Tin Chung (Incident Overview)

* **Tên sự cố (Incident Name):** [Mô tả ngắn gọn về lỗi, ví dụ: Crash trang đăng nhập khi dùng Safari]
* **Mức độ ảnh hưởng (Severity):** [Critical / High / Medium]
* **Ngày phát hiện (Date Detected):** [YYYY-MM-DD]
* **Ngày khắc phục xong (Date Resolved):** [YYYY-MM-DD]
* **Người phụ trách phân tích (Owner):** [Tên Tester hoặc Developer]

---

## 2. Mô Tả Hiện Tượng & Tác Động (Symptom & Impact)

* **Hiện tượng xảy ra:** [Mô tả những gì người dùng cuối đã gặp phải]
* **Dữ liệu/Môi trường bị lỗi:** [Ví dụ: Production, HĐH iOS 17.2, thiết bị iPhone 15]
* **Tác động nghiệp vụ:** [Ví dụ: 15% khách hàng không thanh toán được trong 2 giờ, thiệt hại ước tính...]

---

## 3. Phân Tích Nguyên Nhân Gốc Rễ (Root Cause Analysis - 5 Whys)

*Áp dụng phương pháp hỏi "Tại sao" 5 lần để đào sâu tìm nguyên nhân gốc rễ.*

1. **Tại sao lỗi xảy ra ở production?**
   * $\rightarrow$ Trả lời: Do biến `payload` bị `null` khi người dùng nhấn double click.
2. **Tại sao biến `payload` bị `null`?**
   * $\rightarrow$ Trả lời: Do trạng thái state chưa được reset kịp khi gọi API lần thứ hai.
3. **Tại sao lỗi này không được phát hiện trong quá trình code của Developer?**
   * $\rightarrow$ Trả lời: Do Developer chỉ test luồng chuẩn (happy path) và click chuột 1 lần thông thường.
4. **Tại sao QA kiểm thử không phát hiện ra?**
   * $\rightarrow$ Trả lời: QA thiết kế test case dựa trên mô tả tĩnh của specs, không có kịch bản test double click hoặc test độ trễ kết nối.
5. **Tại sao specs không mô tả hoặc QA không nghĩ ra kịch bản này?**
   * $\rightarrow$ Trả lời: Do chưa áp dụng quy trình duyệt Spec Gate và Checklist thiết kế test case biên.

---

## 4. Lỗ Hổng Kiểm Thử (Testing Gaps)

* **Tại sao Unit Test không phát hiện?** [Do thiếu Unit Test phủ cho hàm xử lý state, hoặc thiếu Property-Based Test sinh dữ liệu ngẫu nhiên]
* **Tại sao E2E/Manual Test không phát hiện?** [Thiếu checklist kiểm tra việc nhấn đúp liên tục]

---

## 5. Hành Động Khắc Phục & Ngăn Chặn (Action Items)

| ID | Hành động ngăn ngừa lặp lại | Người thực hiện | Hạn hoàn thành | Trạng thái |
| :--- | :--- | :---: | :---: | :---: |
| **ACT-01** | Viết bổ sung Regression Unit Test mô phỏng chính xác luồng double click làm rỗng payload. | [Dev Name] | [Date] | [To-Do] |
| **ACT-02** | Cập nhật Checklist test case chung bổ sung kiểm tra double click cho toàn bộ các nút Submit. | [QA Name] | [Date] | [To-Do] |
| **ACT-03** | Tích hợp thư viện sinh dữ liệu ngẫu nhiên (PBT) vào module logic nghiệp vụ tương tự. | [Dev Name] | [Date] | [To-Do] |

---

## 6. Bài Học Rút Ra (Lessons Learned)
* [Viết bài học tâm đắc rút ra sau sự cố, ví dụ: Luôn giả định người dùng sẽ thao tác sai hoặc click nút liên tục].
