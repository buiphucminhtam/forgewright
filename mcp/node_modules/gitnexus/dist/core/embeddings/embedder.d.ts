/**
 * Embedder Module
 *
 * Singleton factory for transformers.js embedding pipeline.
 * Handles model loading, caching, and both single and batch embedding operations.
 *
 * Uses snowflake-arctic-embed-xs by default (22M params, 384 dims, ~90MB)
 */
import { type FeatureExtractionPipeline } from '@huggingface/transformers';
import { type EmbeddingConfig, type ModelProgress } from './types.js';
/**
 * Progress callback type for model loading
 */
export type ModelProgressCallback = (progress: ModelProgress) => void;
/**
 * Get the current device being used for inference
 */
export declare const getCurrentDevice: () => "dml" | "cuda" | "cpu" | "wasm" | null;
/**
 * Initialize the embedding model
 * Uses singleton pattern - only loads once, subsequent calls return cached instance
 *
 * @param onProgress - Optional callback for model download progress
 * @param config - Optional configuration override
 * @param forceDevice - Force a specific device
 * @returns Promise resolving to the embedder pipeline
 */
export declare const initEmbedder: (onProgress?: ModelProgressCallback, config?: Partial<EmbeddingConfig>, forceDevice?: "dml" | "cuda" | "cpu" | "wasm") => Promise<FeatureExtractionPipeline>;
/**
 * Check if the embedder is initialized and ready
 */
export declare const isEmbedderReady: () => boolean;
/**
 * Get the effective embedding dimensions.
 * In HTTP mode, uses GITNEXUS_EMBEDDING_DIMS if set, otherwise the default.
 */
export declare const getEmbeddingDimensions: () => number;
/**
 * Get the embedder instance (throws if not initialized)
 */
export declare const getEmbedder: () => FeatureExtractionPipeline;
/**
 * Embed a single text string
 *
 * @param text - Text to embed
 * @returns Float32Array of embedding vector
 */
export declare const embedText: (text: string) => Promise<Float32Array>;
/**
 * Embed multiple texts in a single batch
 * More efficient than calling embedText multiple times
 *
 * @param texts - Array of texts to embed
 * @returns Array of Float32Array embedding vectors
 */
export declare const embedBatch: (texts: string[]) => Promise<Float32Array[]>;
/**
 * Convert Float32Array to regular number array (for LadybugDB storage)
 */
export declare const embeddingToArray: (embedding: Float32Array) => number[];
/**
 * Cleanup the embedder (free memory)
 * Call this when done with embeddings
 */
export declare const disposeEmbedder: () => Promise<void>;
