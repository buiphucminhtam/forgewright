---
name: code-reviewer-rust
description: "Orchestrates static analysis, lifetime/borrowing checks, memory-safety audits, and concurrency reviews for Rust codebases. Use when the user requests Rust code reviews, cargo clippy audits, unsafe block checks, thread-safety analysis, or compiler optimization profiling."
version: 1.0.0
---

# Code Reviewer Rust (LITE)

## SOLVE Step 2: GROUND (Code Reviewer Rust Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Cargo manifest file exists and specifies dependencies | `cat Cargo.toml` | Verifies active rust package metadata, edition, and target crate configurations | |
| Project-specific tech stack and profile configurations are active | `cat .forgewright/project-profile.json` [1] | Displays onboarded tech stacks (Rust) and baseline health indicators [1] | |
| Standard feature specs and BDD-first templates exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` [2] | Verifies structural template format for design specs and acceptance criteria [2] | |
| Active API expenditure parameters and cost ceilings are configured | `cat .forgewright/budget.yaml` [3-5] | Confirms running token tracker budget settings and spend safety caps [3-5] | |

## SOLVE Step 3: DECOMPOSE (Code Reviewer Rust Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Run static compiler checks, code formatters, and clippy on Rust crates | Ensure `cargo fmt --check` and `cargo clippy --all-targets` run successfully with zero warnings or errors.
2. VERIFY | Review memory-safety interfaces, raw pointer usage, and unsafe block operations | Confirm all `unsafe` operations contain an explicit `// SAFETY:` comment explaining their invariants.
3. CONSTRAIN | Audit thread-safety characteristics (Send/Sync traits) and async runtimes | Verify that blocking synchronous calls are not invoked inside asynchronous Tokio tasks without `spawn_blocking`.
4. SYNC | Write compliant kebab-case reports under docs/ [2] and run post-skill sync hooks [6] | Ensure files are saved using lowercase kebab-case [2] and symlinked to the Shared Obsidian Vault [6].

## Common Mistakes Checklist
- **Blocking Async Executors**: Calling synchronous or blocking operations (e.g., `std::fs::read_to_string` or `std::thread::sleep`) inside an asynchronous thread context, stalling the runtime worker pool.
- **Reference-Counting Cycles**: Constructing self-referential or cyclic memory graphs with strong reference counts (`Arc<T>` or `Rc<T>`) instead of using weak references (`Weak<T>`), causing persistent memory leaks.
- **Unsafe Blocks with Zero Safety Comments**: Utilizing `unsafe` blocks to perform raw pointer arithmetic, FFI calls, or mutations of static variables without providing a robust `// SAFETY:` rationale.
- **Non-Compliant File Names [2]**: Saving audit results, profiles, or guidelines under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case [2] (e.g., `docs/04-testing/RustReview.md` instead of `docs/04-testing/rust-review-audit.md`).
- **Unchecked API Spending [3]**: Initiating recursive compiler diagnostics or heavy auto-refactorings without validating current token budgets inside `.forgewright/budget.yaml` [3].

## Worked Example

### Step 1: Ground the active Rust workspace and verify project settings
```bash
cat Cargo.toml | grep -E "(edition|dependencies)" -A 3
cat .forgewright/project-profile.json
```
Output:
```toml
edition = "2021"

[dependencies]
tokio = { version = "1.35", features = ["full"] }
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
Output:
```
[INFO] Formatting check passed.
[INFO] Running cargo clippy...
    Checking forgewright-rust-service v1.0.0
    Finished dev [unoptimized + debuginfo] target(s) in 0.84s
[SUCCESS] Rust audit passed cleanly with 0 warnings and 0 errors.
```

### Step 4: Write documentation and synchronize with the Shared Obsidian Vault [6]
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines [2]
cat << 'EOF' > docs/04-testing/rust-concurrency-audit.md
# Rust Code Review & Concurrency Audit

## 1. Executive Summary
Validated thread safety characteristics and memory-safety parameters for the concurrent worker stack.

## 2. Technical Profile
- Compiler Toolchain: Cargo / rustc 1.75+
- Concurrency State: SAFE (Tokio blocking tasks separated from async executor thread loops)
- Memory Footprint: Arc/RwLock validated with zero detected memory leak reference loops
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian [6]
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for rust-concurrency-audit.md. [2]
[SUCCESS] Symlinked docs/04-testing/rust-concurrency-audit.md to /workspace/shared-obsidian-vault/forgewright/04-testing/rust-concurrency-audit.md. [6]
```
