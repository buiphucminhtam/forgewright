# Effect lifetime and accessible feedback

These are integration design recommendations. Adapt identifiers and scheduling
to the verified engine; do not assume a project's existing helper names.

## Commit first, present second

Gameplay commits state and an idempotent reward transaction, then publishes an
immutable presentation event. An effect may fail to load, be dropped at its cap,
be skipped, cancel or never call completion: input, score, win/continue and reward
must still be correct. Presentation completion owns only cosmetic cleanup.

An event should carry an event ID, relevant board/entity revision, scene
generation and committed positions/meaning. Deduplicate decorative presentation
where repetition would be confusing. Reward idempotency is separately enforced
by the gameplay owner with a logical transaction/event key; deduplicating VFX is
not sufficient. Reopening a win panel must not award again.

## Guard every delayed mutation

Capture a per-play token and scene generation when a handle is admitted. Validate
both before a timer, tween, coroutine, promise or completion callback mutates a
scene or releases a resource. Check relevant entity/board revision too: an ID
may still exist while representing a different board or reused object. Define
whether an effect keeps a committed snapshot or follows a live entity; do not
blindly cancel valid overlapping snapshots when another move advances revision.

Illustrative lifecycle (original pseudocode, not engine API):

```text
commit gameplay + idempotent reward
publish event(id, revision, generation, committed snapshot)
admit cosmetic handle; capture new play token
callback: if token/generation/relevant revision invalid -> no scene mutation
cancel/restart: invalidate token first, cancel owned tasks, release once
```

A cancellation contract covers timers, tweens, subscriptions and deferred asset
loads. Invalidating first prevents callbacks racing teardown or pool reuse.
Release resources once; discard a late loaded asset through its owner when no
consumer remains. Keep shared texture/material ownership independent of a
single effect handle. Test release followed immediately by reuse of the same
instance, with the old callback deliberately delivered afterward.

Pause/background policy must specify freeze, hide or cancel for each effect
family and clock. Background decoration should stop; resume resets the time
origin rather than replaying missed emissions. Restart/scene unload increments
generation, clears owned jobs and invalidates old callbacks before rebuilding.
Context loss/load failure uses a cheap readable fallback and never blocks gameplay.

## Reduced motion and photosensitivity

[XAG 103](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103)
supports communicating essential information through additional sensory channels.
Pair a success/invalid cue with persistent state, icon/text and available optional
audio/haptics; respect mute/haptic preferences. Color or sound alone is insufficient.
Do not make ambient animation noisy by assigning sound to every decorative event.

[XAG 117](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117)
addresses distracting animated UI and camera/motion settings. Offer reduced-motion
and independent shake/flash controls where relevant; web projects can honor the
platform/browser preference as a default and keep a discoverable game override.
A static result/emblem can replace confetti, trails, bobbing and camera motion.
Keep the semantic acknowledgement available when decoration is disabled.

[XAG 118](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/118)
addresses luminance flashes, saturated-red flashes and high-contrast spatial
patterns. Prefer local low-contrast transitions and no full-screen flash. Review
**combined** effects at peak overlap, including combo spam and win transitions;
one emitter's rate is not the screen's aggregate rate. Frequency, area, contrast,
red saturation, duration and spatial patterns all matter. Do not interpret a
single “under three flashes” heuristic as a safety certificate. Use the current
criteria and suitable analysis when claiming assessment; a warning/settings
toggle is not a substitute for removing hazardous default content. Reduced motion
alone does not establish photosensitivity safety.
