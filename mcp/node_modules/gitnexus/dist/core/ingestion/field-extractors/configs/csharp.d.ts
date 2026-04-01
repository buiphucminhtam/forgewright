import type { FieldExtractionConfig } from '../generic.js';
/**
 * C# field extraction config.
 *
 * Handles field_declaration and property_declaration inside class/struct/interface bodies.
 * The body node in tree-sitter-c-sharp is 'declaration_list'.
 */
export declare const csharpConfig: FieldExtractionConfig;
