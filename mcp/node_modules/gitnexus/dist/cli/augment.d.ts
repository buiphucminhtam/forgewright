/**
 * Augment CLI Command
 *
 * Fast-path command for platform hooks.
 * Shells out from Claude Code PreToolUse / Cursor beforeShellExecution hooks.
 *
 * Usage: gitnexus augment <pattern>
 * Returns enriched text to stdout.
 *
 * Performance: Must cold-start fast (<500ms).
 * Skips unnecessary initialization (no web server, no full DB warmup).
 */
export declare function augmentCommand(pattern: string): Promise<void>;
