# Core/Engine Coding Standards — src/core/**, src/engine/**

These rules apply to all files matching `src/core/**` or `src/engine/**`.

## Required

- [ ] Zero allocations in hot paths
- [ ] Thread safety documentation
- [ ] API stability — public interfaces must be stable
- [ ] Memory management — RAII / garbage collection awareness
- [ ] Performance budget documentation

## Forbidden

- [ ] Allocations in update/render loops
- [ ] Blocking operations in main thread
- [ ] Global mutable state without synchronization
- [ ] Unchecked null/undefined access
- [ ] Performance-critical code without benchmarks

## Hot Path Rules

Functions called every frame (update, render, physics):
- No heap allocations
- No virtual function calls if avoidable
- Stack-only operations
- Cache-friendly memory access patterns

## Patterns

### Good

```cpp
// Correct: no allocation in hot path
void PhysicsSystem::update(float dt) {
    // Stack-only operations
    Vector3 velocity;
    velocity.x = x * dt;  // No 'new'
}

// Correct: thread-safe
class ThreadSafeCounter {
    std::atomic<int> count_{0};
public:
    void increment() { count_.fetch_add(1); }
};
```

### Bad

```cpp
// Wrong: allocation in hot path
void update() {
    auto data = new Data();  // Memory allocation!
    // ...
}

// Wrong: no thread safety
int counter = 0;  // Race condition!
void increment() { counter++; }
```

## Enforcement

When editing files in `src/core/**`:
1. Check for allocations in hot paths → block
2. Check for missing thread safety → warn
3. Check for missing performance budget comments → warn
