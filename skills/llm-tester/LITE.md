---
name: llm-tester
description: "Orchestrates automated evaluation of LLM prompt completions, model response assertions, output schema validations, and token cost tracking. Use when the user requests model evaluation suites, prompt regression tests, JSON response verification, or cost-safety audits."
version: 1.0.0
---

# Llm Tester (LITE)

## SOLVE Step 2: GROUND (Llm Tester Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target model configurations and API provider bindings are defined | `cat .production-grade.yaml` | Identifies active models (e.g., Gemini, Claude) and thinking level parameters | |
| Existing prompt test cases, mock responses, or assertion files are indexed | `find tests/ -name "*test-llm*" -o -name "*assert*"` | Identifies active test scripts and mock response profiles | |
| Standardized product templates and test guidelines exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional specs and acceptance criteria | |
| Active API expenditure limit rules and token trackers are configured | `cat .forgewright/budget.yaml` | Verifies current session spend parameters and warning thresholds | |

## SOLVE Step 3: DECOMPOSE (Llm Tester Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate system prompts, model temperature overrides, and output schema assertions | Ensure temperature limits (e.g., 1.0 for Gemini) and JSON schema formats are structurally compliant.
2. COMPILE | Execute automated unit and integration assertion loops on target prompt interfaces | Verify that model outputs adhere to schema structures and pass semantic safety constraints.
3. PROFILE | Evaluate token overhead, API execution latency, and session cost metrics | Confirm that token footprints are tracked via `.forgewright/usage/` logs and stay under budget bounds.
4. SYNC | Compile LLM test audit records and synchronize reports with the Shared Obsidian Vault | Verify file name compliance (lowercase kebab-case) and run post-skill sync scripts.

## Common Mistakes Checklist
- **Temperature & Thought Signature Mismatch**: Overriding temperature configurations away from model-specific bounds (like 1.0 on Gemini) or stripping Thought Signatures, triggering unexpected API 400 errors.
- **Bypassing Output Schema Assertions**: Trusting that the LLM will return perfectly formed JSON structures without implementing rigorous validation gates, causing parsing crashes.
- **Ignoring Token Budget Safety Rails**: Executing massive, high-frequency prompt validation loops without checking active spending limits inside `.forgewright/budget.yaml`.
- **Non-Compliant File Names**: Storing prompt evaluations, benchmark results, or review notes under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/04-testing/LLMTesterResult.md` instead of `docs/04-testing/llm-tester-result.md`).
- **Context Window Exhaustion**: Feeding full raw API responses or massive trace outputs back into the model context instead of summarizing or utilizing Context Offload mechanisms.

## Worked Example

### Step 1: Ground target model settings and token budget tracking status
```bash
cat .production-grade.yaml | grep -E "(gemini|thinking)" -A 2
cat .forgewright/budget.yaml
```
Output:
```yaml
gemini_optimization:
  default_model: "gemini-3.5-flash"
  thinking_level: "MINIMAL"
budget: 10.00
currency: USD
```

### Step 2: Implement an automated model response schema validator in `tests/validate_completion.py`
```python
import json
from jsonschema import validate, ValidationError

# Grounded schema asserting that agent outputs must contain a structured decision
SCHEMA_DECISION = {
    "type": "object",
    "properties": {
        "decision": {"type": "string"},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "reasoning": {"type": "string"}
    },
    "required": ["decision", "confidence", "reasoning"]
}

def verify_model_completion(raw_completion: str) -> bool:
    try:
        data = json.loads(raw_completion)
        validate(instance=data, schema=SCHEMA_DECISION)
        print("[SUCCESS] Completion schema matches production-grade validation criteria.")
        return True
    except (json.JSONDecodeError, ValidationError) as err:
        print(f"[FAIL] Schema validation error: {err}")
        return False

# Mock check
verify_model_completion('{"decision": "PROCEED", "confidence": 0.95, "reasoning": "Passes Quality Gate"}')
```

### Step 3: Run the validation script and check token usage metrics
```bash
python3 tests/validate_completion.py
forge token status || cat ~/.forgewright/usage/summary.json
```
Output:
```
[SUCCESS] Completion schema matches production-grade validation criteria.
[INFO] Active project budget consumption: $0.15 / $10.00
[SUCCESS] 0 over-budget violations detected.
```

### Step 4: Write testing specifications and synchronize to the Shared Obsidian Vault
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/04-testing/llm-assertion-report.md
# Testing Spec: LLM Completion Assertion Audit

## 1. Executive Summary
Provide a production-grade validation pipeline for testing LLM prompt output schemas.

## 2. Technical Profile
- Test Runner: Python 3.12 (with jsonschema verification)
- Validated Model: Gemini 3.5 Flash (with minimal thinking level)
- Performance Safety: Evaluated response schemas and tracked API token expenditure in real-time.
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for llm-assertion-report.md.
[SUCCESS] Symlinked docs/04-testing/llm-assertion-report.md to /workspace/shared-obsidian-vault/forgewright/04-testing/llm-assertion-report.md.
```
