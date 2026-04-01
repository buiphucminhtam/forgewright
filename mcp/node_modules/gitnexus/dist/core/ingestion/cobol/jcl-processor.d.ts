/**
 * JCL Processor — Converts JCL parse results into graph nodes and edges.
 *
 * Maps JCL entities to existing graph types (no new tables):
 * - Job    -> CodeElement (description: "jcl-job class:A msgclass:X")
 * - Step   -> CodeElement (description: "jcl-step pgm:PROGRAMNAME")
 * - Dataset -> CodeElement (description: "jcl-dataset disp:SHR")
 * - PROC   -> Module
 *
 * Edges:
 * - Job CONTAINS Step
 * - Step CALLS Module (when PGM= matches an indexed program)
 * - Step references Dataset (CALLS edge with reason "jcl-dd")
 * - Job/Step IMPORTS PROC
 *
 * Pattern follows detectCrossProgamContracts() in pipeline.ts.
 */
import type { KnowledgeGraph } from '../../graph/types.js';
export interface JclProcessResult {
    jobCount: number;
    stepCount: number;
    datasetCount: number;
    programLinks: number;
}
/**
 * Process JCL files and integrate into the knowledge graph.
 *
 * @param graph - The in-memory knowledge graph
 * @param jclPaths - File paths of JCL files
 * @param jclContents - Map of path -> file content
 * @returns Summary of what was added
 */
export declare function processJclFiles(graph: KnowledgeGraph, jclPaths: string[], jclContents: Map<string, string>): JclProcessResult;
