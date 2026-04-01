import type { SyntaxNode } from './ast-helpers.js';
/** Node types representing call expressions across supported languages. */
export declare const CALL_EXPRESSION_TYPES: Set<string>;
/**
 * Hard limit on chain depth to prevent runaway recursion.
 * For `a.b().c().d()`, the chain has depth 2 (b and c before d).
 */
export declare const MAX_CHAIN_DEPTH = 3;
/**
 * Count direct arguments for a call expression across common tree-sitter grammars.
 * Returns undefined when the argument container cannot be located cheaply.
 */
export declare const countCallArguments: (callNode: SyntaxNode | null | undefined) => number | undefined;
type CallForm = 'free' | 'member' | 'constructor';
/**
 * Infer whether a captured call site is a free call, member call, or constructor.
 * Returns undefined if the form cannot be determined.
 *
 * Works by inspecting the AST structure between callNode (@call) and nameNode (@call.name).
 * No tree-sitter query changes needed — the distinction is in the node types.
 */
export declare const inferCallForm: (callNode: SyntaxNode, nameNode: SyntaxNode) => CallForm | undefined;
export declare const extractReceiverName: (nameNode: SyntaxNode) => string | undefined;
/**
 * Extract the raw receiver AST node for a member call.
 * Unlike extractReceiverName, this returns the receiver node regardless of its type —
 * including call_expression / method_invocation nodes that appear in chained calls
 * like `svc.getUser().save()`.
 *
 * Returns undefined when the call is not a member call or when no receiver node
 * can be found (e.g. top-level free calls).
 */
export declare const extractReceiverNode: (nameNode: SyntaxNode) => SyntaxNode | undefined;
/** One step in a mixed receiver chain. */
export type MixedChainStep = {
    kind: 'field' | 'call';
    name: string;
};
/**
 * Walk a receiver AST node that is itself a call expression, accumulating the
 * chain of intermediate method names up to MAX_CHAIN_DEPTH.
 *
 * For `svc.getUser().save()`, called with the receiver of `save` (getUser() call):
 *   returns { chain: ['getUser'], baseReceiverName: 'svc' }
 *
 * For `a.b().c().d()`, called with the receiver of `d` (c() call):
 *   returns { chain: ['b', 'c'], baseReceiverName: 'a' }
 */
export declare function extractCallChain(receiverCallNode: SyntaxNode): {
    chain: string[];
    baseReceiverName: string | undefined;
} | undefined;
/**
 * Walk a receiver AST node that may interleave field accesses and method calls,
 * building a unified chain of steps up to MAX_CHAIN_DEPTH.
 *
 * For `svc.getUser().address.save()`, called with the receiver of `save`
 * (`svc.getUser().address`, a field access node):
 *   returns { chain: [{ kind:'call', name:'getUser' }, { kind:'field', name:'address' }],
 *             baseReceiverName: 'svc' }
 *
 * For `user.getAddress().city.getName()`, called with receiver of `getName`
 * (`user.getAddress().city`):
 *   returns { chain: [{ kind:'call', name:'getAddress' }, { kind:'field', name:'city' }],
 *             baseReceiverName: 'user' }
 *
 * Pure field chains and pure call chains are special cases (all steps same kind).
 */
export declare function extractMixedChain(receiverNode: SyntaxNode): {
    chain: MixedChainStep[];
    baseReceiverName: string | undefined;
} | undefined;
export {};
