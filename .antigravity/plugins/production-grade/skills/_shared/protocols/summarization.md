# Context Summarization Protocol

> **Purpose:** Prevent token limit exhaustion during long pipeline sessions by automatically compressing completed sub-task context. Inspired by DeerFlow 2.0's summarization middleware which maintains conversation coherence at scale.

## When to Apply

- **Automatically** when the middleware chain detects context approaching token limits
- **After each skill completion** in multi-skill modes (Feature, Full Build, Game Build, AI Build)
- **Before parallel dispatch** to minimize per-worker context injection
- **Never** during single-skill modes unless explicitly > 70% token budget

## Configuration

```yaml
# Configurable in .production-grade.yaml
summarization:
  enabled: true
  trigger: token_fraction       # token_count | message_count | token_fraction
  threshold: 0.7                # compress when > 70% of max context used
  keep_recent: 5                # keep last 5 message pairs intact (question + answer)
  strategy: structured_summary  # structured_summary | truncate | offload_filesystem
  offload_path: .forgewright/context-cache/
  min_messages_before_trigger: 10  # don't summarize very short conversations
```

## Summarization Strategies

### Strategy 1: Structured Summary (Default)

Best for multi-skill pipelines where intermediate results feed downstream skills.

```
Trigger: context_tokens > threshold × max_context_tokens

Procedure:
  1. Identify completed sub-tasks (SKILL_COMPLETED events)
  2. For each completed sub-task, extract:
     - Skill name + mode
     - Files created/modified (list)
     - Key decisions made
     - Quality score (if quality gate ran)
     - Blockers or warnings
  3. Compress into structured summary block:

     --- Summarized Context (N sub-tasks) ---
     ## Completed: [skill-name] (score: X/100)
     - Created: file1.ts, file2.ts (3 files)
     - Modified: existing.ts (1 file)
     - Decision: Chose JWT over sessions for stateless auth
     - Test result: 12/12 passing
     ---

  4. Replace original verbose conversation turns with summary
  5. Keep recent `keep_recent` exchanges intact
  6. Offload full conversation to filesystem
```

### Strategy 2: Truncate (Lightweight)

Best for long but non-critical exploratory sessions (Polymath, Research).

```
Trigger: context_tokens > threshold × max_context_tokens

Procedure:
  1. Keep system prompt intact
  2. Keep first 2 message pairs (initial context)
  3. Remove middle conversation turns
  4. Keep last `keep_recent` message pairs
  5. Insert: "[... N earlier messages truncated ...]"
```

### Strategy 3: Offload to Filesystem (Maximum Recovery)

Best for Full Build pipelines where future skills may need older context.

```
Trigger: context_tokens > threshold × max_context_tokens

Procedure:
  1. Write full conversation to: .forgewright/context-cache/{session-id}-{timestamp}.md
  2. Apply Strategy 1 (structured summary) to active context
  3. Add filesystem reference:
     "[Full context saved to .forgewright/context-cache/{filename}]"
  4. Any future skill can read the offloaded file if needed
```

## Integration Points

### With Middleware Chain

Summarization runs as **Middleware ⑤** in the chain:

```
① SessionData → ② ContextLoader → ③ SkillRegistry → ④ Guardrail
→ ⑤ Summarization ← runs here, before skill execution
→ ⑥ QualityGate → ⑦ BrownfieldSafety → ⑧ TaskTracking
→ ⑨ Memory → ⑩ GracefulFailure
```

**Before-skill hook:** Check if summarization needed, compress if threshold exceeded
**After-skill hook:** Record completed skill for future summarization

### With Memory Manager

```
When summarization compresses context:
  1. Extract decisions + blockers from compressed content
  2. Pass to Memory Manager:
     mem0-cli.py add "Decision: [extracted]" --category decisions
     mem0-cli.py add "Blocker: [extracted]" --category blockers
  3. This ensures no information is permanently lost — it moves to memory
```

### With Parallel Dispatch

```
Before dispatching parallel workers:
  1. Run summarization on CEO agent context (reduce to essentials)
  2. Each worker receives ONLY:
     - Its CONTRACT.json (task-specific)
     - Summarized pipeline context (shared, compressed)
     - Its SKILL.md (skill-specific)
  3. Workers do NOT receive full conversation history
```

### With Session Lifecycle

```
At SESSION_END:
  1. Run final summarization
  2. Save summary to session-log.json for next session resume
  3. Save compressed context to context-cache/ for recovery
```

## Token Budget Management

```
┌──────────────────────────────────────────────────┐
│ Max Context: 1,000,000 tokens (Gemini 2.5 Pro)   │
│                                                  │
│ ████████████████░░░░░░░░░░░░░░░░  40% used       │
│                                                  │
│ Budget allocation:                               │
│   System prompt + protocols:  ~15K  (1.5%)       │
│   Skill descriptions:         ~8K  (0.8%)  ← NEW│
│   Memory context:             ~2K  (0.2%)        │
│   Project profile:            ~3K  (0.3%)        │
│   Conversation:             ~970K  (97%) ← room! │
│                                                  │
│ Summarization trigger: 700K tokens (70%)         │
│ After summarization:   ~200K tokens recovered    │
└──────────────────────────────────────────────────┘
```

> **Old budget (without progressive loading):**
> System + skills = ~70K (7%) leaving only 930K for conversation.
> **New budget:** System + skills = ~28K (2.8%) leaving 972K.

## Graceful Degradation

```
IF summarization fails (LLM error, timeout):
  1. Fall back to Strategy 2 (truncate) — no LLM needed
  2. Log warning: "⚠ Summarization failed — truncating context"
  3. Continue pipeline — NEVER block on summarization failure

IF context already below threshold after natural conversation flow:
  1. Skip summarization entirely
  2. Log: "Context within budget — summarization skipped"
```

## Metrics

Track summarization effectiveness in session-log.json:

```json
{
  "summarization": {
    "triggers": 3,
    "tokens_before": [850000, 780000, 720000],
    "tokens_after":  [350000, 320000, 280000],
    "avg_compression_ratio": 0.57,
    "decisions_extracted": 8,
    "blockers_extracted": 2,
    "offloaded_files": ["context-cache/session-20260325-1.md"]
  }
}
```
