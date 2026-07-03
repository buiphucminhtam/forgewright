---
name: eval-engineer
description: "Orchestrates prompt evaluation suites, model validation benchmarks, completion assertion scoring, and automated Quality Gate verification. Use when the user requests model accuracy reports, benchmark comparisons, automated prompt completions audits, or latency and token cost performance evaluations."
version: 1.0.0
---

# Eval Engineer (LITE)

## SOLVE Step 2: GROUND (Eval Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target model configurations and thinking level overrides are active | `cat .production-grade.yaml` | Identifies default models, thinking levels, and optimization parameters [1] | |
| Existing validation matrices, mock answers, or evaluation scripts are indexed | `find tests/ -name "*eval*" -o -name "*assert*" -o -name "*benchmark*"` | Identifies active testing logs, prompt templates, and evaluation datasets | |
| Standard feature specification and testing templates exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs [2] | |
| Active API expenditure parameter configs and cost ceilings are loaded | `cat .forgewright/budget.yaml` | Verifies current session spend parameters and warning thresholds [1, 3] | |

## SOLVE Step 3: DECOMPOSE (Eval Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate system prompts, model temperatures, and completion schema constraints | Verify parameters (e.g., Temperature 1.0 on Gemini) conform to API requirements [1].
2. BENCHMARK | Execute automated prompt assertion loops across multiple target model providers | Confirm that output completions pass semantic constraints and structured schema validators [4].
3. MEASURE | Analyze model completion latency, token counts, and API spend footprints | Verify model output metrics are logged under ~/.forgewright/usage/ and stay within budget rules [3, 5].
4. SYNC | Compile evaluation reports as lowercase kebab-case under docs/ and run sync hooks | Confirm file naming rules and run sync scripts to update the Shared Obsidian Vault [2, 6].

## Common Mistakes Checklist
- **Stripping Thought Signatures**: Removing or ignoring model-specific thought signatures during automated testing, causing unexpected API 400 errors [1].
- **No Validation Schema Assertions**: Trusting model outputs without running programmatic assertions or validation schema constraints, allowing structural hallucinations to slip through [7].
- **Parallel Thread API Throttling**: Running intensive, multi-worker prompt validation sweeps without implementing back-off delays, triggering API rate limit blocks.
- **Non-Compliant File Names**: Storing prompt evaluations, metric boards, or benchmark results under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/04-testing/EvalResults.md` instead of `docs/04-testing/eval-results-report.md`) [2].
- **Unverified Token Budgets on Large Matrices**: Initiating massive, multi-provider prompt evaluations without checking active spend ceilings inside `.forgewright/budget.yaml` [1, 3].

## Worked Example

### Step 1: Ground target project evaluation settings
```bash
cat .production-grade.yaml | grep -E "(gemini|thinking)" -A 2
cat .forgewright/budget.yaml
```
Output:
```yaml
gemini_optimization:
  default_model: "gemini-3.5-flash"
  thinking_level: "MINIMAL"
budget: 20.00
currency: USD
```

### Step 2: Run a secure prompt completion assertion in `tests/eval_prompt.py`
```python
import json

def calculate_quality_score(completion_text: str) -> dict:
    # Grounded Check: Ensure structured output holds valid JSON properties
    try:
        data = json.loads(completion_text)
        confidence = data.get("confidence", 0.0)
        has_citations = len(data.get("citations", [])) > 0
        
        # Scoring metrics mapping to standard Quality Gate (0-100)
        score = 0
        if confidence > 0.8:
            score += 50
        if has_citations:
            score += 50
            
        grade = "A" if score >= 90 else "B" if score >= 80 else "F"
        return {"score": score, "grade": grade, "status": "PASS" if score >= 90 else "FAIL"}
    except (json.JSONDecodeError, TypeError) as err:
        return {"score": 0, "grade": "F", "status": "FAIL", "error": str(err)}

# Validate mock output completion
print(calculate_quality_score('{"confidence": 0.95, "citations": ["[8]"]}'))
```

### Step 3: Run the prompt validator and check token usage metrics
```bash
python3 tests/eval_prompt.py
forge token status || cat ~/.forgewright/usage/summary.json
```
Output:
```
{'score': 100, 'grade': 'A', 'status': 'PASS'}
[INFO] Active project budget consumption: $0.08 / $20.00
[SUCCESS] Quality Gate passed cleanly with Grade A.
```

### Step 4: Write specifications and synchronize to the Shared Obsidian Vault
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/04-testing/eval-benchmark-spec.md
# Testing Spec: Prompt Completion Evaluation

## 1. Executive Summary
Provide a production-grade automated completion evaluation pipeline validating confidence and citation constraints.

## 2. Technical Profile
- Test Runner: Python 3.12 (with automated JSON validations)
- Target Model: Gemini 3.5 Flash
- Quality Gate: Enforced standard score bounds (0-100) and tracked API spend limits
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for eval-benchmark-spec.md.
[SUCCESS] Symlinked docs/04-testing/eval-benchmark-spec.md to /workspace/shared-obsidian-vault/forgewright/04-testing/eval-benchmark-spec.md.
```
