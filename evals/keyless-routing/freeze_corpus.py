"""Author-labeled synthetic holdout. Run once before evaluating; not human labels."""

import hashlib
import json
from pathlib import Path

# Authored without running the selector. No label/performance-driven amendments.
CLEAR = {
    "game-build": [
        "Build a Unity game",
        "Help me with Godot",
        "Prototype gameplay for Roblox",
        "Create a video game",
        "Làm trò chơi với Unity",
        "Tạo trò chơi 2D",
        "Phát triển game bằng Godot",
        "Giúp tôi với Unreal Engine",
    ],
    "design": [
        "Create a visual concept for the product",
        "Prepare concept art",
        "Choose art direction",
        "Sketch a character design",
        "Thiết kế nhân vật chính",
        "Vẽ minh họa cho sản phẩm",
        "Làm bảng cảm hứng",
        "Định hướng mỹ thuật cho dự án",
    ],
    "full-build": [
        "Scaffold a new project",
        "Build a web application",
        "Create a website",
        "Start a new project",
        "Tạo dự án mới",
        "Xây dựng ứng dụng web",
        "Khởi tạo dự án",
        "Tạo trang web bán sách",
    ],
    "feature": [
        "Implement a feature for bookmarks",
        "Add functionality for exports",
        "Implement pagination",
        "Add a feature for search",
        "Thêm tính năng tìm kiếm",
        "Triển khai tính năng lọc",
        "Bổ sung chức năng xuất dữ liệu",
        "Cài đặt tính năng phân trang",
    ],
    "test": [
        "Run the unit tests",
        "Improve test coverage",
        "Perform QA on this module",
        "Write validation tests",
        "Viết kiểm thử đơn vị",
        "Chạy bộ kiểm thử",
        "Tăng độ phủ kiểm thử",
        "Kiểm thử mô đun này",
    ],
    "review": [
        "Perform a code review",
        "Review this pull request",
        "Review the patch",
        "Review the module for defects",
        "Rà soát mã nguồn",
        "Đánh giá mã nguồn",
        "Xem xét bản vá",
        "Rà soát thay đổi này",
    ],
    "ship": [
        "Deploy the application",
        "Ship this version",
        "Prepare a release",
        "Release the package",
        "Phát hành phiên bản mới",
        "Đưa ứng dụng lên máy chủ",
        "Xuất bản bản phát hành",
        "Triển khai lên production",
    ],
    "document": [
        "Write documentation for this module",
        "Update the README",
        "Document the public interface",
        "Improve documentation examples",
        "Viết tài liệu hướng dẫn",
        "Cập nhật tài liệu API",
        "Soạn tài liệu sử dụng",
        "Bổ sung tài liệu kỹ thuật",
    ],
    "optimize": [
        "Optimize the database query",
        "Reduce latency",
        "Improve runtime performance",
        "Optimize memory usage",
        "Tối ưu truy vấn dữ liệu",
        "Giảm độ trễ",
        "Cải thiện hiệu năng",
        "Tối ưu bộ nhớ",
    ],
    "research": [
        "Research available storage approaches",
        "Investigate the parser behavior",
        "Research browser compatibility",
        "Investigate this dependency",
        "Nghiên cứu cách lưu trữ",
        "Khảo sát giải pháp hiện có",
        "Tìm hiểu thư viện này",
        "Nghiên cứu khả năng tương thích",
    ],
    "architect": [
        "Plan the architecture",
        "Define the design system",
        "Architect the backend",
        "Evaluate architecture boundaries",
        "Thiết kế kiến trúc hệ thống",
        "Lập kiến trúc ứng dụng",
        "Thiết kế hệ thống",
        "Xác định kiến trúc dịch vụ",
    ],
    "analyze": [
        "Analyze these metrics",
        "Perform data analysis",
        "Analyze the data",
        "Interpret application metrics",
        "Phân tích dữ liệu",
        "Phân tích số liệu",
        "Phân tích báo cáo sử dụng",
        "Phân tích hành vi sử dụng",
    ],
}
AMBIGUOUS = [
    "Build a game and deploy it",
    "Review and test the module",
    "Research and implement this feature",
    "Document and optimize this API",
    "Create a website and write tests",
    "Analyze metrics and deploy the app",
    "Prepare concept art and review the code",
    "Optimize performance and update documentation",
    "Plan architecture and implement pagination",
    "Research and review the library",
    "Test and release the package",
    "Create a visual concept and analyze metrics",
    "Build a game or a mobile app",
    "Implement a feature or write documentation",
    "Research or deploy",
    "Review or analyze",
    "Tạo trò chơi và phát hành phiên bản",
    "Rà soát mã nguồn và kiểm thử",
    "Nghiên cứu và thêm tính năng",
    "Viết tài liệu và tối ưu bộ nhớ",
    "Tạo trang web và viết kiểm thử",
    "Phân tích dữ liệu và phát hành",
    "Vẽ minh họa và rà soát mã nguồn",
    "Tối ưu hiệu năng và viết tài liệu",
    "Thiết kế kiến trúc và thêm tính năng",
    "Nghiên cứu và rà soát thay đổi",
    "Kiểm thử và phát hành",
    "Thiết kế nhân vật và phân tích dữ liệu",
    "Tạo trò chơi hoặc ứng dụng di động",
    "Thêm tính năng hoặc viết tài liệu",
    "Nghiên cứu hoặc phát hành",
    "Rà soát mã nguồn hoặc phân tích dữ liệu",
]
OUT = [
    "Hello there",
    "What is the weather?",
    "Tell me a joke",
    "I bought a backgamemon board",
    "The scar is healing",
    "The latest contest was fun",
    "My radio is broken",
    "The paragraph is short",
    "Xin chào",
    "Hôm nay trời đẹp",
    "Kể chuyện vui đi",
    "Tôi muốn ăn phở",
    "Bạn khỏe không",
    "Mấy giờ rồi",
    "Cảm ơn bạn",
    "Đi dạo một chút",
]
rows = []
for mode, prompts in CLEAR.items():
    for i, prompt in enumerate(prompts):
        rows.append(
            dict(
                id=f"{mode}-{i + 1}",
                language="en" if i < 4 else "vi",
                prompt=prompt,
                expected_mode=mode,
                label="clear",
            )
        )
for label, prompts in [("ambiguous", AMBIGUOUS), ("out-of-scope", OUT)]:
    for i, prompt in enumerate(prompts):
        rows.append(
            dict(
                id=f"{label}-{i + 1}",
                language="en" if i < len(prompts) // 2 else "vi",
                prompt=prompt,
                expected_mode=None,
                label=label,
            )
        )
root = Path(__file__).resolve().parent
payload = "".join(
    json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows
).encode()
with (root / "holdout.jsonl").open("xb") as f:
    f.write(payload)
(root / "holdout.sha256").write_text(hashlib.sha256(payload).hexdigest() + "\n")
print(
    json.dumps(
        {
            "rows": len(rows),
            "sha256": hashlib.sha256(payload).hexdigest(),
            "labels": "synthetic author-labeled; not independently labeled",
            "performance_inspected": False,
        }
    )
)
