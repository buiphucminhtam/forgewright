# Unity VFX integration

Read only for an observed Unity project. Record editor/runtime version, target
GPU, Built-In/URP/HDRP and installed packages; verify API and shader compatibility.

## Choose the smallest adequate representation

Reuse the current Particle System, sprite animation, trail/line or mesh setup.
An atlas/Texture Sheet Animation can provide authored temporal shapes; measure
memory/overdraw as well as simulation work. Ribbons and meshes can communicate
flow/silhouette without many particles. Bound trail history and reset it on
teleport, restart and pool reuse.

Particle System GPU instancing is a rendering optimization with pipeline,
shader and mesh requirements. It is not equivalent to GPU particle simulation.
Unity's [Built-In Particle System optimization docs](https://docs.unity3d.com/6000.0/Documentation/Manual/particle-system-optimization.html)
cover that pipeline; do not copy the setup into URP/HDRP unchanged. Adopt VFX
Graph only if the installed package/platform/pipeline supports it and measurements
justify its simulation/render cost. GPU particles are not always faster on
mobile: large transparent fragments, bandwidth and thermal throttling can dominate.

## Pooling and active admission

[Unity ObjectPool<T>](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Pool.ObjectPool_1.html)
is an instance reuse mechanism. Its
[maxSize constructor parameter](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Pool.ObjectPool_1-ctor.html)
limits instances retained when returned; **ObjectPool.maxSize is not an active
concurrency cap**. `Get` can create an instance when no inactive instance exists.
Do not infer an active cap from `defaultCapacity`, either.

Track active effect handles independently. Admission checks priority, active
emitters/particles and expected transparent coverage before obtaining/playing an
instance. Drop or coalesce decoration deterministically at saturation. A
Particle System's particle limit bounds that system, not all effect instances.

Define get/release/destroy ownership. On release: stop and clear owned systems,
reset transform/material properties, trails, audio, timers and per-play state;
unsubscribe owned events and invalidate its play token. Do not release twice.
A delayed stop callback from a previous play must not release the same instance
while a newer invocation uses it. Main-thread/lifetime rules still apply; a pool
is not a thread-safety guarantee. Prewarm only if measured startup needs justify
memory and time; never present capacity as a benchmarked device budget.

## Events and pause/restart

Present committed events carrying revision/generation. Score/reward and level
completion live in gameplay authority and proceed with VFX disabled or canceled.
Guard coroutines, tweens, delayed invokes and completion callbacks with the
captured play token as well as scene generation; cancel/unsubscribe during
teardown. Match the project's scaled/unscaled-time and pause contract rather
than mixing clocks accidentally. On background/resume or scene replacement,
avoid catch-up bursts and invalidate stale work before returning instances.

## Evidence

Use the [Unity Profiler](https://docs.unity3d.com/6000.0/Documentation/Manual/Profiler.html)
on a target device/development build with suitable modules: CPU main/render
thread, GC/allocation, rendering and GPU when supported. Editor timings are not
a device baseline. Pair frame analysis with normal-speed gameplay, accessibility
variants and repeated win/restart/load loops. Use the shared phone profiling and
acceptance reference; record unsupported GPU markers as a limitation.
