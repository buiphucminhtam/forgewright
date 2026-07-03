---
name: game-audio-engineer
description: "Orchestrates game audio architectures, background music loops, sound effect triggers, spatial 3D audio panning, and audio asset optimization. Use when the user requests sound effects integration, audio manager configurations, volume control systems, Web Audio API setups, or spatial sound attenuation in Phaser, Three.js, Unity, Unreal, or Godot games."
version: 1.0.0
---

# Game Audio Engineer (LITE)

## SOLVE Step 2: GROUND (Game Audio Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target game framework (Phaser, Three.js) or Web Audio library is configured | `cat package.json \| jq '.dependencies["phaser"] // .dependencies["three"]'` | Verifies target game engine and version settings [1, 2] | |
| Audio assets directory structure exists with compatible file formats | `find public/assets/audio/ -name "*.mp3" -o -name "*.ogg" -o -name "*.wav"` | Lists available audio assets grouped by format | |
| Standardized product or testing templates are active for verification | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs [3] | |
| Budget tracker configurations and spend caps are set for asset operations | `cat .forgewright/budget.yaml` | Active budget specifications to limit heavy token computation [1, 4] | |

## SOLVE Step 3: DECOMPOSE (Game Audio Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Verify asset compression rates, stereo/mono profiles, and memory footprint | Confirm that background tracks use optimized `.mp3`/`.ogg` compressions, and 3D spatial sounds use mono sources for accurate panning.
2. ORCHESTRATE | Build centralized, pooled volume mixers and dynamic audio managers | Verify sound allocation uses recycled audio instances or channels to prevent high Web Audio API overhead.
3. ATTENUATE | Configure spatial audio listeners and 3D positional panners in-engine | Ensure rolloff curves, max/ref distances, and listener positions are updated dynamically relative to the camera vector.
4. SYNC | Propagate audio configuration blueprints and testing logs to Obsidian | Execute post-skill synchronization scripts to establish absolute symlinks for doc alignments [5, 6].

## Common Mistakes Checklist
- **Unresumed AudioContext**: Attempting to play background music or audio cues prior to checking if the browser's `AudioContext` is suspended, resulting in browser-level autoplay blocking.
- **Leaked Spatial Nodes**: Failing to disconnect and dispose of custom `PannerNode`, `GainNode`, or Web Audio buffers when unloading sound objects, causing GPU/CPU execution stutter and Web Audio memory leaks.
- **Multichannel 3D Spatial Audio**: Attempting to play stereo or multichannel audio assets as spatial 3D positional sound sources, preventing correct panning calculations (which require mono sources).
- **Synchronous Sound Preloading**: Preloading massive, uncompressed audio assets all at once during startup instead of streaming long background tracks, leading to long game loading times and memory bloat.
- **Non-Compliant File Names**: Storing sound architecture specs or design reports under `docs/` using CamelCase, spaces, or absolute paths instead of strictly lowercase kebab-case [3].

## Worked Example

### Step 1: Verify audio asset layout and project profile
```bash
cat .forgewright/project-profile.json
find public/assets/audio/ -type f
```
Output:
```json
{
  "project_name": "forgewright-threejs-game",
  "tech_stack": ["Three.js", "WebGL", "TypeScript"],
  "health_status": "PASS"
}
```

### Step 2: Implement a high-performance, disposable Spatial Sound Manager in `src/audio/spatial-audio.ts`
```typescript
import * as THREE from 'three';

export class SpatialSoundManager {
  private listener: THREE.AudioListener;
  private panner: THREE.PositionalAudio;

  constructor(camera: THREE.Camera) {
    // Ground: Web Audio API context listener setup on main camera
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);

    this.panner = new THREE.PositionalAudio(this.listener);
  }

  // Load mono spatial audio asset with optimized distance rolloff
  public loadSpatialSound(mesh: THREE.Mesh, path: string, bufferLoader: THREE.AudioLoader) {
    bufferLoader.load(path, (buffer) => {
      this.panner.setBuffer(buffer);
      this.panner.setRefDistance(1.0);
      this.panner.setMaxDistance(15.0);
      this.panner.setRolloffFactor(1.5);
      this.panner.setLoop(true);
      
      mesh.add(this.panner);
      console.log(`[AUDIO] Positioned spatial sound attached to mesh.`);
    });
  }

  // Resume context safely to prevent browser autoplay blockages
  public resumeContext(): void {
    const context = this.listener.context;
    if (context.state === 'suspended') {
      context.resume().then(() => {
        console.log('[AUDIO] Web Audio context resumed successfully.');
      });
    }
  }

  // Explicit resource disposal to prevent Web Audio memory leaks
  public dispose(mesh: THREE.Mesh): void {
    if (this.panner.isPlaying) {
      this.panner.stop();
    }
    mesh.remove(this.panner);
    this.panner.disconnect();
  }
}
```

### Step 3: Document sound configurations and trigger live sync
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/01-product/spatial-audio-specs.md
# Feature: 3D Positional Audio Attenuation

## 1. Executive Summary
Responsive positional mono spatial audio for interactive 3D WebGL assets.

## 2. Technical Profile
- Engine: Three.js AudioListener / Web Audio API
- Asset Profile: Mono `.mp3` source, 128kbps, 44.1kHz.
- Attenuation: Linear distance rolloff, range 1m to 15m.
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian Vault
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Symlinked docs/01-product/spatial-audio-specs.md to /workspace/shared-obsidian-vault/forgewright/01-product/spatial-audio-specs.md.
```
