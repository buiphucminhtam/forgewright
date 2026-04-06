/**
 * Database connection and core query operations.
 */

import Database from 'better-sqlite3'
import { SCHEMA_SQL } from './schema.js'
import type {
  CodeNode,
  CodeEdge,
  Community,
  Process,
  RepoStats,
  EdgeType,
  NodeType,
} from '../types.js'

function rowToNode(row: any): CodeNode {
  return {
    uid: row.uid,
    type: row.type as NodeType,
    name: row.name,
    filePath: row.file_path,
    line: row.line,
    endLine: row.end_line,
    column: row.column_num ?? undefined,
    returnType: row.return_type ?? undefined,
    parameterCount: row.parameter_count ?? undefined,
    declaredType: row.declared_type ?? undefined,
    language: row.language ?? undefined,
    signature: row.signature ?? undefined,
    community: row.community ?? undefined,
    process: row.process_name ?? undefined,
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
  }
}

function rowToEdge(row: any): CodeEdge {
  return {
    id: row.id,
    fromUid: row.from_uid,
    toUid: row.to_uid,
    type: row.type as EdgeType,
    confidence: row.confidence,
    reason: row.reason ?? undefined,
    step: row.step ?? undefined,
  }
}

/**
 * Abbreviate uid to "type:name:line" (no path).
 */
function uidAbbr(uid: string): string {
  const parts = uid.split(':')
  return parts.slice(-3).join(':')
}

export class ForgeDB {
  public db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(SCHEMA_SQL)
    // Migration: add embedding column to existing databases
    try {
      this.db.exec('ALTER TABLE nodes ADD COLUMN embedding TEXT')
    } catch {
      /* column already exists */
    }
  }

  // ─── Nodes ───────────────────────────────────────────────────────────────

  insertNode(node: CodeNode, embedding?: number[]): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO nodes
        (uid, type, name, file_path, line, end_line, column_num,
         return_type, parameter_count, declared_type, language, signature, community, process_name, embedding)
      VALUES
        (@uid, @type, @name, @filePath, @line, @endLine, @column,
         @returnType, @parameterCount, @declaredType, @language, @signature, @community, @process, @embedding)
    `,
      )
      .run({
        uid: node.uid,
        type: node.type,
        name: node.name,
        filePath: node.filePath,
        line: node.line,
        endLine: node.endLine,
        column: node.column ?? null,
        returnType: node.returnType ?? null,
        parameterCount: node.parameterCount ?? null,
        declaredType: node.declaredType ?? null,
        language: node.language ?? null,
        signature: node.signature ?? null,
        community: node.community ?? null,
        process: node.process ?? null,
        embedding: embedding ? JSON.stringify(embedding) : null,
      })
  }

  insertNodesBatch(nodes: CodeNode[], embeddings?: Map<string, number[]>): void {
    const insert = this.db.transaction((batch: CodeNode[]) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO nodes
          (uid, type, name, file_path, line, end_line, column_num,
           return_type, parameter_count, declared_type, language, signature, community, process_name, embedding)
        VALUES
          (@uid, @type, @name, @filePath, @line, @endLine, @column,
           @returnType, @parameterCount, @declaredType, @language, @signature, @community, @process, @embedding)
      `)
      for (const node of batch) {
        stmt.run({
          uid: node.uid,
          type: node.type,
          name: node.name,
          filePath: node.filePath,
          line: node.line,
          endLine: node.endLine,
          column: node.column ?? null,
          returnType: node.returnType ?? null,
          parameterCount: node.parameterCount ?? null,
          declaredType: node.declaredType ?? null,
          language: node.language ?? null,
          signature: node.signature ?? null,
          community: node.community ?? null,
          process: node.process ?? null,
          embedding: embeddings?.get(node.uid) ? JSON.stringify(embeddings.get(node.uid)) : null,
        })
      }
    })
    insert(nodes)
  }

  getNode(uid: string): CodeNode | null {
    const row = this.db.prepare('SELECT * FROM nodes WHERE uid = ?').get(uid) as any
    return row ? rowToNode(row) : null
  }

  getNodesByName(name: string): CodeNode[] {
    const rows = this.db
      .prepare('SELECT * FROM nodes WHERE name = ? ORDER BY file_path')
      .all(name) as any[]
    return rows.map(rowToNode)
  }

  /** Search nodes by name pattern (SQL LIKE). Use op="contains" for %name%, "starts" for name%, "ends" for %name. */
  searchNodes(
    search: string,
    op: 'contains' | 'starts' | 'ends' = 'contains',
    type?: NodeType,
    limit = 200,
  ): CodeNode[] {
    const like = op === 'contains' ? `%${search}%` : op === 'starts' ? `${search}%` : `%${search}`
    const params: any[] = [like]
    let sql = `SELECT * FROM nodes WHERE name LIKE ?`
    if (type) {
      sql += ` AND type = ?`
      params.push(type)
    }
    sql += ` LIMIT ${Number(limit)}`
    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(rowToNode)
  }

  getNodesByType(type: NodeType, limit?: number): CodeNode[] {
    const sql = limit
      ? `SELECT * FROM nodes WHERE type = ? LIMIT ${Number(limit)}`
      : 'SELECT * FROM nodes WHERE type = ?'
    const rows = this.db.prepare(sql).all(type) as any[]
    return rows.map(rowToNode)
  }

  getNodesByFile(filePath: string): CodeNode[] {
    const rows = this.db.prepare('SELECT * FROM nodes WHERE file_path = ?').all(filePath) as any[]
    return rows.map(rowToNode)
  }

  getNodesByCommunity(communityId: string): CodeNode[] {
    const rows = this.db
      .prepare('SELECT * FROM nodes WHERE community = ? ORDER BY line')
      .all(communityId) as any[]
    return rows.map(rowToNode)
  }

  getNodesByProcess(processId: string): CodeNode[] {
    const rows = this.db
      .prepare('SELECT * FROM nodes WHERE process_name = ? ORDER BY line')
      .all(processId) as any[]
    return rows.map(rowToNode)
  }

  getAllNodes(): CodeNode[] {
    const rows = this.db.prepare('SELECT * FROM nodes').all() as any[]
    return rows.map(rowToNode)
  }

  getAllFilePaths(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT file_path FROM nodes').all() as any[]
    return rows.map((r: any) => r.file_path)
  }

  // ─── Edges ────────────────────────────────────────────────────────────────

  insertEdge(edge: CodeEdge): void {
    this.db
      .prepare(
        `
      INSERT OR IGNORE INTO edges (id, from_uid, to_uid, type, confidence, reason, step)
      VALUES (@id, @fromUid, @toUid, @type, @confidence, @reason, @step)
    `,
      )
      .run({
        id: edge.id,
        fromUid: edge.fromUid,
        toUid: edge.toUid,
        type: edge.type,
        confidence: edge.confidence,
        reason: edge.reason ?? null,
        step: edge.step ?? null,
      })
  }

  insertEdgesBatch(edges: CodeEdge[]): void {
    const insert = this.db.transaction((batch: CodeEdge[]) => {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO edges (id, from_uid, to_uid, type, confidence, reason, step)
        VALUES (@id, @fromUid, @toUid, @type, @confidence, @reason, @step)
      `)
      for (const edge of batch) {
        stmt.run({
          id: edge.id,
          fromUid: edge.fromUid,
          toUid: edge.toUid,
          type: edge.type,
          confidence: edge.confidence,
          reason: edge.reason ?? null,
          step: edge.step ?? null,
        })
      }
    })
    insert(edges)
  }

  getIncomingEdges(uid: string, type?: EdgeType): CodeEdge[] {
    const sql = type
      ? 'SELECT * FROM edges WHERE to_uid = ? AND type = ?'
      : 'SELECT * FROM edges WHERE to_uid = ?'
    const rows = type ? this.db.prepare(sql).all(uid, type) : this.db.prepare(sql).all(uid)
    return (rows as any[]).map(rowToEdge)
  }

  getOutgoingEdges(uid: string, type?: EdgeType): CodeEdge[] {
    const sql = type
      ? 'SELECT * FROM edges WHERE from_uid = ? AND type = ?'
      : 'SELECT * FROM edges WHERE from_uid = ?'
    const rows = type ? this.db.prepare(sql).all(uid, type) : this.db.prepare(sql).all(uid)
    return (rows as any[]).map(rowToEdge)
  }

  getAllEdges(type?: EdgeType): CodeEdge[] {
    const sql = type ? 'SELECT * FROM edges WHERE type = ?' : 'SELECT * FROM edges'
    const rows = type ? this.db.prepare(sql).all(type) : this.db.prepare(sql).all()
    return (rows as any[]).map(rowToEdge)
  }

  getEdgeCount(type?: EdgeType): number {
    const sql = type
      ? 'SELECT COUNT(*) as c FROM edges WHERE type = ?'
      : 'SELECT COUNT(*) as c FROM edges'
    const row = type ? this.db.prepare(sql).get(type) : this.db.prepare(sql).get()
    return (row as any)?.c ?? 0
  }

  // ─── Convenience ─────────────────────────────────────────────────────

  /**
   * Find nodes that call the given node via CALLS edges.
   * Edge from_uid and to_uid = full node uid.
   */
  getCallers(uid: string): CodeNode[] {
    const rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.from_uid
      WHERE e.to_uid = ? AND e.type = 'CALLS'
    `,
      )
      .all(uid) as any[]
    return rows.map(rowToNode)
  }

  /**
   * Find nodes called by the given node via CALLS edges.
   * Edge from_uid and to_uid = full node uid.
   */
  getCallees(uid: string): CodeNode[] {
    const rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.to_uid
      WHERE e.from_uid = ? AND e.type = 'CALLS'
    `,
      )
      .all(uid) as any[]
    return rows.map(rowToNode)
  }

  getImporters(uid: string): CodeNode[] {
    // IMPORTS: edge to_uid = "IMPORT:source:symbol", node is a Variable/Module
    const name = uidAbbr(uid).split(':')[1]
    const rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.from_uid
      WHERE e.to_uid LIKE ? AND e.type = 'IMPORTS'
    `,
      )
      .all('%IMPORT%:%' + name) as any[]
    return rows.map(rowToNode)
  }

  getExtendees(uid: string): CodeNode[] {
    // to_uid in EXTENDS edges uses line=0; normalize and use prefix LIKE
    const normalized = uid.replace(/:[0-9]+$/, ':0')
    let rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.from_uid
      WHERE e.to_uid = ? AND e.type = 'EXTENDS'
    `,
      )
      .all(normalized) as any[]
    if (rows.length > 0) return rows.map(rowToNode)
    // Fall back: to_uid prefix stripped to line=0, match node by path+type+name
    const prefix = normalized.replace(/:[^:]+$/, '')
    rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.from_uid
      WHERE e.to_uid LIKE ? AND e.type = 'EXTENDS'
    `,
      )
      .all(prefix + ':%') as any[]
    return rows.map(rowToNode)
  }

  getImplementers(uid: string): CodeNode[] {
    const normalized = uid.replace(/:[0-9]+$/, ':0')
    let rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.from_uid
      WHERE e.to_uid = ? AND e.type = 'IMPLEMENTS'
    `,
      )
      .all(normalized) as any[]
    if (rows.length > 0) return rows.map(rowToNode)
    const prefix = normalized.replace(/:[^:]+$/, '')
    rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.from_uid
      WHERE e.to_uid LIKE ? AND e.type = 'IMPLEMENTS'
    `,
      )
      .all(prefix + ':%') as any[]
    return rows.map(rowToNode)
  }

  getMethods(ownerUid: string): CodeNode[] {
    // from_uid uses line=0; normalize and try exact match, then LIKE fallback
    const normalized = ownerUid.replace(/:[0-9]+$/, ':0')
    let rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.to_uid
      WHERE e.from_uid = ? AND e.type = 'HAS_METHOD'
    `,
      )
      .all(normalized) as any[]
    if (rows.length > 0) return rows.map(rowToNode)
    const prefix = normalized.replace(/:[^:]+$/, '')
    rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.to_uid
      WHERE e.from_uid LIKE ? AND e.type = 'HAS_METHOD'
    `,
      )
      .all(prefix + ':%') as any[]
    return rows.map(rowToNode)
  }

  getProperties(ownerUid: string): CodeNode[] {
    const normalized = ownerUid.replace(/:[0-9]+$/, ':0')
    let rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.to_uid
      WHERE e.from_uid = ? AND e.type = 'HAS_PROPERTY'
    `,
      )
      .all(normalized) as any[]
    if (rows.length > 0) return rows.map(rowToNode)
    const prefix = normalized.replace(/:[^:]+$/, '')
    rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.to_uid
      WHERE e.from_uid LIKE ? AND e.type = 'HAS_PROPERTY'
    `,
      )
      .all(prefix + ':%') as any[]
    return rows.map(rowToNode)
  }

  getOverrides(methodUid: string): CodeNode[] {
    const normalized = methodUid.replace(/:[0-9]+$/, ':0')
    let rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.from_uid
      WHERE e.to_uid = ? AND e.type = 'OVERRIDES'
    `,
      )
      .all(normalized) as any[]
    if (rows.length > 0) return rows.map(rowToNode)
    const prefix = normalized.replace(/:[^:]+$/, '')
    rows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.from_uid
      WHERE e.to_uid LIKE ? AND e.type = 'OVERRIDES'
    `,
      )
      .all(prefix + ':%') as any[]
    return rows.map(rowToNode)
  }

  getMembersOf(classUid: string): CodeNode[] {
    const normalized = classUid.replace(/:[0-9]+$/, ':0')
    const uidPrefix = normalized.replace(/:[^:]+$/, '')

    let methodRows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.to_uid
      WHERE e.from_uid = ? AND e.type = 'HAS_METHOD'
    `,
      )
      .all(normalized) as any[]
    if (methodRows.length === 0) {
      methodRows = this.db
        .prepare(
          `
        SELECT n.* FROM nodes n
        JOIN edges e ON n.uid = e.to_uid
        WHERE e.from_uid LIKE ? AND e.type = 'HAS_METHOD'
      `,
        )
        .all(uidPrefix + ':%') as any[]
    }

    let propRows = this.db
      .prepare(
        `
      SELECT n.* FROM nodes n
      JOIN edges e ON n.uid = e.to_uid
      WHERE e.from_uid = ? AND e.type = 'HAS_PROPERTY'
    `,
      )
      .all(normalized) as any[]
    if (propRows.length === 0) {
      propRows = this.db
        .prepare(
          `
        SELECT n.* FROM nodes n
        JOIN edges e ON n.uid = e.to_uid
        WHERE e.from_uid LIKE ? AND e.type = 'HAS_PROPERTY'
      `,
        )
        .all(uidPrefix + ':%') as any[]
    }

    return [...methodRows, ...propRows].map(rowToNode)
  }

  getRouteHandlers(): { route: string; handler: CodeNode }[] {
    const rows = this.db
      .prepare(
        `
      SELECT e.from_uid as route_uid, e.to_uid as handler_uid
      FROM edges e
      WHERE e.type = 'HANDLES_ROUTE'
    `,
      )
      .all() as any[]

    return rows
      .map((r) => ({
        route: r.route_uid,
        handler: this.getNode(r.handler_uid)!,
      }))
      .filter((r) => r.handler !== null)
  }

  getToolHandlers(): { tool: string; handler: CodeNode }[] {
    const rows = this.db
      .prepare(
        `
      SELECT e.from_uid as tool_uid, e.to_uid as handler_uid
      FROM edges e
      WHERE e.type = 'HANDLES_TOOL'
    `,
      )
      .all() as any[]

    return rows
      .map((r) => ({
        tool: r.tool_uid,
        handler: this.getNode(r.handler_uid)!,
      }))
      .filter((r) => r.handler !== null)
  }

  getQueryEdges(): CodeEdge[] {
    return this.getAllEdges('QUERIES')
  }

  // ─── Communities ────────────────────────────────────────────────────────

  insertCommunity(community: Community): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO communities (id, name, keywords, description, cohesion)
      VALUES (@id, @name, @keywords, @description, @cohesion)
    `,
      )
      .run({
        id: community.id,
        name: community.name,
        keywords: JSON.stringify(community.keywords),
        description: community.description,
        cohesion: community.cohesion,
      })
  }

  getCommunity(id: string): Community | null {
    const row = this.db.prepare('SELECT * FROM communities WHERE id = ?').get(id) as any
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      keywords: JSON.parse(row.keywords),
      description: row.description ?? '',
      cohesion: row.cohesion,
      symbolCount: 0,
      nodes: [],
    }
  }

  getAllCommunities(): Community[] {
    const rows = this.db.prepare('SELECT * FROM communities ORDER BY cohesion DESC').all() as any[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      keywords: JSON.parse(r.keywords),
      description: r.description ?? '',
      cohesion: r.cohesion,
      symbolCount: 0,
      nodes: [],
    }))
  }

  // ─── Processes ─────────────────────────────────────────────────────────

  insertProcess(process: Process): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO processes
        (id, name, type, entry_point_uid, terminal_uids, communities)
      VALUES (@id, @name, @type, @entryPoint, @terminals, @communities)
    `,
      )
      .run({
        id: process.id,
        name: process.name,
        type: process.type,
        entryPoint: process.entryPointUid,
        terminals: JSON.stringify(process.terminalUids),
        communities: JSON.stringify(process.communities),
      })
  }

  getAllProcesses(): Process[] {
    const rows = this.db.prepare('SELECT * FROM processes').all() as any[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as Process['type'],
      entryPointUid: r.entry_point_uid,
      terminalUids: JSON.parse(r.terminal_uids),
      communities: JSON.parse(r.communities),
      steps: [],
    }))
  }

  getProcess(id: string): Process | null {
    const row = this.db.prepare('SELECT * FROM processes WHERE id = ?').get(id) as any
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      type: row.type as Process['type'],
      entryPointUid: row.entry_point_uid,
      terminalUids: JSON.parse(row.terminal_uids),
      communities: JSON.parse(row.communities),
      steps: [],
    }
  }

  // ─── FTS ────────────────────────────────────────────────────────────────

  rebuildFTS(): void {
    // Create virtual FTS5 tables
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_symbols USING fts5(
        uid UNINDEXED, name, file_path, type,
        tokenize='porter unicode61'
      )
    `)
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_files USING fts5(
        file_path,
        tokenize='porter unicode61'
      )
    `)

    // Clear existing
    try {
      this.db.exec("INSERT INTO fts_symbols(fts_symbols) VALUES('delete')")
    } catch {
      /* no-op */
    }
    try {
      this.db.exec("INSERT INTO fts_files(fts_files) VALUES('delete')")
    } catch {
      /* no-op */
    }

    // Repopulate
    const nodes = this.db.prepare('SELECT uid, name, file_path, type FROM nodes').all() as any[]
    const insertFTS = this.db.prepare(
      'INSERT INTO fts_symbols(uid, name, file_path, type) VALUES (?, ?, ?, ?)',
    )
    for (const n of nodes) {
      insertFTS.run(n.uid, n.name, n.file_path, n.type)
    }

    const files = [...new Set(nodes.map((n) => n.file_path))]
    const insertFF = this.db.prepare('INSERT INTO fts_files(file_path) VALUES (?)')
    for (const f of files) {
      insertFF.run(f)
    }
  }

  searchSymbols(
    query: string,
    limit = 20,
  ): { uid: string; name: string; filePath: string; type: string }[] {
    const rows = this.db
      .prepare(
        `
      SELECT uid, name, file_path, type FROM fts_symbols
      WHERE fts_symbols MATCH ?
      LIMIT ?
    `,
      )
      .all(query, limit) as any[]
    return rows.map((r) => ({
      uid: r.uid,
      name: r.name,
      filePath: r.file_path,
      type: r.type,
    }))
  }

  searchFiles(query: string, limit = 20): string[] {
    const rows = this.db
      .prepare(
        `
      SELECT file_path FROM fts_files
      WHERE fts_files MATCH ?
      LIMIT ?
    `,
      )
      .all(query, limit) as any[]
    return rows.map((r) => r.file_path)
  }

  // ─── Stats ─────────────────────────────────────────────────────────────

  getStats(): RepoStats {
    const files =
      (this.db.prepare('SELECT COUNT(DISTINCT file_path) as c FROM nodes').get() as any)?.c ?? 0
    const nodes = (this.db.prepare('SELECT COUNT(*) as c FROM nodes').get() as any)?.c ?? 0
    const edges = (this.db.prepare('SELECT COUNT(*) as c FROM edges').get() as any)?.c ?? 0
    const communities =
      (this.db.prepare('SELECT COUNT(*) as c FROM communities').get() as any)?.c ?? 0
    const processes = (this.db.prepare('SELECT COUNT(*) as c FROM processes').get() as any)?.c ?? 0

    // Check for embeddings — both via meta flag and actual embedding column
    const embeddingsRow = this.db
      .prepare("SELECT COUNT(*) as c FROM meta WHERE key = 'embeddings_generated'")
      .get() as any
    const nodesWithEmbeddings =
      (this.db.prepare('SELECT COUNT(*) as c FROM nodes WHERE embedding IS NOT NULL').get() as any)
        ?.c ?? 0
    const hasEmbeddings = (embeddingsRow?.c ?? 0) > 0 || nodesWithEmbeddings > 0

    return { files, nodes, edges, communities, processes, hasEmbeddings }
  }

  getDetailedStats(): {
    files: number
    nodes: number
    edges: number
    communities: number
    processes: number
    hasEmbeddings: boolean
    byType: Record<string, number>
    byEdgeType: Record<string, number>
  } {
    const stats = this.getStats()

    const byTypeRows = this.db
      .prepare('SELECT type, COUNT(*) as c FROM nodes GROUP BY type')
      .all() as any[]
    const byType: Record<string, number> = {}
    for (const r of byTypeRows) byType[r.type] = r.c

    const byEdgeRows = this.db
      .prepare('SELECT type, COUNT(*) as c FROM edges GROUP BY type ORDER BY c DESC')
      .all() as any[]
    const byEdgeType: Record<string, number> = {}
    for (const r of byEdgeRows) byEdgeType[r.type] = r.c

    return { ...stats, byType, byEdgeType }
  }

  // ─── Meta ────────────────────────────────────────────────────────────────

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value)
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as any
    return row?.value ?? null
  }

  upsertEmbeddingsBatch(uids: string[], embeddings: number[][]): void {
    if (uids.length === 0) return
    const upsert = this.db.transaction(() => {
      const stmt = this.db.prepare('UPDATE nodes SET embedding = @embedding WHERE uid = @uid')
      for (let i = 0; i < uids.length; i++) {
        stmt.run({ uid: uids[i], embedding: JSON.stringify(embeddings[i]) })
      }
    })
    upsert()
  }

  // ─── Registry ─────────────────────────────────────────────────────────

  registerRepo(repo: {
    name: string
    path: string
    dbPath: string
    indexedAt: string
    lastCommit: string
    stats: RepoStats
    language: string
  }): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO registry
        (name, path, db_path, indexed_at, last_commit, stats, language)
      VALUES (@name, @path, @dbPath, @indexedAt, @lastCommit, @stats, @language)
    `,
      )
      .run({
        name: repo.name,
        path: repo.path,
        dbPath: repo.dbPath,
        indexedAt: repo.indexedAt,
        lastCommit: repo.lastCommit,
        stats: JSON.stringify(repo.stats),
        language: repo.language,
      })
  }

  listRepos(): { name: string; path: string; indexedAt: string; stats: RepoStats }[] {
    const rows = this.db.prepare('SELECT * FROM registry ORDER BY indexed_at DESC').all() as any[]
    return rows.map((r) => ({
      name: r.name,
      path: r.path,
      indexedAt: r.indexed_at,
      stats: JSON.parse(r.stats),
    }))
  }

  close(): void {
    this.db.close()
  }
}
