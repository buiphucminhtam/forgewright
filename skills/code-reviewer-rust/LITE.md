---
name: code-reviewer-rust
description: "Orchestrates static analysis, lifetime/borrowing checks, memory-safety audits, and concurrency reviews for Rust codebases. Use when the user requests Rust code reviews, cargo clippy audits, unsafe block checks, thread-safety analysis, or compiler optimization profiling."
version: 1.0.0
---

# Code Reviewer Rust (LITE)

## SOLVE Step 2: GROUND (Code Reviewer Rust Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Target Cargo manifest file exists and specifies dependencies | `cat Cargo.toml` | ... | run the check command and paste output |
| Project-specific tech stack and profile configurations are active | `cat .forgewright/project-profile.json` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Code Reviewer Rust Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Run static compiler checks, code formatters, and clippy on Rust crates | Ensure `cargo fmt --check` and `cargo clippy --all-targets` run successfully with zero warnings or errors.
2. VERIFY | Review memory-safety interfaces, raw pointer usage, and unsafe block operations | Confirm all `unsafe` operations contain an explicit `// SAFETY:` comment explaining their invariants.
3. CONSTRAIN | Audit thread-safety characteristics (Send/Sync traits) and async runtimes | Verify that blocking synchronous calls are not invoked inside asynchronous Tokio tasks without `spawn_blocking`.

## Common Mistakes Checklist
- **Reference-Counting Cycles**: Constructing self-referential or cyclic memory graphs with strong reference counts (`Arc<T>` or `Rc<T>`) instead of using weak references (`Weak<T>`), causing persistent memory leaks.
- **Unsafe Blocks with Zero Safety Comments**: Utilizing `unsafe` blocks to perform raw pointer arithmetic, FFI calls, or mutations of static variables without providing a robust `// SAFETY:` rationale.
- **Non-Compliant File Names**: Saving audit results, profiles, or guidelines under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/04-testing/RustReview.md` instead of `docs/04-testing/rust-review-audit.md`).

### Step 1: Ground the active Rust workspace and verify project settings
```bash
cat Cargo.toml | grep -E "(edition|dependencies)" -A 3
cat .forgewright/project-profile.json
```
```json
{
  "project_name": "forgewright-rust-service",
  "tech_stack": ["Rust", "Tokio"],
  "health_status": "PASS"
}
```

### Step 2: Review a concurrent data structures module for common mistakes (`src/services/data_worker.rs`)
```rust
use std::sync::{Arc, RwLock};
use tokio::task;

pub struct DataWorker {
    // Corrected: Enforcing Send + Sync characteristics safely using standard thread synchronization
    state: Arc<RwLock<Vec<String>>>,
}

impl DataWorker {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn process_records(&self, filepath: String) {
        let state_clone = Arc::clone(&self.state);

        // Corrected: Blocking I/O is wrapped inside spawn_blocking to prevent async executor stall
        let records = task::spawn_blocking(move || {
            // SAFETY: Verified thread-safe disk reading operations
            std::fs::read_to_string(filepath).unwrap_or_default()
        })
        .await
        .unwrap_or_default();

        let mut write_guard = self.state.write().unwrap();
        write_guard.push(records);
    }
}
```

### Step 3: Run compiler checks, formatting, and clippy linter audits
```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```
