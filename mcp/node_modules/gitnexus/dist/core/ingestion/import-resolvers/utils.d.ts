/**
 * Shared utilities for import resolution.
 * Extracted from import-processor.ts to reduce file size.
 */
/** All file extensions to try during resolution */
export declare const EXTENSIONS: string[];
/**
 * Try to match a path (with extensions) against the known file set.
 * Returns the matched file path or null.
 */
export declare function tryResolveWithExtensions(basePath: string, allFiles: Set<string>): string | null;
/**
 * Build a suffix index for O(1) endsWith lookups.
 * Maps every possible path suffix to its original file path.
 * e.g. for "src/com/example/Foo.java":
 *   "Foo.java" -> "src/com/example/Foo.java"
 *   "example/Foo.java" -> "src/com/example/Foo.java"
 *   "com/example/Foo.java" -> "src/com/example/Foo.java"
 *   etc.
 */
export interface SuffixIndex {
    /** Exact suffix lookup (case-sensitive) */
    get(suffix: string): string | undefined;
    /** Case-insensitive suffix lookup */
    getInsensitive(suffix: string): string | undefined;
    /** Get all files in a directory suffix */
    getFilesInDir(dirSuffix: string, extension: string): string[];
}
/** Sentinel index that returns no results. Used to release memory after import resolution. */
export declare const EMPTY_INDEX: SuffixIndex;
export declare function buildSuffixIndex(normalizedFileList: string[], allFileList: string[]): SuffixIndex;
/**
 * Suffix-based resolution using index. O(1) per lookup instead of O(files).
 */
export declare function suffixResolve(pathParts: string[], normalizedFileList: string[], allFileList: string[], index?: SuffixIndex): string | null;
