---
name: code-reviewer-python
description: "Orchestrates static analysis, type checking, error-handling validation, and testing audits for Python codebases. Use when the user requests Python code reviews, mypy/ruff checks, pytest/hypothesis test validations, or memory/resource leak analysis."
version: 1.0.0
---

# Code Reviewer Python (LITE)

## SOLVE Step 2: GROUND (Code Reviewer Python Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Python environment, dependencies, and modules are defined | `cat requirements.txt \|\| cat pyproject.toml \|\| cat setup.cfg` | Identifies active dependency manifests, setup rules, and lock files | |
| Static analysis and formatting packages are configured | `cat pyproject.toml \| grep -E \"(ruff\|mypy\|black\|flake8\|bandit)\"` | Confirms active linting, type checking, and formatting tool configurations | |
| Standardized product requirements and feature specs are loaded | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Ensures design specifications conform to the standard layout format | |
| Active API expenditure parameters and cost ceilings are configured | `cat .forgewright/budget.yaml` | Verifies current session spend threshold rules and ceilings | |

## SOLVE Step 3: DECOMPOSE (Code Reviewer Python Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Run static analysis checkers, linters, and type checkers on Python modules | Ensure `ruff check`, `black --check`, and `mypy` return zero syntax, style, or type-safety warnings.
2. VERIFY | Review error handling patterns, exception contexts, and resource cleanups | Ensure all file or socket handles utilize context managers (`with`) and exception boundaries avoid silent passes.
3. TEST | Validate module behaviors using property-based (Hypothesis) and mutation tests | Verify that test suites pass cleanly via `pytest` and mutation scores meet configured Quality Gate criteria.
4. SYNC | Compile review report and run the post-skill sync hook to save to Obsidian | Verify file name compliance (lowercase kebab-case) and establish absolute symlinks to the Shared Obsidian Vault.

## Common Mistakes Checklist
- **Mutable Default Arguments**: Specifying mutable collections (e.g., `def append_to(element, target=[])`) as default parameter values, causing state leaks and shared references across subsequent calls.
- **Silent Exception Masking**: Implementing broad, unlogged try-except blocks (e.g., `except Exception: pass`) that catch and mask critical system failures like KeyboardInterrupt or memory errors.
- **Missing or Incomplete Context Managers**: Failing to open file systems, databases, or process stream handles within safe context managers (`with`), triggering unmanaged resource leaks on execution crashes.
- **Dynamic Class Binding and Local Symbol Pollution**: Polluting namespace scopes using raw wildcard imports (e.g., `from module import *`) instead of explicit references, complicating symbols resolution.
- **Non-Compliant Documentation Layout**: Saving Python review logs, guidelines, or analysis ADRs under `docs/` using CamelCase, spaces, or uppercase characters instead of strictly lowercase kebab-case.

## Worked Example

### Step 1: Ground active python workspace configurations
```bash
cat requirements.txt
python3 --version
```
Output:
```
ruff>=0.3.0
mypy>=1.9.0
pytest>=8.0.0
Python 3.12.2
```

### Step 2: Review Python service class `src/services/data_processor.py` for common issues
```python
from typing import List, Optional

class DataProcessor:
    # Corrected: Enforcing default-safe None reference to prevent mutable state leaks
    def __init__(self, default_tags: Optional[List[str]] = None) -> None:
        self.tags: List[str] = default_tags if default_tags is not None else []

    # Corrected: Utilizing explicit context manager (with) to guarantee file closures
    def load_records(self, filepath: str) -> List[str]:
        records: List[str] = []
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                for line in f:
                    records.append(line.strip())
        except FileNotFoundError as err:
            # Corrected: Avoided broad 'except Exception: pass', capturing and logging explicitly
            print(f"[ERROR] Target file not found: {filepath}. Details: {err}")
            raise
        return records
```

### Step 3: Execute the static analysis, type checking, and unit testing runs
```bash
ruff check src/services/data_processor.py
mypy --strict src/services/data_processor.py
pytest -v tests/test_data_processor.py
```
Output:
```
[INFO] Running Ruff static analysis...
All checks passed!

[INFO] Running Mypy strict type checking...
Success: no issues found in 1 source file

[INFO] Running unit tests...
=== RUN   tests/test_data_processor.py
--- PASS: test_load_records (0.02s)
PASS
```

### Step 4: Write compliant report logs and synchronize to the Shared Obsidian Vault
```bash
cat << 'EOF' > docs/04-testing/python-review-audit.md
# Python Code Review & Audit Log

## 1. Executive Summary
Conducted static analysis, strict type checking, and memory-safety reviews on the core data processor.

## 2. Technical Profile
- Linter: Ruff (PASS)
- Type Checker: Mypy Strict (PASS)
- Resource Safety: Context managers verified for all file descriptors
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for python-review-audit.md.
[SUCCESS] Symlinked docs/04-testing/python-review-audit.md to /workspace/shared-obsidian-vault/forgewright/04-testing/python-review-audit.md.
```
