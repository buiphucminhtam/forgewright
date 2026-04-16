# Asset Placement Checklist

> A pre-placement validation system to ensure assets are correctly positioned before placing them in the game world.

## Purpose

Before placing any asset in the game world, run through this checklist to prevent:
- Misaligned assets
- Coordinate system mismatches
- Scale errors
- Precision loss issues

## Quick Checklist

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ASSET PLACEMENT CHECKLIST                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ☐ 1. ENGINE COORDINATES                                          │
│     □ Export from Blender with correct axis (see below)            │
│     □ Import settings match source engine                           │
│     □ Forward vector matches target engine                          │
│                                                                     │
│  ☐ 2. SCALE                                                        │
│     □ Unit scale verified (1 unit = 1 meter)                       │
│     □ No 100x scale mismatch                                       │
│     □ Human character ~1.8 units tall                               │
│                                                                     │
│  ☐ 3. POSITION                                                     │
│     □ Distance from origin < 5000 units                           │
│     □ OR Floating Origin enabled if > 5000 units                  │
│     □ Position verified in engine viewport                          │
│                                                                     │
│  ☐ 4. ROTATION                                                     │
│     □ Asset faces correct direction (+Z or -Z based on engine)     │
│     □ No 90° rotation errors                                        │
│     □ Rotation applied correctly                                    │
│                                                                     │
│  ☐ 5. PARENT HIERARCHY                                             │
│     □ Parent transform correct                                      │
│     □ Local vs Global coordinates verified                         │
│     □ No unintended inherited transforms                            │
│                                                                     │
│  ☐ 6. COLLISION (if applicable)                                   │
│     □ Collision mesh present                                        │
│     □ Collision matches visual mesh                                 │
│     □ Physics layer correct                                         │
│                                                                     │
│  ☐ 7. MATERIALS                                                    │
│     □ Materials assigned                                            │
│     □ Textures present                                             │
│     □ LOD materials (if applicable)                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Per-Engine Checklist

### Unity Checklist

```
□ Import Settings:
  □ Scale Factor: 1.0
  □ Convert Units: ✓
  □ Generate Colliders: ✓ (if needed)

□ Position:
  □ Forward = -Z
  □ Up = +Y
  □ Right = +X

□ Post-Import:
  □ Test with simple cube first
  □ Verify rotation in Scene view
  □ Check Scale in Inspector
```

### Godot Checklist

```
□ Import Settings:
  □ Import Scale: 1.0
  □ Create Root Bone: ✓ (if rigged)

□ Position:
  □ Forward = +Z
  □ Up = +Y
  □ Right = +X

□ Post-Import:
  □ Test with MeshInstance3D first
  □ Check global_position in Inspector
  □ Verify rotation_degrees
```

### Unreal Checklist

```
□ Import Settings:
  □ Import Scale: 1.0 (1 Unreal unit = 1 cm)

□ Position:
  □ Forward = +Z
  □ Up = +Y
  □ Right = +X

□ Post-Import:
  □ Verify height in units (door ~200)
  □ Test collision
  □ Check static mesh settings
```

## Coordinate Command Verification

Use the Forgewright CLI to validate positions:

```bash
# Validate position before placing
forge coords validate "5000,0,0" --engine unity

# Convert from one engine to another
forge coords convert "10,20,30" --from godot --to unity

# Check precision risk
forge coords validate "10000,0,0" --engine godot
```

## Common Issues & Fixes

### Issue: Asset appears tiny
```
Cause: Export scale was 0.01 or wrong unit system
Fix: Re-export with Scale: 1.0, apply transforms
```

### Issue: Asset rotated 90°
```
Cause: Forward axis mismatch
Fix: Set correct Forward/Up in export settings
     Unity: -Y Forward, Z Up
     Godot: -Z Forward, Y Up
```

### Issue: Asset in wrong position
```
Cause: Local vs Global confusion
Fix: Check parent transforms
     Verify coordinate system matches
     Use "Apply Transform" in Blender
```

### Issue: Jittering at distance
```
Cause: Floating point precision
Fix: Enable Floating Origin
     Or move asset closer to origin
```

## Decision Flow

```
START: Asset Ready to Place
          │
          ▼
    ┌─────────────┐
    │ Distance    │
    │ from Origin │
    └─────────────┘
          │
    ┌─────┴─────┐
    │           │
  <5000      >5000
    │           │
    ▼           ▼
┌─────────┐ ┌──────────────────┐
│ Place   │ │ Enable Floating │
│ Directly│ │ Origin First    │
└─────────┘ └──────────────────┘
```

## Sign-Off

Before marking asset placement as complete:

```
□ All checklist items verified
□ CLI validation passed (if applicable)
□ Visual inspection in engine viewport
□ Test play/collision (if applicable)
□ Documentation updated (if needed)
```

## See Also

- [Coordinate System Cheatsheet](../coordinate-systems/cheatsheet.md)
- [Import Settings Guide](../coordinate-systems/import-settings.md)
- [Floating Origin Guide](../guides/floating-origin.md)
- [CLI Reference: forge coords](../../cli/src/commands/coords.ts)
