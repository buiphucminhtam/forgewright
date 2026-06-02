---
name: code-reviewer-rust
extends: code-reviewer
language: rust
version: 1.0.0
author: forgewright
tags: [rust, code-review, quality, patterns, anti-patterns, safety, ownership]
file_patterns: ["*.rs", "Cargo.toml", "Cargo.lock", "rustfmt.toml", ".rustfmt.toml"]
linter: clippy
linter_config: [clippy.toml, rustfmt.toml]
auto_route_priority: 10
---

# Rust Code Reviewer

> **Identity:** The quality guardian for Rust projects. You extend the base code-reviewer skill with Rust-specific patterns, idioms, anti-patterns, and the borrow checker's expectations.

## Routing

**Auto-route to this skill if project contains:**
- `*.rs` files AND (`Cargo.toml` OR `Cargo.lock`)
- Priority: 10 (high)

## Rust-Specific Review Areas

### Ownership & Borrowing Review

```rust
// ❌ USE AFTER MOVE
fn process(data: Vec<String>) {
    // data is moved here
}

fn main() {
    let data = vec!["a".to_string()];
    process(data);
    println!("{:?}", data);  // ERROR: data moved
}

// ✅ PROPER OWNERSHIP
fn process(data: &Vec<String>) {
    // data borrowed
}

fn main() {
    let data = vec!["a".to_string()];
    process(&data);
    println!("{:?}", data);  // OK
}

// ❌ MUTABLE BORROW WHILE IMMUTABLE BORROW EXISTS
fn main() {
    let mut v = vec![1, 2, 3];
    let first = &v[0];      // Immutable borrow
    v.push(4);              // Mutable borrow - ERROR
    println!("{}", first);
}

// ✅ BORROW ORDER
fn main() {
    let mut v = vec![1, 2, 3];
    let first = v[0];       // Use first
    println!("{}", first);   // Drop borrow before mutation
    v.push(4);             // Now OK
}
```

### Lifetimes Review

```rust
// ❌ UNNECESSARY LIFETIME
fn longest<'a, 'b>(x: &'a str, y: &'b str) -> &'a str {  // 'b unused
    if x.len() > y.len() { x } else { y }  // ERROR: might return y
}

// ✅ CORRECT LIFETIME
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

// ❌ MISSING LIFETIME IN STRUCT
struct Parser {
    input: &str,  // ERROR: missing lifetime
}

// ✅ LIFETIME IN STRUCT
struct Parser<'a> {
    input: &'a str,
}

// ❌ LIFETIME ELISION VIOLATION
fn first_word(s: &str) -> &str {  // Lifetime elided, but ambiguous
    match s.find(' ') {
        Some(i) => &s[..i],
        None => s,
    }
}

// ✅ EXPLICIT LIFETIME
fn first_word(s: &str) -> &str {
    match s.find(' ') {
        Some(i) => &s[..i],
        None => s,
    }
}
```

### Error Handling Review

```rust
// ❌ UNWRAP IN PRODUCTION
fn get_config() -> Config {
    let config = std::fs::read_to_string("config.toml").unwrap();  // Panics!
    toml::from_str(&config).unwrap()
}

// ✅ PROPER ERROR HANDLING
fn get_config() -> Result<Config, AppError> {
    let config = std::fs::read_to_string("config.toml")
        .context("Failed to read config")?;
    
    let config: Config = toml::from_str(&config)
        .context("Failed to parse config")?;
    
    Ok(config)
}

// ❌ IGNORING RESULT
fn process(data: Data) {
    validate(&data);  // Result ignored
    do_something(&data);
}

// ✅ HANDLING RESULT
fn process(data: Data) -> Result<(), AppError> {
    validate(&data)
        .context("Validation failed")?;
    
    do_something(&data);
    Ok(())
}

// ❌ EXPECT WITHOUT MESSAGE
let value = map.get("key").expect("");  // Unhelpful

// ✅ EXPECT WITH MESSAGE
let value = map.get("key")
    .expect("Config should always have 'key' field");
```

## Rust-Specific Error Patterns to Catch

### High Priority

| Error Pattern | Code Smell | Severity |
|--------------|------------|----------|
| `thread 'main' panicked` | Unwrap/expect in production | CRITICAL |
| `borrow checker error` | Ownership violation | HIGH |
| `thread 'xxx' has overflowed its stack` | Infinite recursion | CRITICAL |
| `cannot borrow as mutable` | Mutable borrow conflict | HIGH |

### Medium Priority

| Error Pattern | Code Smell | Severity |
|--------------|------------|----------|
| `expected &str, found String` | Owned vs borrowed | MEDIUM |
| `mismatched types` | Type inference issue | MEDIUM |
| `error: unresolved import` | Missing dependency | MEDIUM |
| `unused variable` | Unused binding | LOW |

## Rust Anti-Patterns

### Async Anti-Patterns

```rust
// ❌ BLOCKING IN ASYNC
async fn fetch_data() {
    let data = std::fs::read_to_string("data.txt").unwrap();  // Blocks!
}

// ✅ ASYNC FILE I/O
async fn fetch_data() -> Result<String, std::io::Error> {
    tokio::fs::read_to_string("data.txt").await
}

// ❌ BLOCKING RUNTIME
#[tokio::main]
async fn main() {
    let result = blocking_call();  // Blocks entire runtime
}

// ✅ PROPER ASYNC
#[tokio::main]
async fn main() {
    let result = tokio::task::spawn_blocking(|| {
        // CPU-bound work here
        compute()
    }).await;
}

// ❌ SHARED MUTABLE STATE WITHOUT LOCK
use std::cell::RefCell;

struct Cache {
    data: RefCell<HashMap<String, String>>,
}

impl Cache {
    fn insert(&self, key: String, value: String) {
        // RefCell borrows at runtime, not compile-time
        self.data.borrow_mut().insert(key, value);
    }
}

// ✅ PROPER CONCURRENCY
use tokio::sync::RwLock;
use std::collections::HashMap;

struct Cache {
    data: Arc<RwLock<HashMap<String, String>>>,
}

impl Cache {
    async fn insert(&self, key: String, value: String) {
        self.data.write().await.insert(key, value);
    }
}
```

### Iterator Anti-Patterns

```rust
// ❌ COLLECTING INTO VEC UNNECESSARILY
fn filter_even(numbers: &[i32]) -> Vec<i32> {
    numbers.iter()
        .filter(|&&x| x % 2 == 0)
        .cloned()
        .collect()
}

// ✅ RETURN ITERATOR FOR FLEXIBILITY
fn filter_even(numbers: &[i32]) -> impl Iterator<Item = i32> + '_ {
    numbers.iter()
        .filter(|&&x| x % 2 == 0)
        .cloned()
}

// ❌ CLONING EVERYTHING
let users: Vec<User> = repository.get_all()
    .into_iter()
    .filter(|u| u.active)
    .cloned()  // Expensive clone
    .collect();

// ✅ BORROW WHEN POSSIBLE
fn find_active_users<'a>(users: &'a [User]) -> Vec<&'a User> {
    users.iter()
        .filter(|u| u.active)
        .collect()
}
```

### Struct/Enum Anti-Patterns

```rust
// ❌ TOTALLY DERIVED DEBUG ON LARGE STRUCTS
#[derive(Debug)]
struct Config {
    // Large with nested data
    data: HashMap<String, NestedConfig>,
}

// ✅ MANUAL DEBUG FOR LARGE STRUCTS
struct Config {
    data: HashMap<String, NestedConfig>,
}

impl std::fmt::Debug for Config {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Config")
            .field("keys", &self.data.keys().count())
            .finish()
    }
}

// ❌ BOOLEAN PARAMETERS
fn process(data: &[u8], verbose: bool) {
    // What does verbose do? Unclear
}

// ✅ CLEARER ALTERNATIVES
fn process(data: &[u8], log_level: LogLevel) {
    match log_level {
        LogLevel::Silent => {},
        LogLevel::Verbose => println!("{:?}", data),
    }
}
```

## Idiomatic Rust Review

### Naming Conventions

```rust
// ❌ MIXING CONVENTIONS
struct user_data {  // snake_case struct
    UserId: u64,    // PascalCase field
    created_at: String,
}

// ✅ RUST NAMING CONVENTIONS
struct UserData {
    user_id: u64,           // snake_case
    created_at: String,
}

// ❌ PREFIXING BOOLEANS
struct User {
    is_logged_in: bool,
    has_premium: bool,
}

// ✅ RUST BOOLEAN CONVENTIONS
struct User {
    logged_in: bool,
    premium: bool,
}

// ❌ HUNGARIAN NOTATION
let str_name: String = "Alice".to_string();
let i_count: i32 = 42;

// ✅ CLEAR TYPES
let name: String = "Alice".to_string();
let count: i32 = 42;
```

### Trait Bounds Review

```rust
// ❌ OVERLY GENERIC TRAIT BOUNDS
fn process<T: Clone + Debug + PartialEq + Hash + Serialize + Deserialize>(data: T) {}

// ✅ COMBINE INTO TRAIT
trait Processable: Clone + Debug + Serialize {}

fn process<T: Processable>(data: T) {}

// ❌ IMPLICIT Clone BOUND
fn duplicate<T>(value: &T) -> T
where
    T: Debug,
{
    println!("{:?}", value);
    *value  // Requires Clone
}

// ✅ EXPLICIT BOUNDS
fn duplicate<T>(value: &T) -> T
where
    T: Clone + Debug,
{
    println!("{:?}", value);
    value.clone()
}
```

### Testing Review

```rust
// ❌ NO TEST COVERAGE
#[derive(Debug)]
struct Calculator;

impl Calculator {
    pub fn add(a: i32, b: i32) -> i32 {
        a + b
    }
}

// ✅ TESTS COVERING EDGE CASES
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_positive_numbers() {
        assert_eq!(Calculator::add(2, 3), 5);
    }

    #[test]
    fn test_add_negative_numbers() {
        assert_eq!(Calculator::add(-5, 3), -2);
    }

    #[test]
    fn test_add_zero() {
        assert_eq!(Calculator::add(0, 0), 0);
    }
}

// ❌ IGNORING TEST FAILURES
#[test]
#[ignore]  // Skipped without reason
fn test_something() {}

// ✅ PROPERTY-BASED TESTING
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_add_commutative(a: i32, b: i32) {
        // This property should always hold
        prop_assert_eq!(Calculator::add(a, b), Calculator::add(b, a));
    }
}
```

## File Patterns to Look For

```
✓ FOUND - Good Rust Project Indicators:
├── Cargo.toml                  # Package manifest
├── Cargo.lock                  # Dependency lock
├── src/
│   ├── lib.rs                  # Library root
│   ├── main.rs                 # Binary entry
│   └── bin/                    # Additional binaries
├── tests/                      # Integration tests
├── benches/                   # Benchmarks
├── rustfmt.toml              # Formatting config
└── clippy.toml               # Linting config

✗ FOUND - Warning Signs:
├── src/*.rs without lib.rs   # No library crate
├── using .clone() excessively # Performance concern
├── unwrap() in non-test code  # Crash risk
├── TODO without issue #       # Untracked work
└── panic!() in library code  # Unexpected failure
```

## Lint Warnings to Flag

| Clippy Lint | What It Catches | Severity |
|-------------|-----------------|----------|
| `clippy::unwrap_used` | Unwrap in production | HIGH |
| `clippy::panic` | panic! in production | HIGH |
| `clippy::clone_on_copy` | Unnecessary clone | MEDIUM |
| `clippy::redundant_clone` | Clone of already copied value | MEDIUM |
| `clippy::iter_cloned_collect` | Cloning before collect | LOW |
| `clippy::implicit_clone` | Implicit clone in for loop | MEDIUM |
| `clippy::from_over_into` | Use Into instead of From | LOW |
| `clippy::len_zero` | Check length != 0 | LOW |
| `clippy::comparison_to_empty` | x == "" vs x.is_empty() | LOW |
| `clippy::redundant_pub_crate` | Unnecessary pub in crate root | LOW |

## Common Rust Code Smells

| Smell | Example | Fix |
|-------|---------|-----|
| Option/Result blindness | `.unwrap()` everywhere | Use `?` or `match` |
| Over-engineering | Traits for simple cases | Keep it simple |
| Premature optimization | Complex code for speed | Profile first |
| Clone abuse | `.clone()` for ownership | Borrow or reference |
| Arc abuse | `Arc<Mutex<T>>` for single-thread | `Rc<RefCell<T>>` |

## Review Checklist

### Ownership & Borrowing
- [ ] No `.clone()` unless necessary
- [ ] Proper lifetime annotations
- [ ] No mutable borrow with existing immutable borrow
- [ ] `Rc`/`Arc` used appropriately

### Error Handling
- [ ] No `.unwrap()` in production code
- [ ] No `.expect()` without message
- [ ] `?` operator used for error propagation
- [ ] Custom errors use `thiserror` or `anyhow`

### Async
- [ ] `tokio::fs` for async file I/O
- [ ] `spawn_blocking` for CPU-bound work
- [ ] No blocking in async runtime
- [ ] Proper shared state with `Arc<RwLock<T>>`

### Testing
- [ ] Unit tests in same file or `tests/` module
- [ ] Integration tests in `tests/` directory
- [ ] Property-based tests for key functions
- [ ] Benchmarks for hot paths

### Documentation
- [ ] All public items have doc comments
- [ ] Examples in doc comments
- [ ] CHANGELOG updated
- [ ] README explains build/test process

### Performance
- [ ] `cargo bench` run for hot paths
- [ ] No unnecessary allocations
- [ ] Iterators preferred over loops where applicable
- [ ] `String` vs `&str` used appropriately
