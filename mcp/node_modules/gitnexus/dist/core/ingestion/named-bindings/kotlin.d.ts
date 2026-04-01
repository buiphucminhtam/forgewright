import { type SyntaxNode } from '../utils/ast-helpers.js';
import type { NamedBinding } from './types.js';
export declare function extractKotlinNamedBindings(importNode: SyntaxNode): NamedBinding[] | undefined;
