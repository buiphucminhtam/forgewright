import type { FieldExtractionConfig } from '../generic.js';
/**
 * PHP field extraction config.
 *
 * Handles property_declaration inside class/interface/trait bodies.
 * tree-sitter-php uses 'declaration_list' for the class body.
 */
export declare const phpConfig: FieldExtractionConfig;
