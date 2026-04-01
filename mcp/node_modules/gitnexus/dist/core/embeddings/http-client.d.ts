/**
 * HTTP Embedding Client
 *
 * Shared fetch+retry logic for OpenAI-compatible /v1/embeddings endpoints.
 * Imported by both the core embedder (batch) and MCP embedder (query).
 */
/**
 * Check whether HTTP embedding mode is active (env vars are set).
 */
export declare const isHttpMode: () => boolean;
/**
 * Return the configured embedding dimensions for HTTP mode, or undefined
 * if HTTP mode is not active or no explicit dimensions are set.
 */
export declare const getHttpDimensions: () => number | undefined;
/**
 * Embed texts via the HTTP backend, splitting into batches.
 * Reads config from env vars on every call.
 *
 * @param texts - Array of texts to embed
 * @returns Array of Float32Array embedding vectors
 */
export declare const httpEmbed: (texts: string[]) => Promise<Float32Array[]>;
/**
 * Embed a single query text via the HTTP backend.
 * Convenience for MCP search where only one vector is needed.
 *
 * @param text - Query text to embed
 * @returns Embedding vector as number array
 */
export declare const httpEmbedQuery: (text: string) => Promise<number[]>;
