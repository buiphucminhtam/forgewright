import type { FieldExtractionConfig } from '../generic.js';
/**
 * Rust field extraction config.
 *
 * Handles struct fields (named and tuple variants are out of scope).
 * Visibility: `pub` keyword = public, otherwise private (crate-private).
 * All fields are immutable by default in Rust (mutability is on the binding).
 */
export declare const rustConfig: FieldExtractionConfig;
