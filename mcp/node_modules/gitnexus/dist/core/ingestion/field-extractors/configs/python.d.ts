import type { FieldExtractionConfig } from '../generic.js';
/**
 * Python field extraction config.
 *
 * Python class fields appear as:
 * - Annotated assignments: `name: str = ""`
 * - Plain assignments in __init__: `self.name = value`
 *
 * For AST-level extraction we handle expression_statement containing
 * assignment or type nodes inside a class body block.
 */
export declare const pythonConfig: FieldExtractionConfig;
