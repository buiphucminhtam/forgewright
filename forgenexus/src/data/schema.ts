/**
 * KuzuDB Database Schema for ForgeNexus v2.2
 *
 * Edge storage strategy (KuzuDB v0.11.x limitation: REL TABLE has no dynamic properties):
 *   - Store edges as CodeNode entries with type = e.type and name = e.id
 *   - rel_type column marks this CodeNode row is an edge record
 *   - rel_from / rel_to store the from/to UIDs
 *   - rel_confidence / rel_reason / rel_step store edge metadata
 *
 * Valid KuzuDB v0.11.x syntax:
 *   CREATE NODE TABLE Foo (col TYPE PRIMARY KEY, col TYPE)
 *
 * Invalid (NOT supported by KuzuDB v0.11.x):
 *   - NOT NULL suffix, COPYS(), ANTISYMMETRIC, MANY-TO-ONE, SYMMETRIC, MANY-TO-MANY
 *   - INSERT INTO, MERGE (duplicate PK), REL TABLE with properties
 *   - LOAD EXTENSION, SQL comments (-- ...)
 */

export const KUZU_SCHEMA = `
CREATE NODE TABLE CodeNode(
  uid        STRING PRIMARY KEY,
  type       STRING,
  name       STRING,
  filePath   STRING,
  line       INT64,
  endLine    INT64,
  columnNum  INT64,
  returnType STRING,
  paramCount INT64,
  declaredType STRING,
  language   STRING,
  signature  STRING,
  community  STRING,
  process    STRING,
  rel_type   STRING,
  rel_from   STRING,
  rel_to     STRING,
  rel_confidence DOUBLE,
  rel_reason STRING,
  rel_step   STRING
);

CREATE NODE TABLE Community(
  id          STRING PRIMARY KEY,
  name        STRING,
  keywords    STRING,
  description STRING,
  cohesion    DOUBLE DEFAULT 0
);

CREATE NODE TABLE Process(
  id              STRING PRIMARY KEY,
  name            STRING,
  type            STRING,
  entryPointUid   STRING,
  terminalUids    STRING,
  communities     STRING
);

CREATE NODE TABLE RepoRegistry(
  name        STRING PRIMARY KEY,
  path        STRING,
  dbPath      STRING,
  indexedAt   STRING,
  lastCommit  STRING,
  stats       STRING,
  language    STRING
);

CREATE NODE TABLE RepoGroup(
  name        STRING PRIMARY KEY,
  description STRING,
  createdAt   STRING,
  updatedAt   STRING
);

CREATE NODE TABLE Contract(
  id          STRING PRIMARY KEY,
  name        STRING,
  type        STRING,
  signature   STRING,
  repo        STRING,
  updatedAt   STRING
);

CREATE REL TABLE HAS_REPO(FROM RepoGroup TO RepoRegistry);

CREATE REL TABLE REPO_IMPORTS(FROM RepoRegistry TO RepoRegistry, fromContract STRING, toContract STRING);

CREATE REL TABLE DEFINES_CONTRACT(FROM RepoRegistry TO Contract);
`.trim()

export async function initKuzuSchema(conn: {
  query: (sql: string) => Promise<{ getAll: () => any[] }>
}): Promise<void> {
  const statements = KUZU_SCHEMA.split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const stmt of statements) {
    try {
      await conn.query(stmt)
    } catch (e: any) {
      if (!e.message?.includes('already exists') && !e.message?.includes('Duplicate')) {
        console.warn(`[ForgeNexus] Schema init warning: ${e.message?.substring(0, 120)}`)
      }
    }
  }
}
