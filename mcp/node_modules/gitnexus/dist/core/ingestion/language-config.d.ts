import type { ImportConfigs } from './import-resolvers/types.js';
/** TypeScript path alias config parsed from tsconfig.json */
export interface TsconfigPaths {
    /** Map of alias prefix -> target prefix (e.g., "@/" -> "src/") */
    aliases: Map<string, string>;
    /** Base URL for path resolution (relative to repo root) */
    baseUrl: string;
}
/** Go module config parsed from go.mod */
export interface GoModuleConfig {
    /** Module path (e.g., "github.com/user/repo") */
    modulePath: string;
}
/** PHP Composer PSR-4 autoload config */
export interface ComposerConfig {
    /** Map of namespace prefix -> directory (e.g., "App\\" -> "app/") */
    psr4: Map<string, string>;
    /** PSR-4 entries sorted by namespace length descending (longest match wins).
     *  Cached once at config load time to avoid re-sorting on every import. */
    psr4Sorted?: readonly [string, string][];
}
/** C# project config parsed from .csproj files */
export interface CSharpProjectConfig {
    /** Root namespace from <RootNamespace> or assembly name (default: project directory name) */
    rootNamespace: string;
    /** Directory containing the .csproj file */
    projectDir: string;
}
/** Swift Package Manager module config */
export interface SwiftPackageConfig {
    /** Map of target name -> source directory path (e.g., "SiuperModel" -> "Package/Sources/SiuperModel") */
    targets: Map<string, string>;
}
/**
 * Parse tsconfig.json to extract path aliases.
 * Tries tsconfig.json, tsconfig.app.json, tsconfig.base.json in order.
 */
export declare function loadTsconfigPaths(repoRoot: string): Promise<TsconfigPaths | null>;
/**
 * Parse go.mod to extract module path.
 */
export declare function loadGoModulePath(repoRoot: string): Promise<GoModuleConfig | null>;
/** Parse composer.json to extract PSR-4 autoload mappings (including autoload-dev). */
export declare function loadComposerConfig(repoRoot: string): Promise<ComposerConfig | null>;
/**
 * Parse .csproj files to extract RootNamespace.
 * Scans the repo root for .csproj files and returns configs for each.
 */
export declare function loadCSharpProjectConfig(repoRoot: string): Promise<CSharpProjectConfig[]>;
export declare function loadSwiftPackageConfig(repoRoot: string): Promise<SwiftPackageConfig | null>;
/** Load all language-specific configs once for an ingestion run. */
export declare function loadImportConfigs(repoRoot: string): Promise<ImportConfigs>;
