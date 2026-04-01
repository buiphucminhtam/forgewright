import type { SyntaxNode } from '../utils/ast-helpers.js';
/** Which type argument to extract from a multi-arg generic container.
 *  - 'first': key type (e.g., K from Map<K,V>) — used for .keys(), .keySet()
 *  - 'last':  value type (e.g., V from Map<K,V>) — used for .values(), .items(), .iter() */
export type TypeArgPosition = 'first' | 'last';
/** Describes which type parameter position each access method yields. */
interface ContainerDescriptor {
    /** Number of type parameters (1 = single-element, 2 = key-value) */
    arity: number;
    /** Methods that yield the first type parameter (key type for maps) */
    keyMethods: ReadonlySet<string>;
    /** Methods that yield the last type parameter (value type) */
    valueMethods: ReadonlySet<string>;
}
/** Determine which type arg to extract based on container type name and access method.
 *
 *  Resolution order:
 *  1. If container is known and method is in keyMethods → 'first'
 *  2. If container is known with arity 1 → 'last' (same as 'first' for single-arg)
 *  3. If container is unknown → fall back to method name heuristic
 *  4. Default: 'last' (value type)
 */
export declare function methodToTypeArgPosition(methodName: string | undefined, containerTypeName?: string): TypeArgPosition;
/** Look up the container descriptor for a type name. Exported for heritage-chain lookups. */
export declare function getContainerDescriptor(typeName: string): ContainerDescriptor | undefined;
/**
 * Shared 3-strategy fallback for resolving the element type of a container variable.
 * Used by all for-loop extractors to resolve the loop variable's type from the iterable.
 *
 * Strategy 1: declarationTypeNodes — raw AST type annotation node (handles container types
 *             where extractSimpleTypeName returned undefined, e.g., User[], List[User])
 * Strategy 2: scopeEnv string — extractElementTypeFromString on the stored type string
 * Strategy 3: AST walk — language-specific upward walk to enclosing function parameters
 *
 * @param extractFromTypeNode Language-specific function to extract element type from AST node
 * @param findParamElementType Optional language-specific AST walk to find parameter type
 * @param typeArgPos Which generic type arg to extract: 'first' for keys, 'last' for values (default)
 */
export declare function resolveIterableElementType(iterableName: string, node: SyntaxNode, scopeEnv: ReadonlyMap<string, string>, declarationTypeNodes: ReadonlyMap<string, SyntaxNode>, scope: string, extractFromTypeNode: (typeNode: SyntaxNode, pos?: TypeArgPosition) => string | undefined, findParamElementType?: (name: string, startNode: SyntaxNode, pos?: TypeArgPosition) => string | undefined, typeArgPos?: TypeArgPosition): string | undefined;
/**
 * Extract the simple type name from a type AST node.
 * Handles generic types (e.g., List<User> → List), qualified names
 * (e.g., models.User → User), and nullable types (e.g., User? → User).
 * Returns undefined for complex types (unions, intersections, function types).
 */
export declare const extractSimpleTypeName: (typeNode: SyntaxNode, depth?: number) => string | undefined;
/**
 * Extract variable name from a declarator or pattern node.
 * Returns the simple identifier text, or undefined for destructuring/complex patterns.
 */
export declare const extractVarName: (node: SyntaxNode) => string | undefined;
/** Node types for function/method parameters with type annotations */
export declare const TYPED_PARAMETER_TYPES: Set<string>;
/**
 * Extract type arguments from a generic type node.
 * e.g., List<User, String> → ['User', 'String'], Vec<User> → ['User']
 *
 * Used by extractSimpleTypeName to unwrap nullable wrappers (Optional<User> → User).
 *
 * Handles language-specific AST structures:
 * - TS/Java/Rust/Go: generic_type > type_arguments > type nodes
 * - C#:              generic_type > type_argument_list > type nodes
 * - Kotlin:          generic_type > type_arguments > type_projection > type nodes
 *
 * Note: Go slices/maps use slice_type/map_type, not generic_type — those are
 * NOT handled here. Use language-specific extractors for Go container types.
 *
 * @param typeNode A generic_type or parameterized_type AST node (or any node —
 *   returns [] for non-generic types).
 * @returns Array of resolved type argument names. Unresolvable arguments are omitted.
 */
export declare const extractGenericTypeArgs: (typeNode: SyntaxNode, depth?: number) => string[];
/**
 * Match Ruby constructor assignment: `user = User.new` or `service = Models::User.new`.
 * Returns { varName, calleeName } or undefined if the node is not a Ruby constructor assignment.
 * Handles both simple constants and scope_resolution (namespaced) receivers.
 */
export declare const extractRubyConstructorAssignment: (node: SyntaxNode) => {
    varName: string;
    calleeName: string;
} | undefined;
/**
 * Check if an AST node has an explicit type annotation.
 * Checks both named fields ('type') and child nodes ('type_annotation').
 * Used by constructor binding scanners to skip annotated declarations.
 */
export declare const hasTypeAnnotation: (node: SyntaxNode) => boolean;
/**
 * Strip nullable wrappers from a type name string.
 * Used by both lookupInEnv (TypeEnv annotations) and extractReturnTypeName
 * (return-type text) to normalize types before receiver lookup.
 *
 *   "User | null"           → "User"
 *   "User | undefined"      → "User"
 *   "User | null | undefined" → "User"
 *   "User?"                 → "User"
 *   "User | Repo"           → undefined  (genuine union — refuse)
 *   "null"                  → undefined
 */
export declare const stripNullable: (typeName: string) => string | undefined;
/**
 * Unwrap an await_expression to get the inner value.
 * Returns the node itself if not an await_expression, or null if input is null.
 */
export declare const unwrapAwait: (node: SyntaxNode | null) => SyntaxNode | null;
/**
 * Extract the callee name from a call_expression node.
 * Navigates to the 'function' field (or first named child) and extracts a simple type name.
 */
export declare const extractCalleeName: (callNode: SyntaxNode) => string | undefined;
/**
 * Extract element type from a container type string.
 * Uses bracket-balanced parsing (no regex) for generic argument extraction.
 * Returns undefined for ambiguous or unparseable strings.
 *
 * Handles:
 * - Array<User>    → User  (generic angle brackets)
 * - User[]         → User  (array suffix)
 * - []User         → User  (Go slice prefix)
 * - List[User]     → User  (Python subscript)
 * - [User]         → User  (Swift array sugar)
 * - vector<User>   → User  (C++ container)
 * - Vec<User>      → User  (Rust container)
 *
 * For multi-argument generics (Map<K, V>), returns the first or last type arg
 * based on `pos` ('first' for keys, 'last' for values — default 'last').
 * Returns undefined when the extracted type is not a simple word.
 */
export declare function extractElementTypeFromString(typeStr: string, pos?: TypeArgPosition): string | undefined;
export declare const extractReturnTypeName: (raw: string, depth?: number) => string | undefined;
export {};
