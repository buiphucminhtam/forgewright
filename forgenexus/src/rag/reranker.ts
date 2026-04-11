/**
 * RAG Module - Result Reranking for ForgeWright
 * 
 * Provides reranking of search results using various strategies.
 */

export interface RerankResult {
  id: string;
  file: string;
  text: string;
  score: number;
  originalScore: number;
  rerankScore: number;
  metadata?: Record<string, unknown>;
}

export interface RerankerOptions {
  diversityWeight?: number;
  recencyWeight?: number;
  proximityWeight?: number;
}

/**
 * Rerank results considering diversity
 */
export function rerankWithDiversity<T extends { id: string; file: string; score: number; text: string }>(
  results: T[],
  options: { diversityWeight?: number } = {}
): RerankResult[] {
  const { diversityWeight = 0.3 } = options;
  
  if (results.length <= 1) {
    return results.map(r => ({
      ...r,
      originalScore: r.score,
      rerankScore: r.score,
    }));
  }

  const reranked: RerankResult[] = [];
  const usedFiles = new Set<string>();

  // Sort by diversity-adjusted score
  const adjustedResults = results.map(r => {
    const fileDiversityBonus = usedFiles.has(r.file) ? 0 : diversityWeight;
    return {
      ...r,
      originalScore: r.score,
      rerankScore: r.score + fileDiversityBonus,
    };
  });

  // Greedy selection with diversity
  adjustedResults.sort((a, b) => b.rerankScore - a.rerankScore);

  for (const result of adjustedResults) {
    if (reranked.length >= results.length) break;
    
    reranked.push(result as RerankResult);
    usedFiles.add(result.file);
  }

  return reranked;
}

/**
 * Rerank with recency boost
 */
export function rerankWithRecency<T extends { id: string; score: number; text: string; metadata?: Record<string, unknown> }>(
  results: T[],
  options: { recencyWeight?: number; getTimestamp?: (item: T) => Date } = {}
): RerankResult[] {
  const { recencyWeight = 0.2, getTimestamp = () => new Date() } = options;
  
  if (results.length === 0) return [];

  // Get time range
  const timestamps = results.map(r => getTimestamp(r).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeRange = maxTime - minTime || 1;

  return results.map(r => {
    const itemTime = getTimestamp(r).getTime();
    const recencyScore = (itemTime - minTime) / timeRange;
    
    return {
      id: r.id,
      file: r.id,
      text: r.text,
      score: r.score,
      originalScore: r.score,
      rerankScore: (1 - recencyWeight) * r.score + recencyWeight * recencyScore,
      metadata: r.metadata,
    };
  }).sort((a, b) => b.rerankScore - a.rerankScore);
}

/**
 * Rerank with MMR (Maximal Marginal Relevance)
 */
export function rerankWithMMR<T extends { id: string; file: string; score: number; text: string }>(
  results: T[],
  options: {
    lambda?: number;
    embeddingFunction?: (text: string) => number[];
  } = {}
): RerankResult[] {
  const { lambda = 0.5, embeddingFunction } = options;
  
  if (!embeddingFunction || results.length <= 1) {
    return results.map(r => ({
      ...r,
      originalScore: r.score,
      rerankScore: r.score,
    }));
  }

  const reranked: RerankResult[] = [];
  const remaining = [...results];

  // Get embeddings for all results
  const embeddings = new Map<string, number[]>();
  for (const result of results) {
    embeddings.set(result.id, embeddingFunction(result.text));
  }

  while (remaining.length > 0 && reranked.length < results.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const result = remaining[i];
      const relevance = result.score;
      
      // Calculate diversity (minimum similarity to selected)
      let minSimilarity = 1;
      const resultEmbedding = embeddings.get(result.id) ?? [];
      
      for (const selected of reranked) {
        const selectedEmbedding = embeddings.get(selected.id) ?? [];
        const similarity = cosineSimilarity(resultEmbedding, selectedEmbedding);
        minSimilarity = Math.min(minSimilarity, similarity);
      }

      // MMR formula: λ * relevance - (1 - λ) * diversity
      const mmrScore = lambda * relevance - (1 - lambda) * (1 - minSimilarity);

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIndex = i;
      }
    }

    const selected = remaining.splice(bestIndex, 1)[0];
    reranked.push({
      ...selected,
      originalScore: selected.score,
      rerankScore: bestScore,
    });
  }

  return reranked;
}

/**
 * Simple cosine similarity
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Cross-encoder reranking
 */
export function rerankWithCrossEncoder<T extends { id: string; text: string }>(
  query: string,
  results: T[],
  options: {
    crossEncoderFunction?: (query: string, text: string) => number;
    topK?: number;
  } = {}
): RerankResult[] {
  const { crossEncoderFunction, topK = 10 } = options;
  
  if (!crossEncoderFunction) {
    // Fallback to simple scoring
    return results.slice(0, topK).map((r, i) => ({
      id: r.id,
      file: r.id,
      text: r.text,
      score: 1 - i / results.length,
      originalScore: 1 - i / results.length,
      rerankScore: 1 - i / results.length,
    }));
  }

  // Score each result with cross-encoder
  const scored = results.map(r => ({
    ...r,
    originalScore: crossEncoderFunction(query, r.text),
  }));

  // Sort and limit
  scored.sort((a, b) => b.originalScore - a.originalScore);

  return scored.slice(0, topK).map((r, i) => ({
    id: r.id,
    file: r.id,
    text: r.text,
    score: r.originalScore,
    originalScore: r.originalScore,
    rerankScore: r.originalScore,
  }));
}

/**
 * Compose multiple rerankers
 */
export function composeRerankers<T extends { id: string; file: string; score: number; text: string }>(
  ...rerankers: Array<(results: T[]) => RerankResult[]>
): (results: T[]) => RerankResult[] {
  return (results: T[]) => {
    let current: RerankResult[] = results.map(r => ({
      id: r.id,
      file: r.file,
      text: r.text,
      score: r.score,
      originalScore: r.score,
      rerankScore: r.score,
    }));
    
    for (const reranker of rerankers) {
      current = reranker(current as unknown as T[]);
    }
    
    return current;
  };
}

/**
 * Default reranker combining relevance and diversity
 */
export function defaultReranker<T extends { id: string; file: string; score: number; text: string }>(
  results: T[],
  options: {
    topK?: number;
    diversityWeight?: number;
  } = {}
): RerankResult[] {
  const { topK = 10, diversityWeight = 0.2 } = options;
  
  // First rerank with diversity
  const diverse = rerankWithDiversity(results, { diversityWeight });
  
  // Then take top K
  return diverse.slice(0, topK).map((r, i) => ({
    ...r,
    rerankScore: r.score * (1 - i / topK * 0.2), // Slight boost for position
  }));
}
