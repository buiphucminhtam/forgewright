# Implementation Plan v2.0 - Summary

**Version**: 2.0  
**Date**: April 2026  
**Duration**: 9 weeks (8 + 1 buffer)  
**Team**: 1-2 engineers

---

## Changelog: v1.0 → v2.0

| Issue from Evaluation | Fix Applied |
|----------------------|-------------|
| Missing Semantic Energy | Added Week 1 + Week 3 (enhanced) |
| Missing RAG module | Added Week 2 (Wiki depends on it) |
| Week 1 overloaded | Reduced scope, moved some tasks |
| No LLM dependency | Added `@anthropic-ai/sdk` |
| TokenShapley deferred too long | Moved from Week 5 → Week 3 |
| Evaluation dataset too ambitious | Start Week 1, gradual expansion |
| Missing Framework Detection confidence | Added Week 4 |
| No buffer time | Added Week 9 as buffer |
| No mock LLM for testing | Added Week 1 |

---

## 9-Week Timeline

```
Week 1: Foundation
├── Agent types + prompts
├── GuardedLLMClient + MockLLMClient
├── Skeptic Agent (simplified)
├── Confidence Module
├── Semantic Energy (simplified)
└── Evaluation dataset (10 cases)

Week 2: CLI + RAG
├── RAG Module (retriever, hybrid search, reranker)
├── Wiki Command (with verification)
├── Freshness Module
├── Impact Command (with freshness)
└── Query Tool (with confidence)

Week 3: Multi-Agent + Advanced
├── Semantic Energy (enhanced)
├── Synthesizer Agent
├── Multi-Agent Workflow
├── Citation Extraction + TokenShapley
└── MCP Verification Tools

Week 4: Advanced Verification
├── Binding Verification
├── Framework Detection (with confidence)
└── Consistency Checks

Week 5-6: Evaluation
├── 30 Evaluation Cases
├── Evaluation Runner
├── CLI Evaluation Command
└── Documentation

Week 7: Testing
├── Integration Tests
├── Performance Tests
└── Bug Fixes

Week 8: Staged Rollout
├── Internal Testing (strict)
├── Beta Rollout
└── Full Launch Prep

Week 9: Buffer + Launch
├── Polish
├── Public Launch
└── Monitoring
```

---

## New Additions (v2.0)

### 1. RAG Module (Week 2)
```
forgenexus/src/rag/
├── index.ts
├── retriever.ts         # retrieveWithCitations()
├── hybrid-search.ts     # BM25 + vector
├── reranker.ts
└── chunker.ts
```

### 2. Semantic Energy (Week 1 + Week 3)
- Week 1: Simplified (ensemble-based)
- Week 3: Enhanced (API logits + ensemble fallback)
- +13% AUROC improvement

### 3. Mock LLM Client (Week 1)
```typescript
class MockLLMClient {
  // Configurable responses for offline testing
  // Enables TDD for skeptic agent
}
```

### 4. TokenShapley (Week 3)
- Moved from Week 5 → Week 3
- +11-23% attribution improvement

### 5. Framework Detection with Confidence (Week 4)
- Addresses audit gap (5-15% false positive rate)
- Adds confidence scoring + warnings

---

## File Structure

```
forgenexus/src/
├── agents/
│   ├── types.ts, prompts.ts, index.ts
│   ├── llm-client.ts        # GuardedLLMClient + MockLLMClient
│   ├── skeptic.ts
│   ├── synthesizer.ts
│   ├── multi-agent.ts
│   ├── citations.ts          # + TokenShapley
│   ├── confidence.ts        # + Semantic Energy
│   └── semantic-energy.ts   # NEW (enhanced)
├── rag/                     # NEW
│   ├── index.ts, retriever.ts, hybrid-search.ts
│   ├── reranker.ts, chunker.ts
├── data/
│   ├── freshness.ts         # NEW
│   └── db.ts
├── cli/
│   ├── wiki.ts, impact.ts, evaluate.ts
│   └── index.ts
├── mcp/tools/
│   ├── query.ts, verify.ts  # NEW
│   └── index.ts
├── analysis/
│   ├── binding-verification.ts, consistency.ts
│   ├── framework-detection.ts
│   └── binding-propagation.ts
└── evaluation/
    ├── dataset.ts, runner.ts
    └── index.ts
```

---

## Success Metrics

| Metric | Target | Method |
|--------|--------|--------|
| Wiki accuracy | > 95% | Evaluation dataset |
| Citation accuracy | > 90% | Citation verification |
| Confidence ECE | < 0.1 | Calibration bins |
| Semantic Energy AUROC | > 0.8 | Test set |
| Framework confidence | > 0.8 | Ground truth |
| Performance overhead | < 30% | Benchmarks |
| User trust score | > 4.0/5 | Feedback |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM API failures | Medium | High | Mock fallback + retry |
| Performance overhead | High | Medium | Caching + Week 9 buffer |
| False positives | Medium | Medium | Tunable thresholds |
| Breaking changes | Low | High | Feature flags |

---

## Documentation Created

| File | Version | Description |
|------|---------|-------------|
| `implementation-plan-v2.md` | 2.0 | Detailed plan |
| `implementation-roadmap-v2.md` | 2.0 | Visual roadmap |
| `anti-hallucination-audit.md` | - | Full audit |
| `anti-hallucination-summary.md` | - | Quick summary |
| `implementation-evaluation.md` | - | Plan evaluation |

---

## Next Steps

1. **Review** this plan with team
2. **Approve** v2.0 or request changes
3. **Assign** ownership for each week
4. **Start** Week 1 tasks

---

*Plan Version: 2.0*  
*Based on: Evaluation v1.0 recommendations*  
*Ready for execution*
