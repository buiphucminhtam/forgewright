/**
 * Embedder Module (Read-Only)
 *
 * Singleton factory for transformers.js embedding pipeline.
 * For MCP, we only need to compute query embeddings, not batch embed.
 */
import { type FeatureExtractionPipeline } from '@huggingface/transformers';
/**
 * Initialize the embedding model (lazy, on first search)
 */
export declare const initEmbedder: () => Promise<FeatureExtractionPipeline>;
/**
 * Check if embedder is ready
 */
export declare const isEmbedderReady: () => boolean;
/**
 * Embed a query text for semantic search
 */
export declare const embedQuery: (query: string) => Promise<number[]>;
/**
 * Get embedding dimensions
 */
export declare const getEmbeddingDims: () => number;
/**
 * Cleanup embedder
 */
export declare const disposeEmbedder: () => Promise<void>;
