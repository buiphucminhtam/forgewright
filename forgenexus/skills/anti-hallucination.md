# AI Anti-Hallucination Skill

## Purpose
Systematic framework for preventing, detecting, and mitigating hallucinations in AI agent workflows. This skill transforms research findings into actionable practices for production AI systems.

## Prerequisites
- Understanding of LLM architecture (transformers, attention)
- Familiarity with RAG concepts
- Basic knowledge of multi-agent systems

---

## Module 1: Understanding Hallucination

### 1.1 Definition
**Hallucination** = outputs that are fluent and syntactically correct but factually inaccurate or unsupported by evidence.

### 1.2 Root Causes (Lifecycle Analysis)

| Stage | Primary Driver | Mechanism |
|-------|---------------|-----------|
| **Data** | Knowledge Overshadowing | Frequent non-factual patterns outweigh rare facts |
| **Architecture** | Attention Drift/Sink | Focus decays on initial context; `<BOS>` absorbs attention |
| **Pre-training** | Probabilistic Bias | Prioritizes plausible continuation over factual truth |
| **Fine-tuning** | Alignment Sycophancy | Human raters reward helpful/affirming → model agrees with false premises |
| **Evaluation** | Guessing Incentives | Benchmarks penalize "I don't know" = incorrect guess |
| **Inference** | Decoding Randomness | High-temperature increases diverse but false output |

### 1.3 Critical Insight: Statistical Lower Bound
**Monofact Rate** = Facts appearing exactly once in training data.

> If model is perfect predictor of training distribution, it MUST hallucinate at rate proportional to monofacts.

**Implication**: Cannot eliminate hallucinations entirely. Focus on reduction and detection.

### 1.4 Attention Mechanism Failures

#### Attention Drift
- Progressive loss of focus on initial input during generation
- Attention concentrates on recently generated tokens
- Model starts hallucinating based on its own (potentially wrong) outputs

#### Attention Sink
- Models allocate high attention to `<BOS>` token regardless of relevance
- Coexists with uniform attention patterns in shallow layers (first 2 layers)
- Most hallucinations correlate with attentional sinking pattern

---

## Module 2: Detection Techniques

### 2.1 Uncertainty Quantification

#### Semantic Entropy (Nature 2024)
```python
# Concept: Measure uncertainty at meaning level, not token level
# Formula: SE(q|θ) = -Σ p(s|q,θ) log p(s|q,θ)
# Use when: Domain-agnostic detection without ground truth needed
```

#### Semantic Energy (2025) — Superior
```python
# Breakthrough: Operates on penultimate layer logits (not normalized probs)
# Captures "intensity" information lost in entropy methods
# AUROC improvement: +13% vs Semantic Entropy
# Best for: Detecting "confidently wrong" scenarios

# When SE fails but Semantic Energy succeeds:
# - Model consistently produces same hallucination (low SE)
# - But logits show internal uncertainty (high Energy)
```

### 2.2 Internal Representation Probing

#### Neural Probes
- Train classifier on hidden states to detect hallucination before output
- Real-time, lightweight
- Works across different tasks

#### Sparse Autoencoders (SAEs)
- Map residual stream activations to interpretable concepts
- Constellation of concept activations in middle layers predicts hallucination
- Enable targeted steering to "turn off" specific hallucinatory pathways

### 2.3 Multi-Agent Verification
```python
# Skeptic/Reviewer Agent Pattern
# Generator Agent → Output → Skeptic Agent → Feedback → Generator (iterates)
# Key: Skeptic operates WITHOUT access to original output (avoids confirmation bias)
```

---

## Module 3: Prevention Techniques

### 3.1 RAG (Retrieval-Augmented Generation)

#### Evolution: Pipeline → Knowledge Runtime

| Aspect | Old (Naive RAG) | New (Knowledge Runtime) |
|--------|-----------------|------------------------|
| Indexing | Flat Vector | Hybrid (Vector + Graph + Hierarchical) |
| Search | Pure Semantic | State-Aware / Logic-Grounded |
| Freshness | Batch Re-indexing | Continuous CDC + Stream |
| Verification | Manual Spot-Checks | Autonomous Multi-Agent |

#### Best Practices

1. **Hybrid Retrieval** — Vector + BM25 keyword
   - Up to 9% recall improvement
   - Handles both semantic and exact matches

2. **State-Aware Query Planning**
   ```
   User Query → Query Interpretation → Retrieval Plan → 
   Modalities + Granularity + Depth → Execute → Verify → Generate
   ```

3. **GraphRAG for Complex Reasoning**
   - Entity-relationship encoding
   - Multi-hop reasoning
   - Compliance risk identification

4. **Multi-Agent Verification Layers**
   ```
   Supervisor Agent (meta-cognitive orchestrator)
   ├─ Breaks queries into atomic tasks
   ├─ Routes to specialized workers
   └─ Synthesizes grounded response
   
   Performance: 84.5% vs 62.8% (flat-agent)
   ```

### 3.2 Citation-Based Grounding

**Key Insight**: Model must make 2 errors instead of 1.

```
Without citation: "X happened" → 1 error possible
With citation: "X happened [source]" → Must fabricate fact AND citation
```

**Best Practice**: Inline citations > End-of-document citations
- Model must anticipate citation as it writes
- Shorter distance = harder to hallucinate

**TokenShapley** (Shapley Values for Attribution)
- Token-level contribution quantification
- 11-23% improvement over sentence-level attribution
- Critical for regulatory compliance

### 3.3 Confidence Calibration

```markdown
## Give the Model an "Out"

Instead of:
"Answer this question about the text"

Use:
"Answer based on the text. If answer not found, respond with 
'NOT FOUND' or 'I DON'T KNOW'"

Result: Reduces pressure to "fill in blanks" with fabrication
```

### 3.4 Chain-of-Thought (CoT)

**Note**: For non-reasoning models only. Reasoning models (GPT-5, o-series) auto-generate internal CoT.

```markdown
## Pattern
1. Step 1: [First reasoning step with citation]
2. Step 2: [Second reasoning step with citation]
3. Step N: [Final answer]

## Anti-Snowballing
If intermediate step contains hallucination → final answer wrong
→ Requires validation at each step
```

---

## Module 4: Architecture Interventions

### 4.1 Attention Modification

#### ART: Attention Replacement Technique (2026)
```python
# Problem: Uniform attention in shallow layers
# Solution: Replace with local attention patterns
# Result: Training-free, plug-and-play, significant hallucination reduction
# Mechanism: First few layers = critical for "knowledge injection"
```

#### SinkTrack: Context Anchoring (2026)
```python
# Problem: Attention drift from initial context
# Solution: Inject key contextual features into <BOS> token
# Architecture: Adaptive dual-track cross-attention
# 
# Performance:
# - SQuAD 2.0: +21.6%
# - M3CoT (multimodal): +22.8%
# - QuAC: +18.9%
```

### 4.2 Alternative Architectures

#### Mamba vs Transformer

| Aspect | Transformer | Mamba-3 |
|--------|-------------|----------|
| Memory | Linear growth | Constant |
| Retrieval | High exact recall | Moderate selective |
| Speed | Slower at scale | Faster (MIMO) |
| Hallucination Source | Attention drift/sink | State compression loss |

**Prediction**: Hybrid interleaving Mamba (long-term memory) + Attention (precise retrieval)

### 4.3 Behaviorally Calibrated RL

**Surprising Finding (2026)**: 4B models outperform frontier models on uncertainty quantification.

```
Signal-to-Noise Ratio (SNR) Gain:
- Qwen3-4B (calibrated): 0.806
- GPT-5 (frontier): 0.207

→ Uncertainty quantification is "transferable meta-skill"
→ Can be decoupled from raw predictive accuracy
→ Train models to be "more self-aware" of limitations
```

---

## Module 5: Production Implementation

### 5.1 Layered Defense System

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: Input Validation                                      │
│  ├─ Query sanitization                                           │
│  ├─ Ambiguity detection                                          │
│  └─ Clarification requests when needed                           │
│                                                                 │
│  LAYER 2: Retrieval Quality (RAG)                               │
│  ├─ Hybrid search (vector + BM25)                                │
│  ├─ Cross-encoder re-ranking                                     │
│  ├─ Time-scope grounding (for temporal queries)                  │
│  └─ Knowledge graph augmentation                                  │
│                                                                 │
│  LAYER 3: Generation Guardrails                                 │
│  ├─ Prompt constraints ("only from retrieved docs")              │
│  ├─ Escalation behaviors ("say I don't know")                    │
│  ├─ Inline citation requirements                                 │
│  └─ Logit filtering for overconfident outputs                   │
│                                                                 │
│  LAYER 4: Verification                                          │
│  ├─ Multi-agent checking (solver/checker separation)            │
│  ├─ Semantic energy monitoring                                   │
│  ├─ Self-consistency voting                                     │
│  └─ TokenShapley attribution validation                          │
│                                                                 │
│  LAYER 5: Output Guardrails                                     │
│  ├─ Uncertainty thresholds                                       │
│  ├─ Evidence window enforcement                                  │
│  ├─ Human-in-the-loop escalation                                │
│  └─ Disciplined refusal when evidence absent                     │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Self-Correcting Loop (High-Stakes Domains)

```python
# Pattern for clinical/financial/legal
RETRIEVE → EVALUATE → REFINE CYCLE

1. Semantic Validation
   - Query → structured format (Cypher for GraphRAG)
   - Validate logical correctness before execution

2. Sufficiency Evaluation
   - Self-consistency voting
   - Dual-model cross-validation
   - "Completeness" assessment of evidence

3. Corrective Looping
   - If knowledge gaps detected → RETRY_SEARCH
   - Modify search depth
   - Traverse different graph paths

4. Fallback
   - Disciplined refusal if evidence still absent
   - "Answer not graph-verified" > probabilistic guess

# Clinical Results: Faithfulness 0.94, Answer Relevancy 0.91
```

### 5.3 Evaluation Frameworks

#### Metrics

| Metric | Purpose | Target |
|--------|---------|--------|
| Faithfulness | Response grounded in context | > 0.90 |
| Answer Relevancy | Response addresses query | > 0.85 |
| Citation Accuracy | Citations support claims | > 0.95 |
| Refusal Rate | Appropriate uncertainty | Context-dependent |

#### Tools (2026)

| Tool | Focus | Best For |
|------|-------|----------|
| **Maxwell AI** | Bi-phasic RAG scoring | Full pipeline evaluation |
| **Braintrust** | Production failure capture | Closed-loop improvement |
| **Galileo** | RAG metrics + adherence | Vendor-specific scoring |
| **CiteBench** | Citation quality | Legal/medical compliance |

### 5.4 Production Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| TTFT (p90) | < 2 seconds | Time to first token |
| Cache Hit Rate | > 60% | Semantic caching |
| Hallucination Rate | < 3% | Even best models at 3.1-3.3% |
| Citation Accuracy | > 95% | Non-negotiable in regulated |

---

## Module 6: Anti-Patterns to Avoid

### 6.1 Common Mistakes

| Anti-Pattern | Why It Fails | Correction |
|--------------|--------------|------------|
| Static Top-K retrieval | Fails when user intent shifts | State-aware query planning |
| Document-level citations | Can't detect "unsupported residue" | Token-level attribution |
| Temperature 0 for factuality | Can increase fabrication in complex docs | Tune per use case |
| "Don't hallucinate" prompt | Cosmetic, ineffective | Structural constraints + citations |
| Single model for generation + verification | Confirmation bias | Isolated skeptic agent |
| Accuracy-only evaluation | Encourages guessing | Risk-adjusted rewards |

### 6.2 Red Flags

```
⚠️ Model provides specific numbers/dates without citing source
⚠️ Response sounds confident but source is generic
⚠️ No mechanism for "I don't know" when evidence absent
⚠️ Single-pass generation without verification
⚠️ Long-context without attention re-anchoring
```

---

## Module 7: Quick Reference

### Decision Tree: Which Technique?

```
Is factual accuracy critical?
├─ NO → Creative/generative task
│       └─ Focus on CoT for logic, accept some hallucination risk
│
└─ YES → High-stakes domain?
         ├─ NO → RAG + citations + calibration
         │       └─ Layer 1-3 defense
         │
         └─ YES → Clinical/legal/financial
                 ├─ GraphRAG + multi-agent verification
                 ├─ TokenShapley attribution
                 └─ Disciplined refusal mechanism
                         └─ Layer 1-5 defense
```

### Technique Quick Reference

| Situation | Primary Technique | Backup Technique |
|-----------|------------------|-----------------|
| Need grounding | RAG + citations | Knowledge graph |
| Need verification | Semantic Energy | Neural probes |
| Need accuracy | Multi-agent (solver/checker) | Self-consistency |
| Long context | SinkTrack / ART | Chunk + re-anchor |
| Regulatory compliance | TokenShapley | CiteBench evaluation |
| Unknown uncertainty | Semantic Entropy | Sampling + clustering |

### Emergency Protocols

```markdown
## When Hallucination Detected

1. STOP generation if possible
2. Log: What was generated? What was expected?
3. Route to verification agent
4. If verified hallucination:
   - Discard output
   - Trigger retry with stricter constraints
   - Add to evaluation test suite
5. Escalate if pattern detected
```

---

## Appendix: Key Research References

### Foundational Papers
- Semantic Entropy (Nature 2024)
- Semantic Energy (OpenReview 2025)
- Why Language Models Hallucinate (arXiv 2509.04664)
- ART: Attention Replacement Technique (arXiv 2604.06393)
- SinkTrack (OpenReview 2026)
- TokenShapley (ACL 2025)

### Production Frameworks
- LangGraph: Stateful agentic workflows
- LlamaIndex: Retrieval specialists (150+ connectors)
- DSPy: Programmatic prompt compilation

### Evaluation
- Vectara Hallucination Leaderboard
- CiteBench / CiteEval
- RAGAS metrics

---

## Module 8: ForgeWright-Specific Implementation

### 8.1 ForgeWright Risk Assessment

Based on codebase audit (April 2026):

| Area | Risk | Current State | Required Changes |
|------|------|--------------|-----------------|
| Wiki Generation | 🔴 HIGH | Direct LLM output | RAG + skeptic + citations |
| Impact Analysis | 🟡 MEDIUM | Stale graph data | Freshness check + uncertainty |
| NL Queries | 🟡 MEDIUM | No confidence | Confidence scores |
| Framework Detection | 🟡 MEDIUM | Pattern matching | Uncertainty indication |
| Indexing Pipeline | 🟢 LOW | Deterministic | Binding verification |

### 8.2 ForgeWright LLM Integration Points

#### Point 1: Embedding Generation
**File**: `forgenexus/src/data/embeddings.ts`

```typescript
// CURRENT: Returns embedding only
interface EmbeddingResult {
  embedding: number[];
  provider: string;
}

// RECOMMENDED: Add confidence and freshness
interface EmbeddingResult {
  embedding: number[];
  provider: string;
  confidence: number;        // NEW: 0-1 scale
  staleness?: Date;          // NEW: Last updated
  verified: boolean;         // NEW: Cross-checked
}
```

#### Point 2: Wiki Generation
**File**: `forgenexus/src/cli/wiki.ts`

```typescript
// CURRENT: Direct LLM call
async function generateWiki(repoPath: string) {
  const context = await buildContext(repoPath);
  const docs = await llm.generate(`Generate docs for: ${context}`);
  // No verification, no citations, no confidence
}

// RECOMMENDED: Add all 5 layers
async function generateWikiSecure(repoPath: string) {
  // Layer 1: Input validation
  const validated = validateQuery("Generate documentation", repoPath);
  
  // Layer 2: RAG grounding
  const context = await buildContext(repoPath);
  const grounded = await retrieveWithCitations(repoPath, context);
  
  // Layer 3: Guardrails
  const docs = await llm.generate({
    prompt: `Document based ONLY on: ${grounded}`,
    constraints: [
      "Only describe present code",
      "Cite [source:filepath:line]",
      "Say NOT_VERIFIED if unclear"
    ],
    citationRequired: true
  });
  
  // Layer 4: Skeptic verification
  const verified = await skeptic.verify(docs, grounded);
  
  // Layer 5: Output guardrails
  if (verified.confidence < 0.7) {
    docs.addWarning("Low verification confidence");
  }
  
  return docs;
}
```

#### Point 3: Impact Analysis
**File**: `forgenexus/src/data/graph.ts`

```typescript
// CURRENT: Returns results only
function analyzeImpact(symbol: string): ImpactResult {
  return { affectedFiles, callers, callees };
}

// RECOMMENDED: Add freshness and uncertainty
function analyzeImpactSecure(symbol: string): SecureImpactResult {
  const result = analyzeImpact(symbol);
  const freshness = checkStaleness();
  
  return {
    ...result,
    freshness: freshness.staleness,
    lastIndexed: freshness.lastIndexed,
    confidence: freshness.staleness === 'fresh' ? 0.9 : 0.6,
    warnings: freshness.staleness !== 'fresh' 
      ? ["Graph data may be stale. Run: forgenexus analyze --force"]
      : []
  };
}
```

#### Point 4: Query Results
**File**: `forgenexus/src/mcp/tools/query.ts`

```typescript
// CURRENT
interface QueryResult {
  results: SearchResult[];
}

// RECOMMENDED
interface QueryResult {
  results: SearchResult[];
  confidence: number;              // NEW: 0-1 scale
  uncertaintyFlags: string[];        // NEW: e.g., "ambiguous"
  grounding: {
    sources: string[];
    citationRequired: boolean;
  };
  fallbackBehavior: "return_best" | "clarify" | "refuse";
}

function calculateConfidence(results: SearchResult[]): number {
  if (results.length === 0) return 0;
  if (results.length > 20) return 0.4; // Too noisy
  const avgRelevance = results.reduce((s, r) => s + r.relevance, 0) / results.length;
  return Math.min(avgRelevance * 0.9 + 0.1, 0.98);
}
```

### 8.3 Skeptic Agent for ForgeWright

```typescript
// forgenexus/src/agents/skeptic.ts
export class SkepticAgent {
  name = 'ForgeWright Skeptic';
  
  async verifyImpactAnalysis(params: {
    symbol: string;
    claim: string;
    graph: GraphData;
  }): Promise<VerificationResult> {
    // Independent verification
    const verification = await this.llm.generate(`
      Verify: "${params.claim}" for symbol "${params.symbol}"
      Graph evidence: ${params.graph.summary}
      
      Respond: CONFIRMED / UNCONFIRMED / UNCERTAIN
      If UNCERTAIN, explain why
    `);
    
    return this.parseResult(verification);
  }
  
  async verifyWikiClaim(params: {
    claim: string;
    sources: CodeEvidence[];
  }): Promise<VerificationResult> {
    return this.verifyWithEvidence(params.claim, params.sources);
  }
}
```

### 8.4 Freshness Monitoring

```typescript
// forgenexus/src/data/freshness.ts
export interface GraphMetadata {
  lastIndexed: Date;
  commitHash: string;
  staleness: 'fresh' | 'stale' | 'critical';
}

export function checkStaleness(repoPath: string): GraphMetadata {
  const meta = getGraphMetadata(repoPath);
  const hoursSinceIndex = (Date.now() - meta.lastIndexed) / 3600000;
  
  return {
    ...meta,
    staleness: hoursSinceIndex < 24 ? 'fresh'
             : hoursSinceIndex < 72 ? 'stale'
             : 'critical'
  };
}

export function warnIfStale(repoPath: string): void {
  const { staleness, lastIndexed } = checkStaleness(repoPath);
  
  if (staleness === 'critical') {
    console.warn(`
      ⚠️  INDEX STALENESS WARNING
      
      Graph data: ${lastIndexed.toISOString()}
      Hours since index: ${((Date.now() - lastIndexed) / 3600000).toFixed(1)}
      
      Impact analysis may contain outdated information.
      Run: forgenexus analyze --force
    `);
  }
}
```

### 8.5 Confidence Calibration

```typescript
// forgenexus/src/mcp/tools/confidence.ts
export interface ConfidenceConfig {
  thresholds: {
    high: number;      // > 0.9: Green, no action
    medium: number;     // 0.7-0.9: Yellow, note
    low: number;       // 0.5-0.7: Orange, warn
    critical: number;   // < 0.5: Red, refuse/clarify
  };
  behaviors: {
    medium: "note" | "warn" | "block";
    low: "warn" | "block";
    critical: "refuse" | "request_clarification";
  };
}

export const DEFAULT_CONFIG: ConfidenceConfig = {
  thresholds: { high: 0.9, medium: 0.7, low: 0.5, critical: 0.3 },
  behaviors: { medium: "note", low: "warn", critical: "refuse" }
};
```

---

## Module 9: ForgeWright Audit Summary

### Risk Matrix

```
                    PROBABILITY
          Low       Medium      High
      ┌──────────┬──────────┬──────────┐
Low   │ Indexing │ Community│          │
      │          │ Detect  │          │
      ├──────────┼──────────┼──────────┤
IMPACT Medium    │Framework │  Query   │
      │          │ Detect   │ Intent   │
      ├──────────┼──────────┼──────────┤
High  │          │          │  Wiki    │
      │          │          │Generation│
      └──────────┴──────────┴──────────┘
```

### Priority Actions

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Add confidence to queries | 1 day | HIGH |
| 2 | Add staleness warnings | 1 day | HIGH |
| 3 | Skeptic agent for wiki | 1 week | HIGH |
| 4 | Citation in docs | 2 days | MEDIUM |
| 5 | Binding verification | 1 week | MEDIUM |

### Evaluation Metrics

| Metric | Target | Method |
|--------|--------|--------|
| Wiki accuracy | > 95% | Manual spot-check |
| Query confidence calibration | ECE < 0.1 | Test set |
| Staleness detection | > 90% | Synthetic tests |

---

## Usage Examples

### Example 1: Research Task
```
Prompt: "Based on the uploaded papers, summarize findings on X"
Skill applies:
1. RAG with hybrid retrieval
2. Inline citations required
3. Multi-agent verification (synthesizer + skeptic)
4. TokenShapley validation
5. "Not in sources" for absent information
```

### Example 2: Code Generation
```
Prompt: "Write function to parse JSON with error handling"
Skill applies:
1. Retrieve relevant documentation
2. Citation for API usage
3. Test cases with verification
4. Self-consistency check on edge cases
```

### Example 3: Legal/Compliance
```
Task: Review contract for risks
Skill applies:
1. GraphRAG with legal knowledge graph
2. Multi-agent (reviewer + compliance checker)
3. TokenShapley for each risk claim
4. Disciplined refusal if clause unclear
5. Human escalation for high-risk items
```

---

## Maintenance

### Regular Tasks
- [ ] Update hallucination benchmarks (Vectara leaderboard)
- [ ] Review and update citation requirements
- [ ] Tune uncertainty thresholds based on domain
- [ ] Add new failure patterns to test suite
- [ ] Evaluate new architectures (Mamba hybrids)

### Version History
- v1.1: Added ForgeWright-specific implementation (April 2026)
  - Risk assessment for 5 areas
  - Skeptic agent template
  - Freshness monitoring
  - Confidence calibration
- v1.0: Initial research-based skill (April 2026)
- Based on 161 verified sources (2025-2026 research)

---

*This skill transforms hallucination research into actionable practices. Update based on emerging research and production learnings.*
