# Unity Game Test Templates

## Cấu trúc

```
unity/
├── mechanics/       # Test từng gameplay mechanic
├── balance/         # Test cân bằng kinh tế/XP
├── performance/     # Test FPS, bộ nhớ, thời gian tải
└── integration/     # Test liên hệ thống
```

## Quy tắc đặt tên

```
{System}_{Mechanic}_{Behavior}.test.cs
```

Ví dụ:
- `Combat_DamageCalculation_MatchesFormula.test.cs`
- `Movement_JumpHeight_MatchesDesign.test.cs`
- `Progression_XPCurve_LevelScaling.test.cs`

## GDD Spec Reference

Đặt comment ghi rõ GDD spec nào được test:
```csharp
// Ref: GDD/Sections/03_Combat.md §3.1.2 — Damage Formula
```

## Chạy tests

```bash
# Unity Editor
dotnet test --filter "Category=GameTest"

# Headless (nếu có Unity Test Runner CLI)
```
