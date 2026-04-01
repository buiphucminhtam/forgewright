import lbug from '@ladybugdb/core';
import { KnowledgeGraph } from '../graph/types.js';
/** Expose the current Database for pool adapter reuse in tests. */
export declare const getDatabase: () => lbug.Database | null;
/**
 * Return true when the error message indicates that another process holds
 * an exclusive lock on the LadybugDB file (e.g. `gitnexus analyze` or
 * `gitnexus serve` running at the same time).
 */
export declare const isDbBusyError: (err: unknown) => boolean;
export declare const initLbug: (dbPath: string) => Promise<{
    db: lbug.Database;
    conn: lbug.Connection;
}>;
/**
 * Execute multiple queries against one repo DB atomically.
 * While the callback runs, no other request can switch the active DB.
 *
 * Automatically retries up to DB_LOCK_RETRY_ATTEMPTS times when the
 * database is busy (e.g. `gitnexus analyze` holds the write lock).
 * Each retry waits DB_LOCK_RETRY_DELAY_MS * attempt milliseconds.
 */
export declare const withLbugDb: <T>(dbPath: string, operation: () => Promise<T>) => Promise<T>;
export type LbugProgressCallback = (message: string) => void;
export declare const loadGraphToLbug: (graph: KnowledgeGraph, repoPath: string, storagePath: string, onProgress?: LbugProgressCallback) => Promise<{
    success: boolean;
    insertedRels: number;
    skippedRels: number;
    warnings: string[];
}>;
/**
 * Insert a single node to LadybugDB
 * @param label - Node type (File, Function, Class, etc.)
 * @param properties - Node properties
 * @param dbPath - Path to LadybugDB database (optional if already initialized)
 */
export declare const insertNodeToLbug: (label: string, properties: Record<string, any>, dbPath?: string) => Promise<boolean>;
/**
 * Batch insert multiple nodes to LadybugDB using a single connection
 * @param nodes - Array of {label, properties} to insert
 * @param dbPath - Path to LadybugDB database
 * @returns Object with success count and error count
 */
export declare const batchInsertNodesToLbug: (nodes: Array<{
    label: string;
    properties: Record<string, any>;
}>, dbPath: string) => Promise<{
    inserted: number;
    failed: number;
}>;
export declare const executeQuery: (cypher: string) => Promise<any[]>;
export declare const executeWithReusedStatement: (cypher: string, paramsList: Array<Record<string, any>>) => Promise<void>;
export declare const getLbugStats: () => Promise<{
    nodes: number;
    edges: number;
}>;
/**
 * Load cached embeddings from LadybugDB before a rebuild.
 * Returns all embedding vectors so they can be re-inserted after the graph is reloaded,
 * avoiding expensive re-embedding of unchanged nodes.
 */
export declare const loadCachedEmbeddings: () => Promise<{
    embeddingNodeIds: Set<string>;
    embeddings: Array<{
        nodeId: string;
        embedding: number[];
    }>;
}>;
export declare const closeLbug: () => Promise<void>;
export declare const isLbugReady: () => boolean;
/**
 * Delete all nodes (and their relationships) for a specific file from LadybugDB
 * @param filePath - The file path to delete nodes for
 * @param dbPath - Optional path to LadybugDB for per-query connection
 * @returns Object with counts of deleted nodes
 */
export declare const deleteNodesForFile: (filePath: string, dbPath?: string) => Promise<{
    deletedNodes: number;
}>;
export declare const getEmbeddingTableName: () => string;
/**
 * Load the FTS extension (required before using FTS functions).
 * Safe to call multiple times — tracks loaded state via module-level ftsLoaded.
 */
export declare const loadFTSExtension: () => Promise<void>;
/**
 * Create a full-text search index on a table
 * @param tableName - The node table name (e.g., 'File', 'CodeSymbol')
 * @param indexName - Name for the FTS index
 * @param properties - List of properties to index (e.g., ['name', 'code'])
 * @param stemmer - Stemming algorithm (default: 'porter')
 */
export declare const createFTSIndex: (tableName: string, indexName: string, properties: string[], stemmer?: string) => Promise<void>;
/**
 * Query a full-text search index
 * @param tableName - The node table name
 * @param indexName - FTS index name
 * @param query - Search query string
 * @param limit - Maximum results
 * @param conjunctive - If true, all terms must match (AND); if false, any term matches (OR)
 * @returns Array of { node properties, score }
 */
export declare const queryFTS: (tableName: string, indexName: string, query: string, limit?: number, conjunctive?: boolean) => Promise<Array<{
    nodeId: string;
    name: string;
    filePath: string;
    score: number;
    [key: string]: any;
}>>;
/**
 * Drop an FTS index
 */
export declare const dropFTSIndex: (tableName: string, indexName: string) => Promise<void>;
