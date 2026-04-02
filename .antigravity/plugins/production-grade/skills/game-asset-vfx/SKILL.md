---
name: game-asset-vfx
description: >
  [production-grade internal] Quality standards and production patterns for game
  assets and VFX. Covers procedural sprite generation, particle effects, screen
  effects, UI polish, background design, audio-visual sync, and visual feedback
  systems. Focused on web/Phaser 3 games but principles apply to any 2D engine.
  Triggers on: "game assets", "sprite quality", "VFX quality", "visual polish",
  "game juice", "particle effects", "screen shake", "game feel", "art quality",
  "generateTexture", "procedural art", "game aesthetics", "premium visuals",
  "UI helpers", "design tokens", "audio feedback", "game audio sync".
  Routed via the production-grade orchestrator (Game Build mode).
version: 2.0.0
author: forgewright
tags: [game-assets, vfx, sprites, particles, visual-polish, game-juice, phaser, 2d-art, procedural-art, ui-helpers, audio-visual, design-tokens]
---

# Game Asset & VFX — Visual Quality Standards

## Protocols

!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/input-validation.md 2>/dev/null || true`
!`cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first.

## Overview

This skill defines the visual quality bar for game assets and VFX. Games live or die on *feel* — and feel comes from visual polish. A mechanically solid game with flat rectangles and no feedback feels like a prototype. The same game with detailed sprites, layered particle effects, and satisfying screen reactions feels premium.

This skill focuses on **web-based 2D games** (Phaser 3 / HTML5 Canvas) where assets are generated procedurally via `generateTexture()` or loaded as sprite sheets. The patterns also apply to any 2D engine (Godot 2D, Pixi.js, Love2D).

**Three shared libraries** power the visual layer across all games:

| Library | Path | Purpose |
|---------|------|---------|
| **VFX Helpers** | `@shared/lib/vfx-helpers.js` | Particle effects, screen effects, transitions |
| **UI Helpers** | `@shared/lib/ui-helpers.js` | Buttons, panels, progress bars, overlays, design tokens |
| **Audio Manager** | `@shared/lib/audio-manager.js` | Music/SFX playback, muting, audio-visual sync |

## When to Use

- Creating new game sprites or textures procedurally
- Reviewing existing visuals for quality (audit)
- Designing VFX systems (particles, screen effects, transitions)
- Adding "game juice" — making actions feel satisfying
- Setting up backgrounds, UI elements, or menu screens
- Integrating audio feedback with visual effects
- Building consistent UI using shared design tokens
- Any time a game looks "too simple" or "prototype-ish"

---

## Part 1 — Sprite & Asset Quality Standards

### The Quality Ladder

Every visual element in a game lands on this quality ladder. The minimum bar for shipping is **Level 3**.

| Level | Name | Characteristics | Example |
|-------|------|----------------|---------|
| 1 | Placeholder | Plain rectangle, single color | `fillRect(0, 0, 32, 32)` — red square |
| 2 | Basic | Shape with border or simple gradient | Circle with outline |
| 3 | **Polished** | Multi-layer: base + gradient + highlights + shadow + detail | Gem with shine, depth, and glow |
| 4 | Premium | Animation, texture patterns, sub-pixel detail | Character with idle animation, clothing detail |
| 5 | AAA | Full sprite sheet, hand-crafted or AI-generated art | Professional pixel art or vector illustration |

### Procedural Sprite Standards (generateTexture)

When generating sprites via Phaser's `generateTexture()`, every sprite should include **at least 4 visual layers** because flat shapes read as placeholder art, while layered shapes feel like intentional design:

```
Layer 1: Base shape + fill (gradient if possible)
Layer 2: Shadow / dark edge (bottom, right)
Layer 3: Highlight / specular (top-left, center)
Layer 4: Detail / accent (pattern, icon, glow, outline)
```

#### Concrete Example — A Gem Sprite

```javascript
// ❌ BAD — Level 1 placeholder
const g = this.make.graphics();
g.fillStyle(0xff0000);
g.fillRect(0, 0, 32, 32);
g.generateTexture('gem', 32, 32);

// ✅ GOOD — Level 3 polished
const g = this.make.graphics();
const size = 32;

// Layer 1: Base with gradient-like fill (darker at bottom)
g.fillStyle(0xcc2244);
g.fillTriangle(size/2, 2, 4, size*0.4, size-4, size*0.4); // top facet
g.fillStyle(0xaa1133);
g.fillTriangle(4, size*0.4, size-4, size*0.4, size/2, size-2); // bottom facet

// Layer 2: Shadow (darker edge)
g.fillStyle(0x660022, 0.4);
g.fillTriangle(size*0.6, size*0.4, size-4, size*0.4, size/2, size-2);

// Layer 3: Highlight (bright specular)
g.fillStyle(0xffffff, 0.5);
g.fillTriangle(size/2, 4, size*0.35, size*0.35, size*0.55, size*0.25);

// Layer 4: Center glow
g.fillStyle(0xff88aa, 0.6);
g.fillCircle(size/2, size*0.38, 3);

g.generateTexture('gem', size, size);
```

### Sprite Sheet Loading Standards

For games using pre-made assets (external art, AI-generated sprites), follow these standards:

| Standard | Rule | Why |
|----------|------|-----|
| Format | PNG with transparency | Consistent alpha, lossless edges |
| Dimensions | Power-of-2 sheets (512×512, 1024×1024) | GPU-optimal texture packing |
| Frame size | Consistent per sheet (e.g., all 64×64) | Prevents atlas misalignment |
| Preload phase | All `this.load.spritesheet()` calls in `preload()` | Never block gameplay |
| Fallback | Generate procedural fallback if asset fails to load | Graceful degradation |
| Naming | `spr_[category]_[name]` for sheets, `tx_[category]_[name]` for textures | Differentiate static from animated |

```javascript
// ✅ Sprite sheet loading with error fallback
preload() {
    this.load.spritesheet('spr_player_idle', 'assets/player-idle.png', {
        frameWidth: 64, frameHeight: 64,
    });
    this.load.on('loaderror', (file) => {
        console.warn(`Asset failed: ${file.key}, generating fallback`);
        this.generateFallbackTexture(file.key);
    });
}
```

### Asset Naming Convention

Consistent naming reduces confusion and enables automation:

```
tx_[category]_[name]_[variant]

Categories:
  player    — player character sprites
  enemy     — enemy/obstacle sprites
  item      — collectibles, power-ups
  tile      — environment/level tiles
  ui        — buttons, icons, frames
  bg        — background elements
  fx        — VFX textures (particles, trails)

Examples:
  tx_player_idle
  tx_enemy_slime_red
  tx_item_gem_blue
  tx_tile_ground_grass
  tx_ui_btn_primary
  tx_fx_particle_circle
```

### Color Palette Rules

Random or "pure" colors (0xff0000, 0x00ff00, 0x0000ff) look amateurish because they're oversaturated and clash with each other. Use curated palettes:

| Context | Good Palette Example | Why |
|---------|---------------------|-----|
| Dark/Space | `#0a0e27, #141834, #1a1040, #00d4ff, #ff6b6b` | Low-key base with vibrant accents |
| Fantasy | `#2d1b4e, #5c3d8f, #ff9f43, #ffd93d, #51cf66` | Rich purples with warm gold highlights |
| Arcade | `#0f1923, #1e3a5f, #00ccff, #ff4466, #ffcc22` | Deep blue base with pop colors |
| Nature | `#1a2f1a, #2d5a2d, #7bc67b, #a8d8a8, #f0f7da` | Earthy greens, natural feel |

**Rule of thumb:** Pick 1-2 background colors (dark, desaturated), 1 primary accent, 1 secondary accent, 1 highlight color.

### generateTexture Performance Guidelines

Procedural generation is **preload-time cost, zero-runtime cost** because the texture lives in GPU memory after generation. This makes it ideal for web games, but there are pitfalls:

- Generate textures in `preload()` or `create()`, never in `update()`
- Keep texture dimensions power-of-2 when possible (32, 64, 128) for GPU optimization
- Limit total generated textures to < 100 per scene to avoid VRAM pressure on mobile
- Reuse textures — don't generate the same sprite multiple times
- Destroy the temporary `Graphics` object after `generateTexture()` — it won't be collected otherwise

---

## Part 2 — Design Token System (THEME)

All games should use the shared design token system from `@shared/lib/ui-helpers.js`. This ensures visual consistency across the entire game portfolio.

### Design Tokens Reference

```javascript
import { THEME } from '@shared/lib/ui-helpers.js';

const THEME = {
    // Colors
    primary:     0x00d4ff,   // Cyan — primary accent
    primaryDark: 0x0099cc,   // Dark cyan — hover states
    secondary:   0xff6b6b,   // Coral — secondary accent
    accent:      0xffd93d,   // Gold — highlights, achievements
    success:     0x51cf66,   // Green — positive feedback
    danger:      0xff6b6b,   // Red — warnings, damage

    // Backgrounds
    bg:          0x0a0e27,   // Deep navy — main background
    bgCard:      0x141834,   // Card/panel background
    bgOverlay:   0x000000,   // Overlay (with alpha)

    // Text
    text:        0xffffff,   // Primary text
    textMuted:   0x8899aa,   // Secondary/muted text

    // Structure
    border:      0x2a2f55,   // Borders and dividers

    // Typography
    fontFamily: '"Outfit", "Segoe UI", system-ui, sans-serif',

    // Border Radius
    radiusSm:  8,    // Small elements (tags, chips)
    radiusMd:  12,   // Medium elements (buttons, inputs)
    radiusLg:  16,   // Large elements (cards, panels)
    radiusXl:  24,   // Extra large (modals, sheets)
};
```

### When to Use THEME Tokens

| ❌ Don't | ✅ Do |
|----------|-------|
| `0xff0000` (hardcoded red) | `THEME.danger` |
| `'Arial'` (system font) | `THEME.fontFamily` |
| `0x000000` (hardcoded black bg) | `THEME.bg` |
| Magic number `12` for border radius | `THEME.radiusMd` |
| Random blue `0x0000ff` | `THEME.primary` |

### Custom Per-Game Color Overrides

When a game needs its own palette (nature theme, fire theme), create a local override that preserves the token structure:

```javascript
// ✅ GOOD — Override tokens, keep structure
const GAME_THEME = {
    ...THEME,
    primary:     0x44ff88,   // Green for nature game
    primaryDark: 0x33cc66,
    bg:          0x0a1a0a,   // Dark green bg
    bgCard:      0x142814,
};
```

---

## Part 3 — UI Component Library Reference

All games should use `@shared/lib/ui-helpers.js` for consistent, polished UI components.

### Available UI Components

| Component | Method | Use For |
|-----------|--------|---------|
| Button | `UI.createButton(scene, x, y, 'PLAY', opts)` | All interactive buttons |
| Panel | `UI.createPanel(scene, x, y, w, h, opts)` | Glassmorphism cards/overlays |
| Progress bar | `UI.createProgressBar(scene, x, y, w, h, opts)` | Loading, health, XP bars |
| Gradient bg | `UI.createGradientBg(scene, topColor, bottomColor)` | Scene backgrounds |
| Dot background | `UI.createDotBackground(scene, density)` | Ambient background dots |
| Overlay | `UI.createOverlay(scene, opts)` | Full-screen modal backdrops |
| Star rating | `UI.showStarRating(scene, x, y, stars, max)` | Game over star display |
| Score display | `UI.createScoreDisplay(scene, x, y, opts)` | Animated score counter |
| Toast | `UI.showToast(scene, message, opts)` | Notification popups |
| Divider | `UI.createDivider(scene, x, y, width, opts)` | Decorative separators |

### Button Styles

`createButton` supports 4 styles via `opts.style`:

| Style | Appearance | Use For |
|-------|-----------|---------|
| `'primary'` | Solid cyan fill + highlight shine | Main CTA (Play, Start) |
| `'secondary'` | Solid coral fill | Retry, important secondary actions |
| `'outline'` | Transparent with cyan border | Menu, Settings |
| `'ghost'` | Subtle transparent | Back, Cancel |

### Button Quality Standard

Every interactive button needs these properties because static buttons feel dead:

| Property | Value | Why |
|----------|-------|-----|
| Hover scale | 1.04x | Signals interactivity |
| Press scale | 0.96x | Confirms click registration |
| Highlight shine | White 15% overlay on top half | Adds depth, prevents flat look |
| Border radius | 8-16px (`THEME.radiusSm`-`THEME.radiusLg`) | Sharp corners feel aggressive |
| Hand cursor | `useHandCursor: true` | Standard UX convention |
| SFX | "click" sound on press | Audio feedback reinforces action |

**Note:** `UI.createButton()` already implements hover/press animations, highlight shine, and hand cursor automatically. Use it instead of building buttons from scratch.

---

## Part 4 — VFX Quality Standards

### The VFX Hierarchy

Every game needs VFX at three tiers. Missing any tier makes the game feel incomplete:

| Tier | Purpose | Examples | When |
|------|---------|---------|------|
| **T1 — Feedback** | Direct response to player action | Hit particles, score popups, button press | Every interaction |
| **T2 — Atmosphere** | Ambient life and mood | Floating particles, gradient backgrounds, grid patterns | Always running |
| **T3 — Celebration** | Reward and milestone moments | Confetti, screen flash, combo text, level-up burst | On achievement |

### Required VFX Per Game Type

| Game Type | Minimum VFX Set |
|-----------|----------------|
| **Puzzle** | Match particles, combo flash, board clear confetti, score popup, ambient bg particles |
| **Platformer** | Jump dust, land squash, death explosion, collectible sparkle, damage flash |
| **Shooter** | Muzzle flash, hit impact, explosion (multi-ring), trail effect, screen shake |
| **Card** | Card flip glow, damage numbers, heal particles, turn flash, victory confetti |
| **Idle/Merge** | Merge burst, upgrade glow ring, milestone confetti, currency popup, ambient sparkle |
| **Brick Breaker** | Ball trail, block destruction burst, wall-bounce ring, combo flash, power-up glow |

### Shared VFX Library Reference

All games should use `@shared/lib/vfx-helpers.js` which provides these production-ready effects:

| Effect | Method | Use For |
|--------|--------|---------|
| Camera shake | `VFX.screenShake(scene, intensity, duration)` | Impacts, explosions |
| Particle burst | `VFX.particleBurst(scene, x, y, color, count)` | Destruction, collection |
| Explosion | `VFX.explosion(scene, x, y, opts)` | Multi-ring death/destruction |
| Floating text | `VFX.floatingText(scene, x, y, text, style)` | Score, damage numbers |
| Screen flash | `VFX.flashScreen(scene, color, duration, alpha)` | Hit feedback, transitions |
| Vignette | `VFX.vignetteFlash(scene, duration, intensity)` | Damage taken, dramatic moments |
| Pulse scale | `VFX.pulseScale(scene, obj, scale, duration)` | UI emphasis, heartbeat |
| Glow ring | `VFX.glowRing(scene, x, y, radius, color)` | Power-up, selection |
| Double glow | `VFX.doubleGlowRing(scene, x, y, radius, color)` | Extra impact glow |
| Sparkle trail | `VFX.sparkleTrail(scene, x, y, count, color)` | Collectible attraction |
| Trail effect | `VFX.trailEffect(scene, gameObject, color)` | Projectiles, dashes |
| Confetti | `VFX.confetti(scene, x, y, opts)` | Level complete, victory |
| Ripple | `VFX.ripple(scene, x, y, opts)` | Water, ability activation |
| Score pop | `VFX.scorePop(scene, x, y, points, color)` | Scoring events |
| Hit stop | `VFX.hitStop(scene, durationMs)` | Impact emphasis (frame freeze) |
| Slow motion | `VFX.slowMotion(scene, factor, duration)` | Dramatic kills, finishers |
| Squash/stretch | `VFX.squashStretch(scene, obj, opts)` | Landing, bouncing |
| Ambient particles | `VFX.ambientParticles(scene, opts)` | Background atmosphere |
| Grid background | `VFX.gridBackground(scene, opts)` | Tech/arcade aesthetic |
| Combo flash | `VFX.comboFlash(scene, count)` | Combo system feedback |
| Wipe transition | `VFX.wipeTransition(scene, onMid, duration)` | Scene transitions |

### Inline VFX Patterns (When Shared Lib Isn't Appropriate)

Some VFX are too game-specific for the shared library. In these cases, use inline patterns that follow the same quality standards. Always ensure:

1. **Self-destruction** — every particle/tween has `onComplete: () => obj.destroy()`
2. **Depth layering** — follows the standard depth map
3. **Performance limits** — respects particle/tween budgets

```javascript
// ✅ GOOD — Inline wall-bounce VFX (game-specific, not reusable)
this.physics.world.on('worldbounds', (body) => {
    const ball = body.gameObject;
    if (!ball || !ball.active) return;

    // Expanding ring
    const ring = this.add.circle(ball.x, ball.y, 8, 0x00ccff, 0)
        .setStrokeStyle(2, 0x00ccff, 0.6).setDepth(5);
    this.tweens.add({
        targets: ring, scaleX: 2.5, scaleY: 2.5, alpha: 0,
        duration: 300, onComplete: () => ring.destroy(),
    });

    // Directional sparks
    for (let i = 0; i < 6; i++) {
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const spark = this.add.circle(ball.x, ball.y, 2, 0x00ccff, 0.7).setDepth(5);
        this.tweens.add({
            targets: spark,
            x: ball.x + Math.cos(angle) * 25,
            y: ball.y + Math.sin(angle) * 25,
            alpha: 0, scaleX: 0.2, scaleY: 0.2,
            duration: Phaser.Math.Between(180, 350),
            onComplete: () => spark.destroy(),
        });
    }
});
```

### VFX Performance Budget

Web games run in the browser — performance matters more than native because you're sharing resources with the OS, browser tabs, and extensions:

| Metric | Budget (Desktop) | Budget (Mobile) | Why |
|--------|-----------------|-----------------|-----|
| Concurrent particles | < 200 | < 80 | Each is a Phaser game object with tweens |
| Active tweens | < 50 | < 25 | Tweens run every frame in `update()` |
| Screen shakes per second | ≤ 2 | ≤ 1 | Overlapping shakes feel broken |
| Flash overlays | 1 at a time | 1 at a time | Multiple overlaps = white screen |
| Particle lifespan | 200-800ms | 150-500ms | Long-lived particles accumulate |
| Depth sorting calls | Minimize | Minimize | `setDepth()` triggers re-sort |
| Trail intervals | ≥ 35ms | ≥ 50ms | Too frequent = particle overflow |

**Cleanup rule:** Every visual effect MUST self-destruct. Use `onComplete: () => obj.destroy()` in tweens. A particle system that doesn't clean up will eventually crash the browser tab.

### VFX Depth Layering

Consistent depth values prevent visual glitches where effects appear behind game objects:

```
Depth Map:
  -100    Background grid / gradient
  -50     Ambient particles
  -10     Dot backgrounds
  -3      Trail glow particles
  -2      Trail core particles
  -1      Ball halos, game object auras
  0-100   Game world objects (tiles, environment)
  100-500 Entities (player, enemies, NPCs)
  500-1K  Entity effects (trails, auras)
  1K-5K   Projectiles
  5K      Overlays (game over background)
  5K-7K   Glow rings, ripples
  7K-8K   Sparkles, particle bursts
  8K-9K   Floating text, score popups
  9K-9.5K Combo text, toast notifications
  9.5K    Screen flash, vignette
  10K     Scene transition wipe
```

---

## Part 5 — Audio-Visual Integration

### The Golden Rule

**Every visual effect should have a corresponding audio event.** Silent VFX feel hollow; audio without visual feels invisible. The combination creates the "juice" that makes games feel satisfying.

### AudioManager Integration

All games use `@shared/lib/audio-manager.js`:

```javascript
import { AudioManager } from '@shared/lib/audio-manager';

create() {
    this.audio = new AudioManager(this);
    this.audio.playMusic('action-loop');  // Background music
}

// On player action:
this.audio.playSFX('click');     // UI interaction
this.audio.playSFX('match');     // Destruction/success
this.audio.playSFX('drop');      // Hit/impact
this.audio.playSFX('select');    // Menu selection, pickup
```

### Audio-VFX Sync Table

For every VFX effect, pair it with the correct SFX:

| VFX Effect | SFX Event | Timing |
|-----------|-----------|--------|
| Particle burst (destruction) | `'match'` | Simultaneous |
| Screen shake (impact) | `'drop'` | Simultaneous |
| Button press animation | `'click'` | On pointerdown |
| Collectible pickup sparkle | `'select'` | On collision |
| Combo text flash | `'match'` | Simultaneous |
| Confetti celebration | `'select'` (× 2-3 rapid) | Staggered 50ms |
| Scene transition wipe | `'select'` | On transition start |
| Score popup | — (silent, too frequent) | — |
| Ambient particles | — (silent, continuous) | — |

### SFX Not-Too-Frequent Rule

Playing too many SFX simultaneously or in rapid succession creates audio mud. Throttle:

```javascript
// ✅ GOOD — Throttled SFX for rapid events
if (this.time.now - this.lastHitSfxTime > 80) {   // 80ms cooldown
    this.audio.playSFX('drop');
    this.lastHitSfxTime = this.time.now;
}
```

### Sound Toggle Standard

Every game MUST include a sound toggle:
- Position: Top-right corner of all scenes
- Default state: Sound ON
- Persistence: Save to `localStorage`
- Visual: Icon changes between 🔊/🔇 states
- Implementation: `AudioManager.toggleMute()`

---

## Part 6 — Background & Scene Design

### Background Quality Standards

Flat solid-color backgrounds are the #1 indicator of a prototype. Every scene needs layered backgrounds:

| Layer | What | Implementation |
|-------|------|---------------|
| Base | Gradient (2+ colors) | `UI.createGradientBg(scene, topColor, bottomColor)` |
| Atmosphere | Floating particles | `VFX.ambientParticles(scene, { count: 30-50 })` |
| Pattern (optional) | Grid, dots, or scan lines | `VFX.gridBackground(scene)` or `UI.createDotBackground(scene)` |

### Premium Background Recipe (Inline)

When games need custom backgrounds beyond what the shared lib provides:

```javascript
// Multi-layer premium background (from Bounce Breaker)
create() {
    const W = this.cameras.main.width, H = this.cameras.main.height;

    // Layer 1: Gradient
    const bgG = this.add.graphics().setDepth(-100);
    for (let i = 0; i < 48; i++) {
        const t = i / 47;
        const r = Phaser.Math.Linear(0x08, 0x0a, t);
        const g = Phaser.Math.Linear(0x08, 0x06, t);
        const b = Phaser.Math.Linear(0x1a, 0x2e, t);
        bgG.fillStyle((r << 16) | (g << 8) | b, 1);
        bgG.fillRect(0, Math.floor(t * H), W, Math.ceil(H / 48) + 1);
    }

    // Layer 2: Subtle grid
    const grid = this.add.graphics().setDepth(-50);
    grid.lineStyle(1, 0x00ccff, 0.02);
    for (let x = 0; x < W; x += 48) grid.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 48) grid.lineBetween(0, y, W, y);

    // Layer 3: Ambient particles (sparse for gameplay scenes)
    for (let i = 0; i < 12; i++) {
        const x = Phaser.Math.Between(10, W - 10);
        const y = Phaser.Math.Between(30, H - 30);
        const dot = this.add.circle(x, y,
            Phaser.Math.FloatBetween(0.5, 1.5),
            0x00ccff,
            Phaser.Math.FloatBetween(0.01, 0.05)
        ).setDepth(-40);
        this.tweens.add({
            targets: dot, y: y - 30, alpha: 0,
            duration: Phaser.Math.Between(4000, 8000),
            yoyo: true, repeat: -1,
        });
    }
}
```

### Menu Screen Checklist

| Element | Required | Standard |
|---------|----------|----------|
| Gradient background | ✅ | 2-color gradient, no flat color |
| Ambient particles | ✅ | 20-40 floating dots |
| Game title | ✅ | Large, custom font (Outfit), with glow or shadow |
| Play button | ✅ | `UI.createButton()` or manual with hover/press/shine |
| Best score | ✅ | Muted color, positioned near title |
| Scene transition | ✅ | `cameras.main.fadeOut(300)` or `VFX.wipeTransition()` |
| Sound toggle | ✅ | Top-right corner, uses AudioManager |
| Divider decorations | ✅ | Lines with glow dots between sections |
| Animated icon/logo | ✅ | Rotating, pulsing, or breathing animation |
| Tagline | Optional | Short, muted, centered ("Aim • Launch • Break") |

### Game Over Screen Checklist

| Element | Required | Standard |
|---------|----------|----------|
| Overlay | ✅ | `UI.createOverlay(scene, { alpha: 0.7 })` |
| Panel | ✅ | `UI.createPanel()` with glassmorphism |
| Final score | ✅ | Large, animated count-up |
| Star rating | ✅ | `UI.showStarRating()` with staggered appear |
| Stats summary | ✅ | Time, accuracy, combos, etc. |
| Retry button | ✅ | `UI.createButton(scene, x, y, 'RETRY', { style: 'primary' })` |
| Menu button | ✅ | `UI.createButton(scene, x, y, 'MENU', { style: 'outline' })` |
| Confetti (on 3 stars) | ✅ | `VFX.confetti()` celebration |

### HUD (Heads-Up Display) Standards

| Element | Standard |
|---------|----------|
| Score display | Frosted glass panel, animated rolling counter |
| Labels | ALL CAPS, letter-spacing 3-4, small font (9-10px), muted color |
| Values | Bold, larger font (16-22px), accent color |
| Best score | Right-aligned, muted until beaten |
| Combo indicator | Shows at combo ≥ 3, auto-fades, color escalates |
| Separators | Vertical line with subtle glow |

---

## Part 7 — Mobile & Responsive Standards

### Touch Target Requirements

| Element | Minimum Size | Why |
|---------|-------------|-----|
| Buttons | 48×48px (visual), 56×56px (hit area) | Apple HIG / Material Design minimum |
| Game objects (interactive) | 40×40px | Finger accuracy on mobile |
| Close/dismiss | 44×44px | Must be easy to tap |
| Gaps between targets | ≥ 8px | Prevent accidental taps |

### Viewport Handling

```javascript
// Standard game dimensions for web/mobile
const config = {
    width: 480,     // Portrait mobile width
    height: 800,    // Portrait mobile height (16:10 safe)
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};
```

### Mobile-Specific VFX Adjustments

| Aspect | Desktop | Mobile |
|--------|---------|--------|
| Ambient particle count | 20-40 | 10-20 |
| Trail particle interval | 35ms | 50ms |
| Max concurrent particles | 200 | 80 |
| Screen shake intensity | 5 | 3 |
| Combo text size | 28-48px | 22-36px |

Detect mobile at initialization:

```javascript
const isMobile = !this.sys.game.device.os.desktop;
const particleCount = isMobile ? 15 : 30;
const trailInterval = isMobile ? 50 : 35;
```

---

## Part 8 — Typography & Font Standards

### Font Loading

Browser default fonts (Times New Roman, Arial) immediately signal "not a real game." Always specify custom fonts:

```html
<!-- In index.html <head>: -->
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
```

```javascript
// In code:
const FONT = THEME.fontFamily; // '"Outfit", "Segoe UI", system-ui, sans-serif'
```

### Typography Hierarchy

| Element | Font Size | Weight | Color | Letter Spacing |
|---------|-----------|--------|-------|----------------|
| Game title | 36-48px | Bold | Primary accent | 4-8 |
| Subtitle | 18-24px | Normal | Muted text | 8-12 |
| HUD labels | 9-10px | Bold | `#4488aa` (info blue) | 3-4 |
| HUD values | 16-22px | Bold | Accent color | 0 |
| Score popup | 12-22px | Bold | Color by value | 0 |
| Instructions | 11-14px | Normal | Dark muted | 1-2 |
| Branding | 9px | Normal | Very dark muted | 4 |

---

## Part 9 — Boot/Loading Screen Standards

First impressions matter — a loading screen sets the quality expectation:

| Element | Standard |
|---------|----------|
| Background | Match game gradient theme |
| Logo/Title | Centered, starts at 80% scale, tweens to 100% |
| Progress bar | `UI.createProgressBar()` with actual load progress |
| Transition out | Fade to black over 300ms on load complete |
| Minimum display | 1.5s minimum even if assets load faster |

```javascript
// Boot scene pattern
export default class Boot extends Phaser.Scene {
    constructor() { super('Boot'); }

    preload() {
        // Show loading UI
        const bar = UI.createProgressBar(this, 240, 450, 200, 12, { showText: true });

        this.load.on('progress', (p) => bar.setProgress(p));
        this.load.on('complete', () => {
            this.time.delayedCall(1500, () => {  // Minimum display time
                this.cameras.main.fadeOut(300);
                this.time.delayedCall(300, () => this.scene.start('Menu'));
            });
        });

        // Load game assets here...
    }
}
```

---

## Part 10 — Visual Feedback Specification Template

Every game must include a Visual Feedback Table in its GDD. This table maps **every player action** to its visual and audio response:

```markdown
## Visual Feedback Table

| Player Action | Visual Effect | Sound | Screen Effect | Priority |
|---------------|--------------|-------|---------------|----------|
| [action name] | [VFX method + params] | [sfx key] | [shake/flash/none] | P0/P1/P2 |
```

**Priority guide:**
- **P0 — Required:** Without this, the action feels broken (hit feedback, basic destruction)
- **P1 — Expected:** Players notice if missing (combo indicators, score popups)
- **P2 — Polish:** Elevates from good to great (ambient particles, subtle pulses)

---

## Common Mistakes

| # | Mistake | Why It Fails | What to Do Instead |
|---|---------|-------------|-------------------|
| 1 | Plain rectangles as sprites | Looks like a 2005 Flash prototype | Use 4+ layer procedural sprites with gradient, highlight, shadow, detail |
| 2 | Using emoji as game objects | Renders differently per OS, looks amateur | Generate proper circle/polygon textures with `generateTexture()` |
| 3 | Flat solid backgrounds | Screams "placeholder" | Gradient base + ambient particles + optional grid/dot pattern |
| 4 | No feedback on player actions | Game feels "floaty" and unresponsive | Every action gets VFX (particle, text, shake) + SFX |
| 5 | System fonts (Arial/Times) | Looks like a web form, not a game | Use Outfit via `THEME.fontFamily` |
| 6 | Particles that never die | Memory leak → browser crash | Every tween/particle must have `onComplete: () => obj.destroy()` |
| 7 | Pure RGB colors (0xff0000) | Oversaturated, clashing, amateur | Use `THEME` tokens or curated palettes |
| 8 | Same depth for everything | VFX hidden behind game objects | Follow the depth map: bg < entities < effects < UI < overlays |
| 9 | No scene transitions | Jarring jump between scenes | Use `VFX.wipeTransition()` or `cameras.main.fadeOut(300)` |
| 10 | Buttons with no hover/press | Dead-feeling UI | Use `UI.createButton()` or implement hover 1.04x, press 0.96x, shine |
| 11 | Generating textures in update() | Creates new GPU textures every frame → OOM | Generate all textures in preload/create, store in texture cache |
| 12 | Ignoring mobile performance | Desktop works, mobile crashes | Detect `device.os.desktop`, reduce particles/tweens on mobile |
| 13 | Building UI from scratch | Inconsistent look, wasted effort | Use shared `UI` helpers with `THEME` tokens |
| 14 | Silent VFX (no audio pairing) | Effects feel hollow without sound | Pair every T1 VFX with SFX via AudioManager |
| 15 | Hardcoded colors instead of tokens | Inconsistent, hard to theme | Import and use `THEME` from ui-helpers |

---

## Quality Audit Checklist

Score each item 0 (missing) or 1 (present). **Minimum passing score: 16/22.**

### Assets & Sprites (4 points)
| # | Check | Score |
|---|-------|-------|
| 1 | Sprites use 4+ visual layers (no flat rectangles) | 0-1 |
| 2 | Color palette is curated (no pure RGB) | 0-1 |
| 3 | Asset naming follows convention (`tx_`, `spr_`, `fx_`) | 0-1 |
| 4 | Custom font loaded (`THEME.fontFamily`, not system default) | 0-1 |

### Backgrounds & Scenes (4 points)
| # | Check | Score |
|---|-------|-------|
| 5 | Background has gradient + ambient particles | 0-1 |
| 6 | Boot/loading screen with progress bar | 0-1 |
| 7 | Scene transitions (fade/wipe) between all scenes | 0-1 |
| 8 | Menu screen meets full checklist | 0-1 |

### VFX & Feedback (5 points)
| # | Check | Score |
|---|-------|-------|
| 9 | Every player action has VFX response | 0-1 |
| 10 | Particle effects self-destruct (no leaks) | 0-1 |
| 11 | Score/damage floating text on relevant events | 0-1 |
| 12 | Screen shake on impacts/explosions | 0-1 |
| 13 | Combo/streak visual indicator | 0-1 |

### UI Components (4 points)
| # | Check | Score |
|---|-------|-------|
| 14 | Buttons have hover/press feedback | 0-1 |
| 15 | Game Over screen with stats + star rating | 0-1 |
| 16 | HUD uses frosted glass panel + animated score | 0-1 |
| 17 | Celebration VFX on achievements (confetti, flash) | 0-1 |

### Audio Integration (2 points)
| # | Check | Score |
|---|-------|-------|
| 18 | SFX paired with T1 VFX events | 0-1 |
| 19 | Sound toggle present via AudioManager | 0-1 |

### Technical (3 points)
| # | Check | Score |
|---|-------|-------|
| 20 | Depth layering follows standard depth map | 0-1 |
| 21 | Performance budgets respected (< 200 particles, < 50 tweens) | 0-1 |
| 22 | Mobile detection with reduced VFX on mobile | 0-1 |

**Grade:**
- 20-22: A — Premium quality, ship-ready
- 16-19: B — Good, minor polish needed
- 12-15: C — Needs improvement, specific items missing
- 0-11: D — Major visual rework needed

## Handoff Protocol

| To | Provide | Format |
|----|---------|--------|
| Game Designer | Feedback on VFX feasibility, performance constraints | Inline in feedback spec |
| Engine Engineer | Asset naming convention, texture generation code, VFX trigger events | Code snippets + depth map |
| Level Designer | Background theme per level, ambient effect density | Per-level visual config |
| Game Audio Engineer | VFX timing sync points for SFX triggers | Audio-VFX sync table |
| QA Engineer | Performance budgets, visual regression checklist | Audit checklist above |

## Execution Checklist

- [ ] All sprites at Level 3+ quality (4-layer minimum)
- [ ] Curated color palette defined (using THEME tokens or custom overrides)
- [ ] Gradient backgrounds + ambient particles in every scene
- [ ] Custom font (Outfit) loaded via `THEME.fontFamily`
- [ ] Boot/loading screen with animated progress
- [ ] All buttons use `UI.createButton()` or meet hover/press standard
- [ ] Scene transitions (wipe or fade) between all scenes
- [ ] Visual Feedback Table complete for all player actions
- [ ] Shared VFX library (`vfx-helpers.js`) integrated where appropriate
- [ ] Shared UI library (`ui-helpers.js`) used for standard components
- [ ] AudioManager integrated — SFX paired with all T1 VFX
- [ ] Sound toggle present and persistent
- [ ] All particle effects self-destruct
- [ ] Depth layering follows standard depth map
- [ ] Performance within budget (particles, tweens, trails)
- [ ] Mobile detection with reduced VFX
- [ ] Menu screen meets full checklist
- [ ] Game Over screen meets full checklist
- [ ] HUD uses premium frosted glass + animated score
- [ ] Quality audit score ≥ 16/22
