/**
 * Export Detection
 *
 * Determines whether a symbol (function, class, etc.) is exported/public
 * in its language. This is a pure function — safe for use in worker threads.
 *
 * Shared between parse-worker.ts (worker pool) and parsing-processor.ts (sequential fallback).
 */
import { type SyntaxNode } from './utils/ast-helpers.js';
/** Handler type: given a node and symbol name, return true if the symbol is exported/public. */
export type ExportChecker = (node: SyntaxNode, name: string) => boolean;
/** JS/TS: walk ancestors looking for export_statement or export_specifier. */
export declare const tsExportChecker: ExportChecker;
/** Python: public if no leading underscore (convention). */
export declare const pythonExportChecker: ExportChecker;
/** Java: check for 'public' modifier — modifiers are siblings of the name node, not parents. */
export declare const javaExportChecker: ExportChecker;
/**
 * C#: modifier nodes are SIBLINGS of the name node inside the declaration.
 * Walk up to the declaration node, then scan its direct children.
 */
export declare const csharpExportChecker: ExportChecker;
/** Go: uppercase first letter = exported. */
export declare const goExportChecker: ExportChecker;
/**
 * Rust: visibility_modifier is a SIBLING of the name node within the declaration node
 * (function_item, struct_item, etc.), not a parent. Walk up to the declaration node,
 * then scan its direct children.
 */
export declare const rustExportChecker: ExportChecker;
/**
 * Kotlin: default visibility is public (unlike Java).
 * visibility_modifier is inside modifiers, a sibling of the name node within the declaration.
 */
export declare const kotlinExportChecker: ExportChecker;
/**
 * C/C++: functions without 'static' storage class have external linkage by default,
 * making them globally accessible (equivalent to exported). Only functions explicitly
 * marked 'static' are file-scoped (not exported). C++ anonymous namespaces
 * (namespace { ... }) also give internal linkage.
 */
export declare const cCppExportChecker: ExportChecker;
/** PHP: check for visibility modifier or top-level scope. */
export declare const phpExportChecker: ExportChecker;
/**
 * Swift: treat symbols as exported unless explicitly marked private/fileprivate.
 *
 * Swift's default access level is `internal`, which means visible to all files
 * in the same module/target. Since GitNexus indexes at the target level,
 * `internal` symbols should be treated as exported (cross-file visible).
 * Only `private` and `fileprivate` symbols are truly file-scoped.
 */
export declare const swiftExportChecker: ExportChecker;
/** Ruby: all top-level definitions are public (no export syntax). */
export declare const rubyExportChecker: ExportChecker;
/** Dart: public if no leading underscore (convention, same as Python). */
export declare const dartExportChecker: ExportChecker;
