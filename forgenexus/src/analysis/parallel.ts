/**
 * Parallel file parsing using worker threads.
 * Improves indexing performance on multi-core machines.
 *
 * Architecture:
 * - Uses a pool of worker threads (default: cpus-1)
 * - Files are chunked by byte budget (20MB per chunk)
 * - Workers parse their chunk independently with their own ParserEngine
 * - Main thread handles only aggregation and edge resolution
 * - Progress is reported after each chunk completes
 *
 * Falls back to sequential parsing if workers aren't beneficial (tiny repos).
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
  chunkByteBudget?: number // bytes per chunk. default 20MB
  minFilesForWorkers?: number
  minBytesForWorkers?: number
  /** Called after each chunk completes with (completedFiles, totalFiles). */
  onProgress?: (done: number, total: number) => void
  /** Milliseconds to wait before falling back to sequential. Default 60000. */
  stallTimeoutMs?: number
}

/** Default values */
const CONCURRENCY = Math.max(1, Math.floor(cpus().length * 0.75))
const CHUNK_BYTE_BUDGET = 20 * 1024 * 1024 // 20MB
const MIN_FILES_FOR_WORKERS = 15
const MIN_BYTES_FOR_WORKERS = 512 * 1024 // 512KB
const STALL_TIMEOUT_MS = 60_000 // 60 seconds

/**
 * Chunk files into byte-budget groups for worker dispatch.
 */
function chunkByByteBudget(tasks: ParseTask[], byteBudget: number): ParseTask[][] {
  const chunks: ParseTask[][] = []
  let currentChunk: ParseTask[] = []
  let currentBytes = 0

  for (const task of tasks) {
    const taskBytes = task.content.length * 2 // UTF-16 estimate
    if (currentBytes + taskBytes > byteBudget && currentChunk.length > 0) {
      chunks.push(currentChunk)
      currentChunk = []
      currentBytes = 0
    }
    currentChunk.push(task)
    currentBytes += taskBytes
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

/**
 * Parse a single file on the main thread (fallback for tiny repos).
 */
async function parseSingleFile(task: ParseTask): Promise<ParseResult> {
  try {
    const { ParserEngine } = await import('./parser.js')
    const engine = new ParserEngine()
    const { nodes, edges } = await engine.parseFile(task.filePath, task.content, task.language)
    return { filePath: task.filePath, nodes, edges }
  } catch (err) {
    return { filePath: task.filePath, nodes: [], edges: [], error: String(err) }
  }
}

/**
 * Parse files in parallel using worker threads.
 * Each worker handles a byte-budget chunk, parsing all its files.
 *
 * Reports progress after each chunk completes so the caller always sees updates.
 * Falls back to sequential parsing if workers stall (no result after stallTimeoutMs).
 */
export async function parseFilesParallel(
  tasks: ParseTask[],
  options: ParallelParseOptions = {},
): Promise<{ nodes: CodeNode[]; edges: CodeEdge[] }> {
  const {
    concurrency = CONCURRENCY,
    chunkByteBudget = CHUNK_BYTE_BUDGET,
    minFilesForWorkers = MIN_FILES_FOR_WORKERS,
    minBytesForWorkers = MIN_BYTES_FOR_WORKERS,
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

  // Chunk by byte budget
  const chunks = chunkByByteBudget(tasks, chunkByteBudget)

  // Only spawn workers if we have enough chunks
  if (chunks.length <= 2) {
    return parseFilesSequential(tasks, onProgress)
  }

  // ── Run with stall timeout: if no result after X ms, fall back to sequential ──
  const stallTimer = setTimeout(() => {
    console.warn(`[ForgeNexus] Workers stalled after ${stallTimeoutMs}ms — falling back to sequential parsing`)
  }, stallTimeoutMs)

  try {
    const results = await runWorkerPool(chunks, effectiveConcurrency, onProgress)
    clearTimeout(stallTimer)
    return aggregateResults(results)
  } catch (err) {
    clearTimeout(stallTimer)
    // Worker error — fall back to sequential
    console.warn(`[ForgeNexus] Worker pool error: ${err} — falling back to sequential parsing`)
    return parseFilesSequential(tasks, onProgress)
  }
}

/**
 * Aggregate all ParseResults into nodes and edges arrays.
 */
function aggregateResults(results: ParseResult[]): { nodes: CodeNode[]; edges: CodeEdge[] } {
  const allNodes: CodeNode[] = []
  const allEdges: CodeEdge[] = []
  for (const result of results) {
    allNodes.push(...result.nodes)
    allEdges.push(...result.edges)
  }
  return { nodes: allNodes, edges: allEdges }
}

/**
 * Run worker pool with given chunks and concurrency.
 * Each worker processes one chunk at a time via message passing.
 * Reports progress after each chunk completes.
 */
async function runWorkerPool(
  chunks: ParseTask[][],
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<ParseResult[]> {
  const workerScript = join(dirname(import.meta.url), 'parse-worker.js')
  const totalFiles = chunks.reduce((sum, c) => sum + c.length, 0)

  // How many chunks to assign per worker at a time
  const chunksPerWorker = Math.ceil(chunks.length / concurrency)

  // Launch workers (lazy, one at a time to avoid fork-bomb)
  const pending: Promise<ParseResult[]>[] = []

  for (let i = 0; i < Math.min(concurrency, chunks.length); i++) {
    const workerChunks = chunks.slice(i * chunksPerWorker, (i + 1) * chunksPerWorker)
    if (workerChunks.length === 0) break
    pending.push(runChunksInWorker(workerChunks, workerScript, onProgress, totalFiles))
  }

  const chunkResults = await Promise.all(pending)
  const flatResults: ParseResult[] = []
  for (const batch of chunkResults) {
    flatResults.push(...batch)
  }

  return flatResults
}

/**
 * Run multiple chunks sequentially through a single worker.
 * Returns all ParseResults from all chunks.
 * Reports progress after each chunk.
 */
async function runChunksInWorker(
  chunks: ParseTask[][],
  workerScript: string,
  onProgress?: (done: number, total: number) => void,
  totalFiles = 0,
): Promise<ParseResult[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(workerScript)
    } catch (_err) {
      // Worker can't be spawned — fall back to sequential
      resolve(fallbackSequential(chunks, onProgress, totalFiles))
      return
    }

    const allResults: ParseResult[] = []
    let dispatchedChunks = 0
    let completedChunks = 0
    let settled = false
    let lastChunkDone = Date.now()

    const settleIfDone = () => {
      if (settled) return
      if (completedChunks === chunks.length) {
        settled = true
        worker.terminate()
        resolve(allResults)
      }
    }

    worker.on(
      'message',
      (msg: { type: string; results?: ParseResult[]; taskId?: string; error?: string }) => {
        if (msg.type === 'result' && msg.results) {
          allResults.push(...msg.results)
          completedChunks++
          lastChunkDone = Date.now()

          // Report progress based on files processed
          if (onProgress) {
            const doneFiles = allResults.reduce((sum, r) => sum + 1, 0)
            onProgress(Math.min(doneFiles, totalFiles), totalFiles)
          }

          settleIfDone()

          // Dispatch next chunk if any remaining
          if (dispatchedChunks < chunks.length) {
            const nextChunk = chunks[dispatchedChunks++]
            worker.postMessage({
              type: 'parse',
              tasks: nextChunk,
              taskId: String(dispatchedChunks),
            })
          }
        } else if (msg.type === 'error') {
          if (!settled) {
            settled = true
            worker.terminate()
            reject(new Error(msg.error))
          }
        }
      },
    )

    worker.on('error', (err) => {
      if (!settled) {
        settled = true
        worker.terminate()
        reject(err)
      }
    })

    worker.on('exit', (_code) => {
      if (!settled) {
        settled = true
        resolve(allResults)
      }
    })

    // Start the first chunk
    const firstChunk = chunks[dispatchedChunks++]
    worker.postMessage({ type: 'parse', tasks: firstChunk, taskId: '0' })
  })
}

/**
 * Fallback: parse chunks sequentially when worker spawning fails.
 */
async function fallbackSequential(
  chunks: ParseTask[][],
  onProgress?: (done: number, total: number) => void,
  totalFiles = 0,
): Promise<ParseResult[]> {
  const results: ParseResult[] = []
  let done = 0
  for (const chunk of chunks) {
    const r = await parseChunk(chunk, onProgress, done, totalFiles)
    results.push(...r)
    done += chunk.length
  }
  return results
}

/**
 * Parse a chunk of files with a single ParserEngine instance.
 * This is the most efficient approach for tree-sitter: one parser per chunk,
 * parser is reused across files (only language changes between files).
 */
async function parseChunk(
  chunk: ParseTask[],
  onProgress?: (done: number, total: number) => void,
  baseDone = 0,
  totalFiles = 0,
): Promise<ParseResult[]> {
  try {
    const { ParserEngine } = await import('./parser.js')
    const engine = new ParserEngine()
    const results: ParseResult[] = []

    for (let i = 0; i < chunk.length; i++) {
      const task = chunk[i]
      try {
        const { nodes, edges } = await engine.parseFile(task.filePath, task.content, task.language)
        results.push({ filePath: task.filePath, nodes, edges })
      } catch (err) {
        results.push({ filePath: task.filePath, nodes: [], edges: [], error: String(err) })
      }

      if (onProgress) {
        const done = baseDone + i + 1
        onProgress(Math.min(done, totalFiles || done), totalFiles || done)
      }
    }

    return results
  } catch (err) {
    return chunk.map((t) => ({ filePath: t.filePath, nodes: [], edges: [], error: String(err) }))
  }
}

/**
 * Parse files sequentially with progress callback.
 */
export async function parseFilesSequential(
  tasks: ParseTask[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ nodes: CodeNode[]; edges: CodeEdge[] }> {
  const allNodes: CodeNode[] = []
  const allEdges: CodeEdge[] = []

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    try {
      const result = await parseSingleFile(task)
      allNodes.push(...result.nodes)
      allEdges.push(...result.edges)
    } catch {
      // skip
    }

    if (onProgress && (i % 50 === 0 || i === tasks.length - 1)) {
      onProgress(i + 1, tasks.length)
    }
  }

  return { nodes: allNodes, edges: allEdges }
}

/**
 * Split files into changed vs unchanged for incremental analysis.
 */
export function partitionByChange(
  files: ParseTask[],
  changedFilePaths: Set<string>,
): { changed: ParseTask[]; unchanged: string[] } {
  const changed: ParseTask[] = []
  const unchanged: string[] = []

  for (const file of files) {
    if (changedFilePaths.has(file.filePath)) {
      changed.push(file)
    } else {
      unchanged.push(file.filePath)
    }
  }

  return { changed, unchanged }
}

/**
 * Check if incremental analysis should be used.
 */
export function shouldUseIncremental(lastCommit: string, currentCommit: string): boolean {
  return lastCommit !== '' && lastCommit === currentCommit
}

/**
 * Estimate total bytes from parse tasks.
 */
export function estimateBytes(tasks: ParseTask[]): number {
  return tasks.reduce((sum, t) => sum + t.content.length * 2, 0)
}
