/**
 * status subcommand — check index freshness and stats.
 *
 * Uses ForgeDB (KuzuDB) directly so it works even while the MCP
 * server is running (no SQLite file-lock issues).
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { ensureNexusDataDirMigrated, nexusDataDir, defaultCodebaseDbPath } from '../paths.js'
import { ForgeDB } from '../data/db.js'

export function status(opts: { repoPath: string }): void {
  const { repoPath } = opts
  ensureNexusDataDirMigrated(repoPath)
  const nexusDir = nexusDataDir(repoPath)
  const dbPath = defaultCodebaseDbPath(repoPath)

  if (!existsSync(dbPath)) {
    console.error(`[ForgeNexus] No index found at ${nexusDir}. Run 'forgenexus analyze' first.`)
    return
  }

  // Detect format before opening
  try {
    const header = require('fs').readFileSync(dbPath)
    if (header.length >= 16 && !header.slice(0, 16).toString('utf8').startsWith('SQLite')) {
      // KuzuDB — proceed
    } else {
      // SQLite — show legacy message
      runLegacyStatus(repoPath, dbPath)
      return
    }
  } catch {
    // Assume KuzuDB
  }

  let db: ForgeDB | null = null
  try {
    db = new ForgeDB(dbPath)

    const isGit = existsSync(join(repoPath, '.git'))
    const lastCommit = db.getMeta('last_commit') ?? ''
    const indexedAt = db.getMeta('indexed_at') ?? ''

    let stale = false
    let lastCommitTime = ''
    if (isGit && lastCommit) {
      try {
        const currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
        stale = currentCommit !== lastCommit
        try {
          lastCommitTime = execSync(`git log -1 --format='%ci' ${lastCommit}`, {
            encoding: 'utf8',
          }).trim()
        } catch {
          /* ok */
        }
      } catch {
        stale = false
      }
    }

    const stats = db.getStats()
    const detailed = db.getDetailedStats()

    console.log(`# ForgeNexus Status — ${repoPath}`)
    console.log('')
    console.log(`  Indexed:  ${indexedAt || 'unknown'}`)
    console.log(
      `  Commit:   ${lastCommit || 'none'} ${lastCommitTime ? `(${lastCommitTime})` : ''}`,
    )
    if (isGit) {
      console.log(`  Stale:    ${stale ? '⚠ YES — re-index recommended' : '✅ up to date'}`)
    }
    console.log('')
    console.log('## Stats')
    console.log(`  Files:       ${stats.files.toLocaleString()}`)
    console.log(`  Nodes:       ${stats.nodes.toLocaleString()}`)
    console.log(`  Edges:       ${stats.edges.toLocaleString()}`)
    console.log(`  Communities: ${stats.communities.toLocaleString()}`)
    console.log(`  Processes:   ${stats.processes.toLocaleString()}`)
    console.log('')

    // Node type breakdown
    const nodeTypes = Object.entries(detailed.byType).filter(([t]) => {
      // Only show true node types (not edge rel_type values)
      return !['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'HAS_METHOD', 'HAS_PROPERTY',
        'ACCESSES', 'OVERRIDES', 'MEMBER_OF', 'STEP_IN_PROCESS', 'HANDLES_ROUTE',
        'HANDLES_TOOL', 'QUERIES', 'FETCHES', 'CONTAINS', 'DEFINES', 'META',
      ].includes(t)
    })
    if (nodeTypes.length > 0) {
      console.log('## Node Types')
      for (const [type, count] of nodeTypes.sort((a, b) => b[1] - a[1])) {
        const bar = '█'.repeat(Math.min(50, Math.ceil((count / stats.nodes) * 50)))
        console.log(`  ${type.padEnd(18)} ${count.toLocaleString().padStart(8)} ${bar}`)
      }
      console.log('')
    }

    // Edge type breakdown
    if (Object.keys(detailed.byEdgeType).length > 0) {
      console.log('## Edge Types')
      for (const [type, count] of Object.entries(detailed.byEdgeType).sort((a, b) => b[1] - a[1])) {
        const bar = '█'.repeat(Math.min(50, Math.ceil((count / stats.edges) * 50)))
        console.log(`  ${type.padEnd(18)} ${count.toLocaleString().padStart(8)} ${bar}`)
      }
      console.log('')
    }

    // Warn if stats are all zero — likely a lock conflict
    if (stats.files === 0 && stats.nodes === 0 && stats.edges === 0) {
      if (db.hasLockError) {
        console.error(
          `[ForgeNexus] ⚠️  Stats are all 0 — MCP server is likely holding the lock.\n` +
          `         Stop the MCP server, then re-run: forgenexus status`,
        )
      } else {
        console.warn(`[ForgeNexus] Stats are all 0 — index may be empty or corrupted.`)
      }
    }

    console.log(`Index location: ${dbPath}`)
  } catch (e: any) {
    console.error(`[ForgeNexus] Could not read status: ${e.message}`)
  } finally {
    db?.close()
  }
}

function runLegacyStatus(repoPath: string, dbPath: string): void {
  try {
    const isGit = existsSync(join(repoPath, '.git'))

    let stale = false
    let lastCommit = ''
    let indexedAt = ''
    let lastCommitTime = ''

    try {
      indexedAt = execSync(`sqlite3 "${dbPath}" "SELECT value FROM meta WHERE key='indexed_at'"`, {
        encoding: 'utf8',
      }).trim()

      lastCommit = execSync(
        `sqlite3 "${dbPath}" "SELECT value FROM meta WHERE key='last_commit'"`,
        { encoding: 'utf8' },
      ).trim()

      if (isGit && lastCommit) {
        const currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
        stale = currentCommit !== lastCommit

        try {
          lastCommitTime = execSync(`git log -1 --format='%ci' ${lastCommit}`, {
            encoding: 'utf8',
          }).trim()
        } catch {
          /* ok */
        }
      }
    } catch (e) {
      console.error(`[ForgeNexus] Legacy index detected but sqlite3 CLI not available.`)
      console.error(`[ForgeNexus] Run 'forgenexus analyze --force' to rebuild the index.`)
      return
    }

    let files = 0,
      nodes = 0,
      edges = 0,
      communities = 0,
      processes = 0
    try {
      files =
        parseInt(
          execSync(`sqlite3 "${dbPath}" "SELECT COUNT(DISTINCT file_path) FROM nodes"`, {
            encoding: 'utf8',
          }).trim(),
        ) || 0
      nodes =
        parseInt(
          execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM nodes"`, { encoding: 'utf8' }).trim(),
        ) || 0
      edges =
        parseInt(
          execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM edges"`, { encoding: 'utf8' }).trim(),
        ) || 0
      communities =
        parseInt(
          execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM communities"`, {
            encoding: 'utf8',
          }).trim(),
        ) || 0
      processes =
        parseInt(
          execSync(`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM processes"`, {
            encoding: 'utf8',
          }).trim(),
        ) || 0
    } catch {
      /* ok */
    }

    console.log(`# ForgeNexus Status — ${repoPath}`)
    console.log('')
    console.log(`  Indexed:  ${indexedAt || 'unknown'}`)
    console.log(
      `  Commit:   ${lastCommit || 'none'} ${lastCommitTime ? `(${lastCommitTime})` : ''}`,
    )
    if (isGit) {
      console.log(`  Stale:    ${stale ? '⚠ YES — re-index recommended' : '✅ up to date'}`)
    }
    console.log('')
    console.log('## Stats')
    console.log(`  Files:       ${files.toLocaleString()}`)
    console.log(`  Nodes:       ${nodes.toLocaleString()}`)
    console.log(`  Edges:       ${edges.toLocaleString()}`)
    console.log(`  Communities: ${communities.toLocaleString()}`)
    console.log(`  Processes:   ${processes.toLocaleString()}`)
    console.log('')
    console.log(`  ⚠ Legacy SQLite index — run 'forgenexus analyze --force' to migrate to KuzuDB`)
    console.log(`Index location: ${dbPath}`)
  } catch (e) {
    console.error(`[ForgeNexus] Could not read status: ${e}`)
  }
}
