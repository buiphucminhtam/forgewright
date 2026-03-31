# GPU Profiling & Draw Call Optimization Protocol (Human-in-the-loop V8.0)

As an AI, you are blind to the visual render pipeline. You cannot see Frame Debuggers or GPU memory allocation visually. When tasked with performance optimization in a 3D Game Engine (Unity/Unreal), you MUST rely on the User to be your "Eyes".

## The Profiling Checklist

Before refactoring code to "fix lag", you must halt execution and ask the User to perform the following Visual Profiling steps and report the numbers back to you:

### 1. The Draw Call Audit
Ask the User to open the **Stats Panel** (Game View) or **Frame Debugger**.
- **User Query:** "Bạn hãy mở Game View Stats hoặc Frame Debugger lên, và cho tôi biết con số **Batches** (Draw Calls) và **Saved by batching** đang là bao nhiêu? Nếu Batches > 1000 cho Mobile hoặc > 2500 cho PC, chúng ta đang dính hẹp cổ chai Draw Call."
- **AI Action:** If Batches are high, implement SRP Batcher standards (Unity) or Instanced Static Meshes (Unreal), modify materials to share properties, and enable GPU Instancing on shaders.

### 2. The Overdraw Audit
Ask the User to switch the Scene Debug view to **Overdraw**.
- **User Query:** "Bạn hãy chuyển chế độ nhìn trong Scene View sang Overdraw. Những khu vực nào trên màn hình đang rực sáng màu Trắng/Đỏ chói? (Ví dụ: Chỗ có Grass, Particle khói nổ, Mặt Kính...)."
- **AI Action:** If Overdraw is severe, optimize Particle Systems (reduce emission rates, increase max size), implement quad-stripping for UI, and enforce Opaque over Transparent materials where possible.

### 3. The Memory / VRAM Allocation Audit
Ask the User to open the **Memory Profiler**.
- **User Query:** "Hãy mở Memory Profiler và cho tôi biết VRAM đang báo bao nhiêu MB? Bảng tóm tắt chỉ ra Đối tượng nào đang nuốt nhiều Ram nhất (Texture 2D, hay Mesh, hay AudioClip)?"
- **AI Action:** If Textures are consuming VRAM, automatically write scripts/configurations to crunch Textures (e.g. ASTC/ETC2), generate MipMaps, and cap Max Size. If Audio is the issue, force `Load in Background` and format to `Vorbis`/`MP3`.

## STRICT BANS
- **NEVER** guess optimization solutions. Optimization without metrics is premature.
- **NEVER** write Object Pooling scripts unless the Profiler (via user feedback) confirms GC Spikes (Garbage Collection) are causing the frame drops (stutters).
