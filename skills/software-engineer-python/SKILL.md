---
name: software-engineer-python
extends: software-engineer
language: python
version: 1.0.0
author: forgewright
tags: [python, backend, api, services, clean-architecture, tdd]
file_patterns: ["*.py", "pyproject.toml", "setup.py", "requirements*.txt", "Pipfile", "poetry.lock"]
linter: pylint
linter_config: [pyproject.toml, setup.cfg, .pylintrc]
auto_route_priority: 10
---

# Python Software Engineer

> **Identity:** The implementation specialist for Python projects. You extend the base software-engineer skill with Python-specific patterns, idioms, and tooling.

## Routing

**Auto-route to this skill if project contains:**
- `*.py` files AND (`pyproject.toml` OR `requirements.txt` OR `Pipfile`)
- Priority: 10 (high)

## Python-Specific Patterns

### Type Hints (Python 3.9+)

```python
# Always use type hints
from __future__ import annotations  # Forward references without strings

def process_user(user_id: str) -> User | None:
    ...

# Protocol for duck typing
from typing import Protocol, runtime_checkable

@runtime_checkable
class UserRepository(Protocol):
    def get_by_id(self, user_id: str) -> User | None: ...
    def save(self, user: User) -> None: ...
```

### Async Patterns

```python
# Prefer asyncio for I/O-bound concurrency
import asyncio
from contextlib import asynccontextmanager

async def fetch_user(user_id: str) -> User:
    async with get_db_pool() as pool:
        return await pool.fetchone("SELECT * FROM users WHERE id = $1", user_id)

# Use asyncpg for async PostgreSQL
import asyncpg
from asyncpg import Pool

async def get_pool(dsn: str) -> Pool:
    return await asyncpg.create_pool(dsn, min_size=5, max_size=20)
```

### Dataclasses & Pydantic

```python
# Prefer dataclasses for simple DTOs
from dataclasses import dataclass, field

@dataclass
class User:
    id: str
    email: str
    name: str
    roles: list[str] = field(default_factory=list)
    tenant_id: str = ""

# Use Pydantic for validated models (API requests/responses)
from pydantic import BaseModel, EmailStr, field_validator

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
```

### Error Handling

```python
# Custom exceptions hierarchy
class AppError(Exception):
    """Base exception for all application errors."""
    def __init__(self, message: str, code: str = "APP_ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)

class ValidationError(AppError):
    """Raised when input validation fails."""
    def __init__(self, message: str):
        super().__init__(message, code="VALIDATION_ERROR")

class NotFoundError(AppError):
    """Raised when a resource is not found."""
    def __init__(self, resource: str, resource_id: str):
        super().__init__(f"{resource} {resource_id} not found", code="NOT_FOUND")

# Result type pattern
from typing import TypeVar, Generic
from dataclasses import dataclass

T = TypeVar("T")
E = TypeVar("E", bound=Exception)

@dataclass
class Ok(Generic[T]):
    value: T

@dataclass
class Err(Generic[E]):
    error: E

Result = Ok[T] | Err[E]

async def get_user(user_id: str) -> Result[User, NotFoundError]:
    user = await db.fetch_one("SELECT * FROM users WHERE id = $1", user_id)
    if not user:
        return Err(NotFoundError("User", user_id))
    return Ok(User(**user))
```

## Python-Specific Error Patterns

### High Priority

| Error Pattern | Likely Cause | Fix |
|--------------|--------------|-----|
| `TypeError: 'NoneType' object is not iterable` | Missing null check before iteration | Check `if items is not None:` |
| `TypeError: 'NoneType' object has no attribute 'xxx'` | Optional chain missing | Use `?.` or check `is not None` |
| `ImportError: cannot import name 'xxx' from 'yyy'` | Circular import or missing dependency | Check `__init__.py`, dependency |
| `IndentationError` | Mixed tabs/spaces or incorrect indent | Run `python -m py_compile` |
| `AttributeError: 'NoneType' object has no attribute` | Function returning None unexpectedly | Add explicit `return None` check |

### Medium Priority

| Error Pattern | Likely Cause | Fix |
|--------------|--------------|-----|
| `ValueError: No JSON object could be decoded` | Invalid JSON string | Validate with `json.loads()` first |
| `KeyError: 'xxx'` | Missing dict key | Use `.get('xxx', default)` |
| `IndexError: list index out of range` | Empty list or wrong index | Check `len(list) > index` |
| `NameError: name 'xxx' is not defined` | Typo or missing import | Check spelling, imports |
| `RecursionError: maximum recursion depth exceeded` | Infinite recursion | Check base case in recursive function |

## Code Structure

### Standard Layout

```
src/
├── __init__.py
├── main.py              # Entry point
├── config.py            # Settings (pydantic-settings)
├── models/              # Domain models (dataclasses/pydantic)
├── schemas/             # API schemas
├── services/            # Business logic
├── repositories/        # Data access
├── handlers/            # HTTP handlers (FastAPI/Starlette)
├── middleware/         # Custom middleware
└── utils/               # Helper functions
tests/
├── __init__.py
├── conftest.py          # pytest fixtures
├── unit/
├── integration/
└── fixtures/
pyproject.toml
```

### FastAPI Pattern

```python
# handlers/user.py
from fastapi import APIRouter, Depends, HTTPException, status

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=User, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    service: UserService = Depends(get_user_service)
) -> User:
    result = await service.create(user_data)
    match result:
        case Ok(value=user):
            return user
        case Err(error=ValidationError() as e):
            raise HTTPException(status_code=400, detail=e.message)

# main.py
from fastapi import FastAPI

app = FastAPI(title="My API", version="1.0.0")
app.include_router(user.router)
```

### CLI with Click

```python
# cli.py
import click
from dataclasses import dataclass

@dataclass
class CLIContext:
    verbose: bool
    config_path: str

@click.group()
@click.option("--verbose", "-v", is_flag=True)
@click.option("--config", "-c", default="config.toml")
@click.pass_context
def cli(ctx: click.Context, verbose: bool, config: str) -> None:
    ctx.obj = CLIContext(verbose=verbose, config_path=config)

@cli.command()
@click.argument("user_id")
@click.pass_context
def get_user(ctx: click.Context, user_id: str) -> None:
    """Get user by ID."""
    service = UserService(ctx.obj.config_path)
    user = asyncio.run(service.get_user(user_id))
    click.echo(f"User: {user.name} <{user.email}>")
```

## Testing Patterns

### pytest Fixtures

```python
# conftest.py
import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from main import app

@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client

@pytest.fixture
def mock_user():
    return User(id="123", email="test@example.com", name="Test User")

# tests/test_user.py
async def test_create_user(client: AsyncClient, mock_user: User):
    response = await client.post("/users/", json={
        "email": mock_user.email,
        "name": mock_user.name,
        "password": "secure123"
    })
    assert response.status_code == 201
    assert response.json()["email"] == mock_user.email
```

### Mocking

```python
from unittest.mock import AsyncMock, patch
import pytest

@pytest.fixture
def mock_repo():
    repo = AsyncMock(spec=UserRepository)
    repo.get_by_id.return_value = User(id="1", email="test@example.com", name="Test")
    return repo

async def test_get_user_service(mock_repo: UserRepository):
    service = UserService(mock_repo)
    result = await service.get_user("1")
    
    assert isinstance(result, Ok)
    assert result.value.email == "test@example.com"
    mock_repo.get_by_id.assert_called_once_with("1")
```

## Lint Configuration

### pylint

```toml
# pyproject.toml
[tool.pylint.messages_control]
max-line-length = 100
disable = ["C0111", "R0903"]  # Missing docstring, Too many public methods

[tool.pylint.format]
max-line-length = 100
```

### ruff (Recommended - Faster)

```toml
# pyproject.toml
[tool.ruff]
line-length = 100
target-version = "py39"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP", "S", "B", "A", "C4", "DTZ", "T10", "ISC"]
ignore = ["S101"]  # assert (use in tests only)

[tool.ruff.lint.per-file-ignores]
"__init__.py" = ["F401"]  # Unused imports OK in __init__
```

### mypy

```toml
# pyproject.toml
[tool.mypy]
python_version = "3.9"
strict = true
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["tests.*"]
disallow_untyped_defs = false
```

## Virtual Environment & Dependencies

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
.venv\Scripts\activate     # Windows

# Install dependencies
pip install -e .           # Editable install
pip install -e ".[dev]"    # With dev dependencies

# Lock dependencies
pip-compile pyproject.toml --output-file requirements.txt
pip-compile pyproject.toml --dev --output-file requirements-dev.txt
```

## Common Pitfalls

| Pitfall | Prevention |
|---------|-----------|
| Mutable default arguments | Use `None` + `field(default_factory=...)` |
| Class-level list/dict attributes | Define in `__init__` or use `@classmethod` |
| Late binding in closures | Use `defaultdict(lambda: ...)` or `functools.partial` |
| Not closing database connections | Use `async with` context managers |
| Blocking I/O in async code | Use `asyncio.to_thread()` for sync I/O |
| Missing `await` | Enable `pylint` rule `yield-point-check` |

## Execution Checklist (Python-Specific)

- [ ] Type hints on all function signatures
- [ ] Pydantic/dataclass for validated models
- [ ] Async for I/O-bound operations (use `asyncpg`, `aiomysql`)
- [ ] pytest fixtures in `conftest.py`
- [ ] `__init__.py` exports using `__all__`
- [ ] Virtual environment documented
- [ ] Lock file committed (`poetry.lock` or `requirements.txt`)
- [ ] No `print()` statements (use `logging`)
- [ ] Sensitive config via environment variables (use `pydantic-settings`)
- [ ] Tests use `pytest` with async support (`pytest-asyncio`)
