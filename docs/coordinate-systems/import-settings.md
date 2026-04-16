# Game Engine Import Settings Guide

> Detailed guide for importing assets correctly across Unity, Godot, Unreal, and Blender.

## Table of Contents

1. [Blender → Unity](#1-blender--unity)
2. [Blender → Godot](#2-blender--godot)
3. [Blender → Unreal](#3-blender--unreal)
4. [glTF/GLB Pipeline](#4-gltfglb-pipeline)
5. [FBX Pipeline](#5-fbx-pipeline)
6. [Common Import Issues](#6-common-import-issues)

---

## 1. Blender → Unity

### Step 1: Prepare in Blender

```javascript
// Before Export Checklist
1. Apply All Transforms (Object > Clear > Apply > All Transforms)
   - Shortcut: Ctrl+A > All Transforms

2. Check Scale
   - Scene Properties > Units > Metric
   - Scale: 1.00

3. Recalculate Normals
   - Edit Mode > Mesh > Normals > Recalculate Outside
   - Shortcut: Shift+N

4. Fix Negative Scale (if any)
   - Object > Transform > Scale to 1.0
   - If object is mirrored, apply scale first

5. Name Convention
   - Use meaningful names (e.g., "Character_FBX", "Tree_Pine")
   - Avoid special characters: !@#$%^&*()
   - Use underscores or PascalCase
```

### Step 2: Export Settings (FBX)

```javascript
Blender Export Dialog:
├── Format: FBX
├── Filepath: /path/to/export/ModelName.fbx
│
├── Include:
│   ├── ✓ Selected Objects (if specific selection)
│   ├── ✓ Object Types: Mesh, Armature (unchanged)
│   └── Exclude: Armature (if static mesh)
│
├── Transform:
│   ├── Scale: 1.0
│   ├── Apply Scalings: All Local (recommended)
│   ├── Forward: -Y Forward        // CRITICAL for Unity
│   ├── Up: Z Up                   // CRITICAL for Unity
│   └── Apply Transform: ✓         // CRITICAL
│
├── Armature:
│   ├── Primary Bone Axis: Y
│   ├── Secondary Bone Axis: X
│   └── Armature FBXNode Type: Null
│
├── Animation:
│   ├── ✓ Baked Animation
│   ├── Key All Bones: ✓
│   ├── NLA Strips: (based on need)
│   ├── Force Start/End Keying: ✓
│   ├── Simplify: 1.0 (or lower for complex anim)
│   └── Baked Animation:
│       ├── ✓ Bake Animation
│       ├── ✓ Baked Animation
│       └── Resample Curves: ✓
│
├── Misc:
│   ├── Use Metadata: ✓
│   └── Batch Own Dir: (based on need)
```

### Step 3: Import in Unity

```javascript
Unity Import Settings (Inspector):

// Model Tab
├── Scale Factor: 1.0
├── Convert Units: ✓
├── Import BlendShapes: ✓
├── Import Visibility: ✓
├── Import Cameras: ✗ (usually)
├── Import Lights: ✗ (usually)
│
├── Mesh Compression: Off (or Low for optimization)
├── Read/Write Enabled: ✗ (if not needed at runtime)
├── Optimize Mesh: ✓
├── Generate Colliders: ✗ (or ✓ for collision meshes)
│
├── Imported Object Size: (should be ~1-2 units for human-sized)
│
├── Material Import Settings:
│   ├── Import Materials: ✓
│   ├── Material Naming: By Base Texture Name (recommended)
│   └── Material Search: Local (or Recursive Local)
│
└── Animation Tab (if animated):
    ├── Import Animation: ✓
    ├── Anim. Compression: Keyframe Reduction
    ├── Sample Rate: 60 (or match original)
    └── Scale: 1.0

// Rig Tab
├── Animation Type:
│   ├── None (static mesh)
│   ├── Legacy
│   ├── Generic (non-humanoid creatures, mechs)
│   └── Humanoid (humans, bipeds)
│
└── Avatar Definition:
    └── Create From This Model (or Copy From Other)

```

### Step 4: Verification

```javascript
// Verify Import in Unity
1. Select imported model in Project
2. Check Inspector:
   - Imported Object Size should be reasonable
   - Mesh should face +Z (forward) in Preview

3. Drag to Scene:
   - Object should be upright
   - Forward should be +Z (away from camera)

4. If rotation issues:
   - Edit > Preferences > General > Auto Run
   - Re-export with correct axis in Blender
```

---

## 2. Blender → Godot

### Step 1: Prepare in Blender

```javascript
// Similar to Unity preparation, but different axis handling

1. Apply All Transforms
2. Set to Metric units
3. Recalculate Normals
4. Check Scale: Should be 1.0
5. Name Convention: Same as Unity
```

### Step 2: Export Settings (glTF 2.0 Recommended)

```javascript
Blender glTF Export:

├── Format: glTF 2.0 (.glb/.gltf)
├── Filepath: /path/to/export/ModelName.glb
│
├── Include:
│   ├── ✓ Selected Objects
│   ├── ✓ Include Nested Objects
│   ├── ✓ Include Camera
│   ├── ✓ Include Lights
│   └── ✓ Include Poses
│
├── Transform:
│   ├── Scale: 1.0
│   ├── Apply Transforms: ✓         // CRITICAL
│   ├── Typed Arrays Only: ✓
│   └── Blender Lights: ✓
│
├── Geometry:
│   ├── Apply Modifiers: ✓
│   ├── UV Wraps: ✓
│   ├── Select by Name: ✓
│   ├── 💡 Remember: Godot doesn't support modifiers
│   │   (Apply Boolean, Decimate, etc. before export)
│   │
│   ├── Use Mesh Edges: ✗
│   ├── Use Mesh Vertices: ✗
│   ├── Limit: 0 (no limit)
│   │
│   └── Materials:
│       ├── Export Materials: ✓
│       ├── ✓ Export Materials
│       └── PBR Gallery: ✗

├── Animation:
│   ├── Use Current Frame: ✗ (export all)
│   ├── Always Sample Animations: ✓ (if keyframes are sparse)
│   ├── Group by NLA Track: ✓
│   ├── Group by F-Curve Groups: ✓
│   └── Optimize Animations: ✓
│
└── Compression:
    ├── Mesh Quantization: 14 (bits for position)
    └── Texture Compression: None (Godot handles this)
```

### Step 3: Alternative: FBX to Godot

```javascript
Blender FBX Export (for Godot):

├── Transform:
│   ├── Scale: 1.0
│   ├── Apply Scalings: All Local
│   ├── Forward: -Z Forward           // Godot uses +Z, so flip
│   ├── Up: Y Up
│   └── Apply Transform: ✓
│
└── Armature:
    ├── Primary Bone Axis: X
    └── Secondary Bone Axis: Y
```

### Step 4: Import in Godot

```javascript
// Godot 4.x Import Settings (Inspector when selected)

Import Parameters:
├── FBX:
│   ├── Import Scale: 1.0
│   ├── Create Root Bone: ✓
│   ├── Ensure Up Node: ✓
│   └── Animation Import: ✓/✗
│
├── glTF:
│   ├── Import Scale: 1.0
│   ├── Create Root Bone: ✓
│   ├── Store Remote Normal: ✓
│   └── Store Remote Tangent: ✓
│
├── Skeleton:
│   ├── Animation Import: ✓/✗
│   ├── Use Legacy Anims: ✗
│   └── Root Motion: (based on need)
│
├── Mesh:
│   ├── LRS Hint: 3D Spatial (default)
│   └── Shadow Ottomh: Invisible To Shadows (for occluders)
│
└── Materials:
    ├── Location: [Preview Only / New Childs Only / Best Guess]
    └── Search Pending: [Disabled / Recursive / Recursive Folders]
```

### Step 5: Verification

```javascript
// Verify in Godot
1. Import model
2. Place in scene
3. Select model, check:
   - Position: (0, 0, 0) - centered
   - Rotation: (0, 0, 0) - upright
   - Scale: (1, 1, 1) - normal

4. If issues with glTF:
   - Try FBX export instead
   - Check "Create Root Bone" setting
```

---

## 3. Blender → Unreal

### Step 1: Prepare in Blender

```javascript
// Critical: Unreal uses CENTIMETERS, not meters!

1. Apply All Transforms
2. Set to Metric units
3. Scale check:
   - 1 Blender unit = 1 meter
   - After export to Unreal: 1 Unreal unit = 1 cm
   - So: 1 meter in Blender = 100 units in Unreal

4. Example: Door frame
   - In Blender: 2.1 meters tall
   - In Unreal: 210 units tall
   - This is CORRECT behavior!

5. Recalculate Normals
6. Check for negative scale
```

### Step 2: Export Settings (FBX)

```javascript
Blender FBX Export for Unreal:

├── Transform:
│   ├── Scale: 1.0                    // Important!
│   ├── Apply Scalings: All Local
│   ├── Forward: -Z Forward           // Unreal forward is +Z or +X
│   ├── Up: Y Up
│   └── Apply Transform: ✓
│
├── Armature:
│   ├── Primary Bone Axis: X
│   ├── Secondary Bone Axis: Z
│   └── Armature FBXNode Type: Null
│
├── Animation:
│   ├── ✓ Baked Animation
│   └── Simplify: 1.0
│
└── Units:
    └── Scale: 1.0 (keep metric)
```

### Step 3: Import in Unreal

```javascript
// Unreal FBX Import Dialog

// Basic
├── Mesh: (select file)
├── Skeleton: (create new or select existing)
├── Skeletal Mesh: ✓ (if rigged)
└── Static Mesh: ✓ (if static)

Import Options:
├── Auto Generate Collision: ✓ (static meshes)
├── Auto Generate LODs: ✓
├── Import Content Type: Geometry_And_Skinning
├── Combine Meshes: ✓ (reduce draw calls)
├── Remove Degenerates: ✓
├── Generate Lightmap UVs: ✓
│
├── Static Mesh:
│   ├── Auto Generate Collision: ✓
│   ├── Collision Complexity: Simple And Complex
│   ├── Auto Generate LODs: ✓
│   └── Import LODs: ✓ (if multiple LODs)
│
└── Animation (if skeletal):
    ├── Import Animations: ✓/✗
    ├── Animation Name: (for single clip)
    ├── Default Sample Rate: 30 (or match source)
    └── Animation Length: Animated Key (or specify range)
```

### Step 4: Unreal FBX Import Settings (Post-Import)

```javascript
// After import, in Static Mesh Editor:

// Details Panel > LOD Settings:
├── LOD Group: Architecture / Character / Vehicle / etc.
├── LOD Import: (for LOD meshes)
│
├── Build Settings:
│   ├── Distance Field: ✓ (for dynamic shadows)
│   ├── Auto LOD Distance: ✓
│   └── MinLOD: 0
│
├── Collision:
│   ├── Collision Complexity: Use Project Default
│   └── Collision Generation: Automatic
│
└── Materials:
    ├── Material Import Method: Import Texture
    └── Import Textures: ✓
```

### Step 5: Verification

```javascript
// Verify in Unreal
1. Drag to viewport
2. Check scale:
   - Human character: ~180 units tall (1.8m)
   - Door frame: ~200-210 units tall
   - Car: ~150 units long

3. If model is too small/large:
   - Scale in Blender before export
   - Or adjust import scale (e.g., 0.01)

4. Check collision:
   - Right-click > Edit > Collision
   - Add simple collision if missing
```

---

## 4. glTF/GLB Pipeline

### Why glTF 2.0?

```
✓ Industry standard
✓ Preserves materials (PBR)
✓ Skeleton support
✓ Animation support
✓ Draconian spec (consistently parsed)
✓ Binary format (GLB) for single file
✓ Better for web/VR/AR
```

### Export from Blender (glTF 2.0)

```javascript
// Blender 3.0+ has native glTF export

Export Settings:
├── Format: glTF 2.0 (.glb/.gltf)
├── Filename: ModelName.glb
│
├── Include:
│   ├── ✓ Selected Objects
│   ├── ✓ Include Nested Objects
│   ├── ✓ Materials: Export PBR
│   │
│   └── ⚠️ Animations (if any):
│       ├── ✓ Always Sample Animations
│       └── ✓ Optimize Animation Data
│
├── Transform:
│   ├── Scale: 1.0
│   ├── Apply Transforms: ✓
│   └── Use Typed Arrays: ✓
│
├── Geometry:
│   ├── Apply Modifiers: ✓
│   ├── 💡 CRITICAL: Export as triangulated?
│   │   Most engines prefer quads, but glTF is flexible
│   └── Export Normals: ✓
│
└── Compression:
    └── (Godot handles compression on import)
```

### glTF Metadata Reference

```javascript
// glTF uses specific metadata for coordinate info

"asset": {
    "version": "2.0",
    "generator": "Blender glTF Exporter"
}

// Coordinate system is implicit in the data
// Up axis is +Y (glTF convention)
// Forward axis is -Z (glTF convention)

"nodes": [
    {
        "name": "ObjectName",
        "translation": [x, y, z],      // Position
        "rotation": [x, y, z, w],      // Quaternion
        "scale": [x, y, z]             // Scale
    }
]
```

### glTF Import Comparison

| Engine | glTF Support | Notes |
|--------|--------------|-------|
| Godot | Native | Best support, preferred format |
| Unity | Built-in | Requires glTF import plugin or built-in |
| Unreal | Plugin | Requires glTF plugin from Marketplace |
| Three.js | Native | Best web support |

---

## 5. FBX Pipeline

### FBX Pros and Cons

```
✓ Universal support across all major engines
✓ Complex animation support
✓ Material embedding
✓ NURBS/bezier curves

✗ Proprietary format
✗ Metadata can be inconsistent
✗ Large file sizes
✗ Version compatibility issues
```

### Best Practices for FBX

```javascript
// General FBX Guidelines

1. Version: Use FBX 7.4+ (Blender supports 7.x)

2. Single Object Per File (Recommended)
   - Easier to manage
   - Better for version control
   - Less confusion in engine

3. Naming Convention:
   - Consistent across pipeline
   - No special characters
   - Descriptive names

4. Scale:
   - Always apply transforms before export
   - Keep scale at 1.0 in export
   - Verify in engine

5. Animation:
   - Bake all animations
   - Remove redundant keyframes
   - Use keyframe reduction

6. Materials:
   - Export materials if supported
   - Or use placeholder materials
   - Assign in engine after import
```

### FBX Version Compatibility

| Blender Version | FBX Export Version | Notes |
|-----------------|-------------------|-------|
| 3.x | FBX 7.4 | Works well with Unity, Godot |
| 4.x | FBX 7.5 | Better for Unreal 5 |
| Any | FBX 6.0 | Fallback for older engines |

---

## 6. Common Import Issues

### Issue 1: Model is Rotated 90°

```javascript
Symptoms:
- Model laying on side
- Model facing wrong direction

Causes:
- Export axis mismatch
- Forward vector incorrect

Solution:
┌────────────────────────────────────────────────────────┐
│ Blender Export → Unity:                               │
│   Forward: -Y                                         │
│   Up: Z                                               │
├────────────────────────────────────────────────────────┤
│ Blender Export → Godot:                              │
│   Forward: -Z (for glTF)                             │
│   OR Forward: -Z (for FBX)                           │
├────────────────────────────────────────────────────────┤
│ Blender Export → Unreal:                             │
│   Forward: -Z                                         │
│   Up: Y                                               │
└────────────────────────────────────────────────────────┘

Also:
1. Apply All Transforms (Ctrl+A)
2. In Blender: Set forward direction manually
3. In Engine: Rotate mesh in import settings (last resort)
```

### Issue 2: Model Scale is Wrong

```javascript
Symptoms:
- Model too small (speck)
- Model too large (giant)

Causes:
- Unit mismatch
- Scale not applied
- Wrong scale factor

Debug Steps:
1. Check Blender units (Metric vs Imperial)
2. Apply scale (Ctrl+A > Scale)
3. Verify export scale = 1.0
4. Check engine import scale factor

┌────────────────────────────────────────────────────────┐
│ Common Scale Fixes:                                   │
├────────────────────────────────────────────────────────┤
│ Blender → Unity (meters):                            │
│   Export Scale: 1.0 → Unity Scale Factor: 1.0        │
│   (1 BU = 1m → 1 unit = 1m) ✓                        │
├────────────────────────────────────────────────────────┤
│ Blender → Unreal (centimeters):                      │
│   Export Scale: 1.0 → Unreal Import Scale: 1.0       │
│   (1 BU = 1m → 100 units) ✓                          │
├────────────────────────────────────────────────────────┤
│ If model appears 100x smaller in Unreal:             │
│   → This is CORRECT! 1m = 100cm = 100 units ✓        │
└────────────────────────────────────────────────────────┘
```

### Issue 3: Materials Not Importing

```javascript
Symptoms:
- Model is purple (missing shader)
- No materials assigned

Causes:
- Material export disabled
- Material naming mismatch
- Different material formats

Solutions:
1. Enable material export in Blender
2. Use consistent naming
3. In Engine:
   - Unity: Set Material Naming to "By Base Texture Name"
   - Godot: Enable "Extract Materials" in import
   - Unreal: Use "Import Materials"

Manual Material Assignment:
1. Create material in engine
2. Drag texture to material slots
3. Assign material to mesh
```

### Issue 4: Animation Broken

```javascript
Symptoms:
- Character walking backward
- Limbs in wrong positions
- Animation not playing

Causes:
- Animation axis mismatch
- Root bone issues
- Unbaked transforms

Solutions:
┌────────────────────────────────────────────────────────┐
│ Unity:                                                │
│ ├── Enable "Bake Animation" ✓                        │
│ ├── Enable "Resample Curves" ✓                      │
│ ├── Set "Anim. Compression" to Keyframe Reduction    │
│ └── For Humanoid: Check "Avatar Definition"          │
├────────────────────────────────────────────────────────┤
│ Godot:                                                │
│ ├── Use glTF export (better animation)               │
│ ├── Apply all transforms before export               │
│ └── Enable "Always Sample Animations" ✓              │
├────────────────────────────────────────────────────────┤
│ Unreal:                                               │
│ ├── Set "Animation Name" correctly                   │
│ ├── Check "Import Animations" ✓                      │
│ └── Verify root motion settings                      │
└────────────────────────────────────────────────────────┘
```

### Issue 5: Collision Not Working

```javascript
Symptoms:
- Player passes through objects
- No collision response

Solutions:
┌────────────────────────────────────────────────────────┐
│ Unity:                                                │
│ ├── Select mesh in Project                           │
│ ├── Inspector: Model tab                            │
│ ├── Generate Colliders: ✓                           │
│ └── Or: Add Collider component manually              │
├────────────────────────────────────────────────────────┤
│ Godot:                                               │
│ ├── StaticBody3D + CollisionShape3D                │
│ ├── Or: Inherits Shape (auto-generate)             │
│ └── Mesh > Create Trimesh Static Body               │
├────────────────────────────────────────────────────────┤
│ Unreal:                                               │
│ ├── In import dialog: Auto Generate Collision: ✓   │
│ └── Or: Edit > Add Box/Sphere/Capsule Collision    │
└────────────────────────────────────────────────────────┘
```

---

## Quick Checklist

```javascript
Before Export from Blender:
□ Applied All Transforms (Ctrl+A)
□ Set to Metric Units
□ Recalculated Normals (Shift+N)
□ No negative scale
□ Descriptive naming (no special chars)
□ Correct export format (glTF/FBX)

Export Settings:
□ Scale: 1.0
□ Apply Transform: ✓
□ Forward: Correct for target engine
□ Up: Correct for target engine
□ Animation: Baked if needed
□ Materials: Exported if needed

Import in Engine:
□ Scale Factor: 1.0 (or correct for unit system)
□ Generate Colliders (if needed)
□ Assign Materials
□ Verify position/rotation/scale
□ Test with simple scene
```

---

## See Also

- [Coordinate Cheatsheet](cheatsheet.md)
- [Axis Conversion Reference](axis-conversion.md)
- [Floating Origin Guide](../guides/floating-origin.md)
