/**
 * Graph Queries for Wiki Generation
 *
 * Encapsulated Cypher queries against the GitNexus knowledge graph.
 * Uses the MCP-style pooled lbug-adapter for connection management.
 */
/**
 * Touch the wiki DB connection to prevent idle timeout during long LLM calls.
 */
export declare function touchWikiDb(): void;
export interface FileWithExports {
    filePath: string;
    symbols: Array<{
        name: string;
        type: string;
    }>;
}
export interface CallEdge {
    fromFile: string;
    fromName: string;
    toFile: string;
    toName: string;
}
export interface ProcessInfo {
    id: string;
    label: string;
    type: string;
    stepCount: number;
    steps: Array<{
        step: number;
        name: string;
        filePath: string;
        type: string;
    }>;
}
/**
 * Initialize the LadybugDB connection for wiki generation.
 */
export declare function initWikiDb(lbugPath: string): Promise<void>;
/**
 * Close the LadybugDB connection.
 */
export declare function closeWikiDb(): Promise<void>;
/**
 * Get all source files with their exported symbol names and types.
 */
export declare function getFilesWithExports(): Promise<FileWithExports[]>;
/**
 * Get all files tracked in the graph (including those with no exports).
 */
export declare function getAllFiles(): Promise<string[]>;
/**
 * Get inter-file call edges (calls between different files).
 */
export declare function getInterFileCallEdges(): Promise<CallEdge[]>;
/**
 * Get call edges between files within a specific set (intra-module).
 */
export declare function getIntraModuleCallEdges(filePaths: string[]): Promise<CallEdge[]>;
/**
 * Get call edges crossing module boundaries (external calls from/to module files).
 */
export declare function getInterModuleCallEdges(filePaths: string[]): Promise<{
    outgoing: CallEdge[];
    incoming: CallEdge[];
}>;
/**
 * Get processes (execution flows) that pass through a set of files.
 * Returns top N by step count.
 */
export declare function getProcessesForFiles(filePaths: string[], limit?: number): Promise<ProcessInfo[]>;
/**
 * Get all processes in the graph (for overview page).
 */
export declare function getAllProcesses(limit?: number): Promise<ProcessInfo[]>;
/**
 * Get inter-module edges for overview architecture diagram.
 * Groups call edges by source/target module.
 */
export declare function getInterModuleEdgesForOverview(moduleFiles: Record<string, string[]>): Promise<Array<{
    from: string;
    to: string;
    count: number;
}>>;
