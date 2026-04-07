# Game Test Templates

Bo m mau test theo `skills/_shared/protocols/game-test-protocol.md` — ap dung cho Tat ca cac game engine (Unity, Unreal, Godot, Roblox) va che do Game Build.

## Cau truc thu muc

```
tests/game/
├── README.md
├── engines/
│   ├── unity/          # Unity Test Framework (UTF) + NUnit
│   │   ├── mechanics/
│   │   │   └── _template.test.cs
│   │   ├── balance/
│   │   │   └── _template.test.cs
│   │   ├── performance/
│   │   │   └── _template.test.cs
│   │   ├── integration/
│   │   │   └── _template.test.cs
│   │   └── README.md
│   ├── unreal/         # Unreal Automation System
│   │   ├── mechanics/
│   │   │   └── _template.test.cpp
│   │   ├── balance/
│   │   │   └── _template.test.cpp
│   │   ├── performance/
│   │   │   └── _template.test.cpp
│   │   ├── integration/
│   │   │   └── _template.test.cpp
│   │   └── README.md
│   ├── godot/          # GDScript tests + godot --test
��   │   ├── mechanics/
│   │   │   └── _template.test.gd
│   │   ├── balance/
│   │   │   └── _template.test.gd
│   │   ├── performance/
│   │   │   └── _template.test.gd
│   │   ├── integration/
│   │   │   └── _template.test.gd
│   │   └── README.md
│   └── roblox/         # Roblox Test Runner + LuaUnit
│       ├── mechanics/
│       │   └── _template.spec.lua
│       ├── balance/
│       │   └── _template.spec.lua
│       ├── performance/
│       │   └── _template.spec.lua
│       ├── integration/
│       │   └── _template.spec.lua
│       └── README.md
├── visual/             # Midscene vision-based UI tests (Godot + Roblox web)
│   ├── README.md
│   ├── godot/
│   │   └── _template.midscene.ts
│   └── roblox/
│       └── _template.midscene.ts
└── shared/
    └── state-machine/
        └── _template.gd
```

## Quy uoc dat ten

| Engine  | Naming convention                    | Vi du                          |
|---------|--------------------------------------|--------------------------------|
| Unity   | `{System}_{Mechanic}_{Behavior}.test.cs` | `Combat_DamageCalculation_MatchesFormula.test.cs` |
| Unreal  | `{System}_{Mechanic}_{Behavior}.test.cpp` | `Combat_DamageCalculation.test.cpp` |
| Godot   | `test_{system}_{mechanic}_{behavior}.gd`   | `test_combat_damage_calculation.gd` |
| Roblox  | `{SpecName}.spec.lua`                     | `CombatDamage.spec.lua`          |

## 7 Loai kiem thu game

| #  | Loai         | Muc tieu phu cover | Blocking |
|----|--------------|--------------------|----------|
| 1  | Mechanics    | 90%                 | Co        |
| 2  | Balance      | 80%                 | Co        |
| 3  | State Machines | 95%               | Co        |
| 4  | Performance  | 100%                | Co        |
| 5  | Build        | 100%                | Co        |
| 6  | Integration  | 70%                 | Khong     |
| 7  | Platform     | 80%                 | Co        |
| 7b | Game UI Visual (Midscene) | 60%      | Khong     |

> **Category 7b** (Game UI Visual) la supplement, khong thay the code-level tests. Chi test duoc game UI overlay (menu, HUD, settings) — khong the test duoc game scene 3D. Xem `skills/_shared/protocols/game-test-protocol.md` Category 7b.

## Muc tieu hieu nang theo platform

| Platform  | Target FPS | Min FPS | Memory  | Load Time |
|-----------|-----------|---------|---------|----------|
| PC High   | 60 fps    | 50 fps  | 4 GB    | < 5s     |
| PC Low    | 30 fps    | 24 fps  | 2 GB    | < 8s     |
| Mobile    | 30 fps    | 24 fps  | 1 GB    | < 10s    |
| Console   | 60 fps    | 50 fps  | 8 GB    | < 8s     |
| WebGL     | 30 fps    | 24 fps  | 512 MB  | < 15s    |

## Quy trinh thuc hien

1. Tao project game moi — copy template files vao `tests/game/engines/{engine}/`
2. Tao GDD (Game Design Document) — tham chieu trong comment test
3. Thay the placeholder tests bang tests thuc — tat ca comment `TODO:` la vi tri can dien
4. Chay tests tai Build Gate — truoc khi chap nhan build

## Giao tiep voi cac giao thuc khac

- **Quality Gate** (`quality-gate.md`): Game tests nap vao Level 3 (Quality Standards)
- **Task Validator** (`task-validator.md`): Deliverables kiem thu doi chieu voi Task Contract
- **Plan Quality Loop**: Criteria bo sung cho game (GDD coverage, mechanic feasibility)

## Chi so chat luong

Xem `tests/coverage/thresholds.json` — `game_test_quality` section.

Xem `skills/_shared/protocols/game-test-protocol.md` — chi tiet day du.
