---
name: software-engineer-rust
description: "Orchestrates Rust software design, backend API development, concurrent task processing pipelines, and cargo performance optimizations. Use when the user requests Rust feature implementations, async Tokio runtimes, custom trait implementations, Cargo.toml package configurations, or thread-safe concurrency structures."
version: 1.0.0
---

# Software Engineer Rust (LITE)

## SOLVE Step 2: GROUND (Software Engineer Rust Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Cargo manifest file exists and defines target compiler edition | `cat Cargo.toml` | Verifies rust edition, dependencies, and workspace crate roots | |
| Project-specific tech stack and baseline profile are active | `cat .forgewright/project-profile.json` | Confirms onboarded language (Rust) and current build health | |
| GitNexus symbol index is loaded and ready for impact analysis | `gitnexus analyze --status \|\| find . -name \"*.gitnexus\"` | Verifies symbol graph availability to check code change blast radius | |
| Active API expenditure parameters and cost ceilings are configured | `cat .forgewright/budget.yaml` | Verifies current session spend thresholds to restrict loop processes | |

## SOLVE Step 3: DECOMPOSE (Software Engineer Rust Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. IMPACT | Evaluate target module changes and upstream structural dependencies using GitNexus | Warn the user if the impact analysis returns a HIGH or CRITICAL risk rating on shared traits or structs.
2. IMPLEMENT | Author safe, structured Rust code enforcing strict ownership, lifetimes, and type bounds | Ensure code compiles cleanly via the Rust compiler without triggering borrow-checker or lifetime conflicts.
3. CONCURRENT | Implement multi-threaded or async task execution utilizing safe sync primitives (Arc/Mutex/RwLock) | Verify async worker blocks do not invoke synchronous blocking calls inside Tokio execution contexts.
4. SYNC | Document Rust design decisions as lowercase kebab-case and run post-skill sync hooks | Trigger synchronization script to build absolute symlinks of documentation under the Shared Obsidian Vault.

## Common Mistakes Checklist
- **Blocking Async Tokio Executors**: Invoking blocking database or file I/O operations inside asynchronous Tokio tasks without wrapping them inside `tokio::task::spawn_blocking`, stalling execution threads.
- **Dangling Lifetime Annotations**: Overcomplicating function signatures with unnecessary explicit lifetimes instead of letting the compiler use standard lifetime elision rules.
- **Reference-Counting Memory Cycles**: Constructing strong reference cycles via `Arc<T>` or `Rc<T>` smart pointers instead of utilizing `Weak<T>` references, leading to uncollected heap allocation leaks.
- **Unused Results of Critical Failures**: Ignoring the returned `Result<T, E>` types on file system, channel, or network operations instead of using pattern matching or bubbling via the `?` operator.
- **Non-Compliant File Names**: Creating Rust technical design docs or architecture notes under `docs/` using CamelCase instead of lowercase kebab-case (e.g., `docs/02-architecture/RustEngine.md` instead of `docs/02-architecture/rust-engine.md`).

## Worked Example

### Step 1: Ground the active Rust environment and verify the GitNexus symbol registry
```bash
cat Cargo.toml | grep -E "(edition|dependencies)" -A 2
gitnexus analyze --status
```
Output:
```toml
edition = "2021"

[dependencies]
tokio = { version = "1.35", features = ["full"] }
```
```
[SUCCESS] GitNexus database index is fresh (20,138 symbols, 28,557 relationships).
```

### Step 2: Run GitNexus upstream impact check on the core dispatcher
```bash
gitnexus_impact --target "EventDispatcher" --direction "upstream"
```
Output:
```
[INFO] Querying symbol graph database...
[INFO] "EventDispatcher" is imported by 1 file.
[SUCCESS] Blast Radius Risk Level: LOW (Low risk changes permitted)
```

### Step 3: Implement an optimized, thread-safe concurrent dispatcher inside `src/services/event_dispatcher.rs`
```rust
use std::sync::{Arc, RwLock};
use tokio::task;

pub struct EventDispatcher {
    // Thread-safe state tracking using atomic reference counting and read/write lock
    events: Arc<RwLock<Vec<String>>>,
}

impl EventDispatcher {
    pub fn new() -> Self {
        Self {
            events: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn dispatch(&self, payload: String) -> Result<(), String> {
        let events_clone = Arc::clone(&self.events);
        
        // Wrap heavy CPU calculation or blocking operation safely
        task::spawn_blocking(move || {
            let mut guard = events_clone.write().map_err(|e| e.to_string())?;
            guard.push(payload);
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())?
    }
}
```

### Step 4: Validate compilation and format the crate
```bash
cargo fmt --check
cargo check
cargo test
```
Output:
```
[INFO] Formatting check passed cleanly.
    Checking forgewright-rust-service v1.0.0
    Finished dev [unoptimized + debuginfo] target(s) in 0.42s
[SUCCESS] 0 errors, 0 warnings. All tests passed.
```

### Step 5: Document implementation specifications and trigger the Shared Obsidian Vault sync
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/02-architecture/rust-dispatcher-spec.md
# Architecture Spec: Rust Event Dispatcher

## 1. Executive Summary
Provide a high-throughput, thread-safe asynchronous dispatcher utilizing Arc/RwLock constraints.

## 2. Technical Profile
- Language: Rust (Edition 2021)
- Concurrency Model: Non-blocking async utilizing Tokio thread pools
- Safety Boundaries: Enforced Send + Sync guarantees with zero raw unsafe operations
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for rust-dispatcher-spec.md.
[SUCCESS] Symlinked docs/02-architecture/rust-dispatcher-spec.md to /workspace/shared-obsidian-vault/forgewright/02-architecture/rust-dispatcher-spec.md.
```
