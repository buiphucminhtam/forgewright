# ForgeNexus

**Self-hosted code intelligence for AI agents** — no external services, no API key required for core features.

Index any codebase, understand architecture, trace execution flows, analyze blast radius before changes, and run safe refactors — all with a single CLI and MCP server.

> **Index data** is stored under **`.forgenexus/`** at the repo root (older installs may auto-migrate from `.gitnexus/` on first run).

**Migrating from `gitnexus`:** Use the **`forgenexus`** CLI only. The `gitnexus` bin, if present, **exits with an error** until you update scripts—temporary bridge: `FORGENEXUS_COMPAT_GITNEXUS_CLI=1`. Replace npm dependency `gitnexus` with `forgenexus`. Env vars `GITNEXUS_LLM_*` are mapped to `FORGENEXUS_LLM_*` with a deprecation warning.

## Features

| Category | Features |
|---|---|
| **Code Intelligence** | 17 edge types (CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, HAS_PROPERTY, ACCESSES, OVERRIDES, HANDLES_ROUTE, HANDLES_TOOL, QUERIES...) |
| **Parallel Parsing** | Worker thread pool (cpus-1), byte-budget chunking (20MB/chunk), graceful sequential fallback for small repos |
| **Import Resolution** | Suffix trie — O(1) longest-prefix path lookup vs O(n×m) LIKE queries |
| **Binding Propagation** | Cross-file UNKNOWN:* resolution via Kahn's topological sort, fast-path skip at <3% gap ratio |
| **Community Detection** | Leiden algorithm (local-move → refine → aggregate), 60s timeout, large-graph mode with degree-1 filtering |
| **Framework Detection** | Auto-detect: Next.js, FastAPI, NestJS, Express, Fastify, Django, Flask, Laravel, Rails, Gin, Fiber, Spring, Prisma, Supabase, Swift, Expo |
| **Process Tracing** | BFS entry-point → terminal call chains, framework-aware entry point detection |
| **Search** | Hybrid BM25 + semantic + RRF ranking, 5 embedding providers (local Transformers, Ollama, OpenAI, Gemini, HuggingFace) |
| **Incremental FTS** | Update only changed nodes, skip full rebuild on unchanged files |
| **Embedding Cache** | Cache-first: skip re-embedding unchanged symbols, incremental update |
| **Early Exit** | Skip all phases if git commit unchanged since last index |
| **Languages** | TypeScript, JavaScript, Python, Go, Rust, Java, C#, C/C++, Kotlin, PHP, Ruby, Swift, Dart |
| **MCP Tools** | 12 tools: query, context, impact, detect_changes, rename, route_map, tool_map, shape_check, api_impact, pr_review, list_repos, cypher |
| **MCP Resources** | 8 templates: context, clusters, processes, schema, cluster detail, process trace, stats, repos |
| **MCP Prompts** | 2 templates: detect_impact, generate_map |
| **Automation** | Auto-reindex via git hooks (post-commit, post-merge, post-checkout) |
| **Multi-repo** | UnifiedGraph for cross-repo dependency analysis |

## Quick Start (One-Line Setup)

```bash
# Install and index in one go — AI can vibe-code this
npx forgenexus setup && npx forgenexus analyze
```

Or in an existing project:

```bash
# 1. Setup MCP + git hooks (creates .cursor/mcp.json + .git/hooks)
npx forgenexus setup

# 2. Index the codebase (incremental by default)
npx forgenexus analyze

# 3. Done. ForgeNexus auto-reindexes after every git commit/merge.
```

## Auto-Setup for AI Agents (Vibe Coding)

ForgeNexus is designed for AI agents to self-install and configure:

```bash
# Full setup — install, configure MCP, index, done
npx forgenexus setup && npx forgenexus analyze

# Check if index is healthy
npx forgenexus status

# Add to any project via URL (for AI agents pulling configs)
# See MCP Configuration section below
```

### MCP Configuration

Add to `.cursor/mcp.json` (or let `forgenexus setup` do it):

```json
{
  "mcpServers": {
    "forgenexus": {
      "command": "node",
      "args": ["node_modules/forgenexus/dist/cli/index.js", "mcp"]
    }
  }
}
```

Then restart Cursor. The MCP server will auto-analyze the project on first launch.

## CLI Commands

```bash
npx forgenexus analyze [path]           # Index codebase (incremental by default)
npx forgenexus analyze --force          # Full re-index from scratch
npx forgenexus analyze --embeddings     # Add semantic embeddings (local Transformers)
npx forgenexus analyze --embeddings --embedding-provider ollama   # Ollama embeddings
npx forgenexus analyze --embeddings --embedding-provider gemini   # Gemini embeddings
npx forgenexus status [path]            # Check index health + stats
npx forgenexus clean [path]              # Remove index
npx forgenexus setup                    # Configure MCP + git hooks
npx forgenexus wiki [path]              # Generate architecture doc (needs LLM API key)
npx forgenexus mcp [path]               # Start MCP server (stdio)
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `query` | Search codebase by concept — finds execution flows using hybrid BM25+semantic search |
| `context` | 360° view of a symbol: callers, callees, importers, extenders, implementers, members |
| `impact` | Blast radius analysis — what breaks if you change X (depth 1/2/3) |
| `detect_changes` | Map uncommitted git changes to affected symbols and processes |
| `rename` | Safe multi-file coordinated rename using the knowledge graph |
| `route_map` | Map HTTP routes to handler functions (Express, FastAPI, NestJS, Next.js, Django) |
| `tool_map` | Map MCP/RPC tool definitions to their handler locations |
| `shape_check` | Detect API response shape mismatches vs consumer property access |
| `api_impact` | Combined route + shape + impact analysis for API changes |
| `pr_review` | PR blast-radius analysis: affected modules, breaking changes, recommended reviewers |
| `list_repos` | List all indexed repositories |
| `cypher` | Raw Cypher-style graph queries against the SQLite knowledge graph |

### MCP Resources

| URI Template | Description |
|---|---|
| `forgenexus://repo/{name}/context` | Repo overview: stats, staleness check |
| `forgenexus://repo/{name}/clusters` | All functional areas with cohesion scores |
| `forgenexus://repo/{name}/cluster/{name}` | Members of a specific community |
| `forgenexus://repo/{name}/processes` | All execution flows |
| `forgenexus://repo/{name}/process/{name}` | Step-by-step trace of a process |
| `forgenexus://repo/{name}/schema` | Graph schema for Cypher queries |
| `forgenexus://repo/{name}/stats` | Detailed repository statistics |
| `forgenexus://schema` | Global schema reference |

### MCP Prompts

| Prompt | Description |
|--------|-------------|
| `detect_impact` | Analyze impact of current changes before committing |
| `generate_map` | Generate architecture documentation from the knowledge graph |

## Usage Examples

### "What does this function do and who calls it?"

```
forgenexus context {name: "validatePayment"}
→ 360° view: callers, callees, importers, extends/implements, methods, properties
→ Shows which processes/communities this symbol belongs to
```

### "Is it safe to change this function?"

```
forgenexus impact {target: "validatePayment", direction: "upstream", maxDepth: 3}
→ d=1 (WILL BREAK): processCheckout, webhookHandler
→ d=2 (LIKELY AFFECTED): authRouter, sessionManager
→ Risk: MEDIUM
```

### "What will break if I merge this PR?"

```
forgenexus pr_review {base_ref: "origin/main"}
→ Files changed: 8 | Symbols: 12
→ Blast radius: 2 critical, 3 high, 5 medium
→ Breaking changes: PaymentInput type changed (createPayment not updated)
→ Recommended reviewers: @alice (auth), @bob (payments)
```

### "Find all API routes in this project"

```
forgenexus route_map
→ GET /api/users → getUsers (src/routes/users.ts:42)
→ POST /api/checkout → processCheckout (src/checkout.ts:15)
→ GET /api/products/:id → getProduct (src/api/products.ts:22)
```

### "What execution flows touch the auth module?"

```
READ forgenexus://repo/myapp/processes
→ LoginFlow: authenticate → validateToken → createSession
→ PasswordResetFlow: requestReset → sendEmail → confirmReset
→ APIPipeline: authMiddleware → rateLimit → routeHandler
```

### "Search for 'payment' related code"

```
forgenexus query {query: "payment validation error handling"}
→ [HIGH] validatePayment (src/payments/validator.ts:15) — 3 callers
→ [MED] processCheckout (src/checkout.ts:42) — CheckoutFlow step 2/7
→ [MED] refundHandler (src/orders/refund.ts:8)
```

## Embedding Providers

| Provider | API Key Needed | Speed | Quality |
|---|---|---|---|
| **transformers** (default) | ❌ No | Medium | Good |
| **ollama** | ❌ No | Fast (local GPU) | Good |
| **openai** | ✅ Yes | Fast | Excellent |
| **gemini** | ✅ Yes | Fast | Excellent |
| **huggingface** | ✅ Yes | Medium | Good |

Local providers are recommended — no API key, fully offline, privacy-preserving:

```bash
# Local ML inference (no API key)
npx forgenexus analyze --embeddings

# Ollama (local GPU, fastest)
npx forgenexus analyze --embeddings --embedding-provider ollama
```

## Architecture

```
npx forgenexus analyze
│
├── 1. Scanner      glob file discovery + language detection
│
├── 2. Parse        tree-sitter AST → nodes + 17 edge types
│   ┌──────────────────────────────────────────────┐
│   │  Worker Pool (cpus-1 threads, 20MB/chunk)    │
│   │  • Each worker owns its own tree-sitter     │
│   │    parser instance (heavy to init, no share)│
│   │  • Byte-budget chunking: files grouped by    │
│   │    20MB total content                        │
│   │  • Graceful fallback to sequential if        │
│   │    repo < 15 files or < 512KB               │
│   └──────────────────────────────────────────────┘
│
├── 3. Resolve      Suffix Trie — O(1) import path resolution
│                   (replaces LIKE '%path%' O(n×m))
│
├── 4. Propagate    Cross-file binding propagation
│                   Kahn's topological sort → resolve UNKNOWN:* edges
│                   Skip if <3% files have gaps (fast path)
│
├── 5. Community    Leiden Algorithm (3-phase, timeout-protected)
│                   • Local moving → Refinement → Aggregation
│                   • Guarantees well-connected communities
│                   • Resolution 1.0, max 10 iters, 60s timeout
│                   • Large-graph mode: resolution 2.0, degree-1 filter
│
├── 6. Process      BFS trace from entry points → call chains
│                   Framework detection: Next.js, FastAPI, NestJS,
│                   Express, Django, Laravel, Rails, Gin, Fiber, etc.
│
├── 7. FTS          Incremental FTS5 — update only changed nodes
│                   (replaces full DROP + CREATE every run)
│
├── 8. Embeddings   Cache-first: skip nodes that already have embeddings
│                   Providers: transformers.js (local), Ollama, OpenAI,
│                   Gemini, HuggingFace
│
└── 9. Meta         Commit tracking + stats + early-exit cache
                    Early exit if git commit unchanged since last index
```

**Performance vs original pipeline:**
- Parallel parsing: 3-5x faster on multi-core
- Suffix trie: O(1) import resolution vs O(n×m) LIKE queries
- Leiden: well-connected communities vs greedy Louvain
- Incremental FTS: O(changed) vs O(all nodes) rebuild
- Embedding cache: skip unchanged symbols on re-analysis
- Early exit: skip all 9 phases if git commit unchanged

## Data Model

**Nodes**: File, Folder, Function, Class, Interface, Module, Method, Property, Variable, Struct, Enum, Trait, Impl, TypeAlias

**Edges** (17 types):
- `CALLS` — function/method invocations
- `IMPORTS` — module/require imports
- `EXTENDS` — class inheritance
- `IMPLEMENTS` — interface implementation
- `HAS_METHOD` / `HAS_PROPERTY` — class members
- `ACCESSES` — property read/write
- `OVERRIDES` — method overrides
- `MEMBER_OF` — method → class relationship
- `STEP_IN_PROCESS` — call chain membership
- `HANDLES_ROUTE` — HTTP route handlers
- `HANDLES_TOOL` — MCP/RPC tool handlers
- `QUERIES` — database query patterns
- `FETCHES` — external API calls
- `CONTAINS` / `DEFINES` — file/symbol definitions

## Environment Variables

```bash
# Embedding provider (default: transformers — local, no API key)
EMBEDDING_PROVIDER=transformers   # local ML, no API key
EMBEDDING_PROVIDER=ollama        # local Ollama
EMBEDDING_PROVIDER=openai        # needs OPENAI_API_KEY
EMBEDDING_PROVIDER=gemini        # needs GEMINI_API_KEY
EMBEDDING_PROVIDER=huggingface  # needs HUGGINGFACE_TOKEN

# Ollama config
OLLAMA_HOST=http://localhost:11434

# LLM API keys (for wiki command)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
HUGGINGFACE_TOKEN=...

# ForgeNexus root (auto-detected)
FORGEWRIGHT_ROOT=/path/to/forgewright
```

## Auto-Reindex (Git Hooks)

After running `npx forgenexus setup`, ForgeNexus installs git hooks:

- **post-commit**: Incremental reindex after every commit (background, non-blocking)
- **post-merge**: Reindex after pull/merge
- **post-checkout**: Detect stale index after branch switch

Disable auto-reindex per-project with `.forgeignore`:

```bash
# .forgeignore
auto-reindex
```

## Troubleshooting

**"Index is stale"**: Run `npx forgenexus analyze --force` in the terminal

**Slow embedding generation**: Use `--embedding-provider ollama` for GPU-accelerated local inference, or skip embeddings entirely with `npx forgenexus analyze` (no `--embeddings` flag)

**Embeddings fail**: The system falls back to BM25 keyword search automatically

**No API key available**: Skip wiki generation or use local embedding providers

**MCP not connecting**: Restart Cursor after running `npx forgenexus setup`, or manually add to `.cursor/mcp.json`

## Uninstall

```bash
# Remove index + git hooks
npx forgenexus clean

# Remove MCP config (manually edit .cursor/mcp.json)
```

## License

MIT
