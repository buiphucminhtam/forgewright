import type { SyntaxNode } from '../utils/ast-helpers.js';
import type { LanguageTypeConfig } from './types.js';
/** Extract the first type name from a template_argument_list child.
 *  Unwraps type_descriptor wrappers common in tree-sitter-cpp ASTs.
 *  Returns undefined if no template arguments or no type found. */
export declare const extractFirstTemplateTypeArg: (parentNode: SyntaxNode) => string | undefined;
export declare const typeConfig: LanguageTypeConfig;
