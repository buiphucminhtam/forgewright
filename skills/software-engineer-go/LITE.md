---
name: software-engineer-go
description: "Orchestrates Go (Golang) software design, backend API development, database integration, concurrent pipeline orchestration, and production compiler optimizations. Use when the user requests Go feature implementations, REST/gRPC endpoints, microservices setups, or high-performance concurrent workers using channels and mutexes."
version: 1.0.0
---

# Software Engineer Go (LITE)

## SOLVE Step 2: GROUND (Software Engineer Go Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Go module path and dependency configurations exist | `cat go.mod` | ... | Y/N |
| Go workspace setup and toolchain are verified | `go version && go env` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Software Engineer Go Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Analyze Go package structures, boundary interfaces, and data models | Verify that packages are modular and interfaces conform to implicit structural typing.
2. IMPLEMENT | Author clean Go structures, method receivers, and error handling controls | Ensure all returned errors are explicitly checked and handled using the `if err != nil` idiom.
3. OPTIMIZE | Construct concurrent execution structures utilizing safe channels, mutexes, or wait groups | Confirm concurrent blocks do not leak goroutines or trigger memory race conditions.
4. SYNC | Compile implementation specs and run the sync-obsidian hook | Verify file name compliance (lowercase kebab-case) and establish absolute symlinks to Obsidian.

## Common Mistakes Checklist
- **Ignoring Return Errors**: Calling functions that return `(T, error)` and ignoring or discarding the error parameter (e.g., using `_` to suppress), causing silent failures in production.
- **Leaking Goroutines via Blocked Channels**: Spawning a goroutine that writes to an unbuffered channel without a matching reader or context cancellation, permanently blocking the goroutine and leaking memory.
- **Inefficient Defer Scopes**: Placing heavy resource recovery `defer` statements (like `defer rows.Close()`) inside high-frequency loops instead of encapsulating the iteration inside a helper function.
- **Non-Compliant File Names**: Storing Go architecture specs, design notes, or API diagrams under `docs/` using CamelCase instead of strictly lowercase kebab-case (e.g., `docs/01-product/GoServer.md` instead of `docs/01-product/go-server.md`).

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground Go configurations and verify current active project profile
```bash
cat go.mod
cat .forgewright/project-profile.json
```

### Step 2: Implement a safe, concurrent, error-handling compliant Go worker channel pipeline
Create `internal/pipeline/worker.go`:

### Step 3: Verify the module compiling and test passing metrics
```bash
go fmt ./...
go test -v -race ./internal/pipeline/...
```

