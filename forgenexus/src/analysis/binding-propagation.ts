/**
 * Cross-file binding propagation.
 *
 * Resolves UNKNOWN:* call targets by propagating exported symbol information
 * across the import graph using Kahn's topological sort.
 *
 * Phase 1: Build exportedTypeMap from all IMPORTS edges
 * Phase 2: Topological sort files by imports (dependency order)
 * Phase 3: Propagate types from upstream to downstream
 *
 * This dramatically improves call edge accuracy by resolving module exports.
 */

import type { CodeNode, CodeEdge } from '../types.js'
import { topologicalSort } from './import-resolver.js'

interface BindingContext {
  // file → set of exported symbol names
  exportedByFile: Map<string, Set<string>>
  // file → uid of exported symbols
  exportedUidByFile: Map<string, Map<string, string>>
  // "symbolName" → uid (global, unique symbols only)
  globalSymbolMap: Map<string, string>
  // topological levels for ordered processing
  levels: string[][]
  // all edges passed in (for finding UNKNOWN targets)
  allEdges: CodeEdge[]
  // node uid → CodeNode
  nodeMap: Map<string, CodeNode>
}

/**
 * Propagate type bindings across files using topological sort.
 * Returns additional resolved edges to add to the graph.
 */
export function propagateBindings(nodes: CodeNode[], edges: CodeEdge[]): CodeEdge[] {
  if (nodes.length < 10) {
    // Skip for tiny codebases
    return []
  }

  // Phase 1: Build context
  const ctx = buildBindingContext(nodes, edges)
  if (ctx.levels.length === 0) return []

  // Phase 2: Propagate through dependency levels
  const resolvedEdges: CodeEdge[] = []
  const resolvedCallIds = new Set<string>() // avoid duplicates

  // Forward propagation: process files in topological order
  // Files at level N can rely on bindings from levels 0..N-1
  for (const level of ctx.levels) {
    for (const file of level) {
      const fileNodes = ctx.nodeMap.get(file)
        ? [ctx.nodeMap.get(file)!]
        : nodes.filter((n) => n.filePath === file)

      for (const node of fileNodes) {
        const resolved = resolveUnknownsForNode(node, ctx, resolvedCallIds)
        for (const edge of resolved) {
          resolvedEdges.push(edge)
        }
      }
    }
  }

  return resolvedEdges
}

/**
 * Build the binding context from nodes and edges.
 */
function buildBindingContext(nodes: CodeNode[], edges: CodeEdge[]): BindingContext {
  // Build file-level exports
  const exportedByFile = new Map<string, Set<string>>()
  const exportedUidByFile = new Map<string, Map<string, string>>()
  const globalSymbolMap = new Map<string, string>()
  const filePaths = new Set<string>()
  const nodeMap = new Map<string, CodeNode>()

  for (const node of nodes) {
    const fp = node.filePath
    filePaths.add(fp)
    nodeMap.set(fp, node)

    if (!exportedByFile.has(fp)) {
      exportedByFile.set(fp, new Set())
      exportedUidByFile.set(fp, new Map())
    }

    const name = node.name
    if (name && name !== 'anonymous') {
      exportedByFile.get(fp)!.add(name)
      if (!exportedUidByFile.get(fp)!.has(name)) {
        exportedUidByFile.get(fp)!.set(name, node.uid)
      }

      // Global symbol map (only if unique name)
      if (!globalSymbolMap.has(name)) {
        globalSymbolMap.set(name, node.uid)
      }
    }
  }

  // Build import graph for topological sort
  const exportEdges: Array<{ from: string; to: string }> = []

  for (const edge of edges) {
    if (edge.type === 'IMPORTS' && edge.toUid.startsWith('IMPORT:')) {
      const parts = edge.toUid.split(':')
      const source = parts[1]
      if (source) {
        const importedFile = resolveImportToFile(source, edge.fromUid.split(':')[0], [...filePaths])
        if (importedFile) {
          exportEdges.push({
            from: importedFile,
            to: edge.fromUid.split(':')[0],
          })
        }
      }
    }
  }

  const levels = topologicalSort([...filePaths], exportEdges)

  return {
    exportedByFile,
    exportedUidByFile,
    globalSymbolMap,
    levels,
    allEdges: edges,
    nodeMap,
  }
}

/**
 * Resolve UNKNOWN:* call targets for a specific node.
 * Uses binding context from topological sort propagation.
 */
function resolveUnknownsForNode(
  node: CodeNode,
  ctx: BindingContext,
  alreadyResolved: Set<string>,
): CodeEdge[] {
  const resolved: CodeEdge[] = []

  // Find all CALLS edges from this node that have UNKNOWN targets
  const unknownCalls = ctx.allEdges.filter(
    (e) => e.fromUid === node.uid && e.type === 'CALLS' && e.toUid.startsWith('UNKNOWN:'),
  )

  for (const edge of unknownCalls) {
    if (alreadyResolved.has(edge.id)) continue

    const parts = edge.toUid.split(':')
    if (parts.length < 3) continue

    const targetType = parts[1] // e.g., "Function", "Method", "Property"
    const targetName = parts[2] // e.g., "parseInput", "User"

    // Strategy 1: Global symbol map (unique names)
    const globalKey = `${targetType}:${targetName}`
    const globalUid = ctx.globalSymbolMap.get(globalKey) ?? ctx.globalSymbolMap.get(targetName)

    if (globalUid) {
      resolved.push({
        ...edge,
        toUid: globalUid,
        confidence: Math.min(edge.confidence + 0.1, 1.0),
        reason: 'binding-propagation:global',
      })
      alreadyResolved.add(edge.id)
      continue
    }

    // Strategy 2: Find exported symbol in imported files
    // Parse the caller's file to find its imports
    const callerFile = edge.fromUid.split(':')[0]
    const imports = ctx.allEdges.filter(
      (e) =>
        e.fromUid.startsWith(callerFile) && e.type === 'IMPORTS' && e.toUid.startsWith('IMPORT:'),
    )

    for (const imp of imports) {
      const impParts = imp.toUid.split(':')
      if (impParts.length < 2) continue

      const importedSource = impParts[1] // e.g., "./utils", "@org/pkg"
      const importedSymbol = (impParts[2] ?? 'default') as string

      // Find which file this import resolves to
      const importedFile = resolveImportToFile(importedSource, callerFile, [
        ...ctx.exportedByFile.keys(),
      ])
      if (!importedFile) continue

      // Check if the imported file exports the symbol we're looking for
      const fileExports = ctx.exportedUidByFile.get(importedFile)
      if (!fileExports) continue

      if (
        importedSymbol === 'default' ||
        importedSymbol === 'module' ||
        importedSymbol === 'file'
      ) {
        const exactMatch = fileExports.get(targetName)
        if (exactMatch) {
          resolved.push({
            ...edge,
            toUid: exactMatch,
            confidence: Math.min(edge.confidence + 0.05, 1.0),
            reason: 'binding-propagation:imported-file',
          })
          alreadyResolved.add(edge.id)
          break
        }
      }
      // Wildcard import: try any exported symbol matching the target name
      if (importedSymbol === 'wildcard') {
        const anyMatch = fileExports.get(targetName)
        if (anyMatch) {
          resolved.push({
            ...edge,
            toUid: anyMatch,
            confidence: Math.min(edge.confidence + 0.05, 1.0),
            reason: 'binding-propagation:wildcard-resolved',
          })
          alreadyResolved.add(edge.id)
          break
        }
      }
    }
  }

  return resolved
}

/**
 * Resolve an import source to an actual file path.
 */
function resolveImportToFile(
  importSource: string,
  fromFile: string,
  allFiles: string[],
): string | null {
  const normalized = importSource.replace(/\\/g, '/').replace(/^['"`]|['"`]$/g, '')
  const fromDir = fromFile.split('/').slice(0, -1).join('/')

  // Try direct suffix matches
  const candidates = [
    normalized,
    normalized + '.ts',
    normalized + '.tsx',
    normalized + '.js',
    normalized + '.jsx',
    normalized + '/index.ts',
    normalized + '/index.js',
    fromDir + '/' + normalized,
    fromDir + '/' + normalized + '.ts',
    fromDir + '/' + normalized + '/index.ts',
  ]

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.replace(/\\/g, '/')
    if (allFiles.includes(normalizedCandidate)) {
      return normalizedCandidate
    }
  }

  // Try suffix match
  for (const file of allFiles) {
    const normalizedFile = file.replace(/\\/g, '/')
    if (
      normalizedFile.endsWith(normalized) ||
      normalizedFile.endsWith(normalized + '.ts') ||
      normalizedFile.endsWith(normalized + '.js')
    ) {
      return file
    }
  }

  return null
}

/**
 * Check if binding propagation should be skipped based on coverage.
 * If <3% of symbols have imports, skip the expensive propagation.
 */
export function shouldSkipBindingPropagation(nodes: CodeNode[], edges: CodeEdge[]): boolean {
  const importEdgeCount = edges.filter((e) => e.type === 'IMPORTS').length
  const totalNodes = nodes.length
  const ratio = totalNodes > 0 ? importEdgeCount / totalNodes : 0
  return ratio < 0.03 && totalNodes > 100
}
