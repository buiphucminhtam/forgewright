/**
 * Response shape extraction from route handler file content.
 * Detects .json() calls (JS/TS) and json_encode() calls (PHP),
 * extracts top-level keys, and classifies by HTTP status code.
 */
/**
 * Detect an HTTP status code associated with a .json() call.
 */
export declare function detectStatusCode(content: string, jsonMatchPos: number, closingBracePos: number): number | undefined;
/**
 * Extract response shapes from JS/TS handler file content.
 */
export declare function extractResponseShapes(content: string): {
    responseKeys?: string[];
    errorKeys?: string[];
};
export declare function extractPHPResponseShapes(content: string): {
    responseKeys?: string[];
    errorKeys?: string[];
};
