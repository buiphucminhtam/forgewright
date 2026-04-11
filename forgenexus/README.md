# ForgeWright Anti-Hallucination System

A comprehensive anti-hallucination system for code analysis and documentation generation.

## Features

- **Skeptic Agent**: Verifies claims against evidence
- **Confidence Scoring**: Threshold-based confidence with behaviors
- **Semantic Energy**: Uncertainty quantification
- **Multi-Agent Verification**: Synthesizer + Skeptic workflow
- **RAG Integration**: Grounded generation with citations
- **TokenShapley Attribution**: Token-level attribution
- **Freshness Monitoring**: Stale data warnings

## Installation

```bash
npm install
```

## Quick Start

### CLI Usage

```bash
# Generate wiki with verification
forgenexus wiki auth --verify

# Run evaluation
forgenexus evaluate

# Check freshness
forgenexus status
```

### Programmatic Usage

```typescript
import { 
  createSkepticAgent,
  calculateConfidence,
  checkStaleness 
} from '@forgewright/anti-hallucination';

// Create skeptic agent
const skeptic = createSkepticAgent({
  llm: yourLlmClient,
  calibration: 'strict'
});

// Verify a claim
const result = await skeptic.verifyClaim({
  claim: 'This function authenticates users',
  evidence: [{ type: 'code', content: '...', source: 'auth.ts', relevance: 0.9 }]
});

// Check confidence
const confidence = calculateConfidence({
  type: 'wiki',
  evidence: result.evidence
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ForgeWright System                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Synthesizer │───▶│   Skeptic   │───▶│  Confidence │  │
│  │   Agent      │    │   Agent     │    │   Module    │  │
│  └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                  │              │
│         ▼                  ▼                  ▼              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              RAG + Citation System                    │  │
│  └─────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐  │
│  │            Semantic Energy + TokenShapley             │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Modules

### Agents

| Module | Description |
|--------|-------------|
| `skeptic.ts` | Claim verification agent |
| `synthesizer.ts` | Content generation agent |
| `multi-agent.ts` | Multi-agent workflow |
| `confidence.ts` | Confidence calculation |
| `semantic-energy.ts` | Uncertainty quantification |
| `citations.ts` | Citation extraction & TokenShapley |

### RAG

| Module | Description |
|--------|-------------|
| `retriever.ts` | Context retrieval with citations |
| `hybrid-search.ts` | BM25 + vector search |
| `reranker.ts` | Result reranking |
| `chunker.ts` | Text chunking |

### Analysis

| Module | Description |
|--------|-------------|
| `binding-verification.ts` | Multi-pass binding verification |
| `consistency.ts` | Graph consistency checks |
| `framework-detection.ts` | Framework detection with confidence |

### CLI

| Command | Description |
|---------|-------------|
| `wiki` | Generate documentation with verification |
| `evaluate` | Run evaluation suite |

## Configuration

### Confidence Thresholds

```typescript
const config = {
  thresholds: {
    high: 0.9,
    medium: 0.7,
    low: 0.5,
    critical: 0.3
  },
  behaviors: {
    medium: 'note',
    low: 'warn',
    critical: 'refuse'
  }
};
```

### Freshness Configuration

```typescript
const freshnessConfig = {
  freshThresholdHours: 24,
  staleThresholdHours: 72,
  criticalThresholdHours: 168
};
```

## Evaluation

Run the evaluation suite:

```bash
forgenexus evaluate --output json --output-file results.json
```

## API Reference

### SkepticAgent

```typescript
class SkepticAgent {
  async verifyClaim(params: {
    claim: string;
    evidence: Evidence[];
    sources?: Source[];
  }): Promise<VerificationResult>;

  async verifyDocument(params: {
    content: string;
    grounding: GroundingContext;
  }): Promise<DocumentVerification>;

  async verifyImpactClaim(params: {
    symbol: string;
    claim: string;
    graphData: GraphSummary;
  }): Promise<VerificationResult>;
}
```

### Confidence Module

```typescript
calculateConfidence(params: ConfidenceParams): ConfidenceResult
applyBehavior(result: ConfidenceResult): BehaviorAction
```

## License

MIT
