# ForgeNexus v1.1.0 Migration Guide

## What's New

ForgeNexus v1.1.0 introduces **structured error responses** with actionable recovery hints. This is a **breaking change** for MCP clients that parse error messages programmatically.

## Breaking Changes

### Error Response Format

**Before (v1.0.x):**
```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "Error: No indexed repositories. Run 'forgenexus analyze' first." }]
}
```

**After (v1.1.0+):**
```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "⚠️ INDEX_NOT_FOUND\n\nNo indexed repositories found. The index may not exist or is empty.\n\n💡 Recovery: Run 'forgenexus analyze' to index your codebase.\n\n🚀 Quick start: `forgenexus analyze --quick  # Fast initial index`" }]
}
```

### Error Codes

All errors now include an error code that can be parsed:

| Error Code | Meaning | Action Required |
|------------|---------|-----------------|
| `INDEX_NOT_FOUND` | No index exists | Run `forgenexus analyze` |
| `INDEX_STALE` | Index is outdated | Run `forgenexus analyze` |
| `INDEX_CORRUPTED` | Index is corrupted | Run `forgenexus analyze --force` |
| `DB_LOCK_CONFLICT` | Another process is using the DB | Stop other ForgeNexus processes |
| `TOOL_NOT_FOUND` | Unknown tool name | Check available tools |
| `TOOL_EXECUTION_FAILED` | Tool failed to execute | Check error message |
| `GRAPH_UNAVAILABLE` | Graph query failed | May need to re-index |

## Migration Steps

### For MCP Clients

#### Option 1: Use Human-Readable Text (Recommended)

The error text is designed to be human-readable. Parse the `text` field directly:

```javascript
// Parse error code from text (if needed)
const text = response.content[0].text
if (text.startsWith('⚠️ ')) {
  const errorCode = text.split('\n')[0].replace('⚠️ ', '')
  // Handle by error code
}
```

#### Option 2: Enable Legacy Mode

Use the `--legacy-errors` flag to restore v1.0.x error format:

```bash
forgenexus serve --legacy-errors
```

#### Option 3: Parse Recovery Hints

Extract recovery hints from error text:

```javascript
const text = response.content[0].text
const recoveryMatch = text.match(/💡 Recovery: (.+)/)
const quickStartMatch = text.match(/🚀 Quick start: `(.+)`/)

if (recoveryMatch) {
  console.log('Recovery:', recoveryMatch[1])
}
if (quickStartMatch) {
  console.log('Quick start:', quickStartMatch[1])
}
```

### For AI Agents

The structured errors are designed for AI agent consumption:

1. **Error codes** help identify error categories
2. **Recovery hints** provide specific commands to run
3. **Quick start** provides one-command solutions

No changes needed for AI agents that read the text content.

## Compatibility

| Client Type | Status | Notes |
|-------------|--------|-------|
| Claude Desktop | ✅ Compatible | Reads text content |
| Cursor | ✅ Compatible | Reads text content |
| Custom MCP clients | ⚠️ Update needed | Parse new error format |
| CLI users | ✅ Compatible | Output unchanged |

## Rollback

If you need to revert to v1.0.x behavior:

```bash
# Use legacy errors mode
forgenexus serve --legacy-errors

# Or downgrade (if available)
npm install -g forgenexus@1.0.0
```

## New Features

### Error Recovery Suggestions

Each error now includes actionable recovery suggestions:

```
⚠️ INDEX_NOT_FOUND

No indexed repositories found.

💡 Recovery: Run 'forgenexus analyze' to index your codebase.
🚀 Quick start: `forgenexus analyze --quick  # Fast initial index`
```

### Doctor Command

New diagnostic command to identify issues:

```bash
forgenexus doctor
```

### Check Command

Quick status check:

```bash
forgenexus check
```

## Support

If you encounter issues:
1. Run `forgenexus doctor` to diagnose
2. Use `--legacy-errors` flag if needed
3. Report issues at https://github.com/buiphucminhtam/forgewright/issues
