---
name: level-designer
description: "Orchestrates game level layout generation, scene grid configurations, collision boundary placements, and level-specific parameter designs. Use when the user requests game level maps, collision boundaries, scene tilemap setups, procedural spawning configurations, or level difficulty tuning."
version: 1.0.0
---

# Level Designer (LITE)

## SOLVE Step 2: GROUND (Level Designer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project-specific game engine tech stack is active and profile is established | `cat .forgewright/project-profile.json` | Displays target game engine profile (Unity, Unreal, Godot, Roblox) | |
| Existing scene structures, level configurations, or map layout files are indexed | `find . -name "*.tscn" -o -name "*.unity" -o -name "*.umap" -o -name "*.json"` | Identifies active scene assets or structural config maps | |
| Standardized product requirements and level design templates are loaded | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs | |
| Running token tracker budget and spending safety ceilings are active | `cat .forgewright/budget.yaml` | Verifies cost boundaries prior to initiating procedural layouts | |

## SOLVE Step 3: DECOMPOSE (Level Designer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate visual grids, spawning coordinates, and environment collision layers | Ensure coordinate placements do not cause object overlap or physics-clipping issues.
2. GENERATE | Implement level coordinate grids, procedural spawn matrices, or tilemap layouts | Confirm level layout scripts or JSON representations generate cleanly without syntax errors.
3. CONSTRAIN | Establish navigation limits, camera containment zones, and victory conditions | Verify player characters are bounded within valid gameplay constraints.
4. SYNC | Save layout specifications as lowercase kebab-case under docs/ and run sync hooks | Confirm naming rules and run sync scripts to update the Shared Obsidian Vault.

## Common Mistakes Checklist
- **Out-of-Bounds Geometry Spawning**: Hardcoding object coordinates outside active physics collisions or camera bounds, resulting in players falling through the world.
- **Overlapping Collider Bloat**: Overlaying multiple unoptimized collision zones within close coordinates, severely degrading visual frame rates and physics processing performance.
- **Hardcoded Resolution Scales**: Hardcoding tile coordinates and viewport multipliers instead of setting modular ratios, breaking UI/level viewport presentation on different screen sizes.
- **Non-Compliant File Names**: Storing scene profiles, map designs, or level parameters under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/01-product/IceLevel.json` instead of `docs/01-product/ice-level.json`).
- **Unverified API spending**: Executing large, recursive procedural generation prompts or scene-mapping overhauls without validating current spend caps in `.forgewright/budget.yaml`.

## Worked Example

### Step 1: Ground target project settings and environment engine
```bash
cat .forgewright/project-profile.json
```
Output:
```json
{
  "project_name": "forgewright-retro-platformer",
  "tech_stack": ["Phaser", "JavaScript"],
  "health_status": "PASS"
}
```

### Step 2: Generate an optimized, modular 2D coordinate grid in `src/levels/level-one.json`
```json
{
  "level_name": "level-one",
  "grid_size": 32,
  "dimensions": { "width": 800, "height": 600 },
  "platforms": [
    { "x": 0, "y": 568, "width": 800, "height": 32, "type": "ground" },
    { "x": 400, "y": 400, "width": 200, "height": 32, "type": "platform" },
    { "x": 100, "y": 250, "width": 200, "height": 32, "type": "platform" }
  ],
  "spawners": {
    "player_start": { "x": 50, "y": 500 },
    "finish_gate": { "x": 700, "y": 350 }
  }
}
```

### Step 3: Run pre-flight linting to verify coordinate spacing and constraints
```bash
# Verify that player start coordinates are within map bounds
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/levels/level-one.json', 'utf8'));
const outOfBounds = data.spawners.player_start.x < 0 || data.spawners.player_start.x > data.dimensions.width;
if (outOfBounds) throw new Error('Player spawn coordinate is out of bounds!');
console.log('[SUCCESS] Spawning coordinate boundaries validated.');
"
```
Output:
```
[SUCCESS] Spawning coordinate boundaries validated.
```

### Step 4: Write specifications and synchronize to the Shared Obsidian Vault
```bash
cat << 'EOF' > docs/01-product/level-one-layout.md
# Level Spec: Retro Platformer Layout

## 1. Executive Summary
Provide a grid-aligned, responsive level structure with verified boundaries to prevent asset falling.

## 2. Technical Profile
- Engine Target: Phaser (Canvas View)
- Tile Size: 32px
- Physics Bounds: Strict 800x600 clamping
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for level-one-layout.md.
[SUCCESS] Symlinked docs/01-product/level-one-layout.md to /workspace/shared-obsidian-vault/forgewright/01-product/level-one-layout.md.
```
