export declare const isGitRepo: (repoPath: string) => boolean;
export declare const getCurrentCommit: (repoPath: string) => string;
/**
 * Find the git repository root from any path inside the repo
 */
export declare const getGitRoot: (fromPath: string) => string | null;
/**
 * Check whether a directory contains a .git entry (file or folder).
 *
 * This is intentionally a simple filesystem check rather than running
 * `git rev-parse`, so it works even when git is not installed or when
 * the directory is a git-worktree root (which has a .git file, not a
 * directory).  Use `isGitRepo` for a definitive git answer.
 *
 * @param dirPath - Absolute path to the directory to inspect.
 * @returns `true` when `.git` is present, `false` otherwise.
 */
export declare const hasGitDir: (dirPath: string) => boolean;
