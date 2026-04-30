/**
 * ForgeNexus Indexer — High-Performance Incremental Code Intelligence Pipeline.
 *
 * Architecture:
 *   1. Scan      — discover source files via glob
 *   2. Parse     — tree-sitter AST → nodes + edges (chunked + parallel)
 *   3. Resolve    — bind UNKNOWN:* edges + module imports (suffix trie, O(1))
 *   4. Propagate  — cross-file binding propagation via topological sort
 *   5. Community  — Leiden algorithm (well-connected, timeout-protected)
 *   6. Process    — BFS execution flow tracing from entry points
 *   7. FTS        — incremental FTS5 update (only changed nodes)
 *   8. Embeddings — cache-first embedding generation
 *   9. Meta       — commit tracking + stats
 *
 * Performance optimizations (vs original):
 *   - Suffix trie import resolution: O(1) vs O(n*m)
 *   - Leiden community detection: well-connected, timeout, degree filtering
 *   - Incremental FTS: only changed nodes vs full rebuild
 *   - Embedding cache: skip re-embedding unchanged symbols
 *   - Early exit on unchanged git commit
 *   - Chunked byte-budget parsing
 */

import { readFileSync } from 'fs'
import { basename } from 'path'
import { execSync } from 'child_process'
import { FileScanner, type ScannedFile } from './scanner.js'
import { ParserEngine } from './parser.js'
import { ForgeDB } from '../data/db.js'
import { detectLeidenCommunities } from '../data/leiden.js'
import { traceProcesses } from '../data/graph.js'
import { generateEmbeddings, detectProvider } from '../data/embeddings.js'
import { incrementalFTSUpdate } from '../data/fts-incremental.js'
import {
  buildSuffixIndex,
  resolveImportPath,
  buildNameUidMap,
  buildFileSymbolMap,
} from './import-resolver.js'
import { parseFilesParallel, estimateBytes } from './parallel.js'
import { propagateBindings, shouldSkipBindingPropagation } from './binding-propagation.js'
import { detectFramework } from './framework-detection.js'
import { globalEnclosureCache } from './enclosure-cache.js'
import { ASTCache, getASTCache } from '../data/ast-cache.js'
import {
  analyzeCommunityChanges,
  determineUpdateStrategy,
  computeCommunityMetrics,
  validateCommunityQuality,
  logCommunityDecision,
} from '../data/community-cache.js'
import type { ForgeNexusConfig, RepoStats, CodeNode, CodeEdge } from '../types.js'
import type { ParseTask } from './parallel.js'
import { defaultCodebaseDbPath } from '../paths.js'

function esc(s: string): string {
  return String(s ?? '').replace(/"/g, '\\"')
}

/** Standardized phase labels (mirrors GitNexus run-analyze.ts PHASE_LABELS) */
export const PHASE_LABELS: Record<Phase, string> = {
  scanning: 'Scanning files',
  parsing: 'Parsing code',
  edges: 'Resolving edges',
  binding: 'Binding propagation',
  communities: 'Detecting communities',
  processes: 'Tracing execution flows',
  fts: 'Building search index',
  embeddings: 'Generating embeddings',
  complete: 'Index complete',
}

export type Phase =
  | 'scanning'
  | 'parsing'
  | 'edges'
  | 'binding'
  | 'communities'
  | 'processes'
  | 'fts'
  | 'embeddings'
  | 'complete'

export class Indexer {
  private scanner: FileScanner
  private parser: ParserEngine
  private db: ForgeDB
  private config: Required<ForgeNexusConfig>
  private astCache: ASTCache | null = null
  private cacheHits = 0
  private cacheMisses = 0
  private trieBuildTimeMs = 0

  constructor(basePath: string, config: ForgeNexusConfig = {}) {
    this.config = {
      languages: config.languages ?? [
        'typescript',
        'javascript',
        'python',
        'go',
        'rust',
        'java',
        'csharp',
        'cpp',
        'c',
        'kotlin',
        'php',
        'ruby',
        'swift',
        'dart',
      ],
      maxFileSize: config.maxFileSize ?? 512 * 1024,
      skipPatterns: config.skipPatterns ?? [],
      includeEmbeddings: config.includeEmbeddings ?? false,
      repoName: config.repoName ?? basename(basePath),
      repoPath: config.repoPath ?? basePath,
      dbPath: config.dbPath ?? defaultCodebaseDbPath(basePath),
    }
    this.scanner = new FileScanner(basePath, this.config)
    this.parser = new ParserEngine()

    // Initialize AST cache if incremental mode
    if (config.includeEmbeddings !== undefined) {
      this.astCache = getASTCache(basePath, { enabled: true })
    }

    // Check if cache should be enabled based on cache availability
    if (!this.astCache) {
      this.astCache = getASTCache(basePath, { enabled: true })
    }

    this.db = new ForgeDB(this.config.dbPath)
  }

  async analyze(
    onProgress?: (phase: Phase, pct: number, message?: string) => void,
    incremental = true,
  ): Promise<RepoStats> {
    // Reset per-session caches for fresh analysis
    globalEnclosureCache.clear()
    this.analyzeStartTime = Date.now()

    const progress = (phase: Phase, pct: number, message?: string) => {
      if (onProgress) onProgress(phase, pct, message ?? PHASE_LABELS[phase])
    }

    // ── 0. Early exit on unchanged commit ─────────────────────────────────────
    const totalStart = Date.now()
    if (incremental) {
      const earlyExit = this.checkEarlyExit()
      if (earlyExit) {
        progress('complete', 100)
        return this.db.getStats()
      }
    }

    // ── 1. Scan files ─────────────────────────────────────────────────────────
    progress('scanning', 0)
    const scanStart = Date.now()
    const files = await this.scanner.scan()
    const scanTime = Date.now() - scanStart
    progress('scanning', 100)

    let filesToParse: ScannedFile[] = files

    if (incremental) {
      filesToParse = this.getChangedFilesSinceLastIndex(files)
    }

    const pathsToParse = new Set(filesToParse.map((f) => f.path))

    if (filesToParse.length === 0) {
      progress('complete', 100)
      const stats = this.db.getStats()
      this.db.setMeta('indexed_at', new Date().toISOString())
      return stats
    }

    // ── 2. Parallel/chunked parsing (with AST cache) ─────────────────────────────
    const phaseStart = Date.now()
    progress('parsing', 0, 'Starting file parsing...')

    // Build parse tasks and check cache
    const tasks: ParseTask[] = []
    const cachedResults: { filePath: string; nodes: CodeNode[]; edges: CodeEdge[] }[] = []
    const pathsToCache = new Set<string>()
    let fileReadCount = 0

    for (const scannedFile of filesToParse) {
      try {
        // Check cache FIRST using peek (avoids reading file if cache invalid)
        if (this.astCache) {
          const peekResult = this.astCache.peek(scannedFile.path)
          if (peekResult.valid) {
            // Cache entry exists - read file to verify content hash
            const content = readFileSync(scannedFile.path, 'utf8')
            fileReadCount++
            const cached = this.astCache.get(scannedFile.path, content)
            if (cached) {
              cachedResults.push({
                filePath: scannedFile.path,
                nodes: cached.nodes,
                edges: cached.edges,
              })
              this.cacheHits++
              continue
            }
          }
        }

        // Cache miss - read file and parse
        const content = readFileSync(scannedFile.path, 'utf8')
        fileReadCount++

        // Re-check cache with content (for CRC validation)
        if (this.astCache) {
          const cached = this.astCache.get(scannedFile.path, content)
          if (cached) {
            cachedResults.push({
              filePath: scannedFile.path,
              nodes: cached.nodes,
              edges: cached.edges,
            })
            this.cacheHits++
            continue
          }
          this.cacheMisses++
        }

        // Need to parse
        tasks.push({
          filePath: scannedFile.path,
          content,
          language: scannedFile.language,
        })
        pathsToCache.add(scannedFile.path)
      } catch {
        /* skip unreadable files */
      }
    }

    const fileReadTime = Date.now() - phaseStart
    console.log(`[ForgeNexus] Phase 2: Read ${fileReadCount} files in ${fileReadTime}ms`)

    // Report cache statistics
    const totalFiles = filesToParse.length
    const cacheHitRate = totalFiles > 0 ? (this.cacheHits / totalFiles * 100).toFixed(1) : '0'
    if (this.cacheHits > 0) {
      progress('parsing', 0, `Cache: ${this.cacheHits}/${totalFiles} hits (${cacheHitRate}%)`)
    }

    const estimatedMB = Math.round(estimateBytes(tasks) / 1024 / 1024)
    const isLargeRepo = tasks.length > 100 || estimatedMB > 5

    let newNodes: CodeNode[] = []
    let newEdges: CodeEdge[] = []

    // Add cached results first
    for (const cached of cachedResults) {
      newNodes.push(...cached.nodes)
      newEdges.push(...cached.edges)
    }

    if (tasks.length > 0) {
      if (isLargeRepo) {
        // Use parallel parser for large repos (with progress + stall timeout)
        const os = await import('os')
        const result = await parseFilesParallel(tasks, {
          concurrency: Math.max(1, Math.floor(os.cpus().length * 0.75)),
          onProgress: (done, total) => {
            progress('parsing', Math.round((done / total) * 100), `Parsing ${done}/${total} files...`)
          },
        })
        newNodes.push(...result.nodes)
        newEdges.push(...result.edges)

        // Store parsed results in cache
        if (this.astCache) {
          for (const task of tasks) {
            const cached = result.nodes.filter(n => n.filePath === task.filePath)
            const cachedEdges = result.edges.filter(e =>
              cached.some(c => c.uid === e.fromUid)
            )
            this.astCache.set(task.filePath, task.content, task.language, cached, cachedEdges)
          }
        }
      } else {
        // Sequential: single ParserEngine reused across ALL files + event loop yielding
        const engine = new ParserEngine()
        const allLangs = [...new Set(tasks.map((t) => t.language))]
        await engine.preloadLanguages(allLangs)

        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i]
          try {
            const { nodes, edges } = await engine.parseFile(
              task.filePath,
              task.content,
              task.language,
            )
            newNodes.push(...nodes)
            newEdges.push(...edges)

            // Store in cache
            if (this.astCache) {
              this.astCache.set(task.filePath, task.content, task.language, nodes, edges)
            }
          } catch {
            // skip
          }
          if (i % 50 === 0 || i === tasks.length - 1) {
            progress('parsing', Math.round((i / tasks.length) * 100), `Parsing ${i + 1}/${tasks.length} files...`)
          }
          // Yield to event loop every 50 files to keep UI responsive
          if (i % 50 === 0 && i > 0) {
            await new Promise<void>((resolve) => setImmediate(resolve))
          }
        }
      }
    }

    progress('parsing', 100, `Parsed ${newNodes.length} nodes, ${newEdges.length} edges`)
    const parseTime = Date.now() - phaseStart
    console.log(`[ForgeNexus] Phase 2: Parse ${tasks.length} files in ${parseTime}ms (cached ${cachedResults.length})`)

    // ── 3. Incremental update: remove old nodes for changed files ──────────────
    const removeStart = Date.now()
    // Use pathsToParse for removal (all files that were scanned)
    const deletedFiles = this.getDeletedFiles()

    if (incremental && (newNodes.length > 0 || deletedFiles.length > 0)) {
      for (const fp of [...pathsToParse, ...deletedFiles]) {
        this.removeNodesForFile(fp)
      }
    }
    const removeTime = Date.now() - removeStart

    // ── 4. Insert nodes ───────────────────────────────────────────────────────
    const insertStart = Date.now()
    this.db.insertNodesBatch(newNodes)
    const insertTime = Date.now() - insertStart
    const changedUids = new Set(newNodes.map((n) => n.uid))

    // Skip edge processing if nothing changed (100% cache hit)
    if (tasks.length === 0 && cachedResults.length > 0) {
      progress('edges', 100)
      progress('binding', 100)
      progress('communities', 100)
      progress('processes', 100)
      progress('fts', 100)
      progress('complete', 100)

      const stats = this.db.getStats()
      this.db.setMeta('indexed_at', new Date().toISOString())

      const totalTime = Date.now() - this.analyzeStartTime
      const elapsed = (ms: number) => ms > 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms}ms`
      console.log(`[ForgeNexus] === CACHED RUN ===`)
      console.log(`[ForgeNexus] Total: ${elapsed(totalTime)}`)
      console.log(`[ForgeNexus] === CACHED RUN ===`)

      return {
        ...stats,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        trieBuildMs: this.trieBuildTimeMs,
      }
    }

    progress('edges', 0)
    const edgesStart = Date.now()

    // Build suffix index from ALL files
    // Note: Trie build is fast (O(n*m) string operations) - not worth caching
    const allPaths = [...new Set([...files.map((f) => f.path), ...[...this.db.getAllFilePaths()]])]
    const buildStart = Date.now()
    const suffixIndex = buildSuffixIndex(allPaths)
    this.trieBuildTimeMs = Date.now() - buildStart

    // Build fast name→uid map: O(n) single pass
    const allNodes = this.db.getAllNodes()
    const nameToUid = buildNameUidMap(allNodes)
    const fileSymbolMap = buildFileSymbolMap(allNodes)

    const resolveStart = Date.now()
    const resolvedEdges = this.resolveEdgesFast(allNodes, newEdges, nameToUid)
    progress('edges', 30)
    const resolveTime = Date.now() - resolveStart
    console.log(`[ForgeNexus]   resolveEdges: ${resolveTime}ms (${resolvedEdges.length} edges)`)

    const moduleStart = Date.now()
    const moduleEdges = this.resolveModuleImportsFast(
      allNodes,
      newEdges,
      nameToUid,
      fileSymbolMap,
      suffixIndex,
    )
    const moduleTime = Date.now() - moduleStart
    console.log(`[ForgeNexus]   moduleImports: ${moduleTime}ms (${moduleEdges.length} edges)`)

    const edgeInsertStart = Date.now()
    this.db.insertEdgesBatch(resolvedEdges)
    this.db.insertEdgesBatch(moduleEdges)
    const edgeInsertTime = Date.now() - edgeInsertStart
    console.log(`[ForgeNexus]   insertEdges: ${edgeInsertTime}ms`)

    progress('edges', 100)
    const edgesTime = Date.now() - edgesStart
    console.log(`[ForgeNexus] Phase 5: Resolve edges in ${edgesTime}ms (Trie ${this.trieBuildTimeMs}ms)`)

    // ── 6. Cross-file binding propagation ────────────────────────────────────
    progress('binding', 0)
    const bindingStart = Date.now()
    const allEdgesNow = this.db.getAllEdges()
    if (!shouldSkipBindingPropagation(allNodes, allEdgesNow)) {
      const propagated = propagateBindings(allNodes, allEdgesNow)
      if (propagated.length > 0) {
        this.db.insertEdgesBatch(propagated)
      }
    }
    progress('binding', 100)
    const bindingTime = Date.now() - bindingStart
    console.log(`[ForgeNexus] Phase 6: Binding in ${bindingTime}ms`)

    // ── 7. Community detection (Leiden) ─────────────────────────────────────────
    progress('communities', 0)
    const commStart = Date.now()

    // Build edge list for community detection
    const nodeNames = new Map(allNodes.map((n) => [n.uid, n.name]))
    const allEdgesForComm = this.db.getAllEdges()
    const commEdges = allEdgesForComm
      .filter((e) =>
        [
          'CALLS',
          'IMPORTS',
          'HAS_METHOD',
          'HAS_PROPERTY',
          'EXTENDS',
          'IMPLEMENTS',
          'MEMBER_OF',
        ].includes(e.type),
      )
      .map((e) => ({ from: e.fromUid, to: e.toUid, weight: e.confidence }))

    const allNodeIds = allNodes.map((n) => n.uid)

    // Use community-cache for incremental strategy determination
    if (incremental && tasks.length > 0) {
      // Analyze changes to determine update strategy
      const changedFiles = new Set(tasks.map(t => t.filePath))
      const allFilePaths = new Set(files.map(f => f.path))
      const changeAnalysis = analyzeCommunityChanges(changedFiles, files.length, allFilePaths)
      const strategy = determineUpdateStrategy(changeAnalysis)

      // Log decision
      const fakeMetrics = {
        originalCommunityCount: 0,
        newCommunityCount: 0,
        mergedCommunities: 0,
        createdCommunities: 0,
        deletedCommunities: 0,
        averageCohesion: 0,
        stabilityScore: 0,
      }
      logCommunityDecision(changeAnalysis, strategy, fakeMetrics)

      // Apply strategy
      if (strategy === 'none') {
        // Skip community detection entirely
        console.log('[ForgeNexus] Community: Skipping (no changes)')
      } else if (strategy === 'incremental' || strategy === 'aggressive') {
        // Partial: delete only affected communities
        this.deleteAffectedCommunities(changedFiles)
      } else {
        // Full rebuild
        this.db.exec('MATCH (c:Community) DELETE c')
        this.db.exec('MATCH (n:CodeNode) WHERE n.rel_type IS NULL SET n.community = NULL')
      }
    } else {
      // Full rebuild: use KuzuDB MATCH syntax (not SQLite DELETE/UPDATE)
      this.db.exec('MATCH (c:Community) DELETE c')
      this.db.exec('MATCH (n:CodeNode) WHERE n.rel_type IS NULL SET n.community = NULL')
    }

    // Run Leiden with aggressive optimization for large graphs
    // Large repo (>10K nodes): skip community detection (too slow)
    // Medium repo (>5K nodes): 2 iterations max
    // Small repo: 5 iterations
    const nodeCount = allNodes.length
    const edgeCount = commEdges.length
    const isVeryLarge = nodeCount > 15000
    const isLarge = nodeCount > 10000
    const isMedium = nodeCount > 5000

    let communities: ReturnType<typeof detectLeidenCommunities> = []

    if (isVeryLarge) {
      // Skip community detection for very large repos (too slow)
      console.log(`[ForgeNexus] Leiden: Skipping (${nodeCount} nodes exceeds 15K threshold)`)
    } else {
      const maxIters = isLarge ? 2 : isMedium ? 3 : 5
      const resolution = isLarge ? 3.0 : isMedium ? 2.0 : 1.0

      console.log(`[ForgeNexus] Leiden: ${nodeCount} nodes, ${edgeCount} edges, ${maxIters} iters, res ${resolution}`)

      communities = detectLeidenCommunities(allNodeIds, commEdges, nodeNames, {
        resolution,
        maxIterations: maxIters,
      })

      // Validate community quality
      const metrics = computeCommunityMetrics(communities)
      if (!validateCommunityQuality(metrics)) {
        console.warn('[ForgeNexus] Community: Quality check failed, forcing full rebuild')
        this.db.exec('MATCH (c:Community) DELETE c')
        this.db.exec('MATCH (n:CodeNode) WHERE n.rel_type IS NULL SET n.community = NULL')
        // Re-run with lower resolution for better quality
        communities = detectLeidenCommunities(allNodeIds, commEdges, nodeNames, {
          resolution: 0.5,
          maxIterations: 3,
        })
      }

      console.log(`[ForgeNexus] Leiden: ${communities.length} communities, avg cohesion ${metrics.averageCohesion}`)
    }

    // Communities table was already cleared above (partial or full)
    // Now insert the new communities
    const insertBatch: Array<{uid: string, community: string}> = []

    for (const community of communities) {
      this.db.insertCommunity(community)
      for (const nodeUid of community.nodes) {
        insertBatch.push({ uid: nodeUid, community: community.id })
      }
    }

    // Batch update nodes (faster than individual queries)
    const batchStart = Date.now()
    for (const { uid, community } of insertBatch) {
      try {
        this.db.connection.querySync(
          `MATCH (n:CodeNode {uid: "${esc(uid)}"}) SET n.community = "${esc(community)}"`,
        )
      } catch { /* node may not exist */ }
    }
    const batchTime = Date.now() - batchStart
    progress('communities', 100)
    const commTime = Date.now() - commStart
    console.log(`[ForgeNexus] Phase 7: Community detection in ${commTime}ms (${communities.length} communities)`)

    // ── 8. Process tracing ───────────────────────────────────────────────────
    progress('processes', 0)
    const procStart = Date.now()
    // Use KuzuDB MATCH syntax (not SQLite DELETE/UPDATE)
    this.db.exec('MATCH (p:Process) DELETE p')
    this.db.exec('MATCH (n:CodeNode) WHERE n.rel_type IS NULL SET n.process = NULL')

    const processes = traceProcesses(this.db)
    for (const proc of processes) {
      this.db.insertProcess(proc)
      for (const step of proc.steps) {
        const node = this.db.getNode(step.uid)
        if (node) {
          this.db.insertNode({ ...node, process: proc.id })
        }
      }
    }
    progress('processes', 100)
    const procTime = Date.now() - procStart
    console.log(`[ForgeNexus] Phase 8: Process tracing in ${procTime}ms`)

    // ── 9. Incremental FTS update ─────────────────────────────────────────────
    progress('fts', 0)
    const ftsStart = Date.now()
    if (incremental) {
      incrementalFTSUpdate(this.db, changedUids, allNodes.length)
    } else {
      this.db.rebuildFTS()
    }
    progress('fts', 100)
    const ftsTime = Date.now() - ftsStart
    console.log(`[ForgeNexus] Phase 9: FTS in ${ftsTime}ms`)

    // ── 10. Embeddings (cache-first via generateEmbeddings internal logic) ──────
    if (this.config.includeEmbeddings) {
      progress('embeddings', 0)
      try {
        const provider = (process.env.EMBEDDING_PROVIDER as any) ?? detectProvider()
        // generateEmbeddings auto-selects nodes WHERE embedding IS NULL,
        // so changed/new nodes get embedded; unchanged nodes are skipped.
        const result = await generateEmbeddings(this.db, { provider })
        console.error(
          `[ForgeNexus] Embeddings: ${result.count} generated (${result.elapsedMs}ms) via ${result.provider}`,
        )
      } catch (e) {
        console.warn(`[ForgeNexus] Embeddings skipped: ${e}`)
      }
      progress('embeddings', 100)
    }

    // ── 11. Update meta ──────────────────────────────────────────────────────
    const stats = this.db.getStats()
    this.db.setMeta('indexed_at', new Date().toISOString())
    try {
      const lastCommit = execSync('git rev-parse HEAD 2>/dev/null', { encoding: 'utf8' }).trim()
      this.db.setMeta('last_commit', lastCommit)
    } catch {
      /* not a git repo */
    }
    this.db.setMeta('repo_name', this.config.repoName)
    this.db.setMeta('repo_path', this.config.repoPath)

    // Track indexed files
    const allPathsStr = files.map((f) => f.path).join('\n')
    this.db.setMeta('indexed_files', allPathsStr)

    // Detect frameworks for metadata
    try {
      const allContents = new Map<string, string>()
      for (const f of files.slice(0, 50)) {
        try {
          allContents.set(f.path, readFileSync(f.path, 'utf8'))
        } catch {
          /* skip */
        }
      }
      const frameworks = detectFramework(allContents)
      if (frameworks.length > 0) {
        this.db.setMeta('detected_frameworks', frameworks.map((f) => f.framework).join(','))
      }
    } catch {
      /* framework detection is best-effort */
    }

    progress('complete', 100)

    // Log phase timing summary
    const totalTime = Date.now() - this.analyzeStartTime
    const elapsed = (ms: number) => ms > 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms}ms`
    console.log(`[ForgeNexus] === TIMING SUMMARY ===`)
    console.log(`[ForgeNexus] Total: ${elapsed(totalTime)}`)
    console.log(`[ForgeNexus] === TIMING SUMMARY ===`)

    // Add cache statistics to stats
    const finalStats = {
      ...stats,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      trieBuildMs: this.trieBuildTimeMs,
    }

    return finalStats
  }

  private analyzeStartTime = 0

  /**
   * Check if the repo is already up-to-date (early exit).
   */
  private checkEarlyExit(): boolean {
    try {
      const lastCommit = this.db.getMeta('last_commit')
      const lastIndexedAt = this.db.getMeta('indexed_at')
      if (!lastCommit || !lastIndexedAt) return false

      const currentCommit = execSync('git rev-parse HEAD 2>/dev/null', { encoding: 'utf8' }).trim()
      return currentCommit === lastCommit
    } catch {
      return false
    }
  }

  /**
   * Get list of files that have changed since the last index.
   */
  private getChangedFilesSinceLastIndex(allFiles: ScannedFile[]): ScannedFile[] {
    const lastCommit = this.db.getMeta('last_commit')
    const lastIndexedAt = this.db.getMeta('indexed_at')

    if (!lastCommit || !lastIndexedAt) {
      return allFiles
    }

    try {
      const output = execSync(`git diff --name-only ${lastCommit} HEAD`, {
        encoding: 'utf8',
      }).trim()

      const changedInCommit = new Set(
        output
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      )

      // Also check uncommitted changes
      let uncommitted: string[] = []
      try {
        const uncommittedOutput = execSync('git diff --name-only', { encoding: 'utf8' }).trim()
        uncommitted = uncommittedOutput
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      } catch {
        /* no uncommitted changes */
      }

      try {
        const stagedOutput = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim()
        uncommitted.push(
          ...stagedOutput
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
        )
      } catch {
        /* no staged changes */
      }

      const allChanged = new Set([...changedInCommit, ...uncommitted])
      const repoPath = this.config.repoPath

      const changedFiles = allFiles.filter((f) => {
        const relPath = f.path.replace(repoPath + '/', '').replace(repoPath, '')
        return allChanged.has(relPath) || allChanged.has('./' + relPath)
      })

      if (changedFiles.length > allFiles.length * 0.5) {
        return allFiles
      }

      return changedFiles.length > 0 ? changedFiles : allFiles
    } catch {
      return allFiles
    }
  }

  /**
   * Get files that were deleted since last index.
   */
  private getDeletedFiles(): string[] {
    try {
      const lastCommit = this.db.getMeta('last_commit')
      if (!lastCommit) return []
      const output = execSync(`git diff --name-status ${lastCommit} HEAD`, {
        encoding: 'utf8',
      }).trim()
      return output
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('D\t') || l.startsWith('D '))
        .map((l) => l.replace(/^[AMD]\t/, ''))
    } catch {
      return []
    }
  }

  /**
   * Remove nodes and edges for a specific file.
   * Uses KuzuDB MATCH + DELETE queries (not SQLite).
   */
  private removeNodesForFile(filePath: string): void {
    try {
      // Get uids of nodes in this file
      const rows = this.db.connection.querySync(
        `MATCH (n:CodeNode {filePath: "${esc(filePath)}"}) RETURN n.uid AS uid`,
      )
      const results = Array.isArray(rows) ? rows[0] : rows
      const nodeRows = (results as any).getAllSync() as { uid: string }[]
      const uids = nodeRows.map((r) => r.uid)

      if (uids.length > 0) {
        // Delete all edge-records referencing these nodes (edges stored as CodeNode entries)
        for (const uid of uids) {
          try {
            this.db.connection.querySync(
              `MATCH (e:CodeNode) WHERE e.rel_from = "${esc(uid)}" OR e.rel_to = "${esc(uid)}" DELETE e`,
            )
          } catch { /* edges may not exist */ }
        }
        // Delete the nodes themselves
        for (const uid of uids) {
          try {
            this.db.connection.querySync(`MATCH (n:CodeNode {uid: "${esc(uid)}"}) DELETE n`)
          } catch { /* skip */ }
        }
      }
    } catch (e: any) {
      console.warn(`[ForgeNexus] removeNodesForFile failed: ${e.message}`)
    }
  }

  /**
   * Delete only communities that contain nodes in changed files.
   */
  private deleteAffectedCommunities(changedFilePaths: Set<string>): void {
    // Find communities that have nodes in changed files.
    // Edges are stored as CodeNode entries with rel_type IS NOT NULL,
    // while true nodes have rel_type IS NULL and a community STRING property.
    const affectedComms = new Set<string>()
    for (const fp of changedFilePaths) {
      try {
        const result = this.db.connection.querySync(
          `MATCH (n:CodeNode) WHERE n.filePath = "${esc(fp)}" AND n.rel_type IS NULL AND n.community IS NOT NULL RETURN DISTINCT n.community AS community`,
        )
        const results = Array.isArray(result) ? result[0] : result
        const rows = (results as any).getAllSync() as { community: string }[]
        for (const row of rows) {
          if (row.community) affectedComms.add(row.community)
        }
      } catch { /* skip */ }
    }

    if (affectedComms.size > 0 && affectedComms.size < 20) {
      // Partial: clear community field from affected nodes, then delete communities.
      const commIds = [...affectedComms].map((c) => `"${esc(c)}"`).join(', ')
      try {
        this.db.connection.querySync(`MATCH (n:CodeNode) WHERE n.rel_type IS NULL AND n.community IN [${commIds}] SET n.community = NULL`)
        this.db.connection.querySync(`MATCH (c:Community) WHERE c.id IN [${commIds}] DELETE c`)
      } catch (e: any) {
        console.warn(`[ForgeNexus] deleteAffectedCommunities partial failed: ${e.message}`)
      }
    } else {
      // Too many affected communities — full rebuild.
      try {
        this.db.connection.querySync(`MATCH (c:Community) DELETE c`)
        this.db.connection.querySync(`MATCH (n:CodeNode) WHERE n.rel_type IS NULL SET n.community = NULL`)
      } catch (e: any) {
        console.warn(`[ForgeNexus] deleteAffectedCommunities full failed: ${e.message}`)
      }
    }
  }

  /**
   * Fast edge resolution using pre-built name→uid map.
   * O(n) instead of O(n²) table scan.
   */
  private resolveEdgesFast(
    nodes: CodeNode[],
    edges: CodeEdge[],
    nameToUid: Map<string, string>,
  ): CodeEdge[] {
    // Pre-filter: only process UNKNOWN edges (most common case)
    const unknownEdges = edges.filter(e => e.toUid.startsWith('UNKNOWN:'))
    const otherEdges = edges.filter(e => !e.toUid.startsWith('UNKNOWN:'))

    const resolved: CodeEdge[] = otherEdges // Non-UNKNOWN edges pass through unchanged

    for (const edge of unknownEdges) {
      const parts = edge.toUid.split(':')
      const type = parts[1]
      const calleeName = parts[2]

      if (!type || !calleeName) {
        resolved.push(edge)
        continue
      }

      const key = `${type}:${calleeName}`
      const resolvedUid = nameToUid.get(key)

      if (resolvedUid) {
        resolved.push({ ...edge, toUid: resolvedUid })
      } else {
        resolved.push(edge)
      }
    }

    return resolved
  }

  /**
   * Fast module import resolution using suffix trie.
   * O(1) path lookup instead of O(n*m) suffix matching.
   */
  private resolveModuleImportsFast(
    nodes: CodeNode[],
    edges: CodeEdge[],
    nameToUid: Map<string, string>,
    fileSymbolMap: Map<string, Set<string>>,
    suffixIndex: ReturnType<typeof buildSuffixIndex>,
  ): CodeEdge[] {
    const moduleEdges: CodeEdge[] = []

    for (const edge of edges) {
      if (edge.type === 'IMPORTS' && edge.toUid.startsWith('IMPORT:')) {
        const parts = edge.toUid.split(':')
        const source = parts[1]
        const symbol = parts[2] ?? 'default'

        let resolvedUid: string | null = null

        // Try exact symbol name first (fast path)
        if (
          symbol !== 'module' &&
          symbol !== 'default' &&
          symbol !== 'file' &&
          symbol !== 'wildcard'
        ) {
          resolvedUid = nameToUid.get(`${symbol}:${symbol}`) ?? null
        }

        // Try suffix trie resolution for path-based imports
        if (!resolvedUid && source && (source.startsWith('.') || source.startsWith('/'))) {
          const fromFile = edge.fromUid.split(':')[0]
          const resolvedPath = resolveImportPath(source, fromFile, suffixIndex)

          if (resolvedPath) {
            // Find symbol in resolved file
            const symbols = fileSymbolMap.get(resolvedPath)
            if (symbols) {
              if (symbol !== 'default' && symbols.has(symbol)) {
                resolvedUid = nameToUid.get(`${symbol}:${symbol}`) ?? null
              }
              if (!resolvedUid) {
                // Take any symbol from the file (default export)
                const anySymbol = [...symbols][0]
                if (anySymbol) {
                  resolvedUid = nameToUid.get(`${anySymbol}:${anySymbol}`) ?? null
                }
              }
            }
          }
        }

        if (resolvedUid) {
          moduleEdges.push({
            ...edge,
            toUid: resolvedUid,
            confidence: Math.min(edge.confidence + 0.1, 1.0),
            reason: 'suffix-trie-resolved',
          })
        } else {
          moduleEdges.push(edge)
        }
      } else {
        moduleEdges.push(edge)
      }
    }

    return moduleEdges
  }

  getDB(): ForgeDB {
    return this.db
  }

  /** Reset the DB (wipe all data). Used before a forced full re-index. */
  reset(): void {
    this.db.reset()
  }

  close(): void {
    this.db.close()
  }
}
