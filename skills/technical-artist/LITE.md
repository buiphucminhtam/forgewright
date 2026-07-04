---
name: technical-artist
description: "Orchestrates technical art pipelines, shader performance optimization, asset validation, and DCC tools integration. Use when the user requests shader development, rendering optimization, materials setup, game asset pipelines, or asset automation across game engines like Unity, Unreal, Godot, or WebGL/Three.js."
version: 1.0.0
---

# Technical Artist (LITE)

## SOLVE Step 2: GROUND (Technical Artist Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target assets and metadata schemas are in correct project folders | `find assets/ -name "*.meta" -o -name "*.json"` | ... | Y/N |
| Active shader compiler or engine pipelines are available (e.g., glslangValidator, Node/Three) | `which glslangValidator \|\| npm list -g` | ... | Y/N |
| Project-specific tech stack and render pipeline are onboarded | `cat .forgewright/project-profile.json` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Technical Artist Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. INSPECT | Intake raw 3D assets/materials and check bounds/hierarchies | Verify polygon budgets, texture dimensions (power of two), and standard naming conventions match project rules.
2. OPTIMIZE | Compile/minify shaders or strip unused mesh metadata and vertex attributes | Confirm vertex counts and draw calls are minimized to avoid performance bottlenecks.
3. CONVERT | Export assets into engine-compliant formats (e.g., GLB, FBX, or engine prefabs) | Ensure materials match the active render pipeline (e.g., PBR metallic-roughness vs standard specular).
4. VALIDATE | Automate E2E asset checks via GitNexus or local CI pipeline hooks | Verify that no broken references or missing textures exist prior to committing assets [5, 7].

## Common Mistakes Checklist
- **Non-power-of-two (NPOT) texture dimensions**: Deploying textures without resizing them to power-of-two dimensions (e.g., 1024x1024), causing mipmap generation failure or excessive GPU memory utilization.
- **Mismatched coordinate systems and vertex normals**: Importing raw assets without resetting pivots or transforming coordinate systems (e.g., Z-up to Y-up), causing offset placements or inverted backface culling.
- **Unoptimized shader loops and branch instruction overhead**: Placing highly dynamic branches or loops in fragment shaders, causing GPU execution bottlenecks on target devices.
- **Leaked material instances**: Instantiating materials programmatically in updates without proper memory tracking, leading to continuous WebGL or engine GPU leaks.
- **Ignoring asset naming conventions**: Storing meshes or material files with uppercase letters or space separators instead of strictly lowercase kebab-case in asset directories.

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Check shader validation tools and current project profile
```bash
which glslangValidator || echo "Using Three.js pipeline"
cat .forgewright/project-profile.json
```

### Step 2: Write an optimized PBR vertex/fragment shader pair under `assets/shaders/custom-pbr.frag`
```bash
cat << 'EOF' > assets/shaders/custom-pbr.frag
precision highp float;

varying vec3 vNormal;
varying vec2 vUv;

uniform vec3 uBaseColor;
uniform float uRoughness;
uniform float uMetalness;

void main() {
  // Simple optimized PBR estimation to avoid dynamic loop branch overhead
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(1.0, 1.0, 1.0)); // Fixed light direction
  float NdotL = max(dot(N, L), 0.0);
  
  vec3 diffuse = uBaseColor * NdotL * (1.0 - uMetalness);
  vec3 specular = vec3(1.0) * pow(NdotL, mix(100.0, 1.0, uRoughness)) * uMetalness;
  
  gl_FragColor = vec4(diffuse + specular, 1.0);
}
EOF
```

### Step 3: Run shader static analysis to verify compilation and performance limits
```bash
# Validate glsl shader code validity
# For WebGL/Three, run the linter or mock bundler validation check
node scripts/validate-shaders.js
```
