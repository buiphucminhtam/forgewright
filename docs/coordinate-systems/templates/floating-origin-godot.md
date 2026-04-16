# Floating Origin - Godot GDScript

> A floating origin implementation for Godot 4.x to handle large world coordinates and prevent floating-point precision issues.

## Overview

When game objects are far from the world origin (typically > 5000 units), floating-point precision issues cause:
- Jittering and trembling of objects
- Teleporting or snapping
- Physics instability
- Rendering artifacts

The Floating Origin pattern solves this by keeping the player/camera near the world origin (0,0,0) and shifting the world around them.

## Quick Start

### 1. Add the Script

Copy `floating_origin.gd` to your project and add it as an autoload:

```gdscript
# project.godot
[autoload]
FloatingOrigin="res://floating_origin.gd"
```

### 2. Configure Threshold

The default threshold is 5000 units. Adjust in project settings:

```gdscript
# Or set at runtime
FloatingOrigin.threshold = 3000.0  # Shift when player is 3000+ units away
```

### 3. Place Objects

Any objects that need to move with the world should be children of the FloatingOrigin root node, or use the `track_position()` method.

## How It Works

```
Before Floating Origin:
┌────────────────────────────────────────────┐
│  Player (50000, 0, 0)                      │
│       ↓                                    │
│  World objects at their actual positions    │
│       ↓                                    │
│  Precision loss due to large coordinates   │
└────────────────────────────────────────────┘

After Floating Origin:
┌────────────────────────────────────────────┐
│  Player stays near (0, 0, 0)                │
│       ↓                                    │
│  World shifts to keep player centered       │
│  Objects use relative coordinates           │
│       ↓                                    │
│  Full precision maintained                  │
└────────────────────────────────────────────┘
```

## Features

### ✅ Automatic Origin Shifting
- Triggers when player exceeds threshold distance from origin
- Smoothly shifts world to keep player centered
- Maintains all relative positions

### ✅ Physics Synchronization
- Automatically calls `PhysicsServer3D.sync()` after shift
- Ensures physics remains stable
- Prevents collision detection issues

### ✅ Node Tracking
- Automatically tracks children of FloatingOrigin node
- Manual tracking via `track_node()` / `untrack_node()`
- Signal callbacks for position changes

### ✅ Chunk-Based Worlds
- Support for chunked/open-world games
- Load/unload chunks based on player position
- Seamless chunk transitions

## API Reference

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `threshold` | float | 5000.0 | Distance to trigger origin shift |
| `enabled` | bool | true | Enable/disable floating origin |
| `smooth_shift` | bool | false | Use smooth interpolation for shifts |
| `shift_speed` | float | 10.0 | Interpolation speed (if smooth_shift) |
| `debug_mode` | bool | false | Print debug info |

### Methods

```gdscript
# Initialize with player node
FloatingOrigin.set_player(player_node)

# Track/untrack nodes manually
FloatingOrigin.track_node(node)
FloatingOrigin.untrack_node(node)

# Get current world offset
var offset = FloatingOrigin.get_world_offset()

# Convert world position to local (relative to origin)
var local_pos = FloatingOrigin.to_local(world_pos)

# Convert local position to world
var world_pos = FloatingOrigin.to_world(local_pos)

# Force an origin shift
FloatingOrigin.force_shift()

# Reset to origin
FloatingOrigin.reset()
```

### Signals

```gdscript
# Emitted when origin shifts
signal origin_shifted(old_offset: Vector3, new_offset: Vector3)

# Emitted before shift (for chunk loading)
signal pre_shift(new_offset: Vector3)

# Emitted after shift (for chunk unloading)
signal post_shift(old_offset: Vector3)
```

## Complete Example

```gdscript
# main.gd
extends Node3D

func _ready():
    # Set the player node
    FloatingOrigin.set_player($Player)
    
    # Connect to signals
    FloatingOrigin.origin_shifted.connect(_on_origin_shifted)
    FloatingOrigin.pre_shift.connect(_on_pre_shift)
    FloatingOrigin.post_shift.connect(_on_post_shift)

func _on_origin_shifted(old_offset: Vector3, new_offset: Vector3):
    print("Origin shifted from ", old_offset, " to ", new_offset)

func _on_pre_shift(new_offset: Vector3):
    # Load chunks for the new area
    load_chunks_around(new_offset)

func _on_post_shift(old_offset: Vector3):
    # Unload distant chunks
    unload_distant_chunks(old_offset)
```

## Chunk-Based World Example

```gdscript
# chunk_manager.gd
extends Node3D

const CHUNK_SIZE := 1000.0
var loaded_chunks := {}

func _ready():
    FloatingOrigin.origin_shifted.connect(_on_origin_shifted)

func _on_origin_shifted(_old: Vector3, _new: Vector3):
    update_chunks()

func update_chunks():
    var player_pos = FloatingOrigin.get_world_offset()
    var chunk_x = floor(player_pos.x / CHUNK_SIZE)
    var chunk_z = floor(player_pos.z / CHUNK_SIZE)
    
    # Load chunks around player
    for dx in range(-3, 4):
        for dz in range(-3, 4):
            var cx = chunk_x + dx
            var cz = chunk_z + dz
            var key = "%d,%d" % [cx, cz]
            
            if not loaded_chunks.has(key):
                load_chunk(cx, cz, key)

func load_chunk(cx: int, cz: int, key: String):
    # Load chunk mesh/data here
    var chunk = create_chunk_mesh(cx, cz)
    loaded_chunks[key] = chunk

func unload_distant_chunks(old_offset: Vector3):
    var unload_distance = CHUNK_SIZE * 5
    var to_unload = []
    
    for key in loaded_chunks:
        var parts = key.split(",")
        var cx = int(parts[0]) * CHUNK_SIZE
        var cz = int(parts[1]) * CHUNK_SIZE
        var dist = Vector2(cx - old_offset.x, cz - old_offset.z).length()
        
        if dist > unload_distance:
            to_unload.append(key)
    
    for key in to_unload:
        unload_chunk(key)

func unload_chunk(key: String):
    if loaded_chunks.has(key):
        loaded_chunks[key].queue_free()
        loaded_chunks.erase(key)
```

## Performance Considerations

1. **Threshold Tuning**: Larger thresholds = fewer shifts = better performance
2. **Smooth Shifting**: Adds slight overhead but prevents jarring transitions
3. **Node Count**: Track only dynamic objects, not static world geometry
4. **Chunk Loading**: Use async loading to prevent frame drops

## Troubleshooting

### Objects Still Jitter
- Lower the threshold (try 2000 or 1000)
- Enable `smooth_shift` for smoother transitions
- Check that all tracked nodes are children of FloatingOrigin

### Physics Issues
- Ensure `PhysicsServer3D.sync()` is being called
- Check that colliders update after shift
- Try `PhysicsServer3D.body_set_state()` for rigid bodies

### Performance Issues
- Reduce number of tracked nodes
- Increase threshold
- Implement chunk-based loading/unloading

## See Also

- [Coordinate System Docs](../coordinate-systems/cheatsheet.md)
- [Unity Floating Origin](../templates/floating-origin-unity.cs)
