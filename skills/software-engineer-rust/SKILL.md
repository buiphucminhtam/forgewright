---
name: software-engineer-rust
extends: software-engineer
language: rust
version: 1.0.0
author: forgewright
tags: [rust, backend, api, services, clean-architecture, tdd, safety]
file_patterns: ["*.rs", "Cargo.toml", "Cargo.lock", "rustfmt.toml", ".rustfmt.toml"]
linter: clippy
linter_config: [clippy.toml, rustfmt.toml]
auto_route_priority: 10
---

# Rust Software Engineer

> **Identity:** The implementation specialist for Rust projects. You extend the base software-engineer skill with Rust-specific patterns, idioms, and tooling. You embrace Rust's ownership model and type system for memory safety and concurrency safety.

## Routing

**Auto-route to this skill if project contains:**
- `*.rs` files AND (`Cargo.toml` OR `Cargo.lock`)
- Priority: 10 (high)

## Rust-Specific Patterns

### Error Handling

```rust
// Use thiserror for custom error types
use thiserror::Error;
use std::io;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("resource not found: {resource} {id}")]
    NotFound { resource: String, id: String },

    #[error("validation error: {0}")]
    Validation(String),

    #[error("database error: {0}")]
    Database(#[from] io::Error),

    #[error("unauthorized")]
    Unauthorized,
}

// Use anyhow for application error handling
use anyhow::{Context, Result, bail};

fn read_config() -> Result<Config> {
    let contents = std::fs::read_to_string("config.toml")
        .context("Failed to read config file")?;
    
    toml::from_str(&contents)
        .context("Failed to parse config")
}

// Pattern matching on errors
match result {
    Ok(value) => process(value),
    Err(AppError::NotFound { resource, id }) => {
        eprintln!("{} {} not found", resource, id);
    }
    Err(e) => return Err(e.into()),
}
```

### Async/Await Patterns

```rust
// Use tokio for async runtime
use tokio::runtime::Runtime;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::main]
async fn main() -> Result<()> {
    let mut file = File::open("data.txt").await?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).await?;
    Ok(())
}

// Async trait with async-trait
use async_trait::async_trait;

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>>;
    async fn create(&self, user: NewUser) -> Result<User>;
}

// Shared state with Arc<RwLock<T>>
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct AppState {
    pub db: Arc<DatabasePool>,
    pub cache: Arc<RwLock<HashMap<String, Value>>>,
}

impl AppState {
    pub async fn get_cached(&self, key: &str) -> Option<Value> {
        self.cache.read().await.get(key).cloned()
    }
}
```

### Project Structure

```
src/
├── main.rs              # Binary entry point
├── lib.rs               # Library entry point

bin/                     # Additional binaries
└── migrate.rs

crates/
├── domain/              # Domain models (no external deps)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── user.rs
│       └── error.rs
├── service/             # Business logic
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── user.rs
│       └── user_test.rs
├── repository/          # Data access
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       └── postgres/
│           └── user.rs
├── api/                 # HTTP handlers
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── handlers/
│       └── middleware/
└── config/             # Configuration
    ├── Cargo.toml
    └── src/
        └── lib.rs

Cargo.toml              # Workspace manifest
Cargo.lock
rustfmt.toml
clippy.toml
```

### Type Patterns

```rust
// Domain model with Builder pattern
use derive_builder::Builder;

#[derive(Debug, Clone, Builder)]
#[builder(setter(into))]
pub struct User {
    id: Uuid,
    email: Email,
    name: String,
    #[builder(default)]
    roles: Vec<Role>,
    tenant_id: Uuid,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

// Newtype for type safety
pub struct UserId(Uuid);

impl UserId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

pub struct TenantId(Uuid);

// Smart constructors
impl User {
    pub fn create(
        email: Email,
        name: String,
        tenant_id: TenantId,
    ) -> Result<Self, ValidationError> {
        // Validate inputs
        if name.trim().is_empty() {
            bail!("name cannot be empty");
        }
        
        Ok(Self {
            id: Uuid::new_v4(),
            email,
            name,
            roles: Vec::new(),
            tenant_id: tenant_id.0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        })
    }
}
```

### Database Patterns

```rust
// sqlx for async database access
use sqlx::postgres::{PgPool, PgPoolOptions};
use sqlx::FromRow;

#[derive(Debug, FromRow)]
pub struct UserRow {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub tenant_id: Uuid,
    pub created_at: DateTime<Utc>,
}

pub struct PostgresUserRepository {
    pool: PgPool,
}

impl PostgresUserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<User>> {
        let row: Option<UserRow> = sqlx::query_as(
            r#"
            SELECT id, email, name, tenant_id, created_at
            FROM users
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    pub async fn create(&self, user: &NewUser) -> Result<User> {
        let row: UserRow = sqlx::query_as(
            r#"
            INSERT INTO users (id, email, name, tenant_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, email, name, tenant_id, created_at
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(&user.email)
        .bind(&user.name)
        .bind(user.tenant_id)
        .bind(Utc::now())
        .bind(Utc::now())
        .fetch_one(&self.pool)
        .await?;

        Ok(row.into())
    }
}
```

### Web Framework (Axum)

```rust
use axum::{
    extract::{Path, State, Query},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct UserResponse {
    id: Uuid,
    email: String,
    name: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    email: String,
    name: String,
}

pub async fn create_user(
    State(state): State<AppState>,
    Json(payload): Json<CreateUserRequest>,
) -> Result<Json<UserResponse>, AppError> {
    let new_user = NewUser::new(payload.email, payload.name, state.tenant_id)?;
    let user = state.user_service.create(new_user).await?;
    
    Ok(Json(UserResponse {
        id: user.id,
        email: user.email.to_string(),
        name: user.name,
    }))
}

pub async fn get_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<UserResponse>, AppError> {
    let user = state.user_service.get_by_id(user_id).await?
        .ok_or_else(|| AppError::NotFound {
            resource: "user".into(),
            id: user_id.to_string(),
        })?;

    Ok(Json(UserResponse {
        id: user.id,
        email: user.email.to_string(),
        name: user.name,
    }))
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/users", post(create_user))
        .route("/users/{id}", get(get_user))
        .with_state(state)
}
```

## Rust-Specific Error Patterns

### High Priority

| Error Pattern | Likely Cause | Fix |
|--------------|--------------|-----|
| `thread 'main' panicked` | Unwrap on None/Err | Use `?` or `expect` with message |
| `borrow checker error` | Mutable + immutable borrow conflict | Restructure code, use `Rc<RefCell<T>>` or redesign |
| `thread 'xxx' has overflowed its stack` | Infinite recursion | Add base case, check recursion depth |
| `cannot borrow as mutable` | Missing `&mut` | Pass `&mut` or use `Cell`/`RefCell` |

### Medium Priority

| Error Pattern | Likely Cause | Fix |
|--------------|--------------|-----|
| `expected &str, found String` | Owned vs borrowed | Use `&user.email` or `.as_str()` |
| `mismatched types` | Type inference failure | Add explicit type annotations |
| `error: unresolved import` | Missing crate or module | Check `Cargo.toml`, `mod` declarations |
| `unused variable` | Not using variable | Prefix with `_` if intentional |
| `cannot find value` | Out of scope | Check variable lifetime |

## Testing Patterns

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_validation() {
        let result = User::create(
            Email::new("test@example.com"),
            "John Doe".to_string(),
            TenantId::new()),
        );
        
        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.name, "John Doe");
    }

    #[test]
    fn test_empty_name_rejected() {
        let result = User::create(
            Email::new("test@example.com"),
            "   ".to_string(),
            TenantId::new()),
        );
        
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::Validation(_)));
    }
}
```

### Integration Tests

```rust
// tests/integration.rs
use myapp::prelude::*;
use myapp::domain::user::NewUser;

#[tokio::test]
async fn test_create_and_fetch_user() {
    // Setup test database
    let db = TestDatabase::new().await;
    let repo = PostgresUserRepository::new(db.pool());
    let service = UserService::new(repo);
    
    // Create user
    let new_user = NewUser::new(
        "test@example.com",
        "Test User",
        TenantId::new(),
    ).unwrap();
    
    let created = service.create(new_user).await.unwrap();
    
    // Fetch user
    let fetched = service.get_by_id(created.id).await.unwrap();
    
    assert_eq!(fetched.email.to_string(), "test@example.com");
}
```

### Property-Based Testing

```rust
#[cfg(test)]
mod property_tests {
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn test_email_parsing_roundtrip(email: String) {
            // Only valid emails
            let email = format!("{}@test.com", email.replace("@", ""));
            if Email::new(&email).is_ok() {
                let parsed = Email::new(&email).unwrap();
                prop_assert_eq!(parsed.to_string(), email);
            }
        }
    }
}
```

## Lint Configuration

### Clippy

```toml
# clippy.toml
msrv = "1.70"
too-many-arguments-threshold = 8
type-complexity-threshold = 500
single-char-binding-names-threshold = 4

# Warnings that are errors
cognitive-complexity-threshold = 30
```

### rustfmt

```toml
# rustfmt.toml
edition = "2021"
max_width = 100
tab_spaces = 4
newline_style = "Auto"
use_small_heuristics = "Default"
```

### Cargo Configuration

```toml
# .cargo/config.toml
[build]
rustflags = ["-C", "target-feature=+crt-static"]

[alias]
t = "test"
b = "build"
c = "check"
r = "run"
rr = "run --release"
clippy-all = "clippy --all-targets --all-features"
test-all = "test --all-targets --all-features --no-fail-fast"

[profile.dev]
opt-level = 0

[profile.release]
lto = true
codegen-units = 1
panic = "abort"
```

## Common Pitfalls

| Pitfall | Prevention |
|---------|-----------|
| `unwrap()` in production | Use `?` operator, proper error handling |
| Mutable static state | Use `Arc<RwLock<T>>` for shared state |
| Forgetting `'static` bound | Mark async trait methods `Send + Sync` |
| Clippy warnings ignored | Run `cargo clippy -- -D warnings` in CI |
| Slow compile times | Use `cargo check` during dev, incremental builds |
| Large binary size | Use `--release`, LTO, `panic = "abort"` |

## Execution Checklist (Rust-Specific)

- [ ] All errors use `thiserror`/`anyhow` properly
- [ ] `?` operator used instead of `unwrap()`/`expect()`
- [ ] Async functions use `#[tokio::main]` or runtime
- [ ] Tests use `#[cfg(test)]` module
- [ ] `cargo clippy` passes with no warnings
- [ ] `cargo fmt` run before commit
- [ ] All public API documented with doc comments
- [ ] Dependency versions pinned in `Cargo.lock`
- [ ] `#[derive(Debug)]` on all domain types
- [ ] Proper lifetime annotations where needed
- [ ] `Send + Sync` bounds on concurrent code
