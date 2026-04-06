/**
 * Global repository registry — tracks all indexed repos.
 * Stored in {forgewright_root}/.forgenexus/registry.db
 */

import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { RepoMeta } from '../types.js'
import { ensureNexusDataDirMigrated, nexusDataDir } from '../paths.js'

const REGISTRY_SCHEMA = `
CREATE TABLE IF NOT EXISTS registry (
  name TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  db_path TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  last_commit TEXT,
  stats TEXT NOT NULL,
  language TEXT DEFAULT 'unknown'
);
`.trim()

// Find the forgewright root (parent of forgenexus/)
function findForgewrightRoot(): string {
  // Try environment variable first
  const envRoot = process.env.FORGEWRIGHT_ROOT
  if (envRoot && existsSync(envRoot)) return envRoot

  // Walk up from this file
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'skills')) && existsSync(join(dir, 'forgenexus'))) {
      return dir
    }
    dir = join(dir, '..')
  }

  // Fall back to cwd
  return process.cwd()
}

export class Registry {
  private db: Database.Database
  readonly root: string
  readonly dbPath: string

  constructor() {
    this.root = findForgewrightRoot()
    ensureNexusDataDirMigrated(this.root)
    const nexusDir = nexusDataDir(this.root)
    if (!existsSync(nexusDir)) {
      mkdirSync(nexusDir, { recursive: true })
    }
    this.dbPath = join(nexusDir, 'registry.db')
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(REGISTRY_SCHEMA)
    this.migrateLegacyDbPathsInRegistry()
  }

  /** Normalize rows that still point at pre-rename `.gitnexus/` paths. */
  private migrateLegacyDbPathsInRegistry(): void {
    try {
      this.db
        .prepare(
          `UPDATE registry SET db_path = REPLACE(db_path, '/.gitnexus/', '/.forgenexus/')
           WHERE db_path LIKE '%/.gitnexus/%'`,
        )
        .run()
    } catch {
      /* empty */
    }
  }

  register(repo: RepoMeta, dbPath: string): void {
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
        dbPath,
        indexedAt: repo.indexedAt,
        lastCommit: repo.lastCommit,
        stats: JSON.stringify(repo.stats),
        language: repo.language ?? 'unknown',
      })
  }

  unregister(name: string): void {
    this.db.prepare('DELETE FROM registry WHERE name = ?').run(name)
  }

  list(): RepoMeta[] {
    const rows = this.db.prepare('SELECT * FROM registry ORDER BY indexed_at DESC').all() as any[]
    return rows.map((r) => ({
      name: r.name,
      path: r.path,
      indexedAt: r.indexed_at,
      lastCommit: r.last_commit ?? '',
      stats: JSON.parse(r.stats),
      language: r.language,
    }))
  }

  get(name: string): RepoMeta | null {
    const row = this.db.prepare('SELECT * FROM registry WHERE name = ?').get(name) as any
    if (!row) return null
    return {
      name: row.name,
      path: row.path,
      indexedAt: row.indexed_at,
      lastCommit: row.last_commit ?? '',
      stats: JSON.parse(row.stats),
      language: row.language,
    }
  }

  getByPath(repoPath: string): RepoMeta | null {
    const row = this.db.prepare('SELECT * FROM registry WHERE path = ?').get(repoPath) as any
    if (!row) return null
    return {
      name: row.name,
      path: row.path,
      indexedAt: row.indexed_at,
      lastCommit: row.last_commit ?? '',
      stats: JSON.parse(row.stats),
      language: row.language,
    }
  }

  close(): void {
    this.db.close()
  }
}

// ─── Multi-Repo Unified Graph ─────────────────────────────────────────────────────

/**
 * Unified graph that combines nodes from multiple indexed repositories.
 * Enables cross-repo queries and dependency analysis.
 *
 * Usage:
 *   const unified = new UnifiedGraph();
 *   unified.addRepo('my-app', '/path/to/my-app/.forgenexus/codebase.db');
 *   unified.addRepo('shared-lib', '/path/to/shared-lib/.forgenexus/codebase.db');
 *   unified.query('auth middleware'); // searches across both repos
 */
export class UnifiedGraph {
  private connections: Map<string, Database.Database> = new Map()
  private maxConnections = 5

  addRepo(name: string, dbPath: string): void {
    if (!existsSync(dbPath)) {
      throw new Error(`Database not found: ${dbPath}`)
    }
    if (this.connections.size >= this.maxConnections) {
      // Evict oldest connection
      const firstKey = this.connections.keys().next().value
      if (firstKey) {
        this.connections.get(firstKey)?.close()
        this.connections.delete(firstKey)
      }
    }
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    this.connections.set(name, db)
  }

  removeRepo(name: string): void {
    const db = this.connections.get(name)
    if (db) {
      db.close()
      this.connections.delete(name)
    }
  }

  listRepos(): string[] {
    return [...this.connections.keys()]
  }

  /**
   * Search across all indexed repos using hybrid search (BM25 + semantic).
   */
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

    for (const [repoName, db] of this.connections) {
      const ftsRows = db
        .prepare(
          `
        SELECT uid, name, file_path, type FROM fts_symbols
        WHERE fts_symbols MATCH ?
        LIMIT ?
      `,
        )
        .all(query, limit) as any[]

      for (const row of ftsRows) {
        results.push({
          repo: repoName,
          uid: row.uid,
          name: row.name,
          filePath: row.file_path,
          type: row.type,
          rank: globalRank++,
        })
      }
    }

    return results
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
      .map(({ repo, uid, name, filePath, type }) => ({ repo, uid, name, filePath, type }))
  }

  /**
   * Get cross-repo IMPORTS edges between different repos.
   */
  getCrossRepoImports(): { fromRepo: string; fromUid: string; toRepo: string; toUid: string }[] {
    const results: { fromRepo: string; fromUid: string; toRepo: string; toUid: string }[] = []

    for (const [fromRepo, fromDb] of this.connections) {
      const importEdges = fromDb
        .prepare(
          "SELECT from_uid, to_uid FROM edges WHERE type = 'IMPORTS' AND to_uid LIKE 'IMPORT:%'",
        )
        .all() as any[]

      for (const edge of importEdges) {
        // Try to resolve external imports to other indexed repos
        const importTarget = edge.to_uid.replace('IMPORT:', '').split(':')[0]
        for (const [toRepo, toDb] of this.connections) {
          if (fromRepo === toRepo) continue
          const resolved = toDb
            .prepare('SELECT uid FROM nodes WHERE file_path LIKE ? LIMIT 1')
            .get(`%${importTarget}%`) as any
          if (resolved) {
            results.push({
              fromRepo,
              fromUid: edge.from_uid,
              toRepo,
              toUid: resolved.uid,
            })
          }
        }
      }
    }

    return results
  }

  /**
   * Get all communities across all indexed repos.
   */
  getAllCommunities(): {
    repo: string
    communities: { id: string; name: string; cohesion: number; count: number }[]
  }[] {
    const results: {
      repo: string
      communities: { id: string; name: string; cohesion: number; count: number }[]
    }[] = []

    for (const [repoName, db] of this.connections) {
      const rows = db
        .prepare('SELECT id, name, cohesion FROM communities ORDER BY cohesion DESC')
        .all() as any[]
      results.push({
        repo: repoName,
        communities: rows.map((r) => ({
          id: r.id,
          name: r.name,
          cohesion: r.cohesion,
          count: 0,
        })),
      })
    }

    return results
  }

  close(): void {
    for (const db of this.connections.values()) {
      db.close()
    }
    this.connections.clear()
  }
}
