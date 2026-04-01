/**
 * Index Command
 *
 * Registers an existing .gitnexus/ folder into the global registry so the
 * MCP server can discover the repo without running a full `gitnexus analyze`.
 *
 * Useful when a pre-built .gitnexus/ directory is already present (e.g. after
 * cloning a repo that ships its index, restoring from backup, or using a
 * shared team index).
 */
export interface IndexOptions {
    force?: boolean;
    allowNonGit?: boolean;
}
export declare const indexCommand: (inputPathParts?: string[], options?: IndexOptions) => Promise<void>;
