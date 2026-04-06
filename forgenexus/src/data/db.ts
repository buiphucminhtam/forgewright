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
  const emb = r.embedding
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
    embedding: emb ? (typeof emb === 'string' ? JSON.parse(emb) : emb) : undefined,
  }
}

function rowToEdge(r: Record<string, any>): CodeEdge {
  return {
    id: r._id ?? `${r.fromUid}->${r.relType}:${r.toUid}`,
    fromUid: r.fromUid ?? r.src ?? '',
    toUid: r.toUid ?? r.dst ?? '',
    type: (r.relType ?? r.type ?? 'CALLS') as EdgeType,
    confidence: Number(r.confidence ?? 1.0),
    reason: r.reason ?? undefined,
    step: r.step ?? undefined,
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
  return String(s ?? '').replace(/"/g, '\\"')
}

/** Unwrap querySync result (single or multiple) to a single QueryResult */
function unwrapResult(result: any): any {
  return Array.isArray(result) ? result[0] : result
}

function sqlRowToProps(n: CodeNode, embedding?: number[]): Record<string, any> {
  return {
    uid: esc(n.uid),
    type: esc(n.type),
    name: esc(n.name),
    filePath: esc(n.filePath),
    line: n.line,
    endLine: n.endLine,
    columnNum: n.column ?? 'NULL',
    returnType: n.returnType ? `"${esc(n.returnType)}"` : 'NULL',
    paramCount: n.parameterCount ?? 'NULL',
    declaredType: n.declaredType ? `"${esc(n.declaredType)}"` : 'NULL',
    language: n.language ? `"${esc(n.language)}"` : 'NULL',
    signature: n.signature ? `"${esc(n.signature)}"` : 'NULL',
    community: n.community ? `"${esc(n.community)}"` : 'NULL',
    process: n.process ? `"${esc(n.process)}"` : 'NULL',
    embedding: embedding ? `"${esc(JSON.stringify(embedding))}"` : 'NULL',
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

  /** Expose raw db for low-level operations (indexer needs DELETE/UPDATE) */
  get rawDb(): InstanceType<typeof Database> {
    return this.db
  }

  constructor(dbPath: string) {
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

    for (const op of ops) {
      if (op.kind === 'node') {
        const p = sqlRowToProps(op.node, op.embedding)
        try {
          this.conn.querySync(
            `MERGE (n:CodeNode {uid: "${p.uid}"}) SET n.type = "${p.type}", n.name = "${p.name}", n.filePath = "${p.filePath}", n.line = ${p.line}, n.endLine = ${p.endLine}, n.columnNum = ${p.columnNum}, n.returnType = ${p.returnType}, n.paramCount = ${p.paramCount}, n.declaredType = ${p.declaredType}, n.language = ${p.language}, n.signature = ${p.signature}, n.community = ${p.community}, n.process = ${p.process}, n.embedding = ${p.embedding}`,
          )
        } catch {
          /* duplicate/missing ok */
        }
      } else if (op.kind === 'edge') {
        const e = op.edge
        const relType = e.type
        const fromUid = esc(e.fromUid)
        const toUid = esc(e.toUid)
        const conf = e.confidence ?? 1.0
        const reason = e.reason ? `"${esc(e.reason)}"` : 'NULL'
        const step = e.step ?? 'NULL'
        try {
          this.conn.querySync(
            `CREATE (a:CodeNode {uid: "${fromUid}"})-[r:${relType} {confidence: ${conf}, reason: ${reason}, step: ${step}}]->(b:CodeNode {uid: "${toUid}"})`,
          )
        } catch {
          /* exists */
        }
      } else if (op.kind === 'community') {
        const c = op.community
        const keywords = esc(JSON.stringify(c.keywords))
        try {
          this.conn.querySync(
            `MERGE (m:Community {id: "${esc(c.id)}"}) SET m.name = "${esc(c.name)}", m.keywords = "${keywords}", m.description = "${esc(c.description)}", m.cohesion = ${c.cohesion}`,
          )
        } catch {
          /* */
        }
      } else if (op.kind === 'process') {
        const p = op.process
        const terminals = esc(JSON.stringify(p.terminalUids))
        const comms = esc(JSON.stringify(p.communities))
        try {
          this.conn.querySync(
            `MERGE (pr:Process {id: "${esc(p.id)}"}) SET pr.name = "${esc(p.name)}", pr.type = "${p.type}", pr.entryPointUid = "${esc(p.entryPointUid)}", pr.terminalUids = "${terminals}", pr.communities = "${comms}"`,
          )
        } catch {
          /* */
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
    } catch {
      /* ignore */
    }
  }

  // ─── Read Methods ───────────────────────────────────────────────────────────

  private q(sql: string): Record<string, any>[] {
    this.flushWrites()
    try {
      const result = this.conn.querySync(sql)
      const r = Array.isArray(result) ? result[0] : result
      return (r as any).getAllSync() as Record<string, any>[]
    } catch {
      return []
    }
  }

  getNode(uid: string): CodeNode | null {
    const rows = this.q(
      `MATCH (n:CodeNode {uid: "${esc(uid)}"}) RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process, n.embedding AS embedding LIMIT 1`,
    )
    return rows.length > 0 ? rowToNode(rows[0]) : null
  }

  getNodesByName(name: string): CodeNode[] {
    return this.q(
      `MATCH (n:CodeNode {name: "${esc(name)}"}) RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process, n.embedding AS embedding ORDER BY n.filePath`,
    ).map(rowToNode)
  }

  searchNodes(
    search: string,
    op: 'contains' | 'starts' | 'ends' = 'contains',
    type?: NodeType,
    limit = 200,
  ): CodeNode[] {
    const like =
      op === 'starts' ? `${esc(search)}%` : op === 'ends' ? `%${esc(search)}` : `%${esc(search)}%`
    const typeFilter = type ? ` AND n.type = "${type}"` : ''
    return this.q(
      `MATCH (n:CodeNode) WHERE n.name LIKE "${like}"${typeFilter} RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process, n.embedding AS embedding LIMIT ${limit}`,
    ).map(rowToNode)
  }

  getNodesByType(type: NodeType, limit?: number): CodeNode[] {
    const limitClause = limit ? ` LIMIT ${limit}` : ''
    return this.q(
      `MATCH (n:CodeNode {type: "${type}"}) RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process, n.embedding AS embedding${limitClause}`,
    ).map(rowToNode)
  }

  getNodesByFile(filePath: string): CodeNode[] {
    return this.q(
      `MATCH (n:CodeNode {filePath: "${esc(filePath)}"}) RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process, n.embedding AS embedding`,
    ).map(rowToNode)
  }

  getNodesByCommunity(communityId: string): CodeNode[] {
    return this.q(
      `MATCH (n:CodeNode)-[:IN_COMMUNITY]->(c:Community {id: "${esc(communityId)}"}) RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process, n.embedding AS embedding ORDER BY n.line`,
    ).map(rowToNode)
  }

  getNodesByProcess(processId: string): CodeNode[] {
    return this.q(
      `MATCH (n:CodeNode)-[:STEP_IN_PROCESS]->(pr:Process {id: "${esc(processId)}"}) RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process, n.embedding AS embedding ORDER BY n.line`,
    ).map(rowToNode)
  }

  getAllNodes(): CodeNode[] {
    return this.q(
      `MATCH (n:CodeNode) RETURN n.uid AS uid, n.type AS type, n.name AS name, n.filePath AS filePath, n.line AS line, n.endLine AS endLine, n.columnNum AS columnNum, n.returnType AS returnType, n.paramCount AS paramCount, n.declaredType AS declaredType, n.language AS language, n.signature AS signature, n.community AS community, n.process AS process, n.embedding AS embedding`,
    ).map(rowToNode)
  }

  getAllFilePaths(): string[] {
    return this.q(`MATCH (n:CodeNode) RETURN DISTINCT n.filePath AS filePath`).map(
      (r) => r.filePath as string,
    )
  }

  // ─── Edge Readers ───────────────────────────────────────────────────────────

  private edgeQuery(sql: string): CodeEdge[] {
    return this.q(sql).map(rowToEdge)
  }

  getIncomingEdges(uid: string, type?: EdgeType): CodeEdge[] {
    const relFilter = type ? `:${type}` : ''
    return this.edgeQuery(
      `MATCH (a)-[r${relFilter}]->(b:CodeNode {uid: "${esc(uid)}"}) RETURN a.uid AS fromUid, b.uid AS toUid, type(r) AS relType, r.confidence AS confidence, r.reason AS reason, r.step AS step`,
    )
  }

  getOutgoingEdges(uid: string, type?: EdgeType): CodeEdge[] {
    const relFilter = type ? `:${type}` : ''
    return this.edgeQuery(
      `MATCH (a:CodeNode {uid: "${esc(uid)}"})-[r${relFilter}]->(b) RETURN a.uid AS fromUid, b.uid AS toUid, type(r) AS relType, r.confidence AS confidence, r.reason AS reason, r.step AS step`,
    )
  }

  getAllEdges(type?: EdgeType): CodeEdge[] {
    const relFilter = type ? `:${type}` : ''
    return this.edgeQuery(
      `MATCH (a)-[r${relFilter}]->(b) RETURN a.uid AS fromUid, b.uid AS toUid, type(r) AS relType, r.confidence AS confidence, r.reason AS reason, r.step AS step`,
    )
  }

  getEdgeCount(type?: EdgeType): number {
    const relFilter = type ? `:${type}` : ''
    const rows = this.q(`MATCH (a)-[r${relFilter}]->(b) RETURN count(r) AS cnt`)
    return rows.length > 0 ? Number(rows[0].cnt) : 0
  }

  // ─── Convenience Readers ─────────────────────────────────────────────────────

  getCallers(uid: string): CodeNode[] {
    return this.q(
      `MATCH (caller:CodeNode)-[:CALLS]->(callee:CodeNode {uid: "${esc(uid)}"})
       RETURN caller.uid AS uid, caller.type AS type, caller.name AS name, caller.filePath AS filePath, caller.line AS line, caller.endLine AS endLine, caller.columnNum AS columnNum, caller.returnType AS returnType, caller.paramCount AS paramCount, caller.declaredType AS declaredType, caller.language AS language, caller.signature AS signature, caller.community AS community, caller.process AS process, caller.embedding AS embedding`,
    ).map(rowToNode)
  }

  getCallees(uid: string): CodeNode[] {
    return this.q(
      `MATCH (caller:CodeNode {uid: "${esc(uid)}"})-[:CALLS]->(callee:CodeNode)
       RETURN callee.uid AS uid, callee.type AS type, callee.name AS name, callee.filePath AS filePath, callee.line AS line, callee.endLine AS endLine, callee.columnNum AS columnNum, callee.returnType AS returnType, callee.paramCount AS paramCount, callee.declaredType AS declaredType, callee.language AS language, callee.signature AS signature, callee.community AS community, callee.process AS process, callee.embedding AS embedding`,
    ).map(rowToNode)
  }

  getImporters(uid: string): CodeNode[] {
    const name = uid.split(':')[1] ?? uid
    return this.q(
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
    return this.q(
      `MATCH (cls:CodeNode)-[:HAS_METHOD]->(m:CodeNode)
       WHERE cls.uid = "${esc(ownerUid)}"
       RETURN m.uid AS uid, m.type AS type, m.name AS name, m.filePath AS filePath, m.line AS line, m.endLine AS endLine, m.columnNum AS columnNum, m.returnType AS returnType, m.paramCount AS paramCount, m.declaredType AS declaredType, m.language AS language, m.signature AS signature, m.community AS community, m.process AS process, m.embedding AS embedding`,
    ).map(rowToNode)
  }

  getProperties(ownerUid: string): CodeNode[] {
    return this.q(
      `MATCH (cls:CodeNode)-[:HAS_PROPERTY]->(p:CodeNode)
       WHERE cls.uid = "${esc(ownerUid)}"
       RETURN p.uid AS uid, p.type AS type, p.name AS name, p.filePath AS filePath, p.line AS line, p.endLine AS endLine, p.columnNum AS columnNum, p.returnType AS returnType, p.paramCount AS paramCount, p.declaredType AS declaredType, p.language AS language, p.signature AS signature, p.community AS community, p.process AS process, p.embedding AS embedding`,
    ).map(rowToNode)
  }

  getOverrides(methodUid: string): CodeNode[] {
    return this.relTargets(methodUid, 'OVERRIDES')
  }

  getMembersOf(classUid: string): CodeNode[] {
    return this.q(
      `MATCH (cls:CodeNode)-[:HAS_METHOD|HAS_PROPERTY]->(m:CodeNode)
       WHERE cls.uid = "${esc(classUid)}"
       RETURN m.uid AS uid, m.type AS type, m.name AS name, m.filePath AS filePath, m.line AS line, m.endLine AS endLine, m.columnNum AS columnNum, m.returnType AS returnType, m.paramCount AS paramCount, m.declaredType AS declaredType, m.language AS language, m.signature AS signature, m.community AS community, m.process AS process, m.embedding AS embedding`,
    ).map(rowToNode)
  }

  private relTargets(uid: string, relType: string): CodeNode[] {
    return this.q(
      `MATCH (caller:CodeNode)-[:${relType}]->(target:CodeNode)
       WHERE caller.uid = "${esc(uid)}"
       RETURN target.uid AS uid, target.type AS type, target.name AS name, target.filePath AS filePath, target.line AS line, target.endLine AS endLine, target.columnNum AS columnNum, target.returnType AS returnType, target.paramCount AS paramCount, target.declaredType AS declaredType, target.language AS language, target.signature AS signature, target.community AS community, target.process AS process, target.embedding AS embedding`,
    ).map(rowToNode)
  }

  getRouteHandlers(): { route: string; handler: CodeNode }[] {
    return this.q(
      `MATCH (routeNode:CodeNode)-[:HANDLES_ROUTE]->(h:CodeNode)
       RETURN routeNode.uid AS route, h.uid AS handlerUid`,
    )
      .map((r) => ({ route: r.route as string, handler: this.getNode(r.handlerUid as string)! }))
      .filter((r) => r.handler !== null)
  }

  getToolHandlers(): { tool: string; handler: CodeNode }[] {
    return this.q(
      `MATCH (toolNode:CodeNode)-[:HANDLES_TOOL]->(h:CodeNode)
       RETURN toolNode.uid AS tool, h.uid AS handlerUid`,
    )
      .map((r) => ({ tool: r.tool as string, handler: this.getNode(r.handlerUid as string)! }))
      .filter((r) => r.handler !== null)
  }

  getQueryEdges(): CodeEdge[] {
    return this.getAllEdges('QUERIES')
  }

  // ─── Community Readers ────────────────────────────────────────────────────────

  getCommunity(id: string): Community | null {
    const rows = this.q(
      `MATCH (c:Community {id: "${esc(id)}"}) RETURN c.id AS id, c.name AS name, c.keywords AS keywords, c.description AS description, c.cohesion AS cohesion LIMIT 1`,
    )
    return rows.length > 0 ? rowToCommunity(rows[0]) : null
  }

  getAllCommunities(): Community[] {
    return this.q(
      `MATCH (c:Community) RETURN c.id AS id, c.name AS name, c.keywords AS keywords, c.description AS description, c.cohesion AS cohesion ORDER BY c.cohesion DESC`,
    ).map(rowToCommunity)
  }

  // ─── Process Readers ─────────────────────────────────────────────────────────

  getAllProcesses(): Process[] {
    return this.q(
      `MATCH (p:Process) RETURN p.id AS id, p.name AS name, p.type AS type, p.entryPointUid AS entryPointUid, p.terminalUids AS terminalUids, p.communities AS communities`,
    ).map(rowToProcess)
  }

  getProcess(id: string): Process | null {
    const rows = this.q(
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
    const rows = this.q(
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
    return this.q(
      `MATCH (n:CodeNode) WHERE n.filePath CONTAINS "${esc(query)}" RETURN DISTINCT n.filePath AS filePath LIMIT ${limit}`,
    ).map((r) => r.filePath as string)
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  getStats(): RepoStats {
    const nodes = this.q(`MATCH (n:CodeNode) RETURN count(n) AS cnt`)
    const edges = this.q(`MATCH ()-[r]->() RETURN count(r) AS cnt`)
    const files = this.q(`MATCH (n:CodeNode) RETURN count(DISTINCT n.filePath) AS cnt`)
    const comms = this.q(`MATCH (c:Community) RETURN count(c) AS cnt`)
    const procs = this.q(`MATCH (p:Process) RETURN count(p) AS cnt`)
    const embs = this.q(`MATCH (n:CodeNode) WHERE n.embedding IS NOT NULL RETURN count(n) AS cnt`)

    return {
      files: Number(files[0]?.cnt ?? 0),
      nodes: Number(nodes[0]?.cnt ?? 0),
      edges: Number(edges[0]?.cnt ?? 0),
      communities: Number(comms[0]?.cnt ?? 0),
      processes: Number(procs[0]?.cnt ?? 0),
      hasEmbeddings: Number(embs[0]?.cnt ?? 0) > 0,
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
    const byType: Record<string, number> = {}
    for (const r of this.q(`MATCH (n:CodeNode) RETURN n.type AS type, count(n) AS cnt`)) {
      byType[r.type as string] = Number(r.cnt)
    }
    const byEdgeType: Record<string, number> = {}
    for (const r of this.q(`MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS cnt`)) {
      byEdgeType[r.type as string] = Number(r.cnt)
    }
    return { ...stats, byType, byEdgeType }
  }

  // ─── Meta ───────────────────────────────────────────────────────────────────

  setMeta(key: string, value: string): void {
    try {
      const result = this.conn.querySync(
        `MERGE (m:CodeNode {uid: "META:${esc(key)}", type: "meta", name: "${esc(key)}", filePath: "", line: 0, endLine: 0}) SET m.signature = "${esc(value)}"`,
      )
      void unwrapResult(result)
    } catch {
      /* */
    }
  }

  getMeta(key: string): string | null {
    const rows = this.q(
      `MATCH (m:CodeNode {uid: "META:${esc(key)}"}) RETURN m.signature AS value LIMIT 1`,
    )
    return rows.length > 0 ? (rows[0].value as string) : null
  }

  upsertEmbeddingsBatch(uids: string[], embeddings: number[][]): void {
    for (let i = 0; i < uids.length; i++) {
      try {
        const r = this.conn.querySync(
          `MATCH (n:CodeNode {uid: "${esc(uids[i])}"}) SET n.embedding = "${esc(JSON.stringify(embeddings[i]))}"`,
        )
        void unwrapResult(r)
      } catch {
        /* */
      }
    }
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
        `MERGE (reg:RepoRegistry {name: "${esc(repo.name)}"})
         SET reg.path = "${esc(repo.path)}", reg.dbPath = "${esc(repo.dbPath)}",
             reg.indexedAt = "${esc(repo.indexedAt)}", reg.lastCommit = "${esc(repo.lastCommit)}",
             reg.stats = "${esc(JSON.stringify(repo.stats))}", reg.language = "${esc(repo.language)}"`,
      )
      void unwrapResult(r)
    } catch {
      /* */
    }
  }

  listRepos(): { name: string; path: string; indexedAt: string; stats: RepoStats }[] {
    return this.q(
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
