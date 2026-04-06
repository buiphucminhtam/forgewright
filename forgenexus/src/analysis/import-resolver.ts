/**
 * Suffix Trie for O(1) import path resolution.
 *
 * A suffix trie indexes all suffixes of file paths, enabling
 * fast lookup of the longest matching path. This replaces the
 * O(n*m) suffix matching in resolveModuleImports.
 *
 * Example: For path "src/components/Button/index.ts",
 * indexes: "src/components/Button/index.ts", "components/Button/index.ts",
 *          "Button/index.ts", "index.ts"
 */

export interface SuffixIndex {
  trie: Map<string, SuffixIndex | true> // true = terminal
  count: number
}

export function buildSuffixIndex(paths: string[]): SuffixIndex {
  const root: SuffixIndex = { trie: new Map(), count: 0 }

  for (const path of paths) {
    const normalized = path.replace(/\\/g, '/')
    const parts = normalized.split('/')

    // Index all suffixes (from each part to end)
    for (let start = 0; start < parts.length; start++) {
      const suffix = parts.slice(start).join('/')
      insertSuffix(root, suffix)
    }

    // Also index the full normalized path
    insertSuffix(root, normalized)
  }

  return root
}

function insertSuffix(node: SuffixIndex, suffix: string): void {
  const parts = suffix.split('/')

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const isTerminal = i === parts.length - 1

    let child = node.trie.get(part)
    if (!child) {
      child = isTerminal ? true : { trie: new Map(), count: 0 }
      node.trie.set(part, child)
    }

    if (isTerminal && child !== true) {
      const suffix = child as SuffixIndex
      suffix.count++
    }

    if (typeof child === 'boolean') break
    node = child
  }
}

/**
 * Resolve an import path to the best matching file path.
 * Uses longest suffix match for resolution.
 *
 * Supports:
 * - Relative paths: ./foo, ../utils, ../../models
 * - Absolute-like: /src/components
 * - Package paths: @org/package
 * - Extensions: foo → foo.ts, foo.tsx, foo/index.ts
 */
export function resolveImportPath(
  importSource: string,
  currentFile: string,
  suffixIndex: SuffixIndex,
): string | null {
  const candidates = generateCandidates(importSource, currentFile)
  let bestMatch: string | null = null
  let bestMatchLen = 0

  for (const candidate of candidates) {
    const found = findExactMatch(suffixIndex, candidate.split('/'))
    if (found !== null && found.length > bestMatchLen) {
      bestMatch = found
      bestMatchLen = found.length
    }
  }

  return bestMatch
}

function generateCandidates(importSource: string, currentFile: string): string[] {
  const candidates: string[] = []
  const normalized = importSource.replace(/\\/g, '/')

  // Get directory of current file
  const currentDir = currentFile.replace(/\\/g, '/').split('/').slice(0, -1).join('/')

  // 1. Relative paths: ./foo, ../foo, ../../foo
  if (normalized.startsWith('.')) {
    const resolved = resolveRelativePath(normalized, currentDir)
    candidates.push(resolved)
    // Also try with extensions
    candidates.push(resolved + '.ts')
    candidates.push(resolved + '.tsx')
    candidates.push(resolved + '.js')
    candidates.push(resolved + '.jsx')
    candidates.push(resolved + '/index.ts')
    candidates.push(resolved + '/index.js')
    return candidates
  }

  // 2. Absolute-ish paths starting with src/, lib/, etc.
  // Try resolving from common root
  const roots = ['', currentDir + '/..', currentDir]
  for (const root of roots) {
    const abs = root ? root + '/' + normalized : normalized
    candidates.push(abs)
    candidates.push(abs + '.ts')
    candidates.push(abs + '.tsx')
    candidates.push(abs + '.js')
    candidates.push(abs + '/index.ts')
    candidates.push(abs + '/index.js')
  }

  // 3. Package-style: @org/package/subpath
  if (normalized.startsWith('@')) {
    candidates.push(normalized)
    candidates.push(normalized + '/index')
  }

  return candidates
}

function resolveRelativePath(relative: string, fromDir: string): string {
  const parts = fromDir.split('/').filter(Boolean)
  let rel = relative

  while (rel.startsWith('../')) {
    rel = rel.slice(3)
    parts.pop()
  }

  if (rel.startsWith('./')) {
    rel = rel.slice(2)
  }

  return [...parts, ...rel.split('/').filter(Boolean)].join('/')
}

function findExactMatch(node: SuffixIndex, parts: string[]): string | null {
  let current = node
  const matched: string[] = []
  let isTerminal = false

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const child = current.trie.get(part)

    if (child === undefined) {
      break
    }

    matched.push(part)

    if (child === true) {
      isTerminal = true
      break
    }

    if (typeof child === 'object') {
      current = child
    }
  }

  if (
    isTerminal ||
    (matched.length === parts.length && typeof current === 'object' && current.count > 0)
  ) {
    return matched.join('/')
  }

  return null
}

/**
 * Build a fast name→uid map from a list of nodes.
 * O(n) single pass instead of O(n²) repeated scans.
 */
export function buildNameUidMap(
  nodes: Array<{ uid: string; name: string; type: string; filePath?: string }>,
): Map<string, string> {
  const map = new Map<string, string>()

  for (const n of nodes) {
    // Key: type:name (most specific)
    const key = `${n.type}:${n.name}`
    if (!map.has(key)) {
      map.set(key, n.uid)
    }
  }

  return map
}

/**
 * Build a fast file→symbols map from a list of nodes.
 */
export function buildFileSymbolMap(
  nodes: Array<{ uid: string; name: string; filePath: string }>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()

  for (const n of nodes) {
    if (!map.has(n.filePath)) {
      map.set(n.filePath, new Set())
    }
    map.get(n.filePath)!.add(n.name)
  }

  return map
}

/**
 * Topological sort of source files by import dependencies.
 * Files at the same level have no mutual dependencies and
 * can be processed in parallel.
 */
export function topologicalSort(
  files: string[],
  importEdges: Array<{ from: string; to: string }>,
): string[][] {
  const allFiles = new Set(files)
  const inDegree = new Map<string, number>()
  const adj = new Map<string, Set<string>>()

  // Initialize
  for (const f of allFiles) {
    inDegree.set(f, 0)
    adj.set(f, new Set())
  }

  // Build graph
  for (const { from, to } of importEdges) {
    if (allFiles.has(from) && allFiles.has(to)) {
      adj.get(to)!.add(from) // reverse: to depends on from
      inDegree.set(from, (inDegree.get(from) ?? 0) + 1)
    }
  }

  // BFS by levels
  const levels: string[][] = []
  let currentLevel: string[] = []

  for (const [f, degree] of inDegree) {
    if (degree === 0) currentLevel.push(f)
  }

  while (currentLevel.length > 0) {
    levels.push([...currentLevel])

    const nextLevel: string[] = []
    for (const node of currentLevel) {
      for (const dep of adj.get(node) ?? []) {
        const newDegree = (inDegree.get(dep) ?? 1) - 1
        inDegree.set(dep, newDegree)
        if (newDegree === 0) {
          nextLevel.push(dep)
        }
      }
    }
    currentLevel = nextLevel
  }

  return levels
}
