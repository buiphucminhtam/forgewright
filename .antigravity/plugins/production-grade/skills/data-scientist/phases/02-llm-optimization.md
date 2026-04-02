# Phase 2: LLM/AI Optimization

## Objective

Optimize LLM usage for cost, quality, and latency. Produce real, deployable artifacts — not recommendations without implementation.

## Context Bridge

Read Phase 1 audit from `analysis/system-audit.md` and `analysis/optimization-opportunities.md` for identified optimization targets and current baselines.

## Workflow

### Step 1: Prompt Optimization

For each LLM-powered feature identified in Phase 1:

**a. Baseline the current prompt:**

```markdown
<!-- prompt-library/<feature>/prompt-v1.md -->
# [Feature] — Prompt v1 (Baseline)

**Model:** [model name]
**Temperature:** [value]
**Max Tokens:** [value]
**Avg Input Tokens:** [count]
**Avg Output Tokens:** [count]
**Avg Latency:** [ms]
**Avg Cost Per Call:** $[amount]
**Quality Score:** [methodology and score]

## System Prompt
```
[exact current system prompt]
```

## User Prompt Template
```
[exact current user prompt template with {{variables}}]
```

## Example Input/Output
**Input:** [example]
**Output:** [example]
**Quality Assessment:** [rubric-based evaluation]
```

**b. Create optimized prompt:**
- Reduce token count while maintaining quality
- Techniques: instruction compression, example pruning, structured output formats, XML/JSON tags for parsing, few-shot to zero-shot where possible
- Consider model downgrade opportunities (e.g., GPT-4 to GPT-3.5 for simple tasks)

**c. Document comparison:**

```markdown
<!-- prompt-library/<feature>/comparison.md -->
# [Feature] — Prompt Comparison

| Metric | v1 (Baseline) | v2 (Optimized) | Delta |
|--------|---------------|----------------|-------|
| Input Tokens | 1,200 | 680 | -43% |
| Output Tokens | 450 | 380 | -16% |
| Cost/Call | $0.045 | $0.022 | -51% |
| Latency (p50) | 2.1s | 1.4s | -33% |
| Quality Score | 8.2/10 | 8.4/10 | +2.4% |

## Changes Made
1. [Change 1 with rationale]
2. [Change 2 with rationale]

## Recommended Action
[Deploy v2 / Run A/B test / Further optimize]
```

### Step 2: Token Optimization Study

Produce `llm-optimization/token-analysis.md` with:
- Token budget analysis per feature
- Input token reduction strategies (context window optimization, dynamic context selection)
- Output token control (structured output, max_tokens tuning, stop sequences)
- Tokenizer-specific optimizations (e.g., tiktoken encoding awareness)

Include implementation code:

```python
# token_optimizer.py — Production token optimization utilities

import tiktoken
from typing import Dict, List, Optional
from dataclasses import dataclass

@dataclass
class TokenBudget:
    feature: str
    model: str
    max_input: int
    max_output: int
    target_input: int
    target_output: int
    current_avg_input: float
    current_avg_output: float

class TokenOptimizer:
    def __init__(self, model: str = "gpt-4"):
        self.encoder = tiktoken.encoding_for_model(model)

    def count_tokens(self, text: str) -> int:
        return len(self.encoder.encode(text))

    def truncate_to_budget(self, text: str, max_tokens: int,
                           strategy: str = "tail") -> str:
        tokens = self.encoder.encode(text)
        if len(tokens) <= max_tokens:
            return text
        if strategy == "tail":
            return self.encoder.decode(tokens[-max_tokens:])
        elif strategy == "head":
            return self.encoder.decode(tokens[:max_tokens])
        elif strategy == "middle_out":
            head = max_tokens // 3
            tail = max_tokens - head
            return (self.encoder.decode(tokens[:head]) +
                    "\n...[truncated]...\n" +
                    self.encoder.decode(tokens[-tail:]))
        raise ValueError(f"Unknown strategy: {strategy}")

    def analyze_prompt_tokens(self, system: str, user_template: str,
                               examples: List[str]) -> Dict:
        sys_tokens = self.count_tokens(system)
        template_tokens = self.count_tokens(user_template)
        example_tokens = [self.count_tokens(e) for e in examples]
        return {
            "system_prompt_tokens": sys_tokens,
            "user_template_tokens": template_tokens,
            "avg_example_tokens": sum(example_tokens) / max(len(example_tokens), 1),
            "total_fixed_tokens": sys_tokens + template_tokens,
            "optimization_targets": self._identify_targets(
                sys_tokens, template_tokens, example_tokens
            )
        }

    def _identify_targets(self, sys_tokens, template_tokens, example_tokens):
        targets = []
        if sys_tokens > 500:
            targets.append({
                "component": "system_prompt",
                "current": sys_tokens,
                "recommendation": "Compress system prompt — consider structured instructions",
                "potential_reduction": f"{int(sys_tokens * 0.3)}-{int(sys_tokens * 0.5)} tokens"
            })
        if example_tokens and max(example_tokens) > 200:
            targets.append({
                "component": "examples",
                "current": sum(example_tokens),
                "recommendation": "Reduce few-shot examples or switch to zero-shot",
                "potential_reduction": f"{sum(example_tokens)} tokens (remove all examples)"
            })
        return targets
```

### Step 3: Caching Strategy

Produce `llm-optimization/caching-strategy.md` with architecture AND implementation:

```python
# llm_cache.py — Semantic caching layer for LLM API calls

import hashlib
import json
import time
from typing import Optional, Dict, Any
from dataclasses import dataclass, field

@dataclass
class CacheEntry:
    key: str
    response: Dict[str, Any]
    model: str
    tokens_saved_input: int
    tokens_saved_output: int
    created_at: float = field(default_factory=time.time)
    hit_count: int = 0
    ttl: int = 3600  # seconds

    @property
    def is_expired(self) -> bool:
        return (time.time() - self.created_at) > self.ttl

    @property
    def cost_saved(self) -> float:
        rates = {
            "gpt-4": {"input": 0.03 / 1000, "output": 0.06 / 1000},
            "gpt-4-turbo": {"input": 0.01 / 1000, "output": 0.03 / 1000},
            "gpt-3.5-turbo": {"input": 0.0005 / 1000, "output": 0.0015 / 1000},
            "claude-3-opus": {"input": 0.015 / 1000, "output": 0.075 / 1000},
            "claude-3-sonnet": {"input": 0.003 / 1000, "output": 0.015 / 1000},
        }
        rate = rates.get(self.model, {"input": 0.01 / 1000, "output": 0.03 / 1000})
        return (
            self.tokens_saved_input * rate["input"] +
            self.tokens_saved_output * rate["output"]
        ) * self.hit_count


class LLMCacheLayer:
    """
    Multi-tier caching for LLM API calls.

    Tier 1: Exact match (hash of normalized prompt)
    Tier 2: Semantic similarity (embedding-based, optional)
    Tier 3: Template match (same template, similar variables)
    """

    def __init__(self, backend="redis", semantic_threshold=0.95):
        self.backend = backend
        self.semantic_threshold = semantic_threshold
        self._exact_cache: Dict[str, CacheEntry] = {}
        self._stats = {"hits": 0, "misses": 0, "evictions": 0}

    def _make_key(self, model: str, messages: list,
                  temperature: float, **kwargs) -> str:
        normalized = {
            "model": model,
            "messages": [
                {"role": m["role"], "content": m["content"].strip()}
                for m in messages
            ],
            "temperature": temperature,
        }
        payload = json.dumps(normalized, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()

    def get(self, model: str, messages: list,
            temperature: float, **kwargs) -> Optional[Dict]:
        if temperature > 0.5:
            return None

        key = self._make_key(model, messages, temperature, **kwargs)

        entry = self._exact_cache.get(key)
        if entry and not entry.is_expired:
            entry.hit_count += 1
            self._stats["hits"] += 1
            return entry.response

        if entry and entry.is_expired:
            del self._exact_cache[key]
            self._stats["evictions"] += 1

        self._stats["misses"] += 1
        return None

    def put(self, model: str, messages: list, temperature: float,
            response: Dict, input_tokens: int, output_tokens: int,
            ttl: int = 3600, **kwargs) -> None:
        if temperature > 0.5:
            return

        key = self._make_key(model, messages, temperature, **kwargs)
        self._exact_cache[key] = CacheEntry(
            key=key,
            response=response,
            model=model,
            tokens_saved_input=input_tokens,
            tokens_saved_output=output_tokens,
            ttl=ttl,
        )

    def get_stats(self) -> Dict:
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = self._stats["hits"] / max(total, 1)
        total_saved = sum(e.cost_saved for e in self._exact_cache.values())
        return {
            "total_requests": total,
            "hit_rate": f"{hit_rate:.1%}",
            "total_cost_saved": f"${total_saved:.2f}",
            "cache_size": len(self._exact_cache),
            "evictions": self._stats["evictions"],
        }
```

### Step 4: Quality Metrics Framework

Produce `llm-optimization/quality-metrics.md` with a rubric-based evaluation system:

```python
# quality_evaluator.py — LLM output quality measurement

from dataclasses import dataclass
from typing import List, Dict, Callable, Optional
from enum import Enum

class QualityDimension(Enum):
    ACCURACY = "accuracy"
    RELEVANCE = "relevance"
    COMPLETENESS = "completeness"
    COHERENCE = "coherence"
    SAFETY = "safety"
    FORMAT_COMPLIANCE = "format_compliance"

@dataclass
class QualityRubric:
    dimension: QualityDimension
    weight: float  # 0.0 - 1.0, weights must sum to 1.0
    scoring_guide: Dict[int, str]  # score -> description
    automated_check: Optional[Callable] = None

@dataclass
class QualityScore:
    dimension: QualityDimension
    score: float  # 0.0 - 10.0
    evidence: str
    automated: bool

class QualityEvaluator:
    def __init__(self, rubrics: List[QualityRubric]):
        total_weight = sum(r.weight for r in rubrics)
        assert abs(total_weight - 1.0) < 0.01, \
            f"Weights must sum to 1.0, got {total_weight}"
        self.rubrics = {r.dimension: r for r in rubrics}

    def evaluate(self, prompt: str, response: str,
                 expected: Optional[str] = None) -> Dict:
        scores = []
        for dim, rubric in self.rubrics.items():
            if rubric.automated_check:
                score_val = rubric.automated_check(prompt, response, expected)
                scores.append(QualityScore(
                    dimension=dim,
                    score=score_val,
                    evidence="Automated evaluation",
                    automated=True,
                ))
        weighted = sum(
            s.score * self.rubrics[s.dimension].weight for s in scores
        )
        return {
            "overall_score": round(weighted, 2),
            "dimension_scores": {
                s.dimension.value: s.score for s in scores
            },
            "details": scores,
        }

    @staticmethod
    def format_compliance_check(prompt: str, response: str,
                                 expected: Optional[str]) -> float:
        import json
        if "```json" in prompt or "JSON" in prompt:
            try:
                if "```json" in response:
                    json_str = response.split("```json")[1].split("```")[0]
                else:
                    json_str = response
                json.loads(json_str.strip())
                return 10.0
            except (json.JSONDecodeError, IndexError):
                return 2.0
        return 7.0

    @staticmethod
    def length_compliance_check(prompt: str, response: str,
                                 expected: Optional[str]) -> float:
        words = len(response.split())
        if words < 10:
            return 3.0
        if words > 2000:
            return 5.0
        return 8.0
```

## Output Files

- `llm-optimization/prompt-library/<feature>/prompt-v1.md`
- `llm-optimization/prompt-library/<feature>/prompt-v2.md`
- `llm-optimization/prompt-library/<feature>/comparison.md`
- `llm-optimization/token-analysis.md`
- `llm-optimization/caching-strategy.md`
- `llm-optimization/quality-metrics.md`

## Validation

Before proceeding to Phase 3, verify:
- [ ] Every LLM-powered feature has a baseline prompt (v1) documented
- [ ] Optimized prompts (v2) include measured improvements
- [ ] Token analysis includes per-feature budgets
- [ ] Caching strategy includes implementation code
- [ ] Quality metrics framework is defined with automated checks
- [ ] Minimum quality score threshold is set (optimization fails if quality drops below it)

> **GATE: Present optimization results with measured improvements. Wait for user approval before proceeding.**

## Quality Bar

Every optimization must show before/after metrics. "The prompt was improved" is not acceptable. "Input tokens reduced from 1,200 to 680 (-43%), cost per call from $0.045 to $0.022 (-51%), quality score maintained at 8.2/10" is acceptable. Optimizations that reduce quality below the minimum threshold are rejected regardless of cost savings.
