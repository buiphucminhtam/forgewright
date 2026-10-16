---
title: Browser game UI starter
status: active
owner: Game tooling maintainers
scope: Phaser 4 and Three.js experience handoff
last_reviewed: 2026-10-16
canonical: false
---

# Browser game UI starter

Vanilla TypeScript/DOM with no runtime dependency. Compile `index.ts` as ES2022,
copy `tokens.css` and `preview.html` beside the emitted module, and serve them
through the project's existing local server. The Phaser pilot serves the gallery
at `/ui/preview.html`; its build is also the compiled source for DOM unit checks.

`createGameUIKit(root, {tokens, actions})` returns `render(model)` and idempotent
`dispose()`. Component IDs are stable handoff IDs. Components emit actions; the
host updates state, simulation pause and camera/control mode. A modal ID must
reference a visible dialog. Its contents receive focus, trap Tab, emit Escape
as `onAction(modalId, 'dismiss')` and restore focus when the host closes it.
The kit removes only its own nodes/listeners, preserving foreign DOM.

Included families: action/icon buttons, panel/dialog, tab, toggle, slider,
progress, tooltip, toast and text. The preview displays interaction states;
`state: focus` is a declared preview label, while actual focus uses native
keyboard focus and `:focus-visible`. A game selects only relevant components.
Set theme tokens and approved asset slots from its Style DNA. This starter is
not a universal art style, all-screen template or accessibility certification.
Native controls provide baseline semantics; contextual labels, real-device
input and rendered readability still need project verification.

Inspect desktop 960×800 and touch-emulated 390×844, safe areas, long labels,
reduced motion and actual playfield occlusion. DOM tests do not prove layout,
mobile performance, Canvas/GLB rendering or human game feel. See the
[handoff contract](../../../skills/ui-designer/references/game-ui-kit.md).

Existing UI systems can satisfy the same contract. Copy into new consumer-owned
paths only; never overwrite a project's established kit during installation.
