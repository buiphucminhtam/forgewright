---
name: eval-engineer
description: "Orchestrates prompt evaluation suites, model validation benchmarks, completion assertion scoring, and automated Quality Gate verification. Use when the user requests model accuracy reports, benchmark comparisons, automated prompt completions audits, or latency and token cost performance evaluations."
version: 1.0.0
---

# Eval Engineer (LITE)

## SOLVE Step 2: GROUND (Eval Engineer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Target model configurations and thinking level overrides are active | `cat .production-grade.yaml` | ... | Verified `Target model configurations and thinking` facts from inspected file/command output |
| Existing validation matrices, mock answers, or evaluation scripts are indexed | `find tests/ -name "*eval*" -o -name "*assert*" -o -name "*benchmark*"` | ... | Observed command exit code & stdout confirming existing validation matrices, mock answers, |

## SOLVE Step 3: DECOMPOSE (Eval Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate prompts, active model/runtime parameters, and completion schema constraints | Verify parameters from current provider/runtime configuration and executable schema checks.
2. BENCHMARK | Execute automated prompt assertion loops across multiple target model providers | Confirm that output completions pass semantic constraints and structured schema validators.
3. MEASURE | Analyze model completion latency, token counts, and API spend footprints | Verify model output metrics are logged under ~/.forgewright/usage/ and stay within budget rules.

## Common Mistakes Checklist
- **Breaking provider-native payloads**: Removing provider-required fields during automated testing without verifying the current runtime contract.
- **No Validation Schema Assertions**: Trusting model outputs without running programmatic assertions or validation schema constraints, allowing structural hallucinations to slip through.
- **Parallel Thread API Throttling**: Running intensive, multi-worker prompt validation sweeps without implementing back-off delays, triggering API rate limit blocks.
- **Non-Compliant File Names**: Storing prompt evaluations, metric boards, or benchmark results under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/04-testing/EvalResults.md` instead of `docs/04-testing/eval-results-report.md`).

### Step 1: Ground target project evaluation settings
```bash
cat .production-grade.yaml
cat .forgewright/budget.yaml
```

### Step 2: Check a curated exact-answer fixture in `tests/eval_prompt.py`

This narrow example checks an independent expected answer and permitted source IDs. A model confidence field cannot certify correctness. Missing oracle is `UNVERIFIED`; general answers and citation entailment need a task-specific grader. See [evaluation guidance](https://platform.openai.com/docs/guides/evaluation-best-practices).
```python
import json

def calculate_quality_score(
    completion_text: str,
    expected_answer: str | None = None,
    allowed_citations: set[str] | None = None,
) -> dict:
    # Toy exact-answer fixture: the curator supplies the oracle, never the model.
    failure = {"score": 0, "grade": "F", "status": "FAIL"}
    try:
        data = json.loads(completion_text)
    except (json.JSONDecodeError, TypeError):
        return failure
    if not isinstance(data, dict):
        return failure
    answer, citations = data.get("answer"), data.get("citations")
    if not isinstance(answer, str) or not answer.strip():
        return failure
    if not isinstance(citations, list) or not citations or any(
        not isinstance(citation, str) or not citation.strip() for citation in citations
    ):
        return failure
    if expected_answer is None or allowed_citations is None:
        return {"score": None, "grade": None, "status": "UNVERIFIED"}
    correct = answer == expected_answer and all(
        citation in allowed_citations for citation in citations
    )
    return {"score": 100, "grade": "A", "status": "PASS"} if correct else failure

# This schema check is not factuality or source-entailment evaluation.
print(calculate_quality_score('{"answer": "Paris", "citations": ["source-france"]}'))
```

### Step 3: Run the prompt validator and check token usage metrics
```bash
python3 tests/eval_prompt.py
forge token status || cat ~/.forgewright/usage/summary.json
```
