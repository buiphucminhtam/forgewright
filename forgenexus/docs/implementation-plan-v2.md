# ForgeWright Anti-Hallucination - Revised Implementation Plan

**Date**: April 2026  
**Duration**: 9 weeks (8 weeks + 1 week buffer)  
**Team**: 1-2 engineers  
**Priority**: HIGH  
**Plan Version**: 2.0  
**Based on**: Evaluation v1.0 recommendations

---

## Changelog (v1.0 → v2.0)

| Change | Reason |
|--------|--------|
| +1 week buffer | Schedule protection |
| Added RAG module (Week 2) | Wiki verification depends on it |
| Added Semantic Energy (Week 3) | +13% AUROC improvement |
| Reduced Week 1 scope | Was overloaded |
| Added LLM dependency | Critical blocker |
| Started evaluation dataset Week 1 | Can't launch without it |
| Added Framework Detection confidence | Addresses audit gap |
| Added mock LLM for testing | Enables offline development |

---

## Phase 1: Foundation (Week 1-2)

### Week 1: Core Infrastructure (Reduced Scope)

#### 1.1 Create Agent Module Structure

```
forgenexus/src/agents/
├── types.ts           # Agent types
├── index.ts           # Exports
└── prompts.ts         # Agent prompts
```

**Tasks**:
- [ ] Create directory structure
- [ ] Define `AgentResult` interface
- [ ] Define `VerificationResult` interface
- [ ] Define `ConfidenceResult` interface

#### 1.2 LLM Client with Guardrails

**File**: `forgenexus/src/agents/llm-client.ts`

```typescript
// NEW: Add LLM dependency
// package.json: "@anthropic-ai/sdk": "^0.27.0"

export interface LLMClientConfig {
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
  apiKey?: string;
  maxRetries: number;
  timeout: number;
}

export interface Guardrails {
  constraints: string[];
  citationRequired: boolean;
  calibration: 'strict' | 'moderate' | 'lenient';
  fallbackBehavior: 'refuse' | 'clarify' | 'best_effort';
}

export class GuardedLLMClient {
  private client: AnthropicClient;
  private guardrails: Guardrails;
  
  constructor(config: LLMClientConfig, guardrails: Guardrails);
  
  async generate(prompt: string): Promise<GuardedResult>;
  async generateWithContext(context: Context): Promise<GuardedResult>;
}

// Mock LLM for testing
export class MockLLMClient {
  async generate(prompt: string): Promise<GuardedResult>;
  // Returns configurable responses for testing
}
```

**Tasks**:
- [ ] Install LLM dependencies
- [ ] Create GuardedLLMClient
- [ ] Add guardrails support
- [ ] Add citation extraction
- [ ] Create MockLLMClient for testing
- [ ] Add retry logic
- [ ] Add tests

#### 1.3 Skeptic Agent (Simplified)

**File**: `forgenexus/src/agents/skeptic.ts`

```typescript
// Core skeptic agent for verification
export class SkepticAgent {
  private llm: GuardedLLMClient;
  
  async verifyClaim(params: {
    claim: string;
    evidence: Evidence[];
    sources: Source[];
  }): Promise<VerificationResult> {
    // Single verification method, expand later
    const prompt = this.buildVerifyPrompt(params);
    const response = await this.llm.generate(prompt);
    return this.parseResponse(response);
  }
  
  async verifyDocument(params: {
    content: string;
    grounding: GroundingContext;
  }): Promise<DocumentVerification> {
    // Document-level verification
  }
}
```

**Tasks**:
- [ ] Implement `verifyClaim()` - factual verification
- [ ] Implement `verifyDocument()` - document verification
- [ ] Add prompt templates
- [ ] Add error handling
- [ ] Add tests (20 cases)

#### 1.4 Confidence Module

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

export function calculateConfidence(params: ConfidenceParams): ConfidenceResult {
  // Core confidence calculation
  // Based on: relevance, spread, result count
}

export function applyBehavior(result: ConfidenceResult): void {
  // Apply note/warn/block behavior
}

// NEW: Semantic Energy (simplified)
export async function calculateSemanticEnergy(
  text: string,
  llm: GuardedLLMClient
): Promise<number> {
  // Use logits if available, fallback to heuristics
  // Higher energy = more uncertain
  const logits = await getPenultimateLogits(text);
  return -Math.log(sum(exp(logits)));
}
```

**Tasks**:
- [ ] Implement confidence calculation
- [ ] Implement behavior application
- [ ] Add Semantic Energy (simplified version)
- [ ] Add calibration utilities
- [ ] Add tests (30 cases)

#### 1.5 Evaluation Dataset (Start)

**File**: `forgenexus/src/evaluation/dataset.ts`

```typescript
// Start building dataset in Week 1, expand throughout
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

// Initial 10 cases, expand to 30 by Week 5
export const EVALUATION_DATASET: EvaluationCase[] = [
  // Wiki cases
  {
    id: 'wiki-001',
    type: 'wiki',
    input: 'Generate docs for auth module',
    expected: {
      claims: [
        { text: 'uses JWT', files: ['auth/jwt.ts'] },
        { text: 'validates passwords', files: ['auth/password.ts'] }
      ],
      files: ['auth/'],
      confidence: 0.9
    },
    groundTruth: {
      verified: true,
      sources: ['auth/jwt.ts', 'auth/password.ts']
    }
  },
  // ... 9 more cases
];
```

**Tasks**:
- [ ] Define schema
- [ ] Create 10 initial cases
- [ ] Add ground truth annotations
- [ ] Set up dataset structure

---

### Week 2: CLI Integration + RAG Module

#### 2.1 Create RAG Module (NEW)

```
forgenexus/src/rag/
├── index.ts
├── retriever.ts      # Retrieval with citations
├── chunker.ts        # Text chunking
├── reranker.ts       #结果重排序
└── hybrid-search.ts  # BM25 + vector
```

**File**: `forgenexus/src/rag/retriever.ts`

```typescript
import { embeddings } from '../data/embeddings';
import { hybridSearch } from './hybrid-search';

export interface RetrievedContext {
  chunks: Chunk[];
  citations: Citation[];
  relevance: number;
}

export async function retrieveWithCitations(
  repoPath: string,
  query: string,
  options?: RetrieveOptions
): Promise<RetrievedContext> {
  // 1. Hybrid search (BM25 + vector)
  const results = await hybridSearch(query, {
    limit: options?.limit ?? 20,
    hybrid: true,
    rerank: true
  });
  
  // 2. Extract citations
  const citations = results.map(r => ({
    claim: extractClaim(r.chunk),
    source: r.filePath,
    line: r.lineNumber,
    verified: true // Initially verified
  }));
  
  // 3. Build grounding context
  const context = results.map(r => 
    `[Source: ${r.filePath}:${r.lineNumber}]\n${r.chunk.text}`
  ).join('\n\n');
  
  return { chunks: results, citations, relevance: results.avgScore };
}
```

**Tasks**:
- [ ] Create RAG directory
- [ ] Implement `retriever.ts` with citations
- [ ] Implement `hybrid-search.ts` (BM25 + vector)
- [ ] Implement `reranker.ts`
- [ ] Integrate with existing embeddings.ts
- [ ] Add tests

#### 2.2 Update Wiki Command with Verification

**File**: `forgenexus/src/cli/wiki.ts`

```typescript
async function generateWikiSecure(repoPath: string, options: WikiOptions) {
  // Step 1: Validate
  const validation = await validateRequest(repoPath, options);
  if (!validation.valid) {
    await requestClarification(validation.issues);
    return;
  }
  
  // Step 2: RAG grounding (NEW)
  const context = await buildContext(repoPath);
  const grounded = await retrieveWithCitations(repoPath, context);
  
  // Step 3: Generate with guardrails
  const docs = await guardedLlm.generate({
    prompt: `Generate documentation based ONLY on: ${grounded.context}`,
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
  
  // Step 4: Verify (NEW)
  const verified = await skeptic.verifyDocument({
    content: docs.content,
    grounding: grounded
  });
  
  // Step 5: Output with confidence
  await writeDocs({
    ...docs,
    verification: verified,
    confidence: verified.confidence,
    citations: grounded.citations,
    warnings: verified.issues
  });
}
```

**Tasks**:
- [ ] Import RAG module
- [ ] Add input validation
- [ ] Add RAG grounding
- [ ] Add skeptic verification
- [ ] Add confidence output
- [ ] Add citation output
- [ ] Add `--no-verify` flag
- [ ] Add `--strict` flag
- [ ] Update tests

#### 2.3 Freshness Module

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
  criticalThresholdHours: number; // 168
}

export function checkStaleness(
  repoPath: string,
  config?: FreshnessConfig
): GraphMetadata {
  const meta = getGraphMetadata(repoPath);
  const hoursSinceIndex = (Date.now() - meta.lastIndexed) / 3600000;
  
  return {
    ...meta,
    staleness: hoursSinceIndex < (config?.freshThresholdHours ?? 24) ? 'fresh'
             : hoursSinceIndex < (config?.staleThresholdHours ?? 72) ? 'stale'
             : 'critical'
  };
}

export function warnIfStale(repoPath: string): void {
  const { staleness, lastIndexed } = checkStaleness(repoPath);
  
  if (staleness !== 'fresh') {
    console.warn(`
      ⚠️  INDEX STALENESS WARNING
      
      Graph data: ${lastIndexed.toISOString()}
      Status: ${staleness}
      
      Impact analysis may contain outdated information.
      Run: forgenexus analyze --force
    `);
  }
}
```

**Tasks**:
- [ ] Implement `checkStaleness()`
- [ ] Implement `warnIfStale()`
- [ ] Integrate with existing db.ts
- [ ] Add CLI warning integration
- [ ] Add tests

#### 2.4 Update Impact Command

**File**: `forgenexus/src/cli/impact.ts`

```typescript
async function showImpactSecure(symbol: string, options: ImpactOptions) {
  // Step 1: Check freshness (NEW)
  const freshness = checkStaleness(repoPath);
  if (freshness.staleness !== 'fresh') {
    warnIfStale(repoPath);
  }
  
  // Step 2: Analyze
  const result = analyzeImpact(symbol);
  
  // Step 3: Verify (NEW)
  const verified = await skeptic.verifyClaim({
    claim: `affects ${result.affectedFiles.length} files`,
    evidence: result.evidence,
    sources: result.sources
  });
  
  // Step 4: Output with confidence
  console.log({
    ...result,
    freshness: freshness.staleness,
    lastIndexed: freshness.lastIndexed,
    confidence: verified.confidence,
    verified: verified.status === 'confirmed',
    warnings: [
      ...(freshness.staleness !== 'fresh' 
        ? ['Graph data is ' + freshness.staleness] 
        : []),
      ...verified.issues
    ]
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

#### 2.5 Update Query Tool

**File**: `forgenexus/src/mcp/tools/query.ts`

```typescript
interface QueryResult {
  results: SearchResult[];
  confidence: number;              // NEW
  uncertaintyFlags: string[];       // NEW
  grounding: {
    sources: string[];
    citationRequired: boolean;
  };
  fallbackBehavior: 'return_best' | 'clarify' | 'refuse'; // NEW
}

function calculateQueryConfidence(results: SearchResult[]): ConfidenceResult {
  if (results.length === 0) {
    return { 
      level: 'critical', 
      score: 0, 
      reasons: ['No results found'] 
    };
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
  
  if (avgRelevance < 0.5) {
    flags.push('low_relevance');
  }
  
  return calculateConfidence({ score, flags });
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

### Week 3: Multi-Agent + Semantic Energy

#### 3.1 Semantic Energy (Enhanced)

**File**: `forgenexus/src/agents/semantic-energy.ts`

```typescript
// Research: Semantic Energy outperforms Semantic Entropy by +13% AUROC
// Uses penultimate layer logits for uncertainty quantification

export interface SemanticEnergyConfig {
  usePenultimateLayer: boolean;
  temperature: number;
}

export async function calculateSemanticEnergy(
  text: string,
  llm: GuardedLLMClient,
  config?: SemanticEnergyConfig
): Promise<number> {
  // Method 1: If API provides logits
  if (llm.supportsLogits()) {
    const logits = await llm.getPenultimateLogits(text);
    // Boltzmann-inspired energy
    const energy = -Math.log(sum(logits.map(l => Math.exp(l))));
    return energy;
  }
  
  // Method 2: Fallback to ensemble-based
  const responses = await Promise.all([
    llm.generate(text, { temperature: 0.3 }),
    llm.generate(text, { temperature: 0.5 }),
    llm.generate(text, { temperature: 0.7 })
  ]);
  
  // Calculate semantic variance
  const embeddings = responses.map(r => getEmbedding(r));
  const variance = calculateVariance(embeddings);
  
  // Higher variance = higher uncertainty = higher energy
  return variance;
}

// Combined confidence with Semantic Energy
export async function calculateEnhancedConfidence(
  params: ConfidenceParams,
  llm: GuardedLLMClient
): Promise<ConfidenceResult> {
  const base = calculateConfidence(params);
  
  // Get Semantic Energy
  const energy = await calculateSemanticEnergy(params.text, llm);
  
  // Combine: Higher energy = lower confidence
  const adjustedScore = base.score * (1 - energy * 0.3);
  
  return {
    ...base,
    score: Math.max(0, adjustedScore),
    reasons: [
      ...base.reasons,
      `semantic_energy: ${energy.toFixed(3)}`
    ]
  };
}
```

**Tasks**:
- [ ] Implement Semantic Energy calculation
- [ ] Add API-based method (if supported)
- [ ] Add ensemble fallback
- [ ] Integrate with confidence module
- [ ] Add tests

#### 3.2 Synthesizer Agent

**File**: `forgenexus/src/agents/synthesizer.ts`

```typescript
export class SynthesizerAgent {
  private llm: GuardedLLMClient;
  
  async synthesize(params: {
    type: 'wiki' | 'impact' | 'query';
    verifiedClaims: VerifiedClaim[];
    context: Context;
  }): Promise<SynthesisResult> {
    const prompt = this.buildSynthesisPrompt(params);
    return this.llm.generate(prompt);
  }
  
  async refine(params: {
    draft: string;
    issues: string[];
    context: Context;
  }): Promise<string> {
    // Fix issues from skeptic
    const prompt = this.buildRefinePrompt(params);
    return this.llm.generate(prompt);
  }
}
```

**Tasks**:
- [ ] Implement synthesizer
- [ ] Add refinement loop
- [ ] Add citation integration
- [ ] Add tests

#### 3.3 Multi-Agent Workflow

**File**: `forgenexus/src/agents/multi-agent.ts`

```typescript
export class MultiAgentWorkflow {
  private synthesizer: SynthesizerAgent;
  private skeptic: SkepticAgent;
  
  async execute(params: {
    task: 'wiki' | 'impact' | 'query';
    input: string;
    context: Context;
    iterations: number;
    confidenceThreshold: number;
  }): Promise<WorkflowResult> {
    let draft = await this.synthesizer.synthesize({
      type: params.task,
      verifiedClaims: [],
      context: params.context
    });
    
    for (let i = 0; i < params.iterations; i++) {
      const verified = await this.skeptic.verifyDocument({
        content: draft,
        grounding: params.context
      });
      
      if (verified.confidence >= params.confidenceThreshold) {
        break;
      }
      
      // Refine with issues
      draft = await this.synthesizer.refine({
        draft,
        issues: verified.issues,
        context: params.context
      });
    }
    
    return { draft, iterations: params.iterations };
  }
}
```

**Tasks**:
- [ ] Implement workflow orchestration
- [ ] Add iteration logic
- [ ] Add convergence detection
- [ ] Add timeout handling
- [ ] Add tests

#### 3.4 Citation Extraction + TokenShapley

**File**: `forgenexus/src/agents/citations.ts`

```typescript
// Research: TokenShapley improves attribution by 11-23%
export interface CitationExtractor {
  extract(text: string): ExtractedCitation[];
  verify(citation: ExtractedCitation, sources: Source[]): CitationVerification;
  render(citation: VerifiedCitation): string;
}

// TokenShapley attribution
export interface TokenAttribution {
  token: string;
  contribution: number;
  sourceFile?: string;
  sourceLine?: number;
}

export async function calculateTokenShapley(
  text: string,
  sources: Source[],
  llm: GuardedLLMClient
): Promise<TokenAttribution[]> {
  const tokens = tokenize(text);
  const attributions: TokenAttribution[] = [];
  
  // Simplified Shapley: calculate marginal contribution
  for (const token of tokens) {
    const contribution = await calculateMarginalContribution(token, sources);
    attributions.push({ token, contribution, ...contribution.source });
  }
  
  // Normalize
  const total = sum(attributions.map(a => a.contribution));
  return attributions.map(a => ({
    ...a,
    contribution: a.contribution / total
  }));
}
```

**Tasks**:
- [ ] Implement regex-based extraction
- [ ] Implement verification against sources
- [ ] Implement inline rendering
- [ ] Implement TokenShapley (simplified)
- [ ] Add tests

#### 3.5 MCP Server Verification Tools

**File**: `forgenexus/src/mcp/tools/verify.ts`

```typescript
// NEW verification tools for MCP

export const verifyTools = [
  {
    name: 'verify_claim',
    description: 'Verify a factual claim against evidence',
    inputSchema: {
      claim: 'string',
      evidence: 'array',
      sources: 'array'
    },
    handler: async (params) => {
      const skeptic = new SkepticAgent();
      return skeptic.verifyClaim(params);
    }
  },
  {
    name: 'analyze_confidence',
    description: 'Calculate confidence score for text',
    inputSchema: {
      text: 'string',
      type: 'wiki' | 'impact' | 'query'
    },
    handler: async (params) => {
      const confidence = calculateConfidence(params);
      const energy = await calculateSemanticEnergy(params.text, llm);
      return { ...confidence, semanticEnergy: energy };
    }
  },
  {
    name: 'check_freshness',
    description: 'Check graph data freshness',
    inputSchema: {
      repoPath: 'string'
    },
    handler: async (params) => {
      return checkStaleness(params.repoPath);
    }
  }
];
```

**Tasks**:
- [ ] Add verify_claim tool
- [ ] Add analyze_confidence tool
- [ ] Add check_freshness tool
- [ ] Update tool definitions
- [ ] Update server registration
- [ ] Add tests

### Week 4: Binding Verification + Framework Detection

#### 4.1 Binding Propagation Verification

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
  const issues: BindingIssue[] = [];
  
  // Multi-pass verification
  for (const symbol of bindings.symbols) {
    // Pass 1: Check for missing definitions
    if (!bindings.hasDefinition(symbol)) {
      issues.push({
        type: 'missing',
        symbol,
        locations: bindings.references(symbol)
      });
    }
    
    // Pass 2: Check for ambiguity
    const defs = bindings.definitions(symbol);
    if (defs.length > 1) {
      issues.push({
        type: 'ambiguous',
        symbol,
        locations: defs,
        suggestion: 'Specify full path or use disambiguator'
      });
    }
  }
  
  // Calculate confidence based on issue severity
  const confidence = issues.length === 0 ? 1.0 
    : issues.filter(i => i.type === 'missing').length === 0 ? 0.8
    : 0.5;
  
  return {
    consistent: issues.length === 0,
    issues,
    confidence
  };
}
```

**Tasks**:
- [ ] Implement multi-pass verification
- [ ] Add issue detection
- [ ] Add suggestions
- [ ] Add confidence scoring
- [ ] Integrate with existing binding-propagation.ts
- [ ] Add tests

#### 4.2 Framework Detection with Confidence (NEW)

**File**: `forgenexus/src/analysis/framework-detection.ts`

```typescript
// Audit gap: Framework detection has 5-15% false positive rate
// Add confidence scoring to address this

export interface FrameworkDetectionResult {
  framework: string;
  confidence: number;  // NEW
  evidence: string[];
  warnings: string[];  // NEW
  alternative?: string[];
}

export async function detectFrameworkWithConfidence(
  repoPath: string
): Promise<FrameworkDetectionResult> {
  const detected = await detectFramework(repoPath);
  
  // Calculate confidence based on evidence strength
  const evidenceCount = detected.evidence.length;
  const hasPackageJson = detected.evidence.some(e => e.includes('package.json'));
  const hasLockFile = detected.evidence.some(e => e.includes('package-lock'));
  
  let confidence = 0.5; // Base confidence
  
  if (evidenceCount >= 5) confidence += 0.2;
  if (hasPackageJson) confidence += 0.15;
  if (hasLockFile) confidence += 0.1;
  
  // Detect potential conflicts
  const warnings: string[] = [];
  if (confidence < 0.7) {
    warnings.push('Low confidence, verify manually');
  }
  if (detected.framework === 'Unknown' && evidenceCount > 0) {
    warnings.push('Unusual patterns detected, review suggested');
  }
  
  return {
    ...detected,
    confidence: Math.min(confidence, 0.95),
    warnings
  };
}
```

**Tasks**:
- [ ] Add confidence scoring to framework detection
- [ ] Add warning flags
- [ ] Add alternative suggestions
- [ ] Update existing detection logic
- [ ] Add tests

#### 4.3 Consistency Checks

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
  const checks: ConsistencyCheck[] = [];
  
  // Check 1: Orphan nodes
  const orphans = findOrphanNodes(graph);
  checks.push({
    type: 'orphan_nodes',
    passed: orphans.length === 0,
    confidence: 0.9,
    details: `${orphans.length} orphan nodes found`
  });
  
  // Check 2: Circular dependencies
  const cycles = detectCycles(graph);
  checks.push({
    type: 'circular_dependencies',
    passed: cycles.length === 0,
    confidence: 0.85,
    details: cycles.length === 0 
      ? 'No cycles detected' 
      : `${cycles.length} cycles: ${cycles.map(c => c.join(' → ')).join(', ')}`
  });
  
  // Check 3: Missing type definitions
  const missingTypes = findMissingTypes(graph);
  checks.push({
    type: 'missing_types',
    passed: missingTypes.length === 0,
    confidence: 0.8,
    details: `${missingTypes.length} unresolved types`
  });
  
  return checks;
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

## Phase 3: Evaluation (Week 5-6)

### Week 5: Evaluation Framework

#### 5.1 Expand Evaluation Dataset (30 cases)

```typescript
// Target: 30 high-impact cases
// - 10 wiki cases
// - 10 impact cases
// - 10 query cases

export const EVALUATION_DATASET: EvaluationCase[] = [
  // Wiki cases (10)
  {
    id: 'wiki-001' to 'wiki-010',
    type: 'wiki',
    // ... cases covering common patterns
  },
  // Impact cases (10)
  {
    id: 'impact-001' to 'impact-010',
    type: 'impact',
    // ... cases covering symbol impacts
  },
  // Query cases (10)
  {
    id: 'query-001' to 'query-010',
    type: 'query',
    // ... cases covering query intent
  }
];
```

**Tasks**:
- [ ] Create 10 wiki cases
- [ ] Create 10 impact cases
- [ ] Create 10 query cases
- [ ] Add ground truth annotations
- [ ] Add edge cases
- [ ] Validate dataset

#### 5.2 Evaluation Runner

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
): Promise<EvaluationResult> {
  const results = [];
  
  for (const testCase of cases) {
    const result = await system.execute(testCase);
    results.push(compare(testCase, result));
  }
  
  // Calculate metrics
  return {
    accuracy: calculateAccuracy(results),
    precision: calculatePrecision(results),
    recall: calculateRecall(results),
    confidenceCalibration: calculateECE(results),
    hallucinationRate: calculateHallucinationRate(results),
    citationAccuracy: calculateCitationAccuracy(results)
  };
}

// Expected Calibration Error
function calculateECE(results: TestResult[]): ECEResult {
  const bins = createBins(10); // 10 bins
  
  for (const r of results) {
    const bin = findBin(r.confidence);
    bin.predictions.push(r.predicted);
    bin.actuals.push(r.actual);
  }
  
  return {
    ece: bins.reduce((sum, bin) => {
      const accuracy = bin.meanAccuracy;
      const confidence = bin.meanConfidence;
      return sum + (bin.count / results.length) * Math.abs(accuracy - confidence);
    }, 0),
    bins
  };
}
```

**Tasks**:
- [ ] Implement accuracy metrics
- [ ] Implement calibration metrics
- [ ] Implement hallucination detection
- [ ] Implement citation accuracy
- [ ] Add report generation
- [ ] Add tests

#### 5.3 CLI Evaluation Command

**File**: `forgenexus/src/cli/evaluate.ts`

```bash
# Usage
forgenexus evaluate --dataset [path] --output [path] --format [json|html]
```

**Tasks**:
- [ ] Implement CLI command
- [ ] Add dataset loading
- [ ] Add report generation
- [ ] Add JSON/HTML output formats
- [ ] Add visualization

---

### Week 6: Polish + Performance

#### 6.1 Performance Optimization

**Tasks**:
- [ ] Profile skeptic agent overhead
- [ ] Optimize confidence calculation
- [ ] Add caching for verification results
- [ ] Add batch verification support
- [ ] Benchmark large codebases (>1M LOC)

#### 6.2 Documentation Update

**Tasks**:
- [ ] Update README with new features
- [ ] Add API documentation
- [ ] Add migration guide
- [ ] Add examples
- [ ] Update CLAUDE.md

#### 6.3 Error Handling Polish

**Tasks**:
- [ ] Add structured error types
- [ ] Add error recovery suggestions
- [ ] Add debugging mode
- [ ] Add verbose logging

---

## Phase 4: Rollout (Week 7-9)

### Week 7: Testing

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
- [ ] Test with large codebases
- [ ] Optimize bottlenecks

### Week 8: Staged Rollout

```bash
# Day 1-2: Internal testing
forgenexus wiki --verify --strict

# Day 3-5: Beta users
forgenexus wiki --verify  # Default on for beta

# Day 6-7: Full rollout
# Verification enabled by default
# Can be disabled with --no-verify
```

### Week 9: Buffer (NEW)

Buffer for slippage and final polish.

---

## Appendix A: File Structure (Updated)

```
forgenexus/src/
├── agents/
│   ├── index.ts
│   ├── types.ts
│   ├── prompts.ts
│   ├── llm-client.ts        # UPDATED: Guardrails + Mock
│   ├── skeptic.ts
│   ├── synthesizer.ts
│   ├── multi-agent.ts
│   ├── citations.ts          # UPDATED: TokenShapley
│   ├── confidence.ts         # UPDATED: Semantic Energy
│   ├── semantic-energy.ts    # NEW
│   └── __tests__/
├── rag/                     # NEW
│   ├── index.ts
│   ├── retriever.ts
│   ├── chunker.ts
│   ├── reranker.ts
│   └── hybrid-search.ts
├── data/
│   ├── freshness.ts          # NEW
│   └── db.ts                # UPDATED
├── cli/
│   ├── wiki.ts              # UPDATED
│   ├── impact.ts            # UPDATED
│   ├── evaluate.ts          # NEW
│   └── index.ts             # UPDATED
├── mcp/tools/
│   ├── query.ts             # UPDATED
│   ├── verify.ts            # NEW
│   └── index.ts             # UPDATED
├── analysis/
│   ├── binding-verification.ts  # NEW
│   ├── consistency.ts           # NEW
│   ├── framework-detection.ts   # UPDATED
│   └── binding-propagation.ts    # UPDATED
├── evaluation/
│   ├── index.ts
│   ├── dataset.ts
│   ├── runner.ts
│   └── __tests__/
└── errors/
    └── verified.ts           # NEW
```

---

## Appendix B: Dependencies (Updated)

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
- Semantic Energy: 15 test cases
- Citation extraction: 15 test cases
- Freshness check: 10 test cases
- Framework detection: 10 test cases

### Integration Tests
- Full wiki workflow: 10 test cases
- Full impact workflow: 10 test cases
- Query with confidence: 15 test cases
- Multi-agent workflow: 10 test cases

### E2E Tests
- Real codebases: 5 repos
- Edge cases: 20 scenarios
- Large codebase: 1 repo (>1M LOC)

---

## Appendix D: Success Metrics (Updated)

| Metric | Target | Current | Improvement |
|--------|--------|---------|-------------|
| Wiki factual accuracy | > 95% | ~85% | +10% |
| Citation accuracy | > 90% | N/A | New |
| Confidence ECE | < 0.1 | N/A | New |
| Semantic Energy AUROC | > 0.8 | N/A | New |
| Framework detection confidence | > 0.8 | N/A | New |
| User trust score | > 4.0/5 | ~3.5/5 | +0.5 |
| Performance overhead | < 30% | N/A | Baseline |

---

## Appendix E: Evaluation Checklist

### Week 1 Checklist
- [ ] Agent types defined
- [ ] GuardedLLMClient implemented
- [ ] MockLLMClient implemented
- [ ] Skeptic agent (simplified) implemented
- [ ] Confidence module implemented
- [ ] Semantic Energy (simplified) implemented
- [ ] Evaluation dataset schema defined
- [ ] 10 initial test cases

### Week 2 Checklist
- [ ] RAG module implemented
- [ ] Wiki command updated
- [ ] Freshness module implemented
- [ ] Impact command updated
- [ ] Query tool updated

### Week 3 Checklist
- [ ] Semantic Energy (enhanced) implemented
- [ ] Synthesizer agent implemented
- [ ] Multi-agent workflow implemented
- [ ] Citation extraction implemented
- [ ] TokenShapley (simplified) implemented
- [ ] MCP verification tools implemented

### Week 4 Checklist
- [ ] Binding verification implemented
- [ ] Framework detection with confidence
- [ ] Consistency checks implemented
- [ ] Integration tests passing

### Week 5 Checklist
- [ ] 30 evaluation cases
- [ ] Evaluation runner implemented
- [ ] CLI evaluation command
- [ ] Performance benchmarks

### Week 6 Checklist
- [ ] Performance optimized
- [ ] Documentation updated
- [ ] Error handling polished

### Week 7 Checklist
- [ ] Integration tests passing
- [ ] Performance tests passing
- [ ] Bug fixes

### Week 8 Checklist
- [ ] Internal testing complete
- [ ] Beta rollout complete
- [ ] Full rollout

### Week 9 Checklist (Buffer)
- [ ] Polish
- [ ] Launch

---

## Appendix F: Research-Based Additions

### Techniques Added (Based on 2025-2026 Research)

| Technique | Source | Implementation |
|-----------|--------|---------------|
| Semantic Energy | Nature 2024 + OpenReview 2025 | Week 1 + Week 3 |
| TokenShapley | ACL 2025 | Week 3 |
| Skeptic Agent | Multi-agent verification research | Week 1 |
| Confidence Calibration | Behavioral RL research | Week 1 |
| Framework Detection Confidence | Audit findings | Week 4 |

---

## Appendix G: Risk Matrix (Updated)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM API failures | Medium | High | Retry logic + Mock fallback |
| Performance overhead | High | Medium | Caching + optimization + Week 9 buffer |
| False positives in verification | Medium | Medium | Tunable thresholds |
| Breaking existing workflows | Low | High | Feature flags + backward compat |
| RAG retrieval quality | Medium | Medium | Hybrid search + reranking |
| Semantic Energy accuracy | Medium | Medium | Ensemble fallback |

---

*Plan Version: 2.0*  
*Based on: Evaluation v1.0 recommendations*  
*Last Updated: April 2026*  
*Owner: ForgeWright Team*
