---
name: software-engineer-python
description: "Orchestrates Python software design, backend API development, data processing engines, concurrent task orchestration, and production library packaging. Use when the user requests Python feature implementations, Flask/FastAPI/Django endpoints, automated scripts, or concurrent/asynchronous execution structures using asyncio or multiprocessing."
version: 1.0.0
---

# Software Engineer Python (LITE)

## SOLVE Step 2: GROUND (Software Engineer Python Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Python environment, dependencies, and modules are defined | `cat requirements.txt \|\| cat pyproject.toml \|\| cat setup.cfg` | ... | Y/N |
| GitNexus symbol index and call graphs are present and initialized [3, 4] | `gitnexus analyze --status \|\| find . -name \"*.gitnexus\"` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Software Engineer Python Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. IMPACT | Analyze symbol blast-radius and upstream dependency impacts via GitNexus | Warn the user if the impact analysis returns a HIGH or CRITICAL risk level.
2. IMPLEMENT | Author modular Python classes, function routines, and type annotations | Ensure code adheres strictly to PEP 8, implements context managers, and has zero hardcoded credentials.
3. STRESS-TEST | Execute property-based (Hypothesis) and mutation tests (mutmut) | Confirm the testing suite passes cleanly and the code quality score achieves Grade A (>90) [9, 10].
4. SYNC | Save specifications as lowercase kebab-case under docs/ and run sync hooks [5, 11] | Confirm file name compliance and run post-skill sync to update the Shared Obsidian Vault.

## Common Mistakes Checklist
- **Mutable Default Parameters**: Using mutable structures as defaults (e.g., `def append(item, container=[])`) leading to shared reference leaks across calls.
- **Unmanaged File/Socket Handles**: Neglecting to wrap stream access and remote connections within explicit context managers (`with`), triggering OS resource leaks.
- **Silent Exception Swallowing**: Implementing broad, non-specific try-except blocks (e.g., `except Exception: pass`) that mask critical runtime exceptions or traceback logs.
- **Modifying High-Risk Symbols Directly**: Modifying shared interfaces without first evaluating upstream impact metrics via GitNexus symbol diagnostics (`gitnexus_impact`).
- **Non-Compliant Resource Directories**: Saving design documents, API specifications, or logs under `docs/` using CamelCase instead of lowercase kebab-case.

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground target project settings and environment engine
```bash
cat requirements.txt
gitnexus analyze --status
```

### Step 2: Perform GitNexus impact check before modifying the core processor
```bash
gitnexus_impact --target "DataExporter" --direction "upstream"
```

### Step 3: Implement memory-safe, exception-robust Python processor class in `src/services/data_exporter.py`
```python
from typing import List, Optional
import json

class DataExporter:
    # Corrected: Enforcing default-safe None reference to prevent mutable state leaks
    def __init__(self, default_metadata: Optional[dict] = None) -> None:
        self.metadata: dict = default_metadata if default_metadata is not None else {}

    # Corrected: Utilizing explicit context manager (with) to guarantee file closures
    def export_records_json(self, filepath: str, records: List[dict]) -> bool:
        if not records:
            return False
            
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump({"metadata": self.metadata, "data": records}, f, indent=2)
            return True
        except IOError as err:
            # Corrected: Capture and log explicit exception contexts defensively
            print(f"Error: Failed to write to {filepath}. Details: {err}")
            raise
```

### Step 4: Run unit tests and calculate the Quality Gate Score
```bash
pytest -v tests/test_data_exporter.py
```

