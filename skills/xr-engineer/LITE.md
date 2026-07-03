---
name: xr-engineer
description: "Orchestrates spatial computing, immersive stereoscopic viewport calculations, WebXR interactions, and VR/AR platform rendering setups. Use when the user requests WebXR integration, Unity/Unreal spatial camera layouts, Three.js immersive scenes, coordinate system transforms, or stereoscopic rendering optimizations."
version: 1.0.0
---

# Xr Engineer (LITE)

## SOLVE Step 2: GROUND (Xr Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target XR package declarations and 3D dependencies are defined | `cat package.json \| jq '.dependencies \| select(. != null) \| with_entries(select(.key \| match(\"three\\|babylon\\|webxr\\|xr\")))'` | Identifies active immersive frameworks and spatial computing libraries | |
| Project-specific tech stack and profile configurations are active | `cat .forgewright/project-profile.json` | Displays active engine requirements and framework baseline targets | |
| Standardized product templates and feature spec guidelines are loaded | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional specs and BDD behaviors | |
| Running token tracker budget and spending safety ceilings are active | `cat .forgewright/budget.yaml` | Verifies active session spend boundaries prior to initiating tasks | |

## SOLVE Step 3: DECOMPOSE (Xr Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate WebXR viewport layers, transformation matrices, and coordinate boundaries | Ensure matrix hierarchies and spatial translations prevent coordinate drifting.
2. COMPILE | Construct vertex/fragment shaders or custom spatial translation algorithms | Confirm that interactive raycast calculations resolve intersecting coordinates cleanly.
3. PROFILE | Analyze frame rates, draw-call batches, and stereoscopic double-render performance | Verify that rendering speeds hit target refresh rate margins (e.g., 90Hz/120Hz) on mobile devices.
4. SYNC | Document spatial specs as lowercase kebab-case under docs/ and run sync hooks | Check naming conventions and run sync-obsidian to establish absolute symlinks.

## Common Mistakes Checklist
- **Incorrect Matrix Transformation Order**: Multiplying translation and rotation matrices in the incorrect order (e.g., applying translations before rotations), causing meshes to orbit wildly instead of rotating in place.
- **Ignoring Stereoscopic Frame Doubling**: Neglecting single-pass instanced rendering, forcing the engine to perform independent draw calls for each eye, degrading frame rates below comfortable immersive bounds.
- **Unbounded Frame Loop Allocations**: Instantiating new Vector3 or Matrix4 objects inside high-frequency render loops (`requestAnimationFrame`), triggering massive Garbage Collection stutters.
- **Non-Compliant Document File Naming**: Storing spatial designs, assets specifications, or integration records under `docs/` using CamelCase instead of strictly lowercase kebab-case (e.g., `docs/01-product/XRManager.md` instead of `docs/01-product/xr-manager-spec.md`).
- **Unverified Token Budgets on Asset Generation**: Initiating automated 3D model generation processes or calling highly detailed image/mesh queries without verifying budget boundaries inside `.forgewright/budget.yaml`.

## Worked Example

### Step 1: Ground the active XR configuration settings
```bash
cat .forgewright/project-profile.json
cat package.json | grep -E "(three|webxr)"
```
Output:
```json
{
  "project_name": "forgewright-webxr-portal",
  "tech_stack": ["Three.js", "WebXR", "TypeScript"],
  "health_status": "PASS"
}
```
```json
    "three": "^0.160.0",
    "@types/three": "^0.160.0"
```

### Step 2: Implement an optimized, frame-rate independent 3D coordinate rotator in `src/spatial/rotator.ts`
```typescript
import * as THREE from 'three';

export class SpatialRotator {
  private target: THREE.Object3D;
  private rotationSpeed: THREE.Vector3;

  constructor(target: THREE.Object3D, speed: THREE.Vector3) {
    this.target = target;
    // Grounded: Rotation speed configured in radians per second
    this.rotationSpeed = speed;
  }

  // Frame-rate independent update function
  public update(deltaTime: number): void {
    if (deltaTime <= 0) return;
    
    // Calculate delta step
    const deltaX = this.rotationSpeed.x * deltaTime;
    const deltaY = this.rotationSpeed.y * deltaTime;
    const deltaZ = this.rotationSpeed.z * deltaTime;

    // Correct multiplication order: Apply local rotation before global transform
    this.target.rotateX(deltaX);
    this.target.rotateY(deltaY);
    this.target.rotateZ(deltaZ);
  }
}
```

### Step 3: Run local unit tests to verify rotation transformations
```bash
npx vitest run tests/rotator.test.ts
```
Output:
```
✓ tests/rotator.test.ts > SpatialRotator > should rotate target correctly over time (15ms)

Test Files  1 passed (1)
Tests       1 passed (1)
Time        0.82s
```

### Step 4: Write specifications and run the post-skill sync hook to Obsidian
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/02-architecture/webxr-rotation-spec.md
# Spatial Spec: WebXR Frame-Rate Independent Rotator

## 1. Executive Summary
Provide a modular, frame-rate independent rotation system inside WebXR/Three.js environments to prevent stuttering.

## 2. Technical Profile
- Runtime Target: Three.js (WebGL2 Context)
- Math Model: Local Euler rotation transformations using standardized radians
- Memory Bounds: Zero global frame loop allocations to minimize garbage collection stutters
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for webxr-rotation-spec.md.
[SUCCESS] Symlinked docs/02-architecture/webxr-rotation-spec.md to /workspace/shared-obsidian-vault/forgewright/02-architecture/webxr-rotation-spec.md.
```
