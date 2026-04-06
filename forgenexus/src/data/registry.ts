/**
 * Global repository registry — tracks all indexed repos.
 * Stored in {forgewright_root}/.forgenexus/registry.kuzu
 *
 * Migration from SQLite: uses KuzuDB with RepoRegistry node table.
 */

import { Database, Connection } from 'kuzu'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { KUZU_SCHEMA } from './schema.js'
import type { RepoMeta } from '../types.js'
import { ensureNexusDataDirMigrated, nexusDataDir } from '../paths.js'

function esc(s: string): string {
  return String(s ?? '').replace(/"/g, '\\"')
}

/** Unwrap querySync result (single or multiple) to a single QueryResult */
function unwrapResult(result: any): any {
  return Array.isArray(result) ? result[0] : result
}

// Find the forgewright root (parent of forgenexus/)
function findForgewrightRoot(): string {
  const envRoot = process.env.FORGEWRIGHT_ROOT
  if (envRoot && existsSync(envRoot)) return envRoot

  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'skills')) && existsSync(join(dir, 'forgenexus'))) {
      return dir
    }
    dir = join(dir, '..')
  }

  return process.cwd()
}

function initSchema(c: InstanceType<typeof Connection>): void {
  const stmts = KUZU_SCHEMA.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('LOAD EXTENSION'))
  for (const stmt of stmts) {
    try {
      c.querySync(stmt)
    } catch {
      /* exists */
    }
  }
}

export class Registry {
  private conn: InstanceType<typeof Connection>
  readonly root: string
  readonly dbPath: string

  constructor() {
    this.root = findForgewrightRoot()
    ensureNexusDataDirMigrated(this.root)
    const nexusDir = nexusDataDir(this.root)
    if (!existsSync(nexusDir)) {
      mkdirSync(nexusDir, { recursive: true })
    }
    this.dbPath = join(nexusDir, 'registry.kuzu')
    const db = new Database(this.dbPath)
    this.conn = new Connection(db)
    initSchema(this.conn)
    this.migrateLegacyDbPathsInRegistry()
  }

  /** Normalize rows that still point at pre-rename `.gitnexus/` paths. */
  private migrateLegacyDbPathsInRegistry(): void {
    try {
      this.conn.querySync(
        `MATCH (r:RepoRegistry) WHERE r.dbPath CONTAINS '/.gitnexus/'
         SET r.dbPath = replace(r.dbPath, '/.gitnexus/', '/.forgenexus/')`,
      )
    } catch {
      /* empty */
    }
  }

  register(repo: RepoMeta, dbPath: string): void {
    try {
      this.conn.querySync(
        `MERGE (r:RepoRegistry {name: "${esc(repo.name)}"})
         SET r.path = "${esc(repo.path)}", r.dbPath = "${esc(dbPath)}",
             r.indexedAt = "${esc(repo.indexedAt)}", r.lastCommit = "${esc(repo.lastCommit ?? '')}",
             r.stats = "${esc(JSON.stringify(repo.stats))}", r.language = "${esc(repo.language ?? 'unknown')}"`,
      )
    } catch {
      /* */
    }
  }

  unregister(name: string): void {
    try {
      this.conn.querySync(`MATCH (r:RepoRegistry {name: "${esc(name)}"}) DETACH DELETE r`)
    } catch {
      /* */
    }
  }

  list(): RepoMeta[] {
    try {
      const result = this.conn.querySync(
        `MATCH (r:RepoRegistry) RETURN r.name AS name, r.path AS path, r.dbPath AS dbPath,
                r.indexedAt AS indexedAt, r.lastCommit AS lastCommit, r.stats AS stats, r.language AS language`,
      )
      return unwrapResult(result)
        .getAllSync()
        .map((row: any) => ({
          name: row.name,
          path: row.path,
          indexedAt: row.indexedAt ?? '',
          lastCommit: row.lastCommit ?? '',
          stats: row.stats
            ? JSON.parse(row.stats)
            : { files: 0, nodes: 0, edges: 0, communities: 0, processes: 0, hasEmbeddings: false },
          language: row.language ?? 'unknown',
        }))
    } catch {
      return []
    }
  }

  get(name: string): RepoMeta | null {
    try {
      const result = this.conn.querySync(
        `MATCH (r:RepoRegistry {name: "${esc(name)}"}) RETURN r.name AS name, r.path AS path,
                r.indexedAt AS indexedAt, r.lastCommit AS lastCommit, r.stats AS stats, r.language AS language LIMIT 1`,
      )
      const rows = unwrapResult(result).getAllSync()
      if (rows.length === 0) return null
      const row = rows[0]
      return {
        name: row.name,
        path: row.path,
        indexedAt: row.indexedAt ?? '',
        lastCommit: row.lastCommit ?? '',
        stats: row.stats
          ? JSON.parse(row.stats)
          : { files: 0, nodes: 0, edges: 0, communities: 0, processes: 0, hasEmbeddings: false },
        language: row.language ?? 'unknown',
      }
    } catch {
      return null
    }
  }

  getByPath(repoPath: string): RepoMeta | null {
    try {
      const result = this.conn.querySync(
        `MATCH (r:RepoRegistry {path: "${esc(repoPath)}"}) RETURN r.name AS name, r.path AS path,
                r.indexedAt AS indexedAt, r.lastCommit AS lastCommit, r.stats AS stats, r.language AS language LIMIT 1`,
      )
      const rows = unwrapResult(result).getAllSync()
      if (rows.length === 0) return null
      const row = rows[0]
      return {
        name: row.name,
        path: row.path,
        indexedAt: row.indexedAt ?? '',
        lastCommit: row.lastCommit ?? '',
        stats: row.stats
          ? JSON.parse(row.stats)
          : { files: 0, nodes: 0, edges: 0, communities: 0, processes: 0, hasEmbeddings: false },
        language: row.language ?? 'unknown',
      }
    } catch {
      return null
    }
  }

  close(): void {
    try {
      this.conn.close()
      ;(this.conn as any)._db?.close?.()
    } catch {
      /* */
    }
  }
}

// ─── Multi-Repo Unified Graph ─────────────────────────────────────────────────────

/**
 * Unified graph that combines nodes from multiple indexed repositories.
 * Enables cross-repo queries and dependency analysis.
 */
export class UnifiedGraph {
  private connections: Map<string, InstanceType<typeof Connection>> = new Map()
  private dbs: Map<string, InstanceType<typeof Database>> = new Map()
  private maxConnections = 5

  addRepo(name: string, dbPath: string): void {
    if (!existsSync(dbPath)) {
      throw new Error(`Database not found: ${dbPath}`)
    }
    if (this.connections.size >= this.maxConnections) {
      const firstKey = this.connections.keys().next().value
      if (firstKey) {
        const c = this.connections.get(firstKey)
        if (c) {
          try {
            c.close()
          } catch {
            /* */
          }
          const d = this.dbs.get(firstKey)
          if (d) {
            try {
              d.close()
            } catch {
              /* */
            }
            this.dbs.delete(firstKey)
          }
        }
        this.connections.delete(firstKey)
      }
    }
    const db = new Database(dbPath)
    const c = new Connection(db)
    this.dbs.set(name, db)
    this.connections.set(name, c)
  }

  removeRepo(name: string): void {
    const c = this.connections.get(name)
    if (c) {
      try {
        c.close()
      } catch {
        /* */
      }
      this.connections.delete(name)
    }
    const d = this.dbs.get(name)
    if (d) {
      try {
        d.close()
      } catch {
        /* */
      }
      this.dbs.delete(name)
    }
  }

  listRepos(): string[] {
    return [...this.connections.keys()]
  }

  search(
    query: string,
    limit = 20,
  ): { repo: string; uid: string; name: string; filePath: string; type: string }[] {
    const results: {
      repo: string
      uid: string
      name: string
      filePath: string
      type: string
      rank: number
    }[] = []
    let globalRank = 0

    for (const [repoName, conn] of this.connections) {
      try {
        const rows = unwrapResult(
          conn.querySync(
            `MATCH (n:CodeNode) WHERE n.name CONTAINS "${esc(query)}" RETURN n.uid AS uid, n.name AS name, n.filePath AS filePath, n.type AS type LIMIT ${limit}`,
          ),
        ).getAllSync()

        for (const row of rows as any[]) {
          results.push({
            repo: repoName,
            uid: row.uid,
            name: row.name,
            filePath: row.filePath,
            type: row.type,
            rank: globalRank++,
          })
        }
      } catch {
        /* skip */
      }
    }

    return results
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
      .map(({ repo, uid, name, filePath, type }) => ({ repo, uid, name, filePath, type }))
  }

  close(): void {
    for (const c of this.connections.values()) {
      try {
        c.close()
      } catch {
        /* */
      }
    }
    this.connections.clear()
    for (const d of this.dbs.values()) {
      try {
        d.close()
      } catch {
        /* */
      }
    }
    this.dbs.clear()
  }
}
