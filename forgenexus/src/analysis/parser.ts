/**
 * ForgeNexus Parser Engine — extracts code symbols and all relationship edges.
 * Supports: TypeScript, JavaScript, Python, Go, Rust, Java, C#, C/C++, Kotlin, PHP, Ruby, Swift, Dart.
 *
 * Edge types extracted:
 *   CALLS          — function/method invocations
 *   IMPORTS        — import/require statements
 *   EXTENDS        — class inheritance
 *   IMPLEMENTS     — interface implementation
 *   OVERRIDES      — method overrides
 *   HAS_METHOD     — methods defined in a class/interface
 *   HAS_PROPERTY   — properties/fields defined in a class/interface
 *   ACCESSES       — property access (read/write)
 *   HANDLES_ROUTE  — HTTP route handlers (Express, FastAPI, NestJS, Django, Rails, Next.js)
 *   HANDLES_TOOL   — MCP/RPC tool handlers
 *   QUERIES        — database queries
 */

import { createRequire } from 'module'
import Parser from 'tree-sitter'
import type { CodeNode, CodeEdge, NodeType, EdgeType } from '../types.js'

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
      } catch {
        return null
      }
    }
    case 'javascript': {
      try {
        const mod = (await import('tree-sitter-javascript')) as any
        const resolved = mod.default ?? mod
        return resolved.language ?? resolved ?? null
      } catch {
        return null
      }
    }
    case 'python': {
      try {
        const mod = (await import('tree-sitter-python')) as any
        const resolved = mod.default ?? mod
        return resolved.language ?? resolved ?? null
      } catch {
        return null
      }
    }
    case 'go': {
      try {
        return (_require('tree-sitter-go') as any).default ?? null
      } catch {
        return null
      }
    }
    case 'rust': {
      try {
        return (_require('tree-sitter-rust') as any).default ?? null
      } catch {
        return null
      }
    }
    case 'java': {
      try {
        return (_require('tree-sitter-java') as any).default ?? null
      } catch {
        return null
      }
    }
    case 'csharp': {
      try {
        return (_require('tree-sitter-c-sharp') as any).default ?? null
      } catch {
        return null
      }
    }
    case 'cpp': {
      try {
        return (_require('tree-sitter-cpp') as any).default ?? null
      } catch {
        return null
      }
    }
    case 'c': {
      try {
        return (_require('tree-sitter-c') as any).default ?? null
      } catch {
        return null
      }
    }
    case 'kotlin': {
      try {
        return (_require('tree-sitter-kotlin') as any).default ?? null
      } catch {
        return null
      }
    }
    case 'php': {
      try {
        return (_require('tree-sitter-php') as any).default ?? null
      } catch {
        return null
      }
    }
    case 'ruby': {
      try {
        return (_require('tree-sitter-ruby') as any).default ?? null
      } catch {
        return null
      }
    }
    case 'swift': {
      try {
        return (_require('tree-sitter-swift') as any).default ?? null
      } catch {
        return null
      }
    }
    case 'dart': {
      try {
        return (_require('tree-sitter-dart') as any).default ?? null
      } catch {
        return null
      }
    }
    default:
      return null
  }
}

// ─── AST Helpers ──────────────────────────────────────────────────────────────

function posToIndex(content: string, row: number, col: number): number {
  let line = 0,
    index = 0
  for (; line < row && index < content.length; index++) {
    if (content[index] === '\n') line++
  }
  return index + col
}

function getNodeText(node: any, content: string): string {
  const start = node.startPosition
  const end = node.endPosition
  const startIdx = posToIndex(content, start.row, start.column)
  const endIdx = posToIndex(content, end.row, end.column)
  return content.substring(startIdx, endIdx)
}

function getChild(node: any, type: string): any {
  for (let i = 0; i < node.namedChildCount; i++) {
    if (node.namedChild(i).type === type) return node.namedChild(i)
  }
  return null
}

function getNamedChildren(node: any, type: string): any[] {
  const result: any[] = []
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i)
    if (child.type === type) result.push(child)
  }
  return result
}

// ─── Type Mapping ─────────────────────────────────────────────────────────────

interface NodeMapping {
  astNode: string
  nodeType: NodeType
  nameExtractor?: (node: any, content: string) => string | null
}

const NODE_MAP_TS: Record<string, NodeMapping> = {
  import_statement: { astNode: 'import_statement', nodeType: 'Module' },
  function_declaration: { astNode: 'function_declaration', nodeType: 'Function' },
  method_definition: { astNode: 'method_definition', nodeType: 'Method' },
  class_declaration: { astNode: 'class_declaration', nodeType: 'Class' },
  interface_declaration: { astNode: 'interface_declaration', nodeType: 'Interface' },
  enum_declaration: { astNode: 'enum_declaration', nodeType: 'Enum' },
  type_alias_declaration: { astNode: 'type_alias_declaration', nodeType: 'TypeAlias' },
  arrow_function: { astNode: 'arrow_function', nodeType: 'Function' },
  function_expression: { astNode: 'function_expression', nodeType: 'Function' },
  variable_declarator: { astNode: 'variable_declarator', nodeType: 'Variable' },
  property_signature: { astNode: 'property_signature', nodeType: 'Property' },
  method_signature: { astNode: 'method_signature', nodeType: 'Method' },
  public_field_definition: { astNode: 'public_field_definition', nodeType: 'Property' },
  required_parameter: { astNode: 'required_parameter', nodeType: 'Variable' },
  optional_parameter: { astNode: 'optional_parameter', nodeType: 'Variable' },
}

const NODE_MAP_PY: Record<string, NodeMapping> = {
  function_definition: { astNode: 'function_definition', nodeType: 'Function' },
  class_definition: { astNode: 'class_definition', nodeType: 'Class' },
  decorated_definition: { astNode: 'decorated_definition', nodeType: 'Function' },
  assignment: { astNode: 'assignment', nodeType: 'Variable' },
  parameter: { astNode: 'parameter', nodeType: 'Variable' },
  list_splat_pattern: { astNode: 'list_splat_pattern', nodeType: 'Variable' },
  dictionary_splat_pattern: { astNode: 'dictionary_splat_pattern', nodeType: 'Variable' },
  identifier: { astNode: 'identifier', nodeType: 'Variable' },
}

const NODE_MAP_GO: Record<string, NodeMapping> = {
  function_declaration: { astNode: 'function_declaration', nodeType: 'Function' },
  method_declaration: { astNode: 'method_declaration', nodeType: 'Method' },
  type_declaration: { astNode: 'type_declaration', nodeType: 'Class' },
  const_declaration: { astNode: 'const_declaration', nodeType: 'Variable' },
  variable_declaration: { astNode: 'variable_declaration', nodeType: 'Variable' },
  field_declaration: { astNode: 'field_declaration', nodeType: 'Property' },
}

const NODE_MAP_RUST: Record<string, NodeMapping> = {
  function_item: { astNode: 'function_item', nodeType: 'Function' },
  impl_item: { astNode: 'impl_item', nodeType: 'Impl' },
  struct_item: { astNode: 'struct_item', nodeType: 'Class' },
  enum_item: { astNode: 'enum_item', nodeType: 'Enum' },
  trait_item: { astNode: 'trait_item', nodeType: 'Interface' },
  type_alias_item: { astNode: 'type_alias_item', nodeType: 'TypeAlias' },
}

const NODE_MAP_JAVA: Record<string, NodeMapping> = {
  method_declaration: { astNode: 'method_declaration', nodeType: 'Method' },
  class_declaration: { astNode: 'class_declaration', nodeType: 'Class' },
  interface_declaration: { astNode: 'interface_declaration', nodeType: 'Interface' },
  enum_declaration: { astNode: 'enum_declaration', nodeType: 'Enum' },
  variable_declarator: { astNode: 'variable_declarator', nodeType: 'Variable' },
  formal_parameter: { astNode: 'formal_parameter', nodeType: 'Variable' },
  field_declaration: { astNode: 'field_declaration', nodeType: 'Property' },
}

const NODE_MAP_CS: Record<string, NodeMapping> = {
  method_declaration: { astNode: 'method_declaration', nodeType: 'Method' },
  class_declaration: { astNode: 'class_declaration', nodeType: 'Class' },
  interface_declaration: { astNode: 'interface_declaration', nodeType: 'Interface' },
  enum_declaration: { astNode: 'enum_declaration', nodeType: 'Enum' },
  variable_declarator: { astNode: 'variable_declarator', nodeType: 'Variable' },
  property_declaration: { astNode: 'property_declaration', nodeType: 'Property' },
  delegate_declaration: { astNode: 'delegate_declaration', nodeType: 'Function' },
}

const NODE_MAP_CPP: Record<string, NodeMapping> = {
  function_definition: { astNode: 'function_definition', nodeType: 'Function' },
  class_declaration: { astNode: 'class_declaration', nodeType: 'Class' },
  struct_declaration: { astNode: 'struct_declaration', nodeType: 'Class' },
  enum_declaration: { astNode: 'enum_declaration', nodeType: 'Enum' },
  variable_declaration: { astNode: 'variable_declaration', nodeType: 'Variable' },
  field_declaration: { astNode: 'field_declaration', nodeType: 'Property' },
}

const NODE_MAP_C: Record<string, NodeMapping> = {
  function_definition: { astNode: 'function_definition', nodeType: 'Function' },
  struct_declaration: { astNode: 'struct_declaration', nodeType: 'Class' },
  enum_declaration: { astNode: 'enum_declaration', nodeType: 'Enum' },
  variable_declaration: { astNode: 'variable_declaration', nodeType: 'Variable' },
  type_alias_declaration: { astNode: 'type_alias_declaration', nodeType: 'TypeAlias' },
}

const NODE_MAP_KOTLIN: Record<string, NodeMapping> = {
  function_declaration: { astNode: 'function_declaration', nodeType: 'Function' },
  class_declaration: { astNode: 'class_declaration', nodeType: 'Class' },
  interface_declaration: { astNode: 'interface_declaration', nodeType: 'Interface' },
  object_declaration: { astNode: 'object_declaration', nodeType: 'Class' },
  enum_class_declaration: { astNode: 'enum_class_declaration', nodeType: 'Enum' },
  property_declaration: { astNode: 'property_declaration', nodeType: 'Property' },
  companion_object: { astNode: 'companion_object', nodeType: 'Class' },
}

const NODE_MAP_PHP: Record<string, NodeMapping> = {
  function_definition: { astNode: 'function_definition', nodeType: 'Function' },
  method_declaration: { astNode: 'method_declaration', nodeType: 'Method' },
  class_declaration: { astNode: 'class_declaration', nodeType: 'Class' },
  interface_declaration: { astNode: 'interface_declaration', nodeType: 'Interface' },
  trait_declaration: { astNode: 'trait_declaration', nodeType: 'Interface' },
  enum_declaration: { astNode: 'enum_declaration', nodeType: 'Enum' },
  property_declaration: { astNode: 'property_declaration', nodeType: 'Property' },
}

const NODE_MAP_RUBY: Record<string, NodeMapping> = {
  method: { astNode: 'method', nodeType: 'Method' },
  class: { astNode: 'class', nodeType: 'Class' },
  module: { astNode: 'module', nodeType: 'Module' },
  singleton_method: { astNode: 'singleton_method', nodeType: 'Method' },
  assignment: { astNode: 'assignment', nodeType: 'Variable' },
  constant: { astNode: 'constant', nodeType: 'Variable' },
}

const NODE_MAP_SWIFT: Record<string, NodeMapping> = {
  function_declaration: { astNode: 'function_declaration', nodeType: 'Function' },
  class_declaration: { astNode: 'class_declaration', nodeType: 'Class' },
  struct_declaration: { astNode: 'struct_declaration', nodeType: 'Class' },
  protocol_declaration: { astNode: 'protocol_declaration', nodeType: 'Interface' },
  enum_declaration: { astNode: 'enum_declaration', nodeType: 'Enum' },
  property_declaration: { astNode: 'property_declaration', nodeType: 'Property' },
  constant_declaration: { astNode: 'constant_declaration', nodeType: 'Variable' },
}

const NODE_MAP_DART: Record<string, NodeMapping> = {
  function_declaration: { astNode: 'function_declaration', nodeType: 'Function' },
  method_declaration: { astNode: 'method_declaration', nodeType: 'Method' },
  class_declaration: { astNode: 'class_declaration', nodeType: 'Class' },
  mixin_declaration: { astNode: 'mixin_declaration', nodeType: 'Interface' },
  interface_class: { astNode: 'interface_class', nodeType: 'Interface' },
  enum_declaration: { astNode: 'enum_declaration', nodeType: 'Enum' },
  variable_declaration: { astNode: 'variable_declaration', nodeType: 'Variable' },
  field_definition: { astNode: 'field_definition', nodeType: 'Property' },
}

function getNodeMap(lang: string): Record<string, NodeMapping> {
  switch (lang) {
    case 'typescript':
    case 'tsx':
    case 'javascript':
      return NODE_MAP_TS
    case 'python':
      return NODE_MAP_PY
    case 'go':
      return NODE_MAP_GO
    case 'rust':
      return NODE_MAP_RUST
    case 'java':
      return NODE_MAP_JAVA
    case 'csharp':
      return NODE_MAP_CS
    case 'cpp':
      return NODE_MAP_CPP
    case 'c':
      return NODE_MAP_C
    case 'kotlin':
      return NODE_MAP_KOTLIN
    case 'php':
      return NODE_MAP_PHP
    case 'ruby':
      return NODE_MAP_RUBY
    case 'swift':
      return NODE_MAP_SWIFT
    case 'dart':
      return NODE_MAP_DART
    default:
      return NODE_MAP_TS
  }
}

// ─── Language Extension Map ───────────────────────────────────────────────────

const LANG_EXT: Record<string, string> = {
  // TypeScript / JavaScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  // Python
  '.py': 'python',
  // Go / Rust / Java / C#
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cs': 'csharp',
  // C / C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.hh': 'cpp',
  // Other
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.php': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.dart': 'dart',
}

// ─── Route/Handler Detection Patterns ───────────────────────────────────────

const ROUTE_PATTERNS = [
  // Express / Fastify / Hono
  /^(get|post|put|patch|delete|head|options|all)\s*\(/i,
  /^(app|router|express|fastify)\s*\.\s*(get|post|put|patch|delete|all)/i,
  /^(use|route)\s*\(\s*['"`]\//,
  /^(use|route|app)\s*\(\s*['"`]/,
  // NestJS decorators
  /@\s*(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(/i,
  /@\s*Controller\s*\(/,
  /@\s*Route\s*\(/,
  // FastAPI / Starlette
  /@\s*(app|router)\.(get|post|put|patch|delete)\s*\(/i,
  // Django / Flask
  /@(app|router)\.route\s*\(/,
  /@(app|bp)\.get\s*\(/,
  /@(app|bp)\.post\s*\(/,
  // Ruby on Rails
  /(get|post|put|patch|delete)\s+['"`]([^'"`]+)['"`]/,
  /resources\s+:?\w+/,
  /resources\s*\(.*\)/,
  // Spring / Spring Boot
  /@(Get|Post|Put|Delete|Patch)Mapping\s*\(/i,
  /@(RequestMapping|RestController|Controller)\s*\(/,
  // Gin / Fiber (Go)
  /\.(GET|POST|PUT|PATCH|DELETE|HEAD)\s*\(/,
  // Laravel (PHP)
  /Route::(get|post|put|patch|delete|any|match|options)\s*\(/i,
  // Phoenix (Elixir/Ruby-like)
  /plug\s+['"`]([^\s'"`]+)['"`]/,
  // Swift (Vapor)
  /@(get|post|put|patch|delete)\s*\(/i,
  // Dart (Aqueduct / Shelf)
  /@(Operation|GET|POST|PUT|DELETE)\s*\(/i,
]

const TOOL_PATTERNS = [
  /@\s*(tool|command|handler|event|method|action)\s*\(/i,
  /['"`]?(tool|command|handler)['"`]?\s*:/,
  /^\s*(tool|command|handler)\s*:/,
]

const QUERY_PATTERNS = [
  /\.query\s*\(/,
  /\.execute\s*\(/,
  /\.run\s*\(/,
  /\.all\s*\(/,
  /\.get\s*\(/,
  /\.find\s*\(/,
  /\.create\s*\(/,
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
  /\.save\s*\(/,
  /\.findOne\s*\(/,
  /\.findById\s*\(/,
  /\.select\s*\(/,
  /\.where\s*\(/,
  /\.from\s*\(/,
  /\.join\s*\(/,
]

// ─── Main Parser Class ─────────────────────────────────────────────────────────

export class ParserEngine {
  private langCache = new Map<string, any>()
  private parser = new Parser()

  async parseFile(
    filePath: string,
    content: string,
    language?: string,
  ): Promise<{ nodes: CodeNode[]; edges: CodeEdge[] }> {
    const ext = '.' + (filePath.split('.').pop() ?? '').toLowerCase()
    const lang = language ?? LANG_EXT[ext] ?? 'javascript'

    if (!this.langCache.has(lang)) {
      this.langCache.set(lang, await loadLanguage(lang))
    }
    const langObj = this.langCache.get(lang)
    if (langObj) {
      this.parser.setLanguage(langObj)
    }

    const nodes: CodeNode[] = []
    const edges: CodeEdge[] = []
    const nodeMap = getNodeMap(lang)

    // Detect file-level patterns
    this.detectFilePatterns(content, filePath, nodes, edges)

    try {
      const tree = this.parser.parse(content)
      this.walk(tree.rootNode, content, filePath, lang, nodes, edges, nodeMap)
    } catch {
      // skip
    }

    return { nodes, edges }
  }

  private detectFilePatterns(
    content: string,
    filePath: string,
    nodes: CodeNode[],
    _edges: CodeEdge[],
  ): void {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineNum = i + 1

      for (const pat of ROUTE_PATTERNS) {
        if (pat.test(line.trim())) {
          const uid = `${filePath}:Route:${lineNum}`
          nodes.push({
            uid,
            type: 'File',
            name: `route_${lineNum}`,
            filePath,
            line: lineNum,
            endLine: lineNum,
            column: 0,
            language: 'detected',
          })
          break
        }
      }

      for (const pat of TOOL_PATTERNS) {
        if (pat.test(line.trim())) {
          const uid = `${filePath}:Tool:${lineNum}`
          nodes.push({
            uid,
            type: 'File',
            name: `tool_${lineNum}`,
            filePath,
            line: lineNum,
            endLine: lineNum,
            column: 0,
            language: 'detected',
          })
          break
        }
      }
    }
  }

  private walk(
    node: any,
    content: string,
    filePath: string,
    lang: string,
    nodes: CodeNode[],
    edges: CodeEdge[],
    nodeMap: Record<string, NodeMapping>,
  ): void {
    const mapping = nodeMap[node.type]
    if (mapping) {
      const symbol = this.extractSymbol(node, content, filePath, mapping, lang)
      nodes.push(symbol)
      this.extractEdges(node, symbol.uid, content, filePath, edges)
    }

    for (let i = 0; i < node.childCount; i++) {
      this.walk(node.child(i), content, filePath, lang, nodes, edges, nodeMap)
    }
  }

  private extractSymbol(
    node: any,
    content: string,
    filePath: string,
    mapping: NodeMapping,
    lang: string,
  ): CodeNode {
    const start = node.startPosition
    const end = node.endPosition
    const name = this.getDeclarationName(node, content, mapping)
    const uid = `${filePath}:${mapping.nodeType}:${name}:${start.row + 1}`

    const result: CodeNode = {
      uid,
      type: mapping.nodeType,
      name,
      filePath,
      line: start.row + 1,
      endLine: end.row + 1,
      column: start.column,
      language: lang,
    }

    // Extract additional metadata
    this.extractSymbolMeta(node, content, result)

    return result
  }

  private getDeclarationName(node: any, content: string, mapping: NodeMapping): string {
    if (mapping.nameExtractor) {
      const name = mapping.nameExtractor(node, content)
      if (name) return name
    }

    // Generic identifier search
    const identifiers = this.findIdentifiers(node, content)
    if (identifiers.length > 0) return identifiers[0]

    // Language-specific fallbacks
    if (
      node.type === 'function_declaration' ||
      node.type === 'function_definition' ||
      node.type === 'function_item' ||
      node.type === 'method_declaration' ||
      node.type === 'method_definition'
    ) {
      const nameNode =
        getChild(node, 'identifier') ??
        getChild(node, 'property_identifier') ??
        node.children?.find((c: any) => c.type === 'identifier')
      if (nameNode) return getNodeText(nameNode, content)
    }
    if (
      node.type === 'class_declaration' ||
      node.type === 'class_definition' ||
      node.type === 'struct_declaration' ||
      node.type === 'struct_item' ||
      node.type === 'type_declaration'
    ) {
      const nameNode =
        getChild(node, 'type_identifier') ??
        getChild(node, 'identifier') ??
        node.children?.find((c: any) => c.type === 'type_identifier' || c.type === 'identifier')
      if (nameNode) return getNodeText(nameNode, content)
    }
    if (node.type === 'interface_declaration' || node.type === 'protocol_declaration') {
      const nameNode = getChild(node, 'type_identifier') ?? getChild(node, 'identifier')
      if (nameNode) return getNodeText(nameNode, content)
    }
    if (node.type === 'enum_declaration' || node.type === 'enum_class_declaration') {
      const nameNode = getChild(node, 'type_identifier') ?? getChild(node, 'identifier')
      if (nameNode) return getNodeText(nameNode, content)
    }
    if (node.type === 'type_alias_declaration' || node.type === 'type_alias_item') {
      const nameNode = getChild(node, 'type_identifier') ?? getChild(node, 'identifier')
      if (nameNode) return getNodeText(nameNode, content)
    }
    if (
      node.type === 'variable_declarator' ||
      node.type === 'assignment' ||
      node.type === 'assignment_expression'
    ) {
      const nameNode =
        getChild(node, 'identifier') ??
        getChild(node, 'property_identifier') ??
        getChild(node, 'variable_name')
      if (nameNode) return getNodeText(nameNode, content)
    }
    if (
      node.type === 'property_signature' ||
      node.type === 'property_definition' ||
      node.type === 'public_field_definition' ||
      node.type === 'property_declaration' ||
      node.type === 'field_definition' ||
      node.type === 'field_declaration' ||
      node.type === 'constant_declaration' ||
      node.type === 'instance_variable_declaration'
    ) {
      const nameNode =
        getChild(node, 'property_identifier') ??
        getChild(node, 'string') ??
        getChild(node, 'identifier') ??
        getChild(node, 'variable_name')
      if (nameNode) return getNodeText(nameNode, content).replace(/['"`]/g, '')
    }
    if (
      node.type === 'parameter' ||
      node.type === 'formal_parameter' ||
      node.type === 'required_parameter' ||
      node.type === 'optional_parameter'
    ) {
      const nameNode =
        getChild(node, 'identifier') ??
        getChild(node, 'variable_name') ??
        getChild(node, 'property_identifier')
      if (nameNode) return getNodeText(nameNode, content)
    }
    // Ruby: (class (constant ...) ...)
    if (node.type === 'class' || node.type === 'module') {
      const constantNode = getChild(node, 'constant')
      if (constantNode) return getNodeText(constantNode, content)
    }
    // PHP: class Foo { public function bar() { } }
    if (node.type === 'method_declaration') {
      const nameNode =
        getChild(node, 'name') ??
        getChild(node, 'property_identifier') ??
        getChild(node, 'identifier')
      if (nameNode) return getNodeText(nameNode, content)
    }
    // Python decorated functions
    if (node.type === 'decorated_definition') {
      const inner = getChild(node, 'function_definition') ?? getChild(node, 'class_definition')
      if (inner) return this.getDeclarationName(inner, content, mapping)
    }

    return 'anonymous'
  }

  private findIdentifiers(node: any, content: string): string[] {
    const results: string[] = []
    const queue = [node]
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (
        cur.type === 'identifier' ||
        cur.type === 'property_identifier' ||
        cur.type === 'type_identifier'
      ) {
        results.push(getNodeText(cur, content))
      }
      if (results.length >= 3) break
      for (let i = 0; i < cur.childCount; i++) {
        queue.push(cur.child(i))
      }
    }
    return results
  }

  private extractSymbolMeta(node: any, content: string, result: CodeNode): void {
    const text = getNodeText(node, content)

    // Return type for functions/methods
    if (result.type === 'Function' || result.type === 'Method') {
      const returnTypeMatch = text.match(/(?:=>|:\s*)([\w[\]<>| ,.$]+)\s*[;({\n=]/)
      if (returnTypeMatch) result.returnType = returnTypeMatch[1].trim()
    }

    // Parameters
    const paramMatch = text.match(/\(([^)]*)\)/)
    if (paramMatch && paramMatch[1].trim()) {
      const params = paramMatch[1].split(',').filter((p: string) => p.trim())
      result.parameterCount = params.length
    }

    // Signature
    result.signature = text.substring(0, 200).replace(/\s+/g, ' ').trim()
  }

  // ─── Edge Extraction ─────────────────────────────────────────────────────────

  private extractEdges(
    node: any,
    parentUid: string,
    content: string,
    filePath: string,
    edges: CodeEdge[],
  ): void {
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

  // CALLS — function/method invocations
  private extractCallEdges(node: any, parentUid: string, content: string, edges: CodeEdge[]): void {
    const queue: any[] = [node]
    let visited = 0
    while (queue.length > 0 && visited++ < 500) {
      const cur = queue.shift()!

      if (cur.type === 'call_expression') {
        const fn = this.getCallFunction(cur, content)
        if (fn) {
          const toUid = `UNKNOWN:Function:${fn}:0`
          edges.push({
            id: `${parentUid}->CALLS:${fn}`,
            fromUid: parentUid,
            toUid,
            type: 'CALLS',
            confidence: 0.8,
            reason: 'tree-sitter-call',
          })
        }
      }

      for (let i = 0; i < cur.childCount; i++) {
        queue.push(cur.child(i))
      }
    }
  }

  private getCallFunction(node: any, content: string): string | null {
    // Direct: foo()
    if (node.type === 'identifier') return getNodeText(node, content)

    // Member: obj.method() or obj->method() or obj.property
    if (node.type === 'member_expression') {
      const obj = node.children?.find(
        (c: any) =>
          c.type !== '.' && c.type !== 'property_identifier' && c.type !== '*' && c.type !== '::',
      )
      const prop = node.children?.find(
        (c: any) =>
          c.type === 'property_identifier' || c.type === 'identifier' || c.type === 'string',
      )
      const objText = obj ? getNodeText(obj, content) : ''
      const propText = prop ? getNodeText(prop, content) : ''
      if (propText) return objText ? `${objText}.${propText}` : propText
    }

    // PHP: $obj->method()
    if (node.type === 'member_access_expression') {
      const obj = node.children?.find(
        (c: any) =>
          c.type !== 'object' && c.type !== 'name' && c.type !== '->' && c.type !== 'property',
      )
      const prop = node.children?.find(
        (c: any) =>
          c.type === 'property_access' || c.type === 'identifier' || c.type === 'variable_name',
      )
      if (prop) {
        const objText = obj ? getNodeText(obj, content).replace(/^\$/, '') : ''
        const propText = getNodeText(prop, content).replace(/^\$/, '')
        return objText ? `${objText}->${propText}` : propText
      }
    }

    // PHP static: ClassName::method()
    if (node.type === 'scoped_access_expression') {
      const classNode = node.children?.find((c: any) => c.type !== '::' && c.type !== 'name')
      const methodNode = node.children?.find((c: any) => c.type === 'name')
      if (classNode && methodNode) {
        return `${getNodeText(classNode, content)}::${getNodeText(methodNode, content)}`
      }
    }

    // Ruby: object.method (without parentheses)
    if (node.type === 'call') {
      const methodNode = getChild(node, 'method') ?? getChild(node, 'identifier')
      const receiverNode = getChild(node, 'receiver')
      const methodText = methodNode ? getNodeText(methodNode, content) : ''
      const receiverText = receiverNode ? getNodeText(receiverNode, content).replace(/^\$/, '') : ''
      if (methodText) return receiverText ? `${receiverText}.${methodText}` : methodText
    }

    // Nested call: (something).method()
    const first = node.children?.[0]
    if (first) return this.getCallFunction(first, content)

    return null
  }

  // IMPORTS — import/require statements (TypeScript, JavaScript, Python, Go, Rust, Java, C#, PHP)
  private extractImportEdges(
    node: any,
    parentUid: string,
    content: string,
    edges: CodeEdge[],
  ): void {
    // TypeScript/JavaScript: import statements
    if (node.type === 'import_statement') {
      const specifiers: string[] = []
      const sourceNode =
        getChild(node, 'string') ??
        node.children?.find(
          (c: any) => c.type === 'string' || c.type === 'external_module_reference',
        )
      const source = sourceNode ? getNodeText(sourceNode, content).replace(/['"`]/g, '') : ''

      for (const child of node.namedChildren) {
        if (child.type === 'import_clause') {
          for (const ic of child.namedChildren) {
            if (ic.type === 'named_imports') {
              for (const specNode of ic.namedChildren) {
                if (specNode.type === 'import_specifier') {
                  const id = getChild(specNode, 'identifier') ?? getChild(specNode, 'identifier')
                  if (id) specifiers.push(getNodeText(id, content))
                  const namespace = getChild(specNode, 'namespace_import')
                  if (namespace) {
                    const ns = getChild(namespace, 'identifier')
                    if (ns) specifiers.push(getNodeText(ns, content))
                  }
                }
              }
            } else if (ic.type === 'import_specifier') {
              const id = getChild(ic, 'identifier') ?? getChild(ic, 'identifier')
              if (id) specifiers.push(getNodeText(id, content))
            }
          }
        } else if (child.type === 'identifier') {
          specifiers.push(getNodeText(child, content))
        }
      }

      for (const spec of specifiers) {
        const toUid = `IMPORT:${source}:${spec}`
        edges.push({
          id: `${parentUid}->IMPORTS:${spec}:${source}`,
          fromUid: parentUid,
          toUid,
          type: 'IMPORTS',
          confidence: 0.95,
          reason: 'tree-sitter-import',
        })
      }
    }

    // TypeScript/JavaScript: require()
    if (node.type === 'call_expression') {
      const fn = this.getCallFunction(node, content)
      if (fn === 'require' || fn === 'import') {
        const sourceNode = node.children?.[1]
        if (sourceNode) {
          const source = getNodeText(sourceNode, content).replace(/['"`]/g, '')
          const toUid = `IMPORT:${source}:default`
          edges.push({
            id: `${parentUid}->IMPORTS:require:${source}`,
            fromUid: parentUid,
            toUid,
            type: 'IMPORTS',
            confidence: 0.9,
            reason: 'tree-sitter-require',
          })
        }
      }
      // PHP: require/include
      if (fn === 'require' || fn === 'require_once' || fn === 'include' || fn === 'include_once') {
        const sourceNode = node.children?.[1]
        if (sourceNode) {
          const source = getNodeText(sourceNode, content).replace(/['"`]/g, '')
          const toUid = `IMPORT:${source}:file`
          edges.push({
            id: `${parentUid}->IMPORTS:php:${source}`,
            fromUid: parentUid,
            toUid,
            type: 'IMPORTS',
            confidence: 0.95,
            reason: 'php-require',
          })
        }
      }
    }

    // Python: import / from ... import
    if (node.type === 'import_statement' || node.type === 'import_from_statement') {
      let source = ''
      if (node.type === 'import_from_statement') {
        const dottedName = getChild(node, 'dotted_name')
        if (dottedName) source = getNodeText(dottedName, content)
      } else {
        const dottedName = getChild(node, 'dotted_name')
        if (dottedName) source = getNodeText(dottedName, content)
      }

      if (source) {
        const toUid = `IMPORT:${source}:module`
        edges.push({
          id: `${parentUid}->IMPORTS:py:${source}`,
          fromUid: parentUid,
          toUid,
          type: 'IMPORTS',
          confidence: 0.95,
          reason: 'tree-sitter-import-py',
        })
      }
    }

    // Go: import "module" or import "module" (alias)
    if (node.type === 'import_declaration') {
      const importSpec = getChild(node, 'import_specification') ?? node
      const sourceNode =
        getChild(importSpec, 'string') ?? importSpec.children?.find((c: any) => c.type === 'string')
      if (sourceNode) {
        const source = getNodeText(sourceNode, content).replace(/['"`]/g, '')
        const alias = getChild(importSpec, 'identifier')
        const aliasName = alias ? getNodeText(alias, content) : (source.split('/').pop() ?? source)
        const toUid = `IMPORT:${source}:${aliasName}`
        edges.push({
          id: `${parentUid}->IMPORTS:go:${source}`,
          fromUid: parentUid,
          toUid,
          type: 'IMPORTS',
          confidence: 1.0,
          reason: 'go-import',
        })
      }
    }

    // Rust: use module::item; or use module::*;
    if (node.type === 'use_declaration') {
      const text = getNodeText(node, content)
        .replace(/^use\s+/, '')
        .replace(/;$/, '')
        .trim()
      if (text) {
        const parts = text.split('::')
        const source = parts.slice(0, -1).join('::') || text
        const item = parts[parts.length - 1] || text
        const toUid = `IMPORT:${source}:${item === '*' ? 'wildcard' : item}`
        edges.push({
          id: `${parentUid}->IMPORTS:rust:${text}`,
          fromUid: parentUid,
          toUid,
          type: 'IMPORTS',
          confidence: 0.95,
          reason: 'rust-use',
        })
      }
    }

    // Java: import package.Class; or import package.*;
    if (node.type === 'import_declaration') {
      const text = getNodeText(node, content)
        .replace(/^import\s+/, '')
        .replace(/;$/, '')
        .trim()
      if (text) {
        const parts = text.split('.')
        const source = parts.slice(0, -1).join('.')
        const item = parts[parts.length - 1] || text
        const toUid = `IMPORT:${source}:${item === '*' ? 'wildcard' : item}`
        edges.push({
          id: `${parentUid}->IMPORTS:java:${text}`,
          fromUid: parentUid,
          toUid,
          type: 'IMPORTS',
          confidence: 1.0,
          reason: 'java-import',
        })
      }
    }

    // C#: using Module; or using static Module.Type;
    if (node.type === 'using_declaration') {
      const text = getNodeText(node, content)
        .replace(/^using\s+/, '')
        .replace(/;$/, '')
        .trim()
      if (text) {
        const parts = text.split('.')
        const source = parts.slice(0, -1).join('.') || text
        const item = parts[parts.length - 1] || text
        const toUid = `IMPORT:${source}:${item}`
        edges.push({
          id: `${parentUid}->IMPORTS:cs:${text}`,
          fromUid: parentUid,
          toUid,
          type: 'IMPORTS',
          confidence: 1.0,
          reason: 'csharp-using',
        })
      }
    }

    // PHP: use Namespace\Class; or use function Namespace\func; use const Namespace\CONST;
    if (node.type === 'use_declaration' || node.type === 'namespace_use_declaration') {
      const text = getNodeText(node, content)
        .replace(/^use\s+/, '')
        .replace(/^namespace\s+/, '')
        .replace(/;$/, '')
        .replace(/\s+as\s+\w+$/, '') // strip alias
        .trim()
      if (text) {
        const parts = text.split('\\')
        const source = parts.slice(0, -1).join('\\') || parts[0] || text
        const item = parts[parts.length - 1] || text
        const toUid = `IMPORT:${source}:${item}`
        edges.push({
          id: `${parentUid}->IMPORTS:php-use:${text}`,
          fromUid: parentUid,
          toUid,
          type: 'IMPORTS',
          confidence: 0.95,
          reason: 'php-use',
        })
      }
    }

    // Swift: import Module
    if (node.type === 'import_declaration') {
      const moduleNode =
        getChild(node, 'identifier') ?? node.children?.find((c: any) => c.type === 'identifier')
      if (moduleNode) {
        const moduleName = getNodeText(moduleNode, content)
        const toUid = `IMPORT:${moduleName}:module`
        edges.push({
          id: `${parentUid}->IMPORTS:swift:${moduleName}`,
          fromUid: parentUid,
          toUid,
          type: 'IMPORTS',
          confidence: 1.0,
          reason: 'swift-import',
        })
      }
    }

    // Dart: import 'package:xxx/yyy.dart'; or import 'package:xxx/yyy.dart' as prefix;
    if (node.type === 'import_directive') {
      const uriNode =
        getChild(node, 'uri') ??
        node.children?.find((c: any) => c.type === 'uri' || c.type === 'string_literal')
      const source = uriNode ? getNodeText(uriNode, content).replace(/['"`]/g, '') : ''
      if (source) {
        const toUid = `IMPORT:${source}:module`
        edges.push({
          id: `${parentUid}->IMPORTS:dart:${source}`,
          fromUid: parentUid,
          toUid,
          type: 'IMPORTS',
          confidence: 1.0,
          reason: 'dart-import',
        })
      }
    }

    // Kotlin: import package.Class
    if (node.type === 'import_directive') {
      const text = getNodeText(node, content)
        .replace(/^import\s+/, '')
        .trim()
      if (text && text !== '_') {
        const parts = text.split('.')
        const source = parts.slice(0, -1).join('.')
        const item = parts[parts.length - 1] || text
        const toUid = `IMPORT:${source}:${item}`
        edges.push({
          id: `${parentUid}->IMPORTS:kotlin:${text}`,
          fromUid: parentUid,
          toUid,
          type: 'IMPORTS',
          confidence: 1.0,
          reason: 'kotlin-import',
        })
      }
    }
  }

  // EXTENDS / IMPLEMENTS — class inheritance (TS, Python, Go, Rust, Java, C#, Kotlin, PHP, Swift, Dart)
  private extractHeritageEdges(
    node: any,
    parentUid: string,
    content: string,
    filePath: string,
    edges: CodeEdge[],
  ): void {
    // TypeScript: class extends/implements
    if (node.type === 'class_declaration' || node.type === 'class_definition') {
      for (const child of node.namedChildren) {
        if (child.type === 'class_heritage') {
          for (const heritageChild of child.namedChildren) {
            if (heritageChild.type === 'extends_clause') {
              const superClass =
                getChild(heritageChild, 'type_identifier') ?? getChild(heritageChild, 'identifier')
              if (superClass) {
                const targetName = getNodeText(superClass, content)
                const toUid = `${filePath}:Class:${targetName}:0`
                edges.push({
                  id: `${parentUid}->EXTENDS:${targetName}`,
                  fromUid: parentUid,
                  toUid,
                  type: 'EXTENDS',
                  confidence: 1.0,
                  reason: 'tree-sitter-extends',
                })
              }
            }
            if (heritageChild.type === 'implements_clause') {
              for (const iface of getNamedChildren(heritageChild, 'type_identifier')) {
                const targetName = getNodeText(iface, content)
                const toUid = `${filePath}:Interface:${targetName}:0`
                edges.push({
                  id: `${parentUid}->IMPLEMENTS:${targetName}`,
                  fromUid: parentUid,
                  toUid,
                  type: 'IMPLEMENTS',
                  confidence: 1.0,
                  reason: 'tree-sitter-implements',
                })
              }
            }
          }
        }
        if (child.type === 'implements_clause') {
          for (const iface of getNamedChildren(child, 'type_identifier')) {
            const targetName = getNodeText(iface, content)
            const toUid = `${filePath}:Interface:${targetName}:0`
            edges.push({
              id: `${parentUid}->IMPLEMENTS:${targetName}`,
              fromUid: parentUid,
              toUid,
              type: 'IMPLEMENTS',
              confidence: 1.0,
              reason: 'tree-sitter-implements',
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
          const nameNode = getChild(arg, 'identifier') ?? getChild(arg, 'attribute')
          if (nameNode) {
            const targetName = getNodeText(nameNode, content)
            const toUid = `${filePath}:Class:${targetName}:0`
            edges.push({
              id: `${parentUid}->EXTENDS:${targetName}`,
              fromUid: parentUid,
              toUid,
              type: 'EXTENDS',
              confidence: 1.0,
              reason: 'tree-sitter-py-inherit',
            })
          }
        }
      }
    }

    // Go: struct embedding (AnonymousField in field_declaration_list)
    if (node.type === 'field_declaration_list') {
      const parent = node.parent
      if (parent?.type === 'struct_type') {
        for (const field of node.namedChildren) {
          const typeName = getChild(field, 'type_identifier') ?? getChild(field, 'pointer_type')
          if (typeName) {
            const targetName = getNodeText(typeName, content).replace(/^\*+/, '')
            const toUid = `UNKNOWN:Class:${targetName}:0`
            edges.push({
              id: `${parentUid}->EXTENDS:go:${targetName}`,
              fromUid: parentUid,
              toUid,
              type: 'EXTENDS',
              confidence: 0.9,
              reason: 'tree-sitter-go-embed',
            })
          }
        }
      }
    }

    // Go: type Foo struct { Bar } — Bar is embedded
    if (node.type === 'struct_declaration' || node.type === 'type_declaration') {
      const typeSpec = getChild(node, 'type_specification')
      const structType = typeSpec
        ? getChild(typeSpec, 'struct_type')
        : getChild(node, 'struct_type')
      if (structType) {
        const fdl = getChild(structType, 'field_declaration_list')
        if (fdl) {
          for (const field of fdl.namedChildren) {
            const typeName = getChild(field, 'type_identifier')
            if (typeName) {
              const targetName = getNodeText(typeName, content)
              edges.push({
                id: `${parentUid}->EXTENDS:go-struct:${targetName}`,
                fromUid: parentUid,
                toUid: `UNKNOWN:Class:${targetName}:0`,
                type: 'EXTENDS',
                confidence: 0.9,
                reason: 'go-struct-embed',
              })
            }
          }
        }
      }
    }

    // Java: class Foo extends Bar implements Baz, Qux
    if (node.type === 'class_declaration') {
      for (const child of node.namedChildren) {
        if (child.type === 'superclass') {
          const superClass = getChild(child, 'identifier') ?? getChild(child, 'type_identifier')
          if (superClass) {
            const targetName = getNodeText(superClass, content)
            edges.push({
              id: `${parentUid}->EXTENDS:java:${targetName}`,
              fromUid: parentUid,
              toUid: `${filePath}:Class:${targetName}:0`,
              type: 'EXTENDS',
              confidence: 1.0,
              reason: 'java-extends',
            })
          }
        }
        if (child.type === 'super_interfaces') {
          for (const iface of getNamedChildren(child, 'identifier')) {
            const targetName = getNodeText(iface, content)
            edges.push({
              id: `${parentUid}->IMPLEMENTS:java:${targetName}`,
              fromUid: parentUid,
              toUid: `${filePath}:Interface:${targetName}:0`,
              type: 'IMPLEMENTS',
              confidence: 1.0,
              reason: 'java-implements',
            })
          }
        }
      }
    }

    // C#: class Foo : Bar, IBaz
    if (node.type === 'class_declaration') {
      for (const child of node.namedChildren) {
        if (child.type === 'base_list') {
          for (const base of child.namedChildren) {
            const typeNode = getChild(base, 'identifier') ?? getChild(base, 'type_identifier')
            if (typeNode) {
              const targetName = getNodeText(typeNode, content)
              const edgeType = node.namedChildren.some((c: any) => c.type === 'identifier')
                ? 'EXTENDS'
                : 'IMPLEMENTS'
              edges.push({
                id: `${parentUid}->${edgeType}:cs:${targetName}`,
                fromUid: parentUid,
                toUid: `${filePath}:${edgeType === 'EXTENDS' ? 'Class' : 'Interface'}:${targetName}:0`,
                type: edgeType as EdgeType,
                confidence: 1.0,
                reason: 'csharp-inherit',
              })
            }
          }
        }
      }
    }

    // Kotlin: class Foo : Bar by delegation, Baz
    if (node.type === 'class_declaration') {
      for (const child of node.namedChildren) {
        if (child.type === 'supertype') {
          const typeNode = getChild(child, 'type_identifier') ?? getChild(child, 'user_type')
          if (typeNode) {
            const targetName = getNodeText(typeNode, content)
            edges.push({
              id: `${parentUid}->EXTENDS:kotlin:${targetName}`,
              fromUid: parentUid,
              toUid: `${filePath}:Class:${targetName}:0`,
              type: 'EXTENDS',
              confidence: 1.0,
              reason: 'kotlin-extends',
            })
          }
        }
        if (child.type === 'delegation') {
          const bySpec = getChild(child, 'by_specification')
          if (bySpec) {
            const typeNode = getChild(bySpec, 'user_type') ?? getChild(bySpec, 'identifier')
            if (typeNode) {
              const targetName = getNodeText(typeNode, content)
              edges.push({
                id: `${parentUid}->EXTENDS:kotlin-delegation:${targetName}`,
                fromUid: parentUid,
                toUid: `${filePath}:Class:${targetName}:0`,
                type: 'EXTENDS',
                confidence: 0.9,
                reason: 'kotlin-delegation',
              })
            }
          }
        }
      }
    }

    // PHP: class Foo extends Bar implements Baz, Qux
    if (node.type === 'class_declaration') {
      const classBody =
        getChild(node, 'base_list') ?? node.namedChildren.find((c: any) => c.type === 'base_list')
      if (classBody) {
        for (const child of classBody.namedChildren) {
          if (child.type === 'name') {
            const targetName = getNodeText(child, content)
            // First base class = extends, rest = implements
            const idx = classBody.namedChildren.indexOf(child)
            edges.push({
              id: `${parentUid}->${idx === 0 ? 'EXTENDS' : 'IMPLEMENTS'}:php:${targetName}`,
              fromUid: parentUid,
              toUid: `${filePath}:${idx === 0 ? 'Class' : 'Interface'}:${targetName}:0`,
              type: (idx === 0 ? 'EXTENDS' : 'IMPLEMENTS') as EdgeType,
              confidence: 1.0,
              reason: 'php-inherit',
            })
          }
        }
      }
    }

    // Swift: class Foo: Bar, Protocol1, Protocol2
    if (node.type === 'class_declaration' || node.type === 'struct_declaration') {
      for (const child of node.namedChildren) {
        if (child.type === 'inheritance_specifier') {
          const typeNodes =
            getNamedChildren(child, 'type_identifier') ?? getNamedChildren(child, 'identifier')
          for (const typeNode of typeNodes) {
            const targetName = getNodeText(typeNode, content)
            // First = inherits, rest = conforms to protocol
            const idx = child.namedChildren.indexOf(typeNode)
            edges.push({
              id: `${parentUid}->${idx === 0 ? 'EXTENDS' : 'IMPLEMENTS'}:swift:${targetName}`,
              fromUid: parentUid,
              toUid: `${filePath}:${idx === 0 ? 'Class' : 'Interface'}:${targetName}:0`,
              type: (idx === 0 ? 'EXTENDS' : 'IMPLEMENTS') as EdgeType,
              confidence: 1.0,
              reason: 'swift-inherit',
            })
          }
        }
      }
    }

    // Dart: class Foo extends Bar implements Baz
    if (node.type === 'class_declaration') {
      for (const child of node.namedChildren) {
        if (child.type === 'extends_clause') {
          const superClass = getChild(child, 'identifier') ?? getChild(child, 'type_identifier')
          if (superClass) {
            const targetName = getNodeText(superClass, content)
            edges.push({
              id: `${parentUid}->EXTENDS:dart:${targetName}`,
              fromUid: parentUid,
              toUid: `${filePath}:Class:${targetName}:0`,
              type: 'EXTENDS',
              confidence: 1.0,
              reason: 'dart-extends',
            })
          }
        }
        if (child.type === 'with_clause') {
          for (const mixin of getNamedChildren(child, 'identifier')) {
            const targetName = getNodeText(mixin, content)
            edges.push({
              id: `${parentUid}->EXTENDS:dart-mixin:${targetName}`,
              fromUid: parentUid,
              toUid: `${filePath}:Interface:${targetName}:0`,
              type: 'EXTENDS',
              confidence: 0.9,
              reason: 'dart-with-mixin',
            })
          }
        }
        if (child.type === 'implements_clause') {
          for (const iface of getNamedChildren(child, 'identifier')) {
            const targetName = getNodeText(iface, content)
            edges.push({
              id: `${parentUid}->IMPLEMENTS:dart:${targetName}`,
              fromUid: parentUid,
              toUid: `${filePath}:Interface:${targetName}:0`,
              type: 'IMPLEMENTS',
              confidence: 1.0,
              reason: 'dart-implements',
            })
          }
        }
      }
    }
  }

  // HAS_METHOD / HAS_PROPERTY — members of classes/interfaces (TS, Python, Go, Rust, Java, C#, Kotlin, PHP, Swift, Dart)
  private extractMemberEdges(
    node: any,
    parentUid: string,
    content: string,
    filePath: string,
    edges: CodeEdge[],
  ): void {
    const isContainer =
      node.type === 'class_declaration' ||
      node.type === 'interface_declaration' ||
      node.type === 'class_definition' ||
      node.type === 'struct_item' ||
      node.type === 'impl_item' ||
      node.type === 'class_body' ||
      // Java
      (node.type === 'class_declaration' && node.language?.name?.includes('java')) ||
      // C#
      (node.type === 'class_declaration' && node.language?.name?.includes('c_sharp')) ||
      // Kotlin
      (node.type === 'class_declaration' && node.language?.name?.includes('kotlin')) ||
      // PHP
      (node.type === 'class_declaration' && node.language?.name?.includes('php')) ||
      // Swift
      (node.type === 'class_declaration' && node.language?.name?.includes('swift')) ||
      // Dart
      (node.type === 'class_declaration' && node.language?.name?.includes('dart')) ||
      // C/C++
      node.type === 'struct_declaration' ||
      node.type === 'struct_item' ||
      node.type === 'struct_body'

    if (!isContainer) return

    let containerName = ''
    let nodeTypeForMembers = 'Class'
    for (const child of node.namedChildren) {
      if (child.type === 'identifier' || child.type === 'type_identifier') {
        containerName = getNodeText(child, content)
        break
      }
    }
    if (!containerName) {
      // Try Ruby: (class (constant) (body ...))
      const constantNode = getChild(node, 'constant')
      if (constantNode) containerName = getNodeText(constantNode, content)
    }
    if (!containerName) return

    if (node.type === 'impl_item') nodeTypeForMembers = 'Impl'
    if (node.type === 'interface_declaration') nodeTypeForMembers = 'Interface'
    if (node.type === 'trait_item') nodeTypeForMembers = 'Interface'
    if (node.type === 'struct_declaration' || node.type === 'struct_item')
      nodeTypeForMembers = 'Class'

    const containerUid = `${filePath}:${nodeTypeForMembers}:${containerName}:0`

    // Find body — language-specific
    let body: any = null
    const bodyNames = [
      'class_body',
      'declaration_list',
      'block',
      'declaration',
      'body',
      'member_block',
      'members',
      'class_body2',
    ]
    for (const name of bodyNames) {
      const found = getChild(node, name)
      if (found) {
        body = found
        break
      }
    }
    // Ruby: body is direct namedChildren of class node
    if (!body && node.type === 'class') {
      body = node
    }

    if (body) {
      for (const member of body.namedChildren) {
        if (
          member.type === 'method_definition' ||
          member.type === 'method_signature' ||
          member.type === 'function_declaration' ||
          member.type === 'function_item' ||
          member.type === 'function_definition' ||
          member.type === 'method_declaration' ||
          (member.type === 'function_declaration' && member.language?.name?.includes('kotlin')) ||
          member.type === 'method' ||
          member.type === 'singleton_method' ||
          member.type === 'property_declaration' ||
          member.type === 'function_definition' ||
          member.type === 'field_definition' ||
          member.type === 'property_definition'
        ) {
          const methodName = this.getMemberName(member, content)
          if (methodName) {
            const toUid = `${filePath}:Method:${methodName}:${member.startPosition.row + 1}`
            edges.push({
              id: `${containerUid}->HAS_METHOD:${methodName}`,
              fromUid: containerUid,
              toUid,
              type: 'HAS_METHOD',
              confidence: 1.0,
              reason: 'tree-sitter-member',
            })
          }
        }

        if (
          member.type === 'property_signature' ||
          member.type === 'public_field_definition' ||
          member.type === 'property_definition' ||
          member.type === 'field_declaration' ||
          member.type === 'property_declaration' ||
          member.type === 'constant_declaration' ||
          member.type === 'assignment' ||
          member.type === 'field_definition' ||
          member.type === 'instance_variable_declaration'
        ) {
          const propName = this.getMemberName(member, content)
          if (propName) {
            const toUid = `${filePath}:Property:${propName}:${member.startPosition.row + 1}`
            edges.push({
              id: `${containerUid}->HAS_PROPERTY:${propName}`,
              fromUid: containerUid,
              toUid,
              type: 'HAS_PROPERTY',
              confidence: 1.0,
              reason: 'tree-sitter-property',
            })
          }
        }
      }
    }
  }

  private getMemberName(node: any, content: string): string | null {
    // TypeScript
    if (node.type === 'method_definition' || node.type === 'method_signature') {
      const propId = getChild(node, 'property_identifier')
      if (propId) return getNodeText(propId, content)
      const id = getChild(node, 'identifier')
      if (id) return getNodeText(id, content)
      const memberExpr = getChild(node, 'member_expression')
      if (memberExpr) {
        const prop = getChild(memberExpr, 'property_identifier')
        if (prop) return getNodeText(prop, content)
      }
    }
    // Python, Ruby, PHP, Java, C#, Kotlin, Swift, Dart
    if (
      node.type === 'function_declaration' ||
      node.type === 'function_definition' ||
      node.type === 'function_item' ||
      node.type === 'method_declaration' ||
      node.type === 'method'
    ) {
      const id =
        getChild(node, 'identifier') ??
        getChild(node, 'property_identifier') ??
        getChild(node, 'string')
      if (id) return getNodeText(id, content)
      const memberExpr = getChild(node, 'member_expression')
      if (memberExpr) {
        const prop = getChild(memberExpr, 'property_identifier')
        if (prop) return getNodeText(prop, content)
      }
    }
    // Ruby singleton method
    if (node.type === 'singleton_method') {
      const defNode = getChild(node, 'identifier') ?? getChild(node, 'singleton')
      if (defNode) return getNodeText(defNode, content)
    }
    // Properties
    if (
      node.type === 'property_signature' ||
      node.type === 'public_field_definition' ||
      node.type === 'property_definition' ||
      node.type === 'field_declaration' ||
      node.type === 'property_declaration' ||
      node.type === 'constant_declaration' ||
      node.type === 'field_definition' ||
      node.type === 'assignment' ||
      node.type === 'instance_variable_declaration'
    ) {
      const propId = getChild(node, 'property_identifier') ?? getChild(node, 'string')
      if (propId) return getNodeText(propId, content).replace(/['"`]/g, '')
      const id = getChild(node, 'identifier') ?? getChild(node, 'variable_name')
      if (id) return getNodeText(id, content)
    }
    return null
  }

  // ACCESSES — property read/write
  private extractAccessEdges(
    node: any,
    parentUid: string,
    content: string,
    edges: CodeEdge[],
  ): void {
    if (node.type === 'member_expression') {
      const prop = node.children?.find(
        (c: any) => c.type === 'property_identifier' || c.type === 'string',
      )
      if (prop) {
        const propName = getNodeText(prop, content).replace(/['"`]/g, '')
        const toUid = `UNKNOWN:Property:${propName}:0`
        edges.push({
          id: `${parentUid}->ACCESSES:${propName}`,
          fromUid: parentUid,
          toUid,
          type: 'ACCESSES',
          confidence: 0.6,
          reason: 'tree-sitter-access',
        })
      }
    }
  }

  // OVERRIDES — method overrides
  private extractOverrideEdges(
    node: any,
    parentUid: string,
    content: string,
    edges: CodeEdge[],
  ): void {
    // TypeScript: override keyword
    if (node.type === 'method_definition' || node.type === 'function_declaration') {
      const text = getNodeText(node, content)
      if (text.includes('override')) {
        const name = this.getMemberName(node, content)
        if (name) {
          const toUid = `UNKNOWN:Method:${name}:0`
          edges.push({
            id: `${parentUid}->OVERRIDES:${name}`,
            fromUid: parentUid,
            toUid,
            type: 'OVERRIDES',
            confidence: 1.0,
            reason: 'override-keyword',
          })
        }
      }
    }

    // Python: method that might override (starts with common parent class methods)
    if (node.type === 'function_definition') {
      const nameNode = getChild(node, 'identifier')
      if (nameNode) {
        const name = getNodeText(nameNode, content)
        const OVERRIDE_METHODS = new Set([
          '__init__',
          '__str__',
          '__repr__',
          '__eq__',
          '__hash__',
          '__enter__',
          '__exit__',
          '__call__',
          '__len__',
          '__iter__',
          '__next__',
          '__getitem__',
          '__setitem__',
          '__delitem__',
          '__contains__',
          '__add__',
          '__sub__',
          '__mul__',
          '__div__',
          '__getattr__',
          '__setattr__',
          '__delattr__',
        ])
        if (OVERRIDE_METHODS.has(name)) {
          const toUid = `UNKNOWN:Method:${name}:0`
          edges.push({
            id: `${parentUid}->OVERRIDES:py:${name}`,
            fromUid: parentUid,
            toUid,
            type: 'OVERRIDES',
            confidence: 0.8,
            reason: 'python-dunder-method',
          })
        }
      }
    }
  }

  // HANDLES_ROUTE — HTTP route handlers
  private extractRouteEdges(
    node: any,
    parentUid: string,
    content: string,
    filePath: string,
    edges: CodeEdge[],
  ): void {
    if (node.type === 'call_expression') {
      const text = getNodeText(node, content)
      const fn = this.getCallFunction(node, content)

      // Express-style: app.get('/path', handler)
      // Next.js: export async function GET(req) { ... }
      // FastAPI: @app.get("/path")
      if (fn && /^(app|router|express|route|use)\./.test(fn)) {
        if (/^\s*(get|post|put|patch|delete|head|options|all)\s*\(/.test(text)) {
          // Second argument is the handler function
          const args = node.children?.filter((c: any) => c.type === 'arguments')
          if (args.length > 0) {
            const argList = args[0]
            for (const arg of argList.namedChildren) {
              if (
                arg.type === 'identifier' ||
                arg.type === 'arrow_function' ||
                arg.type === 'function_expression'
              ) {
                const handlerName =
                  arg.type === 'identifier'
                    ? getNodeText(arg, content)
                    : `anonymous_handler_${arg.startPosition.row + 1}`
                const routeNode = argList.namedChildren[0]
                const routePath = routeNode ? getNodeText(routeNode, content) : '/'
                const routeUid = `${filePath}:Route:${routePath.replace(/['"`/]/g, '_')}:${arg.startPosition.row + 1}`
                edges.push({
                  id: `${routeUid}->HANDLES_ROUTE:${handlerName}`,
                  fromUid: routeUid,
                  toUid: parentUid,
                  type: 'HANDLES_ROUTE',
                  confidence: 0.95,
                  reason: 'http-handler',
                })
              }
            }
          }
        }
      }

      // Decorator routes: @Get('/path'), @Post(), @Route()
      if (fn === undefined && text.includes('@')) {
        const decoMatch = text.match(/@\w+\s*\(\s*['"`]([^'"`]*)/)
        if (decoMatch) {
          const routePath = decoMatch[1]
          const routeUid = `${filePath}:Route:${routePath.replace(/['"`/]/g, '_')}:${node.startPosition.row + 1}`
          // Find the function that this decorator decorates
          const parent = node.parent
          if (parent?.type === 'decorator') {
            const grandParent = parent.parent
            if (
              grandParent?.type === 'method_definition' ||
              grandParent?.type === 'function_declaration'
            ) {
              const handlerName = this.getMemberName(grandParent, content) ?? 'anonymous'
              edges.push({
                id: `${routeUid}->HANDLES_ROUTE:deco:${handlerName}`,
                fromUid: routeUid,
                toUid: parentUid,
                type: 'HANDLES_ROUTE',
                confidence: 0.95,
                reason: 'decorator-route',
              })
            }
          }
        }
      }
    }

    // Next.js App Router: export async function GET(req) { ... }
    if (node.type === 'export_statement') {
      const text = getNodeText(node, content)
      if (
        /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/.test(text)
      ) {
        const fnMatch = text.match(/function\s+(\w+)\s*\(/)
        if (fnMatch) {
          const fnName = fnMatch[1]
          const routeUid = `${filePath}:Route:${fnName}:${node.startPosition.row + 1}`
          edges.push({
            id: `${routeUid}->HANDLES_ROUTE:next:${fnName}`,
            fromUid: routeUid,
            toUid: parentUid,
            type: 'HANDLES_ROUTE',
            confidence: 1.0,
            reason: 'next-app-router',
          })
        }
      }
    }
  }

  // HANDLES_TOOL — MCP/RPC tool handlers
  private extractToolEdges(
    node: any,
    parentUid: string,
    content: string,
    filePath: string,
    edges: CodeEdge[],
  ): void {
    if (node.type === 'call_expression') {
      const text = getNodeText(node, content)

      // Decorator-based: @tool, @command, @handler
      if (text.includes('@')) {
        const decoMatch = text.match(/@\w+\s*\(\s*['"`]([^'"`]*)/)
        if (decoMatch) {
          const toolName = decoMatch[1]
          const toolUid = `${filePath}:Tool:${toolName}:${node.startPosition.row + 1}`
          const parent = node.parent
          if (parent?.type === 'decorator') {
            const grandParent = parent.parent
            if (grandParent) {
              edges.push({
                id: `${toolUid}->HANDLES_TOOL:${toolName}`,
                fromUid: toolUid,
                toUid: parentUid,
                type: 'HANDLES_TOOL',
                confidence: 0.95,
                reason: 'tool-decorator',
              })
            }
          }
        }
      }
    }

    // Object property: { tool: 'name', handler: fn }
    if (node.type === 'pair') {
      const keyNode = getChild(node, 'property_identifier') ?? getChild(node, 'string')
      const valNode = getChild(node, 'string') ?? getChild(node, 'identifier')
      if (keyNode && valNode) {
        const key = getNodeText(keyNode, content)
        const val = getNodeText(valNode, content).replace(/['"`]/g, '')
        if (['tool', 'command', 'name'].includes(key)) {
          const toolUid = `${filePath}:Tool:${val}:${node.startPosition.row + 1}`
          edges.push({
            id: `${toolUid}->HANDLES_TOOL:object:${val}`,
            fromUid: toolUid,
            toUid: parentUid,
            type: 'HANDLES_TOOL',
            confidence: 0.8,
            reason: 'tool-object',
          })
        }
      }
    }
  }

  // QUERIES — database query detection
  private extractQueryEdges(
    node: any,
    parentUid: string,
    content: string,
    edges: CodeEdge[],
  ): void {
    if (node.type !== 'call_expression') return
    const text = getNodeText(node, content)

    for (const pat of QUERY_PATTERNS) {
      if (pat.test(text)) {
        const fn = this.getCallFunction(node, content)
        if (fn) {
          const toUid = `QUERY:${fn}`
          edges.push({
            id: `${parentUid}->QUERIES:${fn}`,
            fromUid: parentUid,
            toUid,
            type: 'QUERIES',
            confidence: 0.7,
            reason: 'query-pattern',
          })
        }
        break
      }
    }
  }

  // MEMBER_OF — links methods/properties to their containing class/interface/struct
  // Strong membership relationship with high confidence
  private extractMemberOfEdges(
    node: any,
    parentUid: string,
    content: string,
    filePath: string,
    edges: CodeEdge[],
  ): void {
    const memberTypes = new Set([
      'method_definition',
      'function_definition',
      'arrow_function',
      'property_declaration',
      'variable_declarator',
      'assignment_expression',
      'method_declaration',
      'class_static_block_declaration',
      'public_field_definition',
      'private_field_definition',
      'function_declaration',
      'generator_function_declaration',
    ])

    if (!memberTypes.has(node.type)) return

    // Find the enclosing class/interface/struct within the same file
    const containerTypes = new Set([
      'class_declaration',
      'class_body',
      'interface_declaration',
      'class_definition',
      'struct_item',
      'impl_item',
      'enum_declaration',
      'object_literal',
      'object_pattern',
    ])

    let container: any = null
    let cur: any = node.parent
    let depth = 0
    while (cur && depth < 10) {
      if (containerTypes.has(cur.type)) {
        container = cur
        break
      }
      cur = cur.parent
      depth++
    }

    if (!container) return

    // Get container name — use identity mapping (container-specific)
    let containerName: string
    const cnNode =
      getChild(container, 'type_identifier') ??
      getChild(container, 'identifier') ??
      container.children?.find((c: any) => c.type === 'type_identifier' || c.type === 'identifier')
    if (cnNode) {
      containerName = getNodeText(cnNode, content)
    } else {
      const text = getNodeText(container, content)
      containerName =
        text.match(/class\s+(\w+)/)?.[1] ??
        text.match(/interface\s+(\w+)/)?.[1] ??
        text.match(/struct\s+(\w+)/)?.[1] ??
        `Class@${filePath}`
    }

    const containerUid = `MEMBER_OF:${containerName}`
    // Get member name — use node's name directly
    const memberNameNode =
      getChild(node, 'identifier') ??
      getChild(node, 'property_identifier') ??
      node.children?.find((c: any) => c.type === 'identifier' || c.type === 'property_identifier')
    if (!memberNameNode) return
    const memberName = getNodeText(memberNameNode, content)
    if (memberName === 'anonymous') return

    // Only add if not already linked (avoid duplicates with HAS_METHOD/HAS_PROPERTY)
    const edgeId = `${parentUid}->MEMBER_OF:${containerName}:${memberName}`
    const exists = edges.some((e) => e.id === edgeId)
    if (!exists) {
      edges.push({
        id: edgeId,
        fromUid: parentUid,
        toUid: containerUid,
        type: 'MEMBER_OF',
        confidence: 0.95,
        reason: `member-of-${container.type}`,
      })
    }
  }

  // STEP_IN_PROCESS — links entry-point handlers to functions in their call chain
  // Creates process/step relationships for route handlers, tool handlers, CLI commands, main
  private extractProcessEdges(
    node: any,
    parentUid: string,
    content: string,
    filePath: string,
    edges: CodeEdge[],
  ): void {
    // Detect if this node is an entry point (route handler, tool, main)
    const entryTypes = new Set([
      'call_expression',
      'function_declaration',
      'method_definition',
      'arrow_function',
      'generator_function_declaration',
    ])
    if (!entryTypes.has(node.type)) return

    const text = getNodeText(node, content)

    // Route handlers: app.get(), router.post(), @Get(), @Post(), etc.
    for (const pat of ROUTE_PATTERNS) {
      if (pat.test(text)) {
        this.addProcessEdge(parentUid, `Route:${filePath}`, edges)
        // Also mark the handler function itself as ENTRY_POINT_OF
        this.addProcessEdge(parentUid, 'ENTRY_ROUTE', edges)
        return
      }
    }

    // Tool/MCP handlers: tool calls, RPC methods
    for (const pat of TOOL_PATTERNS) {
      if (pat.test(text)) {
        this.addProcessEdge(parentUid, `Tool:${filePath}`, edges)
        this.addProcessEdge(parentUid, 'ENTRY_TOOL', edges)
        return
      }
    }

    // Main/CLI entry patterns
    const MAIN_PATTERNS = [
      /^(async\s+)?function\s+main\b/i,
      /^(async\s+)?const\s+main\s*=/i,
      /^(async\s+)?let\s+main\s*=/i,
      /^main\s*\(/i,
      /\bstart\s*\(/i,
      /\brun\s*\(/i,
      /\bserve\s*\(/i,
      /\binit\s*\(/i,
      /\bbootstrap\s*\(/i,
      /\bcreateServer\s*\(/i,
      /\bapp\.listen\s*\(/i,
      /\bcreateApp\s*\(/i,
      /@Command\s*\(/i,
      /@Cli\s*\(/i,
      /\bprogram\.command\s*\(/i,
      /yargs\s*\(/i,
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
      edges.push({
        id: edgeId,
        fromUid,
        toUid,
        type: 'STEP_IN_PROCESS',
        confidence: 0.85,
        reason: 'process-step',
      })
    }
  }
}
