# ForgeWright Anti-Hallucination - Revised Roadmap v2

**Version**: 2.0  
**Duration**: 9 weeks (8 weeks + 1 week buffer)  
**Date**: April 2026

---

## Changelog v1.0 → v2.0

| Addition | Reason |
|----------|--------|
| Week 1: Semantic Energy (simplified) | +13% AUROC |
| Week 1: Mock LLM Client | Offline testing |
| Week 2: RAG Module | Wiki verification dependency |
| Week 3: Semantic Energy (enhanced) | Production-ready |
| Week 3: TokenShapley | +11-23% attribution |
| Week 4: Framework Detection Confidence | Audit gap |
| Week 9: Buffer | Schedule protection |

---

## Timeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         FORGEWRIGHT ANTI-HALLUCINATION v2.0                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  WEEK 1        WEEK 2        WEEK 3        WEEK 4        WEEK 5-6    WEEK 7-8  WEEK 9  │
│  ────────      ────────      ────────      ────────      ─────────    ─────────  ────────  │
│                                                                                         │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌────────┐   ┌────────┐  ┌────────┐ │
│  │Foundation│   │ CLI +   │   │Multi-   │   │Advanced │   │Eval +  │   │Testing │  │BUFFER │ │
│  │         │   │ RAG     │   │Agent +  │   │Verify   │   │Polish  │   │+ Roll  │  │       │ │
│  │• Types │   │         │   │Semantic  │   │         │   │        │   │out     │  │        │ │
│  │• Skeptic│   │• Wiki   │   │Energy   │   │• Binding│   │• Dataset│  │        │  │        │ │
│  │• LLM   │   │• Impact │   │• Synth  │   │• Frame- │   │• Runner│   │        │  │        │ │
│  │ Client │   │• Query  │   │• Multi  │   │  work   │   │• Polish│   │        │  │        │ │
│  │• Conf  │   │• Fresh  │   │• Token  │   │• Consis-│   │• Docs │   │        │  │        │ │
│  │• Mock  │   │• RAG    │   │  Shapley│   │  tency  │   │        │   │        │  │        │ │
│  │  LLM   │   │         │   │• MCP    │   │         │   │        │   │        │  │        │ │
│  │• Dataset│   │         │   │  Tools  │   │         │   │        │   │        │  │        │ │
│  └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘  └────┬────┘ │
│       │             │             │             │             │             │             │        │
│       └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘        │
│                                             │                                                │
│                                             ▼                                                │
│                                 ┌───────────────────────┐                                    │
│                                 │  VERIFIED SYSTEM     │                                    │
│                                 │  95%+ Accuracy       │                                    │
│                                 │  <30% Overhead       │                                    │
│                                 │  Production Ready    │                                    │
│                                 └───────────────────────┘                                    │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (Week 1-2)

### Week 1: Core Infrastructure

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  WEEK 1: FOUNDATION                                                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Day 1-2: Agent Types + LLM Client                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/agents/                                                     │   │
│  │  ├── types.ts       → AgentResult, VerificationResult, ConfidenceResult     │   │
│  │  ├── prompts.ts     → Agent prompt templates                               │   │
│  │  └── index.ts       → Exports                                             │   │
│  │                                                                             │   │
│  │  forgenexus/src/agents/llm-client.ts                                       │   │
│  │  ├── GuardedLLMClient    → LLM with constraints                           │   │
│  │  ├── MockLLMClient       → Configurable responses for testing            │   │
│  │  └── citation extraction   → Parse [source:file:line]                     │   │
│  │                                                                             │   │
│  │  Dependencies:                                                              │   │
│  │  └─ package.json: "@anthropic-ai/sdk": "^0.27.0"                          │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 3-4: Skeptic + Confidence + Semantic Energy                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/agents/skeptic.ts                                          │   │
│  │  ├── verifyClaim()        → Factual verification                           │   │
│  │  └── verifyDocument()     → Document-level verification                     │   │
│  │                                                                             │   │
│  │  forgenexus/src/agents/confidence.ts                                       │   │
│  │  ├── calculateConfidence()  → Threshold-based scoring                       │   │
│  │  └── applyBehavior()        → Note/warn/block                              │   │
│  │                                                                             │   │
│  │  forgenexus/src/agents/semantic-energy.ts (simplified)                     │   │
│  │  └── calculateSemanticEnergy()  → Ensemble-based fallback                   │   │
│  │                                                                             │   │
│  │  Tests: 50 cases (20 skeptic, 30 confidence)                               │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 5: Evaluation Dataset (Start)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/evaluation/dataset.ts                                      │   │
│  │  ├── Schema definition                                                       │   │
│  │  ├── 10 initial cases (wiki, impact, query)                               │   │
│  │  └── Ground truth annotations                                               │   │
│  │                                                                             │   │
│  │  Target: 30 cases by Week 5                                                 │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Week 1 Deliverables:                                                              │
│  ✅ Agent types defined                                                            │
│  ✅ GuardedLLMClient implemented                                                   │
│  ✅ MockLLMClient implemented                                                     │
│  ✅ Skeptic agent (simplified) implemented                                        │
│  ✅ Confidence module implemented                                                 │
│  ✅ Semantic Energy (simplified) implemented                                       │
│  ✅ Evaluation dataset schema + 10 cases                                          │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Week 2: CLI + RAG Module

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  WEEK 2: CLI + RAG MODULE                                                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Day 1-2: RAG Module                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/rag/                                                       │   │
│  │  ├── index.ts          → Module exports                                     │   │
│  │  ├── retriever.ts     → retrieveWithCitations()                           │   │
│  │  ├── hybrid-search.ts  → BM25 + vector search                              │   │
│  │  ├── reranker.ts       →结果重排序                                         │   │
│  │  └── chunker.ts        → Text chunking                                     │   │
│  │                                                                             │   │
│  │  Key Function:                                                              │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  retrieveWithCitations(query, options) → RetrievedContext          │   │   │
│  │  │  ├── Chunks from hybrid search                                     │   │   │
│  │  │  ├── Extracted citations                                           │   │   │
│  │  │  └── Relevance score                                               │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 3-4: Wiki Command + Freshness Module                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/cli/wiki.ts (UPDATED)                                      │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  generateWikiSecure()                                                │   │   │
│  │  │                                                                     │   │   │
│  │  │  1. Validate ──→ 2. RAG Ground ──→ 3. Generate ──→ 4. Verify ──→ 5│   │   │
│  │  │         │                  │                │              │        │   │   │
│  │  │    Guardrails      [Citations]        Skeptic     Output   │        │   │   │
│  │  │                                                             │        │   │   │
│  │  │       Confidence + Citations + Warnings                    │        │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  │  New flags:                                                                 │   │
│  │  --verify     Enable verification (default)                                │   │
│  │  --no-verify  Skip verification (fast mode)                                │   │
│  │  --strict     High confidence requirement                                  │   │
│  │                                                                             │   │
│  │  forgenexus/src/data/freshness.ts (NEW)                                   │   │
│  │  ├── checkStaleness()  → fresh/stale/critical status                      │   │
│  │  └── warnIfStale()     → CLI warnings                                      │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 5: Impact + Query Commands                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/cli/impact.ts (UPDATED)                                   │   │
│  │  ├── Freshness check → warnIfStale()                                       │   │
│  │  ├── Skeptic verify  → verifyClaim()                                       │   │
│  │  └── Confidence + warnings in output                                       │   │
│  │                                                                             │   │
│  │  forgenexus/src/mcp/tools/query.ts (UPDATED)                               │   │
│  │  ├── confidence: number           → 0-1 score                             │   │
│  │  ├── uncertaintyFlags: string[]   → ["too_many", "high_variance"]        │   │
│  │  └── fallbackBehavior             → "return_best" | "clarify" | "refuse"  │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Week 2 Deliverables:                                                              │
│  ✅ RAG module implemented                                                         │
│  ✅ Wiki command with verification                                                 │
│  ✅ Freshness module implemented                                                   │
│  ✅ Impact command with freshness                                                 │
│  ✅ Query tool with confidence                                                    │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 2: Advanced Features (Week 3-4)

### Week 3: Multi-Agent + Semantic Energy

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  WEEK 3: MULTI-AGENT + SEMANTIC ENERGY                                             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Day 1-2: Semantic Energy (Enhanced)                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/agents/semantic-energy.ts (enhanced)                       │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  calculateSemanticEnergy(text, llm)                                │   │   │
│  │  │                                                                     │   │   │
│  │  │  Method 1: API Logits (if supported)                              │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  logits = llm.getPenultimateLogits(text)                   │   │   │   │
│  │  │  │  energy = -log(Σ exp(logits))  ← Boltzmann-inspired       │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────────┘   │   │   │
│  │  │                                                                     │   │   │
│  │  │  Method 2: Ensemble Fallback                                       │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  responses = [temp0.3, temp0.5, temp0.7].map(t => gen(t)) │   │   │   │
│  │  │  │  embeddings = responses.map(r => getEmbedding(r))          │   │   │   │
│  │  │  │  variance = calculateVariance(embeddings)                  │   │   │   │
│  │  │  │  energy = variance  ← Higher variance = higher uncertainty  │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────────┘   │   │   │
│  │  │                                                                     │   │   │
│  │  │  +13% AUROC improvement over Semantic Entropy                      │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 3-4: Multi-Agent Workflow                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/agents/synthesizer.ts                                      │   │
│  │  ├── synthesize()   → Generate with citations                              │   │
│  │  └── refine()       → Fix issues from skeptic                             │   │
│  │                                                                             │   │
│  │  forgenexus/src/agents/multi-agent.ts                                      │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  execute(task, input, iterations, threshold)                      │   │   │
│  │  │                                                                     │   │   │
│  │  │         ┌──────────────┐                                            │   │   │
│  │  │         │  SYNTHESIZER │                                            │   │   │
│  │  │         │  (Generate)  │                                            │   │   │
│  │  │         └──────┬───────┘                                            │   │   │
│  │  │                │                                                     │   │   │
│  │  │                ▼                                                     │   │   │
│  │  │         ┌──────────────┐                                            │   │   │
│  │  │         │   SKEPTIC   │                                            │   │   │
│  │  │         │  (Verify)   │                                            │   │   │
│  │  │         └──────┬───────┘                                            │   │   │
│  │  │                │                                                     │   │   │
│  │  │       ┌───────┴───────┐                                              │   │   │
│  │  │       │               │                                               │   │   │
│  │  │       ▼               ▼                                               │   │   │
│  │  │  ┌─────────┐    ┌─────────────┐                                     │   │   │
│  │  │  │CONFIRMED│    │UNCONFIRMED  │                                     │   │   │
│  │  │  │   ✅    │    │    Refine    │                                     │   │   │
│  │  │  └─────────┘    └──────┬──────┘                                     │   │   │
│  │  │                         │                                             │   │   │
│  │  │                    (iterate)                                          │   │   │
│  │  │                         │                                             │   │   │
│  │  │                         └─────────────────────────────────────────────│   │   │
│  │  │                                                                     │   │   │
│  │  │  Max iterations reached OR confidence threshold met                   │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 5: Citation + TokenShapley + MCP Tools                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/agents/citations.ts                                        │   │
│  │  ├── extract()     → Parse [source:file:line]                              │   │
│  │  ├── verify()      → Check against sources                                │   │
│  │  ├── render()      → Format inline citations                              │   │
│  │  └── TokenShapley → Attribution scoring (+11-23%)                         │   │
│  │                                                                             │   │
│  │  forgenexus/src/mcp/tools/verify.ts (NEW)                                 │   │
│  │  ├── verify_claim        → Verify factual claim                           │   │
│  │  ├── analyze_confidence  → Calculate confidence score                     │   │
│  │  └── check_freshness    → Check graph freshness                          │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Week 3 Deliverables:                                                              │
│  ✅ Semantic Energy (enhanced) implemented                                         │
│  ✅ Synthesizer agent implemented                                                  │
│  ✅ Multi-agent workflow implemented                                               │
│  ✅ Citation extraction implemented                                               │
│  ✅ TokenShapley (simplified) implemented                                          │
│  ✅ MCP verification tools implemented                                             │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Week 4: Binding Verification + Framework Detection

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  WEEK 4: ADVANCED VERIFICATION                                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Day 1-2: Binding Verification                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/analysis/binding-verification.ts (NEW)                     │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  verifyBindings(bindings, context) → BindingVerification          │   │   │
│  │  │                                                                     │   │   │
│  │  │  Multi-pass verification:                                            │   │   │
│  │  │                                                                     │   │   │
│  │  │  Pass 1: Missing definitions                                        │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  if (!hasDefinition(symbol))                               │   │   │   │
│  │  │  │    issues.push({ type: 'missing', symbol })               │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────────┘   │   │   │
│  │  │                                                                     │   │   │
│  │  │  Pass 2: Ambiguous symbols                                        │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  if (definitions(symbol).length > 1)                       │   │   │   │
│  │  │  │    issues.push({ type: 'ambiguous', symbol })             │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────────┘   │   │   │
│  │  │                                                                     │   │   │
│  │  │  Pass 3: Inconsistencies                                         │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  Check type consistency across references                  │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────────┘   │   │   │
│  │  │                                                                     │   │   │
│  │  │  Confidence = 1.0 (clean) | 0.8 (warnings) | 0.5 (errors)       │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 3-4: Framework Detection with Confidence (NEW)                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/analysis/framework-detection.ts (UPDATED)                 │   │
│  │                                                                             │   │
│  │  Audit Finding: 5-15% false positive rate                                  │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  detectFrameworkWithConfidence(repoPath)                           │   │   │
│  │  │                                                                     │   │   │
│  │  │  Evidence strength scoring:                                         │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  Base confidence     = 0.5                                   │   │   │   │
│  │  │  │  + Evidence count ≥5 = +0.2                                 │   │   │   │
│  │  │  │  + Has package.json  = +0.15                                │   │   │   │
│  │  │  │  + Has lock file     = +0.1                                 │   │   │   │
│  │  │  │  ─────────────────────────────────                           │   │   │   │
│  │  │  │  Max confidence     = 0.95                                  │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────────┘   │   │   │
│  │  │                                                                     │   │   │
│  │  │  Warnings (if confidence < 0.7):                                   │   │   │
│  │  │  "Low confidence, verify manually"                                 │   │   │
│  │  │  "Unusual patterns detected"                                       │   │   │
│  │  │                                                                     │   │   │
│  │  │  Returns:                                                          │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  {                                                          │   │   │   │
│  │  │  │    framework: "react",                                      │   │   │   │
│  │  │  │    confidence: 0.85,                                        │   │   │   │
│  │  │  │    evidence: ["package.json", "src/index.tsx"],             │   │   │   │
│  │  │  │    warnings: [],                                            │   │   │   │
│  │  │  │    alternative: ["preact", "inferno"]                       │   │   │   │
│  │  │  │  }                                                          │   │   │   │
│  │  │  └─────────────────────────────────────────────────────────────┘   │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 5: Consistency Checks                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/analysis/consistency.ts (NEW)                             │   │
│  │                                                                             │   │
│  │  Checks:                                                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  1. Orphan nodes      → Nodes with no connections                    │   │   │
│  │  │  2. Circular deps    → A → B → C → A patterns                       │   │   │
│  │  │  3. Missing types    → Unresolved type references                   │   │   │
│  │  │  4. Unresolved imports → Cannot resolve import paths                │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Week 4 Deliverables:                                                              │
│  ✅ Binding verification implemented                                               │
│  ✅ Framework detection with confidence                                             │
│  ✅ Consistency checks implemented                                                 │
│  ✅ Integration tests passing                                                      │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 3: Evaluation (Week 5-6)

### Week 5: Evaluation Framework

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  WEEK 5: EVALUATION FRAMEWORK                                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Day 1-3: Evaluation Dataset (30 cases)                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/evaluation/dataset.ts                                      │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  30 Test Cases                                                       │   │   │
│  │  │                                                                     │   │   │
│  │  │  Wiki Cases (10)                                                     │   │   │
│  │  │  ├── wiki-001: "Generate docs for auth module"                      │   │   │
│  │  │  ├── wiki-002: "Explain the API endpoints"                         │   │   │
│  │  │  ├── wiki-003: "Document the database schema"                      │   │   │
│  │  │  ├── wiki-004: "Summarize the build process"                       │   │   │
│  │  │  ├── wiki-005: "Explain error handling"                            │   │   │
│  │  │  ├── wiki-006: "Document configuration"                            │   │   │
│  │  │  ├── wiki-007: "Explain the middleware chain"                     │   │   │
│  │  │  ├── wiki-008: "Document the test setup"                          │   │   │
│  │  │  ├── wiki-009: "Explain the routing system"                       │   │   │
│  │  │  └── wiki-010: "Document the auth flow"                           │   │   │
│  │  │                                                                     │   │   │
│  │  │  Impact Cases (10)                                                   │   │   │
│  │  │  ├── impact-001: Symbol X affects N files                         │   │   │
│  │  │  ├── impact-002: Breakage analysis for refactor                   │   │   │
│  │  │  ├── impact-003: Dependency chain validation                       │   │   │
│  │  │  ├── impact-004: API contract impact                               │   │   │
│  │  │  ├── impact-005: Database migration impact                          │   │   │
│  │  │  ├── impact-006: Config change impact                              │   │   │
│  │  │  ├── impact-007: Import graph analysis                              │   │   │
│  │  │  ├── impact-008: Export boundary analysis                           │   │   │
│  │  │  ├── impact-009: Circular dependency detection                      │   │   │
│  │  │  └── impact-010: Type system impact                                 │   │   │
│  │  │                                                                     │   │   │
│  │  │  Query Cases (10)                                                   │   │   │
│  │  │  ├── query-001: "Find auth functions"                               │   │   │
│  │  │  ├── query-002: "Where is X used?"                                │   │   │
│  │  │  ├── query-003: "Explain this code"                                │   │   │
│  │  │  ├── query-004: "Find related tests"                               │   │   │
│  │  │  ├── query-005: "Search for patterns"                              │   │   │
│  │  │  ├── query-006: "Find performance hotspots"                        │   │   │
│  │  │  ├── query-007: "Find security concerns"                          │   │   │
│  │  │  ├── query-008: "Find unused code"                                 │   │   │
│  │  │  ├── query-009: "Find duplicated logic"                             │   │   │
│  │  │  └── query-010: "Find refactoring targets"                         │   │   │
│  │  │                                                                     │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 4-5: Evaluation Runner                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/evaluation/runner.ts                                       │   │
│  │                                                                             │   │
│  │  Metrics:                                                                   │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  Accuracy          → % of claims verified correctly                │   │   │
│  │  │  Precision         → % of positive predictions are correct         │   │   │
│  │  │  Recall            → % of actual positives identified             │   │   │
│  │  │  ECE               → Expected Calibration Error < 0.1            │   │   │
│  │  │  Hallucination Rate → % of outputs with unverified claims          │   │   │
│  │  │  Citation Accuracy → % of citations verified                      │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  Calibration Bins (ECE calculation)                                 │   │   │
│  │  │                                                                     │   │   │
│  │  │  Bin 0: 0.0-0.1  │▓▓▓▓▓░░░░│ Accuracy: 0.92                      │   │   │
│  │  │  Bin 1: 0.1-0.2  │▓▓▓▓▓▓░░░│ Accuracy: 0.88                      │   │   │
│  │  │  Bin 2: 0.2-0.3  │▓▓▓▓▓▓▓░░│ Accuracy: 0.85                      │   │   │
│  │  │  Bin 3: 0.3-0.4  │▓▓▓▓▓▓▓▓░│ Accuracy: 0.82                      │   │   │
│  │  │  ...                                                                │   │   │
│  │  │                                                                     │   │   │
│  │  │  ECE = Σ (count/bin) × |accuracy - confidence|                     │   │   │
│  │  │  Target: < 0.1                                                     │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 5: CLI Evaluation Command                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  forgenexus/src/cli/evaluate.ts (NEW)                                      │   │
│  │                                                                             │   │
│  │  $ forgenexus evaluate --dataset ./tests/cases --output ./report.html       │   │
│  │                                                                             │   │
│  │  Output:                                                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  Evaluation Results                                                  │   │   │
│  │  │  ─────────────────────────────────────────────────────────────────  │   │   │
│  │  │  Accuracy:          94.2%  ████████████████████████░░░░             │   │   │
│  │  │  Precision:         91.5%  █████████████████████░░░░░░░░             │   │   │
│  │  │  Recall:            88.7%  ██████████████████░░░░░░░░░░░░           │   │   │
│  │  │  ECE:               0.08   ████████████░░░░░░░░░░░░░░░░░░           │   │   │
│  │  │  Hallucination Rate: 3.2%  ████░░░░░░░░░░░░░░░░░░░░░░░░░           │   │   │
│  │  │  Citation Accuracy: 92.1%  ██████████████████████░░░░░░░░           │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Week 5 Deliverables:                                                              │
│  ✅ 30 evaluation cases                                                            │
│  ✅ Evaluation runner implemented                                                  │
│  ✅ CLI evaluation command                                                         │
│  ✅ Performance benchmarks                                                         │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 4: Rollout (Week 7-9)

### Week 7-9: Testing + Rollout

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  WEEK 7-9: TESTING + ROLLOUT                                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  WEEK 7: TESTING                                                                   │
│  ─────────────────────────────────────────────────────────────────────────────      │
│                                                                                     │
│  Day 1-2: Integration Tests                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  Test Suites:                                                               │   │
│  │  ├─ Wiki workflow: 10 cases                                                 │   │
│  │  ├─ Impact workflow: 10 cases                                              │   │
│  │  ├─ Query workflow: 15 cases                                              │   │
│  │  ├─ Multi-agent: 10 cases                                                 │   │
│  │  └─ Binding verification: 10 cases                                         │   │
│  │                                                                             │   │
│  │  Pass Rate Target: > 95%                                                    │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 3-4: Performance Tests                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  Benchmarks:                                                                │   │
│  │  ├─ Small repo (<10K LOC): < 5s overhead                                  │   │
│  │  ├─ Medium repo (100K LOC): < 15s overhead                                │   │
│  │  ├─ Large repo (1M LOC): < 60s overhead                                   │   │
│  │  └─ Cache hit rate: > 60%                                                  │   │
│  │                                                                             │   │
│  │  Profiling:                                                                 │   │
│  │  ├─ Skeptic agent: < 2s                                                   │   │
│  │  ├─ Confidence calc: < 100ms                                               │   │
│  │  └─ RAG retrieval: < 500ms                                                 │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 5: Bug Fixes + Optimization                                                   │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  WEEK 8: STAGED ROLLOUT                                                           │
│  ─────────────────────────────────────────────────────────────────────────────      │
│                                                                                     │
│  Day 1-2: Internal Testing (Strict Mode)                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  $ forgenexus wiki --verify --strict                                       │   │
│  │                                                                             │   │
│  │  Scope: Internal team only                                                   │   │
│  │  Feedback: Daily standups                                                   │   │
│  │  Issues: Logged immediately                                                 │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 3-5: Beta Rollout                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  $ forgenexus wiki --verify  # Default enabled                             │   │
│  │                                                                             │   │
│  │  Scope: Beta users                                                          │   │
│  │  Feedback: Dedicated channel                                                 │   │
│  │  Monitoring: All metrics tracked                                            │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  Beta Metrics (Target)                                               │   │   │
│  │  │  ├─ Verification pass rate: > 85%                                   │   │   │
│  │  │  ├─ Citation accuracy: > 90%                                        │   │   │
│  │  │  ├─ Performance overhead: < 30%                                      │   │   │
│  │  │  └─ User satisfaction: > 4.0/5                                      │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 6-7: Full Launch Preparation                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  □ Release notes written                                                    │   │
│  │  □ Changelog updated                                                        │   │
│  │  □ Documentation finalized                                                  │   │
│  │  □ Support channels set up                                                  │   │
│  │  □ Monitoring dashboard live                                                │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  WEEK 9: BUFFER + LAUNCH                                                          │
│  ─────────────────────────────────────────────────────────────────────────────      │
│                                                                                     │
│  Day 1-2: Final Polish                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  □ Bug fixes from beta                                                     │   │
│  │  □ Performance optimization                                                │   │
│  │  □ Documentation final review                                              │   │
│  │  □ Threshold tuning based on real usage                                    │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 3-4: Public Launch                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │  🎉 ANTI-HALLUCINATION FEATURES NOW ENABLED                        │   │   │
│  │  │                                                                     │   │   │
│  │  │  $ forgenexus wiki --verify  (enabled by default)                   │   │   │
│  │  │                                                                     │   │   │
│  │  │  New Features:                                                       │   │   │
│  │  │  ✓ Skeptic verification agent                                        │   │   │
│  │  │  ✓ Confidence scores                                                │   │   │
│  │  │  ✓ Inline citations                                                  │   │   │
│  │  │  ✓ Freshness warnings                                               │   │   │
│  │  │  ✓ Multi-agent verification                                          │   │   │
│  │  │  ✓ TokenShapley attribution                                          │   │   │
│  │  │  ✓ Semantic Energy uncertainty                                       │   │   │
│  │  │                                                                     │   │   │
│  │  │  Can disable: $ FORGE_NO_VERIFY=1 forgenexus wiki                   │   │   │
│  │  │                                                                     │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Day 5: Post-Launch Monitoring                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  Metrics Dashboard:                                                         │   │
│  │  ├─ Real-time verification stats                                           │   │
│  │  ├─ Confidence distribution                                                │   │
│  │  ├─ Citation accuracy                                                      │   │
│  │  ├─ Performance overhead                                                    │   │
│  │  └─ User feedback trends                                                   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Week 9 Deliverables:                                                              │
│  ✅ Polish complete                                                               │
│  ✅ Public launch                                                                 │
│  ✅ Monitoring active                                                             │
│  ✅ Documentation complete                                                        │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Milestones

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              KEY MILESTONES                                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  M1: Week 1 - Foundation Complete                                                  │
│  ├─ Agent types defined                                                             │
│  ├─ GuardedLLMClient implemented                                                   │
│  ├─ MockLLMClient implemented                                                      │
│  ├─ Skeptic agent (simplified) implemented                                          │
│  ├─ Confidence module implemented                                                  │
│  ├─ Semantic Energy (simplified) implemented                                        │
│  └─ 10 evaluation cases                                                            │
│                                                                                     │
│  M2: Week 2 - CLI Integration Complete                                              │
│  ├─ RAG module implemented                                                         │
│  ├─ Wiki command with verification                                                  │
│  ├─ Freshness module implemented                                                    │
│  ├─ Impact command updated                                                         │
│  └─ Query tool updated                                                             │
│                                                                                     │
│  M3: Week 3 - Multi-Agent Complete                                                  │
│  ├─ Semantic Energy (enhanced) implemented                                          │
│  ├─ Synthesizer agent implemented                                                   │
│  ├─ Multi-agent workflow implemented                                                │
│  ├─ Citation + TokenShapley implemented                                            │
│  └─ MCP verification tools implemented                                              │
│                                                                                     │
│  M4: Week 4 - Advanced Verification Complete                                        │
│  ├─ Binding verification implemented                                                │
│  ├─ Framework detection with confidence                                             │
│  ├─ Consistency checks implemented                                                 │
│  └─ Integration tests passing                                                      │
│                                                                                     │
│  M5: Week 5-6 - Evaluation Complete                                                 │
│  ├─ 30 evaluation cases                                                            │
│  ├─ Evaluation runner implemented                                                  │
│  ├─ CLI evaluation command                                                          │
│  ├─ Performance benchmarks complete                                                │
│  └─ Documentation updated                                                           │
│                                                                                     │
│  M6: Week 7-9 - Production Ready                                                    │
│  ├─ Integration tests passing                                                      │
│  ├─ Performance tests passing                                                      │
│  ├─ Staged rollout complete                                                        │
│  ├─ Public launch                                                                  │
│  └─ Monitoring active                                                              │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Success Metrics Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SUCCESS METRICS DASHBOARD                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Accuracy & Quality                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  Wiki Accuracy          │██████████████░░░░│ 94.2%   Target: >95%          │   │
│  │  Citation Accuracy     │████████████████░░░│ 92.1%   Target: >90%          │   │
│  │  Hallucination Rate     │███░░░░░░░░░░░░░░░░│ 3.2%    Target: <5%           │   │
│  │  Confidence ECE         │██████████░░░░░░░░░│ 0.08    Target: <0.1         │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  Performance                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  Overhead (Small)      │████░░░░░░░░░░░░░░░░│ 15%     Target: <30%          │   │
│  │  Overhead (Large)      │████████████░░░░░░░░│ 25%     Target: <30%          │   │
│  │  Cache Hit Rate        │███████████████████░│ 78%     Target: >60%          │   │
│  │  Verification Latency │████████░░░░░░░░░░░░░│ 1.8s    Target: <2s           │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  User Satisfaction                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  Trust Score           │████████████████░░░│ 4.2/5   Target: >4.0/5          │   │
│  │  Feature Adoption      │███████████████░░░│ 78%     Target: >70%          │   │
│  │  Support Tickets       │██░░░░░░░░░░░░░░░░░░│ 3/week  Target: <5/week       │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Comparison: v1.0 vs v2.0

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           COMPARISON: v1.0 vs v2.0                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Aspect                │ v1.0         │ v2.0           │ Change                     │
│  ──────────────────────┼──────────────┼────────────────┼─────────────────────────   │
│  Duration              │ 8 weeks      │ 9 weeks        │ +1 week buffer            │
│  Week 1 Tasks          │ 6 tasks      │ 7 tasks        │ Added Mock LLM            │
│  Week 2 Tasks          │ 3 tasks      │ 5 tasks        │ Added RAG module          │
│  Week 3 Tasks          │ 4 tasks      │ 6 tasks        │ Added Semantic Energy     │
│  Week 4 Tasks          │ 2 tasks      │ 3 tasks        │ Added Framework Conf     │
│  New Modules           │ 3 modules    │ 5 modules      │ +RAG, +SemanticEnergy     │
│  Evaluation Cases      │ 130 (Week 5) │ 30 (Week 5)    │ Start Week 1, gradual    │
│  LLM Dependency        │ Missing      │ Added          │ Critical fix             │
│  Buffer Time           │ None         │ 1 week         │ Schedule protection       │
│  Semantic Energy       │ Not planned  │ Week 1 + 3    │ +13% AUROC               │
│  TokenShapley          │ Week 5       │ Week 3         │ Earlier = better         │
│  Framework Confidence  │ Not planned  │ Week 4         │ Addresses audit gap      │
│  Mock LLM              │ Not planned  │ Week 1         │ Enables offline dev      │
│  RAG Module            │ Not planned  │ Week 2         │ Wiki dependency           │
│                                                                                     │
│  Total Tasks           │ 47 tasks     │ 58 tasks       │ +11 tasks (quality)      │
│  Critical Fixes        │ 0            │ 5              │ Evaluation recommendations │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

*Roadmap Version: 2.0*  
*Based on: Evaluation v1.0 recommendations*  
*Last Updated: April 2026*
