import { type SyntaxNode } from '../utils/ast-helpers.js';
import type { NamedBinding } from './types.js';
export declare function extractTsNamedBindings(importNode: SyntaxNode): NamedBinding[] | undefined;
