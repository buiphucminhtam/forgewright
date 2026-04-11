# ForgeWright Hallucination Risk Assessment

## Quick Summary

| Area | Risk | Action Required |
|------|------|-----------------|
| Wiki Generation | 🔴 HIGH | Add verification + citations |
| Impact Analysis | 🟡 MEDIUM | Add freshness check + uncertainty |
| NL Queries | 🟡 MEDIUM | Add confidence scores |
| Indexing | 🟢 LOW | Add binding verification |

## Critical Findings

### 1. Wiki Generation - HIGH RISK

**Current**: LLM generates docs directly with no verification.

**Required Changes**:
```typescript
// Add grounding
const docs = await llm.generate({
  prompt: "Generate docs from THIS code evidence...",
  constraints: [
    "Only describe code present",
    "Cite [source:file:line]",
    "Say NOT_VERIFIED if unclear"
  ],
  citationRequired: true
});

// Add skeptic verification
const verified = await skeptic.verify(docs, codeEvidence);
if (!verified.allVerified) {
  docs.flagUnverified(verified.issues);
}
```

### 2. Impact Analysis - MEDIUM RISK

**Current**: Uses potentially stale graph data.

**Required Changes**:
```typescript
// Add staleness check
const { staleness } = checkStaleness();
if (staleness === 'critical') {
  warn("Graph data outdated. Run: forgenexus analyze --force");
}

// Add confidence scoring
return {
  impact: results,
  confidence: verified.confidence,
  warnings: staleness > 72 ? ["Data may be stale"] : []
};
```

### 3. Query Results - MEDIUM RISK

**Current**: Returns results without confidence indication.

**Required Changes**:
```typescript
// Add confidence
interface QueryResult {
  results: SearchResult[];
  confidence: number; // 0-1
  uncertaintyFlags: string[];
  fallbackBehavior: "return_best" | "request_clarification";
}
```

## Priority Roadmap

### Week 1: Quick Wins
- [ ] Confidence scores on queries
- [ ] Staleness warnings
- [ ] "I don't know" in wiki

### Week 2-3: Core Defenses
- [ ] Skeptic agent
- [ ] RAG grounding for wiki
- [ ] Citation requirements

### Month 2: Advanced
- [ ] TokenShapley attribution
- [ ] Multi-agent verification
- [ ] Evaluation framework

## Key Research Insights

Based on 161 sources (2025-2026):

| Technique | Effectiveness |
|-----------|---------------|
| RAG + Citations | 40-71% reduction |
| Semantic Energy | +13% AUROC |
| Multi-agent verification | 84.5% accuracy |
| TokenShapley | +11-23% attribution |

## Files Changed

- `forgenexus/docs/anti-hallucination-audit.md` - Full audit report
- `forgenexus/skills/anti-hallucination.md` - Anti-hallucination skill

---

*Audit Date: April 2026*
