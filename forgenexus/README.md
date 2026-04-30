# ForgeNexus — Code Intelligence Platform

> **High-performance code analysis with persistent caching for fast incremental updates.**

## Features

- **Incremental Analysis**: Only re-analyze changed files
- **Persistent AST Cache**: Skip re-parsing unchanged files (content-hash validated)
- **Suffix Trie Resolution**: O(1) import path resolution
- **Community Detection**: Leiden algorithm with incremental updates
- **Process Tracing**: BFS execution flow analysis
- **Full-Text Search**: SQLite FTS5 incremental indexing
- **Multi-Language**: TypeScript, JavaScript, Python, Go, Rust, Java, C#, C++, and more

## Installation

```bash
npm install
```

## Quick Start

### CLI Usage

```bash
# Analyze current directory
npx forgenexus analyze

# Force full re-index
npx forgenexus analyze --force

# Check code intelligence
npx forgenexus query "auth"
```

### Programmatic Usage

```typescript
import { Indexer } from '@forgewright/forgenexus';

const indexer = new Indexer(process.cwd(), {
  includeEmbeddings: false,
});

const stats = await indexer.analyze();
console.log(`Indexed ${stats.files} files, ${stats.nodes} nodes`);
```

## Performance Optimizations

### AST Cache

Caches parsed AST results to skip re-parsing unchanged files:

```
Cache: AST 142/145 hits (97.9%)
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

## Modules

### Data Layer

| Module | Description |
|--------|-------------|
| `ast-cache.ts` | Persistent AST cache with content-hash validation |
| `community-cache.ts` | Incremental community detection |
| `trie-cache.ts` | Persistent suffix trie (build is fast) |
| `leiden.ts` | Pure TypeScript Leiden algorithm |
| `graph.ts` | Execution flow tracing |

### Analysis Layer

| Module | Description |
|--------|-------------|
| `indexer.ts` | Main analysis pipeline |
| `scanner.ts` | File discovery |
| `parser.ts` | Tree-sitter parsing |
| `binding-propagation.ts` | Cross-file binding |
| `framework-detection.ts` | Framework detection |

### CLI

| Command | Description |
|---------|-------------|
| `analyze` | Run full analysis |
| `query` | Query the knowledge graph |

## Configuration

```typescript
const config: ForgeNexusConfig = {
  languages: ['typescript', 'javascript', 'python'],
  maxFileSize: 512 * 1024,
  skipPatterns: ['**/node_modules/**'],
  includeEmbeddings: false,
  repoName: 'my-project',
};
```

## Cache Management

```bash
# Cache location
.forgenexus/
├── cache/
│   ├── ast/           # AST cache
│   │   ├── manifest.json
│   │   └── {path}.json
│   └── trie/          # Trie cache (unused, build is fast)
└── db/
    └── codebase.db    # Knowledge graph
```

## Performance Benchmarks

| Metric | Cold Run | Warm Run |
|--------|----------|----------|
| Total Time | ~60s | ~10s |
| Parse Time | ~40s | ~2s |
| AST Cache Hits | 0% | 95%+ |
| Trie Build | 3-4ms | 3-4ms |

## License

MIT
