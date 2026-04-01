/**
 * Community Detection Processor
 *
 * Uses the Leiden algorithm (via graphology-communities-leiden) to detect
 * communities/clusters in the code graph based on CALLS relationships.
 *
 * Communities represent groups of code that work together frequently,
 * helping agents navigate the codebase by functional area rather than file structure.
 */
import { KnowledgeGraph } from '../graph/types.js';
export interface CommunityNode {
    id: string;
    label: string;
    heuristicLabel: string;
    cohesion: number;
    symbolCount: number;
}
export interface CommunityMembership {
    nodeId: string;
    communityId: string;
}
export interface CommunityDetectionResult {
    communities: CommunityNode[];
    memberships: CommunityMembership[];
    stats: {
        totalCommunities: number;
        modularity: number;
        nodesProcessed: number;
    };
}
export declare const COMMUNITY_COLORS: string[];
export declare const getCommunityColor: (communityIndex: number) => string;
/**
 * Detect communities in the knowledge graph using Leiden algorithm
 *
 * This runs AFTER all relationships (CALLS, IMPORTS, etc.) have been built.
 * It uses primarily CALLS edges to cluster code that works together.
 */
export declare const processCommunities: (knowledgeGraph: KnowledgeGraph, onProgress?: (message: string, progress: number) => void) => Promise<CommunityDetectionResult>;
