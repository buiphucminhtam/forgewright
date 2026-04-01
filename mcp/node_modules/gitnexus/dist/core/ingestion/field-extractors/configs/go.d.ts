import type { FieldExtractionConfig } from '../generic.js';
/**
 * Go field extraction config.
 *
 * Go struct fields live inside type_declaration > type_spec > struct_type >
 * field_declaration_list > field_declaration.
 *
 * Visibility in Go is based on the first character: uppercase = exported (public),
 * lowercase = unexported (package).
 */
export declare const goConfig: FieldExtractionConfig;
