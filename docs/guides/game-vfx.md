---
title: Game VFX skill selection
status: active
owner: Game skill maintainers
scope: Real-time game VFX discovery, invocation and evidence limits
last_reviewed: 2026-10-06
canonical: false
---

# Game VFX skill selection

Audience: users improving real-time game feedback. The canonical workflow is
`skills/game-asset-vfx/SKILL.md`, with a
`skills/game-asset-vfx/LITE.md` overlay and on-demand engine references.

## When it is called / Khi nào skill được gọi

| Request family | English example | Ví dụ tiếng Việt |
|---|---|---|
| Particles | Add game particles for tile clear | Thêm hạt particle khi xóa ô trong trò chơi |
| Game feel | Improve drag/drop game feel | Làm cảm giác thao tác trong game rõ hơn |
| Combo | Add combo effects to the puzzle game | Thêm hiệu ứng combo cho game puzzle |
| Win | Design a level-win celebration | Làm hiệu ứng ăn mừng thắng màn |
| Environment | Animate the game environment | Thêm hoạt ảnh môi trường trong game |
| Optimization | Optimize game VFX on a phone | Tối ưu VFX cho game trên điện thoại |

Native plugin hosts use the skill description and semantic game context. State
the actual game engine and scene when available; the skill verifies them before
choosing implementation. It also handles sprite/asset quality in that context.
Video editing, video ads/trailers, footage compositing and standalone image/photo
editing are excluded. A mixed game/video request needs separate task scopes.

Các trigger trên dành cho hiệu ứng chạy trực tiếp trong game. Dựng video,
quảng cáo video, trailer và sửa ảnh đơn thuần không thuộc skill này. Skill kiểm
tra engine thực tế trước; game Canvas hoặc Capacitor không phải đổi sang Three.js.

## Local runtime and installation

The existing local mode classifier selects modes, not individual semantic skills.
The `game-build` preset contains `game-asset-vfx`; its VFX-only boundary filter
omits that auto overlay for explicit video/image-editing intent even when a prompt
contains “game”. For an explicit VFX intent inside a selected preset, this overlay
is prioritized after Art Director so unrelated engine overlays do not consume its
context budget first. The same caps and enablement controls still apply; the mode
map, default classifier and relative order of other roles are unchanged. Ambiguous or
multi-family requests (for example “optimize game VFX”) can abstain as before;
a controller can explicitly select the contextual game preset:

```bash
python3 scripts/runtime/skill_routing.py --mode game-build --prompt 'Tối ưu VFX cho game Capacitor'
```

This resolves file paths; it does not execute effects or certify semantic host
selection. A host-owned `enabled=true` or `auto_detect=false` preset remains an
explicit configuration override. `enabled=false` still excludes the skill.

Native Codex/Claude packaging discovers the existing `skills/` tree. The existing
full installer profile includes `game-asset-vfx` and its references; minimal/core
profiles do not gain a new dependency. No global setup, heavy graphics package or
renderer migration is required by this change. Use the full profile or the native
plugin to discover it, then request it by name when automatic context is unclear.

## What the skill produces

An effect spec, layered timeline, appropriate atlas/flipbook/ribbon/mesh choice,
reuse and independent active cap, event revision/scene generation/play-token
lifecycle, reduced-motion/no-flash treatment and acceptance evidence. Gameplay
and rewards commit independently of effect completion. Phone profiling separates
CPU/GPU, frame p95/p99, thermal behavior and transparent overdraw.

Recipe milliseconds and counts are proposed starting points, not measured
budgets. Routing fixtures and install checks prove package behavior; rendered
quality, live model selection and physical-phone performance require their own
evidence. No retention gain, best-visuals claim or accessibility certification is
implied. Primary technical and practitioner sources are in the skill's
`skills/game-asset-vfx/references/sources.md` source map.
