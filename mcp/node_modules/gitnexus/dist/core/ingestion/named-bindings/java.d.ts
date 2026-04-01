import { type SyntaxNode } from '../utils/ast-helpers.js';
import type { NamedBinding } from './types.js';
export declare function extractJavaNamedBindings(importNode: SyntaxNode): NamedBinding[] | undefined;
