import { type Ignore } from 'ignore';
import type { Path } from 'path-scurry';
export declare const shouldIgnorePath: (filePath: string) => boolean;
/** Check if a directory name is in the hardcoded ignore list */
export declare const isHardcodedIgnoredDirectory: (name: string) => boolean;
/**
 * Load .gitignore and .gitnexusignore rules from the repo root.
 * Returns an `ignore` instance with all patterns, or null if no files found.
 */
export interface IgnoreOptions {
    /** Skip .gitignore parsing, only read .gitnexusignore. Defaults to GITNEXUS_NO_GITIGNORE env var. */
    noGitignore?: boolean;
}
export declare const loadIgnoreRules: (repoPath: string, options?: IgnoreOptions) => Promise<Ignore | null>;
/**
 * Create a glob-compatible ignore filter combining:
 * - .gitignore / .gitnexusignore patterns (via `ignore` package)
 * - Hardcoded DEFAULT_IGNORE_LIST, IGNORED_EXTENSIONS, IGNORED_FILES
 *
 * Returns an IgnoreLike object for glob's `ignore` option,
 * enabling directory-level pruning during traversal.
 */
export declare const createIgnoreFilter: (repoPath: string, options?: IgnoreOptions) => Promise<{
    ignored(p: Path): boolean;
    childrenIgnored(p: Path): boolean;
}>;
