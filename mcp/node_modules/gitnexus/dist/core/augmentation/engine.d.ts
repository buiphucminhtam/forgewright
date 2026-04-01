/**
 * Augmentation Engine
 *
 * Lightweight, fast-path enrichment of search patterns with knowledge graph context.
 * Designed to be called from platform hooks (Claude Code PreToolUse, Cursor beforeShellExecution)
 * when an agent runs grep/glob/search.
 *
 * Performance target: <500ms cold start, <200ms warm.
 *
 * Design decisions:
 * - Uses only BM25 search (no semantic/embedding) for speed
 * - Clusters used internally for ranking, NEVER in output
 * - Output is pure relationships: callers, callees, process participation
 * - Graceful failure: any error → return empty string
 */
/**
 * Augment a search pattern with knowledge graph context.
 *
 * 1. BM25 search for the pattern
 * 2. For top matches, fetch callers/callees/processes
 * 3. Rank by internal cluster cohesion (not exposed)
 * 4. Format as structured text block
 *
 * Returns empty string on any error (graceful failure).
 */
export declare function augment(pattern: string, cwd?: string): Promise<string>;
