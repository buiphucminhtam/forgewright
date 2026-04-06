/**
 * Canonical on-disk layout for ForgeNexus index data.
 * Older installs used a different hidden folder name; it is renamed on first access.
 */

import { existsSync, renameSync } from 'fs'
import { join } from 'path'

/** Directory under each repo root holding codebase.db (and related artifacts). */
export const FORGENEXUS_DIR = '.forgenexus'

/** @internal Pre-rename index folder (migrated automatically). */
export const LEGACY_INDEX_SUBDIR = '.gitnexus'

export function nexusDataDir(repoRoot: string): string {
  return join(repoRoot, FORGENEXUS_DIR)
}

export function defaultCodebaseDbPath(repoRoot: string): string {
  return join(nexusDataDir(repoRoot), 'codebase.db')
}

/**
 * If only the legacy folder exists, rename it to {@link FORGENEXUS_DIR} so
 * existing indexes are kept.
 */
export function ensureNexusDataDirMigrated(repoRoot: string): void {
  const next = join(repoRoot, FORGENEXUS_DIR)
  const prev = join(repoRoot, LEGACY_INDEX_SUBDIR)
  if (!existsSync(next) && existsSync(prev)) {
    renameSync(prev, next)
    console.error(
      `[ForgeNexus] Migrated index folder ${LEGACY_INDEX_SUBDIR}/ → ${FORGENEXUS_DIR}/ — use CLI and MCP names "forgenexus" only.`,
    )
  }
}
