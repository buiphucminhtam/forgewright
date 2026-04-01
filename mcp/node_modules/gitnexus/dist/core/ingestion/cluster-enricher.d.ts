/**
 * Cluster Enricher
 *
 * LLM-based enrichment for community clusters.
 * Generates semantic names, keywords, and descriptions using an LLM.
 */
import { CommunityNode } from './community-processor.js';
export interface ClusterEnrichment {
    name: string;
    keywords: string[];
    description: string;
}
export interface EnrichmentResult {
    enrichments: Map<string, ClusterEnrichment>;
    tokensUsed: number;
}
export interface LLMClient {
    generate: (prompt: string) => Promise<string>;
}
export interface ClusterMemberInfo {
    name: string;
    filePath: string;
    type: string;
}
/**
 * Enrich clusters with LLM-generated names, keywords, and descriptions
 *
 * @param communities - Community nodes to enrich
 * @param memberMap - Map of communityId -> member info
 * @param llmClient - LLM client for generation
 * @param onProgress - Progress callback
 */
export declare const enrichClusters: (communities: CommunityNode[], memberMap: Map<string, ClusterMemberInfo[]>, llmClient: LLMClient, onProgress?: (current: number, total: number) => void) => Promise<EnrichmentResult>;
/**
 * Enrich multiple clusters in a single LLM call (batch mode)
 * More efficient for token usage but requires larger context window
 */
export declare const enrichClustersBatch: (communities: CommunityNode[], memberMap: Map<string, ClusterMemberInfo[]>, llmClient: LLMClient, batchSize?: number, onProgress?: (current: number, total: number) => void) => Promise<EnrichmentResult>;
