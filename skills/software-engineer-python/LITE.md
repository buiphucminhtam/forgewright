---
name: software-engineer-python
description: "Orchestrates Python software design, backend API development, data processing engines, concurrent task orchestration, and production library packaging. Use when the user requests Python feature implementations, Flask/FastAPI/Django endpoints, automated scripts, or concurrent/asynchronous execution structures using asyncio or multiprocessing."
version: 1.0.0
---

# Software Engineer Python (LITE)

## SOLVE Step 2: GROUND (Software Engineer Python Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Python environment, dependencies, and modules are defined [1] | `cat requirements.txt \|\| cat pyproject.toml \|\| cat setup.cfg` | Identifies active dependency manifests, setup rules, and lock files [1, 2] | |
| GitNexus symbol index and call graphs are present and initialized [3, 4] | `gitnexus analyze --status \|\| find . -name \"*.gitnexus\"` | Confirms GitNexus database readiness for structural queries [3] | |
| Standard feature specification and design templates exist [5] | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional specs and acceptance criteria [5] | |
| Active API expenditure parameters and cost ceilings are configured [6, 7] | `cat .forgewright/budget.yaml` | Verifies current session spend limits and warning thresholds [7] | |

## SOLVE Step 3: DECOMPOSE (Software Engineer Python Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. IMPACT | Analyze symbol blast-radius and upstream dependency impacts via GitNexus [4] | Warn the user if the impact analysis returns a HIGH or CRITICAL risk level [4].
2. IMPLEMENT | Author modular Python classes, function routines, and type annotations [1] | Ensure code adheres strictly to PEP 8, implements context managers, and has zero hardcoded credentials [8].
3. STRESS-TEST | Execute property-based (Hypothesis) and mutation tests (mutmut) [9] | Confirm the testing suite passes cleanly and the code quality score achieves Grade A (>90) [9, 10].
4. SYNC | Save specifications as lowercase kebab-case under docs/ and run sync hooks [5, 11] | Confirm file name compliance and run post-skill sync to update the Shared Obsidian Vault [11].

## Common Mistakes Checklist
- **Mutable Default Parameters**: Using mutable structures as defaults (e.g., `def append(item, container=[])`) leading to shared reference leaks across calls.
- **Unmanaged File/Socket Handles**: Neglecting to wrap stream access and remote connections within explicit context managers (`with`), triggering OS resource leaks.
- **Silent Exception Swallowing**: Implementing broad, non-specific try-except blocks (e.g., `except Exception: pass`) that mask critical runtime exceptions or traceback logs.
- **Modifying High-Risk Symbols Directly**: Modifying shared interfaces without first evaluating upstream impact metrics via GitNexus symbol diagnostics (`gitnexus_impact`) [4].
- **Non-Compliant Resource Directories**: Saving design documents, API specifications, or logs under `docs/` using CamelCase instead of lowercase kebab-case [5].

## Worked Example

### Step 1: Ground target project settings and environment engine
```bash
cat requirements.txt
gitnexus analyze --status
```
Output:
```
pytest>=8.0.0
hypothesis>=6.90.0
mutmut>=2.4.0
[SUCCESS] GitNexus database index is fresh (20,138 symbols, 28,557 relationships).
```

### Step 2: Perform GitNexus impact check before modifying the core processor
```bash
gitnexus_impact --target "DataExporter" --direction "upstream"
```
Output:
```
[INFO] Querying symbol graph database...
[INFO] "DataExporter" is imported by 2 files.
[SUCCESS] Blast Radius Risk Level: LOW (Low risk changes permitted)
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
            print(f"[ERROR] Failed to write to {filepath}. Details: {err}")
            raise
```

### Step 4: Run unit tests and calculate the Quality Gate Score
```bash
pytest -v tests/test_data_exporter.py
```
Output:
```
============================= test session starts ==============================
collected 2 items

tests/test_data_exporter.py::test_export_success PASSED                  [ 50%]
tests/test_data_exporter.py::test_empty_records PASSED                   [100%]

============================== 2 passed in 0.12s ===============================
[SUCCESS] Code Quality score: 95/100 (Grade A - Production Ready).
```

### Step 5: Document implementation specifications and trigger live sync
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/01-product/data-export-specification.md
# Feature: Safe Python JSON Data Exporter

## 1. Executive Summary
Provide a safe, memory-robust data export module for serializing records into local file stores.

## 2. Technical Profile
- Language: Python 3.12
- Testing: Automated assertions with verified context manager safety gates
- Performance: O(N) execution bound with explicit exceptions handling
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for data-export-specification.md.
[SUCCESS] Symlinked docs/01-product/data-export-specification.md to /workspace/shared-obsidian-vault/forgewright/01-product/data-export-specification.md.
```
