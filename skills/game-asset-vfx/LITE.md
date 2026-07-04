---
name: game-asset-vfx
description: "Orchestrates game visual effects (VFX), custom shader generation, particle system parameters, and post-processing layers. Use when the user requests particle systems, screen shakes, spell/ability effects, shader-based transitions, or visual feedbacks in Phaser, Three.js, Unity, Unreal, Godot, or Roblox."
version: 1.0.0
---

# Game Asset Vfx (LITE)

## SOLVE Step 2: GROUND (Game Asset Vfx Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target game development framework and graphics libraries are installed | `cat package.json \| jq '.dependencies["phaser"] // .dependencies["three"]'` | ... | Y/N |
| Existing shader assets, material files, or particle JSON setups exist | `find assets/ -name "*vfx*" -o -name "*particle*" -o -name "*.glsl"` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Game Asset Vfx Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Analyze renderer blend modes (e.g., Additive, Screen) and context capacity | Verify engine and viewport properties allow alpha transparency overlay without black boundaries.
2. GENERATE | Write custom fragment/vertex GLSL shaders or design JSON emitter properties | Ensure mathematical formulas in the GPU pipeline are optimized to prevent mobile/XR stuttering.
3. INTEGRATE | Attach visual effects triggers and emitter pools to game loop events | Verify instantiation uses recycling (Object Pools) rather than continuously creating active objects.
4. SYNC | Propagate effect specifications and metadata logs to Shared Obsidian Vault | Execute post-skill synchronization scripts to establish absolute symlinks for doc alignments.

## Common Mistakes Checklist
- **Dynamic Emitter Allocation**: Creating new Particle Emitter instances inside the game update loop or on every event trigger instead of utilizing a recycled Object Pool, causing high garbage collection stutter.
- **Precision Type Overkill**: Specifying highp precision variables uniformly in mobile fragment shaders instead of mediump/lowp, heavily impacting shader execution on low-spec GPUs.
- **Transparent Canvas Artifacts**: Applying additive blend settings on elements without activating transparent canvas configurations, resulting in unrendered solid black backing frames.
- **No-Reset Particle Destructors**: Failing to dispose of materials, textures, and vertex array buffers on shader or state transitions, triggering WebGL context loss errors.
- **Non-Compliant Naming Standards**: Storing VFX metadata documents under `docs/` using uppercase, camelCase, or space naming structures instead of strictly lowercase kebab-case.

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground runtime framework and asset location
```bash
cat package.json | grep -E "(phaser|three)"
```

### Step 2: Create a high-performance, recycled particle effect configuration in `src/vfx/fire-burst.ts`
```typescript
import Phaser from 'phaser';

export class FireBurstVFX {
  private particles: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Verified: Leverages standard framework particle engines with pooling
    this.particles = scene.add.particles(x, y, 'flare-texture', {
      lifespan: 600,
      speed: { min: 100, max: 250 },
      scale: { start: 0.8, end: 0 },
      blendMode: 'ADD', // Standard additive glow blend
      lifespan_variance: 150,
      quantity: 12,
      emitting: false
    });
  }

  // Trigger explosive blast from the pooled emitter
  public triggerBurst(x: number, y: number) {
    this.particles.setPosition(x, y);
    this.particles.explode(24);
  }

  // Explicitly release resources to protect WebGL contexts from leaks
  public destroy() {
    this.particles.destroy();
  }
}
```

