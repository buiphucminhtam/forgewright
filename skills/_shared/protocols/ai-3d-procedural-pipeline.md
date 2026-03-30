# AI 3D Procedural Kitbashing Pipeline (Zero-Cost 85/15)

Trái với 2D (Generative Art dễ dàng kiểm soát pixel), Game 3D yêu cầu Topology chuẩn lưới, UV Mapping và Poly-count tối ưu. Việc sử dụng Text-to-3D AI Model thường cho ra sản phẩm kém chất lượng với chi phí API cực kỳ cao.

Vì vậy, Forgewright **cấm việc sử dụng Text-To-3D AI** trong quá trình Build Game thông thường. Thay vào đó, chúng ta áp dụng tư duy lập trình viên: **"Thủ tục, Lắp ghép, và Mượn đồ" (Procedural Kitbashing)**.

## Quy tắc 85/15 Tiêu chuẩn
Đây là chìa khóa để hoàn thiện dự án Game 3D nhanh gấp 10 lần:
- **85% (Môi trường, Đồ vật, Thực vật):** Phải được sinh ra BẰNG CODE (Cellular Automata, Wave Function Collapse) hoặc LẮP GHÉP (Kitbash) từ các Engine Plugin Mã Nguồn Mở.
- **15% (Nhân vật Chính, Boss, Vũ khí Đặc biệt):** Mới được cấu hình tay, thuê Artist hoặc tự dùng Blender Sculpting.

## Bộ Công cụ (Ver 2026 - Miễn Phí / Open Source)

Toàn bộ Vòng đời 3D phải xoay quanh các Plugin sau, và chúng ta giao tiếp với chúng qua Code/JSON:

### 1. Sinh Vùng đất & Tòa nhà (Level Design)
Mọi bối cảnh Game phải được phân chia thành **Gạch cơ bản (Modular Blocks)** như: `Tường`, `Sàn`, `Mái`, `Thùng Phuy`. Level Designer không vẽ Map bằng chữ, mà hãy cấu hình file JSON (VD: `dungeon_map.json`) chứa tọa độ `x, y, z` rải rác các viên gạch này.

- **Unity:** Dùng thư viện C# [Syomus/ProceduralToolkit](https://github.com/Syomus/ProceduralToolkit) để sinh mê cung (Maze) và Phòng (Cellular Automata).
- **Unreal Engine 5:** Sử dụng **PCG Framework** kết hợp với các Block mô hình siêu chất lượng (tương thích Unreal) từ các gói Assets CC0 hoặc **KitBash3D: Mission to Minerva**.

### 2. Sinh Thực vật Môi trường (Environment)
- Tuyệt đối không model từng cái lá.
- Mọi thảm thực vật phải cài đặt bằng lệnh sinh procedural thông qua công cụ như **EZ-Tree** (Mã nguồn mở tạo cây 3D Low-poly). AI có thể tự động viết script xuất file `.fbx` với poly-count được tính toán sẵn.

### 3. Sinh PBR Textures (Game Asset VFX)
- Thay vì lấy ảnh từ mạng (bản quyền hên xui) hoặc phải mua Substance, hãy dùng **Material Maker 1.5** (Godot-based / Mã nguồn mở).
- Quá trình này hoàn toàn bằng Code Nodes. AI Asset VFX phải hướng dẫn cụ thể thông số Nodes (Noise, Blur, Sharpen) để sinh ra `Normal Map`, `Roughness Map` tự động.

## Flow Thực Thi (Workflow)

1. **Game Designer:** Nghĩ ra Cấu trúc Concept. Rõ ràng liệt kê ra 1 list các "Modular Pieces" cần mượn (VD: Sàn Gỗ, Giường, Bàn).
2. **Level Designer:** Tính toán Ma trận `(x, y, z)` và lưu ra file `map_data.json`.
3. **Python Bridge:** Orchestrator / Unity Engineer gọi lệnh `python scripts/kitbash-assembler.py map_data.json` để load cấu trúc này ném thẳng vào Scene Map trong Editor mà không thao tác chuột.
4. **VFX & Asset:** Generate Textures bằng PBR node math và gắn đè lên map.

> **KIỂM TRA CỔNG MCP (GATE CHECK):**
> Kỹ sư Unity/Unreal BẮT BUỘC phải dùng `fw_request_gate_approval` trước khi chạy lệnh Python import khối lượng lớn. Hậu quả của thao tác chèn nhầm Map hàng nghìn object sẽ gây Crash Editor không cứu vãn được.
