/**
 * CSV Generator for LadybugDB Hybrid Schema
 *
 * Streams CSV rows directly to disk files in a single pass over graph nodes.
 * File contents are lazy-read from disk per-node to avoid holding the entire
 * repo in RAM. Rows are buffered (FLUSH_EVERY) before writing to minimize
 * per-row Promise overhead.
 *
 * RFC 4180 Compliant:
 * - Fields containing commas, double quotes, or newlines are enclosed in double quotes
 * - Double quotes within fields are escaped by doubling them ("")
 * - All fields are consistently quoted for safety with code content
 */
import { KnowledgeGraph } from '../graph/types.js';
import { NodeTableName } from './schema.js';
export declare const sanitizeUTF8: (str: string) => string;
export declare const escapeCSVField: (value: string | number | undefined | null) => string;
export declare const escapeCSVNumber: (value: number | undefined | null, defaultValue?: number) => string;
export declare const isBinaryContent: (content: string) => boolean;
export interface StreamedCSVResult {
    nodeFiles: Map<NodeTableName, {
        csvPath: string;
        rows: number;
    }>;
    relCsvPath: string;
    relRows: number;
}
/**
 * Stream all CSV data directly to disk files.
 * Iterates graph nodes exactly ONCE — routes each node to the right writer.
 * File contents are lazy-read from disk with a generous LRU cache.
 */
export declare const streamAllCSVsToDisk: (graph: KnowledgeGraph, repoPath: string, csvDir: string) => Promise<StreamedCSVResult>;
