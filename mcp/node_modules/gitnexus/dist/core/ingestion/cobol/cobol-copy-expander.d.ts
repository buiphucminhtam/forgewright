/**
 * COBOL COPY statement expansion engine.
 *
 * Expands COPY statements by inlining copybook content, applying REPLACING
 * transformations (LEADING, TRAILING, EXACT), and handling nested copies
 * with cycle detection.
 *
 * This is a preprocessing step that runs BEFORE extractCobolSymbolsWithRegex.
 * The caller should run preprocessCobolSource first to clean patch markers.
 *
 * Supported syntax:
 *   COPY CPSESP.
 *   COPY "WORKGRID.CPY".
 *   COPY CPSESP REPLACING LEADING "ESP-" BY "LK-ESP-"
 *                         LEADING "KPSESPL" BY "LK-KPSESPL".
 *   COPY ANAZI REPLACING "ANAZI-KEY" BY "LK-KEY".
 */
export interface CopyReplacing {
    type: 'LEADING' | 'TRAILING' | 'EXACT';
    from: string;
    to: string;
    isPseudotext?: boolean;
}
export interface CopyResolution {
    copyTarget: string;
    resolvedPath: string | null;
    line: number;
    replacing: CopyReplacing[];
    library?: string;
}
export interface CopyExpansionResult {
    expandedContent: string;
    copyResolutions: CopyResolution[];
}
export declare const DEFAULT_MAX_DEPTH = 10;
/**
 * Parse REPLACING clause text into structured replacements.
 *
 * Input examples:
 *   LEADING "ESP-" BY "LK-ESP-" LEADING "KPSESPL" BY "LK-KPSESPL"
 *   "ANAZI-KEY" BY "LK-KEY"
 *   TRAILING "-IN" BY "-OUT"
 *   ==CUST-== BY ==WS-CUST-==
 *   ==OLD-TEXT== BY ====
 */
export declare function parseReplacingClause(text: string): CopyReplacing[];
/**
 * Expand COBOL COPY statements by inlining copybook content.
 *
 * @param content     - Source COBOL content (after preprocessCobolSource)
 * @param filePath    - Path of the source file (for diagnostics)
 * @param resolveFile - Maps a COPY target name to a filesystem path, or null if not found
 * @param readFile    - Reads file content by path, or null if unreadable
 * @param maxDepth    - Maximum nesting depth for recursive expansion (default: 10)
 * @returns Expanded content and resolution metadata
 */
export declare function expandCopies(content: string, filePath: string, resolveFile: (name: string) => string | null, readFile: (path: string) => string | null, maxDepth?: number): CopyExpansionResult;
