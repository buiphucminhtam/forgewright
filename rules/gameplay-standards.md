# Gameplay Coding Standards — src/gameplay/**

These rules apply to all files matching `src/gameplay/**`.

## Required

- [ ] Use delta time (`dt`) for all movement/animation calculations
- [ ] No UI references in gameplay code (no direct UI calls)
- [ ] All tunable values in data files (not hardcoded in code)
- [ ] Document state machine transitions with comments
- [ ] Include collision debug visualization (ifdef DEBUG)

## Forbidden

- [ ] Magic numbers — use constants or data references
- [ ] Direct `Input.GetAxis()` calls — wrap in InputManager
- [ ] Scene loading from gameplay code — use SceneManager
- [ ] Singletons for game state — use Dependency Injection
- [ ] Frame-rate dependent calculations

## Patterns

### Good

```gdscript
# Correct: delta time usage
velocity *= delta_time

# Correct: data-driven values
var damage = GameData.get_value("player_attack_damage")

# Correct: Input wrapper
var input = InputManager.get_action("jump")
```

### Bad

```gdscript
# Wrong: hardcoded value
health -= 10

# Wrong: direct input
if Input.is_action_pressed("jump"):

# Wrong: frame-dependent
position += velocity  # Missing delta_time
```

## Enforcement

When editing files in `src/gameplay/**`:
1. Check for magic numbers → warn if found
2. Check for delta time usage → warn if missing
3. Check data-driven patterns → suggest if hardcoded

## Related Rules

- See `rules/api-standards.md` for service interfaces
- See `rules/test-standards.md` for gameplay test patterns
