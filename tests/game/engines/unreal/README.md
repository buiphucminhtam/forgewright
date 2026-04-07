# Unreal Engine Game Test Templates

## Cấu trúc

```
unreal/
├── mechanics/       # Test từng gameplay mechanic (Automation System)
├── balance/         # Test cân bằng kinh tế/XP
├── performance/    # Test FPS, bộ nhớ, thời gian tải
└── integration/    # Test liên hệ thống
```

## Quy tắc đặt tên

```
{System}_{Mechanic}_{Behavior}.test.cpp
```

Ví dụ:
- `Combat_DamageCalculation_MatchesFormula.test.cpp`
- `Movement_JumpHeight_MatchesDesign.test.cpp`
- `Progression_XPCurve_LevelScaling.test.cpp`

## GDD Spec Reference

Đặt comment ghi rõ GDD spec nào được test:
```cpp
// Ref: GDD/Sections/03_Combat.md §3.1.2 — Damage Formula
```

## Chạy tests

```bash
# Unreal Editor (Automation)
RunUAT RunUnreal -Project={Project}.uproject -Engine -ExecuteAutomatonTest -Test={TestName}

# Functional Testing Plugin
AutomationManager.StartTest({Category})
```
