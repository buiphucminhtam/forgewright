# Real-phone profiling and acceptance

Run when integrating or optimizing game VFX. No performance budget here is a
benchmark. Agree device/frame targets from the game's requirements, then measure.

## Reproducible workload

1. Record build/commit, engine/pipeline, physical phone/GPU, OS, webview where
   relevant, resolution/DPR, quality settings, refresh rate and target frame rate.
   Match brightness, power mode, charge state and ambient conditions across runs.
2. Replay the same seeded actions and event cadence with VFX disabled (baseline),
   enabled (candidate) and worst overlap (stress). Include input, combos, win,
   repeated restart/load, pause and background/resume. Compare equivalent art and
   workload when testing CPU/GPU representations, not unequal particle counts.
3. Separate cold asset/shader startup, warmed play and sustained thermal behavior.
   Run long enough to expose heat/throttling for the actual product session; do
   not invent a universal duration. Repeat comparable runs and retain traces.

## What to inspect

| Evidence | Interpretation and useful next action |
|---|---|
| CPU main/render-thread time, JS update/tweens and allocation/GC | find simulation, object churn, dispatch or submission spikes; pooling helps only when it actually reuses costly instances/resources |
| GPU frame/pass time and counters where supported | inspect fragment/shader, blending, uploads/bandwidth and render targets; label unsupported timings unmeasured |
| Frame-time median, p95/p99, worst frames and missed frame deadlines | report sample count/window and percentile method; averages hide stalls; FPS alone is insufficient |
| Overdraw, translucent covered pixels, draw calls/passes/material switches | inspect burst peak and stacked alpha layers; count is not a proxy for fill-rate |
| Memory/resources before/after repeated loops | inspect retained handles, listeners, textures and driver counters; plateau evidence is not precise GPU-byte reclamation proof |
| Thermal state/throttling and sustained pacing | compare warm sustained runs; an early cool-device win can reverse after heating |
| Input/result readability at normal play speed | inspect the peak frame and next actionable board; optimization must preserve essential cues |

[Android GPU Inspector](https://developer.android.com/agi) provides system/frame
profiling for supported devices and graphics paths. Check device/API/process
requirements; do not assume every Capacitor webview supports a frame capture.
Use Unity or browser/WebView tools for their CPU/runtime evidence, and supported
GPU tooling when available. Device thermal evidence can use applicable platform
signals; [Android ADPF](https://developer.android.com/games/optimize/adpf) describes
thermal/performance adaptation. Do not add a native dependency merely to satisfy
a checklist when the project's existing diagnostics suffice.

An [AVD/emulator](https://developer.android.com/studio/run/emulator-acceleration)
can exercise lifecycle and compatibility paths. Its host/virtual/software GPU
and heat behavior do not certify physical-phone performance. Record the
renderer/tool limitations explicitly. Running an emulator is not required for
this skill and should not compete with unrelated workloads on a shared machine.

## Optimize one observed bottleneck at a time

If CPU/GC dominates, try bounded reuse, fewer schedulers and batched updates. If
GPU/fill-rate dominates, reduce alpha area/overlap, material/pass cost or render
scale before moving simulation to GPU. If memory dominates, inspect atlas size,
flipbook frames and ownership. Rerun the same workload and report before/after
CPU/GPU and tail-frame evidence plus visual differences; do not claim gains
from counters or implementation labels alone. Set adaptive quality/drop policy
from measured headroom, retaining gameplay result cues.

## Acceptance checklist

- [ ] Actual engine/version/pipeline verified; current renderer reused or an
      explicitly approved measured migration recorded.
- [ ] Effect spec and approved visual basis cover meaning, silhouette/palette,
      per-layer timeline, protected regions, representation and overlap priority.
- [ ] Normal-speed, smallest viewport, grayscale and worst-overlap review retain
      targets, input feedback, score/result and essential UI readability.
- [ ] Reuse/reset and independent active caps work; saturation drops/coalesces
      decoration without blocking essential feedback or gameplay.
- [ ] Duplicate event/win, delayed callback, old revision, scene unload, restart,
      release/reuse, asset failure, pause and background/resume checks pass.
- [ ] Gameplay/reward/continue succeeds when VFX is disabled, canceled or fails;
      rewards are idempotent in the gameplay authority.
- [ ] Reduced-motion/no-shake/no-flash variants and persistent result cues work;
      combined photosensitivity review uses XAG 118 criteria, not one rate limit.
- [ ] Physical-device CPU/GPU (where supported), p95/p99, thermal, overdraw and
      repeated-lifecycle memory evidence include workload/build/settings.
- [ ] Unmeasured devices, unavailable GPU timing, unreviewed art and accessibility
      limits are explicit. Counts/ms remain proposed until benchmarked/playtested.

These checks do not establish retention gains, universal beauty or native
accessibility certification. Report structural, aesthetic and device evidence
separately so the next specialist can see what is actually accepted.
