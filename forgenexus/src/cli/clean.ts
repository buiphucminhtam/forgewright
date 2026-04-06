/**
 * clean subcommand — remove index from a codebase.
 */

import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { nexusDataDir, LEGACY_INDEX_SUBDIR } from '../paths.js'

export function clean(opts: { repoPath: string }): void {
  const { repoPath } = opts
  const nexusDir = nexusDataDir(repoPath)
  const legacyDir = join(repoPath, LEGACY_INDEX_SUBDIR)
  const dbPath = join(nexusDir, 'codebase.db')

  if (existsSync(dbPath)) {
    rmSync(dbPath, { force: true })
    console.error(`[ForgeNexus] Removed: ${dbPath}`)
  }

  if (existsSync(nexusDir)) {
    rmSync(nexusDir, { recursive: true, force: true })
    console.error(`[ForgeNexus] Removed directory: ${nexusDir}`)
  }

  if (existsSync(legacyDir)) {
    rmSync(legacyDir, { recursive: true, force: true })
    console.error(`[ForgeNexus] Removed legacy directory: ${legacyDir}`)
  }

  console.error('[ForgeNexus] Clean complete.')
}
