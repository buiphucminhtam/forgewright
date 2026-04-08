/**
 * ForgeNexus Parser Engine — High-Performance Code Intelligence Extractor.
 * Supports: TypeScript, JavaScript, Python, Go, Rust, Java, C#, C/C++, Kotlin, PHP, Ruby, Swift, Dart.
 *
 * Performance optimizations (v2):
 *   - TSQuery instead of manual AST walk: single-pass extraction per pattern
 *   - Parser reuse: one Parser per language, cached and reused across all files
 *   - Pre-compiled queries: compiled once per language, reused forever
 *   - Skip sets: skip irrelevant node types during fallback walk
 *   - Batched language setup: load all needed languages once per engine lifetime
 *
 * Edge types extracted:
 *   CALLS, IMPORTS, EXTENDS, IMPLEMENTS, OVERRIDES,
 *   HAS_METHOD, HAS_PROPERTY, ACCESSES,
 *   HANDLES_ROUTE, HANDLES_TOOL, QUERIES,
 *   MEMBER_OF, STEP_IN_PROCESS
 */

import { createRequire } from 'module'
import Parser from 'tree-sitter'
import type { CodeNode, CodeEdge, NodeType } from '../types.js'
import {
  LANGUAGE_QUERIES,
  type LanguageQueries,
} from './queries.js'

const _require = createRequire(import.meta.url)

// ─── Language Loading ─────────────────────────────────────────────────────────

async function loadLanguage(lang: string): Promise<any> {
  switch (lang) {
    case 'typescript':
    case 'tsx': {
      try {
        const mod = (await import('tree-sitter-typescript')) as any
        const resolved = mod.default ?? mod
        const sub = resolved.typescript ?? resolved.tsx
        return (sub as any)?.language ?? sub ?? null
      } catch { return null }
    }
    case 'javascript': {
      try {
        const mod = (await import('tree-sitter-javascript')) as any
        const resolved = mod.default ?? mod
        return resolved.language ?? resolved ?? null
      } catch { return null }
    }
    case 'python': {
      try { return (_require('tree-sitter-python') as any).default ?? null }
      catch { return null }
    }
    case 'go': {
      try { return (_require('tree-sitter-go') as any).default ?? null }
      catch { return null }
    }
    case 'rust': {
      try { return (_require('tree-sitter-rust') as any).default ?? null }
      catch { return null }
    }
    case 'java': {
      try { return (_require('tree-sitter-java') as any).default ?? null }
      catch { return null }
    }
    case 'csharp': {
      try { return (_require('tree-sitter-c-sharp') as any).default ?? null }
      catch { return null }
    }
    case 'cpp': {
      try { return (_require('tree-sitter-cpp') as any).default ?? null }
      catch { return null }
    }
    case 'c': {
      try { return (_require('tree-sitter-c') as any).default ?? null }
      catch { return null }
    }
    case 'kotlin': {
      try { return (_require('tree-sitter-kotlin') as any).default ?? null }
      catch { return null }
    }
    case 'php': {
      try { return (_require('tree-sitter-php') as any).default ?? null }
      catch { return null }
    }
    case 'ruby': {
      try { return (_require('tree-sitter-ruby') as any).default ?? null }
      catch { return null }
    }
    case 'swift': {
      try { return (_require('tree-sitter-swift') as any).default ?? null }
      catch { return null }
    }
    case 'dart': {
      try { return (_require('tree-sitter-dart') as any).default ?? null }
      catch { return null }
    }
    default: return null
  }
}

// ─── Language Extension Map ───────────────────────────────────────────────────

const LANG_EXT: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go', '.rs': 'rust', '.java': 'java', '.cs': 'csharp',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hxx': 'cpp', '.hh': 'cpp',
  '.kt': 'kotlin', '.kts': 'kotlin', '.php': 'php', '.rb': 'ruby',
  '.swift': 'swift', '.dart': 'dart',
}

// ─── Route/Handler Patterns ──────────────────────────────────────────────────

const ROUTE_PATTERNS = [
  /^(get|post|put|patch|delete|head|options|all)\s*\(/i,
  /^(app|router|express|fastify)\s*\.\s*(get|post|put|patch|delete|all)/i,
  /^(use|route)\s*\(\s*['"`]\//,
  /@\s*(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(/i,
  /@\s*(app|router)\.(get|post|put|patch|delete)\s*\(/i,
  /@\s*(app|router)\.route\s*\(/,
  /@(app|bp)\.get\s*\(/,
  /@(app|bp)\.post\s*\(/,
  /@(Get|Post|Put|Delete|Patch)Mapping\s*\(/i,
  /@(RequestMapping|RestController|Controller)\s*\(/,
  /\.(GET|POST|PUT|PATCH|DELETE|HEAD)\s*\(/,
  /Route::(get|post|put|patch|delete|any|match|options)\s*\(/i,
  /@(get|post|put|patch|delete)\s*\(/i,
  /@(Operation|GET|POST|PUT|DELETE)\s*\(/i,
]

const TOOL_PATTERNS = [
  /@\s*(tool|command|handler|event|method|action)\s*\(/i,
  /['"`]?(tool|command|handler)['"`]?\s*:/,
]

const QUERY_PATTERNS = [
  /\.query\s*\(/, /\.execute\s*\(/, /\.run\s*\(/, /\.all\s*\(/,
  /\.get\s*\(/, /\.find\s*\(/, /\.create\s*\(/, /\.insert\s*\(/,
  /\.update\s*\(/, /\.delete\s*\(/, /\.save\s*\(/, /\.findOne\s*\(/,
  /\.findById\s*\(/, /\.select\s*\(/, /\.where\s*\(/,
  /\.from\s*\(/, /\.join\s*\(/,
]

// ─── Node Type Mapping ────────────────────────────────────────────────────────

function inferNodeType(type: string, lang: string): NodeType {
  switch (type) {
    // Functions
    case 'function_declaration':
    case 'function_definition':
    case 'function_item':
    case 'function_expression':
    case 'decorated_definition':
    case 'lambda':
    case 'function_declaration':
    case 'function':
      return 'Function'
    // Methods
    case 'method_definition':
    case 'method_declaration':
    case 'method':
    case 'singleton_method':
      return 'Method'
    // Classes
    case 'class_declaration':
    case 'class_definition':
    case 'struct_declaration':
    case 'struct_item':
    case 'struct_specifier':
    case 'type_declaration':
    case 'object_declaration':
    case 'class':
      return 'Class'
    // Interfaces
    case 'interface_declaration':
    case 'protocol_declaration':
    case 'trait_item':
    case 'mixin_declaration':
      return 'Interface'
    // Enums
    case 'enum_declaration':
    case 'enum_class_declaration':
    case 'enum_specifier':
      return 'Enum'
    // Impl blocks
    case 'impl_item':
      return 'Impl'
    // Type aliases
    case 'type_alias_declaration':
    case 'type_alias_item':
      return 'TypeAlias'
    // Modules
    case 'module':
      return 'Module'
    // Properties
    case 'property_declaration':
    case 'property_definition':
    case 'public_field_definition':
    case 'private_field_definition':
    case 'field_declaration':
    case 'field_definition':
    case 'property_signature':
    case 'constant_declaration':
    case 'instance_variable_declaration':
      return 'Property'
    // Variables
    case 'variable_declarator':
    case 'assignment':
    case 'assignment_expression':
    case 'parameter':
    case 'formal_parameter':
    case 'required_parameter':
    case 'optional_parameter':
    case 'let_declaration':
    case 'var_declaration':
    case 'const_declaration':
    case 'property':
    case 'lvasgn':
    case 'ivasgn':
    case 'cvasgn':
    case 'constant':
    case 'identifier':
      return 'Variable'
    default:
      return 'Variable'
  }
}

// ─── Position Helpers ────────────────────────────────────────────────────────

function posToIndex(content: string, row: number, col: number): number {
  let line = 0, index = 0
  for (; line < row && index < content.length; index++) {
    if (content[index] === '\n') line++
  }
  return index + col
}

function getNodeText(node: any, content: string): string {
  const start = node.startPosition, end = node.endPosition
  return content.substring(posToIndex(content, start.row, start.column), posToIndex(content, end.row, end.column))
}

function getChild(node: any, type: string): any {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i)
    if (c.type === type) return c
  }
  return null
}

function getNamedChildren(node: any, type: string): any[] {
  const result: any[] = []
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i)
    if (c.type === type) result.push(c)
  }
  return result
}

// ─── ParserEngine ─────────────────────────────────────────────────────────────

export class ParserEngine {
  // ── Caches: initialized once, reused forever ─────────────────────────────
  private langCache = new Map<string, any>()
  private parserCache = new Map<string, Parser>()        // lang → dedicated parser
  private queriesCache = new Map<string, LanguageQueries>()
  private langLoadQueue: Map<string, Promise<any>> = new Map()
  private _defaultParser = new Parser()

  constructor() {
    // Default parser is always available
  }

  // ── Pre-load languages in batch (call once before parsing) ───────────────
  async preloadLanguages(languages: string[]): Promise<void> {
    const needed = [...new Set(languages.map((l) => LANG_EXT['.' + l] ?? l))]
    await Promise.all(needed.map((lang) => this.ensureLanguage(lang)))
  }

  private async ensureLanguage(lang: string): Promise<any> {
    if (this.langCache.has(lang)) return this.langCache.get(lang)
    if (this.langLoadQueue.has(lang)) return this.langLoadQueue.get(lang)

    const promise = loadLanguage(lang).then((langObj) => {
      if (langObj) {
        this.langCache.set(lang, langObj)
        // Create a dedicated parser for this language (never changes)
        const p = new Parser()
        p.setLanguage(langObj)
        this.parserCache.set(lang, p)
        // Load queries
        if (LANGUAGE_QUERIES[lang]) {
          this.queriesCache.set(lang, LANGUAGE_QUERIES[lang])
        }
      }
      this.langLoadQueue.delete(lang)
      return langObj
    })
    this.langLoadQueue.set(lang, promise)
    return promise
  }

  // ── Parse a single file ───────────────────────────────────────────────
  async parseFile(
    filePath: string,
    content: string,
    language?: string,
  ): Promise<{ nodes: CodeNode[]; edges: CodeEdge[] }> {
    const ext = '.' + (filePath.split('.').pop() ?? '').toLowerCase()
    const lang = language ?? LANG_EXT[ext] ?? 'javascript'

    // Ensure language is loaded
    const langObj = await this.ensureLanguage(lang)
    if (!langObj) {
      return { nodes: [], edges: [] }
    }

    // Get parser for this language (reuse, never recreate)
    let parser: Parser
    if (this.parserCache.has(lang)) {
      parser = this.parserCache.get(lang)!
    } else {
      parser = new Parser()
      parser.setLanguage(langObj)
      this.parserCache.set(lang, parser)
    }

    const nodes: CodeNode[] = []
    const edges: CodeEdge[] = []
    const queries = this.queriesCache.get(lang) ?? LANGUAGE_QUERIES[lang]

    // File-level pattern detection
    this.detectFilePatterns(content, filePath, nodes, edges)

    try {
      const tree = parser.parse(content)
      const root = tree.rootNode

      // Phase 1: TSQuery extraction (fast path)
      if (queries) {
        this.extractViaTSQuery(root, content, filePath, lang, queries, nodes, edges)
      }

      // Phase 2: Fallback walk for remaining nodes (only nodes not covered by queries)
      if (!queries || !LANGUAGE_QUERIES[lang]) {
        this.walkFallback(root, content, filePath, lang, nodes, edges)
      } else {
        // Partial fallback: walk only non-skipped types
        const skipTypes = LANGUAGE_QUERIES[lang]?.skipTypes
        if (skipTypes) {
          this.walkFallback(root, content, filePath, lang, nodes, edges, skipTypes)
        }
      }
    } catch {
      /* skip parse errors */
    }

    // ── Deduplicate nodes (tree-sitter queries may emit the same node twice
    //     via overlapping patterns, e.g. arrow_function inside variable_declarator)
    const seenUids = new Set<string>()
    const uniqueNodes: CodeNode[] = []
    for (const n of nodes) {
      if (!seenUids.has(n.uid)) {
        seenUids.add(n.uid)
        uniqueNodes.push(n)
      }
    }
    if (uniqueNodes.length < nodes.length) {
      console.warn(`[ForgeNexus] Parser deduplicated ${nodes.length - uniqueNodes.length} duplicate nodes in ${filePath}.`)
    }

    return { nodes: uniqueNodes, edges }
  }

  // ── TSQuery-driven extraction (main path) ────────────────────────────────
  private extractViaTSQuery(
    root: any,
    content: string,
    filePath: string,
    lang: string,
    queries: LanguageQueries,
    nodes: CodeNode[],
    edges: CodeEdge[],
  ): void {
    // Symbol declarations via TSQuery
    if (queries.symbolQuery) {
      this.extractSymbolsTSQ(root, content, filePath, lang, queries.symbolQuery, nodes, edges)
    }
    // Calls via TSQuery
    if (queries.callQuery) {
      this.extractCallsTSQ(root, content, filePath, lang, queries.callQuery, nodes, edges)
    }
    // Imports via TSQuery
    if (queries.importQuery) {
      this.extractImportsTSQ(root, content, filePath, lang, queries.importQuery, nodes, edges)
    }
    // Heritage via TSQuery
    if (queries.heritageQuery) {
      this.extractHeritageTSQ(root, content, filePath, lang, queries.heritageQuery, nodes, edges)
    }
  }

  private extractSymbolsTSQ(
    root: any,
    content: string,
    filePath: string,
    lang: string,
    query: string,
    nodes: CodeNode[],
    _edges: CodeEdge[],
  ): void {
    try {
      const langObj = this.langCache.get(lang)
      if (!langObj) return

      const tsQuery = (langObj as any).query(query)

      tsQuery.captures(root).forEach((m: any) => {
        const name = m.name
        if (name !== 'sym.declaration' && !name.startsWith('sym.')) return

        const node = m.node
        const start = node.startPosition
        const end = node.endPosition
        const nodeType = inferNodeType(node.type, lang)

        // Get name from capture
        let nameText = ''
        const symNameMatch = [...tsQuery.captures(root)].find((c: any) =>
          c.node === node && (c.name === 'sym.name' || c.name === 'sym.decorator')
        )
        if (symNameMatch) {
          const s = symNameMatch.node.startPosition
          const e = symNameMatch.node.endPosition
          nameText = content.substring(posToIndex(content, s.row, s.column), posToIndex(content, e.row, e.column))
        }

        if (!nameText || nameText === 'anonymous') {
          // Fallback: find identifier child
          nameText = this.getNodeName(node, content, lang) ?? 'anonymous'
        }

        const uid = `${filePath}:${nodeType}:${nameText}:${start.row + 1}:${start.column}`
        const symNode: CodeNode = {
          uid, type: nodeType, name: nameText, filePath,
          line: start.row + 1, endLine: end.row + 1,
          column: start.column, language: lang,
        }

        // Extract return type from capture
        const returnTypeCap = [...tsQuery.captures(root)].find((c: any) =>
          c.node === node && c.name === 'sym.returnType'
        )
        if (returnTypeCap) {
          const s = returnTypeCap.node.startPosition
          const e = returnTypeCap.node.endPosition
          symNode.returnType = content.substring(posToIndex(content, s.row, s.column), posToIndex(content, e.row, e.column))
        }

        // Parameters
        const paramsCap = [...tsQuery.captures(root)].find((c: any) =>
          c.node === node && c.name === 'sym.params'
        )
        if (paramsCap) {
          const s = paramsCap.node.startPosition
          const e = paramsCap.node.endPosition
          const paramText = content.substring(posToIndex(content, s.row, s.column), posToIndex(content, e.row, e.column))
          const paramMatch = paramText.match(/\(([^)]*)\)/)
          if (paramMatch && paramMatch[1].trim()) {
            symNode.parameterCount = paramMatch[1].split(',').filter((p: string) => p.trim()).length
          }
        }

        // Signature
        const sig = getNodeText(node, content).substring(0, 200).replace(/\s+/g, ' ').trim()
        symNode.signature = sig

        nodes.push(symNode)
      })
    } catch {
      // Fallback to manual walk if TSQuery fails
      this.walkFallback(root, content, filePath, lang, nodes, [])
    }
  }

  private extractCallsTSQ(
    root: any,
    content: string,
    filePath: string,
    lang: string,
    query: string,
    _nodes: CodeNode[],
    edges: CodeEdge[],
  ): void {
    try {
      const langObj = this.langCache.get(lang)
      if (!langObj) return

      const tsQuery = (langObj as any).query(query)

      tsQuery.captures(root).forEach((m: any) => {
        if (m.name !== 'call.expression') return

        const node = m.node
        // Find parent declaration to get fromUid
        const parentUid = this.findParentDeclarationUid(root, node, content, filePath, lang)
        if (!parentUid) return

        const fn = this.getCallFunctionName(node, content, lang)
        if (!fn) return

        edges.push({
          id: `${parentUid}->CALLS:${fn}`,
          fromUid: parentUid,
          toUid: `UNKNOWN:Function:${fn}:0`,
          type: 'CALLS',
          confidence: 0.8,
          reason: 'tsq-call',
        })
      })
    } catch { /* skip */ }
  }

  private extractImportsTSQ(
    root: any,
    content: string,
    filePath: string,
    lang: string,
    query: string,
    _nodes: CodeNode[],
    edges: CodeEdge[],
  ): void {
    try {
      const langObj = this.langCache.get(lang)
      if (!langObj) return

      const tsQuery = (langObj as any).query(query)

      tsQuery.captures(root).forEach((m: any) => {
        if (m.name !== 'import.statement' && m.name !== 'require.statement') return

        const node = m.node
        const parentUid = this.findParentDeclarationUid(root, node, content, filePath, lang)
        if (!parentUid) return

        // Extract import source
        const allCaps = [...tsQuery.captures(root)].filter((c: any) =>
          c.node === node && (c.name === 'import.source' || c.name === 'require.source')
        )
        for (const cap of allCaps) {
          const s = cap.node.startPosition
          const e = cap.node.endPosition
          const source = content.substring(posToIndex(content, s.row, s.column), posToIndex(content, e.row, e.column)).replace(/['"`]/g, '')
          if (source) {
            edges.push({
              id: `${parentUid}->IMPORTS:${source}`,
              fromUid: parentUid,
              toUid: `IMPORT:${source}:module`,
              type: 'IMPORTS',
              confidence: 0.95,
              reason: 'tsq-import',
            })
          }
        }
      })
    } catch { /* skip */ }
  }

  private extractHeritageTSQ(
    root: any,
    content: string,
    filePath: string,
    lang: string,
    query: string,
    _nodes: CodeNode[],
    edges: CodeEdge[],
  ): void {
    try {
      const langObj = this.langCache.get(lang)
      if (!langObj) return

      const tsQuery = (langObj as any).query(query)

      tsQuery.captures(root).forEach((m: any) => {
        if (!m.name.startsWith('heritage.')) return

        const declNode = m.node
        const nodeType = inferNodeType(declNode.type, lang)
        if (nodeType !== 'Class' && nodeType !== 'Interface') return

        const declName = this.getNodeName(declNode, content, lang) ?? 'unknown'
        const declUid = `${filePath}:${nodeType}:${declName}:0`

        const allCaps = [...tsQuery.captures(root)].filter((c: any) => c.node === declNode)

        for (const cap of allCaps) {
          if (cap.name === 'heritage.extends') {
            const s = cap.node.startPosition
            const e = cap.node.endPosition
            const targetName = content.substring(posToIndex(content, s.row, s.column), posToIndex(content, e.row, e.column))
            edges.push({
              id: `${declUid}->EXTENDS:${targetName}`,
              fromUid: declUid,
              toUid: `${filePath}:Class:${targetName}:0`,
              type: 'EXTENDS',
              confidence: 1.0,
              reason: 'tsq-extends',
            })
          }
          if (cap.name === 'heritage.implements') {
            const s = cap.node.startPosition
            const e = cap.node.endPosition
            const targetName = content.substring(posToIndex(content, s.row, s.column), posToIndex(content, e.row, e.column))
            edges.push({
              id: `${declUid}->IMPLEMENTS:${targetName}`,
              fromUid: declUid,
              toUid: `${filePath}:Interface:${targetName}:0`,
              type: 'IMPLEMENTS',
              confidence: 1.0,
              reason: 'tsq-implements',
            })
          }
        }
      })
    } catch { /* skip */ }
  }

  // ── Fallback walk (only for unsupported languages or uncovered types) ────

  private walkFallback(
    node: any,
    content: string,
    filePath: string,
    lang: string,
    nodes: CodeNode[],
    edges: CodeEdge[],
    skipTypes?: Set<string>,
  ): void {
    if (skipTypes?.has(node.type)) return

    const mapping = NODE_MAP_FALLBACK[node.type]
    if (mapping) {
      const symbol = this.extractSymbol(node, content, filePath, mapping, lang)
      nodes.push(symbol)
      this.extractEdges(node, symbol.uid, content, filePath, edges)
    }

    for (let i = 0; i < node.childCount; i++) {
      this.walkFallback(node.child(i), content, filePath, lang, nodes, edges, skipTypes)
    }
  }

  private findParentDeclarationUid(root: any, node: any, content: string, filePath: string, lang: string): string | null {
    let cur: any = node.parent
    for (let depth = 0; depth < 8 && cur; cur = cur.parent, depth++) {
      const nodeType = inferNodeType(cur.type, lang)
      if (
        nodeType === 'Function' || nodeType === 'Method' ||
        nodeType === 'Class' || nodeType === 'Module'
      ) {
        const name = this.getNodeName(cur, content, '')
        return name ? `${filePath}:${nodeType}:${name}:${cur.startPosition.row + 1}` : null
      }
    }
    return null
  }

  // ── File-level pattern detection ───────────────────────────────────────

  private detectFilePatterns(
    content: string,
    filePath: string,
    nodes: CodeNode[],
    _edges: CodeEdge[],
  ): void {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const lineNum = i + 1

      for (const pat of ROUTE_PATTERNS) {
        if (pat.test(line)) {
          nodes.push({
            uid: `${filePath}:Route:${lineNum}`,
            type: 'File',
            name: `route_${lineNum}`,
            filePath, line: lineNum, endLine: lineNum, column: 0, language: 'detected',
          })
          break
        }
      }
      for (const pat of TOOL_PATTERNS) {
        if (pat.test(line)) {
          nodes.push({
            uid: `${filePath}:Tool:${lineNum}`,
            type: 'File',
            name: `tool_${lineNum}`,
            filePath, line: lineNum, endLine: lineNum, column: 0, language: 'detected',
          })
          break
        }
      }
    }
  }

  // ── Symbol extraction ──────────────────────────────────────────────────

  private getNodeName(node: any, content: string, _lang: string): string | null {
    switch (node.type) {
      case 'function_declaration':
      case 'function_definition':
      case 'function_item':
      case 'method_declaration':
      case 'method': {
        const n = getChild(node, 'identifier') ?? getChild(node, 'property_identifier')
          ?? node.children?.find((c: any) => c.type === 'identifier')
        return n ? getNodeText(n, content) : null
      }
      case 'class_declaration':
      case 'class_definition':
      case 'struct_declaration':
      case 'struct_item':
      case 'type_declaration': {
        const n = getChild(node, 'type_identifier') ?? getChild(node, 'identifier')
          ?? node.children?.find((c: any) => c.type === 'type_identifier' || c.type === 'identifier')
        return n ? getNodeText(n, content) : null
      }
      case 'interface_declaration':
      case 'protocol_declaration': {
        const n = getChild(node, 'type_identifier') ?? getChild(node, 'identifier')
        return n ? getNodeText(n, content) : null
      }
      case 'enum_declaration':
      case 'enum_class_declaration': {
        const n = getChild(node, 'type_identifier') ?? getChild(node, 'identifier')
        return n ? getNodeText(n, content) : null
      }
      case 'type_alias_declaration':
      case 'type_alias_item': {
        const n = getChild(node, 'type_identifier') ?? getChild(node, 'identifier')
        return n ? getNodeText(n, content) : null
      }
      case 'variable_declarator':
      case 'assignment':
      case 'assignment_expression': {
        const n = getChild(node, 'identifier') ?? getChild(node, 'property_identifier') ?? getChild(node, 'variable_name')
        return n ? getNodeText(n, content) : null
      }
      case 'property_signature':
      case 'property_definition':
      case 'public_field_definition':
      case 'property_declaration':
      case 'field_definition':
      case 'field_declaration':
      case 'constant_declaration':
      case 'instance_variable_declaration': {
        const n = getChild(node, 'property_identifier') ?? getChild(node, 'string')
          ?? getChild(node, 'identifier') ?? getChild(node, 'variable_name')
        if (n) return getNodeText(n, content).replace(/['"`]/g, '')
        return null
      }
      case 'parameter':
      case 'formal_parameter':
      case 'required_parameter':
      case 'optional_parameter': {
        const n = getChild(node, 'identifier') ?? getChild(node, 'variable_name') ?? getChild(node, 'property_identifier')
        return n ? getNodeText(n, content) : null
      }
      case 'class':
      case 'module': {
        const n = getChild(node, 'constant')
        return n ? getNodeText(n, content) : null
      }
      case 'method_declaration': {
        const n = getChild(node, 'name') ?? getChild(node, 'property_identifier') ?? getChild(node, 'identifier')
        return n ? getNodeText(n, content) : null
      }
      case 'decorated_definition': {
        const inner = getChild(node, 'function_definition') ?? getChild(node, 'class_definition')
        return inner ? this.getNodeName(inner, content, _lang) : null
      }
      case 'identifier':
        return getNodeText(node, content)
      default: {
        // Generic identifier search
        const identifiers: any[] = []
        const queue = [node]
        let depth = 0
        while (queue.length > 0 && depth < 5) {
          const cur = queue.shift()!
          if (cur.type === 'identifier' || cur.type === 'property_identifier' || cur.type === 'type_identifier') {
            identifiers.push(cur)
            if (identifiers.length >= 2) break
          }
          for (let i = 0; i < Math.min(cur.childCount, 3); i++) {
            queue.push(cur.child(i))
          }
          depth++
        }
        return identifiers.length > 0 ? getNodeText(identifiers[0], content) : null
      }
    }
  }

  private extractSymbol(
    node: any,
    content: string,
    filePath: string,
    mapping: { nodeType: NodeType },
    lang: string,
  ): CodeNode {
    const start = node.startPosition
    const end = node.endPosition
    const name = this.getNodeName(node, content, lang) ?? 'anonymous'
    const uid = `${filePath}:${mapping.nodeType}:${name}:${start.row + 1}:${start.column}`

    const result: CodeNode = {
      uid, type: mapping.nodeType, name, filePath,
      line: start.row + 1, endLine: end.row + 1,
      column: start.column, language: lang,
    }

    const text = getNodeText(node, content)
    if (result.type === 'Function' || result.type === 'Method') {
      const returnTypeMatch = text.match(/(?:=>|:\s*)([\w[\]<>| ,.$]+)\s*[;({\n=]/)
      if (returnTypeMatch) result.returnType = returnTypeMatch[1].trim()
    }

    const paramMatch = text.match(/\(([^)]*)\)/)
    if (paramMatch && paramMatch[1].trim()) {
      result.parameterCount = paramMatch[1].split(',').filter((p: string) => p.trim()).length
    }

    result.signature = text.substring(0, 200).replace(/\s+/g, ' ').trim()
    return result
  }

  // ── Edge Extraction (from existing code, simplified) ───────────────────

  private extractEdges(node: any, parentUid: string, content: string, filePath: string, edges: CodeEdge[]): void {
    this.extractCallEdges(node, parentUid, content, edges)
    this.extractImportEdges(node, parentUid, content, edges)
    this.extractHeritageEdges(node, parentUid, content, filePath, edges)
    this.extractMemberEdges(node, parentUid, content, filePath, edges)
    this.extractAccessEdges(node, parentUid, content, edges)
    this.extractOverrideEdges(node, parentUid, content, edges)
    this.extractRouteEdges(node, parentUid, content, filePath, edges)
    this.extractToolEdges(node, parentUid, content, filePath, edges)
    this.extractQueryEdges(node, parentUid, content, edges)
    this.extractMemberOfEdges(node, parentUid, content, filePath, edges)
    this.extractProcessEdges(node, parentUid, content, filePath, edges)
  }

  // CALLS
  private extractCallEdges(node: any, parentUid: string, content: string, edges: CodeEdge[]): void {
    const queue: any[] = [node]; let visited = 0
    while (queue.length > 0 && visited++ < 500) {
      const cur = queue.shift()!
      if (cur.type === 'call_expression') {
        const fn = this.getCallFunctionName(cur, content, '')
        if (fn) edges.push({
          id: `${parentUid}->CALLS:${fn}`, fromUid: parentUid,
          toUid: `UNKNOWN:Function:${fn}:0`, type: 'CALLS',
          confidence: 0.8, reason: 'tree-sitter-call',
        })
      }
      for (let i = 0; i < cur.childCount; i++) queue.push(cur.child(i))
    }
  }

  private getCallFunctionName(node: any, content: string, _lang: string): string | null {
    if (node.type === 'identifier') return getNodeText(node, content)
    if (node.type === 'member_expression') {
      const obj = node.children?.find((c: any) =>
        !['.', 'property_identifier', '*', '::'].includes(c.type))
      const prop = node.children?.find((c: any) =>
        ['property_identifier', 'identifier', 'string'].includes(c.type))
      const ot = obj ? getNodeText(obj, content) : ''
      const pt = prop ? getNodeText(prop, content) : ''
      return pt ? (ot ? `${ot}.${pt}` : pt) : null
    }
    if (node.type === 'member_access_expression') {
      const obj = node.children?.find((c: any) =>
        !['object', 'name', '->', 'property'].includes(c.type))
      const prop = node.children?.find((c: any) =>
        ['property_access', 'identifier', 'variable_name'].includes(c.type))
      if (prop) {
        const ot = obj ? getNodeText(obj, content).replace(/^\$/, '') : ''
        const pt = getNodeText(prop, content).replace(/^\$/, '')
        return ot ? `${ot}->${pt}` : pt
      }
    }
    if (node.type === 'scoped_access_expression') {
      const classNode = node.children?.find((c: any) => c.type !== '::' && c.type !== 'name')
      const methodNode = node.children?.find((c: any) => c.type === 'name')
      if (classNode && methodNode) {
        return `${getNodeText(classNode, content)}::${getNodeText(methodNode, content)}`
      }
    }
    if (node.type === 'call') {
      const methodNode = getChild(node, 'method') ?? getChild(node, 'identifier')
      const receiverNode = getChild(node, 'receiver')
      const mt = methodNode ? getNodeText(methodNode, content) : ''
      const rt = receiverNode ? getNodeText(receiverNode, content).replace(/^\$/, '') : ''
      if (mt) return rt ? `${rt}.${mt}` : mt
    }
    const first = node.children?.[0]
    return first ? this.getCallFunctionName(first, content, _lang) : null
  }

  // IMPORTS
  private extractImportEdges(node: any, parentUid: string, content: string, edges: CodeEdge[]): void {
    if (node.type === 'import_statement') {
      const sourceNode = getChild(node, 'string') ?? node.children?.find((c: any) =>
        c.type === 'string' || c.type === 'external_module_reference')
      const source = sourceNode ? getNodeText(sourceNode, content).replace(/['"`]/g, '') : ''
      if (source) edges.push({
        id: `${parentUid}->IMPORTS:${source}`, fromUid: parentUid,
        toUid: `IMPORT:${source}:default`, type: 'IMPORTS',
        confidence: 0.95, reason: 'tree-sitter-import',
      })
    }
    if (node.type === 'call_expression') {
      const fn = this.getCallFunctionName(node, content, '')
      if (fn === 'require' || fn === 'import') {
        const src = node.children?.[1]
        if (src) edges.push({
          id: `${parentUid}->IMPORTS:require`, fromUid: parentUid,
          toUid: `IMPORT:${getNodeText(src, content).replace(/['"`]/g, '')}:file`,
          type: 'IMPORTS', confidence: 0.9, reason: 'tree-sitter-require',
        })
      }
      if (['require', 'require_once', 'include', 'include_once'].includes(fn ?? '')) {
        const src = node.children?.[1]
        if (src) edges.push({
          id: `${parentUid}->IMPORTS:php:${fn}`, fromUid: parentUid,
          toUid: `IMPORT:${getNodeText(src, content).replace(/['"`]/g, '')}:file`,
          type: 'IMPORTS', confidence: 0.95, reason: 'php-require',
        })
      }
    }
    if (node.type === 'import_from_statement' || node.type === 'import_statement') {
      const dottedName = getChild(node, 'dotted_name')
      const source = dottedName ? getNodeText(dottedName, content) : ''
      if (source) edges.push({
        id: `${parentUid}->IMPORTS:py:${source}`, fromUid: parentUid,
        toUid: `IMPORT:${source}:module`, type: 'IMPORTS',
        confidence: 0.95, reason: 'tree-sitter-import-py',
      })
    }
    if (node.type === 'import_declaration') {
      const spec = getChild(node, 'import_specification') ?? node
      const srcNode = getChild(spec, 'string') ?? spec.children?.find((c: any) => c.type === 'string')
      if (srcNode) {
        const source = getNodeText(srcNode, content).replace(/['"`]/g, '')
        edges.push({
          id: `${parentUid}->IMPORTS:go:${source}`, fromUid: parentUid,
          toUid: `IMPORT:${source}:module`, type: 'IMPORTS',
          confidence: 1.0, reason: 'go-import',
        })
      }
    }
    if (node.type === 'use_declaration') {
      const text = getNodeText(node, content).replace(/^use\s+/, '').replace(/;$/, '').trim()
      if (text) {
        const parts = text.split('::')
        const source = parts.slice(0, -1).join('::') || text
        const item = parts[parts.length - 1]
        edges.push({
          id: `${parentUid}->IMPORTS:rust:${text}`, fromUid: parentUid,
          toUid: `IMPORT:${source}:${item === '*' ? 'wildcard' : item}`,
          type: 'IMPORTS', confidence: 0.95, reason: 'rust-use',
        })
      }
    }
    if (node.type === 'import_directive' || node.type === 'import_directive') {
      if (node.language?.name?.includes('dart') || node.language?.name?.includes('kotlin')) {
        const text = getNodeText(node, content).replace(/^import\s+/, '').trim()
        if (text && text !== '_') {
          const parts = text.split('.')
          const source = parts.slice(0, -1).join('.')
          const item = parts[parts.length - 1]
          edges.push({
            id: `${parentUid}->IMPORTS:${text}`, fromUid: parentUid,
            toUid: `IMPORT:${source}:${item}`, type: 'IMPORTS',
            confidence: 1.0, reason: 'dart-import',
          })
        }
      }
    }
    if (node.type === 'using_declaration') {
      const text = getNodeText(node, content).replace(/^using\s+/, '').replace(/;$/, '').trim()
      if (text) {
        const parts = text.split('.')
        const source = parts.slice(0, -1).join('.') || text
        const item = parts[parts.length - 1]
        edges.push({
          id: `${parentUid}->IMPORTS:cs:${text}`, fromUid: parentUid,
          toUid: `IMPORT:${source}:${item}`, type: 'IMPORTS',
          confidence: 1.0, reason: 'csharp-using',
        })
      }
    }
    if (node.type === 'use_declaration' || node.type === 'namespace_use_declaration') {
      const text = getNodeText(node, content).replace(/^use\s+/, '').replace(/^namespace\s+/, '').replace(/;$/, '').replace(/\s+as\s+\w+$/, '').trim()
      if (text) {
        const parts = text.split('\\')
        const source = parts.slice(0, -1).join('\\') || parts[0] || text
        const item = parts[parts.length - 1]
        edges.push({
          id: `${parentUid}->IMPORTS:php-use:${text}`, fromUid: parentUid,
          toUid: `IMPORT:${source}:${item}`, type: 'IMPORTS',
          confidence: 0.95, reason: 'php-use',
        })
      }
    }
  }

  // EXTENDS / IMPLEMENTS
  private extractHeritageEdges(node: any, parentUid: string, content: string, filePath: string, edges: CodeEdge[]): void {
    if ((node.type === 'class_declaration' || node.type === 'class_definition') && node.namedChildren) {
      for (const child of node.namedChildren) {
        if (child.type === 'class_heritage') {
          for (const hc of child.namedChildren) {
            if (hc.type === 'extends_clause') {
              const sc = getChild(hc, 'type_identifier') ?? getChild(hc, 'identifier')
              if (sc) edges.push({
                id: `${parentUid}->EXTENDS:${getNodeText(sc, content)}`, fromUid: parentUid,
                toUid: `${filePath}:Class:${getNodeText(sc, content)}:0`,
                type: 'EXTENDS', confidence: 1.0, reason: 'tree-sitter-extends',
              })
            }
            if (hc.type === 'implements_clause') {
              for (const iface of getNamedChildren(hc, 'type_identifier')) {
                edges.push({
                  id: `${parentUid}->IMPLEMENTS:${getNodeText(iface, content)}`, fromUid: parentUid,
                  toUid: `${filePath}:Interface:${getNodeText(iface, content)}:0`,
                  type: 'IMPLEMENTS', confidence: 1.0, reason: 'tree-sitter-implements',
                })
              }
            }
          }
        }
        if (child.type === 'implements_clause') {
          for (const iface of getNamedChildren(child, 'type_identifier')) {
            edges.push({
              id: `${parentUid}->IMPLEMENTS:${getNodeText(iface, content)}`, fromUid: parentUid,
              toUid: `${filePath}:Interface:${getNodeText(iface, content)}:0`,
              type: 'IMPLEMENTS', confidence: 1.0, reason: 'tree-sitter-implements',
            })
          }
        }
      }
    }
    // Python: class Foo(Bar, Baz)
    if (node.type === 'class_definition') {
      const argList = getChild(node, 'argument_list')
      if (argList) {
        for (const arg of argList.namedChildren) {
          const n = getChild(arg, 'identifier') ?? getChild(arg, 'attribute')
          if (n) edges.push({
            id: `${parentUid}->EXTENDS:${getNodeText(n, content)}`, fromUid: parentUid,
            toUid: `${filePath}:Class:${getNodeText(n, content)}:0`,
            type: 'EXTENDS', confidence: 1.0, reason: 'tree-sitter-py-inherit',
          })
        }
      }
    }
    // Java
    if (node.type === 'class_declaration' && node.language?.name?.includes('java')) {
      for (const child of node.namedChildren) {
        if (child.type === 'superclass') {
          const sc = getChild(child, 'identifier') ?? getChild(child, 'type_identifier')
          if (sc) edges.push({
            id: `${parentUid}->EXTENDS:java:${getNodeText(sc, content)}`, fromUid: parentUid,
            toUid: `${filePath}:Class:${getNodeText(sc, content)}:0`,
            type: 'EXTENDS', confidence: 1.0, reason: 'java-extends',
          })
        }
        if (child.type === 'super_interfaces') {
          for (const iface of getNamedChildren(child, 'identifier')) {
            edges.push({
              id: `${parentUid}->IMPLEMENTS:java:${getNodeText(iface, content)}`, fromUid: parentUid,
              toUid: `${filePath}:Interface:${getNodeText(iface, content)}:0`,
              type: 'IMPLEMENTS', confidence: 1.0, reason: 'java-implements',
            })
          }
        }
      }
    }
    // C#
    if (node.type === 'class_declaration' && node.language?.name?.includes('c_sharp')) {
      for (const child of node.namedChildren) {
        if (child.type === 'base_list') {
          for (const base of child.namedChildren) {
            const t = getChild(base, 'identifier') ?? getChild(base, 'type_identifier')
            if (t) {
              const tname = getNodeText(t, content)
              const edgeType = node.namedChildren.some((c: any) => c.type === 'identifier') ? 'EXTENDS' : 'IMPLEMENTS'
              edges.push({
                id: `${parentUid}->${edgeType}:cs:${tname}`, fromUid: parentUid,
                toUid: `${filePath}:${edgeType === 'EXTENDS' ? 'Class' : 'Interface'}:${tname}:0`,
                type: edgeType as any, confidence: 1.0, reason: 'csharp-inherit',
              })
            }
          }
        }
      }
    }
  }

  // HAS_METHOD / HAS_PROPERTY
  private extractMemberEdges(node: any, parentUid: string, content: string, filePath: string, edges: CodeEdge[]): void {
    const isContainer = [
      'class_declaration', 'interface_declaration', 'class_definition',
      'struct_item', 'impl_item', 'class_body', 'struct_declaration',
    ].includes(node.type)
    if (!isContainer) return

    let containerName = ''
    for (const child of node.namedChildren) {
      if (['identifier', 'type_identifier'].includes(child.type)) {
        containerName = getNodeText(child, content)
        break
      }
    }
    if (!containerName) {
      const constNode = getChild(node, 'constant')
      if (constNode) containerName = getNodeText(constNode, content)
    }
    if (!containerName) return

    const containerUid = `${filePath}:Class:${containerName}:0`
    const bodyNames = ['class_body', 'declaration_list', 'block', 'body', 'member_block', 'members']
    let body: any = null
    for (const name of bodyNames) {
      const found = getChild(node, name)
      if (found) { body = found; break }
    }
    if (!body && node.type === 'class') body = node

    if (body) {
      for (const member of body.namedChildren) {
        const mt = member.type
        if (['method_definition', 'method_signature', 'function_declaration', 'function_item',
             'function_definition', 'method_declaration', 'method', 'singleton_method'].includes(mt)) {
          const mName = this.getMemberName(member, content)
          if (mName) edges.push({
            id: `${containerUid}->HAS_METHOD:${mName}`, fromUid: containerUid,
            toUid: `${filePath}:Method:${mName}:${member.startPosition.row + 1}`,
            type: 'HAS_METHOD', confidence: 1.0, reason: 'tree-sitter-member',
          })
        }
        if (['property_signature', 'public_field_definition', 'property_definition',
             'field_declaration', 'property_declaration', 'constant_declaration',
             'assignment', 'field_definition', 'instance_variable_declaration'].includes(mt)) {
          const pName = this.getMemberName(member, content)
          if (pName) edges.push({
            id: `${containerUid}->HAS_PROPERTY:${pName}`, fromUid: containerUid,
            toUid: `${filePath}:Property:${pName}:${member.startPosition.row + 1}`,
            type: 'HAS_PROPERTY', confidence: 1.0, reason: 'tree-sitter-property',
          })
        }
      }
    }
  }

  private getMemberName(node: any, content: string): string | null {
    if (['method_definition', 'method_signature'].includes(node.type)) {
      return (getChild(node, 'property_identifier') ?? getChild(node, 'identifier'))
        ? getNodeText(getChild(node, 'property_identifier') ?? getChild(node, 'identifier'), content)
        : null
    }
    if (['function_declaration', 'function_definition', 'function_item', 'method_declaration', 'method'].includes(node.type)) {
      return (getChild(node, 'identifier') ?? getChild(node, 'property_identifier'))
        ? getNodeText(getChild(node, 'identifier') ?? getChild(node, 'property_identifier'), content)
        : null
    }
    if (node.type === 'singleton_method') {
      return (getChild(node, 'identifier') ?? getChild(node, 'singleton'))
        ? getNodeText(getChild(node, 'identifier') ?? getChild(node, 'singleton'), content)
        : null
    }
    if (['property_signature', 'public_field_definition', 'property_definition', 'field_declaration',
         'property_declaration', 'constant_declaration', 'field_definition', 'assignment', 'instance_variable_declaration'].includes(node.type)) {
      const n = getChild(node, 'property_identifier') ?? getChild(node, 'string')
        ?? getChild(node, 'identifier') ?? getChild(node, 'variable_name')
      return n ? getNodeText(n, content).replace(/['"`]/g, '') : null
    }
    return null
  }

  // ACCESSES
  private extractAccessEdges(node: any, parentUid: string, content: string, edges: CodeEdge[]): void {
    if (node.type === 'member_expression') {
      const prop = node.children?.find((c: any) => c.type === 'property_identifier' || c.type === 'string')
      if (prop) edges.push({
        id: `${parentUid}->ACCESSES:${getNodeText(prop, content).replace(/['"`]/g, '')}`,
        fromUid: parentUid, toUid: `UNKNOWN:Property:${getNodeText(prop, content).replace(/['"`]/g, '')}:0`,
        type: 'ACCESSES', confidence: 0.6, reason: 'tree-sitter-access',
      })
    }
  }

  // OVERRIDES
  private extractOverrideEdges(node: any, parentUid: string, content: string, edges: CodeEdge[]): void {
    if (['method_definition', 'function_declaration', 'function_definition'].includes(node.type)) {
      const text = getNodeText(node, content)
      if (text.includes('override')) {
        const name = this.getMemberName(node, content)
        if (name) edges.push({
          id: `${parentUid}->OVERRIDES:${name}`, fromUid: parentUid,
          toUid: `UNKNOWN:Method:${name}:0`, type: 'OVERRIDES',
          confidence: 1.0, reason: 'override-keyword',
        })
      }
    }
    if (node.type === 'function_definition') {
      const nameNode = getChild(node, 'identifier')
      if (nameNode) {
        const name = getNodeText(nameNode, content)
        const OVERRIDE_METHODS = new Set(['__init__','__str__','__repr__','__eq__','__hash__',
          '__enter__','__exit__','__call__','__len__','__iter__','__next__',
          '__getitem__','__setitem__','__delitem__','__contains__'])
        if (OVERRIDE_METHODS.has(name)) edges.push({
          id: `${parentUid}->OVERRIDES:py:${name}`, fromUid: parentUid,
          toUid: `UNKNOWN:Method:${name}:0`, type: 'OVERRIDES',
          confidence: 0.8, reason: 'python-dunder-method',
        })
      }
    }
  }

  // HANDLES_ROUTE
  private extractRouteEdges(node: any, parentUid: string, content: string, filePath: string, edges: CodeEdge[]): void {
    if (node.type === 'call_expression') {
      const text = getNodeText(node, content)
      const fn = this.getCallFunctionName(node, content, '')
      if (fn && /^(app|router|express|route|use)\./.test(fn)) {
        if (/^\s*(get|post|put|patch|delete|head|options|all)\s*\(/.test(text)) {
          const args = node.children?.filter((c: any) => c.type === 'arguments')
          if (args.length > 0) {
            const argList = args[0]
            for (const arg of argList.namedChildren) {
              if (['identifier', 'arrow_function', 'function_expression'].includes(arg.type)) {
                const handlerName = arg.type === 'identifier' ? getNodeText(arg, content) : `anonymous_handler_${arg.startPosition.row + 1}`
                const routeNode = argList.namedChildren[0]
                const routePath = routeNode ? getNodeText(routeNode, content) : '/'
                const routeUid = `${filePath}:Route:${routePath.replace(/['"`/]/g, '_')}:${arg.startPosition.row + 1}`
                edges.push({
                  id: `${routeUid}->HANDLES_ROUTE:${handlerName}`, fromUid: routeUid,
                  toUid: parentUid, type: 'HANDLES_ROUTE',
                  confidence: 0.95, reason: 'http-handler',
                })
              }
            }
          }
        }
      }
      if (fn === undefined && text.includes('@')) {
        const decoMatch = text.match(/@\w+\s*\(\s*['"`]([^'"`]*)/)
        if (decoMatch) {
          const routePath = decoMatch[1]
          const routeUid = `${filePath}:Route:${routePath.replace(/['"`/]/g, '_')}:${node.startPosition.row + 1}`
          const parent = node.parent
          if (parent?.type === 'decorator') {
            const grandParent = parent.parent
            if (grandParent?.type === 'method_definition' || grandParent?.type === 'function_declaration') {
              const handlerName = this.getMemberName(grandParent, content) ?? 'anonymous'
              edges.push({
                id: `${routeUid}->HANDLES_ROUTE:deco:${handlerName}`, fromUid: routeUid,
                toUid: parentUid, type: 'HANDLES_ROUTE',
                confidence: 0.95, reason: 'decorator-route',
              })
            }
          }
        }
      }
    }
    if (node.type === 'export_statement') {
      const text = getNodeText(node, content)
      if (/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/.test(text)) {
        const fnMatch = text.match(/function\s+(\w+)\s*\(/)
        if (fnMatch) {
          const routeUid = `${filePath}:Route:${fnMatch[1]}:${node.startPosition.row + 1}`
          edges.push({
            id: `${routeUid}->HANDLES_ROUTE:next:${fnMatch[1]}`, fromUid: routeUid,
            toUid: parentUid, type: 'HANDLES_ROUTE',
            confidence: 1.0, reason: 'next-app-router',
          })
        }
      }
    }
  }

  // HANDLES_TOOL
  private extractToolEdges(node: any, parentUid: string, content: string, filePath: string, edges: CodeEdge[]): void {
    if (node.type === 'call_expression') {
      const text = getNodeText(node, content)
      if (text.includes('@')) {
        const decoMatch = text.match(/@\w+\s*\(\s*['"`]([^'"`]*)/)
        if (decoMatch) {
          const toolUid = `${filePath}:Tool:${decoMatch[1]}:${node.startPosition.row + 1}`
          edges.push({
            id: `${toolUid}->HANDLES_TOOL:${decoMatch[1]}`, fromUid: toolUid,
            toUid: parentUid, type: 'HANDLES_TOOL',
            confidence: 0.95, reason: 'tool-decorator',
          })
        }
      }
    }
    if (node.type === 'pair') {
      const keyNode = getChild(node, 'property_identifier') ?? getChild(node, 'string')
      const valNode = getChild(node, 'string') ?? getChild(node, 'identifier')
      if (keyNode && valNode) {
        const key = getNodeText(keyNode, content)
        const val = getNodeText(valNode, content).replace(/['"`]/g, '')
        if (['tool', 'command', 'name'].includes(key)) {
          const toolUid = `${filePath}:Tool:${val}:${node.startPosition.row + 1}`
          edges.push({
            id: `${toolUid}->HANDLES_TOOL:object:${val}`, fromUid: toolUid,
            toUid: parentUid, type: 'HANDLES_TOOL',
            confidence: 0.8, reason: 'tool-object',
          })
        }
      }
    }
  }

  // QUERIES
  private extractQueryEdges(node: any, parentUid: string, content: string, edges: CodeEdge[]): void {
    if (node.type !== 'call_expression') return
    const text = getNodeText(node, content)
    for (const pat of QUERY_PATTERNS) {
      if (pat.test(text)) {
        const fn = this.getCallFunctionName(node, content, '')
        if (fn) edges.push({
          id: `${parentUid}->QUERIES:${fn}`, fromUid: parentUid,
          toUid: `QUERY:${fn}`, type: 'QUERIES',
          confidence: 0.7, reason: 'query-pattern',
        })
        break
      }
    }
  }

  // MEMBER_OF
  private extractMemberOfEdges(node: any, parentUid: string, content: string, filePath: string, edges: CodeEdge[]): void {
    const memberTypes = new Set(['method_definition', 'function_definition', 'arrow_function',
      'property_declaration', 'variable_declarator', 'assignment_expression', 'method_declaration',
      'class_static_block_declaration', 'public_field_definition', 'private_field_definition',
      'function_declaration', 'generator_function_declaration'])
    if (!memberTypes.has(node.type)) return

    const containerTypes = new Set(['class_declaration', 'class_body', 'interface_declaration',
      'class_definition', 'struct_item', 'impl_item', 'enum_declaration', 'object_literal', 'object_pattern'])

    let container: any = null
    let cur: any = node.parent
    for (let depth = 0; depth < 10 && cur; cur = cur.parent, depth++) {
      if (containerTypes.has(cur.type)) { container = cur; break }
    }
    if (!container) return

    let containerName: string
    const cnNode = getChild(container, 'type_identifier') ?? getChild(container, 'identifier')
      ?? container.children?.find((c: any) => c.type === 'type_identifier' || c.type === 'identifier')
    if (cnNode) {
      containerName = getNodeText(cnNode, content)
    } else {
      const text = getNodeText(container, content)
      containerName = text.match(/class\s+(\w+)/)?.[1]
        ?? text.match(/interface\s+(\w+)/)?.[1]
        ?? text.match(/struct\s+(\w+)/)?.[1]
        ?? `Class@${filePath}`
    }

    const memberNameNode = getChild(node, 'identifier') ?? getChild(node, 'property_identifier')
      ?? node.children?.find((c: any) => ['identifier', 'property_identifier'].includes(c.type))
    if (!memberNameNode) return
    const memberName = getNodeText(memberNameNode, content)
    if (memberName === 'anonymous') return

    const edgeId = `${parentUid}->MEMBER_OF:${containerName}:${memberName}`
    if (!edges.some((e) => e.id === edgeId)) {
      edges.push({ id: edgeId, fromUid: parentUid, toUid: `MEMBER_OF:${containerName}`,
        type: 'MEMBER_OF', confidence: 0.95, reason: `member-of-${container.type}` })
    }
  }

  // STEP_IN_PROCESS
  private extractProcessEdges(node: any, parentUid: string, content: string, filePath: string, edges: CodeEdge[]): void {
    const entryTypes = new Set(['call_expression', 'function_declaration', 'method_definition',
      'arrow_function', 'generator_function_declaration'])
    if (!entryTypes.has(node.type)) return

    const text = getNodeText(node, content)
    for (const pat of ROUTE_PATTERNS) {
      if (pat.test(text)) {
        this.addProcessEdge(parentUid, `Route:${filePath}`, edges)
        this.addProcessEdge(parentUid, 'ENTRY_ROUTE', edges)
        return
      }
    }
    for (const pat of TOOL_PATTERNS) {
      if (pat.test(text)) {
        this.addProcessEdge(parentUid, `Tool:${filePath}`, edges)
        this.addProcessEdge(parentUid, 'ENTRY_TOOL', edges)
        return
      }
    }
    const MAIN_PATTERNS = [
      /^(async\s+)?function\s+main\b/i, /^(async\s+)?const\s+main\s*=/i,
      /^(async\s+)?let\s+main\s*=/i, /^main\s*\(/i, /\bstart\s*\(/i,
      /\brun\s*\(/i, /\bserve\s*\(/i, /\binit\s*\(/i,
      /\bbootstrap\s*\(/i, /\bcreateServer\s*\(/i, /\bapp\.listen\s*\(/i,
      /\bcreateApp\s*\(/i, /@Command\s*\(/i, /@Cli\s*\(/i,
      /\bprogram\.command\s*\(/i, /yargs\s*\(/i,
    ]
    for (const pat of MAIN_PATTERNS) {
      if (pat.test(text)) {
        this.addProcessEdge(parentUid, `Main:${filePath}`, edges)
        this.addProcessEdge(parentUid, 'ENTRY_MAIN', edges)
        return
      }
    }
  }

  private addProcessEdge(fromUid: string, toUid: string, edges: CodeEdge[]): void {
    const edgeId = `${fromUid}->STEP_IN_PROCESS:${toUid}`
    if (!edges.some((e) => e.id === edgeId)) {
      edges.push({ id: edgeId, fromUid, toUid, type: 'STEP_IN_PROCESS',
        confidence: 0.85, reason: 'process-step' })
    }
  }

  close(): void {
    // Cleanup: terminate dedicated parsers
    for (const p of this.parserCache.values()) {
      // Parser has no close() method, just let GC handle it
    }
    this.parserCache.clear()
    this.langCache.clear()
    this.queriesCache.clear()
  }
}

// ─── Fallback Node Map (for unsupported languages) ────────────────────────────

const NODE_MAP_FALLBACK: Record<string, { nodeType: NodeType }> = {
  function_declaration: { nodeType: 'Function' },
  function_definition: { nodeType: 'Function' },
  method_definition: { nodeType: 'Method' },
  method_declaration: { nodeType: 'Method' },
  class_declaration: { nodeType: 'Class' },
  class_definition: { nodeType: 'Class' },
  interface_declaration: { nodeType: 'Interface' },
  enum_declaration: { nodeType: 'Enum' },
  type_alias_declaration: { nodeType: 'TypeAlias' },
  arrow_function: { nodeType: 'Function' },
  function_expression: { nodeType: 'Function' },
  variable_declarator: { nodeType: 'Variable' },
  property_signature: { nodeType: 'Property' },
  method_signature: { nodeType: 'Method' },
  public_field_definition: { nodeType: 'Property' },
  required_parameter: { nodeType: 'Variable' },
  optional_parameter: { nodeType: 'Variable' },
  struct_item: { nodeType: 'Class' },
  struct_declaration: { nodeType: 'Class' },
  impl_item: { nodeType: 'Impl' },
  trait_item: { nodeType: 'Interface' },
  type_alias_item: { nodeType: 'TypeAlias' },
}
