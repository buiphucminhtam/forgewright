/**
 * Resolution Context
 *
 * Single implementation of tiered name resolution. Replaces the duplicated
 * tier-selection logic previously split between symbol-resolver.ts and
 * call-processor.ts.
 *
 * Resolution tiers (highest confidence first):
 * 1. Same file (lookupExactFull — authoritative)
 * 2a-named. Named binding chain (walkBindingChain via NamedImportMap)
 * 2a. Import-scoped (lookupFuzzy filtered by ImportMap)
 * 2b. Package-scoped (lookupFuzzy filtered by PackageMap)
 * 3. Global (all candidates — consumers must check candidate count)
 */
import type { SymbolTable, SymbolDefinition } from './symbol-table.js';
import type { NamedImportBinding } from './import-processor.js';
/** Resolution tier for tracking, logging, and test assertions. */
export type ResolutionTier = 'same-file' | 'import-scoped' | 'global';
/** Tier-selected candidates with metadata. */
export interface TieredCandidates {
    readonly candidates: readonly SymbolDefinition[];
    readonly tier: ResolutionTier;
}
/** Confidence scores per resolution tier. */
export declare const TIER_CONFIDENCE: Record<ResolutionTier, number>;
export type ImportMap = Map<string, Set<string>>;
export type PackageMap = Map<string, Set<string>>;
export type NamedImportMap = Map<string, Map<string, NamedImportBinding>>;
/** Maps callerFile → (moduleAlias → sourceFilePath) for Python namespace imports.
 *  e.g. `import models` in app.py → moduleAliasMap.get('app.py')?.get('models') === 'models.py' */
export type ModuleAliasMap = Map<string, Map<string, string>>;
export interface ResolutionContext {
    /**
     * The only resolution API. Returns all candidates at the winning tier.
     *
     * Tier 3 ('global') returns ALL candidates regardless of count —
     * consumers must check candidates.length and refuse ambiguous matches.
     */
    resolve(name: string, fromFile: string): TieredCandidates | null;
    /** Symbol table — used by parsing-processor to populate symbols. */
    readonly symbols: SymbolTable;
    /** Raw maps — used by import-processor to populate import data. */
    readonly importMap: ImportMap;
    readonly packageMap: PackageMap;
    readonly namedImportMap: NamedImportMap;
    /** Module-alias map for Python namespace imports: callerFile → (alias → sourceFile). */
    readonly moduleAliasMap: ModuleAliasMap;
    enableCache(filePath: string): void;
    clearCache(): void;
    getStats(): {
        fileCount: number;
        globalSymbolCount: number;
        cacheHits: number;
        cacheMisses: number;
    };
    clear(): void;
}
export declare const createResolutionContext: () => ResolutionContext;
