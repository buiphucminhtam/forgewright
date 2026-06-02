---
name: software-engineer-go
extends: software-engineer
language: go
version: 1.0.0
author: forgewright
tags: [go, golang, backend, api, services, clean-architecture, tdd]
file_patterns: ["*.go", "go.mod", "go.sum", "Makefile"]
linter: golangci-lint
linter_config: [.golangci.yml, .golangci.yaml]
auto_route_priority: 10
---

# Go Software Engineer

> **Identity:** The implementation specialist for Go projects. You extend the base software-engineer skill with Go-specific patterns, idioms, and tooling.

## Routing

**Auto-route to this skill if project contains:**
- `*.go` files AND (`go.mod` OR `Makefile`)
- Priority: 10 (high)

## Go-Specific Patterns

### Error Handling

```go
// Always return errors - never ignore them
func GetUser(ctx context.Context, id string) (*User, error) {
    user, err := db.QueryRowContext(ctx, "SELECT * FROM users WHERE id = $1", id)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, ErrNotFound{Resource: "user", ID: id}
        }
        return nil, fmt.Errorf("query user: %w", err)
    }
    return user, nil
}

// Custom error types
type NotFoundError struct {
    Resource string
    ID       string
}

func (e NotFoundError) Error() string {
    return fmt.Sprintf("%s %s not found", e.Resource, e.ID)
}

// Sentinel errors for wrapping
var (
    ErrNotFound      = errors.New("not found")
    ErrUnauthorized  = errors.New("unauthorized")
    ErrForbidden     = errors.New("forbidden")
)

// Use errors.Is for sentinel checks
if errors.Is(err, ErrNotFound) {
    // handle not found
}
```

### Context Propagation

```go
// Always pass context.Context as first parameter
func (s *UserService) GetUser(ctx context.Context, id string) (*User, error) {
    // Use ctx for all operations
    user, err := s.repo.FindByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("get user: %w", err)
    }
    return user, nil
}

// Context with timeout
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()
```

### Project Structure

```
cmd/
├── api/
│   └── main.go           # API server entry point
├── cli/
│   └── main.go           # CLI tool entry point
└── migrate/
    └── main.go           # Migration tool

internal/
├── domain/              # Domain models
│   ├── user.go
│   └── order.go
├── service/             # Business logic
│   ├── user.go
│   └── user_test.go
├── repository/          # Data access
│   ├── user.go
│   └── postgres/
│       └── user.go
├── handler/             # HTTP handlers
│   ├── user.go
│   └── middleware.go
└── config/             # Configuration
    └── config.go

pkg/
├── errors/             # Shared error types
├── logger/             # Structured logging
└── validator/          # Input validation

go.mod
go.sum
Makefile
```

### Dependency Injection

```go
// Constructor pattern with interfaces
type UserRepository interface {
    FindByID(ctx context.Context, id string) (*User, error)
    Create(ctx context.Context, user *User) error
}

type UserService struct {
    repo    UserRepository
    logger  *slog.Logger
}

// Constructor
func NewUserService(repo UserRepository, logger *slog.Logger) *UserService {
    return &UserService{
        repo:   repo,
        logger: logger,
    }
}

// Use functional options for optional params
type Option func(*UserService)

func WithCache(cache Cache) Option {
    return func(s *UserService) {
        s.cache = cache
    }
}

func NewUserService(repo UserRepository, logger *slog.Logger, opts ...Option) *UserService {
    s := &UserService{repo: repo, logger: logger}
    for _, opt := range opts {
        opt(s)
    }
    return s
}
```

### Database Patterns

```go
// Repository with connection pool
type PostgresUserRepository struct {
    db *sql.DB
}

func NewPostgresUserRepository(db *sql.DB) *PostgresUserRepository {
    return &PostgresUserRepository{db: db}
}

func (r *PostgresUserRepository) FindByID(ctx context.Context, id string) (*User, error) {
    user := &User{}
    err := r.db.QueryRowContext(ctx,
        "SELECT id, email, name, created_at FROM users WHERE id = $1",
        id,
    ).Scan(&user.ID, &user.Email, &user.Name, &user.CreatedAt)
    
    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("scan user: %w", err)
    }
    return user, nil
}

// Transaction support
func (r *UserRepository) CreateTx(ctx context.Context, user *User) error {
    tx, err := r.db.BeginTx(ctx, nil)
    if err != nil {
        return fmt.Errorf("begin tx: %w", err)
    }
    defer tx.Rollback()

    if err := r.createInTx(ctx, tx, user); err != nil {
        return err
    }

    return tx.Commit()
}
```

### HTTP Handlers

```go
// Standard handler pattern
type UserHandler struct {
    service *UserService
}

func (h *UserHandler) Register(router *mux.Router) {
    router.HandleFunc("/users", h.List).Methods("GET")
    router.HandleFunc("/users/{id}", h.Get).Methods("GET")
    router.HandleFunc("/users", h.Create).Methods("POST")
}

func (h *UserHandler) Get(w http.ResponseWriter, r *http.Request) {
    id := mux.Vars(r)["id"]
    
    user, err := h.service.GetUser(r.Context(), id)
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            http.Error(w, "Not found", http.StatusNotFound)
            return
        }
        http.Error(w, "Internal error", http.StatusInternalServerError)
        return
    }

    json.NewEncoder(w).Encode(user)
}

// JSON response helper
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
    respondJSON(w, status, map[string]string{"error": message})
}
```

### Graceful Shutdown

```go
func main() {
    srv := &http.Server{Addr: ":8080", Handler: mux.NewRouter()}
    
    // Setup routes
    setupRoutes(srv.Handler)

    // Start server in goroutine
    go func() {
        slog.Info("Starting server", "addr", srv.Addr)
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            slog.Error("Server error", "error", err)
            os.Exit(1)
        }
    }()

    // Wait for interrupt signal
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    // Graceful shutdown with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    slog.Info("Shutting down server...")
    if err := srv.Shutdown(ctx); err != nil {
        slog.Error("Server forced shutdown", "error", err)
    }
}
```

## Go-Specific Error Patterns

### High Priority

| Error Pattern | Likely Cause | Fix |
|--------------|--------------|-----|
| `nil pointer dereference` | Checking interface == nil when concrete type is nil | Check `err != nil` before wrapping |
| `concurrent map read/write` | Not using sync.Map or mutex | Use `sync.RWMutex` or `sync.Map` |
| `deadlock` | Channel blocking in wrong order | Check channel directions, use `select` with default |
| `context canceled` | Request cancelled, not handling | Check `ctx.Err()` and return early |

### Medium Priority

| Error Pattern | Likely Cause | Fix |
|--------------|--------------|-----|
| `connection refused` | Service not running or wrong port | Check service status, verify port |
| `SQL syntax error` | Missing parameter placeholder | Use `$1, $2` for PostgreSQL |
| `file exists` / `file does not exist` | Wrong path or permission | Check path, use `os.MkdirAll` |
| `resource exhausted` | Too many open files | Increase ulimit, close connections |
| `context deadline exceeded` | Timeout too short | Increase timeout or optimize query |

## Testing Patterns

### Unit Tests

```go
// user_test.go
package service

import (
    "context"
    "errors"
    "testing"
    
    "yourapp/internal/domain"
)

type mockUserRepository struct {
    users map[string]*domain.User
    err   error
}

func (m *mockUserRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
    if m.err != nil {
        return nil, m.err
    }
    return m.users[id], nil
}

func TestUserService_GetUser(t *testing.T) {
    t.Run("returns user when found", func(t *testing.T) {
        repo := &mockUserRepository{
            users: map[string]*domain.User{
                "1": {ID: "1", Email: "test@example.com"},
            },
        }
        svc := NewUserService(repo, slog.Default())
        
        user, err := svc.GetUser(context.Background(), "1")
        
        if err != nil {
            t.Fatalf("unexpected error: %v", err)
        }
        if user.Email != "test@example.com" {
            t.Errorf("expected email test@example.com, got %s", user.Email)
        }
    })

    t.Run("returns error when not found", func(t *testing.T) {
        repo := &mockUserRepository{}
        svc := NewUserService(repo, slog.Default())
        
        _, err := svc.GetUser(context.Background(), "999")
        
        if !errors.Is(err, ErrNotFound) {
            t.Errorf("expected ErrNotFound, got %v", err)
        }
    })
}
```

### Table-Driven Tests

```go
func TestValidateEmail(t *testing.T) {
    tests := []struct {
        name    string
        email   string
        wantErr bool
    }{
        {"valid email", "test@example.com", false},
        {"no @ symbol", "testexample.com", true},
        {"no domain", "test@", true},
        {"empty", "", true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := validateEmail(tt.email)
            if (err != nil) != tt.wantErr {
                t.Errorf("validateEmail() error = %v, wantErr %v", err, tt.wantErr)
            }
        })
    }
}
```

### Benchmark Tests

```go
func BenchmarkGetUser(b *testing.B) {
    repo := newMockRepo(1000) // 1000 users
    svc := NewUserService(repo, slog.Default())
    ctx := context.Background()

    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, _ = svc.GetUser(ctx, "500")
    }
}
```

## Lint Configuration

### golangci-lint

```yaml
# .golangci.yml
run:
  timeout: 5m
  modules-download-mode: readonly

linters:
  enable:
    - gofmt
    - golint
    - govet
    - errcheck
    - staticcheck
    - unused
    - gosimple
    - structcheck
    - varcheck
    - ineffassign
    - deadcode
    - typecheck
    - gosec
    - goimports
    - misspell
    - revive
    - unparam
    - unconvert
    - prealloc
    - exportloopref

linters-settings:
  govet:
    check-shadowing: true
  golint:
    min-confidence: 0
  gocyclo:
    min-complexity: 15
```

### go.sum hygiene

```bash
# Ensure go.sum is correct
go mod tidy

# Verify dependencies
go mod verify

# Check for vulnerabilities
go list -json -m all | jq -r '.Path' | xargs -I{} sh -c 'echo "Checking {}" && go list -m {}@latest'
```

## Makefile Template

```makefile
.PHONY: build test lint clean run

BINARY_NAME=myapp
GO=go
GOFLAGS=-ldflags="-s -w"
BUILD_DIR=./bin

build:
	$(GO) build $(GOFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/api

test:
	$(GO) test -v -race -cover ./...

test-cover:
	$(GO) test -v -race -coverprofile=coverage.out ./...
	$(GO) tool cover -html=coverage.out -o coverage.html

lint:
	golangci-lint run ./...

fmt:
	$(GO) fmt ./...
	goimports -w .

clean:
	rm -rf $(BUILD_DIR)

run: build
	./$(BUILD_DIR)/$(BINARY_NAME)

tidy:
	$(GO) mod tidy
```

## Common Pitfalls

| Pitfall | Prevention |
|---------|-----------|
| Not handling `err != nil` | Use `errcheck` linter |
| Missing error wrapping | Use `fmt.Errorf("...: %w", err)` |
| goroutine leaks | Always use `context` cancellation |
| Mutating shared map concurrently | Use `sync.Map` or `sync.Mutex` |
| Empty slices vs nil | Return empty slice `[]T{}` not `nil` |
| defer in loops | Create local function for deferred calls |
| Ignoring ctx in database calls | Always pass ctx, check ctx.Done() |

## Execution Checklist (Go-Specific)

- [ ] All errors returned and handled with `errors.Is` checks
- [ ] `context.Context` passed through all operations
- [ ] Interface segregation for dependency injection
- [ ] Tables tests for validation functions
- [ ] `go.mod tidy` and `go.sum` committed
- [ ] Graceful shutdown in main function
- [ ] Structured logging with `slog`
- [ ] No `panic` in production code
- [ ] Lint with `golangci-lint`
- [ ] Benchmark tests for hot paths
