# Game Test Protocol

**Game-specific testing pipeline integrated with the universal Quality Gate and Task Validator.** Applies to ALL game engines (Unity, Unreal, Godot, Roblox) and Game Build mode.

---

## When to Run

| Phase | Protocol | When |
|-------|----------|------|
| After Game Designer | Testability Review | Before engine implementation begins |
| After Unity/Unreal/Godot Engineer | Game Build Verification | Each engine skill completes |
| After Level Designer | Level Validation | Each level/encounter is built |
| After Technical Artist | VFX/Audio Verification | Visual/audio assets are implemented |
| After QA Engineer (Game) | Gameplay Systems Test | All mechanics are integrated |
| At Build Gate | Full Game Test Suite | Before build approval |
| Merge/Deploy | Regression + Contract | Parallel workers merge |

---

## Integration with Universal Protocols

### Quality Gate Integration

Game tests feed into the universal Quality Gate at Level 3 (Quality Standards):

```
Level 1 (Build):    Game builds successfully (Unity: Editor.Log, Unreal: UAT, Godot: godot --headless --quit)
Level 2 (Regression): Existing gameplay tests pass
Level 3 (Standards): Game-specific test results (see below)
Level 4 (Trace):    Gameplay coverage traced to GDD acceptance criteria
```

### Task Validator Integration

Game deliveries are validated against Task Contracts:

```
1. Contract Compliance — Does build match mechanic spec?
2. Boundary Check — Engine-specific output structure respected?
3. Required Artifacts — Build artifact, balance report, test results?
4. Forbidden Patterns — No hardcoded values, no TODO stubs?
5. Build Check — Does the game actually run?
6. Test Check — Do gameplay tests pass?
7. Anti-Hallucination — Mechanic specs match implementation?
```

---

## Game Test Categories

### Category 1 — Mechanics Validation

**What it tests:** Each gameplay mechanic from Game Designer specs.

**Engine-specific test frameworks:**

| Engine | Framework | Command |
|--------|-----------|---------|
| Unity | Unity Test Framework (UTF) + NUnit | `dotnet test` or Unity Editor |
| Unreal | Automation System + Functional Testing Plugin | `RunUAT RunUnreal` or Editor |
| Godot | GDScript tests + `godot --test` | `godot --headless --test` |
| Roblox | Roblox Test Runner + LuaUnit | Studio or CLI |

**Test coverage targets:**

```
┌─ Mechanics Coverage ────────────────────────────────┐
│ Combat System:     ████████████████████ 100%         │
│ Movement System:   ████████████████████ 100%         │
│ Progression/XP:    ████████████████░░░  80%         │
│ Economy:           ████████████████░░░░  78%         │
│ AI Behavior:       ██████████████░░░░░░  65%         │
│ UI/UX Interactions: ████████████████████ 100%         │
└────────────────────────────────────────────────────┘
```

**Test examples per mechanic:**

```csharp
// Unity: Combat System Tests (NUnit)
[Test] public void Combat_DamageCalculation_MatchesFormula()
{
    var damage = DamageCalculator.Calculate(
        attackerATK: 50,
        defenderDEF: 20,
        skillMultiplier: 1.5f,
        isCritical: true
    );
    Assert.AreEqual(60f, damage); // (50 * 1.5 - 20 * 0.5) * 2 = 60
}

[Test] public void Combat_CriticalHit_10PercentChance()
{
    int crits = 0;
    for (int i = 0; i < 10000; i++)
        if (DamageCalculator.IsCriticalHit()) crits++;
    Assert.IsTrue(crits >= 800 && crits <= 1200); // ~10% ± 20%
}

[Test] public void Combat_IFrames_DuringDodgeRoll()
{
    player.DodgeRoll();
    Assert.IsTrue(player.IsInvulnerable);
    Assert.IsTrue(player.invulnerableTimer > 0);
}
```

```gdscript
# Godot: Movement System Tests
func test_movement_speed_matches_design():
    var player = Player.new()
    assert_eq(player.max_speed, 5.0)  # From GDD: 5 m/s

func test_jump_height_formula():
    var player = Player.new()
    var jump_height = calculate_jump_height(player.jump_force, 60)
    assert_almost_eq(jump_height, 2.5, 0.1)  # From GDD: 2.5m
```

### Category 2 — Balance Validation

**What it tests:** Economy, progression curves, difficulty scaling against GDD balance tables.

**Balance test matrix:**

| Test | Expected | Tolerance | Priority |
|------|----------|-----------|----------|
| Level 1 player vs Level 1 enemy | 3-5 hits to kill | ±1 | Critical |
| Time to level 1→2 | 30-60 seconds | ±10s | High |
| Gold per session | 500-800 gold | ±50 | Medium |
| Enemy difficulty curve | +15% per 5 levels | ±5% | High |

**Automated balance tests:**

```csharp
// Unity: Balance Tests
[Test] public void Balance_EnemyScaling_MatchesFormula()
{
    var enemy1 = EnemyFactory.Create("Goblin", level: 1);
    var enemy5 = EnemyFactory.Create("Goblin", level: 5);
    var enemy10 = EnemyFactory.Create("Goblin", level: 10);

    float ratio5 = enemy5.HP / enemy1.HP;
    float ratio10 = enemy10.HP / enemy1.HP;

    // Expected: 15% increase per 5 levels = 1.15^1 and 1.15^2
    Assert.AreEqual(1.15f, ratio5, 0.05f); // ±5% tolerance
    Assert.AreEqual(1.32f, ratio10, 0.07f);
}
```

### Category 3 — State Machine Validation

**What it tests:** All mechanic state machines match GDD state diagrams.

**Validation approach:**

1. Map every state from GDD spec to engine implementation
2. Verify all transitions exist and are correct
3. Test edge cases: simultaneous inputs, interrupts, dead states

```csharp
// Unity: Combat State Machine Tests
[Test] public void CombatStateMachine_IdleToAttack1_Valid()
{
    fsm.SetState<IdleState>();
    fsm.ReceiveInput(InputType.Attack);
    Assert.IsInstanceOfType(fsm.CurrentState, typeof(Attack1State));
}

[Test] public void CombatStateMachine_Attack2CancelIntoDodge()
{
    fsm.SetState<Attack2State>();
    fsm.AdvanceTime(0.1f); // Within cancel window
    fsm.ReceiveInput(InputType.Dodge);
    Assert.IsInstanceOfType(fsm.CurrentState, typeof(DodgeRollState));
}

[Test] public void CombatStateMachine_RecoveryBlocksInput()
{
    fsm.SetState<RecoveryState>();
    fsm.ReceiveInput(InputType.Attack);
    Assert.IsInstanceOfType(fsm.CurrentState, typeof(RecoveryState)); // Still recovering
}
```

### Category 4 — Performance Validation

**What it tests:** Game meets performance targets (frame rate, memory, load times).

**Performance targets per platform:**

| Platform | Target FPS | Min FPS | Memory | Load Time |
|----------|-----------|---------|--------|-----------|
| PC High | 60 fps | 50 fps | 4 GB | < 5s |
| PC Low | 30 fps | 24 fps | 2 GB | < 8s |
| Mobile | 30 fps | 24 fps | 1 GB | < 10s |
| Console | 60 fps | 50 fps | 8 GB | < 8s |
| WebGL | 30 fps | 24 fps | 512 MB | < 15s |

**Automated performance tests:**

```csharp
// Unity: Performance Tests
[Test] public void Performance_60FPS_OnMainMenu()
{
    StartProfiling();
    LoadScene("MainMenu");
    Wait(2f); // Let scene settle
    float avgFPS = GetAverageFPS();
    StopProfiling();
    Assert.IsTrue(avgFPS >= 58f, $"FPS dropped to {avgFPS}");
}

[Test] public void Performance_MemoryUnder_2GB_PC()
{
    var initialMemory = GetTotalAllocatedMemoryMB();
    LoadAllGameScenes();
    var peakMemory = GetPeakAllocatedMemoryMB();
    Assert.IsTrue(peakMemory - initialMemory < 2000f,
        $"Memory exceeded 2GB: {peakMemory - initialMemory}MB");
}
```

### Category 5 — Build Verification

**What it tests:** Game builds without errors on target platforms.

**Build test pipeline:**

```
1. Syntax Check — All scripts compile
2. Reference Check — No missing ScriptableObject references
3. Scene Validation — All required scenes exist and load
4. Asset Validation — All required assets are present
5. Platform Build — Build succeeds for target platforms
6. Boot Test — Game launches and reaches main menu
```

```csharp
// Unity: Build Validation Tests
[Test] public void Build_NoMissingReferences()
{
    var guids = AssetDatabase.FindAssets("t:Object");
    int missingCount = 0;
    foreach (var guid in guids)
    {
        var path = AssetDatabase.GUIDToAssetPath(guid);
        var obj = AssetDatabase.LoadAssetAtPath<Object>(path);
        if (obj == null) missingCount++;
    }
    Assert.AreEqual(0, missingCount, "Found missing references");
}

[Test] public void Build_AllScenesLoadable()
{
    var scenes = EditorBuildSettings.scenes;
    foreach (var scene in scenes)
    {
        var result = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
        var loadResult = EditorSceneManager.LoadSceneInPlayMode(scene.path);
        Assert.IsTrue(loadResult.Result == null, $"Failed to load: {scene.path}");
    }
}
```

### Category 6 — Integration/Regression Validation

**What it tests:** When systems are combined, no regressions occur.

**Integration test scenarios:**

| Scenario | Systems Involved | Test Focus |
|----------|------------------|-------------|
| Combat + Inventory | Player attacks consume item | Resource tracking |
| Economy + Progression | Earn XP via combat | Correct XP distribution |
| AI + Environment | Enemy pathfinding in level | No stuck states |
| Save + Load | Progression persists | State restoration |
| UI + Gameplay | Damage affects HUD | Real-time sync |

```csharp
// Unity: Integration Tests
[Test] public void Integration_CombatPlusInventory_ConsumesResource()
{
    var player = CreateTestPlayer();
    var initialPotions = player.inventory.GetItemCount("HealthPotion");
    var initialHP = player.currentHP;

    player.TakeDamage(50); // Below threshold for auto-potion
    player.UsePotion(); // Should consume 1 potion
    player.TakeDamage(50); // This should trigger auto-potion

    var newPotions = player.inventory.GetItemCount("HealthPotion");
    Assert.AreEqual(initialPotions - 1, newPotions); // One consumed
}
```

### Category 7 — Platform-Specific Validation

**What it tests:** Game functions correctly on each target platform.

| Platform | Validation Points |
|----------|------------------|
| iOS | Touch input, resolution scaling, battery usage |
| Android | Touch input, memory limits, fragment lifecycle |
| PC | Keyboard/mouse, multiple monitors, different GPUs |
| Console | Controller input, achievement integration |
| WebGL | Browser compatibility, WebGL version, input capture |

---

### Category 7b — Game UI Visual Regression (Midscene Vision)

**What it tests:** Game UI overlays (menus, HUD elements, settings screens) — rendered as DOM/HTML layers.

> **⚠️ Critical Caveat: What Midscene CANNOT Test**
>
> Midscene is **vision-based but NOT scene-aware**. It sees pixels, not game state.
>
> | What | Status | Reason |
> |------|--------|--------|
> | Unity/Unreal 3D game scene | ❌ Cannot test | No DOM access; game state lives in engine memory |
> | Canvas/WebGL pixel rendering | ❌ Cannot test | Cannot read score, HP, positions from rendered pixels |
> | Game 3D objects / physics | ❌ Cannot test | No collision/physics engine access |
> | Godot web export HTML UI | ✅ Can test | Godot HTML5 export renders UI as DOM elements |
> | Roblox web UI overlays | ✅ Can test | Roblox web surfaces HTML-based UI layers |
> | Unity/Unreal web export UI (if DOM-based) | ✅ Can test | Only if the UI layer is HTML/DOM, not engine-rendered |
>
> **Rule of thumb:** If the UI is rendered by the browser (HTML/CSS/DOM), Midscene can test it. If the UI is rendered by the game engine (Unity/Unreal WebGL canvas), Midscene can only observe pixels, not interact with game state.

#### When to Run

| Phase | Use Case |
|-------|----------|
| Pre-flight | Before approving a UI-heavy build |
| Regression (smoke only) | 3-5 critical UI flows, ≤60s total |
| On-demand | After menu/HUD redesigns |

#### CI Run Strategy

> ⚠️ Midscene is **not a CI regression tool** — it is too slow for that.

| When to run | When to SKIP |
|-------------|--------------|
| ✅ Pre-flight smoke (≤10 actions, <60s) | ❌ Full regression (100+ steps = 10+ minutes) |
| ✅ Visual regression on UI changes | ❌ Every PR push (use Playwright selector-based instead) |
| ✅ Canvas/WebGL visual state checks | ❌ Performance benchmarking (non-deterministic timing) |

**Speed targets:**
- Smoke suite: ≤10 actions → <60s
- Full visual suite: ≤50 actions → <5 min
- Warning threshold: >5 min → split into smaller suites

#### Integration Points

| Tool | Role | Engine Coverage |
|------|------|----------------|
| `@midscene/web` + Playwright | Web-based game UI testing | Godot web export, Roblox web, Unity/Unreal web (DOM layer only) |
| `@midscene/android` | Android game UI testing | Godot Android export, Roblox Android |
| `@midscene/ios` | iOS game UI testing | Godot iOS export, Roblox iOS |

For mobile device testing, see `mobile-tester/SKILL.md` — dual modality (Midscene vision + Appium selectors).

#### Output

Visual replay reports auto-generated at `midscene_run/report/`. Each step shows: screenshot → AI action → result.

#### Example

```typescript
// Godot web export visual test
import { PlaywrightAiFixture } from '@midscene/web/playwright';
import { test as base } from '@playwright/test';

const test = base.extend<PlaywrightAiFixture>(PlaywrightAiFixture());

test('main menu renders correctly', async ({ page, ai, aiAssert }) => {
  await page.goto('http://localhost:8080/'); // Godot HTML5 export URL

  await aiAssert('main menu is displayed with Play, Options, Quit buttons');
  await aiAssert('game logo is visible at top center');

  await ai('click "Play" button');
  await aiAssert('level select screen appears with at least 3 level cards');
});

// Roblox web UI test
test('inventory UI is accessible', async ({ page, ai, aiAssert }) => {
  await page.goto('https://www.roblox.com/games/{placeId}');

  await aiAssert('game has loaded and main HUD is visible');
  await ai('click the inventory button in the top-right corner');
  await aiAssert('inventory panel slides in from the right');
});
```

---

## Game Test Execution Pipeline

### Pipeline Flow

```
┌──────────────────────────────────────────────────────┐
│              GAME TEST PIPELINE                       │
│                                                       │
│  1. Mechanics Validation (per mechanic, engine-       │
│     specific tests)                                    │
│  2. Balance Validation (economy, XP, difficulty)       │
│  3. State Machine Validation (all transitions)          │
│  4. Performance Validation (FPS, memory, load)         │
│  5. Build Verification (compile, reference, platform)  │
│  6. Integration Validation (cross-system)             │
│  7. Platform Validation (per target platform)         │
│  7b. Game UI Visual Regression (Midscene vision)        │
│                                                       │
│  ↓ All pass → Quality Gate → Merge/Deploy             │
└──────────────────────────────────────────────────────┘
```

### Parallel Execution

Game Build mode allows parallel execution of engine-specific skills. Each parallel worker produces:

```
<worktree>/
├── src/                       # Engine-specific implementation
├── tests/
│   └── game/
│       ├── mechanics/         # Mechanic-specific tests
│       ├── balance/          # Balance tests
│       ├── performance/      # Performance tests
│       ├── integration/      # Integration tests
│       └── visual/           # Midscene vision tests (Godot/Roblox web)
├── build/                     # Build artifacts
└── DELIVERY.json             # Worker delivery report
```

After all workers complete:
1. Task Validator runs on each worktree
2. Merge Arbiter combines all builds
3. Integration tests run on merged build
4. Quality Gate evaluates final score

---

## Test Reporting

### Game Test Report Format

After each game test run, produce a report at `.forgewright/game-tests/report-{timestamp}.json`:

```json
{
  "session_id": "session-20260407-1424",
  "engine": "unity",
  "game_tests": {
    "mechanics": {
      "total": 50,
      "passed": 48,
      "failed": 2,
      "coverage": 95
    },
    "balance": {
      "total": 20,
      "passed": 20,
      "failed": 0,
      "coverage": 100
    },
    "performance": {
      "fps": { "avg": 61.2, "min": 54, "target": 60 },
      "memory_mb": { "peak": 1850, "limit": 2000 },
      "load_time_s": { "actual": 4.2, "target": 5 }
    },
    "build": {
      "status": "success",
      "platforms": ["pc", "mac"],
      "warnings": 3
    }
  },
  "quality_score": 92,
  "grade": "A",
  "blockers": [
    {
      "category": "mechanics",
      "test": "Combat_CriticalHit_10PercentChance",
      "message": "Crit rate is 15%, expected 10% ± 2%",
      "severity": "high"
    }
  ]
}
```

---

## Integration with Existing Protocols

### Plan Quality Loop

Before implementing any game mechanic, run Plan Quality Loop with game-specific criteria:

| Criterion | Game-Specific Focus |
|-----------|---------------------|
| Completeness | All GDD mechanics covered? Edge cases? |
| Specificity | Exact timing values, state transitions defined? |
| Feasibility | Engine supports required features? |
| Risk awareness | Platform performance? Edge cases? |
| Scope control | Mechanic scope matches GDD? |
| Dependency ordering | Core framework → mechanics → integration? |
| Testability | How to verify each mechanic? Automated tests defined? |
| Impact assessment | How does mechanic affect other systems? |

### Graceful Failure for Games

When game tests fail:

```
1. RETRY — Same test, 3 attempts (games can be non-deterministic)
2. ISOLATE — Run failing test in isolation
3. INVESTIGATE — Check if deterministic or flaky:
   - Deterministic → Log as bug, continue other tests
   - Flaky → Log as flaky, retry 3x, mark as PASS if any retry succeeds
4. ESCALATE — After 3 retries, mark as FAIL and escalate
5. AUTO-ROLLBACK — If critical test fails, revert to last good build
```

### Self-Healing for Games

Common game build errors and auto-fix strategies:

| Error | Auto-Fix Strategy |
|-------|------------------|
| Missing reference | Search scene for unassigned, set to default |
| Null reference on SO | Create placeholder SO asset |
| Shader not found | Fallback to built-in shader |
| Build failure (PC) | Clear cache, rebuild |
| Performance regression | Auto-reduce shadow quality, particle count |

---

## Brownfield Safety for Games

When modifying existing games:

```
1. BASELINE — Capture current gameplay test results before changes
2. REGRESSION CHECK — All previously-passing gameplay tests must still pass
3. SCOPE BOUNDARY — New mechanics in new folders, don't modify existing
4. PERFORMANCE BASELINE — FPS and memory must not regress > 10%
5. SAVE COMPATIBILITY — If save format changes, migration must be tested
```

---

## Game Test Quality Thresholds

| Test Category | Minimum Coverage | Critical Tests | Blocking |
|---------------|-----------------|----------------|----------|
| Core Mechanics | 90% | Combat, Movement, Progression | Yes |
| Balance | 80% | XP curve, economy sinks/sources | Yes |
| State Machines | 95% | All transitions | Yes |
| Performance | 100% | FPS, memory, load time | Yes |
| Build | 100% | All target platforms | Yes |
| Integration | 70% | Cross-system scenarios | No |
| Platform | 80% | All declared platforms | Yes |

---

## Tools Reference

| Engine | Test Framework | CI Integration |
|--------|----------------|-----------------|
| Unity | Unity Test Framework (UTF) | Unity Cloud Build / Custom CI |
| Unreal | Unreal Automation System | Unreal Build Graph / UAT |
| Godot | GDScript tests | GitHub Actions custom runner |
| Roblox | Roblox Test Runner | Roblox Studio CLI |

---

> **Derived from:** QA Engineer Skill, Quality Gate Protocol, Task Validator Protocol, Plan Quality Loop Protocol, Self-Healing Execution Protocol.
