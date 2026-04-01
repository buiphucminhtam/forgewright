/**
 * Embedding Pipeline Types
 *
 * Type definitions for the embedding generation and semantic search system.
 */
/**
 * Node labels that should be embedded for semantic search
 * These are code elements that benefit from semantic matching
 */
export declare const EMBEDDABLE_LABELS: readonly ["Function", "Class", "Method", "Interface", "File"];
export type EmbeddableLabel = typeof EMBEDDABLE_LABELS[number];
/**
 * Check if a label should be embedded
 */
export declare const isEmbeddableLabel: (label: string) => label is EmbeddableLabel;
/**
 * Embedding pipeline phases
 */
export type EmbeddingPhase = 'idle' | 'loading-model' | 'embedding' | 'indexing' | 'ready' | 'error';
/**
 * Progress information for the embedding pipeline
 */
export interface EmbeddingProgress {
    phase: EmbeddingPhase;
    percent: number;
    modelDownloadPercent?: number;
    nodesProcessed?: number;
    totalNodes?: number;
    currentBatch?: number;
    totalBatches?: number;
    error?: string;
}
/**
 * Configuration for the embedding pipeline
 */
export interface EmbeddingConfig {
    /** Model identifier for transformers.js (local) or the HTTP endpoint model name */
    modelId: string;
    /** Number of nodes to embed in each batch */
    batchSize: number;
    /** Embedding vector dimensions */
    dimensions: number;
    /** Device to use for inference: 'auto' tries GPU first (DirectML on Windows, CUDA on Linux), falls back to CPU */
    device: 'auto' | 'dml' | 'cuda' | 'cpu' | 'wasm';
    /** Maximum characters of code snippet to include */
    maxSnippetLength: number;
}
/**
 * Default embedding configuration
 * Uses snowflake-arctic-embed-xs for browser efficiency
 * Tries WebGPU first (fast), user can choose WASM fallback if unavailable
 */
export declare const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig;
/**
 * Result from semantic search
 */
export interface SemanticSearchResult {
    nodeId: string;
    name: string;
    label: string;
    filePath: string;
    distance: number;
    startLine?: number;
    endLine?: number;
}
/**
 * Node data for embedding (minimal structure from LadybugDB query)
 */
export interface EmbeddableNode {
    id: string;
    name: string;
    label: string;
    filePath: string;
    content: string;
    startLine?: number;
    endLine?: number;
}
/**
 * Model download progress from transformers.js
 */
export interface ModelProgress {
    status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
}
