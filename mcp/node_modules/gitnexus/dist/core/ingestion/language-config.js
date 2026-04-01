import fs from 'fs/promises';
import path from 'path';
const isDev = process.env.NODE_ENV === 'development';
// ============================================================================
// LANGUAGE-SPECIFIC CONFIG LOADERS
// ============================================================================
/**
 * Parse tsconfig.json to extract path aliases.
 * Tries tsconfig.json, tsconfig.app.json, tsconfig.base.json in order.
 */
export async function loadTsconfigPaths(repoRoot) {
    const candidates = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.base.json'];
    for (const filename of candidates) {
        try {
            const tsconfigPath = path.join(repoRoot, filename);
            const raw = await fs.readFile(tsconfigPath, 'utf-8');
            // Strip JSON comments (// and /* */ style) for robustness
            const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            const tsconfig = JSON.parse(stripped);
            const compilerOptions = tsconfig.compilerOptions;
            if (!compilerOptions?.paths)
                continue;
            const baseUrl = compilerOptions.baseUrl || '.';
            const aliases = new Map();
            for (const [pattern, targets] of Object.entries(compilerOptions.paths)) {
                if (!Array.isArray(targets) || targets.length === 0)
                    continue;
                const target = targets[0];
                // Convert glob patterns: "@/*" -> "@/", "src/*" -> "src/"
                const aliasPrefix = pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern;
                const targetPrefix = target.endsWith('/*') ? target.slice(0, -1) : target;
                aliases.set(aliasPrefix, targetPrefix);
            }
            if (aliases.size > 0) {
                if (isDev) {
                    console.log(`📦 Loaded ${aliases.size} path aliases from ${filename}`);
                }
                return { aliases, baseUrl };
            }
        }
        catch {
            // File doesn't exist or isn't valid JSON - try next
        }
    }
    return null;
}
/**
 * Parse go.mod to extract module path.
 */
export async function loadGoModulePath(repoRoot) {
    try {
        const goModPath = path.join(repoRoot, 'go.mod');
        const content = await fs.readFile(goModPath, 'utf-8');
        const match = content.match(/^module\s+(\S+)/m);
        if (match) {
            if (isDev) {
                console.log(`📦 Loaded Go module path: ${match[1]}`);
            }
            return { modulePath: match[1] };
        }
    }
    catch {
        // No go.mod
    }
    return null;
}
/** Parse composer.json to extract PSR-4 autoload mappings (including autoload-dev). */
export async function loadComposerConfig(repoRoot) {
    try {
        const composerPath = path.join(repoRoot, 'composer.json');
        const raw = await fs.readFile(composerPath, 'utf-8');
        const composer = JSON.parse(raw);
        const psr4Raw = composer.autoload?.['psr-4'] ?? {};
        const psr4Dev = composer['autoload-dev']?.['psr-4'] ?? {};
        const merged = { ...psr4Raw, ...psr4Dev };
        const psr4 = new Map();
        for (const [ns, dir] of Object.entries(merged)) {
            const nsNorm = ns.replace(/\\+$/, '');
            const dirNorm = dir.replace(/\\/g, '/').replace(/\/+$/, '');
            psr4.set(nsNorm, dirNorm);
        }
        if (isDev) {
            console.log(`📦 Loaded ${psr4.size} PSR-4 mappings from composer.json`);
        }
        return { psr4 };
    }
    catch {
        return null;
    }
}
/**
 * Parse .csproj files to extract RootNamespace.
 * Scans the repo root for .csproj files and returns configs for each.
 */
export async function loadCSharpProjectConfig(repoRoot) {
    const configs = [];
    // BFS scan for .csproj files up to 5 levels deep, cap at 100 dirs to avoid runaway scanning
    const scanQueue = [{ dir: repoRoot, depth: 0 }];
    const maxDepth = 5;
    const maxDirs = 100;
    let dirsScanned = 0;
    while (scanQueue.length > 0 && dirsScanned < maxDirs) {
        const { dir, depth } = scanQueue.shift();
        dirsScanned++;
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && depth < maxDepth) {
                    // Skip common non-project directories
                    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'bin' || entry.name === 'obj')
                        continue;
                    scanQueue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
                }
                if (entry.isFile() && entry.name.endsWith('.csproj')) {
                    try {
                        const csprojPath = path.join(dir, entry.name);
                        const content = await fs.readFile(csprojPath, 'utf-8');
                        const nsMatch = content.match(/<RootNamespace>\s*([^<]+)\s*<\/RootNamespace>/);
                        const rootNamespace = nsMatch
                            ? nsMatch[1].trim()
                            : entry.name.replace(/\.csproj$/, '');
                        const projectDir = path.relative(repoRoot, dir).replace(/\\/g, '/');
                        configs.push({ rootNamespace, projectDir });
                        if (isDev) {
                            console.log(`📦 Loaded C# project: ${entry.name} (namespace: ${rootNamespace}, dir: ${projectDir})`);
                        }
                    }
                    catch {
                        // Can't read .csproj
                    }
                }
            }
        }
        catch {
            // Can't read directory
        }
    }
    return configs;
}
export async function loadSwiftPackageConfig(repoRoot) {
    // Swift imports are module-name based (e.g., `import SiuperModel`)
    // SPM convention: Sources/<TargetName>/ or Package/Sources/<TargetName>/
    // We scan for these directories to build a target map
    const targets = new Map();
    const sourceDirs = ['Sources', 'Package/Sources', 'src'];
    for (const sourceDir of sourceDirs) {
        try {
            const fullPath = path.join(repoRoot, sourceDir);
            const entries = await fs.readdir(fullPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    targets.set(entry.name, sourceDir + '/' + entry.name);
                }
            }
        }
        catch {
            // Directory doesn't exist
        }
    }
    if (targets.size > 0) {
        if (isDev) {
            console.log(`📦 Loaded ${targets.size} Swift package targets`);
        }
        return { targets };
    }
    return null;
}
// ============================================================================
// BUNDLED CONFIG LOADER
// ============================================================================
/** Load all language-specific configs once for an ingestion run. */
export async function loadImportConfigs(repoRoot) {
    return {
        tsconfigPaths: await loadTsconfigPaths(repoRoot),
        goModule: await loadGoModulePath(repoRoot),
        composerConfig: await loadComposerConfig(repoRoot),
        swiftPackageConfig: await loadSwiftPackageConfig(repoRoot),
        csharpConfigs: await loadCSharpProjectConfig(repoRoot),
    };
}
