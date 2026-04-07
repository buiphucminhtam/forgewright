# Roblox Game Test Templates

## Cấu trúc

```
roblox/
├── mechanics/       # Test từng gameplay mechanic (Roblox Test Runner)
├── balance/        # Test cân bằng kinh tế/XP
├── performance/    # Test FPS, bộ nhớ, thời gian tải
└── integration/    # Test liên hệ thống
```

## Quy tắc đặt tên

```
{SpecName}.spec.lua
```

Ví dụ:
- `CombatDamage.spec.lua`
- `MovementJump.spec.lua`
- `ProgressionXP.spec.lua`

## GDD Spec Reference

Đặt comment ghi rõ GDD spec nào được test:
```lua
-- Ref: GDD/Sections/03_Combat.md §3.1.2 — Damage Formula
```

## Chạy tests

```bash
# Roblox Studio CLI
roblox-cli test run --suite tests/game/roblox/

# LuaUnit-based
```
