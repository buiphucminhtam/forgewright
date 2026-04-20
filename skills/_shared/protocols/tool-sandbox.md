# Tool Output Sandboxing — Middleware Protocol

> **Purpose:** Intercept every tool's output before it enters LLM context. Capture full output to audit log. Inject a structured summary instead of raw text. Combined with session deduplication, prevents repeated tool calls from re-entering context.

> **Hook:** `after_tool()` — runs after every tool call returns a result.

> **Position in chain:** After session dedup (④b), before QualityGate (⑥).

> **Type:** Non-blocking optimization with audit trail.

## Architecture

```
Tool Result
    │
    ▼
┌─────────────────────┐
│ ToolOutputSandbox   │  ← intercept after_tool()
└─────────────────────┘
    │
    ├──► Write to Audit Log (async, non-blocking)
    │    .forgewright/audit/{session}/{tool}/{timestamp}.jsonl
    │
    ├──► Sanitize Output
    │    Strip ANSI codes
    │    Check for prompt injection attempts
    │    Validate JSON if applicable
    │
    ├──► Compress Output
    │    > 10KB: truncate with "... (N lines truncated)"
    │    > 100KB: store reference, return size summary
    │
    ├──► Generate Structured Summary
    │    { tool, args, result_summary, tokens, timestamp }
    │
    └──► Inject Summary into LLM Context
         (instead of full raw output)
```

## Audit Log Schema

```jsonl
{"sessionId":"abc","turnNumber":1,"tool":"Read","args":{"path":"/src/a.ts"},"result":{"content":["..."]},"tokens":450,"timestamp":"2026-04-20T13:00:00Z","compressed":false,"summary":"file /src/a.ts: 45 lines, 1250 chars"}
{"sessionId":"abc","turnNumber":1,"tool":"Grep","args":{"path":"/src","pattern":"TODO"},"result":{"content":["src/b.ts:10: TODO: fix this"]},"tokens":120,"timestamp":"2026-04-20T13:00:01Z","compressed":false,"summary":"Grep /src for 'TODO': 1 match in src/b.ts:10"}
```

## Tool-Specific Summary Formats

| Tool | Summary Format | Example |
|------|--------------|---------|
| `Read` | `file {path}: {N} lines, {M} chars` | `file /src/a.ts: 45 lines, 1250 chars` |
| `Grep` | `Grep {path} for '{pattern}': {N} matches` | `Grep /src for 'TODO': 3 matches in 2 files` |
| `Bash` | `{N} lines, exit {code}` | `50 lines, exit 0` |
| `Glob` | `{N} files` | `Glob **/*.ts: 24 files` |
| `SemanticSearch` | `{N} results from {K} sources` | `SemanticSearch 'auth': 5 results from 3 sources` |
| `FetchMcpResource` | `resource {uri}: {N} chars` | `resource forgewright://repos: 2048 chars` |
| `Write` | `wrote {path}: {N} bytes` | `wrote /src/a.ts: 2048 bytes` |
| `Edit` | `edited {path}: {N} changes` | `edited /src/a.ts: 3 changes` |
| `Delete` | `deleted {path}` | `deleted /tmp/cache.json` |
| `Error` | `error: {short message}` | `error: file not found at line 45` |

## Compression Rules

| Size | Action | Result Text |
|------|--------|-------------|
| < 1KB | Pass through | Full text |
| 1-10KB | Truncate to 1KB | `... (truncated from 5KB)` |
| 10-100KB | Structured summary only | Summary + `[{N} chars truncated]` |
| > 100KB | Audit log reference | `[{N} bytes stored in audit log]` |

## Sanitization Rules

| Check | Action |
|-------|--------|
| ANSI escape codes | Strip all `\x1b[...]` sequences |
| Prompt injection patterns | Log warning, replace with `[FILTERED]` |
| ANSI color codes | Remove using sed patterns |
| Trailing `\r` (Windows line endings) | Strip |
| Binary content | Detect via null bytes, summarize as `[binary: N bytes]` |

## Configuration

```yaml
# .production-grade.yaml
tool_sandbox:
  enabled: true
  audit_log_dir: ".forgewright/audit"
  max_raw_size: 10240        # 10KB — truncate above this
  max_summary_size: 512       # chars in summary
  enable_audit: true          # write to audit log
  sanitize: true              # strip ANSI, check injection
  compress_large: true        # truncate large outputs
  # Per-tool overrides
  tool_overrides:
    Read:
      max_raw_size: 51200    # 50KB for Read
    Write:
      max_raw_size: 0        # never compress Write output
    Grep:
      max_raw_size: 5120     # 5KB for Grep
```

## Session Dedup Integration

Tool output sandboxing works WITH session deduplication:

```
Session Deduplication (④b):
  Checks if tool+args was called before
  → If HIT: return cached result + dedup summary

Tool Sandbox (④c) [after deduplication]:
  → Runs on ALL tool outputs (including cached)
  → Captures to audit log
  → Generates structured summary
  → Injects summary into context
```

## Token Savings Model

```
Without sandboxing:
  Read 50KB file → 12,500 tokens injected
  Grep 50 matches → 5,000 tokens injected

With sandboxing:
  Read 50KB file → ~200 token summary
  Grep 50 matches → ~100 token summary

With dedup (2nd+ call):
  Cached result + dedup summary → ~25 tokens

Combined:
  Read 50KB, called 3 times
  = 200 + 25 + 25 = 250 tokens (vs 37,500 naive)
  Savings: 99.3%
```

## Error Handling

| Scenario | Action |
|----------|--------|
| Audit log write fails | Log to stderr, continue |
| Sanitization fails | Pass through original (fail-open) |
| Summary generation fails | Return original output |
| Disk full | Disable audit log, continue |
| Permission denied | Warn, continue without audit |

## Metrics to Track

```typescript
interface SandboxMetrics {
  totalTools: number;
  byTool: Record<string, { count: number; avgTokens: number; totalTokens: number; truncated: number }>;
  auditWrites: number;
  auditFailures: number;
  injectionAttemptsBlocked: number;
  compressionRatio: number; // tokens_saved / tokens_original
}
```

## Integration with Middleware Chain

```
④ Guardrail    → authorize tool call
④b SessionDedup → check cache / store result
④c ToolSandbox → audit + sanitize + compress + summarize
   ↓
Result Summary → LLM Context
```

## References

- I2 in `docs/improvement-roadmap-v2.md`
- Session Deduplication: `session-deduplication.md`
- Middleware Chain: `middleware-chain.md`
