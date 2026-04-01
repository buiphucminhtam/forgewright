/**
 * Embedding Pipeline Types
 *
 * Type definitions for the embedding generation and semantic search system.
 */
/**
 * Node labels that should be embedded for semantic search
 * These are code elements that benefit from semantic matching
 */
export const EMBEDDABLE_LABELS = [
    'Function',
    'Class',
    'Method',
    'Interface',
    'File',
];
/**
 * Check if a label should be embedded
 */
export const isEmbeddableLabel = (label) => EMBEDDABLE_LABELS.includes(label);
/**
 * Default embedding configuration
 * Uses snowflake-arctic-embed-xs for browser efficiency
 * Tries WebGPU first (fast), user can choose WASM fallback if unavailable
 */
export const DEFAULT_EMBEDDING_CONFIG = {
    modelId: 'Snowflake/snowflake-arctic-embed-xs',
    batchSize: 16,
    dimensions: 384,
    device: 'auto',
    maxSnippetLength: 500,
};
