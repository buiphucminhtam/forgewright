# Middleware ④b — Session Deduplication

> **Source:** `skills/_shared/protocols/session-deduplication.md`
> **Hook:** `before_tool()`
> **Position:** After Guardrail (④), before tool execution
> **Purpose:** Cache repeated identical tool calls to eliminate ~90% of redundant tokens

## Execution

```
1. Intercept every tool call (toolName, args)

2. Compute dedup key:
   key = sha256(toolName + normalizeArgs(args))

3. Check sliding window:
   - If lastSeenTurn is within window_turns → candidate for dedup
   - Otherwise → evict and continue with normal execution

4. Lookup dedupStore[key]:
   - HIT  → return cached result + summary metadata
   - MISS → execute tool, cache result

5. Update metrics (hits, misses, tokens saved)
```

## Output

```typescript
{
  dedup: true,
  result: CachedToolResult,
  metadata: {
    seenCount: number,
    firstSeenTurn: number,
    tokensSaved: number,
    summary: string  // Injected into LLM context
  }
}
```

## Dedup Rules

| Condition | Action |
|-----------|--------|
| Same tool + same args within window | Return cached result |
| Side-effect tool (Write, Delete) | NEVER cache |
| Result > 100KB | Skip cache |
| Dedup store full | Evict oldest by lastSeen |
| Dedup disabled for this tool | Execute normally |

## Integration with Middleware Chain

```
④ Guardrail    → authorize tool call
④b SessionDedup → check cache / store result
   ↓
TOOL EXECUTION
```

## Note

This is a non-blocking optimization. If deduplication fails (store unavailable, key collision, etc.), the tool executes normally. Never block a tool call because of dedup failures.
