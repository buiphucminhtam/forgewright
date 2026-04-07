# Game Visual Test Templates

Vision-based UI testing for game overlays using Midscene.js + Playwright.

## ⚠️ Prerequisites

Midscene must be configured in your project before running these tests:

```bash
# Install
npm install @midscene/web @playwright/test --save-dev

# Configure .env
MIDSCENE_MODEL_API_KEY="your-google-api-key"
MIDSCENE_MODEL_NAME="gemini-3-flash"
MIDSCENE_MODEL_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
MIDSCENE_MODEL_FAMILY="gemini"
```

Then source it: `source .env.midscene`

## Cấu trúc

```
tests/game/visual/
├── godot/                      # Godot HTML5 export web tests
│   └── _template.midscene.ts
├── roblox/                     # Roblox web UI tests
│   └── _template.midscene.ts
├── midscene.config.ts           # ⚠️ Reference only — see note below
└── README.md
```

> ⚠️ **Config note:** `midscene.config.ts` is defined by the QA Engineer skill
> (`qa-engineer/SKILL.md` Phase 5c). If `tests/e2e/vision/midscene.config.ts` does
> not exist yet in your project, create it by following the QA Engineer Phase 5c setup
> instructions. This file is shared across all Midscene-based tests.

## CI Run Strategy

| When to RUN | When to SKIP |
|-------------|--------------|
| ✅ Pre-flight smoke (≤10 actions, <60s) | ❌ Full regression (100+ steps) |
| ✅ After menu/HUD UI changes | ❌ Every PR (use Playwright selectors instead) |
| ✅ Visual regression on design system changes | ❌ Performance tests (non-deterministic) |

**Speed targets:**
- Smoke: ≤10 actions → <60s
- Full suite: ≤50 actions → <5 min
- Warning: >5 min → split into smaller suites

## Quy tắc đặt tên

```
{Engine}_{Screen}_{Behavior}.midscene.ts
```

Ví dụ:
- `godot_main-menu_renders.midscene.ts`
- `roblox_inventory-ui_opens.midscene.ts`

## 7 Loại kiem thu game (for reference)

Visual tests supplement but **do not replace** code-level game tests:

| Category | Coverage target | Blocking |
|----------|---------------|----------|
| Mechanics | 90% | Có |
| Balance | 80% | Có |
| State Machines | 95% | Có |
| Performance | 100% | Có |
| Build | 100% | Có |
| Integration | 70% | Không |
| Platform | 80% | Có |

See `skills/_shared/protocols/game-test-protocol.md` Category 7b for full protocol.

## Game scenes vs Game UI overlays

```
┌─────────────────────────────────────────────────────┐
│                  YOUR GAME SCREEN                     │
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │  GAME SCENE (WebGL/Canvas)                   │   │
│  │  ❌ Cannot test with Midscene               │   │
│  │  (Midscene sees pixels, not game state)      │   │
│  │                                              │   │
│  │  → Test with code-level tests instead        │   │
│  └─────────────────────────────────────────────┘   │
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │  GAME UI OVERLAY (HTML/DOM)                  │   │
│  │  ✅ CAN test with Midscene                   │   │
│  │  (Menus, HUD, settings, inventory panels)    │   │
│  │                                              │   │
│  │  → Test with visual templates here           │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Rule:** If it's rendered by the game engine (pixels), test it with code-level tests. If it's rendered by the browser (DOM), test it with Midscene visual tests.
