# Game Engine Coordinate Systems Cheatsheet

> Quick reference for coordinate systems, axis orientations, and conversions across major game engines.

## Table of Contents

1. [Engine Overview](#1-engine-overview)
2. [Coordinate Systems](#2-coordinate-systems)
3. [Axis Conventions](#3-axis-conventions)
4. [Forward Vectors](#4-forward-vectors)
5. [Rotation Conventions](#5-rotation-conventions)
6. [Import Settings](#6-import-settings)
7. [Conversion Matrices](#7-conversion-matrices)
8. [Common Issues & Solutions](#8-common-issues--solutions)

---

## 1. Engine Overview

| Engine | Coordinate System | Default Forward | Unit Scale |
|--------|------------------|-----------------|------------|
| **Unity** | Left-Hand (LH) | -Z | 1 unit = 1 meter |
| **Godot** | Right-Hand (RH) | +Z | 1 unit = 1 meter |
| **Unreal Engine** | Left-Hand (LH) | +Z | 1 unit = 1 cm |
| **Blender** | Right-Hand (RH) | +Z (or -Y in older versions) | 1 unit = 1 meter |

---

## 2. Coordinate Systems

### Left-Hand (Unity, Unreal)

```
        +Y (Up)
         |
         |
         |________ +X (Right)
        /
       /
      /
    +Z (Forward, Out of screen)
```

### Right-Hand (Godot, Blender)

```
        +Y (Up)
         |
         |
         |________ +X (Right)
        /
       /
      /
    -Z (Forward, Into screen)
```

### Visual Comparison

```
LEFT-HAND (Unity, Unreal)     RIGHT-HAND (Godot, Blender)
         +Y                          +Y
          |                           |
          |                           |
          |______ +X                  |______ +X
         /                            \
        /                             \
       /                              \
   -Z (in)                          +Z (out)
```

---

## 3. Axis Conventions

### Position Axes

| Engine | X (Right) | Y (Up) | Z (Depth) |
|--------|-----------|--------|-----------|
| Unity | +Right | +Up | +Back (-Z = forward) |
| Godot | +Right | +Up | +Forward (+Z = forward) |
| Unreal | +Right | +Up | +Forward (+Z = forward) |
| Blender | +Right | +Up | +Depth |

### Scale Conventions

| Engine | Scale Direction | Notes |
|--------|-----------------|-------|
| Unity | Positive = larger | Negative = flip/mirror |
| Godot | Positive = larger | Negative = flip/mirror |
| Unreal | Positive = larger | Use negative scale for mirror |
| Blender | Positive = larger | Negative = flip |

---

## 4. Forward Vectors

### By Engine

```
Unity:     transform.forward = (0, 0, -1)
Godot:     transform.basis.z = (0, 0, 1)
Unreal:    GetActorForwardVector() = (0, 0, 1)
Blender:   -Y or +Z (depending on settings)
```

### Rotating "Forward"

To make an object face a direction:

**Unity (C#)**
```csharp
transform.forward = targetDirection;
// Or
transform.rotation = Quaternion.LookRotation(targetDirection);
```

**Godot (GDScript)**
```gdscript
look_at(target_position, Vector3.UP)
// Or
transform.basis.z = transform.basis.z.rotated(Vector3.UP, angle)
```

**Unreal (C++)**
```cpp
SetActorRotation(FRotator(0, yaw, 0));
// Or
FVector Direction = (TargetLocation - ActorLocation).GetSafeNormal();
SetActorRotation(Direction.Rotation());
```

---

## 5. Rotation Conventions

### Euler Angles Order

| Engine | Order | Example (X=90°, Y=45°, Z=0°) |
|--------|-------|-------------------------------|
| Unity | XYZ | Pitch, Yaw, Roll |
| Godot | XYZ | Pitch, Yaw, Roll |
| Unreal | ZXY | Yaw, Pitch, Roll |

### Gimbal Lock Warning

- **Unity**: YXZ internally, exposed as ZYX
- **Godot**: XYZ, can switch to intrinsic ZXY
- **Unreal**: ZXY, rarely has gimbal lock issues

### Quaternion Conventions

| Engine | Handedness | Notes |
|--------|------------|-------|
| Unity | Left-Hand | W is always positive in normalized quats |
| Godot | Right-Hand | W is always positive in normalized quats |
| Unreal | Left-Hand | W is always positive in normalized quats |

---

## 6. Import Settings

### Unity FBX Import

```
Inspector > Model Import Settings:
├── Scale Factor: 1.0 (keep as meters)
├── Convert Units: ✓ (convert to meters)
├── Animation:
│   ├── Bake Animation: ✓
│   └── Resample Curves: ✓
└── Transform:
    └── Import Blend Shapes: ✓

Inspector > Rig:
└── Animation Type: Humanoid / Generic / None

Inspector > Materials:
├── Import Materials: ✓
└── Material Creation Mode: By Base Texture Name
```

### Godot FBX/glTF Import

```
Import > Scene > FBX:
├── Scale: 1.0
├── Root Bone: <empty or specified>
└── Create Root Bone: ✓

Import > Scene > glTF:
├── Scale: 1.0
├── Force ARMature: ✓ (for skinned meshes)
└── Create Root Bone: ✓

Import > Texture:
└── Flags > Repeat: Enabled
```

### Unreal FBX Import

```
Import Options:
├── Scale: 1.0
├── Convert Scene: ✓
├── Import Content Type: ✓
└── Auto Generate Collision: ✓

Static Mesh Options:
├── Combine Meshes: ✓
├── Remove Degenerates: ✓
└── Auto Generate Collision: On

Material Import Method:
└── Import Materials: ✓ (or "Do Not Create Materials")
```

### Blender Export Settings

**Export to Unity:**
```
Format: FBX
├── Scene:
│   ├── Selected Objects: ✓ (if exporting selection)
│   └── Scale: 1.0
│   └── Apply Scalings: FBX All
├── Transform:
│   ├── Forward: -Y (Unity forward)
│   ├── Up: Z (Unity up)
│   └── Apply Transform: ✓
└── Armature:
    └── Primary Bone Axis: Y
    └── Secondary Bone Axis: X
```

**Export to Godot:**
```
Format: glTF 2.0 (.glb)
├── Include:
│   ├── Selected Objects: ✓
│   └── Data: All
├── Format:
│   └── Format: GLB (binary)
└── Transform:
    └── Scale: 1.0
```

---

## 7. Conversion Matrices

### Position Conversion

#### Unity ↔ Godot (LH ↔ RH)

**Unity (LH) → Godot (RH):**
```
Godot = (Unity.x, Unity.y, -Unity.z)
```

**Godot (RH) → Unity (LH):**
```
Unity = (Godot.x, Godot.y, -Godot.z)
```

#### Unity ↔ Unreal (Same Handedness)

No position change needed. Just check scale:
```
Unreal: 1 unit = 1 cm
Unity:  1 unit = 1 meter

To convert: Unreal → Unity = Unreal × 0.01
            Unity → Unreal = Unity × 100
```

### Rotation Conversion

#### Unity ↔ Godot

**Unity (LH, -Z forward) → Godot (RH, +Z forward):**
```gdscript
# Godot GDScript
func convert_unity_rotation(unity_rot: Vector3) -> Vector3:
    # Unity: XYZ (pitch, yaw, roll)
    # Godot: XYZ, but forward is +Z
    return Vector3(
        unity_rot.x,           # Pitch (X) - same
        -unity_rot.y,          # Yaw (Y) - invert for Z flip
        -unity_rot.z           # Roll (Z) - invert
    )
```

#### Full Transform Matrix (Unity → Godot)

```gdscript
# Complete Unity to Godot transform conversion
func unity_to_godot_transform(unity_pos: Vector3, unity_rot: Vector3, unity_scale: Vector3) -> Dictionary:
    return {
        "position": Vector3(unity_pos.x, unity_pos.y, -unity_pos.z),
        "rotation": Vector3(unity_rot.x, -unity_rot.y, -unity_rot.z),
        "scale": Vector3(unity_scale.x, unity_scale.y, unity_scale.z)
    }
```

#### Godot → Unity (C#)

```csharp
public static class CoordConverter
{
    public static Vector3 GodotToUnityPosition(Vector3 godotPos)
    {
        return new Vector3(godotPos.x, godotPos.y, -godotPos.z);
    }

    public static Quaternion GodotToUnityRotation(Quaternion godotRot)
    {
        // Convert from RH to LH quaternion
        return new Quaternion(
            godotRot.x,
            godotRot.y,
            -godotRot.z,
            -godotRot.w
        );
    }
}
```

### Scale Conversion

| Source → Target | Formula | Notes |
|-----------------|---------|-------|
| Unreal → Unity | `× 0.01` | cm → m |
| Unity → Unreal | `× 100` | m → cm |
| Blender → Unity | `× 1.0` | Usually same if metric |
| Blender → Godot | `× 1.0` | Usually same if metric |

---

## 8. Common Issues & Solutions

### Issue 1: Asset Appears 90° Rotated

**Symptoms:** Model is laying on its side or facing wrong direction

**Causes:**
- Export axis mismatch
- Forward vector incorrect

**Solutions:**
```
1. In Blender Export:
   - Set Forward: -Y (for Unity) or +Z (for Godot)
   - Set Up: Z

2. In Engine Import:
   - Check "Use File Units" in Blender before export
   - Apply All Transforms in Blender (Ctrl+A > All Transforms)
```

### Issue 2: Asset Scale is 100x Too Large/Small

**Symptoms:** Model is tiny speck or impossibly large

**Causes:**
- Unit mismatch (cm vs m)
- Scale factor not set to 1.0

**Solutions:**
```
Unity:
- Set FBX Scale Factor to 1.0
- Check "Convert Units" in import settings
- Export from Blender with Scale: 1.0

Godot:
- Set Import > Scene > FBX Scale to 1.0
- For glTF: Scale should be 1.0

Unreal:
- Unreal uses cm, so divide by 100 for Unity
- Or set import scale to 0.01
```

### Issue 3: Animation Plays Incorrectly

**Symptoms:** Character is walking sideways or backward

**Causes:**
- Animation import axis mismatch
- Root motion axis incorrect

**Solutions:**
```
Unity:
- In Import > Animations:
  - Bake Animation: ✓
  - Resample Curves: ✓
- Check "Lock Root Height" for humanoid

Godot:
- Use AnimationPlayer instead of skeletal animation
- Or: Use GLTF export from Blender

Unreal:
- Check "Force Front XAxis" in FBX import
```

### Issue 4: Precision Loss at Distance

**Symptoms:** Objects jitter, teleport, or wobble far from origin

**Causes:**
- Floating point precision limits
- Single vs double precision

**Solutions:**
```
1. Use Floating Origin pattern:
   - Shift world when player moves far
   - Keep player near (0,0,0)

2. Double Precision (Godot 4.2+):
   - Compile with: scons float=64
   - Or use World3D with double precision

3. Chunk-based Loading (Open World):
   - Divide world into chunks
   - Load/unload based on player position
```

### Issue 5: Mirrored/Inside-Out Geometry

**Symptoms:** Faces are inverted, backface culling shows wrong side

**Causes:**
- Negative scale during export
- Normal flip during import

**Solutions:**
```
1. In Blender:
   - Apply Scale (Ctrl+A > Scale)
   - Recalculate Normals (Shift+N)
   - Check for negative scale in object properties

2. In Unity:
   - Mesh > Import Settings > Generate Normals
   - Or manually flip normals in 3D software

3. In Godot:
   - Mesh > Flip Faces option in import
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    COORDINATE SYSTEM                        │
├──────────┬───────────┬─────────────┬─────────────────────────┤
│ Engine   │ System    │ Forward     │ Notes                   │
├──────────┼───────────┼─────────────┼─────────────────────────┤
│ Unity    │ Left-Hand │ -Z          │ 1 unit = 1 meter        │
│ Godot    │ Right-Hand│ +Z          │ 1 unit = 1 meter        │
│ Unreal   │ Left-Hand │ +Z          │ 1 unit = 1 cm           │
│ Blender  │ Right-Hand│ +Z or -Y    │ 1 unit = 1 meter        │
└──────────┴───────────┴─────────────┴─────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   CONVERSION FORMULAS                       │
├─────────────────────────────────────────────────────────────┤
│ Unity ↔ Godot:  Flip Z axis  (Unity.z → -Godot.z)        │
│ Unity ↔ Unreal:  Scale 100x    (Unreal = cm, Unity = m)    │
│ Blender → Unity: Usually 1:1 if exported with correct axis  │
└─────────────────────────────────────────────────────────────┘
```

---

## See Also

- [Engine Import Settings](import-settings.md)
- [Axis Conversion Reference](axis-conversion.md)
- [Floating Origin Guide](../guides/floating-origin.md)
