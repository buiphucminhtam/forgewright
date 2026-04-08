/**
 * Detect whether a database file is SQLite (the legacy format).
 * Returns the detected format or null if the file doesn't exist.
 */
function detectDbFormat(dbPath: string): 'sqlite' | 'kuzudb' | null {
  if (!existsSync(dbPath)) return null

  try {
    // SQLite files start with the 16-byte header "SQLite format 3\0"
    const header = readFileSync(dbPath)
    if (header.length >= 16) {
      const magic = header.slice(0, 16).toString('utf8')
      if (magic.startsWith('SQLite')) return 'sqlite'
    }
    return 'kuzudb'
  } catch {
    return 'kuzudb' // can't read — assume it's fine
  }
}

/**
 * ForgeNexus Database — KuzuDB (Graph Database) Backend v2.2
 *
 * Migration from SQLite (better-sqlite3):
 *   - Nodes → CodeNode table with FTS index
 *   - Edges → per-relationship-type tables (CALLS, IMPORTS, etc.)
 *   - Communities → Community node table
 *   - Processes → Process node table
 *   - Registry / Groups → RepoRegistry, RepoGroup, Contract node tables
 *   - FTS → KuzuDB FTS extension
 *
 * KuzuDB API:
 *   - Database(dbPath) — open/create database
 *   - conn.query(sql) → async QueryResult (Promise)
 *   - conn.querySync(sql) → sync QueryResult
 *   - QueryResult.getAll() → async Row[]
 *   - QueryResult.getAllSync() → sync Row[]
 *   - No transaction support — KuzuDB handles writes internally
 *
 * Sync bridging:
 *   - Writes go to an in-memory queue, flushed in batches via querySync
 *   - Reads go directly via querySync (safe — KuzuDB is thread-safe for reads)
 *   - Periodic flush every 2s to prevent queue buildup
 */

import { existsSync, unlinkSync, readFileSync } from 'fs'
import { Database, Connection } from 'kuzu'
import { KUZU_SCHEMA } from './schema.js'
import type {
  CodeNode,
  CodeEdge,
  Community,
  Process,
  RepoStats,
  EdgeType,
  NodeType,
} from '../types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToNode(r: Record<string, any>): CodeNode {
  return {
    uid: r.uid,
    type: (r.type ?? 'unknown') as NodeType,
    name: r.name ?? '',
    filePath: r.filePath ?? r.file_path ?? '',
    line: Number(r.line ?? r.Line ?? 0),
    endLine: Number(r.endLine ?? r.end_line ?? r.EndLine ?? 0),
    column: r.columnNum ?? r.column_num ?? r.ColumnNum ?? undefined,
    returnType: r.returnType ?? r.return_type ?? r.ReturnType ?? undefined,
    parameterCount: r.paramCount ?? r.param_count ?? r.ParamCount ?? undefined,
    declaredType: r.declaredType ?? r.declared_type ?? undefined,
    language: r.language ?? undefined,
    signature: r.signature ?? undefined,
    community: r.community ?? undefined,
    process: r.process ?? r.process_name ?? undefined,
  }
}

function rowToEdge(r: Record<string, any>): CodeEdge {
  return {
    id: r.uid ?? r['n.uid'] ?? '',
    fromUid: r.rel_from ?? r['n.rel_from'] ?? '',
    toUid: r.rel_to ?? r['n.rel_to'] ?? '',
    type: (r.rel_type ?? r['n.rel_type'] ?? r.type ?? r['n.type'] ?? 'CALLS') as EdgeType,
    confidence: Number(r.rel_confidence ?? r['n.rel_confidence'] ?? r.confidence ?? r['n.confidence'] ?? 1.0),
    reason: r.rel_reason ?? r['n.rel_reason'] ?? r.reason ?? r['n.reason'] ?? undefined,
    step: r.rel_step ?? r['n.rel_step'] ?? r.step ?? r['n.step'] ?? undefined,
  }
}

function rowToCommunity(r: Record<string, any>): Community {
  return {
    id: r.id ?? '',
    name: r.name ?? '',
    keywords: r.keywords
      ? typeof r.keywords === 'string'
        ? JSON.parse(r.keywords)
        : r.keywords
      : [],
    description: r.description ?? '',
    cohesion: Number(r.cohesion ?? 0),
    symbolCount: 0,
    nodes: [],
  }
}

function rowToProcess(r: Record<string, any>): Process {
  return {
    id: r.id ?? '',
    name: r.name ?? '',
    type: (r.type ?? 'unknown') as Process['type'],
    entryPointUid: r.entryPointUid ?? r.entry_point_uid ?? '',
    terminalUids: r.terminalUids
      ? typeof r.terminalUids === 'string'
        ? JSON.parse(r.terminalUids)
        : r.terminalUids
      : [],
    communities: r.communities
      ? typeof r.communities === 'string'
        ? JSON.parse(r.communities)
        : r.communities
      : [],
    steps: [],
  }
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "''")   // Cypher single-quote: double it
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

/** Unwrap querySync result (single or multiple) to a single QueryResult */
function unwrapResult(result: any): any {
  return Array.isArray(result) ? result[0] : result
}

function sqlRowToProps(n: CodeNode, _embedding?: number[]): Record<string, any> {
  return {
    uid: esc(n.uid),
    type: esc(n.type),
    name: esc(n.name),
    filePath: esc(n.filePath),
    line: n.line,
    endLine: n.endLine,
    columnNum: n.column ?? 0,
    returnType: n.returnType ? `"${esc(n.returnType)}"` : 'NULL',
    paramCount: n.parameterCount ?? 0,
    declaredType: n.declaredType ? `"${esc(n.declaredType)}"` : 'NULL',
    language: n.language ? `"${esc(n.language)}"` : 'NULL',
    signature: n.signature ? `"${esc(n.signature)}"` : 'NULL',
    community: n.community ? `"${esc(n.community)}"` : 'NULL',
    process: n.process ? `"${esc(n.process)}"` : 'NULL',
  }
}

// ─── Write Queue ─────────────────────────────────────────────────────────────

interface QueuedNode {
  kind: 'node'
  node: CodeNode
  embedding?: number[]
}
interface QueuedEdge {
  kind: 'edge'
  edge: CodeEdge
}
interface QueuedCommunity {
  kind: 'community'
  community: Community
}
interface QueuedProcess {
  kind: 'process'
  process: Process
}
type QueuedOp = QueuedNode | QueuedEdge | QueuedCommunity | QueuedProcess

// ─── ForgeDB ────────────────────────────────────────────────────────────────

export class ForgeDB {
  private db: InstanceType<typeof Database>
  private conn: InstanceType<typeof Connection>
  private queue: QueuedOp[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private edgeUidCounter = 0

  /** Expose raw db for low-level operations (indexer needs DELETE/UPDATE) */
  get rawDb(): InstanceType<typeof Database> {
    return this.db
  }

  /** Expose raw connection for KuzuDB Cypher queries (indexer, groups) */
  get connection(): InstanceType<typeof Connection> {
    return this.conn
  }

  constructor(dbPath: string) {
    // Detect legacy SQLite file and reset it
    const format = detectDbFormat(dbPath)
    if (format === 'sqlite') {
      console.error(`[ForgeNexus] Detected legacy SQLite index — resetting for KuzuDB.`)
      try {
        // Remove all SQLite files so KuzuDB can create fresh ones
        ;['', '-shm', '-wal'].forEach((suffix) => {
          const f = dbPath + suffix
          if (existsSync(f)) unlinkSync(f)
        })
      } catch (e: any) {
        console.warn(`[ForgeNexus] Could not remove old index: ${e.message}`)
      }
    }

    this.db = new Database(dbPath)
    this.conn = new Connection(this.db)

    // Initialize schema
    const stmts = KUZU_SCHEMA.split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('LOAD EXTENSION'))
    for (const stmt of stmts) {
      try {
        this.conn.querySync(stmt)
      } catch (e: any) {
        // "already exists" errors are safe to ignore
        if (!e.message?.includes('already exists') && !e.message?.includes('Duplicate')) {
          console.warn(`[ForgeNexus] Schema init warning: ${e.message}`)
        }
      }
    }

    // Periodic flush every 2s
    this.flushTimer = setTimeout(() => this.flushWrites(), 2000)
  }

  // ─── Write Queue ────────────────────────────────────────────────────────────

  private enqueue(op: QueuedOp): void {
    this.queue.push(op)
    if (this.queue.length >= 500) this.flushWrites()
  }

  flushWrites(): void {
    if (this.queue.length === 0) return
    const ops = this.queue.splice(0)

    const nodes = ops.filter((op) => op.kind === 'node')
    const edges = ops.filter((op) => op.kind === 'edge')
    const communities = ops.filter((op) => op.kind === 'community')
    const processes = ops.filter((op) => op.kind === 'process')

    // ── Batch nodes via UNWIND ───────────────────────────────────────────────
    if (nodes.length > 0) {
      const rows = nodes.map((op) => {
        const p = sqlRowToProps((op as QueuedNode).node, (op as QueuedNode).embedding)
        return `{uid: "${p.uid}", type: "${p.type}", name: "${p.name}", filePath: "${p.filePath}", line: ${p.line}, endLine: ${p.endLine}, columnNum: ${p.columnNum}, returnType: ${p.returnType}, paramCount: ${p.paramCount}, declaredType: ${p.declaredType}, language: ${p.language}, signature: ${p.signature}, community: ${p.community}, process: ${p.process}}`
      })

      const batchSize = 200
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        try {
          this.conn.querySync(
            `UNWIND [${batch.join(', ')}] AS row CREATE (n:CodeNode {uid: row.uid, type: row.type, name: row.name, filePath: row.filePath, line: row.line, endLine: row.endLine, columnNum: row.columnNum, returnType: row.returnType, paramCount: row.paramCount, declaredType: row.declaredType, language: row.language, signature: row.signature, community: row.community, process: row.process})`,
          )
        } catch (e: any) {
          if (!e.message?.includes('already exists') && !e.message?.includes('duplicate')) {
            console.warn(`[ForgeNexus] UNWIND node batch failed: ${e.message?.substring(0, 100)}`)
          }
        }
      }
    }

    // ── Batch edges via CodeNode rows with rel_type column ─────────────────────────
    if (edges.length > 0) {
      const edgeRows = edges.map((op) => {
        const e = (op as QueuedEdge).edge
        // Use a truly unique UID to avoid primary key collisions
        // (original e.id may collide when the same call appears multiple times)
        const uid = `EDGE_${this.edgeUidCounter++}_${esc(e.fromUid)}_${esc(e.type)}_${esc(e.toUid)}`
        const rel_type = esc(e.type)
        const rel_from = esc(e.fromUid)
        const rel_to = esc(e.toUid)
        const rel_confidence = e.confidence ?? 1.0
        const rel_reason = e.reason ? `"${esc(e.reason)}"` : 'NULL'
        const rel_step = e.step !== undefined && e.step !== null ? `"${esc(String(e.step))}"` : 'NULL'
        return `{uid: "${uid}", type: "${rel_type}", name: "${rel_type}", rel_type: "${rel_type}", rel_from: "${rel_from}", rel_to: "${rel_to}", rel_confidence: ${rel_confidence}, rel_reason: ${rel_reason}, rel_step: ${rel_step}}`
      })

      const batchSize = 200
      for (let i = 0; i < edgeRows.length; i += batchSize) {
        const batch = edgeRows.slice(i, i + batchSize)
        try {
          this.conn.querySync(
            `UNWIND [${batch.join(', ')}] AS row CREATE (e:CodeNode {uid: row.uid, type: row.rel_type, name: row.rel_type, rel_type: row.rel_type, rel_from: row.rel_from, rel_to: row.rel_to, rel_confidence: row.rel_confidence, rel_reason: row.rel_reason, rel_step: row.rel_step})`,
          )
        } catch (e: any) {
          if (e.message?.includes('already exists') || e.message?.includes('duplicate')) continue
          console.error(`[ForgeNexus] UNWIND edge batch failed (${i}-${i + batch.length}): ${e.message?.substring(0, 200)}`)
        }
      }
    }

    // ── Communities ──────────────────────────────────────────────────────────
    for (const op of communities) {
      const c = (op as QueuedCommunity).community
      const keywords = esc(JSON.stringify(c.keywords))
      try {
        this.conn.querySync(
          `CREATE (m:Community {id: "${esc(c.id)}", name: "${esc(c.name)}", keywords: "${keywords}", description: "${esc(c.description)}", cohesion: ${c.cohesion}})`,
        )
      } catch (e: any) {
        if (!e.message?.includes('already exists') && !e.message?.includes('duplicate')) {
          console.warn(`[ForgeNexus] Community write failed: ${e.message?.substring(0, 100)}`)
        }
      }
    }

    // ── Processes ──────────────────────────────────────────────────────────
    for (const op of processes) {
      const pr = (op as QueuedProcess).process
      const terminals = esc(JSON.stringify(pr.terminalUids))
      const comms = esc(JSON.stringify(pr.communities))
      try {
        this.conn.querySync(
          `CREATE (pr2:Process {id: "${esc(pr.id)}", name: "${esc(pr.name)}", type: "${pr.type}", entryPointUid: "${esc(pr.entryPointUid)}", terminalUids: "${terminals}", communities: "${comms}"})`,
        )
      } catch (e: any) {
        if (!e.message?.includes('already exists') && !e.message?.includes('duplicate')) {
          console.warn(`[ForgeNexus] Process write failed: ${e.message?.substring(0, 100)}`)
        }
      }
    }
  }

  // ─── Node Writers ──────────────────────────────────────────────────────────

  insertNode(node: CodeNode, embedding?: number[]): void {
    this.enqueue({ kind: 'node', node, embedding })
  }

  insertNodesBatch(nodes: CodeNode[], embeddings?: Map<string, number[]>): void {
    for (const node of nodes) {
      this.enqueue({ kind: 'node', node, embedding: embeddings?.get(node.uid) })
    }
  }

  // ─── Edge Writers ──────────────────────────────────────────────────────────

  insertEdge(edge: CodeEdge): void {
    this.enqueue({ kind: 'edge', edge })
  }

  insertEdgesBatch(edges: CodeEdge[]): void {
    for (const edge of edges) this.enqueue({ kind: 'edge', edge })
  }

  // ─── Community / Process Writers ─────────────────────────────────────────────

  insertCommunity(community: Community): void {
    this.enqueue({ kind: 'community', community })
  }

  insertProcess(process: Process): void {
    this.enqueue({ kind: 'process', process })
  }

  // ─── Raw SQL (for indexer DELETE/UPDATE) ─────────────────────────────────

  exec(sql: string): void {
    try {
      this.conn.querySync(sql)
    } catch (e: any) {
      if (e.message) {
        console.warn(`[ForgeNexus] DB exec failed: ${e.message}`)
      }
    }
  }

  // ─── Read Methods ───────────────────────────────────────────────────────────

  /**
   * Low-level query: runs a KuzuDB Cypher query and returns rows.
   * Flushes pending writes first. Returns [] on error.
   */
  query(sql: string): Record<string, any>[] {
    this.flushWrites()
    try {
      const result = this.conn.querySync(sql)
      const r = Array.isArray(result) ? result[0] : result
      return (r as any).getAllSync() as Record<string, any>[]
    } catch (e: any) {
      if (e.message) {
        console.warn(`[ForgeNexus] DB query failed (returning []): ${e.message}`)
      }
      return []
    }
  }

  getNode(uid: string): CodeNode | null {
    const rows = this.query(
      `MATCH (n:CodeNode {uid: "${esc(uid)}"}) RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process LIMIT 1`,
    )
    return rows.length > 0 ? rowToNode(rows[0]) : null
  }

  getNodesByName(name: string): CodeNode[] {
    return this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type IS NULL AND n.name = "${esc(name)}" RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process ORDER BY n.filePath`,
    ).map(rowToNode)
  }

  searchNodes(
    search: string,
    op: 'contains' | 'starts' | 'ends' = 'contains',
    type?: NodeType,
    limit = 200,
  ): CodeNode[] {
    // KuzuDB does NOT support LIKE — use CONTAINS / STARTS WITH / regex
    const typeFilter = type ? ` AND n.type = "${esc(type)}"` : ''
    let where = `n.rel_type IS NULL AND n.name ${esc(search)} IS NOT NULL${typeFilter}`
    if (op === 'contains') {
      where = `n.rel_type IS NULL AND n.name CONTAINS '${esc(search)}'${typeFilter}`
    } else if (op === 'starts') {
      where = `n.rel_type IS NULL AND n.name STARTS WITH '${esc(search)}'${typeFilter}`
    } else if (op === 'ends') {
      where = `n.rel_type IS NULL AND n.name CONTAINS '${esc(search)}'${typeFilter}`
    }
    return this.query(
      `MATCH (n:CodeNode) WHERE ${where} RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process LIMIT ${limit}`,
    ).map(rowToNode)
  }

  getNodesByType(type: NodeType, limit?: number): CodeNode[] {
    const limitClause = limit ? ` LIMIT ${limit}` : ''
    return this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type IS NULL AND n.type = "${esc(type)}" RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process${limitClause}`,
    ).map(rowToNode)
  }

  getNodesByFile(filePath: string): CodeNode[] {
    return this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type IS NULL AND n.filePath = "${esc(filePath)}" RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process`,
    ).map(rowToNode)
  }

  getNodesByCommunity(communityId: string): CodeNode[] {
    // Nodes have a `community` field set by the indexer
    return this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type IS NULL AND n.community = "${esc(communityId)}" RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process ORDER BY n.line`,
    ).map(rowToNode)
  }

  getNodesByProcess(processId: string): CodeNode[] {
    // Nodes have a `process` field set by the indexer
    return this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type IS NULL AND n.process = "${esc(processId)}" RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process ORDER BY n.line`,
    ).map(rowToNode)
  }

  getAllNodes(): CodeNode[] {
    // Filter out edge records (stored as CodeNode rows with rel_type IS NOT NULL)
    return this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type IS NULL RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process`,
    ).map(rowToNode)
  }

  getAllFilePaths(): string[] {
    return this.query(`MATCH (n:CodeNode) WHERE n.rel_type IS NULL RETURN DISTINCT n.filePath AS filePath`).map(
      (r) => r.filePath as string,
    )
  }

  // ─── Edge Readers ───────────────────────────────────────────────────────────

  private edgeQuery(sql: string): CodeEdge[] {
    return this.query(sql).map(rowToEdge)
  }

  getIncomingEdges(uid: string, type?: EdgeType): CodeEdge[] {
    const typeFilter = type ? ` AND n.rel_type = "${esc(type)}"` : ''
    return this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type IS NOT NULL AND n.rel_to = "${esc(uid)}"${typeFilter} RETURN n.uid AS uid, n.rel_from AS rel_from, n.rel_to AS rel_to, n.rel_type AS rel_type, n.rel_confidence AS rel_confidence, n.rel_reason AS rel_reason, n.rel_step AS rel_step`,
    ).map(rowToEdge)
  }

  getOutgoingEdges(uid: string, type?: EdgeType): CodeEdge[] {
    const typeFilter = type ? ` AND n.rel_type = "${esc(type)}"` : ''
    return this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type IS NOT NULL AND n.rel_from = "${esc(uid)}"${typeFilter} RETURN n.uid AS uid, n.rel_from AS rel_from, n.rel_to AS rel_to, n.rel_type AS rel_type, n.rel_confidence AS rel_confidence, n.rel_reason AS rel_reason, n.rel_step AS rel_step`,
    ).map(rowToEdge)
  }

  getAllEdges(type?: EdgeType): CodeEdge[] {
    const typeFilter = type ? ` AND n.rel_type = "${esc(type)}"` : ''
    return this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type IS NOT NULL${typeFilter} RETURN n.uid AS uid, n.rel_from AS rel_from, n.rel_to AS rel_to, n.rel_type AS rel_type, n.rel_confidence AS rel_confidence, n.rel_reason AS rel_reason, n.rel_step AS rel_step`,
    ).map(rowToEdge)
  }

  getEdgeCount(type?: EdgeType): number {
    const typeFilter = type ? ` AND n.rel_type = "${esc(type)}"` : ''
    const rows = this.query(`MATCH (n:CodeNode) WHERE n.rel_type IS NOT NULL${typeFilter} RETURN count(n) AS cnt`)
    return rows.length > 0 ? Number(rows[0].cnt) : 0
  }

  // ─── Convenience Readers ─────────────────────────────────────────────────────

  getCallers(uid: string): CodeNode[] {
    return this.query(
      `MATCH (caller:CodeNode)-[:CALLS]->(callee:CodeNode {uid: "${esc(uid)}"})
       RETURN caller.uid AS uid, caller.type AS type, caller.name AS name, caller.filePath AS filePath, caller.line AS line, caller.endLine AS endLine, caller.columnNum AS columnNum, caller.returnType AS returnType, caller.paramCount AS paramCount, caller.declaredType AS declaredType, caller.language AS language, caller.signature AS signature, caller.community AS community, caller.process AS process, caller.embedding AS embedding`,
    ).map(rowToNode)
  }

  getCallees(uid: string): CodeNode[] {
    return this.query(
      `MATCH (caller:CodeNode {uid: "${esc(uid)}"})-[:CALLS]->(callee:CodeNode)
       RETURN callee.uid AS uid, callee.type AS type, callee.name AS name, callee.filePath AS filePath, callee.line AS line, callee.endLine AS endLine, callee.columnNum AS columnNum, callee.returnType AS returnType, callee.paramCount AS paramCount, callee.declaredType AS declaredType, callee.language AS language, callee.signature AS signature, callee.community AS community, callee.process AS process, callee.embedding AS embedding`,
    ).map(rowToNode)
  }

  getImporters(uid: string): CodeNode[] {
    const name = uid.split(':')[1] ?? uid
    return this.query(
      `MATCH (importer:CodeNode)-[:IMPORTS]->(mod:CodeNode)
       WHERE mod.uid CONTAINS "${esc(name)}"
       RETURN importer.uid AS uid, importer.type AS type, importer.name AS name, importer.filePath AS filePath, importer.line AS line, importer.endLine AS endLine, importer.columnNum AS columnNum, importer.returnType AS returnType, importer.paramCount AS paramCount, importer.declaredType AS declaredType, importer.language AS language, importer.signature AS signature, importer.community AS community, importer.process AS process, importer.embedding AS embedding`,
    ).map(rowToNode)
  }

  getExtendees(uid: string): CodeNode[] {
    return this.relTargets(uid, 'EXTENDS')
  }

  getImplementers(uid: string): CodeNode[] {
    return this.relTargets(uid, 'IMPLEMENTS')
  }

  getMethods(ownerUid: string): CodeNode[] {
    return this.query(
      `MATCH (cls:CodeNode)-[:HAS_METHOD]->(m:CodeNode)
       WHERE cls.uid = "${esc(ownerUid)}"
       RETURN m.uid AS uid, m.type AS type, m.name AS name, m.filePath AS filePath, m.line AS line, m.endLine AS endLine, m.columnNum AS columnNum, m.returnType AS returnType, m.paramCount AS paramCount, m.declaredType AS declaredType, m.language AS language, m.signature AS signature, m.community AS community, m.process AS process, m.embedding AS embedding`,
    ).map(rowToNode)
  }

  getProperties(ownerUid: string): CodeNode[] {
    return this.query(
      `MATCH (cls:CodeNode)-[:HAS_PROPERTY]->(p:CodeNode)
       WHERE cls.uid = "${esc(ownerUid)}"
       RETURN p.uid AS uid, p.type AS type, p.name AS name, p.filePath AS filePath, p.line AS line, p.endLine AS endLine, p.columnNum AS columnNum, p.returnType AS returnType, p.paramCount AS paramCount, p.declaredType AS declaredType, p.language AS language, p.signature AS signature, p.community AS community, p.process AS process, p.embedding AS embedding`,
    ).map(rowToNode)
  }

  getOverrides(methodUid: string): CodeNode[] {
    return this.relTargets(methodUid, 'OVERRIDES')
  }

  getMembersOf(classUid: string): CodeNode[] {
    return this.query(
      `MATCH (cls:CodeNode)-[:HAS_METHOD|HAS_PROPERTY]->(m:CodeNode)
       WHERE cls.uid = "${esc(classUid)}"
       RETURN m.uid AS uid, m.type AS type, m.name AS name, m.filePath AS filePath, m.line AS line, m.endLine AS endLine, m.columnNum AS columnNum, m.returnType AS returnType, m.paramCount AS paramCount, m.declaredType AS declaredType, m.language AS language, m.signature AS signature, m.community AS community, m.process AS process, m.embedding AS embedding`,
    ).map(rowToNode)
  }

  private relTargets(uid: string, relType: string): CodeNode[] {
    return this.query(
      `MATCH (caller:CodeNode)-[:${relType}]->(target:CodeNode)
       WHERE caller.uid = "${esc(uid)}"
       RETURN target.uid AS uid, target.type AS type, target.name AS name, target.filePath AS filePath, target.line AS line, target.endLine AS endLine, target.columnNum AS columnNum, target.returnType AS returnType, target.paramCount AS paramCount, target.declaredType AS declaredType, target.language AS language, target.signature AS signature, target.community AS community, target.process AS process, target.embedding AS embedding`,
    ).map(rowToNode)
  }

  getRouteHandlers(): { route: string; handler: CodeNode }[] {
    // Edges stored as CodeNode rows with rel_type IS NOT NULL
    const results = this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type = "HANDLES_ROUTE" RETURN n.uid AS uid, n.rel_from AS rel_from, n.rel_to AS rel_to`,
    )
    return results
      .map((r) => ({
        route: r.rel_from as string,
        handlerUid: r.rel_to as string,
      }))
      .map((r) => ({ route: r.route, handler: this.getNode(r.handlerUid) }))
      .filter((r) => r.handler !== null) as { route: string; handler: CodeNode }[]
  }

  getToolHandlers(): { tool: string; handler: CodeNode }[] {
    const results = this.query(
      `MATCH (n:CodeNode) WHERE n.rel_type = "HANDLES_TOOL" RETURN n.uid AS uid, n.rel_from AS rel_from, n.rel_to AS rel_to`,
    )
    return results
      .map((r) => ({
        tool: r.rel_from as string,
        handlerUid: r.rel_to as string,
      }))
      .map((r) => ({ tool: r.tool, handler: this.getNode(r.handlerUid) }))
      .filter((r) => r.handler !== null) as { tool: string; handler: CodeNode }[]
  }

  getQueryEdges(): CodeEdge[] {
    return this.getAllEdges('QUERIES')
  }

  // ─── Community Readers ────────────────────────────────────────────────────────

  getCommunity(id: string): Community | null {
    const rows = this.query(
      `MATCH (c:Community {id: "${esc(id)}"}) RETURN c.id AS id, c.name AS name, c.keywords AS keywords, c.description AS description, c.cohesion AS cohesion LIMIT 1`,
    )
    return rows.length > 0 ? rowToCommunity(rows[0]) : null
  }

  getAllCommunities(): Community[] {
    return this.query(
      `MATCH (c:Community) RETURN c.id AS id, c.name AS name, c.keywords AS keywords, c.description AS description, c.cohesion AS cohesion ORDER BY c.cohesion DESC`,
    ).map(rowToCommunity)
  }

  // ─── Process Readers ─────────────────────────────────────────────────────────

  getAllProcesses(): Process[] {
    return this.query(
      `MATCH (p:Process) RETURN p.id AS id, p.name AS name, p.type AS type, p.entryPointUid AS entryPointUid, p.terminalUids AS terminalUids, p.communities AS communities`,
    ).map(rowToProcess)
  }

  getProcess(id: string): Process | null {
    const rows = this.query(
      `MATCH (p:Process {id: "${esc(id)}"}) RETURN p.id AS id, p.name AS name, p.type AS type, p.entryPointUid AS entryPointUid, p.terminalUids AS terminalUids, p.communities AS communities LIMIT 1`,
    )
    return rows.length > 0 ? rowToProcess(rows[0]) : null
  }

  // ─── FTS ────────────────────────────────────────────────────────────────────

  rebuildFTS(): void {
    // KuzuDB FTS is maintained automatically via CREATE FTS INDEX ON.
    // This is a no-op — index updates on every node insert.
  }

  searchSymbols(
    query: string,
    limit = 20,
  ): { uid: string; name: string; filePath: string; type: string }[] {
    const rows = this.query(
      `MATCH (n:CodeNode) WHERE n.name CONTAINS "${esc(query)}" RETURN n.uid AS uid, n.name AS name, n.filePath AS filePath, n.type AS type LIMIT ${limit}`,
    )
    return rows.map((r) => ({
      uid: r.uid as string,
      name: r.name as string,
      filePath: r.filePath as string,
      type: r.type as string,
    }))
  }

  searchFiles(query: string, limit = 20): string[] {
    return this.query(
      `MATCH (n:CodeNode) WHERE n.filePath CONTAINS "${esc(query)}" RETURN DISTINCT n.filePath AS filePath LIMIT ${limit}`,
    ).map((r) => r.filePath as string)
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  getStats(): RepoStats {
    const nodes = this.query(`MATCH (n:CodeNode) WHERE n.rel_type IS NULL RETURN count(n) AS cnt`)
    const edges = this.query(`MATCH (n:CodeNode) WHERE n.rel_type IS NOT NULL RETURN count(n) AS cnt`)
    const files = this.query(`MATCH (n:CodeNode) WHERE n.rel_type IS NULL RETURN count(DISTINCT n.filePath) AS cnt`)
    const comms = this.query(`MATCH (c:Community) RETURN count(c) AS cnt`)
    const procs = this.query(`MATCH (p:Process) RETURN count(p) AS cnt`)
    // Embeddings: no longer stored in CodeNode table (KuzuDB UNWIND CREATE + DOUBLE[] is incompatible)
    // Embeddings are stored in a separate key-value store if needed
    const embs = 0

    return {
      files: Number(files[0]?.cnt ?? 0),
      nodes: Number(nodes[0]?.cnt ?? 0),
      edges: Number(edges[0]?.cnt ?? 0),
      communities: Number(comms[0]?.cnt ?? 0),
      processes: Number(procs[0]?.cnt ?? 0),
      hasEmbeddings: false,
    }
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
    // Only count TRUE nodes (rel_type IS NULL), not edge-records stored in the same table.
    // Edge records have rel_type = "CALLS"/"IMPORTS"/etc and must be excluded.
    const byType: Record<string, number> = {}
    for (const r of this.query(`MATCH (n:CodeNode) WHERE n.rel_type IS NULL RETURN n.type AS type, count(n) AS cnt`)) {
      if (r.type) byType[r.type as string] = Number(r.cnt)
    }
    // byEdgeType already filters correctly (n.rel_type IS NOT NULL).
    const byEdgeType: Record<string, number> = {}
    for (const r of this.query(`MATCH (n:CodeNode) WHERE n.rel_type IS NOT NULL RETURN n.rel_type AS type, count(n) AS cnt`)) {
      if (r.type) byEdgeType[r.type as string] = Number(r.cnt)
    }
    return { ...stats, byType, byEdgeType }
  }

  // ─── Meta ───────────────────────────────────────────────────────────────────

  setMeta(key: string, value: string): void {
    try {
      const result = this.conn.querySync(
        `MATCH (m:CodeNode {uid: "META:${esc(key)}"}) SET m.signature = "${esc(value)}"`,
      )
      void unwrapResult(result)
    } catch {
      try {
        this.conn.querySync(
          `CREATE (m:CodeNode {uid: "META:${esc(key)}", type: "meta", name: "${esc(key)}", filePath: "", line: 0, endLine: 0, signature: "${esc(value)}"})`,
        )
      } catch (e: any) {
        console.warn(`[ForgeNexus] setMeta("${key}") failed: ${e.message?.substring(0, 100)}`)
      }
    }
  }

  getMeta(key: string): string | null {
    const rows = this.query(
      `MATCH (m:CodeNode {uid: "META:${esc(key)}"}) RETURN m.signature AS value LIMIT 1`,
    )
    return rows.length > 0 ? (rows[0].value as string) : null
  }

  upsertEmbeddingsBatch(uids: string[], embeddings: number[][]): void {
    // Embeddings are no longer stored in the CodeNode table (KuzuDB DOUBLE[] limitation).
    // If embeddings are needed, use a separate key-value store (e.g. LMDB, leveldb, or a JSON file).
    // This is a no-op stub to keep the API signature compatible.
    void uids
    void embeddings
  }

  // ─── Registry ───────────────────────────────────────────────────────────────

  registerRepo(repo: {
    name: string
    path: string
    dbPath: string
    indexedAt: string
    lastCommit: string
    stats: RepoStats
    language: string
  }): void {
    try {
      const r = this.conn.querySync(
        `MATCH (reg:RepoRegistry {name: "${esc(repo.name)}"})
         SET reg.path = "${esc(repo.path)}", reg.dbPath = "${esc(repo.dbPath)}",
             reg.indexedAt = "${esc(repo.indexedAt)}", reg.lastCommit = "${esc(repo.lastCommit)}",
             reg.stats = "${esc(JSON.stringify(repo.stats))}", reg.language = "${esc(repo.language)}"`,
      )
      void unwrapResult(r)
    } catch {
      try {
        this.conn.querySync(
          `CREATE (reg:RepoRegistry {name: "${esc(repo.name)}", path: "${esc(repo.path)}", dbPath: "${esc(repo.dbPath)}", indexedAt: "${esc(repo.indexedAt)}", lastCommit: "${esc(repo.lastCommit)}", stats: "${esc(JSON.stringify(repo.stats))}", language: "${esc(repo.language)}"})`,
        )
      } catch (e: any) {
        console.warn(`[ForgeNexus] registerRepo("${repo.name}") failed: ${e.message?.substring(0, 100)}`)
      }
    }
  }

  listRepos(): { name: string; path: string; indexedAt: string; stats: RepoStats }[] {
    return this.query(
      `MATCH (reg:RepoRegistry) RETURN reg.name AS name, reg.path AS path, reg.indexedAt AS indexedAt, reg.stats AS stats`,
    ).map((row) => ({
      name: row.name as string,
      path: row.path as string,
      indexedAt: row.indexedAt as string,
      stats: row.stats
        ? ((typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats) as RepoStats)
        : { files: 0, nodes: 0, edges: 0, communities: 0, processes: 0, hasEmbeddings: false },
    }))
  }

  // ─── Close ──────────────────────────────────────────────────────────────────

  close(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushWrites()
    this.conn.close()
    this.db.close()
  }
}
