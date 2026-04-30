# ForgeNexus — Code Intelligence Engine

> **Part of [ForgeWright](https://github.com/buiphucminhtam/forgewright)** — High-performance code analysis with persistent caching.

ForgeNexus is ForgeWright's code intelligence engine. It indexes codebases and provides instant context about symbols, relationships, and execution flows.

## Quick Start

```bash
# From forgewright directory
cd forgenexus
npm install && npm run build

# Analyze any project
npx forgenexus analyze /path/to/project

# Query the index
npx forgenexus query "findUser"
npx forgenexus context getUser
```

## Performance Features

### AST Cache

Caches parsed AST results to skip re-parsing unchanged files:

```
AST Cache: 142/145 hits (97.9%)
Parse: 2.1s (vs ~60s without cache)
```

- Content-hash validation (SHA-256 + CRC32)
- Automatic eviction when size limit reached
- Parser version validation

### Incremental Community Detection

Only re-runs Leiden algorithm when necessary:

| Change Level | Strategy |
|-------------|----------|
| <5% files changed | Incremental update |
| 5-20% files changed | Subgraph re-clustering |
| ≥20% files changed | Full rebuild |

### Suffix Trie

O(1) import path resolution instead of O(n²) suffix matching:

```
Trie: Built in 12ms
Resolve: 50ms (vs ~5s without trie)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ForgeNexus Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│  1. Scan     →  2. Parse (AST Cache)  →  3. Resolve        │
│  4. Bind     →  5. Community (Leiden)  →  6. Process       │
│  7. FTS      →  8. Embeddings  →  9. Meta                 │
└─────────────────────────────────────────────────────────────┘
```

## Module Structure

```
src/
├── analysis/           # Core analysis pipeline
│   ├── indexer.ts     # Main pipeline orchestrator
│   ├── scanner.ts     # File discovery
│   └── parser.ts      # Tree-sitter parsing
├── data/              # Data layer
│   ├── ast-cache.ts   # Persistent AST cache
│   ├── community-cache.ts  # Incremental community
│   ├── leiden.ts      # Leiden algorithm
│   └── graph.ts       # Execution flow tracing
└── cli/               # CLI commands
    └── analyze.ts     # analyze command
```

## Benchmark Results

| Metric | Cold Run | Warm Run |
|--------|----------|----------|
| Total Time | ~60s | ~10s |
| Parse Time | ~40s | ~2s |
| AST Cache Hits | 0% | 95%+ |
| Trie Build | 3-4ms | 3-4ms |

## Cache Location

```
.forgenexus/
├── cache/
│   ├── ast/           # AST cache
│   │   ├── manifest.json
│   │   └── {path}.json
│   └── trie/          # Trie cache (unused, build is fast)
└── db/
    └── codebase.db    # Knowledge graph
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npx tsc --noEmit
```

## Integration with ForgeWright

ForgeNexus is primarily used through ForgeWright's MCP server. When you set up ForgeWright with Level 4 (MCP), ForgeNexus tools are available in your IDE:

- `forgenexus_query` — Find code by concept
- `forgenexus_context` — Get symbol details
- `forgenexus_impact` — Blast radius analysis
- `forgenexus_route_map` — API routes

See [ForgeWright README](../README.md) for setup instructions.

## License

MIT — Same as ForgeWright
