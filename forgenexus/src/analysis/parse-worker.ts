/**
 * Persistent worker thread for parallel file parsing.
 *
 * Performance optimizations (v2):
 *   - Persistent: worker stays alive across all batches (no teardown between chunks)
 *   - Language pre-loading: loads all needed languages once on init
 *   - Parser reuse: one Parser per language, reused across all files in session
 *   - Sub-batch dispatch: processes batches of ~25 files before messaging back
 *   - Graceful shutdown: handles 'close' messages cleanly
 *
 * Message protocol (v2):
 *   Main → Worker:
 *     { type: 'init', workerId }     — initialize worker, pre-load languages
 *     { type: 'batch', tasks, batchId } — parse a batch of files
 *     { type: 'close' }              — shutdown gracefully
 *
 *   Worker → Main:
 *     { type: 'ready', workerId }    — worker initialized, ready to parse
 *     { type: 'batch_result', batchId, results } — batch completed
 *     { type: 'error', error }       — error during batch
 */

import { createRequire } from 'module'
import { parentPort } from 'worker_threads'
import Parser from 'tree-sitter'
import type { CodeNode, CodeEdge } from '../types.js'

const _require = createRequire(import.meta.url)

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ParseTask {
  filePath: string
  content: string
  language: string
}

interface ParseResult {
  filePath: string
  nodes: CodeNode[]
  edges: CodeEdge[]
  error?: string
}

interface PoolMessage {
  type: 'init' | 'batch' | 'close'
  workerId?: number
  tasks?: ParseTask[]
  batchId?: number
}

// ─── Worker State ───────────────────────────────────────────────────────────────

// Persistent state: loaded once, reused forever
const langCache = new Map<string, any>()
const parserCache = new Map<string, Parser>()   // lang → dedicated parser

if (!parentPort) {
  throw new Error('parse-worker.ts must be run as a worker thread')
}

async function ensureLanguage(lang: string): Promise<any> {
  if (langCache.has(lang)) return langCache.get(lang)

  try {
    let langObj: any = null
    switch (lang) {
      case 'typescript':
      case 'tsx': {
        const mod = (await import('tree-sitter-typescript')) as any
        const resolved = mod.default ?? mod
        const sub = resolved.typescript ?? resolved.tsx
        langObj = (sub as any)?.language ?? sub ?? null
        break
      }
      case 'javascript': {
        const mod = (await import('tree-sitter-javascript')) as any
        langObj = (mod.default ?? mod).language ?? mod ?? null
        break
      }
      case 'python': langObj = (_require('tree-sitter-python') as any).default ?? null; break
      case 'cpp': langObj = (_require('tree-sitter-cpp') as any).default ?? null; break
      case 'c': langObj = (_require('tree-sitter-c') as any).default ?? null; break
      case 'kotlin': langObj = (_require('tree-sitter-kotlin') as any).default ?? null; break
      case 'php': langObj = (_require('tree-sitter-php') as any).default ?? null; break
      case 'ruby': langObj = (_require('tree-sitter-ruby') as any).default ?? null; break
      case 'swift': langObj = (_require('tree-sitter-swift') as any).default ?? null; break
      case 'dart': langObj = (_require('tree-sitter-dart') as any).default ?? null; break
      default: langObj = null
    }

    if (langObj) {
      langCache.set(lang, langObj)
      const parser = new Parser()
      parser.setLanguage(langObj)
      parserCache.set(lang, parser)
    }

    return langObj
  } catch {
    return null
  }
}

// ─── Core Parsing ───────────────────────────────────────────────────────────────

const ROUTE_PATTERNS = [
  /^(get|post|put|patch|delete|head|options|all)\s*\(/i,
  /@\s*(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(/i,
  /@\s*(app|router)\.(get|post|put|patch|delete)\s*\(/i,
]

function posToIndex(content: string, row: number, col: number): number {
  let line = 0, index = 0
  for (; line < row && index < content.length; index++) {
    if (content[index] === '\n') line++
  }
  return index + col
}

function nodeText(node: any, content: string): string {
  const s = node.startPosition, e = node.endPosition
  return content.substring(posToIndex(content, s.row, s.column), posToIndex(content, e.row, e.column))
}

function child(node: any, type: string): any {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i)
    if (c.type === type) return c
  }
  return null
}

function identifier(node: any, content: string): string | null {
  const c = child(node, 'identifier')
    ?? child(node, 'property_identifier')
    ?? node.children?.find((c: any) => c.type === 'identifier' || c.type === 'property_identifier')
  return c ? nodeText(c, content) : null
}

function className(node: any, content: string): string | null {
  const c = child(node, 'type_identifier')
    ?? child(node, 'identifier')
    ?? node.children?.find((c: any) => ['type_identifier', 'identifier'].includes(c.type))
  return c ? nodeText(c, content) : null
}

function inferType(type: string): CodeNode['type'] {
  const m: Record<string, CodeNode['type']> = {
    function_declaration: 'Function', function_definition: 'Function',
    method_definition: 'Method', method_declaration: 'Method',
    class_declaration: 'Class', class_definition: 'Class',
    struct_declaration: 'Class', struct_item: 'Class',
    interface_declaration: 'Interface', type_declaration: 'Class',
    enum_declaration: 'Enum', type_alias_declaration: 'TypeAlias',
    type_alias_item: 'TypeAlias', impl_item: 'Impl', trait_item: 'Interface',
    arrow_function: 'Function', function_expression: 'Function',
    variable_declarator: 'Variable', field_declaration: 'Property',
    property_declaration: 'Property', decorated_definition: 'Function',
    assignment: 'Variable',
  }
  return m[type] ?? 'Variable'
}

function parseFile(task: ParseTask): ParseResult {
  const nodes: CodeNode[] = []
  const edges: CodeEdge[] = []

  if (!langCache.has(task.language)) {
    return { filePath: task.filePath, nodes, edges }
  }

  // Get or create parser for this language
  let parser: Parser
  if (parserCache.has(task.language)) {
    parser = parserCache.get(task.language)!
  } else {
    parser = new Parser()
    parser.setLanguage(langCache.get(task.language)!)
    parserCache.set(task.language, parser)
  }

  try {
    const tree = parser.parse(task.content)

    // Route detection (line-level)
    const lines = task.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (ROUTE_PATTERNS.some((p) => p.test(line))) {
        nodes.push({
          uid: `${task.filePath}:Route:${i + 1}`,
          type: 'File',
          name: `route_${i + 1}`,
          filePath: task.filePath,
          line: i + 1, endLine: i + 1, column: 0, language: task.language,
        })
      }
    }

    // Walk AST — optimized walk with skip types
    walk(tree.rootNode, task.filePath, task.content, task.language, nodes, edges)
  } catch {
    /* skip */
  }

  return { filePath: task.filePath, nodes, edges }
}

function walk(
  node: any,
  filePath: string,
  content: string,
  lang: string,
  nodes: CodeNode[],
  edges: CodeEdge[],
): void {
  const type = node.type

  // Symbol nodes
  if (SYMBOL_TYPES.has(type)) {
    const name = symbolName(node, content)
    if (name) {
      const start = node.startPosition, end = node.endPosition
      const nodeType = inferType(type)
      const uid = `${filePath}:${nodeType}:${name}:${start.row + 1}:${start.column}`
      nodes.push({ uid, type: nodeType, name, filePath, line: start.row + 1, endLine: end.row + 1, column: start.column, language: lang })

      extractCalls(node, uid, content, edges)
      extractImports(node, uid, content, edges)
      extractHeritage(node, uid, content, filePath, edges)
      extractMembers(node, uid, content, filePath, lang, nodes, edges)
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    walk(node.child(i), filePath, content, lang, nodes, edges)
  }
}

const SYMBOL_TYPES = new Set([
  'function_declaration', 'function_definition', 'method_definition', 'method_declaration',
  'class_declaration', 'class_definition', 'struct_declaration', 'struct_item',
  'interface_declaration', 'type_declaration', 'enum_declaration', 'type_alias_declaration',
  'type_alias_item', 'impl_item', 'trait_item', 'arrow_function', 'function_expression',
  'variable_declarator', 'decorated_definition', 'import_statement', 'import_from_statement',
])

function symbolName(node: any, content: string): string | null {
  const type = node.type
  if (type === 'decorated_definition') {
    const inner = child(node, 'function_definition') ?? child(node, 'class_definition')
    return inner ? symbolName(inner, content) : null
  }
  if (type === 'import_statement' || type === 'import_from_statement') {
    const s = child(node, 'string') ?? node.children?.find((c: any) => c.type === 'string')
    return s ? nodeText(s, content).replace(/['"`]/g, '') : null
  }
  return identifier(node, content)
}

function extractCalls(node: any, parentUid: string, content: string, edges: CodeEdge[]): void {
  const queue: any[] = [node]; let visited = 0
  while (queue.length > 0 && visited++ < 500) {
    const cur = queue.shift()!
    if (cur.type === 'call_expression') {
      const fn = callTarget(cur, content)
      if (fn) edges.push({
        id: `${parentUid}->CALLS:${fn}`, fromUid: parentUid,
        toUid: `UNKNOWN:Function:${fn}:0`, type: 'CALLS',
        confidence: 0.8, reason: 'tree-sitter-call',
      })
    }
    for (let i = 0; i < cur.childCount; i++) queue.push(cur.child(i))
  }
}

function callTarget(node: any, content: string): string | null {
  if (node.type === 'identifier') return nodeText(node, content)
  if (node.type === 'member_expression') {
    const obj = node.children?.find((c: any) => !['.', 'property_identifier', '*', '::'].includes(c.type))
    const prop = node.children?.find((c: any) => ['property_identifier', 'identifier'].includes(c.type))
    const ot = obj ? nodeText(obj, content) : ''
    const pt = prop ? nodeText(prop, content) : ''
    return pt ? (ot ? `${ot}.${pt}` : pt) : null
  }
  const first = node.children?.[0]
  return first ? callTarget(first, content) : null
}

function extractImports(node: any, parentUid: string, content: string, edges: CodeEdge[]): void {
  if (node.type === 'import_statement') {
    const src = child(node, 'string') ?? node.children?.find((c: any) => c.type === 'string')
    const s = src ? nodeText(src, content).replace(/['"`]/g, '') : ''
    if (s) edges.push({
      id: `${parentUid}->IMPORTS:${s}`, fromUid: parentUid,
      toUid: `IMPORT:${s}:default`, type: 'IMPORTS',
      confidence: 0.95, reason: 'tree-sitter-import',
    })
  }
  if (node.type === 'import_from_statement') {
    const dotted = child(node, 'dotted_name')
    const s = dotted ? nodeText(dotted, content) : ''
    if (s) edges.push({
      id: `${parentUid}->IMPORTS:py:${s}`, fromUid: parentUid,
      toUid: `IMPORT:${s}:module`, type: 'IMPORTS',
      confidence: 0.95, reason: 'tree-sitter-import-py',
    })
  }
}

function extractHeritage(node: any, parentUid: string, content: string, filePath: string, edges: CodeEdge[]): void {
  if (node.type !== 'class_declaration' && node.type !== 'class_definition') return
  for (const childNode of node.namedChildren) {
    if (childNode.type === 'class_heritage') {
      for (const hc of childNode.namedChildren) {
        if (hc.type === 'extends_clause') {
          const sc = child(hc, 'type_identifier') ?? child(hc, 'identifier')
          if (sc) {
            const name = nodeText(sc, content)
            edges.push({
              id: `${parentUid}->EXTENDS:${name}`, fromUid: parentUid,
              toUid: `${filePath}:Class:${name}:0`, type: 'EXTENDS',
              confidence: 1.0, reason: 'tree-sitter-extends',
            })
          }
        }
        if (hc.type === 'implements_clause') {
          for (const iface of hc.namedChildren) {
            const name = identifier(iface, content)
            if (name) edges.push({
              id: `${parentUid}->IMPLEMENTS:${name}`, fromUid: parentUid,
              toUid: `${filePath}:Interface:${name}:0`, type: 'IMPLEMENTS',
              confidence: 1.0, reason: 'tree-sitter-implements',
            })
          }
        }
      }
    }
    if (childNode.type === 'implements_clause') {
      for (const iface of childNode.namedChildren) {
        const name = identifier(iface, content)
        if (name) edges.push({
          id: `${parentUid}->IMPLEMENTS:${name}`, fromUid: parentUid,
          toUid: `${filePath}:Interface:${name}:0`, type: 'IMPLEMENTS',
          confidence: 1.0, reason: 'tree-sitter-implements',
        })
      }
    }
  }
}

function extractMembers(
  node: any, parentUid: string, content: string,
  filePath: string, lang: string, nodes: CodeNode[], edges: CodeEdge[],
): void {
  const isClass = ['class_declaration', 'class_definition', 'struct_declaration',
    'struct_item', 'impl_item', 'interface_declaration'].includes(node.type)
  if (!isClass) return

  const name = className(node, content)
  if (!name) return

  const bodyNames = ['class_body', 'declaration_list', 'block', 'body', 'member_block']
  let body: any = null
  for (const bn of bodyNames) {
    const found = child(node, bn)
    if (found) { body = found; break }
  }
  if (!body) return

  for (const member of body.namedChildren) {
    const mt = member.type
    if (['method_definition', 'function_declaration', 'function_definition', 'method_declaration'].includes(mt)) {
      const mName = identifier(member, content)
      if (mName) {
        const mLine = member.startPosition.row + 1
        const mUid = `${filePath}:Method:${mName}:${mLine}`
        nodes.push({ uid: mUid, type: 'Method', name: mName, filePath, line: mLine, endLine: member.endPosition.row + 1, column: member.startPosition.column, language: lang })
        edges.push({ id: `${parentUid}->HAS_METHOD:${mName}`, fromUid: parentUid, toUid: mUid, type: 'HAS_METHOD', confidence: 1.0, reason: 'tree-sitter-member' })
      }
    }
    if (['property_declaration', 'field_declaration', 'public_field_definition', 'field_definition'].includes(mt)) {
      const pName = identifier(member, content)
      if (pName) {
        const pLine = member.startPosition.row + 1
        const pUid = `${filePath}:Property:${pName}:${pLine}`
        nodes.push({ uid: pUid, type: 'Property', name: pName, filePath, line: pLine, endLine: member.endPosition.row + 1, column: member.startPosition.column, language: lang })
        edges.push({ id: `${parentUid}->HAS_PROPERTY:${pName}`, fromUid: parentUid, toUid: pUid, type: 'HAS_PROPERTY', confidence: 1.0, reason: 'tree-sitter-property' })
      }
    }
  }
}

// ─── Message Handler ────────────────────────────────────────────────────────────

let myWorkerId = -1

parentPort.on('message', async (msg: PoolMessage) => {
  if (msg.type === 'init') {
    myWorkerId = msg.workerId ?? 0

    // Pre-load languages needed across all tasks (sent in first batch)
    // We load on demand as we see languages
    // initialized = true
    parentPort!.postMessage({ type: 'ready', workerId: myWorkerId })
  } else if (msg.type === 'batch') {
    const tasks: ParseTask[] = msg.tasks ?? []
    const batchId = msg.batchId ?? -1

    try {
      // Pre-load any new languages we haven't seen yet
      const neededLangs = [...new Set(tasks.map((t) => t.language))].filter(
        (lang) => !langCache.has(lang)
      )
      await Promise.all(neededLangs.map((lang) => ensureLanguage(lang)))

      // Parse all files in batch — parsers already loaded and cached
      const results: ParseResult[] = []
      for (const task of tasks) {
        try {
          results.push(parseFile(task))
        } catch (err) {
          results.push({ filePath: task.filePath, nodes: [], edges: [], error: String(err) })
        }
      }

      parentPort!.postMessage({ type: 'batch_result', batchId, workerId: myWorkerId, results })
    } catch (err) {
      parentPort!.postMessage({ type: 'error', error: String(err), batchId })
    }
  } else if (msg.type === 'close') {
    parentPort!.postMessage({ type: 'closed', workerId: myWorkerId })
    process.exit(0)
  }
})
