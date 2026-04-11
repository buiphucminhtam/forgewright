# Plan Evaluation: ForgeWright Anti-Hallucination Implementation

**Evaluator**: AI Research (Anti-Hallucination Framework v1.0)  
**Date**: April 2026  
**Plan Version**: 1.0  
**Duration Assessed**: 8 weeks, 1-2 engineers

---

## Executive Assessment

### Overall Grade: B+ (7.5/10)

The plan is well-structured with comprehensive coverage, but has several areas that need refinement before execution.

---

## Strengths

### 1. Structured Phasing ✅

The 4-phase approach (Foundation → Advanced → Evaluation → Rollout) is logical and builds progressively.

| Phase | Logic | Assessment |
|-------|-------|------------|
| Week 1-2: Foundation | Build infrastructure before integration | ✅ Sound |
| Week 3-4: Advanced | Add complexity after basics work | ✅ Sound |
| Week 5-6: Evaluation | Validate before launch | ✅ Critical for credibility |
| Week 7-8: Rollout | Staged rollout with rollback plan | ✅ Best practice |

### 2. Comprehensive Coverage ✅

The plan addresses all major hallucination risk areas identified in the audit:

| Risk Area | Plan Coverage | Notes |
|-----------|--------------|-------|
| Wiki Generation | ✅ Full | RAG + skeptic + citations |
| Impact Analysis | ✅ Full | Freshness + skeptic |
| NL Queries | ✅ Full | Confidence + flags |
| Binding Propagation | ✅ Partial | Week 4 verification |
| Framework Detection | ❌ Missing | Not addressed |

### 3. Research-Based Techniques ✅

The plan incorporates state-of-the-art techniques from 2025-2026 research:

| Technique | Research Source | Implementation |
|-----------|----------------|---------------|
| Skeptic Agent | Multi-agent verification (84.5% accuracy) | ✅ Week 1-3 |
| Semantic Energy | +13% AUROC improvement | ❌ Not planned |
| TokenShapley | +11-23% attribution | ⚠️ Deferred |
| Confidence Calibration | ECE < 0.1 target | ✅ Week 1 |

### 4. Risk Awareness ✅

The plan includes a rollback plan and risk matrix.

### 5. Testing Strategy ✅

Comprehensive unit, integration, and E2E testing is planned.

---

## Weaknesses & Gaps

### 1. Missing: Semantic Energy for Uncertainty Quantification

**Impact**: High  
**Current Plan**: Only basic confidence scoring  
**Research Finding**: Semantic Energy outperforms standard methods by 13% AUROC

**Recommendation**:
```typescript
// Add to Week 1 tasks
interface SemanticEnergyConfig {
  usePenultimateLogits: boolean;
  boltmannConstant: number;
}

async function calculateSemanticEnergy(text: string): Promise<number> {
  // Use penultimate layer logits
  // Boltzmann-inspired energy calculation
  // Higher energy = more uncertain
}
```

### 2. Missing: Framework Detection Uncertainty

**Impact**: Medium  
**Current Plan**: Not addressed  
**Audit Finding**: Framework detection has 5-15% false positive rate

**Recommendation**: Add to Week 2 or 4:
```typescript
interface FrameworkDetectionResult {
  framework: string;
  confidence: number;
  evidence: string[];
  warnings: string[]; // "Low confidence, verify manually"
}
```

### 3. TokenShapley Deferred Too Long

**Impact**: Medium  
**Current Plan**: Phase 3 (Week 5-6)  
**Research Finding**: Attribution accuracy improves 11-23% with TokenShapley

**Recommendation**: Move to Week 3 with citation extraction.

### 4. No Explicit RAG Implementation

**Impact**: High  
**Current Plan**: References "retrieveWithCitations" but no actual RAG implementation

**Missing**:
- RAG retrieval strategy
- Chunking strategy
- Hybrid search (BM25 + vector)
- Reranking

**Recommendation**: Add RAG module in Week 2:
```typescript
// forgenexus/src/rag/
// ├── retriever.ts
// ├── chunker.ts
// ├── reranker.ts
// └── hybrid-search.ts
```

### 5. Evaluation Dataset Too Ambitious

**Impact**: Medium (schedule risk)  
**Current Plan**: 130 test cases in Week 5  
**Reality**: Creating quality ground truth is time-consuming

**Recommendation**:
- Start dataset creation in Week 1 (ongoing)
- Prioritize 30 high-impact cases first
- Expand to 130 over time

### 6. Missing: MCP Server Verification Tools

**Impact**: Medium  
**Current Plan**: `verify_claim`, `analyze_confidence`, `check_freshness` tools in Week 3  
**Issue**: These are critical for agentic workflows

**Recommendation**: Move to Week 2 or make Week 3 blockers.

---

## Schedule Risks

### 1. Week 1 is Overloaded

| Task | Estimated Effort | Week 1 Capacity |
|------|------------------|-----------------|
| Agent types | 0.5 days | ✅ |
| Skeptic agent | 2-3 days | ✅ |
| LLM client | 2 days | ⚠️ Tight |
| Freshness module | 1 day | ✅ |
| Confidence module | 1 day | ✅ |
| Tests | 1 day | ⚠️ Tight |

**Total**: 7.5-9 days for 5-day week = **Schedule risk**

### 2. Skeptic Agent is Complex

The skeptic agent requires:
- Multiple verification methods (claim, document, impact)
- Prompt engineering
- Error handling
- Integration with LLM client

**Realistic estimate**: 3-4 days for robust implementation

### 3. Integration Testing Underestimated

Week 7 has:
- Integration tests (3 days)
- Performance tests (2 days)
- Bug fixes (2 days)

**Total**: 7 days = **No buffer**

---

## Resource Gaps

### 1. LLM API Requirements

| Component | API Needed | Current Setup |
|-----------|------------|---------------|
| Skeptic agent | Claude/GPT-4 | ❌ Not in package.json |
| Synthesizer | Claude/GPT-4 | ❌ Not in package.json |
| Evaluation | Claude/GPT-4o | ❌ Not in package.json |

**Gap**: No LLM dependency in current `package.json`

### 2. Embedding Model Not Specified

| Use Case | Model Needed | Current Setup |
|----------|--------------|---------------|
| RAG retrieval | text-embedding-3-small or similar | ✅ Has embeddings.ts |
| TokenShapley | Local model or API | ❌ Not planned |

### 3. Testing Infrastructure

| Need | Current | Gap |
|------|---------|-----|
| Jest setup | ✅ Has test scripts | None |
| Mock LLM | ❌ Not planned | Create mocks for offline testing |
| Fixture data | ❌ Not planned | Need codebases for testing |

---

## Critical Path Analysis

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CRITICAL PATH                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Week 1        Week 2        Week 3        Week 4        Week 5-6    │
│  ────────      ────────      ────────      ────────      ─────────    │
│                                                                             │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌────────┐   │
│  │ Types   │──▶│ Wiki   │──▶│ Multi- │──▶│Binding  │──▶│ Eval   │   │
│  │ Skeptic │   │ CLI    │   │ Agent  │   │ Verify  │   │Dataset │   │
│  │ LLM     │   │ Impact │   │ Verify │   │         │   │ Runner │   │
│  │ Client  │   │ Query  │   │ Tools  │   │         │   │        │   │
│  └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘   │
│       │             │             │             │             │        │
│       │             │             │             │             │        │
│       ▼             ▼             ▼             ▼             ▼        │
│                                                                             │
│  ⚠️ If Skeptic takes 5 days instead of 3: +2 day slip                    │
│  ⚠️ If Wiki CLI integration fails: +3 day slip                            │
│  ⚠️ If LLM API has issues: +∞ (blocker)                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Critical Bottlenecks

1. **Skeptic Agent** (Week 1) - Everything depends on this
2. **LLM API Setup** (Week 1) - Blocked if not ready
3. **Wiki CLI Integration** (Week 2) - Downstream dependency
4. **Evaluation Dataset** (Week 5) - Can't launch without it

---

## Recommendations for Plan Improvement

### 1. Add Buffer Time

```
Current: 8 weeks, no buffer
Recommended: 8 weeks + 1 week buffer (10%)

Or reduce scope:
- Defer: TokenShapley, consistency checks
- Keep: Core verification, citations, confidence
```

### 2. Add LLM API Dependency Explicitly

```json
// Add to package.json dependencies
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0"
  },
  "peerDependencies": {
    "anthropic": ">= 0.20.0"
  }
}
```

### 3. Add RAG Module

```typescript
// forgenexus/src/rag/
// Week 2: Implement before wiki integration
```

### 4. Start Evaluation Dataset Earlier

```
Week 1: Define schema and first 10 cases
Week 2-4: Add cases as features are built
Week 5: Complete and validate
```

### 5. Add Semantic Energy (Simplified)

```
Week 1: Basic confidence scoring
Week 3: Add Semantic Energy (if time permits)
```

### 6. Add Framework Detection Confidence

```
Week 4: Add confidence to framework detection
```

---

## Revised Timeline (Recommended)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REVISED TIMELINE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Week 1: Foundation (Reduce scope)                                         │
│  ├─ Types + Skeptic Agent (3 days)                                       │
│  ├─ LLM Client (2 days)                                                   │
│  └─ Confidence Module (1 day)                                             │
│                                                                             │
│  Week 2: CLI Integration                                                   │
│  ├─ Wiki with RAG (2 days)                                                │
│  ├─ Impact with freshness (1 day)                                         │
│  └─ Query with confidence (1 day)                                          │
│                                                                             │
│  Week 3: Multi-Agent + Tools                                              │
│  ├─ Multi-agent workflow (2 days)                                         │
│  ├─ MCP verification tools (2 days)                                       │
│  └─ Citation extraction (1 day)                                            │
│                                                                             │
│  Week 4: Advanced Verification                                             │
│  ├─ Binding verification (2 days)                                         │
│  ├─ TokenShapley (2 days)                                                 │
│  └─ Consistency checks (1 day)                                             │
│                                                                             │
│  Week 5: Evaluation + Polish                                              │
│  ├─ Dataset (30 cases) (2 days)                                          │
│  ├─ Evaluation runner (2 days)                                            │
│  └─ Performance optimization (1 day)                                       │
│                                                                             │
│  Week 6-7: Testing + Rollout                                               │
│  ├─ Integration testing (2 days)                                           │
│  ├─ Beta rollout (3 days)                                                 │
│  └─ Bug fixes + launch (2 days)                                           │
│                                                                             │
│  Week 8: Buffer (if needed)                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Open Questions

| Question | Impact | Recommendation |
|----------|--------|-----------------|
| Which LLM for skeptic? | High | Claude 3.5 Sonnet for cost/quality |
| RAG vector store? | Medium | Use existing embedding infrastructure |
| Evaluation dataset ownership? | Medium | Start Week 1 |
| Performance SLA? | Low | Define in Week 1 |
| Beta user selection? | Low | Define in Week 6 |

---

## Final Recommendations

### Must Fix Before Execution

1. **Add LLM API dependency** - Critical blocker
2. **Add RAG module** - Wiki verification depends on it
3. **Reduce Week 1 scope** - Too aggressive
4. **Add buffer time** - No buffer currently
5. **Start evaluation dataset Week 1** - Can't launch without it

### Should Fix Before Execution

6. **Add Semantic Energy** - Improves detection by 13%
7. **Add Framework Detection confidence** - Addresses audit gap
8. **Define LLM model choices** - Cost and quality implications
9. **Add mock LLM for testing** - Enables offline development

### Nice to Have

10. **Detailed API contracts** - Reduces integration risk
11. **Performance benchmarks** - Current baseline needed
12. **User research** - Validate priorities with actual users

---

## Conclusion

The plan is solid foundationally but needs refinement before execution. The core issue is **scope vs. time** - the 8-week timeline is aggressive for 1-2 engineers, especially with the complexity of LLM integration and multi-agent systems.

**Recommended Action**: 
1. Review this evaluation with team
2. Make "Must Fix" decisions
3. Adjust timeline/scope accordingly
4. Start Week 1 with reduced scope

---

## Appendix: Evaluation Criteria Used

| Criterion | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Completeness | 20% | 7/10 | Missing Semantic Energy, RAG, framework detection |
| Realism | 20% | 6/10 | Week 1 overloaded, no buffer |
| Research alignment | 15% | 8/10 | Good use of 2025-2026 research |
| Risk awareness | 15% | 8/10 | Has rollback plan, risk matrix |
| Testability | 15% | 8/10 | Comprehensive testing strategy |
| Implementability | 15% | 7/10 | LLM dependency gap, no mocks |
| **TOTAL** | 100% | **7.2/10** | **Grade: B+** |

---

*Evaluation Version: 1.0*  
*Assessor: Anti-Hallucination Framework v1.0*
