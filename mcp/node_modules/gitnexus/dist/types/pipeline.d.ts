import { GraphNode, GraphRelationship, KnowledgeGraph } from '../core/graph/types.js';
import { CommunityDetectionResult } from '../core/ingestion/community-processor.js';
import { ProcessDetectionResult } from '../core/ingestion/process-processor.js';
export type PipelinePhase = 'idle' | 'extracting' | 'structure' | 'parsing' | 'imports' | 'calls' | 'heritage' | 'communities' | 'processes' | 'enriching' | 'complete' | 'error';
export interface PipelineProgress {
    phase: PipelinePhase;
    percent: number;
    message: string;
    detail?: string;
    stats?: {
        filesProcessed: number;
        totalFiles: number;
        nodesCreated: number;
    };
}
export interface PipelineResult {
    graph: KnowledgeGraph;
    /** Absolute path to the repo root — used for lazy file reads during LadybugDB loading */
    repoPath: string;
    /** Total files scanned (for stats) */
    totalFileCount: number;
    communityResult?: CommunityDetectionResult;
    processResult?: ProcessDetectionResult;
}
export interface SerializablePipelineResult {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
    repoPath: string;
    totalFileCount: number;
}
export declare const serializePipelineResult: (result: PipelineResult) => SerializablePipelineResult;
export declare const deserializePipelineResult: (serialized: SerializablePipelineResult, createGraph: () => KnowledgeGraph) => PipelineResult;
