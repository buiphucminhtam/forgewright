/**
 * Embedding Pipeline Module
 *
 * Orchestrates the background embedding process:
 * 1. Query embeddable nodes from LadybugDB
 * 2. Generate text representations
 * 3. Batch embed using transformers.js
 * 4. Update LadybugDB with embeddings
 * 5. Create vector index for semantic search
 */
import { type EmbeddingProgress, type EmbeddingConfig, type SemanticSearchResult } from './types.js';
/**
 * Progress callback type
 */
export type EmbeddingProgressCallback = (progress: EmbeddingProgress) => void;
/**
 * Run the embedding pipeline
 *
 * @param executeQuery - Function to execute Cypher queries against LadybugDB
 * @param executeWithReusedStatement - Function to execute with reused prepared statement
 * @param onProgress - Callback for progress updates
 * @param config - Optional configuration override
 * @param skipNodeIds - Optional set of node IDs that already have embeddings (incremental mode)
 */
export declare const runEmbeddingPipeline: (executeQuery: (cypher: string) => Promise<any[]>, executeWithReusedStatement: (cypher: string, paramsList: Array<Record<string, any>>) => Promise<void>, onProgress: EmbeddingProgressCallback, config?: Partial<EmbeddingConfig>, skipNodeIds?: Set<string>) => Promise<void>;
/**
 * Perform semantic search using the vector index
 *
 * Uses CodeEmbedding table and queries each node table to get metadata
 *
 * @param executeQuery - Function to execute Cypher queries
 * @param query - Search query text
 * @param k - Number of results to return (default: 10)
 * @param maxDistance - Maximum distance threshold (default: 0.5)
 * @returns Array of search results ordered by relevance
 */
export declare const semanticSearch: (executeQuery: (cypher: string) => Promise<any[]>, query: string, k?: number, maxDistance?: number) => Promise<SemanticSearchResult[]>;
/**
 * Semantic search with graph expansion (flattened results)
 *
 * Note: With multi-table schema, graph traversal is simplified.
 * Returns semantic matches with their metadata.
 * For full graph traversal, use execute_vector_cypher tool directly.
 *
 * @param executeQuery - Function to execute Cypher queries
 * @param query - Search query text
 * @param k - Number of initial semantic matches (default: 5)
 * @param _hops - Unused (kept for API compatibility).
 * @returns Semantic matches with metadata
 */
export declare const semanticSearchWithContext: (executeQuery: (cypher: string) => Promise<any[]>, query: string, k?: number, _hops?: number) => Promise<any[]>;
