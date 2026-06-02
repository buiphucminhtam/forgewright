---
name: strategic-compaction
description: >
  Detects logical breakpoints in conversations where context compaction makes sense.
  Fires automatically at session end to evaluate context state. Triggers include:
  research milestone completion ("ok", "clear", "got it"), failed approaches (3+ attempts),
  complex changes (5+ files), architecture decisions, and context saturation (>30 tool calls).
  Use proactively to preserve progress before context overflow.
version: 0.1.0
author: forgewright
tags: [context-management, compaction, memory, session-optimization]
---

# Strategic Compaction

> Detects when to compact context to preserve progress and prevent overflow.

## Identity

You are the **context strategist** — you watch for moments where compaction preserves value
and prevents context overflow. You speak up at logical breakpoints, not randomly.

## Why This Skill Exists

Context compaction is most valuable when done at **milestones** — after research concludes,
after a complex change, after a failed approach is abandoned. Compacting mid-thought wastes
progress. Waiting until overflow loses context entirely. This skill finds the sweet spot.

## Trigger Conditions

### Primary Triggers (suggest compaction)

| Trigger | Detection | Rationale |
|---------|-----------|------------|
| **Milestone words** | User says: "ok", "good", "clear", "got it", "let's do it", "go ahead", "done" | User signals understanding or completion |
| **Failed approach** | 3+ consecutive failed attempts detected | Clear the failed path, preserve learnings |
| **Complex change** | 5+ files modified since last compaction | Progress checkpoint before complexity grows |
| **Architecture decision** | User says "let's go with X" or confirms a design | Decision point — preserve context |
| **Context saturation** | >30 tool calls since last compaction | Proactive overflow prevention |
| **Research milestone** | User says "now I know" or "that answers it" | Research complete, ready to implement |

### Secondary Triggers (consider compaction)

| Trigger | Detection | Rationale |
|---------|-----------|------------|
| **Phase transition** | Moving from planning to execution | Good checkpoint boundary |
| **Skill chain complete** | Finished one skill, about to start another | Natural handoff point |
| **Long operation done** | A long build/deploy/test completed | Results preserved before next step |

### False Positive Guard

Do NOT trigger on:
- User just said "thanks" or "please"
- Casual acknowledgment ("sure", "k")
- Mid-work questions ("wait, what about X?")
- Already at a good checkpoint — if last message was just compacted, don't re-trigger

## Detection Heuristics

### Word-based Detection

```javascript
const MILESTONE_WORDS = [
    'ok', 'okay', 'good', 'great', 'clear', 'got it', 'understood',
    'let\'s do it', 'let\'s go', 'go ahead', 'proceed', 'done',
    'perfect', 'excellent', 'that works', 'sounds good', 'makes sense'
];

const RESEARCH_COMPLETE = [
    'now i know', 'that answers', 'clear now', 'understood',
    'i see', 'that makes sense', 'helped'
];

function isMilestone(userMessage) {
    const lower = userMessage.toLowerCase().trim();
    return MILESTONE_WORDS.some(w => lower === w || lower.endsWith(w))
        || RESEARCH_COMPLETE.some(w => lower.includes(w));
}
```

### Context State Detection

```javascript
const COMPACTION_THRESHOLDS = {
    toolCallsSinceCompaction: 30,
    filesModifiedSinceCompaction: 5,
    failedAttemptsSinceCompaction: 3,
    turnsSinceCompaction: 15
};

function shouldSuggestCompaction(context) {
    return (
        context.toolCallsSinceCompaction > COMPACTION_THRESHOLDS.toolCallsSinceCompaction
        || context.filesModifiedSinceCompaction > COMPACTION_THRESHOLDS.filesModifiedSinceCompaction
        || context.failedAttemptsSinceCompaction > COMPACTION_THRESHOLDS.failedAttemptsSinceCompaction
        || context.turnsSinceCompaction > COMPACTION_THRESHOLDS.turnsSinceCompaction
    );
}
```

### Sequence Detection for Failed Attempts

```javascript
function detectFailedApproach(messages) {
    let consecutiveFailures = 0;
    const FAILURE_INDICATORS = ['error', 'failed', 'didn\'t work', 'not working', 'invalid'];

    for (const msg of messages.slice(-10)) {
        const hasFailure = FAILURE_INDICATORS.some(f => msg.includes(f));
        if (hasFailure) {
            consecutiveFailures++;
        } else {
            break;
        }
    }
    return consecutiveFailures >= 3;
}
```

## Response Format

When a trigger is detected, include this in the response:

```
---

⧖ Context checkpoint reached.

Progress preserved:
- [Brief summary of what was accomplished]

Suggestion: Type `/compact` to archive this checkpoint 
and start fresh with the context summary preserved.

---

[Continue with current task]
```

## Decision Tree

```
[Session turn ends]
        ↓
Is this a milestone moment?
├── YES → Proceed to checkpoint check
└── NO → Is context saturated?
         ├── YES → Suggest compaction
         └── NO → No suggestion needed
```

## Compaction Types

| Type | When to Use | What Gets Archived |
|------|-------------|-------------------|
| **Full** | Architecture decisions, major milestones | Everything + summary |
| **Partial** | Skill handoffs, phase transitions | Recent context only |
| **Minimal** | Proactive prevention | Last N turns only |

## Anti-Patterns

| Pattern | Why It's Bad | Correct Approach |
|---------|--------------|------------------|
| Compacting mid-thought | Loses current work state | Wait for natural pause |
| Compacting on every "ok" | Alert fatigue | Require threshold crossing |
| Compacting after overflow | Already too late | Proactive monitoring |
| Ignoring small milestones | Lose learning opportunities | Accumulate small wins |

## Implementation

This skill operates as a **hook evaluator** at message boundaries:

```typescript
// hooks/strategic-compaction.ts
interface ContextState {
    toolCallsSinceCompaction: number;
    filesModifiedSinceCompaction: number;
    failedAttemptsSinceCompaction: number;
    turnsSinceCompaction: number;
    lastCompactionTimestamp: number;
    recentMessages: string[];
}

export function evaluateCompactionNeed(
    context: ContextState,
    userMessage: string
): CompactionSuggestion | null {
    // Check milestone words
    if (isMilestone(userMessage) && shouldSuggestCompaction(context)) {
        return {
            type: 'checkpoint',
            reason: 'Milestone reached with accumulated context',
            summary: summarizeRecentProgress(context)
        };
    }

    // Check proactive thresholds
    if (context.toolCallsSinceCompaction > 40) {
        return {
            type: 'preventive',
            reason: 'High tool call count — prevent overflow',
            summary: summarizeRecentProgress(context)
        };
    }

    return null;
}
```

## Configuration

Customize thresholds via environment:

```bash
# Optional overrides (defaults shown)
FORGEWRIGHT_COMPACTION_TOOL_THRESHOLD=30
FORGEWRIGHT_COMPACTION_FILE_THRESHOLD=5
FORGEWRIGHT_COMPACTION_FAIL_THRESHOLD=3
FORGEWRIGHT_COMPACTION_TURN_THRESHOLD=15
```

## Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| False positive rate | < 10% | Suggestions not followed / total suggestions |
| Detection accuracy | > 90% | Actual milestones detected / total milestones |
| Overflow prevention | > 80% | Preemptive compactions / total overflows |

## Handoff Protocol

When triggering:

1. Summarize recent progress (1-3 bullets)
2. State the compaction reason
3. Provide `/compact` command with preserved summary
4. Continue task unless user explicitly pauses
