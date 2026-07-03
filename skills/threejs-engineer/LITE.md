---
name: threejs-engineer
description: "Orchestrates WebGL rendering pipelines, scene graphs, custom shaders, and 3D asset loaders via Three.js. Use when the user requests 3D interactive visualizations, browser-based games, custom GPU shaders, GLTF/GLB assets integration, or WebGL performance optimizations [1, 2]."
version: 1.0.0
---

# Threejs Engineer (LITE)

## SOLVE Step 2: GROUND (Threejs Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Three.js and associated packages are installed in the workspace [1] | `cat package.json \| jq '.dependencies["three"]'` | Confirms Three.js WebGL engine version | |
| Existing WebGL components, canvases, or scenes are indexed [3] | `find src/ -name "*canvas*" -o -name "*three*" -o -name "*scene*"` | Lists active 3D source files and renderer hook locations | |
| Playwright test harness is configured for Visual Regression Testing (VRT) [4] | `cat playwright.config.ts` | Validates headless browser snapshot testing configurations | |
| Active API budget limits are set for complex spatial calculation loops [1, 5] | `cat .forgewright/budget.yaml` | Displays configured API token thresholds and safety caps | |

## SOLVE Step 3: DECOMPOSE (Threejs Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. ALIGN | Map coordinate systems (e.g., Blender Z-up to Three.js Y-up) and camera bounds | Ensure clipping planes (`near`/`far`), field of view (`fov`), and canvas aspect ratios are configured dynamically.
2. COMPILE | Create or optimize WebGL shader programs and material configurations | Verify custom glsl fragment and vertex shaders compile without syntax errors or register limits.
3. LOAD | Load and traverse GLTF/GLB models using standard `GLTFLoader` engines | Validate that all loaded meshes utilize unified buffers, optimized geometries, and correct textures.
4. SNAP | Capture rendering frames via local Playwright visual regression tests [4] | Verify pixel-level render outputs against standard baseline snapshots to identify visual drift.

## Common Mistakes Checklist
- **WebGL Memory leak via undisposed resources**: Creating new geometry, materials, or textures programmatically inside render or animation updates without calling `.dispose()`, triggering eventual GPU crashes.
- **NPOT (Non-Power-of-Two) texture sizes**: Loading custom images or textures that do not utilize power-of-two dimensions (e.g., 512x512 or 1024x1024), breaking mipmap generation on older mobile GPUs.
- **Blocking animation updates**: Running heavy calculations, console log spam, or synchronous file reads within the high-frequency `requestAnimationFrame` render loop, reducing frame rate.
- **Mismatched light and material types**: Implementing PBR materials (e.g., `MeshStandardMaterial`) without configuring active lighting in the scene, resulting in fully black renders.
- **Non-compliant naming patterns**: Saving documentation, test assets, or shader files using uppercase letters, camelCase, or spaces instead of strictly lowercase kebab-case (e.g., `threejs-renderer-audit.md`) [6].

## Worked Example

### Step 1: Check Three.js dependency version in package.json
```bash
cat package.json | grep -E "three"
```
Output:
```json
    "three": "^0.160.0",
    "@types/three": "^0.160.0"
```

### Step 2: Implement a lightweight, optimized WebGL renderer under `src/threejs-scene.ts`
```typescript
import * as THREE from 'three';

export function createInteractiveScene(canvas: HTMLCanvasElement) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  
  // Set up standard lighting for PBR material compatibility
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  // Generate a mesh using reusable geometries and materials
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, roughness: 0.4 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);
  
  camera.position.z = 5;

  let animationFrameId: number;

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);
    // Safe: keep lightweight rotations inside the loop to preserve high FPS
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render(scene, camera);
  };
  
  animate();

  // Return explicit teardown hooks to prevent WebGL context memory leaks
  return {
    scene,
    renderer,
    dispose: () => {
      cancelAnimationFrame(animationFrameId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    }
  };
}
```

### Step 3: Run regression tests to verify canvas rendering
```bash
npx playwright test tests/visual-regression.spec.ts
```
Output:
```
[INFO] Initializing WebGL regression validation...
[VRT] Snapshot test matched base asset (0.00% pixel mismatch detected) [4].
[SUCCESS] Generated docs/04-testing/threejs-rendering-audit.md [6].
```
