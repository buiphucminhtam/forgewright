# Coordinate Systems Documentation

> Complete guide for handling coordinate systems, transformations, and precision issues across game engines.

## Quick Links

| Document | Description |
|----------|-------------|
| [Cheatsheet](cheatsheet.md) | Quick reference for all engines |
| [Import Settings](import-settings.md) | Detailed import/export settings |
| [Axis Conversion](axis-conversion.md) | Code for coordinate transformations |
| [Placement Checklist](placement-checklist.md) | Pre-placement validation |
| [Floating Origin Guide](../../docs/guides/floating-origin.md) | Large world coordinate handling |

## Templates

| Template | Description |
|----------|-------------|
| [Godot Floating Origin](templates/floating-origin.gd) | GDScript implementation |
| [Unity Floating Origin](templates/FloatingOrigin.cs) | C# implementation |
| [Godot Coordinate Gizmo](templates/coordinate-gizmo-godot.gd) | Editor tool |
| [Unity Coordinate Gizmo](templates/coordinate-gizmo-unity.md) | Editor script |

## Overview

### The Problem

When working with multiple game engines or moving assets between them, coordinate system differences cause:

- **Position errors**: Assets appear in wrong locations
- **Rotation errors**: Objects facing wrong direction
- **Scale errors**: Models 100x too large or small
- **Precision loss**: Jittering, teleportation at large distances

### The Solution

This documentation provides:

1. **Understanding**: Know the coordinate systems
2. **Conversion**: Transform coordinates between engines
3. **Validation**: Check positions before placement
4. **Prevention**: Use Floating Origin for large worlds

## Engine Coordinate Systems

```
┌──────────────────────────────────────────────────────────────┐
│                    COORDINATE SYSTEM COMPARISON              │
├──────────┬───────────┬─────────────┬───────────────────────┤
│ Engine   │ System    │ Forward     │ Unit                  │
├──────────┼───────────┼─────────────┼───────────────────────┤
│ Unity    │ Left-Hand │ -Z          │ 1 unit = 1 meter     │
│ Godot    │ Right-Hand│ +Z          │ 1 unit = 1 meter     │
│ Unreal   │ Left-Hand │ +Z          │ 1 unit = 1 cm        │
│ Blender  │ Right-Hand│ +Z / -Y     │ 1 unit = 1 meter     │
└──────────┴───────────┴─────────────┴───────────────────────┘
```

## CLI Commands

```bash
# List supported engines
forge coords engines

# Convert coordinates
forge coords convert "10,20,30" --from unity --to godot

# Validate position
forge coords validate "5000,0,0" --engine unity

# Quick reference
forge coords ref
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Asset tiny | Wrong unit scale | Set scale to 1.0 on export |
| Asset rotated 90° | Axis mismatch | Set correct forward/up |
| Jittering at distance | Precision loss | Use Floating Origin |
| Purple material | Missing shader | Assign materials |

## Best Practices

1. **Always apply transforms** before exporting from Blender
2. **Use glTF 2.0** when possible (better consistency)
3. **Validate positions** with `forge coords validate`
4. **Enable Floating Origin** for worlds > 5000 units
5. **Test with simple shapes** before complex models

## Related Documentation

- [Forgewright CLI Docs](../../src/cli/README.md)
- [Godot Engineer Skill](../../skills/godot-engineer/SKILL.md)
- [Unity Engineer Skill](../../skills/unity-engineer/SKILL.md)
- [Game Designer Skill](../../skills/game-designer/SKILL.md)
