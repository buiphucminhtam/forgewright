import type { FieldExtractionConfig } from '../generic.js';
/**
 * Swift field extraction config.
 *
 * Handles property_declaration inside class_body / protocol_body.
 * tree-sitter-swift uses property_declaration for stored/computed properties.
 */
export declare const swiftConfig: FieldExtractionConfig;
