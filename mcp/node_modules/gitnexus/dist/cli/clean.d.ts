/**
 * Clean Command
 *
 * Removes the .gitnexus index from the current repository.
 * Also unregisters it from the global registry.
 */
export declare const cleanCommand: (options?: {
    force?: boolean;
    all?: boolean;
}) => Promise<void>;
