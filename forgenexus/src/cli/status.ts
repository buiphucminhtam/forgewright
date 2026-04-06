/**
 * status subcommand — check index freshness and stats.
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { ensureNexusDataDirMigrated, nexusDataDir, defaultCodebaseDbPath } from '../paths.js'

export function status(opts: { repoPath: string }): void {
  const { repoPath } = opts
  ensureNexusDataDirMigrated(repoPath)
  const nexusDir = nexusDataDir(repoPath)
  const dbPath = defaultCodebaseDbPath(repoPath)

  if (!existsSync(dbPath)) {
    console.error(`[ForgeNexus] No index found at ${nexusDir}. Run 'forgenexus analyze' first.`)
    return
  }

  // Dynamic import to avoid circular deps
  import(join(repoPath, 'node_modules', 'better-sqlite3') || 'better-sqlite3').catch(() => {
    // Fallback: use exec to read SQLite
    runStatusFallback(repoPath, dbPath)
  })
}

function runStatusFallback(repoPath: string, dbPath: string): void {
  try {
    // Read meta table using sqlite3 CLI
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
      console.error(`[ForgeNexus] Could not read index: ${e}`)
      return
    }

    // Get counts
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

    // Edge type breakdown
    const edgeTypes: Record<string, number> = {}
    try {
      const raw = execSync(
        `sqlite3 "${dbPath}" "SELECT type, COUNT(*) FROM edges GROUP BY type ORDER BY COUNT(*) DESC"`,
        { encoding: 'utf8' },
      ).trim()
      for (const line of raw.split('\n')) {
        const [type, count] = line.split('|')
        if (type && count) edgeTypes[type.trim()] = parseInt(count.trim())
      }
    } catch {
      /* ok */
    }

    if (Object.keys(edgeTypes).length > 0) {
      console.log('## Edge Types')
      for (const [type, count] of Object.entries(edgeTypes)) {
        const bar = '█'.repeat(Math.min(50, Math.ceil((count / edges) * 50)))
        console.log(`  ${type.padEnd(18)} ${count.toLocaleString().padStart(8)} ${bar}`)
      }
      console.log('')
    }

    console.log(`Index location: ${dbPath}`)
  } catch (e) {
    console.error(`[ForgeNexus] Could not read status: ${e}`)
  }
}
