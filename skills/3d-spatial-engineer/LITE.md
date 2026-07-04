---
name: 3d-spatial-engineer
description: "Expert in 3D spatial design, coordinate transformations, blockout workflows, and engine-level performance optimizations. Use when the user requests 3D scene organization, coordinate transformations, layout optimizations, culling setups, or LOD metrics."
version: 1.0.0
---

# 3D Spatial Engineer (LITE)

## SOLVE Step 2: GROUND (3D Spatial Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target scene assets/prefabs exist | `ls Assets/Prefabs` / engine tools | ... | Y/N |
| Metric system of target engine is known | Engine docs (Unity: Y-up LHS, Godot: Y-up RHS, Unreal: Z-up LHS) | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (3D Spatial Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. BLOCKOUT | Construct layout using primitive metrics aligned to humanoid scale (1.75m) | Verify door clearance (2.2m) and corridor height (3m).
2. TRANSFORMS | Solve parent-child scene graph matrix transformations | Recalculate local transforms relative to new parents: $T'_L = T_G^{-1} \cdot T_{world\_global\_of\_L}$.
3. OPTIMIZE | Configure culling volumes, static batching, and LOD cutoffs | Verify draw call budget and LOD distance thresholds.
4. SYNC | Write configuration to `.forgewright/3d-spatial-engineer/` and sync to Obsidian | Write kebab-case documentation summaries.

## Common Mistakes Checklist
- **Cauldrons of Space**: Creating layouts that are cavernous or out of proportion with the player scale. Snap to standard humanoid scales (1.75m).
- **Matrix Order Mismatch**: Multiplying matrices in local-to-projection order instead of the reversed pipeline: $V_{clip} = M_{projection} \cdot M_{view} \cdot M_{model} \cdot V_{local}$.
- **Disjointed Scene Graph**: Moving child objects across parents without recalculating offset transforms relative to the new parent's inverse global transform.
- **Draw Call Splitting**: Generating separate materials for similar meshes instead of combining textures into atlases and batching draw calls.
- **Missing Occlusion Baking**: Letting the GPU render hidden interiors; bake occlusion cells or trigger levels dynamically.

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Recalculate transform matrix on parent change
```gdscript
# Godot 4.x example: Detach node from old parent and attach to new parent while preserving global position
func reparent_node(node: Node3D, new_parent: Node3D):
    var global_transform = node.global_transform
    node.get_parent().remove_child(node)
    new_parent.add_child(node)
    # Recalculate local transform relative to the new parent's inverse transform
    node.transform = new_parent.global_transform.affine_inverse() * global_transform
```
