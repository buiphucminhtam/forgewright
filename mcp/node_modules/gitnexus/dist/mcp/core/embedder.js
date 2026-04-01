/**
 * Embedder Module (Read-Only)
 *
 * Singleton factory for transformers.js embedding pipeline.
 * For MCP, we only need to compute query embeddings, not batch embed.
 */
import { pipeline, env } from '@huggingface/transformers';
import { isHttpMode, getHttpDimensions, httpEmbedQuery } from '../../core/embeddings/http-client.js';
// Model config
const MODEL_ID = 'Snowflake/snowflake-arctic-embed-xs';
// Module-level state for singleton pattern
let embedderInstance = null;
let isInitializing = false;
let initPromise = null;
/**
 * Initialize the embedding model (lazy, on first search)
 */
export const initEmbedder = async () => {
    if (isHttpMode()) {
        throw new Error('initEmbedder() should not be called in HTTP mode.');
    }
    if (embedderInstance) {
        return embedderInstance;
    }
    if (isInitializing && initPromise) {
        return initPromise;
    }
    isInitializing = true;
    initPromise = (async () => {
        try {
            env.allowLocalModels = false;
            console.error('GitNexus: Loading embedding model (first search may take a moment)...');
            // Try GPU first (DirectML on Windows, CUDA on Linux), fall back to CPU
            const isWindows = process.platform === 'win32';
            const gpuDevice = isWindows ? 'dml' : 'cuda';
            const devicesToTry = [gpuDevice, 'cpu'];
            for (const device of devicesToTry) {
                try {
                    // Silence stdout and stderr during model load — ONNX Runtime and transformers.js
                    // may write progress/init messages that corrupt MCP stdio protocol or produce
                    // noisy warnings (e.g. node assignment to execution providers).
                    const origStdout = process.stdout.write;
                    const origStderr = process.stderr.write;
                    process.stdout.write = (() => true);
                    process.stderr.write = (() => true);
                    try {
                        embedderInstance = await pipeline('feature-extraction', MODEL_ID, {
                            device: device,
                            dtype: 'fp32',
                        });
                    }
                    finally {
                        process.stdout.write = origStdout;
                        process.stderr.write = origStderr;
                    }
                    console.error(`GitNexus: Embedding model loaded (${device})`);
                    return embedderInstance;
                }
                catch {
                    if (device === 'cpu')
                        throw new Error('Failed to load embedding model');
                }
            }
            throw new Error('No suitable device found');
        }
        catch (error) {
            isInitializing = false;
            initPromise = null;
            embedderInstance = null;
            throw error;
        }
        finally {
            isInitializing = false;
        }
    })();
    return initPromise;
};
/**
 * Check if embedder is ready
 */
export const isEmbedderReady = () => isHttpMode() || embedderInstance !== null;
/**
 * Embed a query text for semantic search
 */
export const embedQuery = async (query) => {
    if (isHttpMode()) {
        return httpEmbedQuery(query);
    }
    const embedder = await initEmbedder();
    const result = await embedder(query, {
        pooling: 'mean',
        normalize: true,
    });
    return Array.from(result.data);
};
/**
 * Get embedding dimensions
 */
export const getEmbeddingDims = () => {
    return getHttpDimensions() ?? 384;
};
/**
 * Cleanup embedder
 */
export const disposeEmbedder = async () => {
    if (embedderInstance) {
        try {
            if ('dispose' in embedderInstance && typeof embedderInstance.dispose === 'function') {
                await embedderInstance.dispose();
            }
        }
        catch { }
        embedderInstance = null;
        initPromise = null;
    }
};
