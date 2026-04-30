/**
 * Tests for AST Cache module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ASTCache } from './ast-cache.js'
import type { CodeNode, CodeEdge } from '../types.js'

describe('ASTCache', () => {
  const testDir = '/tmp/forgenexus-test-cache'
  const testRepoPath = testDir

  const mockNodes: CodeNode[] = [
    {
      uid: '/test/file.ts:Function:add:1',
      type: 'Function',
      name: 'add',
      filePath: '/test/file.ts',
      line: 1,
      endLine: 5,
      column: 0,
      language: 'typescript',
    },
  ]

  const mockEdges: CodeEdge[] = [
    {
      id: '/test/file.ts:Function:add:1->CALLS:helper',
      fromUid: '/test/file.ts:Function:add:1',
      toUid: 'UNKNOWN:Function:helper:0',
      type: 'CALLS',
      confidence: 0.8,
      reason: 'test',
    },
  ]

  beforeEach(() => {
    // Clean up before each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    // Clean up after each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  describe('constructor', () => {
    it('should create cache directory if not exists', () => {
      const cache = new ASTCache(testRepoPath)
      expect(existsSync(cache.getCacheDir())).toBe(true)
    })

    it('should use custom cache directory when provided', () => {
      const customDir = join(testDir, 'custom-cache')
      const cache = new ASTCache(testRepoPath, { cacheDir: customDir })
      expect(cache.getCacheDir()).toBe(customDir)
    })

    it('should be disabled when enabled=false', () => {
      const cache = new ASTCache(testRepoPath, { enabled: false })
      expect(cache.get('/test/file.ts', 'content')).toBe(null)
    })
  })

  describe('get/set operations', () => {
    it('should return null for cache miss', () => {
      const cache = new ASTCache(testRepoPath)
      expect(cache.get('/nonexistent/file.ts', 'content')).toBe(null)
    })

    it('should store and retrieve cache entry', () => {
      const cache = new ASTCache(testRepoPath)
      const content = 'export function add(a: number, b: number): number { return a + b; }'

      cache.set('/test/file.ts', content, 'typescript', mockNodes, mockEdges)

      const cached = cache.get('/test/file.ts', content)
      expect(cached).not.toBe(null)
      expect(cached!.nodes).toHaveLength(1)
      expect(cached!.edges).toHaveLength(1)
      expect(cached!.nodes[0].name).toBe('add')
    })

    it('should invalidate cache on content change', () => {
      const cache = new ASTCache(testRepoPath)
      const originalContent = 'export function add(a: number): number { return a; }'
      const modifiedContent = 'export function add(a: number, b: number): number { return a + b; }'

      cache.set('/test/file.ts', originalContent, 'typescript', mockNodes, mockEdges)
      expect(cache.get('/test/file.ts', originalContent)).not.toBe(null)

      // Content changed - should be cache miss
      expect(cache.get('/test/file.ts', modifiedContent)).toBe(null)
    })

    it('should store correct metadata', () => {
      const cache = new ASTCache(testRepoPath)
      const content = 'export function test(): void { }'

      cache.set('/test/file.ts', content, 'typescript', mockNodes, mockEdges)

      const cached = cache.get('/test/file.ts', content)
      expect(cached!.version).toBe(1)
      expect(cached!.language).toBe('typescript')
      expect(cached!.nodeCount).toBe(1)
      expect(cached!.edgeCount).toBe(1)
      expect(cached!.contentHash).toBeTruthy()
      expect(cached!.contentChecksum).toBeTruthy()
    })
  })

  describe('invalidate', () => {
    it('should remove cached entry', () => {
      const cache = new ASTCache(testRepoPath)
      const content = 'export function test(): void { }'

      cache.set('/test/file.ts', content, 'typescript', mockNodes, mockEdges)
      expect(cache.get('/test/file.ts', content)).not.toBe(null)

      cache.invalidate('/test/file.ts')
      expect(cache.get('/test/file.ts', content)).toBe(null)
    })

    it('should handle invalidating nonexistent entry', () => {
      const cache = new ASTCache(testRepoPath)
      expect(() => cache.invalidate('/nonexistent/file.ts')).not.toThrow()
    })
  })

  describe('clear', () => {
    it('should remove all cached entries', () => {
      const cache = new ASTCache(testRepoPath)
      const content = 'export function test(): void { }'

      cache.set('/test/file1.ts', content, 'typescript', mockNodes, mockEdges)
      cache.set('/test/file2.ts', content, 'typescript', mockNodes, mockEdges)

      cache.clear()

      expect(cache.get('/test/file1.ts', content)).toBe(null)
      expect(cache.get('/test/file2.ts', content)).toBe(null)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const cache = new ASTCache(testRepoPath)
      const content = 'export function test(): void { }'

      cache.set('/test/file1.ts', content, 'typescript', mockNodes, mockEdges)
      cache.set('/test/file2.ts', content, 'typescript', mockNodes, mockEdges)

      const stats = cache.getStats()
      expect(stats.fileCount).toBe(2)
      expect(stats.totalSizeBytes).toBeGreaterThan(0)
      expect(stats.maxSizeBytes).toBe(500 * 1024 * 1024) // Default 500MB
    })
  })

  describe('mget/mset operations', () => {
    it('should get multiple entries at once', () => {
      const cache = new ASTCache(testRepoPath)
      const content1 = 'export function test1(): void { }'
      const content2 = 'export function test2(): void { }'

      cache.set('/test/file1.ts', content1, 'typescript', mockNodes, mockEdges)
      cache.set('/test/file2.ts', content2, 'typescript', mockNodes, mockEdges)

      const results = cache.mget([
        { filePath: '/test/file1.ts', content: content1 },
        { filePath: '/test/file2.ts', content: content2 },
        { filePath: '/test/file3.ts', content: 'export function test3(): void { }' },
      ])

      expect(results.get('/test/file1.ts')).not.toBe(null)
      expect(results.get('/test/file2.ts')).not.toBe(null)
      expect(results.get('/test/file3.ts')).toBe(null)
    })

    it('should set multiple entries at once', () => {
      const cache = new ASTCache(testRepoPath)
      const content = 'export function test(): void { }'

      cache.mset([
        { filePath: '/test/file1.ts', content, language: 'typescript', nodes: mockNodes, edges: mockEdges },
        { filePath: '/test/file2.ts', content, language: 'typescript', nodes: mockNodes, edges: mockEdges },
      ])

      expect(cache.get('/test/file1.ts', content)).not.toBe(null)
      expect(cache.get('/test/file2.ts', content)).not.toBe(null)
    })
  })

  describe('cache integrity', () => {
    it('should detect corrupt cache entry', () => {
      const cache = new ASTCache(testRepoPath)
      const content = 'export function test(): void { }'

      cache.set('/test/file.ts', content, 'typescript', mockNodes, mockEdges)

      // Manually corrupt the cache file to change content hash
      const cacheDir = cache.getCacheDir()
      const cacheFile = join(cacheDir, 'test__file.ts.json')
      if (existsSync(cacheFile)) {
        const data = JSON.parse(readFileSync(cacheFile, 'utf8'))
        data.contentHash = 'corrupted_hash_value_that_will_not_match'
        writeFileSync(cacheFile, JSON.stringify(data))
      }

      // Hash mismatch should return null
      expect(cache.get('/test/file.ts', content)).toBe(null)
    })

    it('should not cache when disabled', () => {
      const cache = new ASTCache(testRepoPath, { enabled: false })
      const content = 'export function test(): void { }'

      cache.set('/test/file.ts', content, 'typescript', mockNodes, mockEdges)
      expect(cache.get('/test/file.ts', content)).toBe(null)
    })
  })
})
