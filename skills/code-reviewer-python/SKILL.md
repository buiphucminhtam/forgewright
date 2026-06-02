---
name: code-reviewer-python
extends: code-reviewer
language: python
version: 1.0.0
author: forgewright
tags: [python, code-review, quality, patterns, anti-patterns, pythonic]
file_patterns: ["*.py", "pyproject.toml", "requirements*.txt", "Pipfile", "setup.py"]
linter: pylint
linter_config: [pyproject.toml, .pylintrc, setup.cfg]
auto_route_priority: 10
---

# Python Code Reviewer

> **Identity:** The quality guardian for Python projects. You extend the base code-reviewer skill with Python-specific patterns, idioms, and anti-patterns.

## Routing

**Auto-route to this skill if project contains:**
- `*.py` files AND (`pyproject.toml` OR `requirements.txt` OR `Pipfile`)
- Priority: 10 (high)

## Python-Specific Review Areas

### Type Hints Review

```python
# ❌ MISSING TYPE HINTS
def process_user(user_id):
    return db.fetch(user_id)

# ✅ COMPLETE TYPE HINTS
def process_user(user_id: str) -> User | None:
    return await db.fetch(user_id)

# ❌ INCOMPLETE TYPE HINTS
def process_data(data: list):
    return [x * 2 for x in data]

# ✅ COMPLETE TYPE HINTS
def process_data(data: list[int]) -> list[int]:
    return [x * 2 for x in data]
```

**Review Checklist:**
- [ ] All public functions have return type hints
- [ ] All parameters have type hints
- [ ] Complex generic types use proper typing (e.g., `dict[str, int]`, not `Dict`)
- [ ] Union types use `X | None` (Python 3.10+) or `Optional[X]`

### Dataclass/Pydantic Review

```python
# ❌ MUTABLE DEFAULT ARGUMENTS
class User:
    def __init__(self, name: str, roles: list[str] = []):  # DANGER
        self.name = name
        self.roles = roles

# ✅ USE DATACLASS
from dataclasses import dataclass, field

@dataclass
class User:
    name: str
    roles: list[str] = field(default_factory=list)

# ❌ PLATFORM DICTIONARY
class Config:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

# ✅ PYDANTIC FOR VALIDATION
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
```

### Async Patterns Review

```python
# ❌ BLOCKING I/O IN ASYNC
async def fetch_users():
    users = []  # blocking!
    for id in user_ids:
        users.append(blocking_db_fetch(id))
    return users

# ✅ ASYNC I/O
async def fetch_users():
    results = await asyncio.gather(*[
        fetch_user(id) for id in user_ids
    ])
    return list(results)

# ❌ NOT CLOSING RESOURCES
async def read_file(path: str) -> str:
    f = open(path)  # Never closed
    return f.read()

# ✅ CONTEXT MANAGER
async def read_file(path: str) -> str:
    async with aiofiles.open(path) as f:
        return await f.read()
```

## Python-Specific Error Patterns to Catch

### High Priority

| Error Pattern | Code Smell | Severity |
|--------------|------------|----------|
| `TypeError: 'NoneType' object is not iterable` | Missing null check | CRITICAL |
| `IndentationError` | Tab/space mixing | HIGH |
| `ImportError: cannot import name 'xxx'` | Circular import | HIGH |
| `AttributeError: 'NoneType'` | Missing optional handling | CRITICAL |

### Medium Priority

| Error Pattern | Code Smell | Severity |
|--------------|------------|----------|
| `IndexError: list index out of range` | Missing bounds check | MEDIUM |
| `KeyError` | Missing dict key | MEDIUM |
| `RecursionError` | Infinite recursion | MEDIUM |
| `PendingDeprecationWarning` | Using deprecated API | LOW |

## Python Anti-Patterns

### Mutability Issues

```python
# ❌ MUTABLE CLASS ATTRIBUTE
class Service:
    cache = {}  # Shared across all instances

    def get(self, key):
        return self.cache.get(key)

# ✅ IMMUTABLE CLASS ATTRIBUTE
class Service:
    def __init__(self):
        self._cache = {}  # Per-instance
    
    @property
    def cache(self):
        return self._cache

# ❌ MUTABLE DEFAULT ARGUMENT
def add_item(item, items=[]):
    items.append(item)
    return items

# ✅ PROPER DEFAULT
def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items
```

### Exception Handling

```python
# ❌ BARE EXCEPT
try:
    do_something()
except:  # Catches everything including SystemExit
    pass

# ✅ SPECIFIC EXCEPTIONS
try:
    do_something()
except ValueError as e:
    logger.error(f"Invalid value: {e}")
except IOError as e:
    logger.error(f"IO error: {e}")

# ❌ RAISING STRINGS
if not valid:
    raise "Invalid input"

# ✅ RAISING EXCEPTIONS
if not valid:
    raise ValueError("Invalid input")

# ❌ SWALLOWING EXCEPTIONS
try:
    process(data)
except Exception:
    pass  # Silent failure

# ✅ PROPER ERROR HANDLING
try:
    process(data)
except Exception as e:
    logger.error(f"Processing failed: {e}")
    raise ProcessingError("Failed to process data") from e
```

### List Comprehension Issues

```python
# ❌ SIDE EFFECTS IN LIST COMPREHENSION
results = [expensive_calc(x) for x in items if expensive_filter(x)]

# ✅ CACHE OR USE GENERATOR
cached_filter = {x for x in items if expensive_filter(x)}
results = [expensive_calc(x) for x in cached_filter]

# ❌ NESTED LIST COMPREHENSION (hard to read)
matrix = [[i*j for j in range(5)] for i in range(5)]

# ✅ EXTRACTED FUNCTION
def create_row(i: int) -> list[int]:
    return [i*j for j in range(5)]

matrix = [create_row(i) for i in range(5)]
```

## Pythonic Code Review

### Idiomatic Python

```python
# ❌ UNPYTHONIC LOOP
for i in range(len(items)):
    print(items[i])

# ✅ PYTHONIC
for item in items:
    print(item)

# ❌ LIST EXTEND WITHOUT EXTEND
for item in new_items:
    items.append(item)

# ✅ EXTEND
items.extend(new_items)

# ❌ BUILDING STRINGS WITH +
result = ""
for item in items:
    result += str(item) + ", "

# ✅ JOIN
result = ", ".join(str(item) for item in items)

# ❌ CHECKING BOOLEAN WITH LENGTH
if len(items) > 0:
    do_something()

# ✅ DIRECT BOOLEAN CHECK
if items:
    do_something()
```

## FastAPI Specific Review

### Handler Patterns

```python
# ❌ BLOCKING DATABASE CALL
@router.post("/users")
async def create_user(user_data: UserCreate):
    user = blocking_db_insert(user_data)  # Blocks event loop
    return user

# ✅ ASYNC DATABASE CALL
@router.post("/users")
async def create_user(
    user_data: UserCreate,
    service: UserService = Depends(get_user_service)
):
    user = await service.create(user_data)
    return user

# ❌ NO VALIDATION
@router.post("/items")
async def create_item(data: dict):
    return db.insert(data)

# ✅ PYDANTIC VALIDATION
from pydantic import BaseModel

class ItemCreate(BaseModel):
    name: str
    price: float
    quantity: int = 0

@router.post("/items")
async def create_item(data: ItemCreate):
    return db.insert(data.model_dump())

# ❌ NO ERROR HANDLING
@router.get("/users/{user_id}")
async def get_user(user_id: str):
    return await db.get(user_id)

# ✅ PROPER ERROR HANDLING
from fastapi import HTTPException

@router.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await db.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

## pytest Review

### Test Quality

```python
# ❌ NO REAL ASSERTIONS
def test_user():
    user = create_user("test@example.com")
    get_user(user.id)
    # No assertion!

# ✅ MEANINGFUL ASSERTIONS
def test_user():
    user = create_user("test@example.com")
    fetched = get_user(user.id)
    assert fetched.email == "test@example.com"
    assert fetched.name == "Test User"

# ❌ TESTING IMPLEMENTATION
def test_user():
    assert len(user._cache) == 1  # Testing internals

# ✅ TESTING BEHAVIOR
def test_user_retrieved():
    user = create_user("test@example.com")
    fetched = get_user(user.id)
    assert fetched is not None

# ❌ SHARED MUTABLE STATE
class TestUser:
    user = create_user()  # Shared across tests

# ✅ CLEAN FIXTURES
@pytest.fixture
def test_user():
    return create_user("test@example.com")

def test_user_email(test_user):
    assert test_user.email == "test@example.com"
```

## File Patterns to Look For

```
✓ FOUND - Good Python Project Indicators:
├── pyproject.toml          # Modern Python package
├── src/                    # Src layout (recommended)
│   └── your_package/
├── tests/ or test/         # Test directory
├── conftest.py             # pytest fixtures
├── .python-version         # pyenv version
└── requirements*.txt       # Dependencies

✗ FOUND - Warning Signs:
├── __init__.py             # Empty init files
├── setup.py only           # No pyproject.toml
├── *.py files in root      # No src layout
├── test_*pyc*              # Test files in wrong place
└── venv/ or .venv/ in git  # Virtual env committed
```

## Lint Warnings to Flag

| Lint Rule | What It Catches | Severity |
|-----------|-----------------|----------|
| `E501` | Line too long (> 79/100) | MEDIUM |
| `F401` | Unused import | MEDIUM |
| `F841` | Unused variable | LOW |
| `W0611` | Unused import | LOW |
| `C0111` | Missing docstring | LOW |
| `R0913` | Too many arguments | MEDIUM |
| `R0914` | Too many local variables | MEDIUM |
| `R0915` | Too many statements | MEDIUM |
| `C0411` | Wrong import order | LOW |

## Common Python Code Smells

| Smell | Example | Fix |
|-------|---------|-----|
| God function | > 50 lines, many responsibilities | Split into smaller functions |
| Feature envy | Class accessing another class's data often | Move method to that class |
| Inappropriate intimacy | Two classes deeply coupled | Use interfaces, dependency injection |
| Refused bequest | Inheriting but overriding everything | Use composition instead |
| Data class abuse | Using dataclass for everything | Use regular class for logic |

## Review Checklist

### Before Review
- [ ] Identify Python version (check `pyproject.toml`, `.python-version`)
- [ ] Check for `src/` layout vs flat structure
- [ ] Review dependency management (pip vs poetry vs pipenv)

### Code Quality
- [ ] Type hints on all public functions
- [ ] No mutable default arguments
- [ ] Proper exception handling (no bare `except`)
- [ ] Async functions use async I/O, not blocking
- [ ] No `print()` statements in production code

### Testing
- [ ] Tests use pytest fixtures
- [ ] No `time.sleep()` in tests
- [ ] Tests are isolated (no shared state)
- [ ] Assertions are meaningful

### Performance
- [ ] No N+1 queries in ORM code
- [ ] Database connections use context managers
- [ ] Large datasets use generators/batching
- [ ] Proper index hints for slow queries

### Security
- [ ] No `eval()` or `exec()` with user input
- [ ] SQL uses parameterized queries (not string formatting)
- [ ] Secrets from environment, not hardcoded
- [ ] Input validation with Pydantic or equivalent
