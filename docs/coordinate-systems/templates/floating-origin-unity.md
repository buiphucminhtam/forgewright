# Floating Origin - Unity C#

> A floating origin implementation for Unity to handle large world coordinates and prevent floating-point precision issues.

## Overview

When game objects are far from the world origin (typically > 5000 units), floating-point precision issues cause:
- Jittering and trembling of objects
- Teleporting or snapping
- Physics instability
- Rendering artifacts

The Floating Origin pattern solves this by keeping the player/camera near the world origin (0,0,0) and shifting the world around them.

## Quick Start

### 1. Add the Script

Copy `FloatingOrigin.cs` to your Unity project and attach it to an empty GameObject:

```
Assets/Scripts/FloatingOrigin.cs
```

### 2. Configure

Set the player/camera reference in the Inspector or via code:

```csharp
// In any script
FloatingOrigin.Instance.SetPlayer(playerTransform);
```

### 3. That's It!

The FloatingOrigin system will automatically shift the world when needed.

## Features

### ✅ Automatic Origin Shifting
- Triggers when player exceeds threshold distance from origin
- Smoothly shifts world to keep player centered
- Maintains all relative positions

### ✅ Physics Synchronization
- Automatically calls `Physics.SyncTransforms()` after shift
- Ensures physics remains stable
- Prevents collision detection issues

### ✅ Events & Callbacks
- Subscribe to origin shift events
- Pre-shift for chunk loading
- Post-shift for chunk unloading

### ✅ Chunk-Based Worlds
- Support for chunked/open-world games
- Load/unload chunks based on player position
- Seamless chunk transitions

## API Reference

### Properties

```csharp
// Singleton instance
public static FloatingOrigin Instance { get; }

// Configuration (editable in Inspector)
public float Threshold = 5000f;           // Distance to trigger shift
public bool Enabled = true;               // Enable/disable
public bool SmoothShift = false;          // Use interpolation
public float ShiftSpeed = 10f;            // Interpolation speed
public bool DebugMode = false;            // Print debug info
```

### Methods

```csharp
// Set the player/camera transform
FloatingOrigin.Instance.SetPlayer(Transform player);

// Track/untrack transforms manually
FloatingOrigin.Instance.TrackTransform(Transform t);
FloatingOrigin.Instance.UntrackTransform(Transform t);

// Get current world offset
Vector3 offset = FloatingOrigin.Instance.WorldOffset;

// Convert world position to local
Vector3 local = FloatingOrigin.Instance.ToLocal(worldPos);

// Convert local position to world
Vector3 world = FloatingOrigin.Instance.ToWorld(localPos);

// Force an origin shift
FloatingOrigin.Instance.ForceShift();

// Reset to origin
FloatingOrigin.Instance.Reset();
```

### Events

```csharp
// Subscribe to events
FloatingOrigin.Instance.OnOriginShift += HandleOriginShift;
FloatingOrigin.Instance.OnPreShift += HandlePreShift;
FloatingOrigin.Instance.OnPostShift += HandlePostShift;

// Event handlers
void HandleOriginShift(Vector3 oldOffset, Vector3 newOffset) {
    Debug.Log($"Origin shifted from {oldOffset} to {newOffset}");
}

void HandlePreShift(Vector3 newOffset) {
    // Load chunks for new area
}

void HandlePostShift(Vector3 oldOffset) {
    // Unload distant chunks
}
```

## Complete Example

```csharp
// FloatingOriginManager.cs
using UnityEngine;

public class FloatingOriginManager : MonoBehaviour
{
    [SerializeField] private Transform player;
    [SerializeField] private float chunkSize = 1000f;
    
    private void Start()
    {
        if (player != null)
        {
            FloatingOrigin.Instance.SetPlayer(player);
        }
        
        // Subscribe to events
        FloatingOrigin.Instance.OnOriginShift += OnOriginShift;
        FloatingOrigin.Instance.OnPreShift += OnPreShift;
        FloatingOrigin.Instance.OnPostShift += OnPostShift;
    }
    
    private void OnOriginShift(Vector3 oldOffset, Vector3 newOffset)
    {
        Debug.Log($"Origin shifted: {oldOffset} -> {newOffset}");
    }
    
    private void OnPreShift(Vector3 newOffset)
    {
        LoadChunksAround(newOffset);
    }
    
    private void OnPostShift(Vector3 oldOffset)
    {
        UnloadDistantChunks(oldOffset);
    }
    
    private void LoadChunksAround(Vector3 position)
    {
        int chunkX = Mathf.FloorToInt(position.x / chunkSize);
        int chunkZ = Mathf.FloorToInt(position.z / chunkSize);
        
        for (int dx = -3; dx <= 3; dx++)
        {
            for (int dz = -3; dz <= 3; dz++)
            {
                LoadChunk(chunkX + dx, chunkZ + dz);
            }
        }
    }
    
    private void LoadChunk(int cx, int cz)
    {
        // Load chunk here
        Debug.Log($"Loading chunk: {cx}, {cz}");
    }
    
    private void UnloadDistantChunks(Vector3 oldOffset)
    {
        float unloadDistance = chunkSize * 5f;
        // Unload logic here
    }
    
    private void OnDestroy()
    {
        if (FloatingOrigin.HasInstance)
        {
            FloatingOrigin.Instance.OnOriginShift -= OnOriginShift;
            FloatingOrigin.Instance.OnPreShift -= OnPreShift;
            FloatingOrigin.Instance.OnPostShift -= OnPostShift;
        }
    }
}
```

## Chunk-Based World Example

```csharp
// ChunkManager.cs
using System.Collections.Generic;
using UnityEngine;

public class ChunkManager : MonoBehaviour
{
    [SerializeField] private float chunkSize = 1000f;
    [SerializeField] private int loadRadius = 3;
    
    private Dictionary<Vector2Int, GameObject> loadedChunks = new();
    private Vector3 lastOffset;
    
    private void Start()
    {
        FloatingOrigin.Instance.OnOriginShift += OnOriginShift;
    }
    
    private void OnOriginShift(Vector3 oldOffset, Vector3 newOffset)
    {
        UpdateChunks();
    }
    
    private void UpdateChunks()
    {
        Vector3 playerPos = FloatingOrigin.Instance.WorldOffset;
        int playerChunkX = Mathf.FloorToInt(playerPos.x / chunkSize);
        int playerChunkZ = Mathf.FloorToInt(playerPos.z / chunkSize);
        
        // Load chunks in radius
        for (int dx = -loadRadius; dx <= loadRadius; dx++)
        {
            for (int dz = -loadRadius; dz <= loadRadius; dz++)
            {
                Vector2Int chunkKey = new Vector2Int(playerChunkX + dx, playerChunkZ + dz);
                
                if (!loadedChunks.ContainsKey(chunkKey))
                {
                    LoadChunk(chunkKey.x, chunkKey.y);
                }
            }
        }
        
        // Unload distant chunks
        UnloadDistantChunks(playerPos);
    }
    
    private void LoadChunk(int cx, int cz)
    {
        Vector2Int key = new Vector2Int(cx, cz);
        
        // Create chunk game object
        GameObject chunk = new GameObject($"Chunk_{cx}_{cz}");
        chunk.transform.position = new Vector3(cx * chunkSize, 0, cz * chunkSize);
        
        // Add mesh/terrain/etc. here
        
        loadedChunks[key] = chunk;
        Debug.Log($"Loaded chunk: {cx}, {cz}");
    }
    
    private void UnloadDistantChunks(Vector3 playerPos)
    {
        float unloadDistance = chunkSize * (loadRadius + 2);
        List<Vector2Int> toUnload = new();
        
        foreach (var kvp in loadedChunks)
        {
            Vector2 chunkCenter = new Vector2(
                kvp.Key.x * chunkSize + chunkSize / 2f,
                kvp.Key.y * chunkSize + chunkSize / 2f
            );
            
            float dist = Vector2.Distance(
                new Vector2(playerPos.x, playerPos.z),
                chunkCenter
            );
            
            if (dist > unloadDistance)
            {
                toUnload.Add(kvp.Key);
            }
        }
        
        foreach (var key in toUnload)
        {
            if (loadedChunks.TryGetValue(key, out GameObject chunk))
            {
                Destroy(chunk);
                loadedChunks.Remove(key);
                Debug.Log($"Unloaded chunk: {key.x}, {key.y}");
            }
        }
    }
    
    private void OnDestroy()
    {
        if (FloatingOrigin.HasInstance)
        {
            FloatingOrigin.Instance.OnOriginShift -= OnOriginShift;
        }
    }
}
```

## Performance Considerations

1. **Threshold Tuning**: Larger thresholds = fewer shifts = better performance
2. **Smooth Shifting**: Adds slight overhead but prevents jarring transitions
3. **Track Count**: Only track dynamic objects, not static world geometry
4. **Chunk Loading**: Use async loading (`async/await`) to prevent frame drops

```csharp
// Async chunk loading example
private async Task LoadChunkAsync(int cx, int cz)
{
    await Task.Run(() => {
        // Heavy computation here
    });
    
    // Then create on main thread
    LoadChunk(cx, cz);
}
```

## Troubleshooting

### Objects Still Jitter
- Lower the threshold (try 2000 or 1000)
- Enable `SmoothShift` for smoother transitions
- Ensure all tracked transforms are included
- Check for objects outside the tracked hierarchy

### Physics Issues
- Ensure `Physics.SyncTransforms()` is being called
- Check that colliders update after shift
- Use `Rigidbody.MovePosition()` for kinematic bodies

```csharp
// Force physics sync
void ForcePhysicsSync()
{
    Physics.SyncTransforms();
}
```

### Performance Issues
- Reduce number of tracked transforms
- Increase threshold
- Implement chunk-based loading/unloading
- Use object pooling for frequently spawned objects

## See Also

- [Coordinate System Docs](../coordinate-systems/cheatsheet.md)
- [Godot Floating Origin](../templates/floating-origin-godot.md)
