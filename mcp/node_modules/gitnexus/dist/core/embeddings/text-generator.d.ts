/**
 * Text Generator Module
 *
 * Pure functions to generate embedding text from code nodes.
 * Combines node metadata with code snippets for semantic matching.
 */
import type { EmbeddableNode, EmbeddingConfig } from './types.js';
/**
 * Generate embedding text for any embeddable node
 * Dispatches to the appropriate generator based on node label
 *
 * @param node - The node to generate text for
 * @param config - Optional configuration for max snippet length
 * @returns Text suitable for embedding
 */
export declare const generateEmbeddingText: (node: EmbeddableNode, config?: Partial<EmbeddingConfig>) => string;
/**
 * Generate embedding texts for a batch of nodes
 *
 * @param nodes - Array of nodes to generate text for
 * @param config - Optional configuration
 * @returns Array of texts in the same order as input nodes
 */
export declare const generateBatchEmbeddingTexts: (nodes: EmbeddableNode[], config?: Partial<EmbeddingConfig>) => string[];
