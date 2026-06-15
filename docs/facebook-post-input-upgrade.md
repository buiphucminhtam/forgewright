# Facebook Post: Nâng Cấp Khâu Tiếp Nhận Đầu Vào (v8.8.0)

***

"Làm cho anh cái web giống Shopee, cơ mà đơn giản thôi..." 🙃

Nếu bạn là dev, chắc chắn bạn đã từng muốn "gục ngã" trước những câu mô tả specs đầy tính trừu tượng như thế này từ PM hoặc khách hàng. Và khi AI nhận những yêu cầu mơ hồ đó, nó sẽ tự "ảo giác" ra logic, dẫn đến việc build sai tính năng và lọt bug biên liên tục.

Để xử lý tận gốc nỗi đau này, Forgewright v8.8.0 chính thức ra mắt bộ nâng cấp khâu tiếp nhận đầu vào (Interpret & Define) siêu nghiêm ngặt:

1. **Bộ lọc độ mơ hồ (Ambiguity Detector):** AI sẽ tự động chấm điểm câu lệnh của bạn. Nếu điểm mơ hồ > 0.4, nó sẽ lập tức "đình công" và hỏi làm làm rõ, không cho phép bạn code láo, code ẩu.
2. **Hỏi đến khi nào hiểu mới thôi (6W1H Completeness Score):** Không còn giới hạn 3 câu hỏi xã giao nữa. AI sẽ hỏi xoáy đáp xoay theo mô hình 6W1H cho đến khi đạt điểm hoàn thiện Specs >= 0.85 mới chịu làm việc.
3. **Chuẩn hóa Gherkin/BDD (Given/When/Then):** Mọi specs làm rõ sẽ tự động được viết dưới dạng kịch bản chạy test. Đầu vào chuẩn chỉ thế này thì QA AI phía sau chỉ việc auto-sinh test case chuẩn 100%.

Giờ đây, bạn có đưa Specs mơ hồ thế nào, Forgewright cũng sẽ gặng hỏi bằng được để ra specs chuẩn chỉnh. Chậm một chút ở khâu chuẩn bị, nhưng đầu ra cam kết không lọt lỗi!

Trải nghiệm ngay bản cập nhật v8.8.0 cực chất này nhé anh em! 👇

***
