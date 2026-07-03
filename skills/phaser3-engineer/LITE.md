---
name: phaser3-engineer
description: "Orchestrates Phaser 3 game engine configurations, interactive HTML5 canvas scenes, asset loading pipelines, sprite animations, and Arcade/Matter physics integrations. Use when the user requests 2D game loops, custom WebGL/Canvas game rendering, collision handlers, spritesheet actions, or performance optimizations in Phaser 3."
version: 1.0.0
---

# Phaser3 Engineer (LITE)

## SOLVE Step 2: GROUND (Phaser3 Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Phaser 3 package is configured as a dependency in the workspace | `cat package.json \| jq '.dependencies["phaser"]'` | Confirms Phaser 3 library version and package status [1, 2] | |
| Existing game configurations or scene files are indexed under source directories | `find src/ -name "*game*" -o -name "*scene*" -o -name "*phaser*"` | Identifies active game configs, core entrypoints, and state machines | |
| Standardized product requirements and feature spec templates are loaded | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Ensures design specifications conform to the standard layout format [3] | |
| Active API expenditure parameters and cost ceilings are configured | `cat .forgewright/budget.yaml` | Verifies current session spend threshold rules [4] | |

## SOLVE Step 3: DECOMPOSE (Phaser3 Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Assess Phaser game config settings, render pipelines, and asset paths | Verify canvas width/height parameters, asset loading sequences, scaling modes, and anti-aliasing configurations.
2. CONSTRUCT | Implement responsive Phaser Scenes, custom physics bodies, or high-frequency update loops | Ensure game updates utilize frame-independent delta-time calculations and object pools [5].
3. POOL | Set up custom Game Object pools for active sprites (e.g., bullets, enemies) | Ensure entities are recycled using standard Phaser Groups to prevent garbage collection execution spikes.
4. SYNC | Document implementation blueprints and run the sync-obsidian hook | Verify file name compliance (lowercase kebab-case) and establish absolute symlinks to Obsidian [3, 6].

## Common Mistakes Checklist
- **Memory Leak via Dangling Event Listeners**: Failing to unsubscribe custom event buses, keyboard inputs, or pointer listeners on scene shutdowns, causing duplicate triggers on scene restarts.
- **Unpooled Entity Allocations (GC Spikes)**: Creating fresh sprite objects continuously inside high-frequency update loops instead of utilizing pre-allocated Phaser Groups, causing high Garbage Collection pauses.
- **Unhandled Suspended AudioContext**: Attempting to play background tracks or sound effects prior to checking browser-level autoplay configurations, causing blocked Web Audio pipelines.
- **Non-Compliant File Names**: Creating scene configurations, asset catalogs, or guides under `docs/` using CamelCase, spaces, or uppercase naming patterns instead of strictly lowercase kebab-case (e.g. `player-physics-setup.md`) [3].
- **Unverified AI Token Budgets**: Initiating large-scale procedural asset configurations or logic generation loops without validating current spend caps in `.forgewright/budget.yaml` [4].

## Worked Example

### Step 1: Verify the Phaser dependency and project profile
```bash
cat .forgewright/project-profile.json
cat package.json | grep phaser
```
Output:
```json
{
  "project_name": "forgewright-phaser-game",
  "tech_stack": ["Phaser", "TypeScript"],
  "health_status": "PASS"
}
```
```json
    "phaser": "^3.80.0"
```

### Step 2: Implement a high-performance, object-pooled Phaser Scene in `src/scenes/GameScene.ts`
```typescript
import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  private projectilePool!: Phaser.Physics.Arcade.Group;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    // Ground: Relative asset paths used to avoid server-side 404s
    this.load.image('bullet', 'assets/sprites/laser-bullet.png');
  }

  create() {
    // Initialize Arcade physics group with strict size pooling configurations
    this.projectilePool = this.physics.add.group({
      defaultKey: 'bullet',
      maxSize: 30, // Strict memory ceiling
      runChildUpdate: true
    });

    // Safely capture keyboard inputs
    this.input.keyboard?.on('keydown-SPACE', this.fireProjectile, this);

    // Register cleanup triggers to prevent memory leaks on scene swap
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown-SPACE');
      this.projectilePool.destroy(true);
      console.log('[CLEANUP] Phaser scene destroyed and inputs unsubscribed.');
    });
  }

  private fireProjectile() {
    const bullet = this.projectilePool.get(400, 500) as Phaser.Physics.Arcade.Sprite;
    if (bullet) {
      bullet.setActive(true);
      bullet.setVisible(true);
      bullet.setVelocityY(-400); // Set frame-independent velocity vector
    }
  }

  update() {
    // Check and disable out-of-bounds entities to keep the pool fresh
    this.projectilePool.getChildren().forEach((bullet: any) => {
      if (bullet.active && bullet.y < 0) {
        this.projectilePool.killAndHide(bullet);
      }
    });
  }
}
```

### Step 3: Document game specifications and sync files with the Shared Obsidian Vault
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/01-product/projectile-mechanics.md
# Feature: Frame-Independent Projectile System

## 1. Executive Summary
Responsive, object-pooled projectile mechanics for the main game canvas scene.

## 2. Technical Profile
- Engine: Phaser 3 with Arcade Physics
- Constraints: Maximum 30 active projectiles, relative asset loading pathing.
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for projectile-mechanics.md.
[SUCCESS] Symlinked docs/01-product/projectile-mechanics.md to /workspace/shared-obsidian-vault/forgewright/01-product/projectile-mechanics.md.
```
