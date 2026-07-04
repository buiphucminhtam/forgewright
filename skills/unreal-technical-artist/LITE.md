---
name: unreal-technical-artist
description: "Orchestrates Unreal Engine shader material networks, Niagara visual effect particles, HLSL custom expression nodes, and GPU rendering profiling. Use when the user requests custom Unreal materials, Niagara systems, custom post-process passes, shader optimization, or rendering pipeline audits in Unreal Engine."
version: 1.0.0
---

# Unreal Technical Artist (LITE)

## SOLVE Step 2: GROUND (Unreal Technical Artist Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Target Unreal project configuration exists | `find . -maxdepth 2 -name "*.uproject"` | ... | run the check command and paste output |
| Project-specific tech stack and profile settings are active | `cat .forgewright/project-profile.json` | ... | run the check command and paste output |
| Shader files, HLSL materials, or Niagara assets are indexed | `find Content/ -name "*.uasset" -o -name "*.hlsl" -o -name "*.ush"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Unreal Technical Artist Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Review material node networks, vector math constraints, and rendering queues | Verify transparency queues, blend modes (e.g., Masked), and shader instruction counts are within budgets.
2. COMPILE | Implement vertex/fragment math inside custom HLSL expression blocks | Ensure custom HLSL code uses optimized GPU vectors and compiles without compilation errors.
3. PROFILE | Analyze shader register pressure, overdraw overhead, and instruction bounds | Confirm floating-point precision levels are bounded (e.g., using half/min16float) to optimize rendering performance.

## Common Mistakes Checklist
- **Overusing Dynamic Instruction Loops**: Writing high-overhead dynamic branching (`if`) or heavy trigonometric functions inside custom HLSL expressions instead of using fast math approximations, causing GPU pipeline stalls.
- **Unbounded Material Expression Parameter Flooding**: Exposing too many uncompressed scalar/vector parameters without utilizing Material Parameter Collections (MPC) or Instance material variants.
- **Ignoring Depth Testing and Vertex Cache Thrashing**: Neglecting early-Z testing or running heavy vertex deformations on dense high-poly meshes, reducing frame rates on VR/mobile platforms.
- **Non-Compliant File Names**: Storing shader blueprints, Niagara layout specs, or optimization documents under `docs/` using CamelCase instead of strictly lowercase kebab-case (e.g., `docs/02-architecture/PostProcessShader.md` instead of `docs/02-architecture/post-process-shader.md`).

### Step 1: Ground target project settings
```bash
find . -maxdepth 2 -name "*.uproject"
cat .forgewright/project-profile.json
```

### Step 2: Write an optimized, custom HLSL wind deformation shader function in `Shaders/WindDeformation.ush`
```hlsl
// Secure, high-integrity vertex wave deformation shader
// Grounded: Framerate-independent animation using Unreal Time parameters
float3 CalculateWindDeformation(float3 InPosition, float WindSpeed, float WindStrength, float GlobalTime)
{
    float wave = sin(GlobalTime * WindSpeed + InPosition.x * 0.05) * WindStrength;
    float3 offset = float3(wave, 0.0, wave * 0.2);
    return InPosition + offset;
}
```

### Step 3: Run pre-flight linting or syntax checks on the shader module
```bash
# Check if custom HLSL structure follows standard formats
cat Shaders/WindDeformation.ush
```
