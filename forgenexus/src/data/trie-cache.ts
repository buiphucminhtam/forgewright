/**
 * Persistent Trie Cache for Import Path Resolution.
 *
 * Caches the suffix trie index to avoid rebuilding on each run.
 * Simple file-based caching with hash validation.
 */

import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { nexusDataDir } from '../paths.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SuffixIndex {
  trie: Map<string, SuffixIndex | true>
  count: number
}

interface TrieCacheData {
  version: number
  paths: string[]
  trie: Record<string, unknown>
  hash: string
  builtAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_VERSION = 1
const CACHE_DIR = 'cache/trie'
const CACHE_FILE = 'trie.json'

// ─── Cache Functions ─────────────────────────────────────────────────────────

function ensureCacheDir(repoPath: string): string {
  const cachePath = join(nexusDataDir(repoPath), CACHE_DIR)
  if (!existsSync(cachePath)) {
    mkdirSync(cachePath, { recursive: true })
  }
  return cachePath
}

function computeHash(paths: string[]): string {
  return createHash('sha256')
    .update(paths.sort().join('\n'))
    .digest('hex')
}

function mapToRecord(map: Map<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [key, value] of map) {
    obj[key] = value instanceof Map ? mapToRecord(value) : value
  }
  return obj
}

function recordToMap(record: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>()
  for (const [key, value] of Object.entries(record)) {
    map.set(key, typeof value === 'object' && value !== null
      ? recordToMap(value as Record<string, unknown>)
      : value)
  }
  return map
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Load cached trie index.
 * Returns null if cache miss, stale, or corrupt.
 */
export function loadTrieCache(repoPath: string, currentPaths: string[]): SuffixIndex | null {
  const cachePath = join(ensureCacheDir(repoPath), CACHE_FILE)

  if (!existsSync(cachePath)) {
    return null
  }

  try {
    const raw = readFileSync(cachePath, 'utf8')
    const data: TrieCacheData = JSON.parse(raw)

    // Validate version
    if (data.version !== CACHE_VERSION) {
      console.log('[TrieCache] Version mismatch')
      return null
    }

    // Validate paths
    const currentHash = computeHash(currentPaths)
    if (data.hash !== currentHash) {
      console.log('[TrieCache] Paths changed')
      return null
    }

    // Convert back to Map format
    const trieRecord = data.trie as Record<string, unknown>
    const trie = recordToMap(trieRecord) as unknown as SuffixIndex

    console.log(`[TrieCache] Loaded (${data.paths.length} paths)`)
    return trie
  } catch (e) {
    console.warn('[TrieCache] Load failed:', e)
    return null
  }
}

/**
 * Save trie index to cache.
 */
export function saveTrieCache(repoPath: string, paths: string[], trie: SuffixIndex): void {
  const cachePath = join(ensureCacheDir(repoPath), CACHE_FILE)

  const data: TrieCacheData = {
    version: CACHE_VERSION,
    paths,
    trie: mapToRecord(trie as unknown as Map<string, unknown>),
    hash: computeHash(paths),
    builtAt: new Date().toISOString(),
  }

  writeFileSync(cachePath, JSON.stringify(data))
  console.log(`[TrieCache] Saved (${paths.length} paths)`)
}

/**
 * Clear trie cache.
 */
export function clearTrieCache(repoPath: string): void {
  const cachePath = join(ensureCacheDir(repoPath), CACHE_FILE)
  if (existsSync(cachePath)) {
    const { unlinkSync } = require('fs')
    unlinkSync(cachePath)
    console.log('[TrieCache] Cleared')
  }
}
