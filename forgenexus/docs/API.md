# ForgeWright Anti-Hallucination - API Reference

## Agents Module

### `createSkepticAgent(options)`

Creates a Skeptic Agent for claim verification.

```typescript
import { createSkepticAgent } from './agents/skeptic';

const skeptic = createSkepticAgent({
  llm: anthropicClient,
  calibration: 'strict', // 'strict' | 'moderate' | 'lenient'
  maxIterations: 3
});
```

**Parameters:**
- `options.llm` - LLM client
- `options.calibration` - Verification strictness
- `options.maxIterations` - Max verification attempts

**Returns:** `SkepticAgent` instance

---

### `SkepticAgent.verifyClaim(params)`

Verifies a factual claim against evidence.

```typescript
const result = await skeptic.verifyClaim({
  claim: 'This function handles authentication',
  evidence: [
    {
      type: 'code',
      content: 'function authenticate() { }',
      source: 'auth.ts',
      line: 42,
      relevance: 0.9
    }
  ]
});
```

**Returns:**
```typescript
{
  status: 'confirmed' | 'unconfirmed' | 'uncertain',
  confidence: 0.0 - 1.0,
  reasoning: string,
  evidence: Evidence[],
  issues: string[]
}
```

---

### `calculateConfidence(params)`

Calculates confidence score for content.

```typescript
import { calculateConfidence } from './agents/confidence';

const result = calculateConfidence({
  type: 'wiki',
  evidence: [
    { type: 'code', content: '...', source: 'file.ts', relevance: 0.8 }
  ]
});
```

**Parameters:**
- `params.type` - Type: 'wiki' | 'impact' | 'query' | 'binding'
- `params.text` - Text content (optional)
- `params.results` - Query results (for type='query')
- `params.evidence` - Evidence array (for type='wiki' | 'impact')
- `params.bindings` - Binding analysis (for type='binding')

**Returns:**
```typescript
{
  level: 'high' | 'medium' | 'low' | 'critical',
  score: 0.0 - 1.0,
  behavior: 'note' | 'warn' | 'block' | 'refuse' | 'clarify',
  reasons: string[],
  flags: string[]
}
```

---

### `applyBehavior(result)`

Applies behavior based on confidence result.

```typescript
import { applyBehavior } from './agents/confidence';

const action = applyBehavior(confidenceResult);

if (!action.shouldContinue) {
  if (action.type === 'refuse') {
    console.error('Request refused:', action.message);
  } else if (action.type === 'block') {
    console.warn('Blocked:', action.message);
  }
}
```

---

## Semantic Energy Module

### `calculateSemanticEnergy(text, llm, options)`

Calculates semantic energy for uncertainty quantification.

```typescript
import { calculateSemanticEnergy } from './agents/semantic-energy';

const result = await calculateSemanticEnergy(
  'The login function authenticates users',
  llmClient,
  { ensembleSize: 4 }
);
```

**Returns:**
```typescript
{
  energy: 0.0 - 1.0,
  uncertainty: 0.0 - 1.0,
  confidence: 0.0 - 1.0,
  method: 'logits' | 'ensemble' | 'heuristic',
  details: {
    variance?: number,
    ensembleScores?: number[]
  }
}
```

---

## Citation Module

### `extractCitations(text)`

Extracts citations from text.

```typescript
import { extractCitations } from './agents/citations';

const citations = extractCitations(`
  The login function [source:auth/login.ts:42] handles authentication.
  It validates [source:auth/login.ts:45] the password.
`);

// Returns:
[
  { source: 'auth/login.ts', line: 42, verified: false },
  { source: 'auth/login.ts', line: 45, verified: false }
]
```

---

### `verifyCitations(citations, sources)`

Verifies citations against source files.

```typescript
const results = verifyCitations(citations, sourceMap);
```

---

### `calculateTokenShapley(text, sources, options)`

Calculates TokenShapley attribution.

```typescript
const result = await calculateTokenShapley(
  generatedText,
  sources,
  { sampleSize: 100 }
);
```

**Returns:**
```typescript
{
  tokens: [
    { token: string, contribution: number, sourceFile?: string }
  ],
  totalContribution: number,
  method: 'shapley' | 'approximate',
  computationTime: number
}
```

---

## RAG Module

### `createRetriever(documentStore, options)`

Creates a RAG retriever.

```typescript
import { createRetriever, createInMemoryStore } from './rag/retriever';

const store = createInMemoryStore([
  { file: 'auth.ts', text: 'function login() { }' }
]);

const retriever = createRetriever(store, {
  hybrid: true,
  rerank: true,
  defaultLimit: 20
});
```

---

### `retriever.retrieve(query, options)`

Retrieves relevant chunks.

```typescript
const result = await retriever.retrieve('authentication', { limit: 10 });
```

**Returns:**
```typescript
{
  chunks: RetrievedChunk[],
  citations: Citation[],
  relevance: number,
  totalChunks: number,
  query: string,
  metadata: {
    searchType: 'hybrid' | 'bm25' | 'vector',
    reranked: boolean,
    retrievalTime: number
  }
}
```

---

### `retriever.retrieveWithCitations(query, options)`

Retrieves context with citations for wiki generation.

```typescript
const { context, groundingContext } = await retriever.retrieveWithCitations(
  'authentication module',
  { includeCitations: true }
);
```

---

## Freshness Module

### `checkStaleness(metadata, config?)`

Checks graph data staleness.

```typescript
import { checkStaleness } from './data/freshness';

const result = checkStaleness({
  repoPath: '/path/to/repo',
  lastIndexed: new Date('2024-01-01'),
  commitHash: 'abc123',
  indexVersion: '1.0.0'
});
```

**Returns:**
```typescript
{
  staleness: 'fresh' | 'stale' | 'critical',
  lastIndexed: Date,
  hoursSinceIndex: number,
  freshnessScore: 0.0 - 1.0,
  warnings: string[],
  recommendations: string[]
}
```

---

### `warnIfStale(metadata)`

Prints staleness warning to console.

```typescript
warnIfStale(metadata);
```

---

## Analysis Module

### `verifyBindings(bindings, context)`

Multi-pass binding verification.

```typescript
import { verifyBindings } from './analysis/binding-verification';

const result = await verifyBindings(bindingsMap, context);
```

**Returns:**
```typescript
{
  consistent: boolean,
  issues: BindingIssue[],
  confidence: number,
  verifiedBindings: number,
  totalBindings: number
}
```

---

### `runConsistencyChecks(graph)`

Runs graph consistency checks.

```typescript
import { runConsistencyChecks } from './analysis/consistency';

const checks = await runConsistencyChecks(graph);
```

---

### `detectFrameworkWithConfidence(repoPath, fileContents)`

Detects framework with confidence score.

```typescript
import { detectFrameworkWithConfidence } from './analysis/framework-detection';

const result = await detectFrameworkWithConfidence(
  '/path/to/repo',
  fileContentsMap
);
```

**Returns:**
```typescript
{
  framework: string,
  confidence: number,
  evidence: string[],
  warnings: string[],
  alternative?: string[],
  metadata: {
    detectedAt: Date,
    evidenceCount: number,
    evidenceTypes: string[]
  }
}
```

---

## Error Module

### Custom Error Classes

```typescript
import { 
  VerificationError,
  ConfidenceError,
  StaleDataError,
  HallucinationError,
  CitationError 
} from './errors/verified';

// Create error
throw new VerificationError(
  'Claim could not be verified',
  { status: 'unconfirmed', confidence: 0.3, issues: ['No evidence'] }
);
```

---

## Evaluation Module

### `runEvaluation(system, options)`

Runs evaluation on a system.

```typescript
import { runEvaluation } from './evaluation/runner';

const results = await runEvaluation(
  mySystem,
  { types: ['wiki', 'impact'], output: 'report' }
);
```

---

### `EVALUATION_DATASET`

Pre-defined test cases.

```typescript
import { EVALUATION_DATASET, getCasesByType, getHallucinationCases } from './evaluation/dataset';

const wikiCases = getCasesByType('wiki');
const hallucinationTests = getHallucinationCases();
```

---

## Performance Module

### `LRUCache`

In-memory LRU cache.

```typescript
import { LRUCache } from './utils/performance';

const cache = new LRUCache<string, any>({ maxSize: 100, ttl: 60000 });

cache.set('key', value);
const cached = cache.get('key');
```

---

### `PerformanceMonitor`

Performance tracking.

```typescript
import { PerformanceMonitor } from './utils/performance';

const monitor = new PerformanceMonitor();

monitor.mark('operation');
// ... do work ...
const duration = monitor.measure('operation');

// Get stats
const stats = monitor.getStats('operation');
```

---

## CLI Commands

### `forgenexus wiki [module]`

Generate wiki with verification.

```bash
forgenexus wiki auth --verify --strict
```

**Options:**
- `--output, -o` - Output file
- `--verify, -v` - Enable verification (default)
- `--no-verify` - Skip verification
- `--strict, -s` - Fail on low confidence
- `--threshold <n>` - Minimum confidence (0-1)
- `--verbose` - Verbose output

---

### `forgenexus evaluate`

Run evaluation suite.

```bash
forgenexus evaluate --output json --output-file results.json
```

**Options:**
- `--output <format>` - Format: json, report, table
- `--output-file <path>` - Save to file
- `--types <types>` - Filter by type
- `--difficulties <d>` - Filter by difficulty
- `--case-ids <ids>` - Specific cases
- `--verbose` - Detailed output
