/**
 * Wiki Generator
 *
 * Orchestrates the full wiki generation pipeline:
 *   Phase 0: Validate prerequisites + gather graph structure
 *   Phase 1: Build module tree (one LLM call)
 *   Phase 2: Generate module pages (one LLM call per module, bottom-up)
 *   Phase 3: Generate overview page
 *
 * Supports incremental updates via git diff + module-file mapping.
 */
import { type LLMConfig } from './llm-client.js';
export interface WikiOptions {
    force?: boolean;
    maxTokensPerModule?: number;
    concurrency?: number;
    /** If true, stop after building module tree for user review */
    reviewOnly?: boolean;
}
export interface WikiMeta {
    fromCommit: string;
    generatedAt: string;
    model: string;
    moduleFiles: Record<string, string[]>;
    moduleTree: ModuleTreeNode[];
}
export interface ModuleTreeNode {
    name: string;
    slug: string;
    files: string[];
    children?: ModuleTreeNode[];
}
export type ProgressCallback = (phase: string, percent: number, detail?: string) => void;
export interface WikiRunResult {
    pagesGenerated: number;
    mode: 'full' | 'incremental' | 'up-to-date';
    failedModules: string[];
    moduleTree?: ModuleTreeNode[];
}
export declare class WikiGenerator {
    private repoPath;
    private storagePath;
    private wikiDir;
    private lbugPath;
    private llmConfig;
    private maxTokensPerModule;
    private concurrency;
    private options;
    private onProgress;
    private failedModules;
    constructor(repoPath: string, storagePath: string, lbugPath: string, llmConfig: LLMConfig, options?: WikiOptions, onProgress?: ProgressCallback);
    private lastPercent;
    /**
     * Create streaming options that report LLM progress to the progress bar.
     *
     * Progress calculation:
     * - If fixedPercent is provided, we show incremental progress within that phase
     *   based on token generation (e.g., grouping at 15% → 15-28%)
     * - If fixedPercent is NOT provided, we only update the label with token count
     *   but keep the current percentage (avoids fluctuation during module generation)
     *
     * Also touches the DB connection periodically to prevent idle timeout.
     */
    private streamOpts;
    /**
     * Route LLM call to the appropriate provider (OpenAI-compatible or Cursor CLI).
     */
    private invokeLLM;
    /**
     * Main entry point. Runs the full pipeline or incremental update.
     */
    run(): Promise<WikiRunResult>;
    private ensureHTMLViewer;
    private fullGeneration;
    private buildModuleTree;
    /**
     * Parse LLM grouping response. Validates all files are assigned.
     */
    private parseGroupingResponse;
    /**
     * Fallback grouping by top-level directory when LLM parsing fails.
     */
    private fallbackGrouping;
    /**
     * Split a large module into sub-modules by subdirectory.
     * Uses the full subDir path for naming to avoid slug collisions
     * (e.g., "synapse-screen/src" vs "synapse-core/src").
     */
    private splitBySubdirectory;
    /**
     * Generate a leaf module page from source code + graph data.
     */
    private generateLeafPage;
    /**
     * Generate a parent module page from children's documentation.
     */
    private generateParentPage;
    private generateOverview;
    private incrementalUpdate;
    private getCurrentCommit;
    /**
     * Check if fromCommit is an ancestor of toCommit (reachable in git history).
     * Returns false if commits are on divergent branches or fromCommit doesn't exist.
     */
    private isCommitReachable;
    private getChangedFiles;
    private readSourceFiles;
    private truncateSource;
    private estimateModuleTokens;
    private readProjectInfo;
    private extractModuleFiles;
    private countModules;
    /**
     * Flatten the module tree into leaf nodes and parent nodes.
     * Leaves can be processed in parallel; parents must wait for children.
     */
    private flattenModuleTree;
    /**
     * Run async tasks in parallel with a concurrency limit and adaptive rate limiting.
     * If a 429 rate limit is hit, concurrency is temporarily reduced.
     */
    private runParallel;
    private findNodeBySlug;
    private slugify;
    private fileExists;
    private loadWikiMeta;
    private saveWikiMeta;
    private saveModuleTree;
}
