# Floating Origin Guide

> How to handle large world coordinates in game development without precision loss.

## What is Floating Origin?

The **Floating Origin** pattern is a technique to handle floating-point precision issues in large game worlds by keeping the player/camera near the world origin (0,0,0) while the world shifts around them.

## The Problem

Floating-point numbers lose precision as they get larger:

```
float32 precision:
  At 1,000:   ±0.0001 (good)
  At 10,000:  ±0.001  (acceptable)
  At 100,000: ±0.1    (noticeable jitter)
  At 1,000,000: ±1.0 (objects teleport)
```

### Symptoms of Precision Loss

| Symptom | Cause |
|---------|-------|
| Objects jittering | Small position changes lost |
| Teleporting | Precision too low |
| Physics instability | Collision checks fail |
| Rendering artifacts | Depth buffer precision |

## The Solution

Keep everything near origin by shifting the world:

```
Before:                          After:
┌─────────────────────┐          ┌─────────────────────┐
│                     │          │                     │
│   Player ●          │          │        ● Player     │
│   (50000, 0, 0)     │   →     │        (50, 0, 0)   │
│                     │          │                     │
│   World stays fixed │          │   World shifts      │
│   Precision: LOW    │          │   Precision: HIGH  │
└─────────────────────┘          └─────────────────────┘
```

## Implementation

### Godot 4.x

```gdscript
# floating_origin.gd - Add as Autoload
extends Node3D

signal origin_shifted(old: Vector3, new: Vector3)

@export var threshold := 5000.0

var world_offset := Vector3.ZERO
var player: Node3D

func _process(delta):
    if player and player.global_position.length() > threshold:
        world_offset = -player.global_position
        # Apply to all world objects
        get_tree().root.global_position = world_offset
        origin_shifted.emit(world_offset, Vector3.ZERO)
```

### Unity

```csharp
public class FloatingOrigin : MonoBehaviour
{
    public float threshold = 5000f;
    public Transform player;
    
    private Vector3 worldOffset;
    
    void Update()
    {
        if (player != null && player.position.magnitude > threshold)
        {
            worldOffset = -player.position;
            
            // Move all world objects
            foreach (Transform obj in worldObjects)
            {
                obj.position += worldOffset;
            }
            
            // CRITICAL: Sync physics
            Physics.SyncTransforms();
            
            worldOffset = Vector3.zero;
        }
    }
}
```

## When to Use

### Use Floating Origin When:

- Open world games (> 1km²)
- Space games
- Large procedural worlds
- Any game where precision matters at distance

### Don't Need It When:

- Small, contained levels
- Games that teleport/load new scenes
- Fixed camera games
- 2D games (usually)

## Threshold Guidelines

| World Size | Recommended Threshold | Shift Frequency |
|------------|---------------------|-----------------|
| < 1km² | 5000+ | Rare |
| 1-10km² | 3000-5000 | Occasional |
| 10-100km² | 1000-3000 | Frequent |
| > 100km² | 500-1000 | Very frequent |

## Chunk-Based Loading

For very large worlds, combine with chunk loading:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   ┌─────┐  ┌─────┐  ┌─────┐                   │
│   │Chunk│  │Chunk│  │Chunk│    Player at (0,0) │
│   │ -1  │  │  0  │  │  1  │        ●          │
│   └─────┘  └─────┘  └─────┘                   │
│                                                 │
│   Only load chunks near player                   │
│   Unload chunks far away                        │
└─────────────────────────────────────────────────┘
```

## Best Practices

### 1. Use Double Precision (Godot 4.2+)

```bash
# Compile Godot with double precision
scons platform=linux target=editor float=64
```

### 2. Always Call Physics Sync

```gdscript
# Godot
PhysicsServer3D.sync()
```

```csharp
// Unity
Physics.SyncTransforms();
```

### 3. Track World Objects

```gdscript
# Godot - Use node groups
func add_to_world(node):
    node.add_to_group("world_objects")
    
func shift_world():
    for obj in get_tree().get_nodes_in_group("world_objects"):
        obj.global_position += world_offset
```

### 4. Handle Chunks Properly

- Load new chunks BEFORE shift
- Unload old chunks AFTER shift
- Use async loading to prevent frame drops

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Still jittering | Lower threshold |
| Physics broken | Call `Physics.SyncTransforms()` |
| Objects disappear | Check chunk loading bounds |
| Performance drops | Increase threshold or use async loading |

## Quick Reference

```
Precision Thresholds:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Safe:      < 1000 units
Monitor:   1000 - 5000
Warning:   5000 - 10000
Critical:  > 10000  ← Use Floating Origin!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Key Functions:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Godot:  PhysicsServer3D.sync()
Unity:  Physics.SyncTransforms()
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## See Also

- [Coordinate System Cheatsheet](../coordinate-systems/cheatsheet.md)
- [Axis Conversion Reference](../coordinate-systems/axis-conversion.md)
- [Godot Floating Origin Template](../coordinate-systems/templates/floating-origin-godot.md)
- [Unity Floating Origin Template](../coordinate-systems/templates/floating-origin-unity.md)
