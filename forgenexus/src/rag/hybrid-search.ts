/**
 * RAG Module - Hybrid Search for ForgeWright
 * 
 * Combines BM25 keyword search with vector similarity search.
 */

export interface SearchResult {
  id: string;
  file: string;
  line?: number;
  lineEnd?: number;
  text: string;
  score: number;
  scoreBreakdown?: {
    bm25: number;
    vector: number;
    combined: number;
  };
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  limit?: number;
  bm25Weight?: number;
  vectorWeight?: number;
  minScore?: number;
  rerank?: boolean;
}

/**
 * BM25 ranking function
 */
export function bm25(
  query: string,
  documents: Array<{ id: string; text: string }>,
  k1: number = 1.5,
  b: number = 0.75
): Map<string, number> {
  const scores = new Map<string, number>();
  
  // Tokenize query
  const queryTokens = tokenize(query);
  
  // Calculate document frequencies
  const docFreqs = new Map<string, number>();
  const docLengths: number[] = [];
  const tokenizedDocs: Map<string, string[]> = new Map();
  
  let avgDocLength = 0;
  
  for (const doc of documents) {
    const tokens = tokenize(doc.text);
    tokenizedDocs.set(doc.id, tokens);
    docLengths.push(tokens.length);
    avgDocLength += tokens.length;
    
    // Count document frequencies
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      docFreqs.set(token, (docFreqs.get(token) ?? 0) + 1);
    }
  }
  
  avgDocLength /= documents.length;
  
  // Calculate BM25 scores
  for (const doc of documents) {
    const tokens = tokenizedDocs.get(doc.id) ?? [];
    let score = 0;
    
    for (const term of queryTokens) {
      if (!tokens.includes(term)) continue;
      
      const tf = tokens.filter(t => t === term).length;
      const df = docFreqs.get(term) ?? 0;
      
      if (df === 0) continue;
      
      const N = documents.length;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (tokens.length / avgDocLength));
      
      score += idf * (numerator / denominator);
    }
    
    scores.set(doc.id, score);
  }
  
  return scores;
}

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[^\w]/g, ''))
    .filter(t => t.length > 2);
}

/**
 * Simple TF-IDF vectorizer
 */
export function createTfidfVectors(
  documents: Array<{ id: string; text: string }>
): Map<string, Map<string, number>> {
  const vectors = new Map<string, Map<string, number>>();
  
  // Count terms
  const termDocs = new Map<string, number>();
  const docTermCounts: Map<string, Map<string, number>> = new Map();
  const docLengths: number[] = [];
  
  for (const doc of documents) {
    const tokens = tokenize(doc.text);
    const counts = new Map<string, number>();
    
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
      termDocs.set(token, (termDocs.get(token) ?? 0) + 1);
    }
    
    docTermCounts.set(doc.id, counts);
    docLengths.push(tokens.length);
  }
  
  // Calculate TF-IDF
  const N = documents.length;
  
  for (const doc of documents) {
    const vector = new Map<string, number>();
    const counts = docTermCounts.get(doc.id) ?? new Map();
    
    for (const [term, tf] of counts) {
      const df = termDocs.get(term) ?? 0;
      const idf = Math.log(N / df);
      const tfidf = (tf / counts.size) * idf;
      vector.set(term, tfidf);
    }
    
    vectors.set(doc.id, vector);
  }
  
  return vectors;
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (const [term, value] of a) {
    dotProduct += value * (b.get(term) ?? 0);
    normA += value * value;
  }
  
  for (const [term, value] of b) {
    normB += value * value;
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Vector search using TF-IDF
 */
export function vectorSearch(
  query: string,
  documents: Array<{ id: string; text: string }>,
  vectors: Map<string, Map<string, number>>
): Map<string, number> {
  const scores = new Map<string, number>();
  
  // Create query vector
  const queryTokens = tokenize(query);
  const queryCounts = new Map<string, number>();
  
  for (const token of queryTokens) {
    queryCounts.set(token, (queryCounts.get(token) ?? 0) + 1);
  }
  
  // Normalize query counts to TF
  const queryVector = new Map<string, number>();
  for (const [term, count] of queryCounts) {
    queryVector.set(term, count / queryTokens.length);
  }
  
  // Calculate similarities
  for (const doc of documents) {
    const docVector = vectors.get(doc.id);
    if (!docVector) continue;
    
    const similarity = cosineSimilarity(queryVector, docVector);
    scores.set(doc.id, similarity);
  }
  
  return scores;
}

/**
 * Hybrid search combining BM25 and vector search
 */
export function hybridSearch(
  query: string,
  documents: Array<{ id: string; text: string }>,
  options: SearchOptions = {}
): SearchResult[] {
  const {
    limit = 10,
    bm25Weight = 0.4,
    vectorWeight = 0.6,
    minScore = 0.1,
  } = options;
  
  if (documents.length === 0) return [];
  
  // Get BM25 scores
  const bm25Scores = bm25(query, documents);
  
  // Get vector scores
  const vectors = createTfidfVectors(documents);
  const vectorScores = vectorSearch(query, documents, vectors);
  
  // Normalize scores
  const maxBm25 = Math.max(...bm25Scores.values(), 0.001);
  const maxVector = Math.max(...vectorScores.values(), 0.001);
  
  // Combine scores
  const combinedScores = new Map<string, number>();
  
  for (const doc of documents) {
    const bm25Score = (bm25Scores.get(doc.id) ?? 0) / maxBm25;
    const vectorScore = (vectorScores.get(doc.id) ?? 0) / maxVector;
    
    const combined = (bm25Score * bm25Weight) + (vectorScore * vectorWeight);
    combinedScores.set(doc.id, combined);
  }
  
  // Sort and filter
  const results: SearchResult[] = [];
  
  for (const doc of documents) {
    const score = combinedScores.get(doc.id) ?? 0;
    
    if (score >= minScore) {
      results.push({
        id: doc.id,
        file: doc.id,
        text: doc.text,
        score,
        scoreBreakdown: {
          bm25: (bm25Scores.get(doc.id) ?? 0) / maxBm25,
          vector: (vectorScores.get(doc.id) ?? 0) / maxVector,
          combined: score,
        },
      });
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  
  return results.slice(0, limit);
}

/**
 * Reciprocal Rank Fusion
 */
export function reciprocalRankFusion(
  rankings: Array<Map<string, number>>,
  k: number = 60
): Map<string, number> {
  const scores = new Map<string, number>();
  
  for (const ranking of rankings) {
    let rank = 1;
    
    // Sort by score descending
    const sorted = [...ranking.entries()].sort((a, b) => b[1] - a[1]);
    
    for (const [docId, score] of sorted) {
      const rrf = 1 / (k + rank);
      scores.set(docId, (scores.get(docId) ?? 0) + rrf);
      rank++;
    }
  }
  
  return scores;
}

/**
 * Advanced hybrid search with RRF
 */
export function advancedHybridSearch(
  query: string,
  documents: Array<{ id: string; text: string }>,
  options: SearchOptions = {}
): SearchResult[] {
  const { limit = 10, minScore = 0.01 } = options;
  
  if (documents.length === 0) return [];
  
  // Multiple search strategies
  const bm25Scores = bm25(query, documents);
  const vectors = createTfidfVectors(documents);
  const vectorScores = vectorSearch(query, documents, vectors);
  
  // Apply RRF
  const fusedScores = reciprocalRankFusion([bm25Scores, vectorScores]);
  
  // Create results
  const results: SearchResult[] = [];
  
  for (const doc of documents) {
    const score = fusedScores.get(doc.id) ?? 0;
    
    if (score >= minScore) {
      results.push({
        id: doc.id,
        file: doc.id,
        text: doc.text,
        score,
        scoreBreakdown: {
          bm25: bm25Scores.get(doc.id) ?? 0,
          vector: vectorScores.get(doc.id) ?? 0,
          combined: score,
        },
      });
    }
  }
  
  // Sort by RRF score
  results.sort((a, b) => b.score - a.score);
  
  return results.slice(0, limit);
}
