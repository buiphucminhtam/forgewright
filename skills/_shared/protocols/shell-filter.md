# Shell Output Filter Protocol

> **When:** Every Bash tool execution that produces output > 500 characters.
> **Goal:** Reduce shell output tokens by 60-90% before injection into context.

## Architecture

```
Bash Tool Call
      ↓
PreToolUse Hook (external: RTK/snip/chop or native filter)
      ↓
Command executes, output captured
      ↓
Shell Filter applies strategy (command-type routing)
      ↓
Filtered output → context
      ↓
Original output → audit log (for debugging)
```

## Strategy Routing

| Command Pattern | Strategy | Token Reduction |
|-----------------|---------|----------------|
| `git status` / `git status --short` | git_status_filter | ~90% |
| `git log` / `git log --oneline` | git_log_filter | ~90% |
| `git diff` / `git diff --stat` | git_diff_filter | ~80% |
| `npm test` / `npx jest` / `npx vitest` | npm_test_filter | ~95% |
| `npm install` / `pnpm install` | npm_install_filter | ~70% |
| `cargo test` | cargo_test_filter | ~95% |
| `pytest` | pytest_filter | ~95% |
| `tsc` / `npx tsc` | tsc_filter | ~80% |
| `ls` / `tree` | ls_filter | ~85% |
| `grep` / `rg` / `ag` | grep_filter | ~85% |
| `docker ps` / `kubectl get pods` | docker_kubectl_filter | ~70% |
| `curl` / `wget` / `http` | http_filter | ~60% |
| **fallback** | fallback_filter | ~30-50% |

## Filter Output Formats

### git status
```
main...origin/main | +2 staged | ~3 modified | ?1 untracked
```
vs original: 20-50 lines

### npm test
```
Tests: 262 passed in 2.45s
```
vs original: 262 test names + output lines

### cargo test
```
test result: ok. 42 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```
vs original: 500+ lines

### pytest
```
====== 100 passed, 3 failed in 12.34s ======
```
vs original: 200+ lines

## Compressor Stack (Priority Order)

```bash
# 1. RTK (best: Rust binary, ~5MB, <10ms overhead)
if command -v rtk &> /dev/null; then
    compressor="rtk"

# 2. chop (Go binary, 50+ built-in filters, multi-agent)
elif command -v chop &> /dev/null; then
    compressor="chop"

# 3. snip (Go binary, YAML filters, 19 pipeline actions)
elif command -v snip &> /dev/null; then
    compressor="snip"

# 4. Native filter (bash + awk + sed, no deps, always available)
else
    compressor="forgewright-shell-filter"
fi
```

## Fail-Safe Behavior

Every filter MUST:
1. **Return original output** if filter fails for any reason
2. **Preserve exit code** — exit code reflects command success, not filter success
3. **Never block** the command — timeout after 30s

## Context Injection Format

Filtered output enters context as-is. No extra metadata headers.

If the original output is < 500 characters and < 20 lines, skip filtering (not worth the overhead).

## Integration Points

| Where | How |
|-------|-----|
| Claude Code PreToolUse | Hook intercepts, transforms command |
| Cursor hooks | hooks.json config |
| Forgewright middleware | `middleware/shell-filter.ts` |
| Session audit log | `.forgewright/tool-audit.jsonl` |

## Metrics Tracked

| Metric | Purpose |
|--------|---------|
| `shell_filter_savings_ratio` | tokens_in / tokens_out |
| `shell_filter_command_type` | git/npm/cargo/etc |
| `shell_filter_compressor` | rtk/chop/snip/native |
| `shell_filter_fallback_count` | how many fell back to original |
