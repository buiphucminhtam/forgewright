---
id: session-deduplication
title: Session Deduplication — Middleware Protocol
summary: Core protocol for session deduplication.
status: active
version: 1.0.0
owners: [core]
triggers: []
used_by: [all]
related: []
supersedes: []
superseded_by: null
---
# Session Deduplication — Middleware Protocol

> **Purpose:** Avoid re-executing cacheable duplicate tool calls within a deduplication window. Cache hits return a fresh decoded copy of the complete cached result. This can avoid tool execution work, but token savings depend on host behavior and must be measured.

> **Hook:** `before_tool()` — runs on every tool call, before execution.

> **Position in chain:** Insert after Guardrail (④), before tool execution. Numbered **④b**.

> **Type:** Non-blocking optimization. If dedup fails, continue with normal execution.

## How It Works

```
User: "run tests"
Agent: [tool] run_command("npm test")
                    │
                    ▼
            ┌───────────────────────┐
            │ SessionDeduplication  │  ← intercepts EVERY tool call
            └───────────────────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
   key = sha256(tool + args)  │  key NOT in dedupStore
         │                     │
    ┌────┴────┐               │
    │ cached? │               │
    └────┬────┘               │
      YES│NO                  │
         │                    │
    ┌────┴────┐              │
    │ return  │              │  Execute tool normally
    │ cached  │              │
    │ + summary│             │
    └─────────┘              │
         │                   │
         └───────────────────┘
                 │
         Store result in dedupStore
```

## Dedup Key Generation

The key must be:
- **Deterministic:** same tool+args always produces same key
- **Normalized:** arg ordering, whitespace, trailing commas don't affect key
- **Tool-specific:** `Write` with same content = same key; `Read` with same path = same key

```typescript
function normalizeArgs(args: Record<string, unknown>): string {
  // Sort keys alphabetically
  // Remove undefined/null values
  // Recursively normalize nested objects
  // Stringify with stable whitespace
}

function computeDedupKey(toolName: string, args: Record<string, unknown>): string {
  const normalized = normalizeArgs(args);
  return `${toolName}::${sha256(normalized)}`;
}
```

## Dedup Entry

```typescript
interface DedupEntry {
  key: string;
  toolName: string;
  argsHash: string;
  serializedResult: string; // private JSON snapshot including structuredContent
  bytes: number;           // conservative accounted bytes
  firstSeen: number;      // timestamp ms
  lastSeen: number;       // timestamp ms
  firstSeenTurn: number;  // turn number
  lastSeenTurn: number;   // turn number
  seenCount: number;
  resultTokens: number;   // estimated tokens in result
}
```

## Configuration

```yaml
# .production-grade.yaml
session_deduplication:
  enabled: true
  window_turns: 10        # deduplication window in turns
  window_ms: 300000       # time-based window (5 min)
  max_store_size: 500     # max entries in dedup store
  # project_root: /physical/project/root  # host-owned config, defaults to realpath(cwd)
  exclude_tools:          # tools never deduplicated
    - write_to_file
    - Read
    - EditNotebook
    - Bash  # bash deduplication is handled by shell-filter
  include_tools:          # tools to deduplicate (empty = all except excluded)
    - run_command
    - Grep
    - Glob
    - SemanticSearch
    - FetchMcpResource
  cache_reads: true       # cache Read/Grep results
```

## Return Value

When a duplicate is detected:

```typescript
{
  dedup: true,
  result: cachedResult,     // original tool result
  metadata: {
    seenCount: 3,
    firstSeenTurn: 1,
    tokensSaved: 450,
    summary: "🔄 [3× duplicate — first seen 2 turns ago, saved ~450 tokens]"
  }
}
```

The middleware chain and tool gateway return the complete cached result.
`summary` and `tokensSaved` are metadata, not evidence that the host replaced
the result with a summary or reduced model input tokens.

## Measuring Savings

The existing `tokensSaved` metric estimates cached result text volume. It does
not measure token billing or context reduction. Compare actual tool executions,
elapsed time and host-reported input tokens for the same workload before making
a savings claim. Returning the same full result may leave input token volume
unchanged even when the tool execution is avoided.

## Error Handling

| Scenario | Action |
|----------|--------|
| Dedup store unavailable | Continue without dedup (WARN log) |
| Key collision | Execute tool normally, don't cache |
| Cache miss | Execute tool, store result |
| Result over 25k estimated text tokens or 512 KiB accounted bytes | Skip caching, execute normally |
| Project/process cache quota reached | Evict least-recently-used result copies, never source files |

## Tool-Specific Behavior

| Tool | Dedup Strategy | Rationale |
|------|---------------|-----------|
| `run_command` | Hash cmd + args | Bash deduplication is in shell-filter |
| `Grep` | Hash pattern + path + flags | Same query = same results |
| `Glob` | Hash glob + path | Same pattern = same results |
| `SemanticSearch` | Hash query + target | Same query = same results |
| `FetchMcpResource` | Hash server + uri | Same resource = same content |
| `Read` | Hash path + offset + limit | Large reads, deduplication valuable |
| `Glob` | Hash glob + path | Repeated tree walks expensive |
| `Write` | **NEVER** | Side effects must always execute |
| `Bash` | Shell filter handles | `rtk`/`chop`/`snip` compress output |
| `Delete` | **NEVER** | Side effects must always execute |
| `EditNotebook` | **NEVER** | Side effects must always execute |
| `ReadLints` | Deduplicate | Repeated lint checks same output |
| `Glob` | Hash glob pattern | Same pattern = same results |

## Session Lifecycle

| Event | Action |
|-------|--------|
| `session_start` | Clear dedup store |
| `turn_close` | Sliding window: evict entries older than `window_turns` or `window_ms` |
| `tool_call` | Check dedup, cache result |
| `session_end` | Clear dedup store |

## Metrics to Track

```typescript
interface DedupMetrics {
  totalCalls: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;           // cacheHits / totalCalls
  totalTokensSaved: number;
  avgTokensSavedPerHit: number;
  byTool: Record<string, { hits: number; tokensSaved: number }>;
}
```

## Integration Points

| Component | Integration |
|-----------|------------|
| **Shell Filter (I-NEW-1.1)** | Shell filter compresses bash output BEFORE dedup checks it |
| **RTK Detection (I-NEW-1.3)** | RTK output flows through dedup middleware |
| **Memory (I-NEW-3)** | Dedup metrics stored as session facts by Memory middleware |
| **Tool Output Sandbox (I2)** | Sandbox compresses tool outputs before dedup caches them |

## References

- I-NEW-1.2 in `docs/archive/improvement-roadmap-v2.md`
- Middleware Chain: `middleware-chain.md`
- Shell Filter: `shell-filter.md`

## Bounded result memory

The MCP result cache shares an 8 MiB accounted-byte budget across middleware
instances in one process, with 2 MiB per physical project root and 512 KiB per
entry. The existing 500-entry limit and 25k text-token filter remain additional
bounds. At the old text ceiling, 500 roughly 100k-character results could retain
about 100 MB of UTF-16 text before metadata and structured payloads. The new total
is below 0.1% of an 8 GiB host, and each project can hold several maximum-size
entries. These are conservative policy choices, not an OS recommendation.

Charge includes UTF-8 payload length, two bytes per serialized JSON/key/project
character, and 512 bytes of metadata allowance. This is an accounting estimate,
not measured V8 heap or a hard process RSS limit. Results, including structured
content, are stored as private serialized snapshots. Oversize/cyclic snapshots
are not cached. Callers receive fresh decoded copies, so mutation cannot expand
retained cache entries after admission. Source results and files are untouched.

Project identity comes from host-owned `project_root` configuration, resolved to
a physical path. With no setting, all requests in that MCP process share its
physical working-directory bucket, conservatively limiting unclassified projects
together. Tool arguments cannot select a cheaper quota namespace. Separate MCP
processes each have their own 8 MiB budget, this is not a host-wide cache cap.

Evict project LRU entries first, then process LRU if needed. Reads renew entry
retention. One unreferenced maintenance timer removes idle entries after five
minutes, checked at one-minute intervals, without keeping the process alive.
Reset removes only that middleware owner's copies and reservations. Cache
metadata outside stored result entries is not claimed to fit this byte budget.

The lightweight native contract uses the project-installed TypeScript compiler
through its in-process API, without a Vitest worker or browser:
`node --test mcp/src/middleware/byte-cache.contract.mjs`. The Vitest unit suite
still runs in the aggregate gate, it is not replaced or skipped by this check.
