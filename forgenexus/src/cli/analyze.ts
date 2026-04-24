/**
 * analyze subcommand — run the full indexing pipeline.
 */

import { existsSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import { execSync } from 'child_process'
import { Indexer } from '../analysis/indexer.js'
import { ForgeDB } from '../data/db.js'
import { ensureNexusDataDirMigrated, nexusDataDir, defaultCodebaseDbPath } from '../paths.js'
import { ProgressBar } from './progress.js'

export async function analyze(opts: {
  repoPath: string
  silent?: boolean
  repoName?: string
  includeEmbeddings?: boolean
  embeddingProvider?: string
  incremental?: boolean
  force?: boolean
}): Promise<void> {
  const {
    repoPath,
    silent = false,
    repoName,
    includeEmbeddings = false,
    embeddingProvider,
    incremental = true,
    force = false,
  } = opts

  // Use progress bar for non-silent mode
  const progressBar = silent ? null : new ProgressBar({ enabled: true })

  const log = silent
    ? () => {}
    : progressBar
    ? () => {} // Progress bar handles output
    : console.error.bind(console)

  const isGit = existsSync(join(repoPath, '.git'))
  ensureNexusDataDirMigrated(repoPath)
  const nexusDir = nexusDataDir(repoPath)
  mkdirSync(nexusDir, { recursive: true })
  const dbPath = defaultCodebaseDbPath(repoPath)

  // RC4 fix: always chdir to the target project root so that git operations,
  // file scanning, and relative paths resolve correctly.
  if (process.cwd() !== repoPath) {
    try {
      process.chdir(repoPath)
    } catch (e: any) {
      console.warn(`[ForgeNexus] Could not chdir to ${repoPath}: ${e.message}`)
    }
  }

  const indexer = new Indexer(repoPath, {
    repoPath,
    repoName: repoName ?? basename(repoPath),
    dbPath,
    includeEmbeddings,
  })

  // RC3 fix: reset DB before full re-index to avoid stale data accumulation
  if (force) {
    indexer.reset()
    log(`[ForgeNexus] Cleared existing index before full re-index.`)
  }

  if (embeddingProvider) {
    process.env.EMBEDDING_PROVIDER = embeddingProvider
  }

  const stats = await indexer.analyze(
    (phase, pct, message) => {
      if (progressBar) {
        progressBar.update(phase as any, pct, message)
        if (phase === 'complete') {
          progressBar.complete()
        }
      } else {
        const label = message ? ` ${message}` : ''
        log(`[${phase}] ${pct}%${label}`)
      }
    },
    incremental && !force,
  )

  indexer.close()

  // Register in local registry
  const db = new ForgeDB(dbPath)
  const lastCommit = isGit
    ? execSync('git rev-parse HEAD 2>/dev/null', { encoding: 'utf8' }).trim()
    : ''
  db.registerRepo({
    name: basename(repoPath),
    path: repoPath,
    dbPath,
    indexedAt: new Date().toISOString(),
    lastCommit,
    stats,
    language: 'typescript',
  })
  db.close()

  if (progressBar) {
    progressBar.complete()
  }

  // Show final stats after progress bar
  console.error(`[ForgeNexus] Done: ${stats.files} files, ${stats.nodes} nodes, ${stats.edges} edges`)
  console.error(`[ForgeNexus] Communities: ${stats.communities}, Processes: ${stats.processes}`)
  if (stats.hasEmbeddings) console.error(`[ForgeNexus] Embeddings: enabled`)
  if (stats.files > 0) console.error(`[ForgeNexus] Re-run with --force for full re-index`)
}
