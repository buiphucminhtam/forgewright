/**
 * AST Cache — Persistent cache for parsed code analysis results.
 *
 * Caches extracted CodeNode[] and CodeEdge[] results to avoid re-parsing
 * unchanged files. Uses content hash for invalidation.
 *
 * Schema:
 *   .forgenexus/cache/ast/
 *   ├── manifest.json          # Cache metadata, version, stats
 *   └── {sanitized_path}.json # Per-file cache entries
 *
 * Cache Entry Format (v1):
 *   {
 *     "version": 1,
 *     "filePath": "src/utils/helper.ts",
 *     "contentHash": "sha256:abc123...",
 *     "language": "typescript",
 *     "nodes": [...],   // CodeNode[]
 *     "edges": [...],   // CodeEdge[]
 *     "nodeCount": 42,
 *     "edgeCount": 128,
 *     "cachedAt": "2026-04-30T12:00:00.000Z",
 *     "parserVersion": "0.22.0"
 *   }
 */

import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync, readdirSync, rmdirSync } from 'fs'
import { join, dirname, relative, sep } from 'path'
import type { CodeNode, CodeEdge } from '../types.js'
import { nexusDataDir } from '../paths.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ASTCacheEntry {
  version: number
  filePath: string
  contentHash: string      // SHA-256 of file content
  contentChecksum: string  // CRC32 for fast integrity check
  language: string
  nodes: CodeNode[]
  edges: CodeEdge[]
  nodeCount: number
  edgeCount: number
  cachedAt: string         // ISO timestamp
  parserVersion: string    // tree-sitter version for cache invalidation
  sizeBytes: number       // Cache file size
}

export interface ASTCacheManifest {
  version: number
  createdAt: string
  lastUpdated: string
  fileCount: number
  totalSizeBytes: number
  entries: Record<string, {
    contentHash: string
    cachedAt: string
    nodeCount: number
    edgeCount: number
    sizeBytes?: number
  }>
}

export interface ASTCacheOptions {
  cacheDir?: string
  maxSizeBytes?: number   // Max cache size (default: 500MB)
  maxAgeMs?: number       // Max cache age (default: 30 days)
  enabled?: boolean       // Toggle cache (default: true)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_VERSION = 1
const DEFAULT_MAX_SIZE = 500 * 1024 * 1024 // 500MB
const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60 * 1000 // 30 days
const MANIFEST_NAME = 'manifest.json'

// ─── CRC32 Implementation (for fast integrity checks) ─────────────────────────

const CRC32_TABLE: number[] = []
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  }
  CRC32_TABLE[i] = c >>> 0
}

function computeCRC32(data: string): string {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data.charCodeAt(i)) & 0xff] ^ (crc >>> 8)
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}

// ─── Path Sanitization ───────────────────────────────────────────────────────

/**
 * Sanitize file path for use as cache filename.
 * Replaces path separators and special chars with underscores.
 */
function sanitizePath(filePath: string): string {
  return filePath
    .replace(/^[/\\]+/, '')           // Remove leading slashes
    .replace(/[<>:"|?*]/g, '_')        // Replace invalid filename chars
    .replace(/[\/\\]/g, '__')          // Replace path separators
}

// ─── AST Cache Class ─────────────────────────────────────────────────────────

export class ASTCache {
  private cacheDir: string
  private maxSizeBytes: number
  private maxAgeMs: number
  private enabled: boolean
  private manifest: ASTCacheManifest | null = null
  private parserVersion: string

  constructor(repoPath: string, options: ASTCacheOptions = {}) {
    this.cacheDir = options.cacheDir ?? join(nexusDataDir(repoPath), 'cache/ast')
    this.maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE
    this.enabled = options.enabled ?? true
    this.parserVersion = this.detectParserVersion()

    // Ensure cache directory exists on initialization
    this.ensureCacheDir()
  }

  private detectParserVersion(): string {
    try {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'node_modules/tree-sitter/package.json'), 'utf8'))
      return pkg.version ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  private getManifestPath(): string {
    return join(this.cacheDir, MANIFEST_NAME)
  }

  private getEntryPath(filePath: string): string {
    return join(this.cacheDir, sanitizePath(filePath) + '.json')
  }

  private loadManifest(): ASTCacheManifest {
    const manifestPath = this.getManifestPath()
    if (existsSync(manifestPath)) {
      try {
        return JSON.parse(readFileSync(manifestPath, 'utf8'))
      } catch {
        // Corrupt manifest, start fresh
      }
    }
    return {
      version: CACHE_VERSION,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      fileCount: 0,
      totalSizeBytes: 0,
      entries: {},
    }
  }

  private saveManifest(manifest: ASTCacheManifest): void {
    this.ensureCacheDir()
    writeFileSync(this.getManifestPath(), JSON.stringify(manifest, null, 2))
  }

  // ── Hash Computation ────────────────────────────────────────────────────────

  private computeHash(content: string): { sha256: string; crc32: string } {
    const sha256 = createHash('sha256').update(content).digest('hex')
    const crc32 = computeCRC32(content)
    return { sha256, crc32 }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Get cached analysis results for a file.
   * Returns null if cache miss, stale, or invalid.
   */
  get(filePath: string, content: string): ASTCacheEntry | null {
    if (!this.enabled) return null

    const entryPath = this.getEntryPath(filePath)
    if (!existsSync(entryPath)) return null

    try {
      const cached = JSON.parse(readFileSync(entryPath, 'utf8')) as ASTCacheEntry

      // Validate cache version
      if (cached.version !== CACHE_VERSION) return null

      // Validate parser version (tree-sitter updates may change AST structure)
      if (cached.parserVersion !== this.parserVersion) return null

      // Validate content hash
      const { sha256, crc32 } = this.computeHash(content)
      if (cached.contentHash !== sha256) return null

      // Validate checksum (fast integrity check)
      if (cached.contentChecksum !== crc32) return null

      // Validate age
      const age = Date.now() - new Date(cached.cachedAt).getTime()
      if (age > this.maxAgeMs) return null

      return cached
    } catch {
      // Corrupt cache entry
      return null
    }
  }

  /**
   * Peek at cache without reading file content.
   * Returns cache entry if valid, but DOES NOT validate content hash.
   * Caller must call get() with content to fully validate.
   */
  peek(filePath: string): { valid: boolean; entry: ASTCacheEntry | null; reason?: string } {
    if (!this.enabled) return { valid: false, entry: null, reason: 'disabled' }

    const entryPath = this.getEntryPath(filePath)
    if (!existsSync(entryPath)) return { valid: false, entry: null, reason: 'no entry' }

    try {
      const cached = JSON.parse(readFileSync(entryPath, 'utf8')) as ASTCacheEntry

      if (cached.version !== CACHE_VERSION) {
        return { valid: false, entry: null, reason: 'version mismatch' }
      }

      if (cached.parserVersion !== this.parserVersion) {
        return { valid: false, entry: null, reason: 'parser version changed' }
      }

      const age = Date.now() - new Date(cached.cachedAt).getTime()
      if (age > this.maxAgeMs) {
        return { valid: false, entry: null, reason: 'expired' }
      }

      // Cache entry looks valid, but we haven't validated content hash
      // Caller should call get() with actual content to confirm
      return { valid: true, entry: cached }
    } catch {
      return { valid: false, entry: null, reason: 'corrupt' }
    }
  }

  /**
   * Store analysis results in cache.
   */
  set(filePath: string, content: string, language: string, nodes: CodeNode[], edges: CodeEdge[]): void {
    if (!this.enabled) return

    this.ensureCacheDir()

    const { sha256, crc32 } = this.computeHash(content)
    const entryPath = this.getEntryPath(filePath)

    const entry: ASTCacheEntry = {
      version: CACHE_VERSION,
      filePath,
      contentHash: sha256,
      contentChecksum: crc32,
      language,
      nodes,
      edges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      cachedAt: new Date().toISOString(),
      parserVersion: this.parserVersion,
      sizeBytes: 0, // Will be updated after writing
    }

    // Write cache entry
    writeFileSync(entryPath, JSON.stringify(entry))

    // Update size after writing
    entry.sizeBytes = statSync(entryPath).size

    // Update manifest - reload to get accurate sizes
    this.manifest = this.loadManifest()

    // Subtract old entry size if re-caching
    const oldEntry = this.manifest.entries[filePath]
    if (oldEntry) {
      // Try to get old size from manifest or estimate
      this.manifest.totalSizeBytes -= oldEntry.sizeBytes ?? Math.round(entry.sizeBytes * 0.8)
    }

    this.manifest.lastUpdated = new Date().toISOString()
    this.manifest.fileCount = Object.keys(this.manifest.entries).length + 1
    this.manifest.entries[filePath] = {
      contentHash: sha256,
      cachedAt: entry.cachedAt,
      nodeCount: entry.nodeCount,
      edgeCount: entry.edgeCount,
      sizeBytes: entry.sizeBytes,
    }
    this.manifest.totalSizeBytes += entry.sizeBytes
    this.saveManifest(this.manifest)

    // Check if eviction needed
    this.evictIfNeeded()
  }

  /**
   * Invalidate cache for a specific file.
   */
  invalidate(filePath: string): void {
    const entryPath = this.getEntryPath(filePath)
    if (existsSync(entryPath)) {
      try {
        const entry = JSON.parse(readFileSync(entryPath, 'utf8')) as ASTCacheEntry

        // Update manifest
        this.manifest = this.loadManifest()
        if (this.manifest.entries[filePath]) {
          delete this.manifest.entries[filePath]
          this.manifest.totalSizeBytes -= entry.sizeBytes
          this.manifest.fileCount = Object.keys(this.manifest.entries).length
          this.saveManifest(this.manifest)
        }

        unlinkSync(entryPath)
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Clear entire cache.
   */
  clear(): void {
    if (!existsSync(this.cacheDir)) return

    try {
      const files = readdirSync(this.cacheDir)
      for (const file of files) {
        unlinkSync(join(this.cacheDir, file))
      }
      rmdirSync(this.cacheDir)
      this.manifest = null
    } catch {
      // Ignore errors
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): { fileCount: number; totalSizeBytes: number; maxSizeBytes: number; hitRate: number } {
    this.manifest = this.loadManifest()
    return {
      fileCount: this.manifest.fileCount,
      totalSizeBytes: this.manifest.totalSizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      hitRate: 0, // TODO: Track hits separately
    }
  }

  /**
   * Get cache directory path.
   */
  getCacheDir(): string {
    return this.cacheDir
  }

  // ── Eviction ────────────────────────────────────────────────────────────────

  /**
   * Evict old/large entries if cache exceeds max size.
   * Uses LRU-ish strategy: remove oldest entries first.
   */
  private evictIfNeeded(): void {
    this.manifest = this.loadManifest()

    // Check size limit
    if (this.manifest.totalSizeBytes <= this.maxSizeBytes) return

    // Sort entries by cachedAt (oldest first)
    const entries = Object.entries(this.manifest.entries)
      .map(([path, meta]) => ({ path, ...meta }))
      .sort((a, b) => a.cachedAt.localeCompare(b.cachedAt))

    // Remove oldest entries until under limit
    let removedSize = 0
    const targetRemoval = this.manifest.totalSizeBytes - (this.maxSizeBytes * 0.8) // Target 80% capacity

    for (const entry of entries) {
      if (removedSize >= targetRemoval) break

      const entryPath = this.getEntryPath(entry.path)
      if (existsSync(entryPath)) {
        try {
          const stat = statSync(entryPath)
          unlinkSync(entryPath)
          removedSize += stat.size
          delete this.manifest.entries[entry.path]
        } catch {
          // Ignore errors
        }
      }
    }

    // Update manifest
    this.manifest.totalSizeBytes -= removedSize
    this.manifest.fileCount = Object.keys(this.manifest.entries).length
    this.saveManifest(this.manifest)
  }

  // ── Batch Operations ────────────────────────────────────────────────────────

  /**
   * Get multiple cached entries at once.
   * Returns map of filePath -> cache entry (null if not cached).
   */
  mget(files: { filePath: string; content: string }[]): Map<string, ASTCacheEntry | null> {
    const results = new Map<string, ASTCacheEntry | null>()
    for (const { filePath, content } of files) {
      results.set(filePath, this.get(filePath, content))
    }
    return results
  }

  /**
   * Store multiple cache entries at once.
   */
  mset(entries: { filePath: string; content: string; language: string; nodes: CodeNode[]; edges: CodeEdge[] }[]): void {
    for (const entry of entries) {
      this.set(entry.filePath, entry.content, entry.language, entry.nodes, entry.edges)
    }
  }
}

// ─── Singleton Factory ───────────────────────────────────────────────────────

let globalCache: ASTCache | null = null

export function getASTCache(repoPath: string, options?: ASTCacheOptions): ASTCache {
  if (!globalCache) {
    globalCache = new ASTCache(repoPath, options)
  }
  return globalCache
}

export function resetASTCache(): void {
  globalCache = null
}
