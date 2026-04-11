# Migration Guide: ForgeWright Anti-Hallucination System

## Upgrading from v1.0 to v2.0

### Overview

This guide helps you migrate from the basic ForgeWright system to the Anti-Hallucination system.

### Breaking Changes

#### 1. New Module Structure

**Before:**
```typescript
import { analyze } from 'forgewright';
```

**After:**
```typescript
import { createSkepticAgent, calculateConfidence } from 'forgewright/agents';
```

#### 2. Verification is Now Default

**Before:**
```typescript
const result = await analyze(repoPath);
```

**After:**
```typescript
// Verification is enabled by default
const result = await analyze(repoPath, { verify: true });

// To skip verification (legacy mode):
const result = await analyze(repoPath, { noVerify: true });
```

#### 3. Confidence in Output

**Before:**
```typescript
const result = await analyze(repoPath);
// result.content
```

**After:**
```typescript
const result = await analyze(repoPath);
// result.content
// result.confidence // NEW: confidence level and score
// result.warnings   // NEW: warnings about data quality
```

#### 4. Citation Format

**Before:**
```typescript
// No citation support
```

**After:**
```typescript
// All factual claims must be cited
// Format: [source:filepath:line]
// Example: "The login function [source:auth/login.ts:42] validates credentials"
```

### New Features

#### 1. Skeptic Agent

```typescript
import { createSkepticAgent } from 'forgewright/agents';

const skeptic = createSkepticAgent({
  llm: anthropicClient,
  calibration: 'strict' // 'moderate' | 'lenient'
});

const verification = await skeptic.verifyClaim({
  claim: 'Users can authenticate via JWT',
  evidence: [{ type: 'code', content: '...', source: 'auth.ts', relevance: 0.9 }]
});
```

#### 2. Confidence Scoring

```typescript
import { calculateConfidence } from 'forgewright/agents';

const confidence = calculateConfidence({
  type: 'wiki',
  evidence: [
    { type: 'code', content: '...', source: 'file.ts', relevance: 0.8 }
  ]
});

// confidence.score: 0-1
// confidence.level: 'high' | 'medium' | 'low' | 'critical'
// confidence.behavior: 'note' | 'warn' | 'block' | 'refuse'
```

#### 3. Freshness Warnings

```typescript
import { checkStaleness, warnIfStale } from 'forgewright/data/freshness';

const freshness = checkStaleness(metadata);

if (freshness.staleness !== 'fresh') {
  warnIfStale(metadata);
  // Shows warning about stale data
}
```

### Configuration Changes

#### Old Config (v1.0)

```json
{
  "forgewright": {
    "llm": "claude"
  }
}
```

#### New Config (v2.0)

```json
{
  "forgewright": {
    "llm": "claude",
    "antiHallucination": {
      "verification": {
        "enabled": true,
        "calibration": "moderate",
        "confidenceThreshold": 0.8
      },
      "freshness": {
        "freshThresholdHours": 24,
        "staleThresholdHours": 72
      },
      "citations": {
        "required": true,
        "format": "inline"
      }
    }
  }
}
```

### CLI Changes

#### Before

```bash
forgewright analyze
forgewright wiki auth
```

#### After

```bash
# Verification enabled by default
forgewright analyze
forgewright wiki auth

# Explicit verification
forgewright analyze --verify
forgewright wiki auth --verify

# Skip verification (fast mode)
forgewright analyze --no-verify
forgewright wiki auth --no-verify

# Strict mode (fail on low confidence)
forgewright wiki auth --strict

# Check freshness
forgewright status

# Run evaluation
forgewright evaluate
```

### Step-by-Step Migration

#### Step 1: Update Dependencies

```bash
npm install forgewright@2.0
```

#### Step 2: Update Imports

```typescript
// Old
import { analyze, query, impact } from 'forgewright';

// New
import { analyze, query, impact } from 'forgewright';
import { 
  createSkepticAgent,
  calculateConfidence,
  checkStaleness 
} from 'forgewright/agents';
```

#### Step 3: Add LLM Configuration

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const skeptic = createSkepticAgent({
  llm: client,
  calibration: 'moderate'
});
```

#### Step 4: Handle Confidence

```typescript
const result = await analyze(repoPath);

if (result.confidence.level === 'critical') {
  console.error('Content confidence too low');
  process.exit(1);
}

if (result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings);
}
```

#### Step 5: Verify Claims (Optional)

```typescript
const verification = await skeptic.verifyClaim({
  claim: result.content,
  evidence: result.sources
});

if (!verification.verified) {
  console.error('Content verification failed:', verification.issues);
}
```

### Rollback

If you encounter issues, rollback is supported:

```bash
# Disable verification globally
FORCE_NO_VERIFY=1 forgewright analyze

# Or in config
{
  "forgewright": {
    "antiHallucination": {
      "verification": {
        "enabled": false
      }
    }
  }
}
```

### Common Issues

#### Issue: "Citations required but not found"

**Solution:**
```typescript
// Ensure your generation includes citations
const content = `
  The login function [source:auth/login.ts:42] handles authentication.
  It validates [source:auth/login.ts:45] the password against the hash.
`;
```

#### Issue: "Confidence too low"

**Solutions:**
1. Ensure graph data is fresh: `forgewright analyze --force`
2. Lower threshold: `--threshold 0.6`
3. Disable verification: `--no-verify`

#### Issue: "Stale data warning"

**Solution:**
```bash
forgewright analyze --force
```

### Support

For issues, run:
```bash
forgewright evaluate --verbose > debug.log
```

Then file an issue with the debug log attached.
