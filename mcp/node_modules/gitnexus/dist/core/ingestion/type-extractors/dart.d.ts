/**
 * Dart type extractor — full implementation following type-resolution-system.md.
 *
 * Tier 0: Explicit type annotations (User user = ...)
 * Tier 0b: For-loop element types (for (var u in users))
 * Tier 1: Constructor/initializer inference (var user = User())
 * Tier 2: Assignment chain propagation (copy, fieldAccess, callResult, methodCallResult)
 *
 * Handles tree-sitter-dart's flat sibling AST structure:
 * identifier + selector + selector (not nested call_expression).
 *
 * Credit: Type resolution approach adapted from @xFlaviews' PR #83.
 */
import type { LanguageTypeConfig } from './types.js';
export declare const typeConfig: LanguageTypeConfig;
