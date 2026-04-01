import type { NodeLabel } from '../graph/types.js';
export interface SymbolDefinition {
    nodeId: string;
    filePath: string;
    type: NodeLabel;
    parameterCount?: number;
    /** Number of required (non-optional, non-default) parameters.
     *  Enables range-based arity filtering: argCount >= requiredParameterCount && argCount <= parameterCount. */
    requiredParameterCount?: number;
    /** Per-parameter type names for overload disambiguation (e.g. ['int', 'String']).
     *  Populated when parameter types are resolvable from AST (any typed language).
     *  Used for disambiguation in overloading languages (Java, Kotlin, C#, C++). */
    parameterTypes?: string[];
    /** Raw return type text extracted from AST (e.g. 'User', 'Promise<User>') */
    returnType?: string;
    /** Declared type for non-callable symbols — fields/properties (e.g. 'Address', 'List<User>') */
    declaredType?: string;
    /** Links Method/Constructor/Property to owning Class/Struct/Trait nodeId */
    ownerId?: string;
}
export interface SymbolTable {
    /**
     * Register a new symbol definition
     */
    add: (filePath: string, name: string, nodeId: string, type: NodeLabel, metadata?: {
        parameterCount?: number;
        requiredParameterCount?: number;
        parameterTypes?: string[];
        returnType?: string;
        declaredType?: string;
        ownerId?: string;
    }) => void;
    /**
     * High Confidence: Look for a symbol specifically inside a file
     * Returns the Node ID if found
     */
    lookupExact: (filePath: string, name: string) => string | undefined;
    /**
     * High Confidence: Look for a symbol in a specific file, returning full definition.
     * Includes type information needed for heritage resolution (Class vs Interface).
     * Returns first matching definition — use lookupExactAll for overloaded methods.
     */
    lookupExactFull: (filePath: string, name: string) => SymbolDefinition | undefined;
    /**
     * High Confidence: Look for ALL symbols with this name in a specific file.
     * Returns all definitions, including overloaded methods with the same name.
     * Used by resolution-context to pass all same-file overloads to candidate filtering.
     */
    lookupExactAll: (filePath: string, name: string) => SymbolDefinition[];
    /**
     * Low Confidence: Look for a symbol anywhere in the project
     * Used when imports are missing or for framework magic
     */
    lookupFuzzy: (name: string) => SymbolDefinition[];
    /**
     * Low Confidence: Look for callable symbols (Function/Method/Constructor) by name.
     * Faster than `lookupFuzzy` + filter — backed by a lazy callable-only index.
     * Used by ReturnTypeLookup to resolve callee → return type.
     */
    lookupFuzzyCallable: (name: string) => SymbolDefinition[];
    /**
     * Look up a field/property by its owning class nodeId and field name.
     * O(1) via dedicated eagerly-populated index keyed by `ownerNodeId\0fieldName`.
     * Returns undefined when no matching property exists or the owner is ambiguous.
     */
    lookupFieldByOwner: (ownerNodeId: string, fieldName: string) => SymbolDefinition | undefined;
    /**
     * Debugging: See how many symbols are tracked
     */
    getStats: () => {
        fileCount: number;
        globalSymbolCount: number;
    };
    /**
     * Cleanup memory
     */
    clear: () => void;
}
export declare const createSymbolTable: () => SymbolTable;
