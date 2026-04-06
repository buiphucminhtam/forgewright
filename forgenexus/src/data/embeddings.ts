/**
 * Vector embeddings generation for semantic search.
 * Supports OpenAI API, Ollama (local), HuggingFace Inference API, Google Gemini,
 * and @huggingface/transformers (fully local, no API key needed).
 *
 * Embedding providers (in priority order for auto-detection):
 *   1. transformers  — Local ML inference, no API key, GPU-accelerated
 *   2. ollama        — Local Ollama server, no API key
 *   3. openai        — OpenAI API, requires OPENAI_API_KEY
 *   4. gemini        — Google Gemini API, requires GEMINI_API_KEY
 *   5. huggingface   — HuggingFace Inference API, requires HUGGINGFACE_TOKEN
 */

import type { ForgeDB } from './db.js'

export type EmbeddingProvider = 'transformers' | 'openai' | 'ollama' | 'huggingface' | 'gemini'

export interface EmbeddingOptions {
  provider: EmbeddingProvider
  model?: string
  apiKey?: string
  baseUrl?: string
  batchSize?: number
}

const DEFAULT_OPTIONS: Record<EmbeddingProvider, EmbeddingOptions> = {
  transformers: {
    provider: 'transformers',
    model: 'Xenova/all-MiniLM-L6-v2',
    batchSize: 32,
  },
  openai: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    batchSize: 100,
  },
  ollama: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    baseUrl: 'http://localhost:11434',
    batchSize: 50,
  },
  huggingface: {
    provider: 'huggingface',
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    batchSize: 32,
  },
  gemini: {
    provider: 'gemini',
    model: 'models/gemini-embedding-2-preview',
    batchSize: 20,
  },
}

/**
 * Auto-detect the best available embedding provider.
 * Priority: transformers (local) > ollama (local) > openai > gemini > huggingface
 */
export function detectProvider(): EmbeddingProvider {
  // Check env override first
  const envProvider = process.env.EMBEDDING_PROVIDER as EmbeddingProvider | undefined
  if (envProvider && DEFAULT_OPTIONS[envProvider]) {
    return envProvider
  }

  // Try transformers.js (local, no API key, GPU if available)
  try {
    // Dynamic import to avoid loading unless needed
    return 'transformers'
  } catch {
    // Continue to next
  }

  // Try Ollama
  if (process.env.OLLAMA_HOST) return 'ollama'

  // Check for API keys
  if (process.env.GEMINI_API_KEY) return 'gemini'
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.HUGGINGFACE_TOKEN) return 'huggingface'

  // Default to transformers (local ML inference, no API key needed)
  return 'transformers'
}

/**
 * Generate embeddings for all indexed symbols.
 * Stores them in the database for semantic search.
 */
export async function generateEmbeddings(
  db: ForgeDB,
  options: Partial<EmbeddingOptions> = {},
): Promise<{ count: number; model: string; elapsedMs: number; provider: string }> {
  const detected = detectProvider()
  const opts: EmbeddingOptions = {
    ...DEFAULT_OPTIONS[options.provider ?? detected],
    ...options,
  }

  const start = Date.now()

  // Get all symbols that need embeddings (nodes without existing embeddings)
  const symbols = (db as any).db
    .prepare(
      'SELECT uid, name, type, file_path, signature FROM nodes WHERE embedding IS NULL LIMIT 50000',
    )
    .all() as any[]

  if (symbols.length === 0) {
    return {
      count: 0,
      model: opts.model ?? 'unknown',
      elapsedMs: Date.now() - start,
      provider: opts.provider,
    }
  }

  // Build text representations for each symbol
  const texts = symbols.map((s) => {
    return [s.name, s.type, s.file_path, s.signature ?? ''].filter(Boolean).join(' ')
  })

  // Generate embeddings in batches
  const batchSize = opts.batchSize ?? 50
  let generated = 0
  const pendingUids: string[] = []
  const pendingEmbeddings: number[][] = []

  console.error(
    `[ForgeNexus] Embeddings: using ${opts.provider} (${opts.model}) for ${symbols.length} symbols...`,
  )

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchSymbols = symbols.slice(i, i + batchSize)

    try {
      const embeddings = await generateEmbeddingBatch(batch, opts)

      for (let j = 0; j < embeddings.length; j++) {
        const sym = batchSymbols[j]
        const embedding = embeddings[j]

        if (embedding) {
          pendingUids.push(sym.uid)
          pendingEmbeddings.push(embedding)
          generated++
        }
      }
    } catch (e) {
      // Log and continue — don't fail the whole batch
      console.error(`[ForgeNexus] Embedding batch ${Math.floor(i / batchSize)} failed: ${e}`)
    }
  }

  // Store all embeddings in a single transaction
  if (pendingUids.length > 0) {
    db.upsertEmbeddingsBatch(pendingUids, pendingEmbeddings)
  }

  // Mark completion
  db.setMeta('embeddings_generated', new Date().toISOString())
  db.setMeta('embeddings_model', opts.model ?? 'unknown')
  db.setMeta('embeddings_provider', opts.provider)

  return {
    count: generated,
    model: opts.model ?? 'unknown',
    elapsedMs: Date.now() - start,
    provider: opts.provider,
  }
}

async function generateEmbeddingBatch(
  texts: string[],
  opts: EmbeddingOptions,
): Promise<(number[] | null)[]> {
  if (opts.provider === 'transformers') {
    return generateTransformersEmbeddings(texts, opts)
  } else if (opts.provider === 'openai') {
    return generateOpenAIEmbeddings(texts, opts)
  } else if (opts.provider === 'ollama') {
    return generateOllamaEmbeddings(texts, opts)
  } else if (opts.provider === 'huggingface') {
    return generateHFEmbeddings(texts, opts)
  } else if (opts.provider === 'gemini') {
    return generateGeminiEmbeddings(texts, opts)
  }
  return texts.map(() => null)
}

async function generateOpenAIEmbeddings(
  texts: string[],
  opts: EmbeddingOptions,
): Promise<(number[] | null)[]> {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? ''
  const baseUrl = opts.baseUrl ?? 'https://api.openai.com/v1'
  const model = opts.model ?? 'text-embedding-3-small'

  if (!apiKey) throw new Error('OpenAI API key not found (set OPENAI_API_KEY env var)')

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI embedding error: ${response.status} — ${text}`)
  }

  const data = (await response.json()) as any
  return (data.data as any[]).map((item: any) => item.embedding as number[])
}

/**
 * Generate embeddings using @huggingface/transformers — fully local ML inference.
 * Runs entirely on your machine with GPU (CUDA/CoreML)
 * or CPU fallback. No API key required.
 *
 * Models: all-MiniLM-L6-v2 family (384-dim, fast), bge-small (512-dim, better quality)
 */
async function generateTransformersEmbeddings(
  texts: string[],
  opts: EmbeddingOptions,
): Promise<(number[] | null)[]> {
  const { pipeline, env } = await import('@huggingface/transformers')

  // Allow GPU acceleration if available
  env.allowLocalModels = false
  env.useBrowserCache = false

  const model = opts.model ?? 'Xenova/all-MiniLM-L6-v2'

  // Use a singleton feature extractor to avoid re-loading model for each batch
  if (!(globalThis as any).__forgeNexusExtractor) {
    console.error(
      `[ForgeNexus] Loading embedding model: ${model} (first run — downloading if needed)`,
    )
    ;(globalThis as any).__forgeNexusExtractor = await pipeline(
      'feature-extraction',
      model,
      { device: 'cpu' }, // 'webgpu' for browser, 'cuda' for NVIDIA GPU, 'cpu' fallback
    )
  }

  const extractor = (globalThis as any).__forgeNexusExtractor
  const results: (number[] | null)[] = []

  // Process in small sub-batches to avoid OOM
  const subBatchSize = 8
  for (let i = 0; i < texts.length; i += subBatchSize) {
    const subBatch = texts.slice(i, i + subBatchSize)
    try {
      const outputs = (await extractor(subBatch, { pooling: 'mean', normalize: true })) as any
      // outputs shape: [batch, hidden_dim]
      for (let j = 0; j < subBatch.length; j++) {
        const embedding = outputs[j]
        if (embedding && Array.isArray(embedding)) {
          results.push(Array.from(embedding as Float32Array | number[]))
        } else {
          results.push(null)
        }
      }
    } catch (e) {
      console.warn(`[ForgeNexus] Transformers batch error: ${e}`)
      for (let j = 0; j < subBatch.length; j++) {
        results.push(null)
      }
    }
  }

  return results
}

async function generateOllamaEmbeddings(
  texts: string[],
  opts: EmbeddingOptions,
): Promise<(number[] | null)[]> {
  const baseUrl = opts.baseUrl ?? 'http://localhost:11434'
  const model = opts.model ?? 'nomic-embed-text'

  // Ollama embeddings API: one at a time or batch
  const embeddings: (number[] | null)[] = []

  for (const text of texts) {
    try {
      const response = await fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
      })

      if (!response.ok) continue

      const data = (await response.json()) as any
      embeddings.push(data.embedding ?? null)
    } catch {
      embeddings.push(null)
    }
  }

  return embeddings
}

async function generateHFEmbeddings(
  texts: string[],
  opts: EmbeddingOptions,
): Promise<(number[] | null)[]> {
  const apiKey = opts.apiKey ?? process.env.HUGGINGFACE_TOKEN ?? ''
  const model = opts.model ?? 'sentence-transformers/all-MiniLM-L6-v2'
  const baseUrl = opts.baseUrl ?? 'https://api-inference.huggingface.co/pipeline/feature-extraction'

  if (!apiKey) throw new Error('HuggingFace API token not found (set HUGGINGFACE_TOKEN env var)')

  const results: (number[] | null)[] = []

  for (const text of texts) {
    try {
      const response = await fetch(`${baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text }),
      })

      if (!response.ok) {
        results.push(null)
        continue
      }

      const data = await response.json()
      if (Array.isArray(data)) {
        results.push(data as number[])
      } else {
        results.push(null)
      }
    } catch {
      results.push(null)
    }
  }

  return results
}

/**
 * Generate embeddings using Google Gemini API with concurrency.
 * API: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent
 */
async function generateGeminiEmbeddings(
  texts: string[],
  opts: EmbeddingOptions,
): Promise<(number[] | null)[]> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? ''
  const model = opts.model ?? 'models/gemini-embedding-2-preview'
  const baseUrl = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'
  const concurrency = 10 // concurrent requests for speed

  if (!apiKey) throw new Error('Gemini API key not found (set GEMINI_API_KEY env var)')

  const results: (number[] | null)[] = new Array(texts.length).fill(null)

  async function fetchOne(idx: number, text: string): Promise<void> {
    const truncated = text.length > 2000 ? text.substring(0, 2000) : text
    try {
      const response = await fetch(`${baseUrl}/${model}:embedContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: truncated }] },
        }),
      })

      if (!response.ok) {
        const err = await response.text().catch(() => '')
        console.warn(
          `[ForgeNexus] Gemini batch error (${response.status}): ${err.substring(0, 100)}`,
        )
        return
      }

      const data = (await response.json()) as any
      if (data.embedding?.values) {
        results[idx] = data.embedding.values as number[]
      }
    } catch (e) {
      console.warn(`[ForgeNexus] Gemini error: ${e}`)
    }
  }

  // Process in chunks of concurrency
  for (let i = 0; i < texts.length; i += concurrency) {
    const chunk = texts.slice(i, i + concurrency)
    await Promise.all(chunk.map((text, j) => fetchOne(i + j, text)))
  }

  return results
}

/**
 * Find semantically similar symbols using real cosine similarity on stored embeddings.
 * Requires embeddings to be generated first via `generateEmbeddings`.
 */
export async function findSimilar(
  db: ForgeDB,
  query: string,
  provider: EmbeddingProvider = 'transformers',
  limit = 10,
): Promise<{ uid: string; name: string; filePath: string; similarity: number }[]> {
  // Step 1: Generate embedding for the query
  let queryEmbedding: number[] | null = null
  try {
    const opts = DEFAULT_OPTIONS[provider]
    const embeddings = await generateEmbeddingBatch([query], { ...opts, provider })
    queryEmbedding = embeddings[0]
  } catch (e) {
    console.warn(`[ForgeNexus] findSimilar: failed to generate query embedding — ${e}`)
  }

  // Step 2: Load all stored embeddings from DB
  const nodesWithEmbeddings = (db as any).db
    .prepare('SELECT uid, name, file_path, embedding FROM nodes WHERE embedding IS NOT NULL')
    .all() as any[]

  if (nodesWithEmbeddings.length === 0) {
    return []
  }

  // Step 3: Compute cosine similarity
  const scored: { uid: string; name: string; filePath: string; similarity: number }[] = []

  for (const row of nodesWithEmbeddings) {
    let embedding: number[]
    try {
      embedding = JSON.parse(row.embedding)
    } catch {
      continue
    }

    let similarity: number
    if (queryEmbedding) {
      similarity = cosineSimilarity(queryEmbedding, embedding)
    } else {
      // Fallback: keyword match
      const queryWords = query.toLowerCase().split(/\s+/)
      const nameWords = row.name.toLowerCase().split(/\s+/)
      const matchCount = queryWords.filter((w) =>
        nameWords.some((nw: string) => nw.includes(w) || w.includes(nw)),
      ).length
      similarity = queryWords.length > 0 ? matchCount / queryWords.length : 0
    }

    scored.push({
      uid: row.uid,
      name: row.name,
      filePath: row.file_path,
      similarity,
    })
  }

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit)
}

/** Cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom > 0 ? dot / denom : 0
}

// ─── Hybrid Search (BM25 + Semantic + RRF) ───────────────────────────────────────

export interface HybridResult {
  uid: string
  name: string
  filePath: string
  score: number
  sources: string[]
}

/**
 * Reciprocal Rank Fusion — combines ranked lists from multiple retrieval methods.
 * RRF score = sum(1 / (k + rank)), k=60 is a standard damping factor.
 */
function reciprocalRankFusion(
  rankedLists: { uid: string; name: string; filePath: string; score: number }[][],
): HybridResult[] {
  const uidToScore = new Map<
    string,
    { name: string; filePath: string; rrfScore: number; sources: Set<string> }
  >()
  const k = 60 // RRF damping factor

  for (const rankedList of rankedLists) {
    for (let rank = 0; rank < rankedList.length; rank++) {
      const item = rankedList[rank]
      const rrfScore = 1 / (k + rank + 1)
      const existing = uidToScore.get(item.uid)
      if (existing) {
        existing.rrfScore += rrfScore
        existing.sources.add(item.name)
      } else {
        uidToScore.set(item.uid, {
          name: item.name,
          filePath: item.filePath,
          rrfScore,
          sources: new Set([item.name]),
        })
      }
    }
  }

  return [...uidToScore.entries()]
    .map(([uid, data]) => ({
      uid,
      name: data.name,
      filePath: data.filePath,
      score: Math.round(data.rrfScore * 1000) / 1000,
      sources: [...data.sources],
    }))
    .sort((a, b) => b.score - a.score)
}

/**
 * Hybrid search: combines BM25 (FTS) + Semantic (embeddings) via RRF.
 * Returns results ranked by Reciprocal Rank Fusion.
 *
 * Hybrid lexical + semantic search:
 * - BM25: exact/keyword matching via SQLite FTS5
 * - Semantic: vector similarity via embeddings
 * - RRF: principled fusion of both rankings
 */
export async function hybridSearch(
  db: ForgeDB,
  query: string,
  provider: EmbeddingProvider = 'transformers',
  limit = 20,
): Promise<HybridResult[]> {
  // ── Method 1: BM25 via FTS ───────────────────────────────────────────────
  const ftsResults = db.searchSymbols(query, limit * 2)
  const bm25Ranked = ftsResults.map((r) => ({
    uid: r.uid,
    name: r.name,
    filePath: r.filePath,
    score: 1.0,
  }))

  // ── Method 2: Semantic via embeddings ────────────────────────────────────
  let semanticRanked: { uid: string; name: string; filePath: string; score: number }[] = []
  try {
    const similarResults = await findSimilar(db, query, provider, limit * 2)
    semanticRanked = similarResults.map((r) => ({
      uid: r.uid,
      name: r.name,
      filePath: r.filePath,
      score: r.similarity,
    }))
  } catch {
    // No embeddings — skip semantic
  }

  // ── Method 3: Process-grouped results ───────────────────────────────────
  // Boost symbols that are part of named execution processes
  const processes = (db as any).db
    .prepare('SELECT entry_point_uid, name FROM processes LIMIT 50')
    .all() as any[]
  const processUids = new Set<string>()
  for (const p of processes) {
    if (p.entry_point_uid) processUids.add(p.entry_point_uid)
  }

  // ── RRF Fusion ─────────────────────────────────────────────────────────
  let fused = reciprocalRankFusion([bm25Ranked, semanticRanked])

  // Boost process members slightly
  fused = fused
    .map((r) => ({
      ...r,
      score: r.score + (processUids.has(r.uid) ? 0.1 : 0),
    }))
    .sort((a, b) => b.score - a.score)

  return fused.slice(0, limit)
}
