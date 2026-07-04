---
name: game-audio-engineer
description: "Orchestrates game audio architectures, background music loops, sound effect triggers, spatial 3D audio panning, and audio asset optimization. Use when the user requests sound effects integration, audio manager configurations, volume control systems, Web Audio API setups, or spatial sound attenuation in Phaser, Three.js, Unity, Unreal, or Godot games."
version: 1.0.0
---

# Game Audio Engineer (LITE)

## SOLVE Step 2: GROUND (Game Audio Engineer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Target game framework (Phaser, Three.js) or Web Audio library is configured | `cat package.json \| jq '.dependencies["phaser"] // .dependencies["three"]'` | ... | run the check command and paste output |
| Audio assets directory structure exists with compatible file formats | `find public/assets/audio/ -name "*.mp3" -o -name "*.ogg" -o -name "*.wav"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Game Audio Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Verify asset compression rates, stereo/mono profiles, and memory footprint | Confirm that background tracks use optimized `.mp3`/`.ogg` compressions, and 3D spatial sounds use mono sources for accurate panning.
2. ORCHESTRATE | Build centralized, pooled volume mixers and dynamic audio managers | Verify sound allocation uses recycled audio instances or channels to prevent high Web Audio API overhead.
3. ATTENUATE | Configure spatial audio listeners and 3D positional panners in-engine | Ensure rolloff curves, max/ref distances, and listener positions are updated dynamically relative to the camera vector.

## Common Mistakes Checklist
- **Leaked Spatial Nodes**: Failing to disconnect and dispose of custom `PannerNode`, `GainNode`, or Web Audio buffers when unloading sound objects, causing GPU/CPU execution stutter and Web Audio memory leaks.
- **Multichannel 3D Spatial Audio**: Attempting to play stereo or multichannel audio assets as spatial 3D positional sound sources, preventing correct panning calculations (which require mono sources).
- **Non-Compliant File Names**: Storing sound architecture specs or design reports under `docs/` using CamelCase, spaces, or absolute paths instead of strictly lowercase kebab-case.

### Step 1: Verify audio asset layout and project profile
```bash
cat .forgewright/project-profile.json
find public/assets/audio/ -type f
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
