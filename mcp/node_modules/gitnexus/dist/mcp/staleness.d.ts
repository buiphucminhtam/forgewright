/**
 * Staleness Check
 *
 * Checks if the GitNexus index is behind the current git HEAD.
 * Returns a hint for the LLM to call analyze if stale.
 */
export interface StalenessInfo {
    isStale: boolean;
    commitsBehind: number;
    hint?: string;
}
/**
 * Check how many commits the index is behind HEAD
 */
export declare function checkStaleness(repoPath: string, lastCommit: string): StalenessInfo;
