# ForgeWright Anti-Hallucination Implementation Plan

**Date**: April 2026  
**Duration**: 8 weeks  
**Team**: 1-2 engineers  
**Priority**: HIGH

---

## Phase 1: Foundation (Week 1-2)

### Week 1: Core Infrastructure

#### 1.1 Create Agent Module Structure
```
forgenexus/src/agents/
├── skeptic.ts              # Skeptic agent for verification
├── synthesizer.ts          # Synthesizer agent for generation
├── types.ts                # Shared types
├── index.ts               # Exports
└── prompts.ts             # Agent prompts
```

**Tasks**:
- [ ] Create directory structure
- [ ] Define `AgentResult` interface
- [ ] Define `VerificationResult` interface
- [ ] Create base agent class
- [ ] Create LLM client wrapper with guardrails

**Files to create**:
```typescript
// forgenexus/src/agents/types.ts
export interface AgentConfig {
  model: 'claude' | 'gpt' | 'gemini';
  temperature: number;
  maxTokens: number;
}

export interface AgentResult {
  content: string;
  confidence: number;
  citations: Citation[];
  warnings: string[];
  verified: boolean;
}

export interface VerificationResult {
  status: 'confirmed' | 'unconfirmed' | 'uncertain';
  confidence: number;
  reasoning: string;
  evidence: Evidence[];
  issues: string[];
}

export interface Citation {
  claim: string;
  source: string;
  line?: number;
  verified: boolean;
}
```

#### 1.2 Implement Skeptic Agent

**File**: `forgenexus/src/agents/skeptic.ts`

```typescript
// Core skeptic agent for verification
export class SkepticAgent {
  private llm: LLMClient;
  
  async verifyClaim(params: {
    claim: string;
    evidence: Evidence[];
    sources: Source[];
    type: 'factual' | 'impact' | 'structural';
  }): Promise<VerificationResult> {
    // Implementation
  }
  
  async verifyDocument(params: {
    content: string;
    grounding: GroundingContext;
  }): Promise<DocumentVerification> {
    // Line-by-line verification
  }
  
  async verifyImpactClaim(params: {
    symbol: string;
    claim: string;
    graphData: GraphSummary;
  }): Promise<VerificationResult> {
    // Specific for impact analysis
  }
}
```

**Tasks**:
- [ ] Implement `verifyClaim()` - factual verification
- [ ] Implement `verifyDocument()` - document-level verification
- [ ] Implement `verifyImpactClaim()` - impact-specific verification
- [ ] Add prompt templates
- [ ] Add error handling
- [ ] Add tests

#### 1.3 Implement LLM Client Wrapper with Guardrails

**File**: `forgenexus/src/agents/llm-client.ts`

```typescript
export interface LLMClientConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'ollama';
  model: string;
  apiKey?: string;
}

export interface Guardrails {
  constraints: string[];
  citationRequired: boolean;
  calibration: 'strict' | 'moderate' | 'lenient';
  fallbackBehavior: 'refuse' | 'clarify' | 'best_effort';
}

export class GuardedLLMClient {
  constructor(config: LLMClientConfig, guardrails: Guardrails);
  
  async generate(prompt: string): Promise<GuardedResult>;
  async generateWithContext(context: Context): Promise<GuardedResult>;
}
```

**Tasks**:
- [ ] Create LLM client wrapper
- [ ] Add guardrails support
- [ ] Add citation extraction
- [ ] Add confidence estimation
- [ ] Add retry logic
- [ ] Add tests

#### 1.4 Create Freshness Module

**File**: `forgenexus/src/data/freshness.ts`

```typescript
export interface GraphMetadata {
  lastIndexed: Date;
  commitHash: string;
  indexVersion: string;
  staleness: 'fresh' | 'stale' | 'critical';
}

export interface FreshnessConfig {
  freshThresholdHours: number;   // 24
  staleThresholdHours: number;    // 72
  criticalThresholdHours: number; // 168 (1 week)
}

export function checkStaleness(repoPath: string, config?: FreshnessConfig): GraphMetadata;
export function warnIfStale(repoPath: string): void;
export function shouldRefresh(repoPath: string): boolean;
```

**Tasks**:
- [ ] Implement `checkStaleness()`
- [ ] Implement `warnIfStale()`
- [ ] Integrate with existing `db.ts` metadata
- [ ] Add CLI warning integration
- [ ] Add tests

#### 1.5 Create Confidence Module

**File**: `forgenexus/src/agents/confidence.ts`

```typescript
export interface ConfidenceConfig {
  thresholds: {
    high: number;      // 0.9
    medium: number;     // 0.7
    low: number;       // 0.5
    critical: number;  // 0.3
  };
  behaviors: {
    medium: 'note' | 'warn' | 'block';
    low: 'warn' | 'block';
    critical: 'refuse' | 'clarify';
  };
}

export interface ConfidenceResult {
  level: 'high' | 'medium' | 'low' | 'critical';
  score: number;
  behavior: 'note' | 'warn' | 'block' | 'refuse' | 'clarify';
  reasons: string[];
}

export function calculateConfidence(params: ConfidenceParams): ConfidenceResult;
export function applyBehavior(result: ConfidenceResult): void;
```

**Tasks**:
- [ ] Implement confidence calculation
- [ ] Implement behavior application
- [ ] Add calibration utilities
- [ ] Add tests

---

### Week 2: CLI Integration

#### 2.1 Update Wiki Command with Verification

**File**: `forgenexus/src/cli/wiki.ts`

**Current**:
```typescript
async function generateWiki(repoPath: string) {
  const context = await buildContext(repoPath);
  const docs = await llm.generate(`Generate docs...`);
  await writeDocs(docs);
}
```

**Target**:
```typescript
async function generateWikiSecure(repoPath: string, options: WikiOptions) {
  // Step 1: Validate
  const validation = await validateRequest(repoPath, options);
  if (!validation.valid) {
    await requestClarification(validation.issues);
    return;
  }
  
  // Step 2: Ground with RAG
  const context = await buildContext(repoPath);
  const grounded = await retrieveWithCitations(repoPath, context);
  
  // Step 3: Generate with guardrails
  const docs = await guardedLlm.generate({
    prompt: `Generate documentation based ONLY on: ${grounded}`,
    guardrails: {
      constraints: [
        'Only describe code present in the evidence',
        'Cite [source:filepath:line] for each claim',
        'Say NOT_VERIFIED if evidence is unclear'
      ],
      citationRequired: true,
      calibration: 'strict'
    }
  });
  
  // Step 4: Verify
  const verified = await skeptic.verifyDocument({
    content: docs.content,
    grounding: grounded
  });
  
  // Step 5: Output with confidence
  await writeDocs({
    ...docs,
    verification: verified,
    confidence: verified.confidence,
    warnings: verified.issues
  });
}
```

**Tasks**:
- [ ] Import agents module
- [ ] Add input validation
- [ ] Add RAG grounding
- [ ] Add skeptic verification
- [ ] Add confidence output
- [ ] Add warning flags
- [ ] Add `--no-verify` flag for fast mode
- [ ] Add `--strict` flag for high confidence requirement
- [ ] Update tests

#### 2.2 Update Impact Command with Freshness

**File**: `forgenexus/src/cli/impact.ts`

**Current**:
```typescript
async function showImpact(symbol: string) {
  const result = analyzeImpact(symbol);
  console.log(result);
}
```

**Target**:
```typescript
async function showImpactSecure(symbol: string, options: ImpactOptions) {
  // Step 1: Check freshness
  const freshness = checkStaleness(repoPath);
  if (freshness.staleness !== 'fresh') {
    console.warn(`⚠️  Graph data is ${freshness.staleness}`);
    console.warn(`    Last indexed: ${freshness.lastIndexed.toISOString()}`);
    if (freshness.staleness === 'critical') {
      console.warn(`    Run 'forgenexus analyze --force' to refresh`);
    }
  }
  
  // Step 2: Analyze with verification
  const result = analyzeImpact(symbol);
  const verified = await skeptic.verifyImpactClaim({
    symbol,
    claim: `affects ${result.affectedFiles.length} files`,
    graphData: result.summary
  });
  
  // Step 3: Output with confidence
  console.log({
    ...result,
    freshness: freshness.staleness,
    confidence: verified.confidence,
    verified: verified.status === 'confirmed',
    warnings: verified.issues
  });
}
```

**Tasks**:
- [ ] Import freshness module
- [ ] Add staleness check
- [ ] Add skeptic verification
- [ ] Add confidence output
- [ ] Add warnings
- [ ] Update help text
- [ ] Update tests

#### 2.3 Update Query Tool with Confidence

**File**: `forgenexus/src/mcp/tools/query.ts`

**Current**:
```typescript
interface QueryResult {
  results: SearchResult[];
}
```

**Target**:
```typescript
interface QueryResult {
  results: SearchResult[];
  confidence: number;
  uncertaintyFlags: string[];
  grounding: {
    sources: string[];
    citationRequired: boolean;
  };
  fallbackBehavior: 'return_best' | 'clarify' | 'refuse';
}

function calculateQueryConfidence(results: SearchResult[]): ConfidenceResult {
  if (results.length === 0) {
    return { level: 'critical', score: 0, reasons: ['No results'] };
  }
  
  const avgRelevance = results.reduce((s, r) => s + r.relevance, 0) / results.length;
  const resultSpread = calculateSpread(results);
  
  let score = avgRelevance * 0.7 + (1 - resultSpread) * 0.3;
  let flags: string[] = [];
  
  if (results.length > 20) {
    flags.push('too_many_results');
    score *= 0.8;
  }
  
  if (resultSpread > 0.5) {
    flags.push('high_variance');
  }
  
  return calibrate(score, flags);
}
```

**Tasks**:
- [ ] Update QueryResult interface
- [ ] Implement confidence calculation
- [ ] Add uncertainty flags
- [ ] Add fallback behavior
- [ ] Update tool definition
- [ ] Update tests

---

## Phase 2: Advanced Features (Week 3-4)

### Week 3: Multi-Agent Verification

#### 3.1 Implement Synthesizer Agent

**File**: `forgenexus/src/agents/synthesizer.ts`

```typescript
export class SynthesizerAgent {
  async synthesize(params: {
    type: 'wiki' | 'impact' | 'query';
    verifiedClaims: VerifiedClaim[];
    context: Context;
  }): Promise<SynthesisResult>;
  
  async refine(params: {
    draft: string;
    issues: string[];
    context: Context;
  }): Promise<string>;
}
```

**Tasks**:
- [ ] Implement synthesizer
- [ ] Add refinement loop
- [ ] Add citation integration
- [ ] Add tests

#### 3.2 Implement Multi-Agent Workflow

**File**: `forgenexus/src/agents/multi-agent.ts`

```typescript
export class MultiAgentWorkflow {
  private synthesizer: SynthesizerAgent;
  private skeptic: SkepticAgent;
  
  async execute(params: {
    task: 'wiki' | 'impact' | 'query';
    input: string;
    iterations: number;
    confidenceThreshold: number;
  }): Promise<WorkflowResult>;
  
  private async iterate(
    draft: string,
    context: Context
  ): Promise<IterationResult>;
}
```

**Tasks**:
- [ ] Implement workflow orchestration
- [ ] Add iteration logic
- [ ] Add convergence detection
- [ ] Add timeout handling
- [ ] Add tests

#### 3.3 Add Citation Extraction and Verification

**File**: `forgenexus/src/agents/citations.ts`

```typescript
export interface CitationExtractor {
  extract(text: string): ExtractedCitation[];
  verify(citation: ExtractedCitation, sources: Source[]): CitationVerification;
  render(citation: VerifiedCitation): string;
}

export function createCitationExtractor(): CitationExtractor;
```

**Tasks**:
- [ ] Implement regex-based extraction
- [ ] Implement verification against sources
- [ ] Implement inline rendering
- [ ] Add TokenShapley (Phase 3)
- [ ] Add tests

#### 3.4 Update MCP Server with New Tools

**File**: `forgenexus/src/mcp/tools/verify.ts`

**Tasks**:
- [ ] Add `verify_claim` tool
- [ ] Add `analyze_confidence` tool
- [ ] Add `check_freshness` tool
- [ ] Update tool definitions
- [ ] Update server registration

### Week 4: Binding Verification

#### 4.1 Add Binding Propagation Verification

**File**: `forgenexus/src/analysis/binding-verification.ts`

```typescript
export interface BindingVerification {
  consistent: boolean;
  issues: BindingIssue[];
  confidence: number;
}

export interface BindingIssue {
  type: 'missing' | 'ambiguous' | 'inconsistent';
  symbol: string;
  locations: string[];
  suggestion?: string;
}

export async function verifyBindings(
  bindings: Bindings,
  context: VerificationContext
): Promise<BindingVerification> {
  // Multi-pass verification
  // Detect inconsistencies
  // Suggest fixes
}
```

**Tasks**:
- [ ] Implement multi-pass verification
- [ ] Add issue detection
- [ ] Add suggestions
- [ ] Add confidence scoring
- [ ] Integrate with existing `binding-propagation.ts`
- [ ] Add tests

#### 4.2 Add Consistency Checks

**File**: `forgenexus/src/analysis/consistency.ts`

```typescript
export interface ConsistencyCheck {
  type: string;
  passed: boolean;
  confidence: number;
  details: string;
}

export async function runConsistencyChecks(
  graph: CodeGraph
): Promise<ConsistencyCheck[]> {
  // Check 1: Orphan nodes (no connections)
  // Check 2: Circular dependencies
  // Check 3: Missing type definitions
  // Check 4: Unresolved imports
}
```

**Tasks**:
- [ ] Implement orphan node detection
- [ ] Implement circular dependency detection
- [ ] Implement type consistency check
- [ ] Add confidence scoring
- [ ] Add CLI command
- [ ] Add tests

---

## Phase 3: Evaluation & Polish (Week 5-6)

### Week 5: Evaluation Framework

#### 5.1 Create Evaluation Dataset

**File**: `forgenexus/src/evaluation/dataset.ts`

```typescript
export interface EvaluationCase {
  id: string;
  type: 'wiki' | 'impact' | 'query';
  input: string;
  expected: {
    claims: ExpectedClaim[];
    files: string[];
    confidence: number;
  };
  groundTruth: {
    verified: boolean;
    sources: Source[];
  };
}

export const EVALUATION_DATASET: EvaluationCase[] = [
  // 100+ test cases covering:
  // - Factual claims
  // - Impact analysis
  // - Query intent
  // - Edge cases
];
```

**Tasks**:
- [ ] Create 50 wiki evaluation cases
- [ ] Create 30 impact evaluation cases
- [ ] Create 50 query evaluation cases
- [ ] Add ground truth annotations
- [ ] Add edge cases

#### 5.2 Implement Evaluation Runner

**File**: `forgenexus/src/evaluation/runner.ts`

```typescript
export interface EvaluationResult {
  accuracy: number;
  precision: number;
  recall: number;
  confidenceCalibration: {
    ece: number;  // Expected Calibration Error
    bins: CalibrationBin[];
  };
  hallucinationRate: number;
  citationAccuracy: number;
}

export async function runEvaluation(
  cases: EvaluationCase[],
  system: VerifiedSystem
): Promise<EvaluationResult>;
```

**Tasks**:
- [ ] Implement accuracy metrics
- [ ] Implement calibration metrics
- [ ] Implement hallucination detection
- [ ] Implement citation accuracy
- [ ] Add report generation

#### 5.3 Add CLI Evaluation Command

**File**: `forgenexus/src/cli/evaluate.ts`

```bash
forgenexus evaluate --dataset [path] --output [path]
```

**Tasks**:
- [ ] Implement CLI command
- [ ] Add dataset loading
- [ ] Add report generation
- [ ] Add JSON/HTML output formats

### Week 6: Documentation & Polish

#### 6.1 Update Documentation

**Tasks**:
- [ ] Update README with new features
- [ ] Add API documentation
- [ ] Add migration guide
- [ ] Add examples
- [ ] Update CLAUDE.md

#### 6.2 Performance Optimization

**Tasks**:
- [ ] Profile skeptic agent overhead
- [ ] Optimize confidence calculation
- [ ] Add caching for verification results
- [ ] Add batch verification support

#### 6.3 Error Handling Polish

**Tasks**:
- [ ] Add structured error types
- [ ] Add error recovery suggestions
- [ ] Add debugging mode
- [ ] Add verbose logging

---

## Phase 4: Rollout (Week 7-8)

### Week 7: Testing & Staging

#### 7.1 Integration Testing

**Tasks**:
- [ ] Test full wiki workflow
- [ ] Test full impact workflow
- [ ] Test query with confidence
- [ ] Test error recovery
- [ ] Test edge cases

#### 7.2 Performance Testing

**Tasks**:
- [ ] Measure overhead of verification
- [ ] Benchmark confidence calculation
- [ ] Test with large codebases (>1M LOC)
- [ ] Optimize bottlenecks

#### 7.3 Staged Rollout

```bash
# Day 1-2: Internal testing
forgenexus wiki --verify --strict

# Day 3-5: Beta users
forgenexus wiki --verify  # Default on for beta

# Day 6-7: Full rollout
# Verification enabled by default
# Can be disabled with --no-verify
```

### Week 8: Launch & Monitor

#### 8.1 Metrics Dashboard

**Metrics to track**:
- Verification pass rate
- Confidence distribution
- Citation accuracy
- User feedback on accuracy
- Performance overhead

#### 8.2 User Communication

**Tasks**:
- [ ] Write changelog
- [ ] Create migration guide
- [ ] Host office hours
- [ ] Set up feedback channel

#### 8.3 Monitoring Setup

**Tasks**:
- [ ] Add error tracking (Sentry)
- [ ] Add metrics collection
- [ ] Add alerting for anomalies
- [ ] Add dashboard

---

## Appendix A: File Structure

```
forgenexus/src/
├── agents/
│   ├── index.ts
│   ├── types.ts
│   ├── prompts.ts
│   ├── llm-client.ts
│   ├── skeptic.ts
│   ├── synthesizer.ts
│   ├── multi-agent.ts
│   ├── citations.ts
│   ├── confidence.ts
│   └── __tests__/
│       ├── skeptic.test.ts
│       ├── confidence.test.ts
│       └── citations.test.ts
├── data/
│   ├── freshness.ts          # NEW
│   └── db.ts                # UPDATED
├── cli/
│   ├── wiki.ts              # UPDATED
│   ├── impact.ts            # UPDATED
│   ├── evaluate.ts          # NEW
│   └── index.ts             # UPDATED
├── mcp/
│   └── tools/
│       ├── query.ts         # UPDATED
│       ├── verify.ts        # NEW
│       └── index.ts         # UPDATED
├── analysis/
│   ├── binding-verification.ts  # NEW
│   ├── consistency.ts           # NEW
│   └── binding-propagation.ts   # UPDATED
├── evaluation/
│   ├── index.ts
│   ├── dataset.ts
│   ├── runner.ts
│   └── __tests__/
│       └── runner.test.ts
└── errors/
    └── verified.ts          # NEW
```

---

## Appendix B: Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "@langchain/anthropic": "^0.3.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0"
  }
}
```

---

## Appendix C: Testing Strategy

### Unit Tests
- Skeptic agent: 20 test cases
- Confidence calculation: 30 test cases
- Citation extraction: 15 test cases
- Freshness check: 10 test cases

### Integration Tests
- Full wiki workflow: 10 test cases
- Full impact workflow: 10 test cases
- Query with confidence: 15 test cases

### E2E Tests
- Real codebases: 5 repos
- Edge cases: 20 scenarios

---

## Appendix D: Rollback Plan

If issues are detected:

1. **Immediate** (Day 1-2):
   - Feature flag to disable verification
   - `FORCE_NO_VERIFY=1 forgenexus wiki`

2. **Short-term** (Week 1):
   - Revert to previous behavior
   - Analyze failure cases
   - Fix issues

3. **Long-term** (Week 2+):
   - Address root causes
   - Re-test thoroughly
   - Gradual re-enable

---

## Appendix E: Success Metrics

| Metric | Target | Current | Improvement |
|--------|--------|---------|-------------|
| Wiki factual accuracy | > 95% | ~85% | +10% |
| Citation accuracy | > 90% | N/A | New |
| Confidence calibration (ECE) | < 0.1 | N/A | New |
| User trust score | > 4.0/5 | ~3.5/5 | +0.5 |
| Performance overhead | < 30% | N/A | Baseline |

---

## Appendix F: Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM API failures | Medium | High | Retry logic + fallback |
| Performance overhead | High | Medium | Caching + optimization |
| False positives in verification | Medium | Medium | Tunable thresholds |
| Breaking existing workflows | Low | High | Feature flags + backward compat |

---

*Plan Version: 1.0*  
*Last Updated: April 2026*  
*Owner: ForgeWright Team*
