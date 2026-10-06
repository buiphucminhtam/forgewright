# Primary sources and claim boundaries

Reviewed 2026-10-06. Consult the version matching the actual project when using
APIs. Recipes and lifecycle policies in this skill are original engineering
recommendations; sources below are supporting constraints, not copied assets.

| Source | Supports | Does not establish |
|---|---|---|
| [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) | compatible repeated geometry/material, draw-call reduction, instance updates/bounds | transparent sorting, mobile GPU speed or a pool |
| [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html) | attributes, draw ranges, bounds and disposal | active admission or object reuse from fixed buffers alone |
| [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) | render/resource counters and renderer controls | exact GPU bytes, aesthetic acceptance or physical-device timing |
| [Three.js Material](https://threejs.org/docs/pages/Material.html), [Texture](https://threejs.org/docs/pages/Texture.html) | explicit GPU resource disposal APIs | disposal on scene removal or per-particle disposal of shared assets |
| [Unity ObjectPool](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Pool.ObjectPool_1.html), [constructor](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Pool.ObjectPool_1-ctor.html) | reuse; inactive retention limit; creation when empty | maxSize as an active concurrency limit |
| [Unity Particle System optimization](https://docs.unity3d.com/6000.0/Documentation/Manual/particle-system-optimization.html) | Built-In GPU instancing path for mesh particles | GPU simulation equivalence, every pipeline/platform or universal mobile speed |
| [Unity Profiler](https://docs.unity3d.com/6000.0/Documentation/Manual/Profiler.html) | modules and platform-dependent profiling | editor results as phone acceptance |
| [Android GPU Inspector](https://developer.android.com/agi) | supported CPU/GPU/system and frame analysis | availability on every device/webview |
| [Android ADPF](https://developer.android.com/games/optimize/adpf) | thermal/performance adaptation context | guaranteed sustained performance or a mandatory dependency |
| [Android Emulator acceleration](https://developer.android.com/studio/run/emulator-acceleration) | host/virtual/software graphics configuration | physical-phone thermal/GPU acceptance |
| [XAG 103](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103) | additional channels for essential cues | mandatory sound for every decoration |
| [XAG 117](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117) | visual distraction and motion controls | one recipe or global fixed timing |
| [XAG 118](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/118) | luminance/red flash and spatial-pattern criteria | safety from a single flash-count heuristic or warning |
| [Riot VFX updates](https://www.leagueoflegends.com/en-us/news/dev/dev-behind-the-scenes-of-vfx-updates/) | gameplay accuracy/readability ahead of theme, visual-noise reduction | mobile budgets or copied production treatment |
| [Playrix lead-VFX account](https://dtf.ru/playrix/963583-kak-sozdayut-vizualnye-effekty-v-igrah-vid-iznutri) | practitioner case of simplifying repetitive unpleasant effects | retention improvement or universal beauty |

No linked asset is bundled. No video timecodes or unseen demonstrations are used
as evidence. Web accessibility guidance does not certify a native game.
