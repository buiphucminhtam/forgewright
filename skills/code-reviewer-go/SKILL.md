---
name: code-reviewer-go
extends: code-reviewer
language: go
version: 1.0.0
author: forgewright
tags: [go, golang, code-review, quality, patterns, anti-patterns, idiomatic]
file_patterns: ["*.go", "go.mod", "go.sum", "Makefile"]
linter: golangci-lint
linter_config: [.golangci.yml, .golangci.yaml]
auto_route_priority: 10
---

# Go Code Reviewer

> **Identity:** The quality guardian for Go projects. You extend the base code-reviewer skill with Go-specific patterns, idioms, and anti-patterns.

## Routing

**Auto-route to this skill if project contains:**
- `*.go` files AND (`go.mod` OR `Makefile`)
- Priority: 10 (high)

## Go-Specific Review Areas

### Error Handling Review

```go
// ❌ IGNORING ERRORS
func GetUser(id string) (*User, error) {
    user, _ := db.QueryRow("SELECT * FROM users WHERE id=$1", id)
    return user, nil  // Error ignored!
}

// ✅ CHECKING ERRORS
func GetUser(ctx context.Context, id string) (*User, error) {
    user := &User{}
    err := db.QueryRowContext(ctx,
        "SELECT id, email, name FROM users WHERE id=$1", id,
    ).Scan(&user.ID, &user.Email, &user.Name)
    
    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrNotFound
    }
    if err != nil {
        return nil, fmt.Errorf("query user: %w", err)
    }
    return user, nil
}

// ❌ WRAPPING WITHOUT ERROR CHAIN
if err != nil {
    return nil, errors.New("query failed")
}

// ✅ PROPER ERROR WRAPPING
if err != nil {
    return nil, fmt.Errorf("get user %s: %w", id, err)
}

// ❌ PANIC IN PRODUCTION
if user == nil {
    panic("user not found")
}

// ✅ PROPER ERROR RETURN
if user == nil {
    return nil, ErrNotFound
}
```

### Context Propagation Review

```go
// ❌ MISSING CONTEXT
func FetchData() ([]byte, error) {
    resp, err := http.Get("https://api.example.com/data")
    // Context should be passed
    return resp.Body, nil
}

// ✅ CONTEXT PASSED
func FetchData(ctx context.Context) ([]byte, error) {
    req, err := http.NewRequestWithContext(ctx, "GET", "https://api.example.com/data", nil)
    if err != nil {
        return nil, err
    }
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, fmt.Errorf("read response: %w", err)
    }
    return body, nil
}

// ❌ CONTEXT NOT USED
func WithTimeout(ctx context.Context) error {
    // ctx created but not used
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    // Database call without context
    db.Query("SELECT * FROM users")
    return nil
}

// ✅ CONTEXT PROPERLY USED
func WithTimeout(ctx context.Context) error {
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()
    
    return db.QueryRowContext(ctx, "SELECT * FROM users").Scan(&user)
}
```

## Go-Specific Error Patterns to Catch

### High Priority

| Error Pattern | Code Smell | Severity |
|--------------|------------|----------|
| `nil pointer dereference` | Not checking nil before use | CRITICAL |
| `concurrent map read/write` | Unsynchronized map access | CRITICAL |
| `all goroutines asleep` | Deadlock, channel issues | CRITICAL |
| `context canceled` | Not handling request cancellation | HIGH |

### Medium Priority

| Error Pattern | Code Smell | Severity |
|--------------|------------|----------|
| `connection refused` | Service not running | MEDIUM |
| `SQL syntax error` | Wrong parameter placeholders | MEDIUM |
| `index out of range` | Missing bounds check | MEDIUM |
| `resource exhausted` | Too many open files | MEDIUM |

## Go Anti-Patterns

### Error Handling Anti-Patterns

```go
// ❌ SILENT IGNORING
if err != nil {
    // Do nothing
}

// ✅ LOG OR HANDLE
if err != nil {
    log.Printf("operation failed: %v", err)
    return err
}

// ❌ USING ERRORS.NEW IN LOOP
for _, item := range items {
    if err := process(item); err != nil {
        return errors.New("processing failed")  // Loses context
    }
}

// ✅ WRAPPING WITH CONTEXT
for _, item := range items {
    if err := process(item); err != nil {
        return fmt.Errorf("process item %s: %w", item.ID, err)
    }
}

// ❌ TYPE ASSERTION WITHOUT CHECK
user := data.(User)  // Panics if wrong type

// ✅ SAFE TYPE ASSERTION
user, ok := data.(User)
if !ok {
    return ErrInvalidType
}
```

### Goroutine Anti-Patterns

```go
// ❌ GOROUTINE LEAK
func Generate() <-chan int {
    ch := make(chan int)
    go func() {
        for i := range bigData {
            ch <- process(i)
        }
        // ch never closed if bigData is empty
    }()
    return ch
}

// ✅ PROPER CHANNEL CLOSING
func Generate() <-chan int {
    ch := make(chan int)
    go func() {
        defer close(ch)
        for _, item := range bigData {
            select {
            case ch <- process(item):
            case <-time.After(5 * time.Second):
                return // Timeout
            }
        }
    }()
    return ch
}

// ❌ UNSYNCHRONIZED MAP
var cache = make(map[string]string)

func Set(key, value string) {
    cache[key] = value  // Not thread-safe!
}

// ✅ SYNCHRONIZED MAP
var (
    mu    sync.RWMutex
    cache = make(map[string]string)
)

func Set(key, value string) {
    mu.Lock()
    defer mu.Unlock()
    cache[key] = value
}

// ✅ OR USE sync.Map
var cache sync.Map

func Set(key, value string) {
    cache.Store(key, value)
}
```

### Slice/Map Anti-Patterns

```go
// ❌ APPENDING TO NIL SLICE
var items []Item
items = append(items, newItem)  // OK, but style warning
// Better to initialize
items := []Item{}

// ❌ PREALLOCATING WITHOUT CAPACITY
items := make([]Item, 0, 1000)  // Allocates 1000 zero values
// If just appending, use make([]Item, 0)
items := make([]Item, 0)
for _, item := range bigData {
    items = append(items, item)
}

// ✅ SLICE PREPEND
// Prepending is O(n), avoid in hot paths
// Use append correctly
items := []Item{deleteItem}
items = append(items, remainingItems...)

// ❌ MAP ITERATION WHILE WRITING
for k, v := range m {
    if v.needsUpdate {
        m[k].updated = true  // May skip entries
    }
}

// ✅ CREATE NEW MAP
updated := make(map[K]V)
for k, v := range m {
    if v.needsUpdate {
        v.updated = true
    }
    updated[k] = v
}
```

## Idiomatic Go Review

### Naming Conventions

```go
// ❌ INCONSISTENT NAMING
func Get_User_By_Id(id string) {}  // snake_case
func ProcessData(data []byte) {}   // different style
func calculateSum(numbers []int) int {}  // unexported mixed case

// ✅ GO NAMING CONVENTIONS
// Use PascalCase for exported, camelCase for unexported
func GetUserByID(id string) (*User, error) {}  // Exported
func calculateSum(numbers []int) int {}         // Unexported

// ❌ REDUNDANT PREFIXES
type UserService struct {
    userServiceUserRepo UserRepository  // "user" twice
}

// ✅ CLEAR NAMING
type UserService struct {
    users UserRepository
    auth  AuthService
}

// ❌ BOOLEAN PREFIXES
var isUserLoggedIn bool
var hasUserPurchased bool

// ✅ PREFIX WITH "Has" or "Is" CONSISTENTLY
var loggedIn bool
var purchased bool
```

### Interface Review

```go
// ❌ LARGE INTERFACES
type Handler interface {
    HandleUsers()
    HandleOrders()
    HandleProducts()
    HandleInventory()
    // Too many methods
}

// ✅ SMALL INTERFACES
// Stick to 1-3 methods
type UserGetter interface {
    GetUser(id string) (*User, error)
}

type UserManager interface {
    CreateUser(user *User) error
    DeleteUser(id string) error
}

// ❌ INTERFACES IN CONSUMERS
func NewService(r *UserRepository) {  // Concrete type
    // ...
}

// ✅ INTERFACES DEFINED BY CONSUMERS
type UserRepository interface {
    GetByID(ctx context.Context, id string) (*User, error)
    Create(ctx context.Context, user *User) error
}

func NewService(r UserRepository) {  // Interface
    // ...
}
```

### Project Structure Review

```
✓ GOOD GO PROJECT STRUCTURE:
├── cmd/
│   ├── api/main.go
│   └── cli/main.go
├── internal/
│   ├── domain/
│   ├── service/
│   ├── repository/
│   └── handler/
├── pkg/
│   ├── errors/
│   └── logger/
├── api/
│   └── openapi.yaml
├── go.mod
└── Makefile

✗ BAD STRUCTURE WARNING SIGNS:
├── lib/              # "lib" is not descriptive
├── common/           # Too vague
├── utils/            # "utils" often becomes a dumping ground
├── src/              # Not idiomatic Go
└── models/           # Better as "domain"
```

## Testing Review

```go
// ❌ NO MOCKS, TESTING CONCRETE IMPLEMENTATION
func TestUserService(t *testing.T) {
    svc := &UserService{
        db: &RealDatabase{},  // Can't control, needs DB running
    }
}

// ✅ INTERFACE-BASED TESTING
func TestUserService(t *testing.T) {
    mockRepo := &MockUserRepository{}
    svc := NewUserService(mockRepo, nil)
    
    mockRepo.On("GetByID", "123").Return(nil, ErrNotFound)
    // Test behavior
}

// ❌ ASSERTING TRUE/FALSE WITHOUT DETAILS
if got := svc.GetUser("123"); got != nil {
    t.Error("expected nil")  // Not helpful
}

// ✅ SPECIFIC ASSERTIONS
if got != nil {
    t.Errorf("GetUser() = %v, want nil", got)
}

if got.ID != want.ID {
    t.Errorf("GetUser().ID = %s, want %s", got.ID, want.ID)
}

// ❌ NO TABLE TESTS FOR VALIDATION
func TestValidateEmail(email string) bool {
    // Testing one case
}

// ✅ TABLE-DRIVEN TESTS
func TestValidateEmail(t *testing.T) {
    tests := []struct {
        name    string
        email   string
        wantErr bool
    }{
        {"valid", "test@example.com", false},
        {"no @", "testexample.com", true},
        {"empty", "", true},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := ValidateEmail(tt.email)
            if (err != nil) != tt.wantErr {
                t.Errorf("ValidateEmail() error = %v, wantErr %v", err, tt.wantErr)
            }
        })
    }
}
```

## File Patterns to Look For

```
✓ FOUND - Good Go Project Indicators:
├── go.mod                    # Module definition
├── go.sum                    # Dependency lock
├── Makefile                  # Build automation
├── cmd/                      # Application entry points
├── internal/                 # Private packages
├── pkg/                      # Public packages
└── *_test.go                 # Test files

✗ FOUND - Warning Signs:
├── vendor/                   # Committed vendor directory (usually bad)
├── Gopkg.lock                # Dep lock file (old dependency manager)
├── main.go in root           # No cmd/ structure
├── global variables          # Package-level mutable state
└── init() functions          # Hidden initialization logic
```

## Lint Warnings to Flag

| Lint Rule | What It Catches | Severity |
|-----------|-----------------|----------|
| `errcheck` | Ignoring returned errors | HIGH |
| `gosimple` | Simplifiable code | MEDIUM |
| `govet` | Suspicious code | HIGH |
| `staticcheck` | Static analysis issues | MEDIUM |
| `golint` | Style issues | LOW |
| `gocyclo` | High cyclomatic complexity | MEDIUM |
| `maligned` | Improper struct alignment | LOW |
| `ineffassign` | Ineffective assignment | MEDIUM |
| `deadcode` | Unused code | LOW |

## Common Go Code Smells

| Smell | Example | Fix |
|-------|---------|-----|
| Flag parameters | `func(x, y, flag bool)` | Use options struct |
| Result channel | Returning channels from functions | Return data or use callbacks |
| Error variables | `var err error` in loops | Shadow or reset |
| Blank identifier | `_, err := fn()` ignored | Handle or log |
| Defer in loops | `defer` inside `for` | Extract to function |

## Review Checklist

### Error Handling
- [ ] Every `err != nil` is checked
- [ ] Errors are wrapped with context
- [ ] No `panic()` in production code
- [ ] Sentinel errors defined in packages

### Concurrency
- [ ] All maps accessed with synchronization
- [ ] Channels closed properly
- [ ] No goroutine leaks (ctx cancellation)
- [ ] Race detector enabled in tests

### Performance
- [ ] Strings built with strings.Builder
- [ ] Slices pre-allocated when size known
- [ ] Strings concatenated efficiently
- [ ] Database queries use prepared statements

### Testing
- [ ] Table-driven tests for multiple cases
- [ ] Mocks used for dependencies
- [ ] Benchmark tests for hot paths
- [ ] Examples for exported functions

### Documentation
- [ ] All exported types/functions have doc comments
- [ ] No TODO comments without issue references
- [ ] README explains how to build/test
