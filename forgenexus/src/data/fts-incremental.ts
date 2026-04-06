/**
 * Incremental FTS — update only changed nodes instead of full rebuild.
 *
 * Instead of dropping and recreating FTS tables on every analyze run,
 * we insert/update/delete only the affected nodes.
 */

import type { ForgeDB } from './db.js'

/**
 * Incrementally update FTS index for changed nodes.
 * Uses FTS5 'rebuild' command on a subset of rows for efficiency.
 *
 * Strategy:
 * - Delete FTS entries for removed/changed nodes
 * - Insert FTS entries for new/changed nodes
 * - Only rebuild if more than 50% of symbols changed (fallback to full rebuild)
 */
export function incrementalFTSUpdate(
  db: ForgeDB,
  changedNodeUids: Set<string>,
  totalNodes: number,
): void {
  if (totalNodes === 0) return

  // If too many changed, fall back to full rebuild
  if (changedNodeUids.size > totalNodes * 0.5) {
    db.rebuildFTS()
    return
  }

  // Step 1: Delete old entries for changed nodes
  if (changedNodeUids.size > 0) {
    const placeholders = [...changedNodeUids].map(() => '?').join(', ')
    try {
      const sqlite = (db as any).db
      sqlite
        .prepare(`DELETE FROM fts_symbols WHERE uid IN (${placeholders})`)
        .run(...[...changedNodeUids])
    } catch {
      // Table might not exist yet
    }
  }

  // Step 2: Insert new entries for changed nodes
  const changedNodes = (db as any).db
    .prepare(
      `SELECT uid, name, file_path, type FROM nodes WHERE uid IN (${[...changedNodeUids].map(() => '?').join(',')})`,
    )
    .all(...[...changedNodeUids]) as any[]

  if (changedNodes.length > 0) {
    // Ensure FTS table exists
    ensureFTSSchema(db)

    const insertFTS = (db as any).db.prepare(
      'INSERT INTO fts_symbols(uid, name, file_path, type) VALUES (?, ?, ?, ?)',
    )

    const insert = (db as any).db.transaction((rows: any[]) => {
      for (const n of rows) {
        insertFTS.run(n.uid, n.name, n.file_path, n.type)
      }
    })

    try {
      insert(changedNodes)
    } catch (err) {
      // If incremental insert fails (e.g., schema mismatch), fall back to full rebuild
      db.rebuildFTS()
    }
  }
}

/**
 * Ensure FTS virtual tables exist.
 */
function ensureFTSSchema(db: ForgeDB): void {
  try {
    const sqlite = (db as any).db
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_symbols USING fts5(
        uid UNINDEXED, name, file_path, type,
        tokenize='porter unicode61'
      )
    `)
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_files USING fts5(
        file_path,
        tokenize='porter unicode61'
      )
    `)
  } catch {
    // Tables may already exist
  }
}

/**
 * Rebuild FTS incrementally: add missing entries.
 * Call this after new nodes are inserted.
 */
export function ftsAddMissing(db: ForgeDB): void {
  try {
    // Find nodes missing from FTS index
    const missing = (db as any).db
      .prepare(
        `
      SELECT n.uid, n.name, n.file_path, n.type
      FROM nodes n
      LEFT JOIN fts_symbols f ON n.uid = f.uid
      WHERE f.uid IS NULL
      LIMIT 10000
    `,
      )
      .all() as any[]

    if (missing.length === 0) return

    ensureFTSSchema(db)

    const insertFTS = (db as any).db.prepare(
      'INSERT INTO fts_symbols(uid, name, file_path, type) VALUES (?, ?, ?, ?)',
    )

    const insert = (db as any).db.transaction((rows: any[]) => {
      for (const n of rows) {
        try {
          insertFTS.run(n.uid, n.name, n.file_path, n.type)
        } catch {
          // Skip duplicates
        }
      }
    })

    insert(missing)
  } catch {
    // FTS table doesn't exist — full rebuild needed
    db.rebuildFTS()
  }
}
