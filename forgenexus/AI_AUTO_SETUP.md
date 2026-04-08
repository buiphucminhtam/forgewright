# ForgeNexus AI Agent Auto-Setup Prompt

Use this prompt so an AI agent can **install, build, update, and migrate** ForgeNexus in any project — even when the package is **not** on the public npm registry.

---

## Maintainer note (humans)

Until `forgenexus` is published to npm, **do not** tell users to rely on `npm install forgenexus` alone. The instructions below use **GitHub + local build** as the default fallback.

---

## Prompt for AI Agent

````
You are working with ForgeNexus, a self-hosted code intelligence tool. Follow these steps in order.

### 0) Important facts (read first)

- **Public npm:** The package name `forgenexus` may return **404 Not Found** on registry.npmjs.org. That is expected until it is published. **Do not** assume `npm install forgenexus` works.
- **Source of truth:** ForgeNexus lives in the **Forgewright** monorepo under the folder `forgenexus/` (e.g. GitHub: `buiphucminhtam/forgewright`).
- **Wrong path:** Do **not** try to build ForgeNexus from `.antigravity/plugins/production-grade` or other plugin folders — that is **not** ForgeNexus and will fail (e.g. unrelated `husky` / dependency issues).
- **Built output:** The repo does **not** ship `dist/` in git. After installing from Git, you **must** run `npm run build` inside the installed `forgenexus` package so `dist/cli/index.js` exists.
- **Where to put this doc:** Do not copy this file under `.next/` (Next.js build output is ephemeral). Keep a copy under `docs/` or link to the upstream raw URL.

### Step 1: Detect current state

- `node_modules/forgenexus` exists?
- `package.json` has a `forgenexus` dependency (semver, `file:`, or `git+https:`)?
- `node_modules/forgenexus/dist/cli/index.js` exists? (if missing → needs **build**)
- `.forgenexus/` or `.gitnexus/` present?
- Read version: `node -p "require('./node_modules/forgenexus/package.json').version"` (or parse JSON if ESM-only in that tree)

### Step 2: Choose install method

| npm install forgenexus result | Action |
|-------------------------------|--------|
| Success | Skip to Step 4 (migrate check). Run Step 3b if `dist/` missing. |
| **E404 / Not Found** | Use **Step 3a** (install from GitHub) then **Step 3b** (build). |

### Step 3a: Install from GitHub (when npm registry fails)

Use the **subdirectory** install form so npm only installs the `forgenexus` package from the monorepo.

Replace `YOUR_ORG/YOUR_REPO` if the user’s fork differs; default upstream:

```bash
npm install "git+https://github.com/buiphucminhtam/forgewright.git#main:forgenexus" --save-dev
```

**Alternatives:**

- **pnpm:** `pnpm add -D "git+https://github.com/buiphucminhtam/forgewright.git#main:forgenexus"`
- **yarn (berry):** `yarn add -D "git+https://github.com/buiphucminhtam/forgewright.git#main:forgenexus"`
- **Local clone:** clone the repo, then from the **target project**:  
  `npm install /absolute/path/to/forgewright/forgenexus --save-dev`

### Step 3b: Build after Git / file install (required)

```bash
cd node_modules/forgenexus
npm install --include=dev
npm run build
cd ../..
```

Verify:

```bash
test -f node_modules/forgenexus/dist/cli/index.js && echo "CLI OK"
```

### Step 3c: Optional — registry install (when published)

Only when `npm view forgenexus version` works:

```bash
npm install forgenexus --save-dev
# Still verify dist exists; if the published tarball omits dist, run Step 3b.
```

### Step 4: CLI invocation (reliable form)

Prefer **explicit `node`** so you never depend on `npx` resolving a missing global:

```bash
node node_modules/forgenexus/dist/cli/index.js --help
```

You may use `npx forgenexus` **only after** the package is installed and built.

### Step 5: Migrate index (SQLite → KuzuDB) if upgrading from old index

If the project has an old SQLite-era index or docs mention migration:

```bash
node node_modules/forgenexus/scripts/migrate-sqlite-to-kuzu.js --dry-run
node node_modules/forgenexus/scripts/migrate-sqlite-to-kuzu.js
```

If `.gitnexus/` exists (legacy **gitnexus**), ForgeNexus may auto-migrate on first run; still run `analyze --force` after migration if anything looks stale.

### Step 6: Setup MCP + git hooks

```bash
node node_modules/forgenexus/dist/cli/index.js setup
```

### Step 7: Index the codebase

```bash
node node_modules/forgenexus/dist/cli/index.js analyze
# Full re-index if needed:
node node_modules/forgenexus/dist/cli/index.js analyze --force
# Optional embeddings:
node node_modules/forgenexus/dist/cli/index.js analyze --embeddings
```

### Step 8: Verify

```bash
node node_modules/forgenexus/dist/cli/index.js status
```

### Step 9: MCP config (Cursor)

Ensure `.cursor/mcp.json` points at the **built** CLI:

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

Restart the IDE after changing MCP config.

---

## Known Bugs & Fixes (for AI)

> These bugs exist in `forgenexus@2.2.0` and earlier. If you see these symptoms, apply the fixes below. After fixing, rebuild: `cd node_modules/forgenexus && npm run build`.

### Bug 1: `status` shows "database is locked" or "file is not a database"

**Root cause:** `status` CLI tried to use SQLite (`better-sqlite3` or `sqlite3` CLI) on a KuzuDB file. KuzuDB files are locked by the MCP server, so `status` always fails while MCP is running. When it falls back to `sqlite3` CLI, it reports "file is not a database" because the file is KuzuDB.

**Symptom:**
```
Error: database is locked
# or
Error: file is not a database
```

**Fix (source-level, requires rebuild):** Rewrite `src/cli/status.ts` to use `ForgeDB` (the KuzuDB wrapper) instead of SQLite. The `ForgeDB` class is available at `../data/db.js`. See the current `status.ts` in this repo for the correct implementation.

**Workaround (no rebuild):** Stop the MCP server first:
```bash
# Kill any running MCP server, then run status
pkill -f "forgenexus.*mcp" || true
node node_modules/forgenexus/dist/cli/index.js status
```

### Bug 2: Stats show `0 nodes, N edges` (wrong counts)

**Root cause (fixed in db.ts):** `getDetailedStats().byType` grouped ALL `CodeNode` rows — including edge records stored in the same table — because the query lacked `WHERE n.rel_type IS NULL`. Edge records (`type = "CALLS"`, `"IMPORTS"`, etc.) polluted the node type counts. In some cases, the write queue wasn't flushed before counting, causing nodes to show 0.

**Symptom:**
```
Done: 0 files, 0 nodes, 3590 edges   ← WRONG (should show ~1088 nodes, ~1795 edges)
```

**Fix (source-level, already applied in db.ts):**
```ts
// WRONG (old code):
this.query(`MATCH (n:CodeNode) RETURN n.type AS type, count(n) AS cnt`)

// CORRECT (fixed):
this.query(`MATCH (n:CodeNode) WHERE n.rel_type IS NULL RETURN n.type AS type, count(n) AS cnt`)
```

Also ensure `getStats()` flushes pending writes before counting (already fixed by calling `flushWrites()` inside `ForgeDB.query()`).

### Bug 3: Community and Process counts always 0

**Root cause (fixed in db.ts):** `getStats()` counted `(c:Community)` and `(p:Process)` correctly, but the `byType` breakdown in `getDetailedStats()` used `MATCH (n:CodeNode) RETURN n.type` without filtering, mixing edge `type` values with real node types.

**Symptom:**
```
Communities: 0    ← should be non-zero if analyze ran
Processes:   0    ← should be non-zero if analyze ran
```

**Fix (source-level, already applied in db.ts):** The `getDetailedStats()` now correctly filters nodes vs edges using `WHERE n.rel_type IS NULL`.

### Bug 4: Community update creates duplicate nodes (affects incremental index)

**Root cause (fixed in indexer.ts):** When updating node community fields, `insertNode()` tried to INSERT a new row with the same `uid` as the existing node. Since `CREATE` fails silently on duplicate PK in KuzuDB, this left the old node unchanged. The workaround was to use a raw `SET n.community = ...` query instead.

**Symptom:** After incremental index, some nodes appear twice with the same uid (only visible in raw Cypher queries).

**Fix (source-level, already applied in indexer.ts):** Changed from `insertNode()` to `conn.querySync(`MATCH ... SET n.community = ...`)`.

---

## Troubleshooting (for AI)

| Symptom | Fix |
|---------|-----|
| `404 Not Found` on `npm install forgenexus` | Use Step 3a (GitHub subdirectory) + Step 3b (build). |
| `Cannot find module .../dist/cli/index.js` | Run Step 3b in `node_modules/forgenexus`. |
| `database is locked` / `file is not a database` | Stop MCP server, or rebuild status.ts (Bug 1 fix). |
| Stats show 0 nodes, N edges | Rebuild db.ts + indexer.ts with fixes (Bug 2 fix). |
| Communities/Processes always 0 in stats | Rebuild db.ts (Bug 3 fix). |
| Duplicate nodes after incremental index | Rebuild indexer.ts (Bug 4 fix). |
| Confused `husky` errors from Antigravity path | Stop using plugin paths; install only `forgenexus` from GitHub or `file:`. |
| `npx forgenexus` fails | Use `node node_modules/forgenexus/dist/cli/index.js ...` after build. |
| Index stale | `analyze --force` |
| MCP not connecting | Restart IDE; check `args` path to `dist/cli/index.js`. |

### Version / breaking changes (context)

| Era | Note |
|-----|------|
| Kuzu / v7.8.0+ (monorepo) | SQLite → Kuzu migration script may apply; see Step 5. |
| `gitnexus` → `forgenexus` | Use `forgenexus` CLI; legacy bin may error until scripts updated. |

### Data locations

- Index: `.forgenexus/` at repo root (legacy: `.gitnexus/`).

### Environment variables (optional)

```bash
EMBEDDING_PROVIDER=transformers|ollama|openai|gemini|huggingface
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

````

---

## Quick reference (copy-paste)

### When `npm install forgenexus` returns 404

```bash
npm install "git+https://github.com/buiphucminhtam/forgewright.git#main:forgenexus" --save-dev
cd node_modules/forgenexus && npm install --include=dev && npm run build && cd ../..
node node_modules/forgenexus/dist/cli/index.js setup
node node_modules/forgenexus/dist/cli/index.js analyze
node node_modules/forgenexus/dist/cli/index.js status
```

### Update dependency after Git install

```bash
npm update forgenexus
# or reinstall with same git URL, then rebuild:
cd node_modules/forgenexus && npm install --include=dev && npm run build && cd ../..
```

### Migration (SQLite → Kuzu)

```bash
node node_modules/forgenexus/scripts/migrate-sqlite-to-kuzu.js --dry-run
node node_modules/forgenexus/scripts/migrate-sqlite-to-kuzu.js
node node_modules/forgenexus/dist/cli/index.js analyze --force
```

### Raw URL for agents (replace branch if needed)

`https://raw.githubusercontent.com/buiphucminhtam/forgewright/main/forgenexus/AI_AUTO_SETUP.md`
