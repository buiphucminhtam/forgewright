# Middleware ④c — Tool Output Sandbox

> **Source:** `skills/_shared/protocols/tool-sandbox.md`
> **Hook:** `after_tool()`
> **Position:** After SessionDeduplication (④b), before QualityGate (⑥)
> **Purpose:** Capture tool outputs to audit log, sanitize, compress, and inject structured summaries

## Execution

```
1. After tool returns result (from dedup or actual execution)

2. Sanitize:
   - Strip ANSI escape codes
   - Detect prompt injection patterns
   - Strip \r characters

3. Audit Log (async, non-blocking):
   - Write {sessionId}/{turnNumber}/{tool}/{timestamp}.jsonl

4. Compress:
   - > 10KB: truncate
   - > 100KB: store reference only

5. Generate summary:
   - Tool-specific format (see tool-sandbox.md)

6. Return summary for context injection
```

## Output

```typescript
{
  sandbox: {
    originalTokens: number;
    summaryTokens: number;
    tokensSaved: number;
    compressionRatio: number;
    summary: string;
    auditRef?: string;
    truncated: boolean;
    injectionBlocked: boolean;
  }
}
```

## Note

Non-blocking. If any step fails, fall back to original output.
