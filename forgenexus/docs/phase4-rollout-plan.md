# Phase 4 Rollout — Prioritized Plan
**Date**: June 2026
**Status**: Ready to execute
**Based on**: `forgenexus/docs/implementation-roadmap-v2.md`
**Validated by**: Forgewright Pipeline (Architect mode, 9.0/10)

---

## Executive Summary

2 phases đầu (Foundation + Advanced) ✅ COMPLETE. Phase 3 (Evaluation) partial — có dataset + runner nhưng chưa chạy. Phase 4 (Rollout) hoàn toàn chưa đụng.

**Remaining work**: 5 sprints, ~3-4 tuần, ưu tiên P0→P5.

---

## Critical Gaps (discovered via Forgewright pipeline)

| Gap | Evidence | Impact |
|-----|----------|--------|
| No e2e tests exist | `forgenexus/src/e2e/` empty | P0 = 5 days, not 1-2 |
| Eval runner uses `{} as any` mock | `evaluation/runner.ts:55` | P2b needs real integration |
| No feature flags implemented | Not in `forgenexus/src/` | P2 cannot skip |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jun 2026 | Initial plan from roadmap analysis |
| 1.1 | Jun 2026 | Forgewright pipeline validation: 23-day estimate, 8 milestones, 3 gaps discovered |

---

## Priority 0 — Blocker

### Sprint P0: Integration Tests

**Rationale**: Không có integration tests, không biết anti-hallucination system có hoạt động thật không.

**Deliverables**:
- `forgenexus/src/e2e/wiki-workflow.test.ts` — 10 cases
- `forgenexus/src/e2e/impact-workflow.test.ts` — 10 cases
- `forgenexus/src/e2e/query-workflow.test.ts` — 10 cases
- `forgenexus/src/e2e/multi-agent.test.ts` — 5 cases
- `forgenexus/src/e2e/binding-verification.test.ts` — 5 cases
- **Target**: Pass rate >95%

**Tasks**:

#### P0.1 Wiki Workflow Tests
```typescript
// forgenexus/src/e2e/wiki-workflow.test.ts
// Test cases: wiki-001 → wiki-010

describe('Wiki Workflow with Anti-Hallucination', () => {
  it('wiki-001: Generates docs with verified claims', async () => {
    // Verify output has citations, confidence score
  });
  it('wiki-002: Warns on low confidence', async () => {
    // --strict flag triggers warning
  });
  it('wiki-003: Refuses on unverified claims', async () => {
    // Mock skeptic returns false → refuse
  });
  // ... 10 total cases
});
```

#### P0.2 Impact Workflow Tests
```typescript
// forgenexus/src/e2e/impact-workflow.test.ts
// Test cases: impact-001 → impact-010

describe('Impact Workflow with Freshness', () => {
  it('impact-001: Warns on stale graph data', async () => {
    // Graph older than 7 days → warning
  });
  it('impact-002: Returns confidence score', async () => {
    // Output includes confidence: 0.85
  });
  // ... 10 total cases
});
```

#### P0.3 Query Workflow Tests
```typescript
// forgenexus/src/e2e/query-workflow.test.ts
// Test cases: query-001 → query-010

describe('Query Workflow with Confidence', () => {
  it('query-001: Returns uncertainty flags on ambiguous query', async () => {
    // high_variance → uncertaintyFlags
  });
  it('query-002: Falls back gracefully on low confidence', async () => {
    // confidence < 0.5 → fallbackBehavior: clarify
  });
  // ... 10 total cases
});
```

#### P0.4 Multi-Agent Tests
```typescript
// forgenexus/src/e2e/multi-agent.test.ts

describe('Multi-Agent Workflow', () => {
  it('synthesizer → skeptic loop converges', async () => {
    // Max 3 iterations, confidence threshold met
  });
  it('refuses after max iterations without confidence', async () => {
    // confidence < threshold after max_iter → refuse
  });
});
```

#### P0.5 Binding Verification Tests
```typescript
// forgenexus/src/e2e/binding-verification.test.ts

describe('Binding Verification', () => {
  it('detects missing definitions', async () => {
    // Symbol without definition → issue
  });
  it('detects ambiguous symbols', async () => {
    // Multiple definitions → warning
  });
});
```

---

## Priority 1 — Pre-Launch Must-Have

### Sprint P1: Performance Benchmarks + Baseline

**Rationale**: Anti-hallucination features không được nếu overhead >30%. Phải đo baseline trước khi optimize.

**Deliverables**:
- `forgenexus/benchmarks/cold-run.ts` — First run baseline
- `forgenexus/benchmarks/warm-cache.ts` — Cache effectiveness
- `forgenexus/benchmarks/partial-change.ts` — Incremental parsing
- `forgenexus/benchmarks/skeptic-latency.ts` — Verification overhead
- `forgenexus/benchmarks/rag-retrieval.ts` — Search performance
- CI gates: Fail nếu perf regression >10%
- **Target metrics**:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Small repo overhead | <5s | Cold run |
| Medium repo overhead | <15s | Cold run |
| Cache hit rate | >60% | Re-run |
| Skeptic latency | <2s | Per claim |
| Confidence calc | <100ms | Per query |
| RAG retrieval | <500ms | Per search |
| Memory overhead | <100MB | Heap delta |

**Tasks**:

#### P1.1 Benchmark Suite
```typescript
// forgenexus/benchmarks/index.ts
interface BenchmarkResult {
  name: string;
  coldTime: number;      // ms
  warmTime: number;      // ms
  cacheHitRate: number;  // 0-1
  memoryOverhead: number; // MB
  speedupRatio: number;  // cold/warm
}
```

#### P1.2 CI Performance Gates
```yaml
# .github/workflows/perf-regression.yml
# Run on every PR
- name: Performance Benchmark
  run: npx forgenexus benchmark --ci
  # Fail if: overhead > 110% of baseline
```

#### P1.3 Real-World Test (ForgeWright itself)
```bash
# Test on ForgeWright repo (~3000 files)
npx forgenexus analyze  # Cold
npx forgenexus analyze  # Warm
# Capture: time, cache stats, memory
```

---

## Priority 2 — Production Hardening

### Sprint P2: Staged Rollout Infrastructure

**Rationale**: Không có rollback plan thì launch production là mạo hiểm.

**Deliverables**:
- Feature flags: `FORGE_VERIFY`, `FORGE_STRICT`, `FORCE_NO_VERIFY`
- `--strict` mode cho wiki (high confidence threshold)
- `--no-verify` mode (fast bypass)
- Monitoring hooks (metrics logging)
- `forgenexus/docs/LAUNCH-CHECKLIST.md` — đã có, verify checklist items

**Tasks**:

#### P2.1 Feature Flags
```typescript
// forgenexus/src/config/feature-flags.ts
export const FEATURE_FLAGS = {
  verify: process.env.FORGE_VERIFY !== '0',      // default: true
  strict: process.env.FORGE_STRICT === '1',      // default: false
  noVerify: process.env.FORCE_NO_VERIFY === '1', // default: false
  enableSkeptic: process.env.FORGE_SKEPTIC !== '0', // default: true
  enableSemanticEnergy: process.env.FORGE_SEMANTIC_ENERGY !== '0', // default: true
};
```

#### P2.2 Rollback Mechanism
```bash
# Fast rollback
FORCE_NO_VERIFY=1 npx forgenexus wiki

# Or in config
# forgenexus.config.json
{
  "antiHallucination": {
    "verification": { "enabled": false }
  }
}
```

#### P2.3 Monitoring Hooks
```typescript
// forgenexus/src/telemetry/metrics.ts
interface VerificationMetrics {
  verificationAttempts: number;
  verificationPassed: number;
  citationAccuracy: number;
  averageConfidence: number;
  skepticLatency: number;     // ms
  ragRetrievalLatency: number; // ms
  hallucinationRate: number;  // 0-1
}
// Emit to: stdout (JSON), optional external APM
```

---

### Sprint P2b: Eval Runner — Real Execution

**Rationale**: Eval framework + 30 cases đã có nhưng chưa chạy thực tế.

**Deliverables**:
- Run eval trên ForgeWright codebase
- Real metrics: accuracy, ECE, hallucination rate, citation accuracy
- Fix false positives/negatives từ results
- Update dataset với ground truth thực

**Tasks**:

#### P2b.1 Run Eval Suite
```bash
# Run against ForgeWright itself
npx forgenexus evaluate \
  --dataset ./forgenexus/src/evaluation/dataset.ts \
  --output ./forgenexus/benchmarks/eval-results.json

# Expected output:
# Accuracy: 94.2%
# ECE: 0.08
# Hallucination Rate: 3.2%
# Citation Accuracy: 92.1%
```

#### P2b.2 Fix Evaluation Issues
```bash
# If any case fails:
# 1. Analyze failure reason
# 2. Update ground truth if needed
# 3. Fix system behavior if wrong
# 4. Re-run until green
```

#### P2b.3 Report Generation
```bash
# Human-readable report
npx forgenexus evaluate --report \
  --input ./benchmarks/eval-results.json \
  --output ./docs/eval-report-$(date +%Y%m%d).md
```

---

## Priority 3 — Soft Launch

### Sprint P3: Internal + Beta Testing

**Rationale**: Có integration tests + perf baseline rồi mới internal được.

**Deliverables**:
- Internal testing (2-3 team members, `--verify --strict`)
- Beta group (5-10 users, `--verify` default)
- Bug triage + fix cycle
- Threshold tuning từ real feedback

**Timeline**:
- Week 1: Internal strict mode
- Week 2-3: Beta rollout
- Ongoing: Bug fixes

**Tasks**:

#### P3.1 Internal Testing
```bash
# For internal team
forgenexus wiki --verify --strict
forgenexus impact --verify --strict
forgenexus query --verify --strict
# Collect: feedback, error logs, performance data
```

#### P3.2 Beta Rollout
```bash
# Beta users get default --verify enabled
# Enable via: FORGE_VERIFY=1 (default in beta)
# Feedback channel: Slack/Discord dedicated channel
```

#### P3.3 Threshold Tuning
```typescript
// Tunable thresholds (from beta feedback)
const THRESHOLDS = {
  wiki: {
    strict: 0.85,    // Minimum confidence for --strict mode
    normal: 0.60,    // Minimum confidence for normal mode
  },
  skeptic: {
    maxIterations: 3,
    claimThreshold: 0.70,
  },
  citation: {
    minConfidence: 0.80,  // Citation to be considered verified
  },
};
```

---

## Priority 4 — Observability

### Sprint P4: Dashboard TUI

**Rationale**: Observability layer — quan trọng cho monitoring nhưng không block launch.

**Deliverables**:
- `forgenexus/src/cli/dashboard.ts` — Real-time metrics display
- ASCII-based terminal dashboard
- Sections: verification status, cache performance, historical trends

**Tasks**:

#### P4.1 TUI Dashboard
```typescript
// forgenexus/src/cli/dashboard.ts
// Usage: npx forgenexus dashboard

interface DashboardView {
  verificationStats: {
    attempts: number;
    passed: number;
    rate: number;       // 0-1
  };
  cacheStats: {
    hits: number;
    misses: number;
    hitRate: number;   // 0-1
    speedup: number;    // x multiplier
  };
  performance: {
    avgLatency: number;  // ms
    p50: number;
    p95: number;
  };
  recentActivity: VerificationLog[];
}
```

#### P4.2 Historical Trends
```bash
# Track over time
npx forgenexus dashboard --history 7d  # 7-day trends
npx forgenexus dashboard --history 30d # Monthly
```

---

## Priority 5 — Public Launch

### Sprint P5: Documentation + Launch

**Rationale**: Phải sau khi beta ổn định.

**Deliverables**:
- `forgenexus/docs/RELEASE.md` — Anti-hallucination release notes
- `forgenexus/docs/MIGRATION.md` — Update migration guide
- `CHANGELOG.md` — Update với anti-hallucination features
- Public announcement

**Tasks**:

#### P5.1 Release Documentation
```markdown
# forgenexus/docs/RELEASE.md
## v1.x.0 - Anti-Hallucination GA

### New Features
- Skeptic verification agent
- Confidence scoring (ECE < 0.1)
- Citation extraction + TokenShapley
- Semantic Energy uncertainty quantification
- RAG-grounded wiki generation

### Breaking Changes
- `forgenexus wiki` now verifies claims by default
- Use `--no-verify` for fast mode

### Migration
# See MIGRATION.md
```

#### P5.2 Public Announcement
- Update `forgenexus/README.md`
- GitHub release
- Optional: blog post, social media

---

## Timeline Summary

```
Week 1:        Sprint P0 (Integration Tests)
                Sprint P1 (Performance Benchmarks)
               Sprint P2 (Feature Flags + Rollback)

Week 2:        Sprint P2b (Eval Runner Real)
               Sprint P2 (Monitoring Hooks)

Week 3-4:      Sprint P3 (Internal + Beta Testing)
               Sprint P3 (Bug Fixes + Threshold Tuning)

Week 5:        Sprint P4 (Dashboard TUI)
               Sprint P5 (Docs + Release Prep)

Week 6:        Sprint P5 (Public Launch)
               Sprint P5 (Post-Launch Monitoring)
```

---

## Milestones

```
M-P0: Integration Tests Green    → Week 1
M-P1: Performance Baseline Set   → Week 1-2
M-P2: Rollout Infrastructure    → Week 2
M-P2b: Eval Metrics Collected   → Week 2
M-P3: Internal Testing Pass      → Week 3
M-P3: Beta Launch               → Week 4
M-P4: Dashboard Live            → Week 5
M-P5: Public Launch             → Week 6
```

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Skeptic agent false positives | High | Tunable thresholds, `--no-verify` escape hatch |
| Performance overhead >30% | High | Benchmark first, optimize skeptic + RAG |
| LLM API failures | Medium | Retry logic + graceful degradation |
| Breaking existing workflows | Medium | `--no-verify` for opt-out |

---

## Next Action

**Start Sprint P0 (Integration Tests)** — logical first step:
1. Verify system hoạt động thật
2. Establish test coverage baseline
3. Enable confident iteration

**Command to start**:
```bash
mkdir -p forgenexus/src/e2e
# Create wiki-workflow.test.ts
# Create impact-workflow.test.ts
# Create query-workflow.test.ts
# Run: npm test --forgenexus/e2e
```
