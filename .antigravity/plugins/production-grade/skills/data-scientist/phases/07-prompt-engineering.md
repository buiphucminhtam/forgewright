# Phase 7 — Prompt Engineering

## Goal

Establish a production-grade prompt engineering practice: versioned prompt library, eval harness for quality measurement, A/B testing infrastructure for prompt variants, structured output schemas, and prompt guardrails. Move prompts from ad-hoc strings to managed, tested, versioned artifacts.

## When to Load

After Phase 2 (LLM Optimization), only for LLM-Powered Apps and AI-First Products.

## Inputs to Read

- Source code with LLM API calls (from Phase 1 audit)
- Prompt templates currently in codebase
- `.forgewright/data-scientist/llm-optimization/` — token analysis and caching strategy
- BRD/PRD — user-facing quality requirements

## Actions

### 1. Prompt Inventory & Audit

Scan codebase for all prompt-related code:
- Inline prompt strings in source files
- Template files (`.txt`, `.md`, `.hbs`, `.j2`)
- System prompts, user prompts, few-shot examples
- Output parsing logic (regex, JSON parse, structured output)

For each prompt, record:
- Location (file:line)
- Purpose (classification, generation, extraction, summarization, etc.)
- Model used (GPT-4, Claude, Gemini, local)
- Average token count (input + output)
- Temperature setting
- Current quality (manual score 1-10 based on sample outputs)

### 2. Prompt Library Architecture

Create a versioned prompt library:

```
services/<service>/prompts/
├── system/
│   ├── v1.0.0-classifier.md       # System prompt for classification
│   └── v1.0.0-generator.md        # System prompt for generation
├── templates/
│   ├── v1.0.0-extract-entities.md  # Extraction template
│   └── v1.0.0-summarize.md         # Summarization template
├── few-shot/
│   ├── classifier-examples.json    # Few-shot examples for classification
│   └── generator-examples.json     # Few-shot examples for generation
├── schemas/
│   ├── classifier-output.json      # JSON Schema for classifier output
│   └── generator-output.json       # JSON Schema for generator output
└── prompt-registry.yaml            # Registry of all prompts with metadata
```

**prompt-registry.yaml format:**
```yaml
prompts:
  - id: classify-intent
    version: 1.0.0
    type: system
    model: gpt-4o
    temperature: 0.0
    max_tokens: 100
    file: system/v1.0.0-classifier.md
    schema: schemas/classifier-output.json
    quality_score: 8.2
    avg_input_tokens: 450
    avg_output_tokens: 50
    last_eval: 2024-01-15
```

### 3. Prompt Optimization Techniques

Apply these techniques to each prompt (document before/after with quality scores):

| Technique | When to Use | Expected Impact |
|-----------|-------------|----------------|
| **Chain of Thought (CoT)** | Reasoning tasks, math, logic | +15-30% accuracy, +20-50% tokens |
| **Few-Shot Examples** | Classification, extraction, formatting | +10-25% accuracy, +100-500 tokens |
| **Structured Output (JSON Mode)** | Any API-consumed output | -100% parsing errors |
| **System Prompt Refinement** | All prompts | Variable, measure per prompt |
| **Prompt Compression** | High-volume, cost-sensitive | -20-40% tokens, watch quality |
| **Output Constraints** | Length control, format control | Predictable output, lower variance |
| **Role Assignment** | Specialized tasks | +5-15% task-specific accuracy |
| **Negative Examples** | Reducing specific failure modes | -50-80% of targeted failure type |

### 4. Eval Harness

Build an evaluation framework:

```typescript
// eval-harness/evaluator.ts
interface PromptEval {
  promptId: string;
  version: string;
  testCases: TestCase[];
  metrics: EvalMetric[];
  guardrails: Guardrail[];
}

interface TestCase {
  input: string;
  expectedOutput?: string;        // For exact match
  expectedContains?: string[];    // For partial match
  expectedSchema?: JsonSchema;    // For structural validation
  humanScore?: number;            // 1-10 human quality score
}

interface EvalMetric {
  name: string;                   // "accuracy", "relevance", "coherence", "toxicity"
  type: "exact_match" | "contains" | "schema_valid" | "llm_judge" | "human";
  threshold: number;              // Minimum acceptable score (0-1)
}
```

Eval types:
- **Exact match** — output matches expected string exactly
- **Contains** — output contains all expected substrings
- **Schema validation** — output parses to valid JSON matching schema
- **LLM-as-judge** — secondary LLM scores quality (use for subjective tasks)
- **Human eval** — manual scoring on sample (golden dataset)

### 5. A/B Testing Prompts

Integrate with experiment framework (Phase 3):

```typescript
// prompt-experiment.ts
const experiment = {
  id: "classify-intent-v2",
  control: { promptVersion: "1.0.0", model: "gpt-4o" },
  variant: { promptVersion: "2.0.0", model: "gpt-4o-mini" },
  metrics: ["accuracy", "latency_p95", "cost_per_call"],
  guardrails: ["error_rate < 0.01", "accuracy > 0.85"],
  trafficSplit: 0.1,  // 10% to variant
  minSampleSize: 1000,
};
```

### 6. Prompt Guardrails

Implement safety and quality guardrails:

| Guardrail | Implementation |
|-----------|---------------|
| **Output validation** | Every LLM response parsed against JSON Schema before use |
| **Toxicity filter** | Post-process outputs through content safety classifier |
| **PII detection** | Scan inputs AND outputs for PII before logging/storing |
| **Hallucination detection** | For factual tasks, cross-reference against source data |
| **Length limits** | Enforce max_tokens at API level AND validate output length |
| **Retry with escalation** | On parse failure: retry once → fallback model → return error |
| **Rate limiting** | Per-prompt rate limits to prevent cost spikes |
| **Cost ceiling** | Per-request cost ceiling with auto-reject above threshold |

## Output

```
.forgewright/data-scientist/
    prompt-engineering/
        prompt-audit.md              # Inventory of all prompts with current quality scores
        optimization-report.md       # Before/after comparison for each optimized prompt
        eval-harness-design.md       # Eval framework architecture and test coverage
        ab-test-plan.md             # Prompt A/B testing plan with metrics and guardrails
        guardrails-spec.md          # Safety and quality guardrail specifications

services/<service>/prompts/          # Versioned prompt library (co-located with service)
```

## Quality Checklist

- [ ] Every prompt is versioned (never overwrite — create new version)
- [ ] Every prompt has a JSON Schema for structured output validation
- [ ] Every prompt has at least 10 eval test cases (5 happy path, 5 edge cases)
- [ ] Every prompt optimization includes before/after quality score comparison
- [ ] Prompt library has a registry (`prompt-registry.yaml`) with metadata
- [ ] Eval harness runs in CI — prompt quality regression fails the pipeline
- [ ] A/B testing infrastructure can split traffic between prompt versions
- [ ] All guardrails are implemented and tested
- [ ] No PII in prompt templates, few-shot examples, or eval test cases
- [ ] Cost projections include prompt token counts at 2x, 5x, 10x scale
