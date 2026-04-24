# ForgeNexus Architecture

> **ForgeNexus** is a self-hosted code intelligence engine that builds a knowledge graph from your codebase. It's designed to power AI coding assistants with accurate, real-time code context.

## Overview

ForgeNexus analyzes source code to build a queryable knowledge graph containing:

- **Nodes**: Functions, classes, interfaces, variables, files, etc.
- **Edges**: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, MEMBER_OF, etc.
- **Communities**: Related code clusters (Leiden algorithm)
- **Processes**: Execution flows traced from entry points

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ForgeNexus Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐     │
│  │ Scanner │───▶│ Parser  │───▶│ Edges   │───▶│Binding  │     │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘     │
│      │              │              │              │              │
│      ▼              ▼              ▼              ▼              │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐     │
│  │Communities│   │Processes│    │   FTS   │    │Embeddings│     │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Knowledge Graph (KuzuDB)                     │
├─────────────────────────────────────────────────────────────────┤
│  CodeNode │ CodeEdge │ Community │ Process │ Meta               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Server (stdio)                        │
├─────────────────────────────────────────────────────────────────┤
│  query │ context │ impact │ detect_changes │ cypher │ rename   │
└─────────────────────────────────────────────────────────────────┘
```

## Pipeline Phases

| Phase | Description | Output |
|-------|-------------|--------|
| **Scanning** | Discover source files via glob patterns | File list with language detection |
| **Parsing** | Tree-sitter AST extraction | Symbol nodes, relationship edges |
| **Edges** | Resolve UNKNOWN:* references + module imports | Resolved CALLS, IMPORTS edges |
| **Binding** | Cross-file type/import propagation | Additional resolved edges |
| **Communities** | Leiden algorithm for code clusters | Community nodes, MEMBER_OF edges |
| **Processes** | BFS execution flow tracing | Process nodes, STEP_IN_PROCESS edges |
| **FTS** | Incremental FTS5 search index | Full-text search capability |
| **Embeddings** | Optional semantic vector generation | Semantic search capability |

## Core Components

### `src/analysis/indexer.ts`

The main `Indexer` class orchestrates the entire pipeline:

```typescript
const indexer = new Indexer(repoPath, { includeEmbeddings: false })
const stats = await indexer.analyze(onProgressCallback, incremental)
```

Key features:
- Incremental mode (only changed files since last index)
- Early exit on unchanged git commit
- Per-phase progress callbacks
- KuzuDB integration

### `src/analysis/parser.ts`

Tree-sitter-based code parser with:
- Multi-language support (TypeScript, Python, Go, Rust, etc.)
- Deduplication of overlapping AST captures
- Symbol extraction via TSQuery patterns

### `src/data/db.ts`

KuzuDB wrapper providing:
- Node/edge CRUD operations
- Batch inserts for performance
- Transaction support
- FTS index management

### `src/cli/progress.ts`

ASCII progress bar for CLI with:
- Multi-phase tracking
- Animated spinner
- Color-coded output
- Phase timing metadata
- JSON logging mode

## CLI Commands

```bash
# Index a repository
forgenexus analyze                    # Current directory
forgenexus analyze /path/to/repo     # Specific directory
forgenexus analyze --force           # Force full rebuild
forgenexus analyze --embeddings      # With semantic vectors

# Query the index
forgenexus query "findUser"         # Search symbols
forgenexus context getUser          # Get symbol details
forgenexus impact validateToken     # Blast radius analysis
forgenexus cypher "MATCH (n)..."   # Raw Cypher query

# Manage index
forgenexus status                   # Check freshness
forgenexus list                     # List indexed repos
forgenexus clean                    # Delete index
```

## MCP Tools

When running as MCP server (`forgenexus mcp`):

| Tool | Description |
|------|-------------|
| `list_repos` | List all indexed repositories |
| `query` | Search code by symbol name |
| `context` | Get full context for a symbol |
| `impact` | Analyze blast radius |
| `detect_changes` | Show changed symbols |
| `cypher` | Execute raw Cypher query |
| `rename` | Safe multi-file renaming |

## Data Model

### Node Types

| Type | Description |
|------|-------------|
| `File` | Source file |
| `Class` | Class definition |
| `Interface` | Interface definition |
| `Function` | Function/method |
| `Method` | Class method |
| `Property` | Property/field |
| `Variable` | Variable declaration |
| `TypeAlias` | Type alias |
| `Enum` | Enum |
| `Module` | Namespace/module |

### Edge Types

| Type | Description |
|------|-------------|
| `CALLS` | Function invocation |
| `IMPORTS` | Import statement |
| `EXTENDS` | Class inheritance |
| `IMPLEMENTS` | Interface implementation |
| `HAS_METHOD` | Class contains method |
| `HAS_PROPERTY` | Class contains property |
| `MEMBER_OF` | Member belongs to type |
| `OVERRIDES` | Method overrides parent |
| `STEP_IN_PROCESS` | Step in execution flow |

## Performance Optimizations

1. **Suffix Trie Import Resolution**: O(1) lookup instead of O(n²) table scan
2. **Incremental FTS**: Only update changed nodes
3. **Parallel Parsing**: Worker threads for large repos
4. **Early Exit**: Skip unchanged files on same commit
5. **Batch Inserts**: Group database writes
6. **Lazy Connection Pool**: Max 5 concurrent connections

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGENEXUS_SILENT` | false | Suppress all output |
| `FORGENEXUS_VERBOSE` | false | Enable debug logging |
| `EMBEDDING_PROVIDER` | auto | Embedding provider (openai, huggingface) |

### Skip Patterns

Files matching these patterns are excluded:

```javascript
'**/node_modules/**',
'**/dist/**',
'**/build/**',
'**/.git/**',
'**/coverage/**',
'**/*.min.js',
'**/*.map',
'**/*.d.ts',
'**/__pycache__/**',
'**/vendor/**'
```

## Comparison with GitNexus

| Feature | ForgeNexus | GitNexus |
|---------|------------|----------|
| Database | KuzuDB | LadybugDB |
| Parser | Tree-sitter (Node.js) | Tree-sitter (WASM) |
| Multi-repo | Registry + lazy pool | Global registry |
| Pipeline Phases | 8 phases | 12-phase DAG |
| Embeddings | Optional | Built-in |
| Web UI | No | React + Sigma.js |

## Future Improvements

- [ ] Web UI for graph visualization
- [ ] PR review integration
- [ ] Auto-updating wiki generation
- [ ] Additional language support (OCaml, Lua)
- [ ] Type-safe phase DAG (like GitNexus)
