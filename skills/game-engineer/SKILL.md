---
name: game-engineer
description: >
  Meta-skill for game development that orchestrates specialized engine skills.
  Routes to the appropriate game engine skill (Unity, Unreal, Godot, Roblox, Phaser 3, Three.js)
  based on project requirements. Provides unified game development workflow.
version: 1.0.0
author: forgewright
tags: [game-engine, unity, unreal, godot, roblox, phaser3, threejs, game-development]
meta_skill: true
sub_skills:
  - unity-engineer
  - unreal-engineer
  - godot-engineer
  - roblox-engineer
  - phaser3-engineer
  - threejs-engineer
---

# Game Engineer

> **Identity:** The game development orchestrator. You route game development requests to the appropriate specialized engine skill and coordinate multi-engine workflows.

## Sub-Skills Overview

This meta-skill coordinates the following specialized game engine skills:

| Engine | Skill | Use Case |
|--------|-------|----------|
| **Unity** | `unity-engineer` | 3D games, mobile games, AR/VR, PC/Console |
| **Unreal** | `unreal-engineer` | AAA games, cinematic experiences, high-fidelity 3D |
| **Godot** | `godot-engineer` | Open-source games, 2D games, indie projects |
| **Roblox** | `roblox-engineer` | Roblox experiences, UGC games |
| **Phaser 3** | `phaser3-engineer` | HTML5 2D games, web games |
| **Three.js** | `threejs-engineer` | WebGL, 3D web experiences |

## Engine Selection Matrix

Use this matrix to determine which sub-skill to invoke:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GAME ENGINE SELECTION                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Target Platform:                                                   │
│  ├── Web/HTML5 ──────────────────────────────────────────────────► │
│  │   ├── 2D only ────────────────► Phaser 3                     │
│  │   ├── 3D/WebGL ──────────────► Three.js                      │
│  │   └── Multiplayer ────────────► Phaser 3 + Backend           │
│  │                                                               │
│  ├── Mobile (iOS/Android) ──────────────────────────────────────► │
│  │   ├── 2D casual ──────────────► Unity                        │
│  │   ├── 3D casual ──────────────► Unity                        │
│  │   └── AR/VR ─────────────────► Unity + AR Foundation         │
│  │                                                               │
│  ├── PC/Console ───────────────────────────────────────────────► │
│  │   ├── Indie/small team ────────► Godot or Unity              │
│  │   ├── AAA/high-fidelity ───────► Unreal                       │
│  │   └── Cross-platform ──────────► Unity                       │
│  │                                                               │
│  ├── Roblox ────────────────────────────────────────────────────► │
│  │   └── Any Roblox experience ──► Roblox Engineer              │
│  │                                                               │
│  └── AR/VR/XR ────────────────────────────────────────────────► │
│      ├── Quest/Meta ───────────────► Unity + XR Interaction Toolkit│
│      ├── HoloLens ────────────────► Unity + MRTK                 │
│      └── WebXR ───────────────────► Three.js + WebXR             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Engine Capabilities

### Unity
- **Best for:** Mobile games, AR/VR, cross-platform 2D/3D
- **Languages:** C#, ShaderLab
- **Key Features:** Unity Asset Store, AR Foundation, XR Interaction Toolkit
- **Supported by:** `unity-engineer`, `unity-mcp`, `unity-multiplayer`, `unity-shader-artist`

### Unreal
- **Best for:** AAA games, cinematic experiences, photorealistic 3D
- **Languages:** C++, Blueprint (visual scripting)
- **Key Features:** Nanite, Lumen, MetaHuman, Sequencer
- **Supported by:** `unreal-engineer`, `unreal-technical-artist`, `unreal-multiplayer`

### Godot
- **Best for:** Indie games, open-source projects, 2D games
- **Languages:** GDScript, C#, GLSL
- **Key Features:** Built-in physics, scene system, open-source
- **Supported by:** `godot-engineer`, `godot-multiplayer`

### Roblox
- **Best for:** UGC games, Roblox experiences, multiplayer
- **Languages:** Luau (Lua variant)
- **Key Features:** Roblox Studio, built-in multiplayer, avatar system
- **Supported by:** `roblox-engineer`

### Phaser 3
- **Best for:** HTML5 web games, casual games
- **Languages:** JavaScript/TypeScript
- **Key Features:** WebGL/Canvas rendering, physics (Arcade/Impact/Matter)
- **Supported by:** `phaser3-engineer`

### Three.js
- **Best for:** WebGL 3D, 3D web experiences
- **Languages:** JavaScript/TypeScript
- **Key Features:** WebGL abstraction, 3D rendering, animations
- **Supported by:** `threejs-engineer`

## Routing Logic

### Automatic Engine Detection

```markdown
## Engine Detection Priority

1. **Explicit mention** — "Build in Unity/Unreal/Godot..."
   → Route directly to specified engine skill

2. **Platform priority** — "Build a mobile game"
   → Unity (most mature mobile support)

3. **Fidelity priority** — "High-end graphics"
   → Unreal (best visual fidelity)

4. **Budget priority** — "Indie, small team, open-source"
   → Godot (no licensing fees, lightweight)

5. **Web-first** — "HTML5/web game"
   → Phaser 3 (2D) or Three.js (3D)

6. **UGC platform** — "Roblox experience"
   → Roblox Engineer
```

### Fallback Strategy

If the engine cannot be determined:
1. Ask the user to specify their target engine
2. If no preference, recommend based on use case
3. Default to Unity for cross-platform 3D

## Workflow Integration

### Game Build Pipeline

```
User Request → Game Engineer (meta-skill)
                      │
                      ▼
              ┌───────────────────┐
              │ Engine Selection  │
              │ (see matrix above) │
              └───────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐
    │ Unity   │ │ Unreal  │ │ Godot   │
    │ Engineer │ │ Engineer │ │ Engineer │
    └─────────┘ └─────────┘ └─────────┘
          │           │           │
          └───────────┼───────────┘
                      ▼
              ┌───────────────────┐
              │ Game Designer     │
              │ Level Designer    │
              │ Narrative Designer│
              │ Game Audio        │
              │ (as needed)       │
              └───────────────────┘
```

### Multi-Engine Projects

For projects requiring multiple engines:

```markdown
## Multi-Engine Routing

Example: "Build a game with Unity for mobile and a web companion app"

1. **Primary engine:** Unity for mobile
2. **Secondary:** Phaser 3 or Three.js for web companion
3. **Coordination:** Game Engineer routes to both, ensuring:
   - Consistent design language
   - Shared API contracts
   - Compatible save data formats
```

## Shared Patterns

All game engine sub-skills share these common patterns:

### Game Loop Pattern

```typescript
// Common game loop structure (pseudo-code)
class Game {
  update(deltaTime: number) {
    // 1. Process input
    // 2. Update physics/logic
    // 3. Update animations
    // 4. Update AI
  }

  render() {
    // 1. Clear buffers
    // 2. Update camera
    // 3. Render scene
    // 4. Render UI
  }
}
```

### State Machine Pattern

```typescript
// Common state machine for game states
enum GameState {
  MENU,
  PLAYING,
  PAUSED,
  GAME_OVER
}

// State transitions
MENU → PLAYING (on play click)
PLAYING → PAUSED (on escape)
PAUSED → PLAYING (on resume)
PLAYING → GAME_OVER (on death/win)
GAME_OVER → MENU (on retry/main menu)
```

### Save/Load Pattern

```typescript
interface SaveData {
  version: string;
  timestamp: number;
  gameState: GameState;
  playerProgress: PlayerProgress;
  settings: GameSettings;
}

function save(data: SaveData): void {
  const json = JSON.stringify(data);
  localStorage.setItem('save', json);
}

function load(): SaveData | null {
  const json = localStorage.getItem('save');
  return json ? JSON.parse(json) : null;
}
```

## Execution Checklist

- [ ] Engine selected based on project requirements
- [ ] Appropriate sub-skill invoked
- [ ] Cross-engine patterns documented
- [ ] Platform requirements verified
- [ ] Performance targets defined

## Related Skills

| Skill | Purpose |
|-------|---------|
| `game-designer` | Game design, mechanics, balance |
| `level-designer` | Level creation, difficulty curves |
| `narrative-designer` | Story, dialogue, world-building |
| `game-audio-engineer` | Sound effects, music, audio systems |
| `technical-artist` | Graphics optimization, shaders |
| `game-asset-vfx` | Visual effects, particles |

## Migration Notes (v9.0)

This meta-skill consolidates game engine routing:

| Engine | Old Skill | New Location |
|--------|-----------|--------------|
| Unity | `unity-engineer` | Routed via `game-engineer` |
| Unreal | `unreal-engineer` | Routed via `game-engineer` |
| Godot | `godot-engineer` | Routed via `game-engineer` |
| Roblox | `roblox-engineer` | Routed via `game-engineer` |
| Phaser 3 | `phaser3-engineer` | Routed via `game-engineer` |
| Three.js | `threejs-engineer` | Routed via `game-engineer` |

Direct invocations of sub-skills still work for backward compatibility.
