/**
 * KuzuDB Database Schema for ForgeNexus v2.2
 *
 * Architecture:
 *   - Node tables: one per CodeNode type for type-safe queries
 *   - Rel tables: one per EdgeType for fast traversal
 *   - FTS: Kuzu FTS extension on CodeNode names/signatures
 *   - Vector: Kuzu vector extension for semantic search
 *   - Registry graph: separate subgraph for cross-repo coordination
 *
 * Schema evolution from SQLite:
 *   - nodes → per-type CodeNode tables + FTS index
 *   - edges → per-type rel tables (CALLS, IMPORTS, etc.)
 *   - communities → Community node table
 *   - processes → Process node table
 *   - registry → Registry node + RepoEdge rel tables
 *   - groups → Group node + GroupEdge rel tables
 */

export const KUZU_SCHEMA = `
LOAD EXTENSION fts;
LOAD EXTENSION vector;
LOAD EXTENSION json;

-- ── Node Tables ────────────────────────────────────────────────────────────

CREATE NODE TABLE CodeNode(
  uid        STRING PRIMARY KEY,
  type       STRING NOT NULL,
  name       STRING NOT NULL,
  filePath   STRING NOT NULL,
  line       INT64  NOT NULL,
  endLine    INT64  NOT NULL,
  columnNum  INT64,
  returnType STRING,
  paramCount INT64,
  declaredType STRING,
  language   STRING,
  signature  STRING,
  community  STRING,
  process    STRING,
  -- Vector embedding stored as list of floats (serialized JSON for compatibility)
  embedding  DOUBLE[384]
) COPYS(0);

CREATE NODE TABLE Community(
  id          STRING PRIMARY KEY,
  name        STRING NOT NULL,
  keywords    STRING,       -- JSON array
  description STRING,
  cohesion    DOUBLE DEFAULT 0
) COPYS(0);

CREATE NODE TABLE Process(
  id              STRING PRIMARY KEY,
  name            STRING NOT NULL,
  type            STRING NOT NULL,  -- 'http' | 'cli' | 'event' | 'pipeline' | 'unknown'
  entryPointUid   STRING NOT NULL,
  terminalUids    STRING,          -- JSON array
  communities     STRING           -- JSON array
) COPYS(0);

-- ── Relationship Tables ─────────────────────────────────────────────────────

CREATE REL TABLE CONTAINS(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE DEFINES(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE CALLS(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE IMPORTS(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE EXTENDS(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE IMPLEMENTS(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE HAS_METHOD(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE HAS_PROPERTY(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE ACCESSES(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE OVERRIDES(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE MEMBER_OF(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE STEP_IN_PROCESS(FROM CodeNode TO Process, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE HANDLES_ROUTE(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE FETCHES(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE HANDLES_TOOL(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE ENTRY_POINT_OF(FROM CodeNode TO Process, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE QUERIES(FROM CodeNode TO CodeNode, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE IN_COMMUNITY(FROM CodeNode TO Community, ANTISYMMETRIC, MANY-TO-ONE);

-- ── FTS Index ──────────────────────────────────────────────────────────────

CREATE FTS INDEX ON CodeNode(name, signature, filePath);

-- ── Registry Tables (cross-repo) ───────────────────────────────────────────

CREATE NODE TABLE RepoRegistry(
  name        STRING PRIMARY KEY,
  path        STRING NOT NULL,
  dbPath      STRING NOT NULL,
  indexedAt   STRING NOT NULL,
  lastCommit  STRING,
  stats       STRING,           -- JSON: {files, nodes, edges, communities, processes}
  language    STRING DEFAULT 'unknown'
) COPYS(0);

CREATE REL TABLE REPO_CALLS(FROM RepoRegistry TO RepoRegistry, SYMMETRIC, ONE-TO-ONE);
CREATE REL TABLE REPO_IMPORTS(FROM RepoRegistry TO RepoRegistry, SYMMETRIC, ONE-TO-ONE);

-- ── Group Tables ────────────────────────────────────────────────────────────

CREATE NODE TABLE RepoGroup(
  name        STRING PRIMARY KEY,
  description STRING,
  createdAt   STRING NOT NULL,
  updatedAt   STRING NOT NULL
) COPYS(0);

CREATE NODE TABLE Contract(
  id          STRING PRIMARY KEY,
  name        STRING NOT NULL,   -- e.g. "UserService.authenticate"
  type        STRING NOT NULL,   -- 'function' | 'interface' | 'class' | 'api'
  signature   STRING,            -- e.g. "authenticate(userId: string): Promise<User>"
  repo        STRING NOT NULL,   -- which repo defines this contract
  updatedAt   STRING NOT NULL
) COPYS(0);

CREATE REL TABLE HAS_REPO(FROM RepoGroup TO RepoRegistry, MANY-TO-MANY);
CREATE REL TABLE DEFINES_CONTRACT(FROM RepoRegistry TO Contract, ANTISYMMETRIC, MANY-TO-ONE);
CREATE REL TABLE USES_CONTRACT(FROM RepoRegistry TO Contract, ANTISYMMETRIC, MANY-TO-ONE);
`.trim()

/**
 * Async schema initialization.
 * Drops existing tables and recreates (for fresh indexes or migrations).
 */
export async function initKuzuSchema(conn: {
  query: (sql: string) => Promise<{ getAll: () => any[] }>
}): Promise<void> {
  const statements = KUZU_SCHEMA.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('LOAD EXTENSION'))

  for (const stmt of statements) {
    try {
      await conn.query(stmt + ';')
    } catch (e: any) {
      // Table already exists — skip
      if (!e.message?.includes('already exists') && !e.message?.includes('Duplicate')) {
        // Log non-critical errors during init
      }
    }
  }
}
