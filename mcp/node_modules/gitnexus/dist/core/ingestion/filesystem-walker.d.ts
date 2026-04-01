export interface FileEntry {
    path: string;
    content: string;
}
/** Lightweight entry — path + size from stat, no content in memory */
export interface ScannedFile {
    path: string;
    size: number;
}
/** Path-only reference (for type signatures) */
export interface FilePath {
    path: string;
}
/**
 * Phase 1: Scan repository — stat files to get paths + sizes, no content loaded.
 * Memory: ~10MB for 100K files vs ~1GB+ with content.
 */
export declare const walkRepositoryPaths: (repoPath: string, onProgress?: (current: number, total: number, filePath: string) => void) => Promise<ScannedFile[]>;
/**
 * Phase 2: Read file contents for a specific set of relative paths.
 * Returns a Map for O(1) lookup. Silently skips files that fail to read.
 */
export declare const readFileContents: (repoPath: string, relativePaths: string[]) => Promise<Map<string, string>>;
/**
 * Legacy API — scans and reads everything into memory.
 * Used by sequential fallback path only.
 */
export declare const walkRepository: (repoPath: string, onProgress?: (current: number, total: number, filePath: string) => void) => Promise<FileEntry[]>;
