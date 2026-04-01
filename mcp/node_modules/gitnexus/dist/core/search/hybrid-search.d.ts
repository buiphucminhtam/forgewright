/**
 * Hybrid Search with Reciprocal Rank Fusion (RRF)
 *
 * Combines BM25 (keyword) and semantic (embedding) search results.
 * Uses RRF to merge rankings without needing score normalization.
 *
 * This is the same approach used by Elasticsearch, Pinecone, and other
 * production search systems.
 */
import { type BM25SearchResult } from './bm25-index.js';
import type { SemanticSearchResult } from '../embeddings/types.js';
export interface HybridSearchResult {
    filePath: string;
    score: number;
    rank: number;
    sources: ('bm25' | 'semantic')[];
    nodeId?: string;
    name?: string;
    label?: string;
    startLine?: number;
    endLine?: number;
    bm25Score?: number;
    semanticScore?: number;
}
/**
 * Perform hybrid search combining BM25 and semantic results
 *
 * @param bm25Results - Results from BM25 keyword search
 * @param semanticResults - Results from semantic/embedding search
 * @param limit - Maximum results to return
 * @returns Merged and re-ranked results
 */
export declare const mergeWithRRF: (bm25Results: BM25SearchResult[], semanticResults: SemanticSearchResult[], limit?: number) => HybridSearchResult[];
/**
 * Check if hybrid search is available
 * LadybugDB FTS is always available once the database is initialized.
 * Semantic search is optional - hybrid works with just FTS if embeddings aren't ready.
 */
export declare const isHybridSearchReady: () => boolean;
/**
 * Format hybrid results for LLM consumption
 */
export declare const formatHybridResults: (results: HybridSearchResult[]) => string;
/**
 * Execute BM25 + semantic search and merge with RRF.
 * Uses LadybugDB FTS for always-fresh BM25 results (no cached data).
 * The semanticSearch function is injected to keep this module environment-agnostic.
 */
export declare const hybridSearch: (query: string, limit: number, executeQuery: (cypher: string) => Promise<any[]>, semanticSearch: (executeQuery: (cypher: string) => Promise<any[]>, query: string, k?: number) => Promise<SemanticSearchResult[]>) => Promise<HybridSearchResult[]>;
