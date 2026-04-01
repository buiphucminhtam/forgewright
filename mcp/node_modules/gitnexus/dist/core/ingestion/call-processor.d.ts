import { KnowledgeGraph } from '../graph/types.js';
import { ASTCache } from './ast-cache.js';
import type { SymbolTable } from './symbol-table.js';
import type { ResolutionContext } from './resolution-context.js';
import type { ExtractedCall, ExtractedAssignment, ExtractedHeritage, ExtractedRoute, ExtractedFetchCall, FileConstructorBindings } from './workers/parse-worker.js';
/** Per-file resolved type bindings for exported symbols.
 *  Populated during call processing, consumed by Phase 14 re-resolution pass. */
export type ExportedTypeMap = Map<string, Map<string, string>>;
/** Build a map of imported callee names → return types for cross-file call-result binding.
 *  Consulted ONLY when SymbolTable has no unambiguous local match (local-first principle). */
export declare function buildImportedReturnTypes(filePath: string, namedImportMap: ReadonlyMap<string, ReadonlyMap<string, {
    sourcePath: string;
    exportedName: string;
}>>, symbolTable: {
    lookupExactFull(filePath: string, name: string): {
        returnType?: string;
    } | undefined;
}): ReadonlyMap<string, string>;
/** Build cross-file RAW return types for imported callables.
 *  Unlike buildImportedReturnTypes (which stores extractReturnTypeName output),
 *  this stores the raw declared return type string (e.g., 'User[]', 'List<User>').
 *  Used by lookupRawReturnType for for-loop element extraction via extractElementTypeFromString. */
export declare function buildImportedRawReturnTypes(filePath: string, namedImportMap: ReadonlyMap<string, ReadonlyMap<string, {
    sourcePath: string;
    exportedName: string;
}>>, symbolTable: {
    lookupExactFull(filePath: string, name: string): {
        returnType?: string;
    } | undefined;
}): ReadonlyMap<string, string>;
/** Build ExportedTypeMap from graph nodes — used for worker path where TypeEnv
 *  is not available in the main thread. Collects returnType/declaredType from
 *  exported symbols that have callables with known return types. */
export declare function buildExportedTypeMapFromGraph(graph: KnowledgeGraph, symbolTable: SymbolTable): ExportedTypeMap;
/** Seed cross-file receiver types into pre-extracted call records.
 *  Fills missing receiverTypeName for single-hop imported variables
 *  using ExportedTypeMap + namedImportMap — zero disk I/O, zero AST re-parsing.
 *  Mutates calls in-place. Runs BEFORE processCallsFromExtracted. */
export declare function seedCrossFileReceiverTypes(calls: ExtractedCall[], namedImportMap: ReadonlyMap<string, ReadonlyMap<string, {
    sourcePath: string;
    exportedName: string;
}>>, exportedTypeMap: ReadonlyMap<string, ReadonlyMap<string, string>>): {
    enrichedCount: number;
};
export declare const processCalls: (graph: KnowledgeGraph, files: {
    path: string;
    content: string;
}[], astCache: ASTCache, ctx: ResolutionContext, onProgress?: (current: number, total: number) => void, exportedTypeMap?: ExportedTypeMap, 
/** Phase 14: pre-resolved cross-file bindings to seed into buildTypeEnv. Keyed by filePath → Map<localName, typeName>. */
importedBindingsMap?: ReadonlyMap<string, ReadonlyMap<string, string>>, 
/** Phase 14 E3: cross-file return types for imported callables. Keyed by filePath → Map<calleeName, returnType>.
 *  Consulted ONLY when SymbolTable has no unambiguous match (local-first principle). */
importedReturnTypesMap?: ReadonlyMap<string, ReadonlyMap<string, string>>, 
/** Phase 14 E3: cross-file RAW return types for for-loop element extraction. Keyed by filePath → Map<calleeName, rawReturnType>. */
importedRawReturnTypesMap?: ReadonlyMap<string, ReadonlyMap<string, string>>) => Promise<ExtractedHeritage[]>;
/**
 * Fast path: resolve pre-extracted call sites from workers.
 * No AST parsing — workers already extracted calledName + sourceId.
 */
export declare const processCallsFromExtracted: (graph: KnowledgeGraph, extractedCalls: ExtractedCall[], ctx: ResolutionContext, onProgress?: (current: number, total: number) => void, constructorBindings?: FileConstructorBindings[]) => Promise<void>;
/**
 * Resolve pre-extracted field write assignments to ACCESSES {reason: 'write'} edges.
 * Accepts optional constructorBindings for return-type-aware receiver inference,
 * mirroring processCallsFromExtracted's verified binding lookup.
 */
export declare const processAssignmentsFromExtracted: (graph: KnowledgeGraph, assignments: ExtractedAssignment[], ctx: ResolutionContext, constructorBindings?: FileConstructorBindings[]) => void;
/**
 * Resolve pre-extracted Laravel routes to CALLS edges from route files to controller methods.
 */
export declare const processRoutesFromExtracted: (graph: KnowledgeGraph, extractedRoutes: ExtractedRoute[], ctx: ResolutionContext, onProgress?: (current: number, total: number) => void) => Promise<void>;
export declare const extractConsumerAccessedKeys: (content: string) => string[];
/**
 * Create FETCHES edges from extracted fetch() calls to matching Route nodes.
 * When consumerContents is provided, extracts property access patterns from
 * consumer files and encodes them in the edge reason field.
 */
export declare const processNextjsFetchRoutes: (graph: KnowledgeGraph, fetchCalls: ExtractedFetchCall[], routeRegistry: Map<string, string>, // routeURL → handlerFilePath
consumerContents?: Map<string, string>) => void;
/**
 * Extract fetch() calls from source files (sequential path).
 * Workers handle this via tree-sitter captures in parse-worker; this function
 * provides the same extraction for the sequential fallback path.
 */
export declare const extractFetchCallsFromFiles: (files: {
    path: string;
    content: string;
}[], astCache: ASTCache) => Promise<ExtractedFetchCall[]>;
