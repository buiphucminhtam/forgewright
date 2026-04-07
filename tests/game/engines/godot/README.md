# Godot Engine Game Test Templates

## Cấu trúc

```
godot/
├── mechanics/       # Test từng gameplay mechanic (GDScript tests)
├── balance/        # Test cân bằng kinh tế/XP
├── performance/    # Test FPS, bộ nhớ, thời gian tải
└── integration/    # Test liên hệ thống
```

## Quy tắc đặt tên

```
test_{system}_{mechanic}_{behavior}.gd
```

Ví dụ:
- `test_combat_damage_calculation.gd`
- `test_movement_jump_height.gd`
- `test_progression_xp_curve.gd`

## GDD Spec Reference

Đặt comment ghi rõ GDD spec nào được test:
```gdscript
# Ref: GDD/Sections/03_Combat.md §3.1.2 — Damage Formula
```

## Chạy tests

```bash
# Headless testing
godot --headless --test --suite-path res://tests/game/godot/mechanics/

# Unit tests via GDScript
```
