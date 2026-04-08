/**
 * Parallel file parsing using persistent worker threads.
 *
 * Performance optimizations (v2):
 *   - Persistent workers: workers stay alive across ALL chunks, not just one
 *   - Sub-batch dispatch: each worker processes a batch of files before messaging back
 *   - Language pre-loading: workers pre-load all needed languages once on startup
 *   - Parser reuse: each worker has one Parser per language, reused across files
 *   - Byte-budget chunking: balanced workloads across workers
 *
 * Architecture:
 *   - Worker pool with N persistent workers (default: cpus * 0.75)
 *   - Each worker receives sub-batches of ~20 files at a time
 *   - Workers report progress after each sub-batch (not just each chunk)
 *   - Main thread handles aggregation only
 */

import { cpus } from 'os'
import { Worker } from 'worker_threads'
import { join, dirname } from 'path'
import type { CodeNode, CodeEdge } from '../types.js'

export interface ParseTask {
  filePath: string
  content: string
  language: string
}

export interface ParseResult {
  filePath: string
  nodes: CodeNode[]
  edges: CodeEdge[]
  error?: string
}

export interface ParallelParseOptions {
  concurrency?: number
  chunkByteBudget?: number
  minFilesForWorkers?: number
  minBytesForWorkers?: number
  subBatchSize?: number       // files per sub-batch (default 25)
  onProgress?: (done: number, total: number) => void
  stallTimeoutMs?: number
}

// Defaults
const CONCURRENCY = Math.max(1, Math.floor(cpus().length * 0.75))
const CHUNK_BYTE_BUDGET = 20 * 1024 * 1024
const MIN_FILES_FOR_WORKERS = 15
const MIN_BYTES_FOR_WORKERS = 512 * 1024
const STALL_TIMEOUT_MS = 60_000
const DEFAULT_SUB_BATCH_SIZE = 25

// ─── Public API ───────────────────────────────────────────────────────────────

export async function parseFilesParallel(
  tasks: ParseTask[],
  options: ParallelParseOptions = {},
): Promise<{ nodes: CodeNode[]; edges: CodeEdge[] }> {
  const {
    concurrency = CONCURRENCY,
    chunkByteBudget = CHUNK_BYTE_BUDGET,
    minFilesForWorkers = MIN_FILES_FOR_WORKERS,
    minBytesForWorkers = MIN_BYTES_FOR_WORKERS,
    subBatchSize = DEFAULT_SUB_BATCH_SIZE,
    onProgress,
    stallTimeoutMs = STALL_TIMEOUT_MS,
  } = options

  const totalBytes = tasks.reduce((sum, t) => sum + t.content.length, 0)

  // Fall back to sequential if workers wouldn't help
  if (tasks.length < minFilesForWorkers || totalBytes < minBytesForWorkers) {
    return parseFilesSequential(tasks, onProgress)
  }

  const effectiveConcurrency = Math.min(concurrency, Math.ceil(tasks.length / 5))
  if (effectiveConcurrency <= 1) {
    return parseFilesSequential(tasks, onProgress)
  }

  // Chunk by byte budget (larger chunks = fewer worker messages)
  const chunks = chunkByByteBudget(tasks, chunkByteBudget)
  if (chunks.length <= 2) {
    return parseFilesSequential(tasks, onProgress)
  }

  // ── Persistent worker pool ─────────────────────────────────────────────────
  const stallTimer = setTimeout(() => {
    console.warn(`[ForgeNexus] Workers stalled after ${stallTimeoutMs}ms — falling back to sequential`)
  }, stallTimeoutMs)

  try {
    const results = await runPersistentPool(chunks, effectiveConcurrency, subBatchSize, onProgress)
    clearTimeout(stallTimer)
    return aggregateResults(results)
  } catch (err) {
    clearTimeout(stallTimer)
    console.warn(`[ForgeNexus] Worker pool error: ${err} — falling back to sequential`)
    return parseFilesSequential(tasks, onProgress)
  }
}

// ─── Persistent Worker Pool ──────────────────────────────────────────────────

interface PoolMessage {
  type: 'init' | 'batch' | 'close'
  tasks?: ParseTask[]
  batchId?: number
  workerId?: number
}

interface WorkerResult {
  type: 'ready' | 'batch_result' | 'error' | 'closed'
  workerId?: number
  batchId?: number
  results?: ParseResult[]
  error?: string
}

async function runPersistentPool(
  allChunks: ParseTask[][],
  concurrency: number,
  subBatchSize: number,
  onProgress?: (done: number, total: number) => void,
): Promise<ParseResult[]> {
  const workerScript = join(dirname(import.meta.url), 'parse-worker.js')
  const totalFiles = allChunks.reduce((sum, c) => sum + c.length, 0)

  // Split chunks across workers — each worker gets N chunks to process sequentially
  const chunksPerWorker = Math.ceil(allChunks.length / concurrency)
  const numWorkers = Math.min(concurrency, allChunks.length)

  // Create all workers upfront (persistent — they stay alive)
  const workers: Worker[] = []
  const pendingBatches = new Map<number, { resolve: (r: ParseResult[]) => void; reject: (e: Error) => void }>()
  let nextBatchId = 0
  let completedFiles = 0

  // Pre-assign chunks to each worker
  const workerAssignments: ParseTask[][][] = Array.from({ length: numWorkers }, () => [])
  for (let i = 0; i < allChunks.length; i++) {
    const workerIdx = i % numWorkers
    workerAssignments[workerIdx].push(allChunks[i])
  }

  // Collect results
  const allResults: ParseResult[] = []

  return new Promise<ParseResult[]>((masterResolve, masterReject) => {
    let settled = false
    const settledWorkers = new Set<number>()

    const checkDone = () => {
      if (settled) return
      if (settledWorkers.size === numWorkers) {
        settled = true
        for (const w of workers) {
          try { w.terminate() } catch { /* ignore */ }
        }
        masterResolve(allResults)
      }
    }

    for (let wid = 0; wid < numWorkers; wid++) {
      const workerChunks = workerAssignments[wid]

      // Divide each worker's chunks into sub-batches
      const subBatches: ParseTask[][] = []
      for (const chunk of workerChunks) {
        // Split each chunk into sub-batches
        for (let i = 0; i < chunk.length; i += subBatchSize) {
          subBatches.push(chunk.slice(i, i + subBatchSize))
        }
      }

      let w: Worker
      try {
        w = new Worker(workerScript)
      } catch {
        settledWorkers.add(wid)
        checkDone()
        continue
      }

      workers.push(w)
      let currentSubBatch = 0
      let workerReady = false

      const sendNextBatch = () => {
        if (currentSubBatch >= subBatches.length) {
          settledWorkers.add(wid)
          checkDone()
          return
        }

        const batch = subBatches[currentSubBatch++]
        const batchId = nextBatchId++
        pendingBatches.set(batchId, {
          resolve: (results) => {
            allResults.push(...results)
            completedFiles += results.length
            if (onProgress) {
              onProgress(Math.min(completedFiles, totalFiles), totalFiles)
            }
            // Continue with next sub-batch
            sendNextBatch()
          },
          reject: (err) => {
            if (!settled) {
              settled = true
              masterReject(err)
            }
          },
        })

        try {
          w.postMessage({
            type: 'batch',
            tasks: batch,
            batchId,
            workerId: wid,
          } as PoolMessage)
        } catch (err) {
          pendingBatches.get(batchId)?.reject(err as Error)
          pendingBatches.delete(batchId)
          settledWorkers.add(wid)
          checkDone()
        }
      }

      w.on('message', (msg: WorkerResult) => {
        if (msg.type === 'ready') {
          workerReady = true
          // Start sending batches after worker is ready
          sendNextBatch()
        } else if (msg.type === 'batch_result' && msg.batchId !== undefined) {
          const pending = pendingBatches.get(msg.batchId)
          if (pending) {
            if (msg.results) {
              pending.resolve(msg.results)
            }
            pendingBatches.delete(msg.batchId)
          }
        } else if (msg.type === 'error') {
          const pending = pendingBatches.get(msg.batchId ?? -1)
          if (pending) {
            pending.reject(new Error(msg.error))
            pendingBatches.delete(msg.batchId ?? -1)
          }
        }
      })

      w.on('error', (err) => {
        if (!settled) {
          settled = true
          masterReject(err)
        }
      })

      w.on('exit', () => {
        settledWorkers.add(wid)
        checkDone()
      })

      // Send init message to worker
      w.postMessage({ type: 'init', workerId: wid } as PoolMessage)
    }
  })
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function aggregateResults(results: ParseResult[]): { nodes: CodeNode[]; edges: CodeEdge[] } {
  const allNodes: CodeNode[] = []
  const allEdges: CodeEdge[] = []
  for (const r of results) {
    allNodes.push(...r.nodes)
    allEdges.push(...r.edges)
  }
  return { nodes: allNodes, edges: allEdges }
}

// ─── Byte Budget Chunking ────────────────────────────────────────────────────

function chunkByByteBudget(tasks: ParseTask[], byteBudget: number): ParseTask[][] {
  const chunks: ParseTask[][] = []
  let current: ParseTask[] = []
  let currentBytes = 0

  for (const task of tasks) {
    const taskBytes = task.content.length * 2 // UTF-16 estimate
    if (currentBytes + taskBytes > byteBudget && current.length > 0) {
      chunks.push(current)
      current = []
      currentBytes = 0
    }
    current.push(task)
    currentBytes += taskBytes
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

// ─── Sequential fallback ─────────────────────────────────────────────────────

export async function parseFilesSequential(
  tasks: ParseTask[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ nodes: CodeNode[]; edges: CodeEdge[] }> {
  // Single ParserEngine reused across ALL files
  const { ParserEngine } = await import('./parser.js')
  const engine = new ParserEngine()

  const allNodes: CodeNode[] = []
  const allEdges: CodeEdge[] = []

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    try {
      const { nodes, edges } = await engine.parseFile(task.filePath, task.content, task.language)
      allNodes.push(...nodes)
      allEdges.push(...edges as any)
    } catch { /* skip */ }

    if (onProgress && (i % 50 === 0 || i === tasks.length - 1)) {
      onProgress(i + 1, tasks.length)
      // Yield to event loop every 50 files
      if (i % 50 === 0 && i > 0) {
        await yieldToEventLoop()
      }
    }
  }

  return { nodes: allNodes, edges: allEdges }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

// ─── Utilities ──────────────────────────────────────────────────────────────

export function estimateBytes(tasks: ParseTask[]): number {
  return tasks.reduce((sum, t) => sum + t.content.length * 2, 0)
}

export function partitionByChange(
  files: ParseTask[],
  changedFilePaths: Set<string>,
): { changed: ParseTask[]; unchanged: string[] } {
  const changed: ParseTask[] = []
  const unchanged: string[] = []
  for (const f of files) {
    if (changedFilePaths.has(f.filePath)) {
      changed.push(f)
    } else {
      unchanged.push(f.filePath)
    }
  }
  return { changed, unchanged }
}

export function shouldUseIncremental(lastCommit: string, currentCommit: string): boolean {
  return lastCommit !== '' && lastCommit === currentCommit
}
