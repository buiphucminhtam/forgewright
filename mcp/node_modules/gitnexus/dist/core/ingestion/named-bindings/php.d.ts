import type { SyntaxNode } from '../utils/ast-helpers.js';
import type { NamedBinding } from './types.js';
export declare function extractPhpNamedBindings(importNode: SyntaxNode): NamedBinding[] | undefined;
