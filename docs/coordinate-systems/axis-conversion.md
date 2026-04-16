# Axis Conversion Reference

> Complete reference for converting coordinates, rotations, and transforms between game engines.

## Table of Contents

1. [Coordinate System Basics](#1-coordinate-system-basics)
2. [Position Conversion](#2-position-conversion)
3. [Rotation Conversion](#3-rotation-conversion)
4. [Quaternion Conversion](#4-quaternion-conversion)
5. [Euler Angle Conversion](#5-euler-angle-conversion)
6. [Scale Conversion](#6-scale-conversion)
7. [Full Transform Conversion](#7-full-transform-conversion)
8. [Code Examples](#8-code-examples)

---

## 1. Coordinate System Basics

### System Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                      COORDINATE SYSTEM COMPARISON                   │
├──────────┬───────────┬─────────────┬───────────────────────────────┤
│ Engine   │ Handed    │ Forward     │ Unit System                   │
├──────────┼───────────┼─────────────┼───────────────────────────────┤
│ Unity    │ Left      │ -Z          │ 1 unit = 1 meter             │
│ Godot    │ Right     │ +Z          │ 1 unit = 1 meter             │
│ Unreal   │ Left      │ +Z          │ 1 unit = 1 centimeter        │
│ Blender  │ Right     │ +Z / -Y     │ 1 unit = 1 meter             │
│ glTF     │ Right     │ -Z          │ 1 unit = 1 meter (implied)   │
│ OpenGL   │ Right     │ -Z          │ N/A                           │
│ DirectX  │ Left      │ +Z          │ N/A                           │
└──────────┴───────────┴─────────────┴───────────────────────────────┘
```

### Visual Reference

```
LEFT-HANDED (Unity, Unreal, DirectX)     RIGHT-HANDED (Godot, Blender, glTF, OpenGL)
                                               
       +Y (Up)                                    +Y (Up)
        │                                         │
        │                                         │
        │_______ +X (Right)                      │_______ +X (Right)
       ╱                                        ╱
      ╱                                        ╱
     ╱                                        ╱
 +Z (out)                                  -Z (in)
    
Rotation: Clockwise when viewed               Rotation: Counter-clockwise when
 from +Z axis                                viewed from +Z axis
```

---

## 2. Position Conversion

### Position Matrix Reference

| From → To | X | Y | Z | Formula |
|-----------|---|---|---|---------|
| Unity → Godot | X | Y | -Z | `(x, y, -z)` |
| Godot → Unity | X | Y | -Z | `(x, y, -z)` |
| Unity → Unreal | X | Y | Z | `(x, y, z)` |
| Unreal → Unity | X | Y | Z | `(x, y, z)` |
| Blender → Unity | X | Y | Z | `(x, y, z)` |
| Blender → Godot | X | Y | Z | `(x, y, z)` |
| glTF → Unity | X | Y | Z | `(x, y, z)` |
| glTF → Godot | X | Y | Z | `(x, y, z)` |

### Scale Factor Reference

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UNIT SCALE CONVERSION                      │
├─────────────────────────────────────────────────────────────────────┤
│ Unity ↔ Unreal:  1 Unity unit = 100 Unreal units (meters ↔ cm)   │
│   • Unity → Unreal:  multiply by 100                               │
│   • Unreal → Unity:  multiply by 0.01                              │
│                                                                     │
│ Unity ↔ Godot:  1:1 (both use meters)                              │
│   • No scale conversion needed                                      │
│                                                                     │
│ Unity ↔ Blender:  1:1 (both use meters)                            │
│   • No scale conversion needed                                      │
│                                                                     │
│ Unity ↔ glTF:  1:1 (both use meters)                              │
│   • No scale conversion needed                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Rotation Conversion

### Axis Flip Rules

When converting between Left-Handed and Right-Handed systems, you must flip the rotation axis:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ROTATION AXIS FLIP RULES                       │
├─────────────────────────────────────────────────────────────────────┤
│ Left-Handed → Right-Handed:                                          │
│   • Flip the Z component of any rotation                            │
│   • Or: Negate the rotation around Z                                │
│                                                                     │
│ Right-Handed → Left-Handed:                                          │
│   • Flip the Z component of any rotation                            │
│   • Or: Negate the rotation around Z                                │
│                                                                     │
│ Same-Handedness (Unity ↔ Unreal):                                   │
│   • No rotation flip needed                                         │
│   • Just verify forward vector alignment                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Euler Angle Conversion Table

| From → To | Pitch (X) | Yaw (Y) | Roll (Z) | Notes |
|-----------|-----------|---------|----------|-------|
| Unity → Godot | X | -Y | -Z | Flip Y and Z |
| Godot → Unity | X | -Y | -Z | Flip Y and Z |
| Unity → Unreal | X | Y | Z | Same handedness |
| Unreal → Unity | X | Y | Z | Same handedness |
| Blender → Unity | X | Y | -Z | Flip Z only |
| Blender → Godot | X | Y | Z | Same handedness |

---

## 4. Quaternion Conversion

### Quaternion Handedness Swap

When converting quaternions between Left-Handed and Right-Handed systems:

```
Left-Handed → Right-Handed (or vice versa):
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   Q_result = (Q.x, Q.y, -Q.z, -Q.w)                                 │
│                                                                      │
│   Explanation:                                                       │
│   • Negate Z component of the axis                                  │
│   • Negate W component (the scalar part)                             │
│                                                                      │
│   This effectively mirrors the rotation through the XY plane.       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Quaternion Reference

| From → To | X | Y | Z | W |
|-----------|---|---|---|---|
| Unity → Godot | X | Y | -Z | -W |
| Godot → Unity | X | Y | -Z | -W |
| Unity → Unreal | X | Y | Z | W |
| Unreal → Unity | X | Y | Z | W |
| Blender → Unity | X | Y | Z | W |
| Blender → Godot | X | Y | Z | W |

### Quaternion Math

```javascript
// General quaternion handedness conversion
function convertQuaternionLHtoRH(q) {
    // For Left-Handed → Right-Handed
    return {
        x: q.x,
        y: q.y,
        z: -q.z,
        w: -q.w
    };
}

function convertQuaternionRHtoLH(q) {
    // For Right-Handed → Left-Handed
    return {
        x: q.x,
        y: q.y,
        z: -q.z,
        w: -q.w
    };
}
```

---

## 5. Euler Angle Conversion

### Euler Angle Order by Engine

| Engine | Euler Order | Description |
|--------|-------------|-------------|
| Unity | XYZ | Pitch (X), Yaw (Y), Roll (Z) |
| Godot | XYZ | Pitch (X), Yaw (Y), Roll (Z) |
| Unreal | ZXY | Yaw (Z), Pitch (X), Roll (Y) |
| Blender | XYZ | Pitch (X), Yaw (Y), Roll (Z) |

### Euler Conversion Algorithm

```javascript
// Unity (XYZ) ↔ Godot (XYZ) - Simple axis flip
function unityEulerToGodotEuler(euler) {
    // Unity: X=pitch, Y=yaw, Z=roll
    // Godot: X=pitch, Y=yaw, Z=roll (but +Z is forward)
    return {
        x: euler.x,
        y: -euler.y,
        z: -euler.z
    };
}

// Unity (XYZ) ↔ Unreal (ZXY) - Complex reorder
function unityEulerToUnrealEuler(euler) {
    // Unity: X=pitch, Y=yaw, Z=roll
    // Unreal: Z=yaw, X=pitch, Y=roll
    return {
        z: euler.y,  // Unreal yaw from Unity yaw
        x: euler.x,  // Unreal pitch from Unity pitch
        y: euler.z   // Unreal roll from Unity roll
    };
}
```

### Gimbal Lock Considerations

```
⚠️  GIMBAL LOCK WARNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When two axes align, you lose one degree of freedom.

Solutions:
1. Use Quaternions internally (no gimbal lock)
2. Choose rotation order carefully
3. Avoid 90° rotations

Engine Rotation Orders (least to most prone):
• ZXY (Unreal default) - Most stable
• XYZ (Unity/Godot) - Moderate
• YXZ - Can lock easily
• ZYX - Can lock easily

If you see:
• Rotations "jump" at certain angles
• Two axes moving together unexpectedly
• Loss of rotation precision

→ You likely hit gimbal lock
→ Switch to quaternion representation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 6. Scale Conversion

### Scale Factor Table

| From → To | Factor | Reason |
|-----------|--------|--------|
| Unreal → Unity | × 0.01 | Unreal uses cm, Unity uses m |
| Unity → Unreal | × 100 | Unity uses m, Unreal uses cm |
| Blender → Unity | × 1.0 | Both use meters |
| Blender → Godot | × 1.0 | Both use meters |
| glTF → Unity | × 1.0 | Both use meters |
| glTF → Godot | × 1.0 | Both use meters |

### Negative Scale (Mirroring)

```
⚠️  NEGATIVE SCALE WARNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Using negative scale causes:
• Backface culling issues
• Inverted normals
• Physics complications

DO:     Use positive scale, modify geometry if mirroring needed
DON'T:  Use negative scale for "flipping"

If you must use negative scale:
1. Recalculate normals after import
2. Double-sided rendering may be needed
3. Physics colliders may not work correctly
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 7. Full Transform Conversion

### Complete Transform Matrix

```
┌─────────────────────────────────────────────────────────────────────┐
│                     COMPLETE TRANSFORM CONVERSION                    │
│                      (Position + Rotation + Scale)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  UNITY → GODOT:                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Position: (unity.x, unity.y, -unity.z)                      │     │
│  │ Rotation: (unity.x, -unity.y, -unity.z) [Euler]              │     │
│  │           or [q.x, q.y, -q.z, -q.w] [Quaternion]           │     │
│  │ Scale:    (unity.x, unity.y, unity.z)                        │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  GODOT → UNITY:                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Position: (godot.x, godot.y, -godot.z)                      │     │
│  │ Rotation: (godot.x, -godot.y, -godot.z) [Euler]             │     │
│  │           or [q.x, q.y, -q.z, -q.w] [Quaternion]           │     │
│  │ Scale:    (godot.x, godot.y, godot.z)                        │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  UNITY ↔ UNREAL (with unit scaling):                                 │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ Position: (unity.x, unity.y, unity.z) × scale_factor         │     │
│  │ Rotation: (unity.x, unity.y, unity.z) [verify axis]         │     │
│  │ Scale:    (unity.x × 100, unity.y × 100, unity.z × 100)     │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Code Examples

### JavaScript / TypeScript

```javascript
// coordinate-converter.js

class CoordinateConverter {
    /**
     * Convert position between Unity and Godot
     * Unity: Left-Hand, -Z forward
     * Godot: Right-Hand, +Z forward
     */
    static unityToGodotPosition(pos) {
        return { x: pos.x, y: pos.y, z: -pos.z };
    }

    static godotToUnityPosition(pos) {
        return { x: pos.x, y: pos.y, z: -pos.z };
    }

    /**
     * Convert quaternion between Unity and Godot
     */
    static unityToGodotQuaternion(q) {
        return { x: q.x, y: q.y, z: -q.z, w: -q.w };
    }

    static godotToUnityQuaternion(q) {
        return { x: q.x, y: q.y, z: -q.z, w: -q.w };
    }

    /**
     * Convert Euler angles (degrees) between Unity and Godot
     */
    static unityToGodotEuler(euler) {
        return { x: euler.x, y: -euler.y, z: -euler.z };
    }

    static godotToUnityEuler(euler) {
        return { x: euler.x, y: -euler.y, z: -euler.z };
    }

    /**
     * Convert scale between Unity and Unreal (meters ↔ cm)
     */
    static unityToUnrealScale(scale) {
        return {
            x: scale.x * 100,
            y: scale.y * 100,
            z: scale.z * 100
        };
    }

    static unrealToUnityScale(scale) {
        return {
            x: scale.x * 0.01,
            y: scale.y * 0.01,
            z: scale.z * 0.01
        };
    }

    /**
     * Convert full transform
     */
    static unityToGodotTransform(transform) {
        return {
            position: this.unityToGodotPosition(transform.position),
            rotation: this.unityToGodotEuler(transform.rotation),
            scale: { ...transform.scale }
        };
    }

    static godotToUnityTransform(transform) {
        return {
            position: this.godotToUnityPosition(transform.position),
            rotation: this.godotToUnityEuler(transform.rotation),
            scale: { ...transform.scale }
        };
    }
}

module.exports = CoordinateConverter;
```

### Python

```python
# coordinate_converter.py

from dataclasses import dataclass
from typing import Tuple

@dataclass
class Vector3:
    x: float
    y: float
    z: float

@dataclass
class Quaternion:
    x: float
    y: float
    z: float
    w: float

@dataclass
class Transform:
    position: Vector3
    rotation: Vector3  # Euler angles
    scale: Vector3

class CoordinateConverter:
    """Convert coordinates between game engines."""
    
    # Position conversions
    @staticmethod
    def unity_to_godot_position(pos: Vector3) -> Vector3:
        return Vector3(pos.x, pos.y, -pos.z)
    
    @staticmethod
    def godot_to_unity_position(pos: Vector3) -> Vector3:
        return Vector3(pos.x, pos.y, -pos.z)
    
    # Quaternion conversions
    @staticmethod
    def unity_to_godot_quaternion(q: Quaternion) -> Quaternion:
        return Quaternion(q.x, q.y, -q.z, -q.w)
    
    @staticmethod
    def godot_to_unity_quaternion(q: Quaternion) -> Quaternion:
        return Quaternion(q.x, q.y, -q.z, -q.w)
    
    # Euler angle conversions
    @staticmethod
    def unity_to_godot_euler(euler: Vector3) -> Vector3:
        return Vector3(euler.x, -euler.y, -euler.z)
    
    @staticmethod
    def godot_to_unity_euler(euler: Vector3) -> Vector3:
        return Vector3(euler.x, -euler.y, -euler.z)
    
    # Scale conversions (Unity meters ↔ Unreal cm)
    @staticmethod
    def unity_to_unreal_scale(scale: Vector3) -> Vector3:
        return Vector3(scale.x * 100, scale.y * 100, scale.z * 100)
    
    @staticmethod
    def unreal_to_unity_scale(scale: Vector3) -> Vector3:
        return Vector3(scale.x * 0.01, scale.y * 0.01, scale.z * 0.01)
    
    # Full transform conversions
    @staticmethod
    def unity_to_godot_transform(t: Transform) -> Transform:
        return Transform(
            position=CoordinateConverter.unity_to_godot_position(t.position),
            rotation=CoordinateConverter.unity_to_godot_euler(t.rotation),
            scale=t.scale
        )
    
    @staticmethod
    def godot_to_unity_transform(t: Transform) -> Transform:
        return Transform(
            position=CoordinateConverter.godot_to_unity_position(t.position),
            rotation=CoordinateConverter.godot_to_unity_euler(t.rotation),
            scale=t.scale
        )
```

### C# (Unity)

```csharp
// CoordinateConverter.cs
using UnityEngine;

public static class CoordinateConverter
{
    /// <summary>
    /// Convert position from Godot (RH, +Z forward) to Unity (LH, -Z forward)
    /// </summary>
    public static Vector3 FromGodotPosition(Vector3 godotPos)
    {
        return new Vector3(godotPos.x, godotPos.y, -godotPos.z);
    }

    /// <summary>
    /// Convert position from Unity (LH, -Z forward) to Godot (RH, +Z forward)
    /// </summary>
    public static Vector3 ToGodotPosition(Vector3 unityPos)
    {
        return new Vector3(unityPos.x, unityPos.y, -unityPos.z);
    }

    /// <summary>
    /// Convert quaternion from Godot to Unity
    /// </summary>
    public static Quaternion FromGodotQuaternion(Quaternion godotRot)
    {
        return new Quaternion(
            godotRot.x,
            godotRot.y,
            -godotRot.z,
            -godotRot.w
        );
    }

    /// <summary>
    /// Convert quaternion from Unity to Godot
    /// </summary>
    public static Quaternion ToGodotQuaternion(Quaternion unityRot)
    {
        return new Quaternion(
            unityRot.x,
            unityRot.y,
            -unityRot.z,
            -unityRot.w
        );
    }

    /// <summary>
    /// Convert Euler angles from Godot to Unity (degrees)
    /// </summary>
    public static Vector3 FromGodotEuler(Vector3 godotEuler)
    {
        return new Vector3(
            godotEuler.x,
            -godotEuler.y,
            -godotEuler.z
        );
    }

    /// <summary>
    /// Convert Euler angles from Unity to Godot (degrees)
    /// </summary>
    public static Vector3 ToGodotEuler(Vector3 unityEuler)
    {
        return new Vector3(
            unityEuler.x,
            -unityEuler.y,
            -unityEuler.z
        );
    }

    /// <summary>
    /// Convert scale from Unreal (cm) to Unity (m)
    /// </summary>
    public static Vector3 FromUnrealScale(Vector3 unrealScale)
    {
        return unrealScale * 0.01f;
    }

    /// <summary>
    /// Convert scale from Unity (m) to Unreal (cm)
    /// </summary>
    public static Vector3 ToUnrealScale(Vector3 unityScale)
    {
        return unityScale * 100f;
    }

    /// <summary>
    /// Convert full transform from Godot to Unity
    /// </summary>
    public static (Vector3 position, Quaternion rotation, Vector3 scale)
        FromGodotTransform(Vector3 godotPos, Quaternion godotRot, Vector3 godotScale)
    {
        return (
            FromGodotPosition(godotPos),
            FromGodotQuaternion(godotRot),
            godotScale
        );
    }

    /// <summary>
    /// Convert full transform from Unity to Godot
    /// </summary>
    public static (Vector3 position, Quaternion rotation, Vector3 scale)
        ToGodotTransform(Vector3 unityPos, Quaternion unityRot, Vector3 unityScale)
    {
        return (
            ToGodotPosition(unityPos),
            ToGodotQuaternion(unityRot),
            unityScale
        );
    }
}
```

### GDScript (Godot)

```gdscript
# coordinate_converter.gd
class_name CoordinateConverter

## Convert position from Unity (LH, -Z forward) to Godot (RH, +Z forward)

static func from_unity_position(pos: Vector3) -> Vector3:
	return Vector3(pos.x, pos.y, -pos.z)

static func to_unity_position(pos: Vector3) -> Vector3:
	return Vector3(pos.x, pos.y, -pos.z)

## Convert quaternion from Unity to Godot

static func from_unity_quaternion(q: Quaternion) -> Quaternion:
	return Quaternion(q.x, q.y, -q.z, -q.w)

static func to_unity_quaternion(q: Quaternion) -> Quaternion:
	return Quaternion(q.x, q.y, -q.z, -q.w)

## Convert Euler angles from Unity to Godot (degrees)

static func from_unity_euler(euler: Vector3) -> Vector3:
	return Vector3(euler.x, -euler.y, -euler.z)

static func to_unity_euler(euler: Vector3) -> Vector3:
	return Vector3(euler.x, -euler.y, -euler.z)

## Convert scale from Unreal (cm) to Godot (m)

static func from_unreal_scale(scale: Vector3) -> Vector3:
	return scale * 0.01

static func to_unreal_scale(scale: Vector3) -> Vector3:
	return scale * 100.0

## Convert full transform from Unity to Godot

static func from_unity_transform(pos: Vector3, rot: Vector3, scale: Vector3) -> Dictionary:
	return {
		"position": from_unity_position(pos),
		"rotation": from_unity_euler(rot),
		"scale": scale
	}

static func to_unity_transform(pos: Vector3, rot: Vector3, scale: Vector3) -> Dictionary:
	return {
		"position": to_unity_position(pos),
		"rotation": to_unity_euler(rot),
		"scale": scale
	}
```

---

## Quick Reference Tables

### Position Conversion Summary

```
┌────────────────┬─────────────┬────────────────┬──────────────────┐
│ Convert FROM   │ TO          │ Formula        │ Example          │
├────────────────┼─────────────┼────────────────┼──────────────────┤
│ Unity          │ Godot       │ (x, y, -z)     │ (1,2,3)→(1,2,-3) │
│ Godot          │ Unity       │ (x, y, -z)     │ (1,2,3)→(1,2,-3) │
│ Unity          │ Unreal      │ (x*100,y*100,z*100)| (1,2,3)→(100,200,300) │
│ Unreal         │ Unity       │ (x/100,y/100,z/100)| (100,200,300)→(1,2,3) │
│ Blender        │ Unity       │ (x, y, z)      │ No change        │
│ Blender        │ Godot       │ (x, y, z)      │ No change        │
└────────────────┴─────────────┴────────────────┴──────────────────┘
```

### Rotation Conversion Summary

```
┌────────────────┬─────────────┬────────────────┬──────────────────┐
│ Convert FROM   │ TO          │ Quaternion     │ Euler (deg)       │
├────────────────┼─────────────┼────────────────┼──────────────────┤
│ Unity          │ Godot       │ (x,y,-z,-w)   │ (x,-y,-z)        │
│ Godot          │ Unity       │ (x,y,-z,-w)   │ (x,-y,-z)        │
│ Unity          │ Unreal      │ (x,y,z,w)     │ (x,y,z)          │
│ Unreal         │ Unity      │ (x,y,z,w)     │ (x,y,z)          │
└────────────────┴─────────────┴────────────────┴──────────────────┘
```

---

## See Also

- [Coordinate Cheatsheet](cheatsheet.md)
- [Import Settings Guide](import-settings.md)
- [Floating Origin Guide](../guides/floating-origin.md)
