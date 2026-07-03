---
name: software-engineer-go
description: "Orchestrates Go (Golang) software design, backend API development, database integration, concurrent pipeline orchestration, and production compiler optimizations. Use when the user requests Go feature implementations, REST/gRPC endpoints, microservices setups, or high-performance concurrent workers using channels and mutexes."
version: 1.0.0
---

# Software Engineer Go (LITE)

## SOLVE Step 2: GROUND (Software Engineer Go Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Go module path and dependency configurations exist | `cat go.mod` | Identifies module name, compiler version, and dependency constraints | |
| Go workspace setup and toolchain are verified | `go version && go env` | Confirms compiler version, GOPATH, and native build settings | |
| Standard feature specification and testing templates are loaded | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs | |
| Running spend limits and token budgets are active for task loops | `cat .forgewright/budget.yaml` | Verifies current session spend limits and warning thresholds | |

## SOLVE Step 3: DECOMPOSE (Software Engineer Go Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Analyze Go package structures, boundary interfaces, and data models | Verify that packages are modular and interfaces conform to implicit structural typing.
2. IMPLEMENT | Author clean Go structures, method receivers, and error handling controls | Ensure all returned errors are explicitly checked and handled using the `if err != nil` idiom.
3. OPTIMIZE | Construct concurrent execution structures utilizing safe channels, mutexes, or wait groups | Confirm concurrent blocks do not leak goroutines or trigger memory race conditions.
4. SYNC | Compile implementation specs and run the sync-obsidian hook | Verify file name compliance (lowercase kebab-case) and establish absolute symlinks to Obsidian.

## Common Mistakes Checklist
- **Ignoring Return Errors**: Calling functions that return `(T, error)` and ignoring or discarding the error parameter (e.g., using `_` to suppress), causing silent failures in production.
- **Leaking Goroutines via Blocked Channels**: Spawning a goroutine that writes to an unbuffered channel without a matching reader or context cancellation, permanently blocking the goroutine and leaking memory.
- **Data Races on Shared Memory**: Accessing or mutating shared state across concurrent goroutines without proper synchronization via `sync.Mutex`, `sync.RWMutex`, or atomic operations.
- **Inefficient Defer Scopes**: Placing heavy resource recovery `defer` statements (like `defer rows.Close()`) inside high-frequency loops instead of encapsulating the iteration inside a helper function.
- **Non-Compliant File Names**: Storing Go architecture specs, design notes, or API diagrams under `docs/` using CamelCase instead of strictly lowercase kebab-case (e.g., `docs/01-product/GoServer.md` instead of `docs/01-product/go-server.md`).

## Worked Example

### Step 1: Ground Go configurations and verify current active project profile
```bash
cat go.mod
cat .forgewright/project-profile.json
```
Output:
```
module github.com/forgewright/go-api

go 1.21
{
  "project_name": "forgewright-go-api",
  "tech_stack": ["Go", "SQLite"],
  "health_status": "PASS"
}
```

### Step 2: Implement a safe, concurrent, error-handling compliant Go worker channel pipeline
Create `internal/pipeline/worker.go`:
```go
package pipeline

import (
	"context"
	"errors"
	"sync"
)

type Result struct {
	ID    int
	Data  string
	Error error
}

// ProcessItems processes string inputs concurrently in a thread-safe manner.
func ProcessItems(ctx context.Context, items []string) ([]Result, error) {
	if len(items) == 0 {
		return nil, errors.New("empty items list")
	}

	results := make([]Result, len(items))
	var wg sync.WaitGroup
	
	// Buffered channel prevents goroutines from blocking on write
	resChan := make(chan Result, len(items))

	for i, item := range items {
		wg.Add(1)
		// Explicitly capture loop variables to prevent race conditions on shared references
		go func(id int, data string) {
			defer wg.Done()
			
			select {
			case <-ctx.Done():
				resChan <- Result{ID: id, Error: ctx.Err()}
			default:
				// Process item and send to result channel
				processed := "PROCESSED: " + data
				resChan <- Result{ID: id, Data: processed}
			}
		}(i, item)
	}

	wg.Wait()
	close(resChan)

	// Explicitly collect channel values
	idx := 0
	for res := range resChan {
		results[idx] = res
		idx++
	}

	return results, nil
}
```

### Step 3: Verify the module compiling and test passing metrics
```bash
go fmt ./...
go test -v -race ./internal/pipeline/...
```
Output:
```
[INFO] Formatting check complete.
=== RUN   TestProcessItems
--- PASS: TestProcessItems (0.01s)
PASS
ok  	github.com/forgewright/go-api/internal/pipeline	0.015s
```

### Step 4: Write compliant architecture specs and synchronize files with Obsidian
```bash
cat << 'EOF' > docs/02-architecture/concurrency-pipeline-spec.md
# Architecture Spec: Go Concurrency Pipeline

## 1. Executive Summary
Provide a high-throughput, thread-safe concurrent processor utilizing buffered channels and wait groups.

## 2. Technical Profile
- Language: Go (Golang 1.21)
- Pipeline Mode: Concurrency with safe goroutine worker distribution
- Error Handling: Context-aware timeouts and explicit channel error aggregation
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for concurrency-pipeline-spec.md.
[SUCCESS] Symlinked docs/02-architecture/concurrency-pipeline-spec.md to /workspace/shared-obsidian-vault/forgewright/02-architecture/concurrency-pipeline-spec.md.
```
