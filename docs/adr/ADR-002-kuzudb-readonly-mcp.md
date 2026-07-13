# ADR-002: KuzuDB Read-Only MCP Server

## Status
Accepted

## Context
ForgeNexus uses KuzuDB as its graph database backend. The MCP server (read-only queries) and the analyze CLI (read-write indexing) were both opening the database in read-write mode, causing lock conflicts when both processes ran simultaneously.

This manifested as:
```
[ForgeNexus] ⚠️ KuzuDB lock conflict: MCP server is likely running.
Could not set lock on file : .forge/
```

Multiple ForgeNexus MCP servers run concurrently across projects, making this a common race condition.

## Decision
Introduce a `readOnly` flag on the `ForgeDB` constructor:

```typescript
// MCP server: read-only mode
const db = new ForgeDB(dbPath, { readOnly: true })

// Analyze CLI: write mode (default)
const db = new ForgeDB(dbPath)
```

### Implementation Details
- `ForgeDB` passes `readOnly: true` to KuzuDB's `Database` constructor
- Schema initialization is skipped in read-only mode (schema already exists)
- Flush timer is disabled in read-only mode (no writes queued)
- MCP tools (`query`, `context`, `impact`, etc.) only call read methods

## Consequences

### Positive
- MCP server and analyze CLI can run concurrently
- The read-only MCP design removes intended write operations from this path and reduces index-corruption risk; it is not proof against storage, library, or implementation defects
- Multiple MCP servers across projects don't conflict
- Read-only MCP connections avoid the known writer-lock conflict exercised by this design; operational lock failures remain possible and must be reported

### Negative
- MCP tools cannot write to the index (by design — correct)
- If MCP tries to call a write method, it will silently fail
- Read-only mode requires pre-existing schema

## Notes
KuzuDB supports concurrent reads with a single writer. The MCP server only queries; the analyze CLI is the sole writer.
