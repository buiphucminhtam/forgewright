---
name: code-reviewer-go
description: "Orchestrates static analysis, style audits, error-handling validation, and concurrency safety reviews for Go (Golang) codebases. Use when the user requests Go code reviews, staticcheck verification, race detection audits, or goroutine leak analysis."
version: 1.0.0
---

# Code Reviewer Go (LITE)

## SOLVE Step 2: GROUND (Code Reviewer Go Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Go module and toolchain version are defined | `cat go.mod` | ... | Y/N |
| Active Go installation and environment variables are verified | `go version && go env GOPATH` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Code Reviewer Go Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Run static analysis checkers, linters, and formatting audits on Go packages | Ensure `go vet`, `gofmt -s`, and `staticcheck` return zero compilation or style warnings.
2. VERIFY | Review error handling patterns and defer resource cleanups | Ensure all functions returning error parameters are explicitly handled (`if err != nil`) and database/file connections close safely.
3. DETECT | Check concurrency structures, channel operations, and state race conditions | Verify that goroutines terminate cleanly to prevent leaks and run tests with the `-race` detector enabled.
4. SYNC | Compile review report and run the post-skill sync hook to save to Obsidian | Ensure the review logs are saved using lowercase kebab-case naming under `docs/04-testing/` [2, 5].

## Common Mistakes Checklist
- **Unchecked Errors**: Ignoring returned `error` values from API or database operations (e.g. calling `json.Unmarshal(data, &v)` without verifying the error), resulting in silent failures.
- **Leaking Goroutines or Channels**: Spawning unbuffered channels or long-running goroutines without a cancellation context (`context.Context`) or timeout mechanism, causing progressive memory exhaustion.
- **Loop Variable Capturing inside Goroutines**: Passing loop iterator variables directly into concurrent closures inside loops instead of passing them explicitly as arguments, leading to race-corrupted reference values.
- **Unhandled Defer Statements inside Loops**: Placing resource-reclaiming `defer` calls (e.g. `defer rows.Close()`) inside high-frequency `for` loops, delaying deallocation until the outer function terminates and exhausting system connections.
- **Non-Compliant File Names**: Creating review logs or architectural ADRs under `docs/` using CamelCase, spaces, or uppercase characters instead of strictly lowercase kebab-case (e.g. `docs/04-testing/GoReview.md` instead of `docs/04-testing/go-review-audit.md`).

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground the active Go workspace configurations
```bash
cat go.mod
go version
```

### Step 2: Review concurrent worker pool script `internal/worker/pool.go` for common mistakes
```go
package worker

import (
	"context"
	"fmt"
	"sync"
)

type Job struct {
	ID    int
	Value string
}

func ProcessJobs(ctx context.Context, jobs []Job) error {
	var wg sync.WaitGroup
	errChan := make(chan error, len(jobs)) // Safe: Buffered channel prevents writer blocks

	for _, job := range jobs {
		wg.Add(1)
		// Corrected: Explicitly passing the iterator variable to prevent closure capturing
		go func(j Job) {
			defer wg.Done()
			
			if err := process(ctx, j); err != nil {
				errChan <- fmt.Errorf("job %d failed: %w", j.ID, err)
			}
		}(job)
	}

	wg.Wait()
	close(errChan)

	// Explicitly check for returned errors
	for err := range errChan {
		if err != nil {
			return err // Return first error encountered
		}
	}
	return nil
}

func process(ctx context.Context, j Job) error {
	// Simulated high-integrity process
	return nil
}
```

### Step 3: Run the static analysis and race detector tests
```bash
go fmt ./...
go vet ./...
staticcheck ./...
go test -race -v ./...
```

