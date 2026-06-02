# Internal Testing Guide — Forgenexus Anti-Hallucination

## Quick Start

```bash
# Navigate to forgenexus
cd forgenexus

# Install if needed
npm install && npm run build

# Test with verification (strict mode)
npx forgenexus wiki --strict --verify

# Test with fast mode (no verification)
FORCE_NO_VERIFY=1 npx forgenexus wiki

# Test on specific code
npx forgenexus impact --verify src/core/

# Query mode
npx forgenexus query --verify "how does the skeptic agent work"
```

## Testing Checklist

### Wiki Mode
- [ ] `--strict` rejects low confidence claims
- [ ] Citations appear in output with sources
- [ ] NOT_VERIFIED markers appear for unverified claims
- [ ] `--no-verify` bypasses all checks
- [ ] Performance feels acceptable (<5s for small repo)

### Impact Mode
- [ ] Stale graph warning appears (>7 days old)
- [ ] Confidence score appears in output
- [ ] `--no-verify` is fast
- [ ] Handles empty codebase gracefully

### Query Mode
- [ ] Uncertainty flags appear on ambiguous queries
- [ ] Fallback behavior works on low confidence
- [ ] RAG results are ranked by relevance

## Feedback

Report issues via:
```bash
npx forgenexus feedback add --category <type> --severity <level> --description "..."
```

Or view stats:
```bash
npx forgenexus feedback stats
```

## Performance Expectations

| Metric | Target | Acceptable |
|--------|--------|------------|
| Skeptic latency | <2s | <3s |
| RAG retrieval | <500ms | <1s |
| Confidence calc | <100ms | <200ms |
| Full wiki | <10s | <15s |

## Threshold Tuning

If verification is too strict:
```bash
# Relax thresholds
FORGE_WIKI_STRICT=0.70 FORGE_SKEPTIC_MAX=5 npx forgenexus wiki
```

If verification is too loose:
```bash
# Tighten thresholds
FORGE_WIKI_STRICT=0.90 FORGE_STRICT=1 npx forgenexus wiki
```

## Available Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGE_WIKI_STRICT` | 0.85 | Min confidence for --strict mode |
| `FORGE_WIKI_NORMAL` | 0.60 | Min confidence for normal mode |
| `FORGE_SKEPTIC_MAX` | 3 | Max skeptic loop iterations |
| `FORGE_SKEPTIC_CLAIM` | 0.70 | Min claim confidence threshold |
| `FORGE_CITATION_MIN` | 0.80 | Min citation confidence |
| `FORGE_STALE_DAYS` | 7 | Days before index is stale |
| `FORGE_RAG_MAX` | 10 | Max RAG results |
| `FORGE_RAG_MIN_REL` | 0.50 | Min RAG relevance score |

## Feedback Categories

| Category | When to Use |
|----------|-------------|
| `false-positive` | System flagged something as wrong when it was correct |
| `false-negative` | System accepted something that was actually wrong |
| `performance` | Something was too slow |
| `usability` | CLI/API confusing or hard to use |
| `accuracy` | Overall accuracy issues |
| `other` | Anything else |

## Feedback Severity

| Severity | Meaning |
|----------|--------|
| `low` | Minor issue, doesn't block usage |
| `medium` | Noticeable issue, impacts experience |
| `high` | Significant issue, workaround needed |
| `critical` | System unusable or producing harmful output |

## Feature Areas

| Feature | Description |
|---------|-------------|
| `skeptic` | Skeptic agent verification |
| `rag` | RAG retrieval system |
| `confidence` | Confidence scoring |
| `citation` | Citation verification |
| `wiki` | Wiki generation |
| `impact` | Impact analysis |
| `query` | Query/search functionality |

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run all tests including integration
npm run test:all

# Run benchmarks
npm run benchmark
```

## Reporting Bugs

1. First, run `forgenexus doctor` to check for setup issues
2. Try with `--verbose` flag for detailed output
3. Add feedback with relevant category and severity
4. Include:
   - Command used
   - Expected behavior
   - Actual behavior
   - Any confidence scores shown

## Common Issues

### Index Not Found
```bash
# Solution: Run analyze first
npx forgenexus analyze
```

### Stale Index Warning
```bash
# Solution: Re-analyze
npx forgenexus analyze --force
```

### Verification Too Slow
```bash
# Use relaxed thresholds
FORGE_WIKI_STRICT=0.70 npx forgenexus wiki

# Or disable verification
FORCE_NO_VERIFY=1 npx forgenexus wiki
```

### False Positives
```bash
# Report via feedback
npx forgenexus feedback add --category false-positive --severity high \
  --command wiki --feature skeptic --description "..."

# Then adjust threshold
FORGE_SKEPTIC_CLAIM=0.60 npx forgenexus wiki
```
