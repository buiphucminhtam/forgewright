# Three.js, WebGL, Canvas and Capacitor

Read only after verifying the runtime/version. Keep the game's existing renderer.
These are engineering choices to test, not a promise of faster mobile rendering.

## Three.js / WebGL

Inspect current draw calls, passes, shader/material reuse and transparent screen
coverage before choosing a representation. For compatible repeated geometry and
material, [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) can
reduce draw calls. Batch changes and mark modified instance attributes for
update; keep bounds correct when transforms move. Instancing does not solve
transparency ordering or fragment overdraw.

For small particles, inspect whether the project already uses points, quads or
meshes. [BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html)
provides reusable attributes and draw ranges: preallocate capacity, update live
regions and maintain bounds; fixed buffers alone do not prove object reuse.
Choose point sprites only if device limits, size and art needs fit. Quads,
flipbooks or ribbons may better represent a directional silhouette.

Use an atlas when UVs, sampler/filtering, material and blend state are compatible.
Pad frame borders and inspect alpha fringes, premultiplication and minification
on the real background. Sorting, render order, depth test/write and additive
blending need explicit review: additive glow can wash out the board, and turning
off depth testing is not a universal fix. Keep gameplay indicators legible.

Shader precision, DPR/render scale, bloom and render-target size are trade-offs,
not universal presets. Compare variants on representative devices; do not force
low precision everywhere. GPU simulation adds uploads/state/bandwidth and does
not make large translucent areas cheap. Avoid introducing compute/WebGPU or a
post-processing dependency without actual runtime support and a measured need.

Track ownership of geometry, material, textures and render targets. Removing a
scene object does not dispose its GPU resources. Release owned resources when
no consumer remains; do not dispose a shared texture on each particle release.
[Material.dispose](https://threejs.org/docs/pages/Material.html) and
[Texture.dispose](https://threejs.org/docs/pages/Texture.html) define their
resource lifetimes. Check the installed version's API and context-loss path.
Use [WebGLRenderer.info](https://threejs.org/docs/pages/WebGLRenderer.html) for
render/resource counters; aggregate multiple passes correctly. Counters are not
GPU-byte accounting or proof of driver memory reclamation.

## Canvas 2D or existing sprite engine

Start with the existing draw/update loop and project scheduler. Reuse image
assets, paths and scratch data where allocation is observed; avoid a new timer
per particle. A bounded array that repeatedly allocates entries still creates
GC work. Pool only with an explicit reset/release policy and independent active
cap. Pre-render an expensive static primitive when useful, cache only with a
clear invalidation/ownership rule, and inspect resize/DPR memory growth.

Reduce large translucent coverage, repeated shadows/filters and unnecessary
redraws before migrating renderers. Atlas sprites and modest flipbooks can work
in Canvas; a shader rewrite is not a prerequisite for readable puzzle feedback.
Follow native engine batching/pooling APIs only after verifying their version.

## Capacitor and mobile webviews

Inspect the webview and actual Canvas/WebGL engine. Test CSS pixels versus
backing resolution, orientation, safe areas, high-DPR fill cost and background
transitions. Integrate the project's existing visibility/app-lifecycle signals;
verify the installed host API rather than assuming listener names. On hidden or
background state, stop/cancel cosmetic work and reset the next frame time origin;
resume should not accumulate missed bursts or grant rewards.

Use browser/WebView tracing for JS, allocations and frame pacing. Android GPU
Inspector availability depends on device/API/debuggable process support; do not
assume it can capture every webview. If GPU timings are unavailable, label them
unmeasured and investigate with available tools rather than inferring GPU time
from FPS. A desktop browser or AVD provides smoke evidence, not physical-phone
thermal/performance acceptance. Apply the shared lifecycle and profiling refs.
