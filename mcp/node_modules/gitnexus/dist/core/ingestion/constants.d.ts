/**
 * Default minimum buffer size for tree-sitter parsing (512 KB).
 * tree-sitter requires bufferSize >= file size in bytes.
 */
export declare const TREE_SITTER_BUFFER_SIZE: number;
/**
 * Maximum buffer size cap (32 MB) to prevent OOM on huge files.
 * Also used as the file-size skip threshold — files larger than this are not parsed.
 */
export declare const TREE_SITTER_MAX_BUFFER: number;
/**
 * Compute adaptive buffer size for tree-sitter parsing.
 * Uses 2× file size, clamped between 512 KB and 32 MB.
 * Previous 256 KB fixed limit silently skipped files > ~200 KB (e.g., imgui.h at 411 KB).
 */
export declare const getTreeSitterBufferSize: (contentLength: number) => number;
