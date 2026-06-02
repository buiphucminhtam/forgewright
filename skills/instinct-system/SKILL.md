---
name: instinct-system
description: >
  Continuous learning system that observes every tool call, learns project patterns,
  and proactively suggests optimizations. Hook-based, GDPR-aware, and designed
  to add < 50ms latency to any tool execution.
version: 1.0.0
author: forgewright
tags: [learning, patterns, hooks, automation, optimization, observation]
---

# Instinct System — Continuous Learning

> **Identity:** An always-on observer that learns your workflow patterns and suggests improvements — without manual "save this pattern" intervention.

## Quick Reference

| Command | Action |
|---------|--------|
| `FORGEWRIGHT_INSTINCTS_ENABLED=0` | Disable entire system |
| `processToolCall(tool, args, success, projectRoot)` | Record a tool call |
| `promotePatterns()` | Check for pattern suggestions |
| `getInstinctsConfig()` | View current configuration |

---

## Overview

The Instinct System is a **hook-based continuous learning system** that:

1. **Observes** every tool call (95%+ coverage target)
2. **Learns** patterns from repeated tool sequences
3. **Scores** confidence based on frequency, consistency, recency, cross-project usage
4. **Suggests** optimizations when confidence >= 0.7

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    INSTINCT SYSTEM ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────────┐     ┌───────────┐  │
│  │    Hook     │ ──▶ │    Observer       │ ──▶ │   Store   │  │
│  │ (tool_use)  │     │  (captures ctx)   │     │ (JSON)    │  │
│  └──────────────┘     └──────────────────┘     └───────────┘  │
│         │                     │                      │         │
│         │              ┌──────┴───────┐               │         │
│         │              ▼              ▼               ▼         │
│         │       ┌───────────┐  ┌───────────┐  ┌─────────────┐   │
│         │       │  Scorer   │  │ Project   │  │  Promoter   │   │
│         │       │ (0.3-0.9) │  │  Context  │  │ (suggest)   │   │
│         │       └───────────┘  └───────────┘  └─────────────┘   │
│         │                                                │       │
│         ▼                                                ▼       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              USER SUGGESTION (when confidence >= 0.7)       │  │
│  │                                                              │  │
│  │  "I notice you often use grep → read → str_replace.        │  │
│  │   Shall I create a refactor workflow for this pattern?"     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Trigger Conditions

### When does the Observer fire?

| Condition | Behavior |
|-----------|----------|
| Every tool call | If instincts enabled |
| Tool sequence length >= `minSequenceLength` (default: 3) | Pattern detection begins |
| Confidence >= `promotionThreshold` (default: 0.7) | Suggestion triggered |
| `FORGEWRIGHT_INSTINCTS_ENABLED=0` | Fast exit, no overhead |

### When does a Suggestion appear?

1. Pattern observed >= 3 times
2. Confidence score >= 0.7
3. Not already suggested in this session
4. Debounce period passed (default: 5 seconds)

---

## Confidence Scoring (0.3-0.9)

### Scoring Components

| Component | Weight | Description |
|-----------|--------|-------------|
| **Frequency** | 30% | More occurrences = higher score |
| **Recency** | 25% | Recent patterns weighted higher (exponential decay) |
| **Consistency** | 25% | Same pattern across files = higher score |
| **Cross-Project** | 20% | Patterns in multiple projects = higher score |

### Confidence Thresholds

| Range | Meaning | Action |
|-------|---------|--------|
| 0.30 - 0.44 | Low | Recorded but not suggested |
| 0.45 - 0.59 | Medium | Learning, waiting for more data |
| 0.60 - 0.69 | High | Approaching suggestion threshold |
| **0.70 - 0.89** | **Promote** | **Suggestion triggered** |
| 0.90+ | Excellent | Pattern fully established |

### Confidence Calculation

```typescript
confidence = min(0.9, max(0.3,
  (frequencyScore * 0.30) +
  (recencyScore * 0.25) +
  (consistencyScore * 0.25) +
  (crossProjectScore * 0.20)
))
```

---

## Auto-Suggestion Format

### Suggestion Message Structure

```
[Pattern detected] {tool_sequence}
Confidence: {confidence} | Occurrences: {count} | Projects: {n}

{message}

{action_label}: {action_description}
```

### Example Suggestions

**Create Skill Suggestion:**
```
[Pattern detected] read → grep → str_replace → read → str_replace
Confidence: 0.78 | Occurrences: 12 | Projects: 2

I notice you often use the sequence: read → grep → str_replace.
This pattern appears 12 times across 2 project(s).
Would you like me to create a skill for this workflow?

[Create Skill]: Wrap this pattern into a reusable skill
```

**Optimize Workflow Suggestion:**
```
[Pattern detected] glob → read → read → read → grep
Confidence: 0.72 | Occurrences: 8 | Projects: 1

You seem to follow a common pattern: glob → read → read → read → grep.
This could be optimized with a custom workflow.

[Optimize]: Suggest workflow improvements
```

**Add Hook Suggestion:**
```
[Pattern detected] shell → shell → shell → shell
Confidence: 0.75 | Occurrences: 15 | Projects: 1

I'm learning your shell → shell → shell → shell pattern.
Should I add an automatic hook for this?

[Add Hook]: Automate this pattern with a hook
```

---

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGEWRIGHT_INSTINCTS_ENABLED` | `1` | Master switch (0 = disable) |
| `FORGEWRIGHT_INSTINCTS_CONFIG` | auto | Path to config JSON |
| `FORGEWRIGHT_INSTINCTS_STORE` | auto | Path to store.json |
| `FORGEWRIGHT_INSTINCTS_LOG` | `info` | Log level (silent/error/info/debug) |

### Config File (.forgewright/instincts-config.json)

```json
{
  "enabled": true,
  "minSequenceLength": 3,
  "sequenceWindowSize": 10,
  "minInitialConfidence": 0.35,
  "promotionThreshold": 0.7,
  "maxEventsPerMinute": 60,
  "maxPatterns": 1000,
  "pruneThreshold": 0.15,
  "autoSuggest": true,
  "maxSuggestionsPerSession": 3,
  "suggestionDebounceMs": 5000,
  "crossProjectTracking": true,
  "hashArguments": true
}
```

### Per-Project Override

Create `.forgewright/instincts-config.json` in any project to override defaults:

```json
{
  "enabled": true,
  "promotionThreshold": 0.75,
  "maxSuggestionsPerSession": 2
}
```

---

## Performance Impact

### Latency Budget

| Operation | Target | Maximum |
|-----------|--------|---------|
| Observer hook | < 10ms | 20ms |
| Store write | < 5ms | 15ms |
| Pattern lookup | < 3ms | 10ms |
| **Total per tool call** | **< 50ms** | **50ms** |

### Optimization Techniques

1. **Lazy loading**: Store loaded on first access only
2. **Debounced writes**: Batch writes, don't persist on every call
3. **Context caching**: Project context cached for 60 seconds
4. **Rate limiting**: Configurable max events per minute
5. **Fast exit**: Feature flag check is O(1)

---

## Privacy & GDPR

### What We Store

| Data | Stored | Privacy |
|------|--------|----------|
| Tool names | ✅ Yes | Low risk |
| Tool sequence hash | ✅ Yes | GDPR-aware |
| Project context (language, framework) | ✅ Yes | Aggregated |
| Timestamps | ✅ Yes | Pseudonymized |
| Occurrence count | ✅ Yes | Aggregated |
| **Tool arguments** | ❌ No | **Hashed only** |
| **Raw code** | ❌ No | **Never stored** |
| **User identifiers** | ❌ No | **Never stored** |

### Privacy Controls

```typescript
// Arguments are hashed, not stored raw
hashArguments: true  // Default: hashes tool args for privacy
```

---

## Store Format

**Location:** `.forgewright/instincts/store.json`

```json
{
  "patterns": [
    {
      "id": "a1b2c3d4e5f6",
      "toolSequence": ["read", "grep", "str_replace"],
      "projectContext": {
        "language": "typescript",
        "framework": "react"
      },
      "confidence": 0.75,
      "occurrences": 5,
      "firstSeen": "2026-06-02T10:00:00Z",
      "lastSeen": "2026-06-02T14:30:00Z",
      "suggested": false,
      "crossProject": true,
      "projectIds": ["forgewright", "my-app"]
    }
  ],
  "version": "1.0.0",
  "lastUpdated": "2026-06-02T14:30:00Z"
}
```

---

## Integration

### Hook Integration (Claude Code)

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": "./scripts/forgewright-instinct-hook.sh observe"
  }
}
```

### MCP Server Integration

```typescript
import { processToolCall } from './instincts/index.js';

// In MCP server tool handler
async function handleToolCall(toolName: string, args, result) {
  const start = Date.now();
  
  // Normal tool execution...
  
  // Record to instinct system (async, non-blocking)
  processToolCall(
    toolName,
    args,
    result.success,
    projectRoot,
    sessionId
  ).catch(console.error); // Never let instincts affect tool execution
}
```

### Standalone Usage

```typescript
import {
  initInstincts,
  observeToolCall,
  promotePatterns,
  getObserverStats,
  getInstinctsConfig,
} from './instincts/index.js';

// Initialize once
initInstincts();

// After each tool call
await observeToolCall({
  toolName: 'Read',
  arguments: { path: '/src/app.ts' },
  sessionId: 'sess-123',
  timestamp: new Date().toISOString(),
  success: true,
}, projectRoot);

// Check for suggestions
const promotion = promotePatterns(sessionId);
if (promotion.suggestions.length > 0) {
  console.log(promotion.suggestions[0].message);
}

// Check system health
console.log(getObserverStats());
```

---

## Acceptance Criteria (Sprint 2)

| # | Criterion | Target | Status |
|---|-----------|--------|--------|
| 1 | Observer fires on tool_use events | ≥ 95% | [ ] |
| 2 | Confidence scores generated | ≥ 80% of patterns | [ ] |
| 3 | Patterns persist across sessions | store.json verified | [ ] |
| 4 | `FORGEWRIGHT_INSTINCTS_ENABLED=0` disables | No code changes needed | [ ] |
| 5 | SKILL.md created | Full documentation | [ ] |
| 6 | No latency regression | Tool call < +50ms | [ ] |

---

## Future Enhancements (Backlog)

- [ ] **Skill Generator**: Auto-create skills from high-confidence patterns
- [ ] **Cross-project Pattern Library**: Share patterns across teams
- [ ] **Intent Classification**: Detect user goals from patterns
- [ ] **Feedback Loop**: Learn from user acceptance/rejection of suggestions
- [ ] **Visual Dashboard**: Show learned patterns and confidence trends

---

## File Structure

```
.forgewright/
├── instincts/
│   ├── index.ts              # Main exports
│   ├── observer.ts           # Hook: fires on every tool_use
│   ├── scorer.ts             # Confidence scoring 0.3-0.9
│   ├── promoter.ts           # Auto-promote patterns
│   ├── instinct-store.ts     # JSON store for patterns
│   └── instincts-config.ts   # Configuration
├── instincts-config.json     # Per-project overrides (optional)
scripts/
└── forgewright-instinct-hook.sh  # CLI/hook integration
skills/
└── instinct-system/
    └── SKILL.md              # This file
```

---

## CLI Commands

```bash
# Check status
./scripts/forgewright-instinct-hook.sh status

# View stats
./scripts/forgewright-instinct-hook.sh stats

# Clear pattern store
./scripts/forgewright-instinct-hook.sh clear

# Observe a tool call
./scripts/forgewright-instinct-hook.sh observe "Read" '{}' "true"

# Promote patterns
./scripts/forgewright-instinct-hook.sh promote "session-id"
```
