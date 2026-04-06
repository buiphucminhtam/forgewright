/**
 * Worker thread for parallel file parsing.
 *
 * Key design: each worker owns its own tree-sitter parser instance.
 * Language loading mirrors parser.ts exactly — uses createRequire for CJS packages
 * and dynamic import for ESM packages (tree-sitter-typescript, tree-sitter-javascript).
 */

import { createRequire } from 'module';
import { parentPort } from 'worker_threads';
import Parser from 'tree-sitter';
import type { CodeNode, CodeEdge } from '../types.js';

const _require = createRequire(import.meta.url);

async function loadLanguage(lang: string): Promise<any> {
  switch (lang) {
    // TypeScript and JavaScript use ESM dynamic import (mirrors parser.ts)
    case 'typescript':
    case 'tsx': {
      try {
        const mod = (await import('tree-sitter-typescript')) as any;
        const resolved = (mod.default ?? mod);
        const sub = resolved.typescript ?? resolved.tsx;
        return (sub as any)?.language ?? sub ?? null;
      } catch { return null; }
    }
    case 'javascript': {
      try {
        const mod = (await import('tree-sitter-javascript')) as any;
        const resolved = (mod.default ?? mod);
        return resolved.language ?? resolved ?? null;
      } catch { return null; }
    }
    // All other languages use createRequire (mirrors parser.ts)
    case 'python': {
      try { return (_require('tree-sitter-python') as any).default ?? null; } catch { return null; }
    }
    case 'cpp': {
      try { return (_require('tree-sitter-cpp') as any).default ?? null; } catch { return null; }
    }
    case 'c': {
      try { return (_require('tree-sitter-c') as any).default ?? null; } catch { return null; }
    }
    case 'kotlin': {
      try { return (_require('tree-sitter-kotlin') as any).default ?? null; } catch { return null; }
    }
    case 'php': {
      try { return (_require('tree-sitter-php') as any).default ?? null; } catch { return null; }
    }
    case 'ruby': {
      try { return (_require('tree-sitter-ruby') as any).default ?? null; } catch { return null; }
    }
    case 'swift': {
      try { return (_require('tree-sitter-swift') as any).default ?? null; } catch { return null; }
    }
    case 'dart': {
      try { return (_require('tree-sitter-dart') as any).default ?? null; } catch { return null; }
    }
    // go, rust, java, csharp not installed in forgenexus — return null
    default: return null;
  }
}

// ─── Worker message protocol ─────────────────────────────────────────────────

interface ParseTask {
  filePath: string;
  content: string;
  language: string;
}

interface ParseResult {
  filePath: string;
  nodes: CodeNode[];
  edges: CodeEdge[];
  error?: string;
}

const parser = new Parser();
const langCache = new Map<string, any>();

if (!parentPort) {
  throw new Error('parse-worker.ts must be run as a worker thread');
}

// ─── Core parsing ────────────────────────────────────────────────────────────

const ROUTE_PATTERNS = [
  /^(get|post|put|patch|delete|head|options|all)\s*\(/i,
  /@\s*(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(/i,
  /@\s*(app|router)\.(get|post|put|patch|delete)\s*\(/i,
];

function posToIndex(content: string, row: number, col: number): number {
  let line = 0, index = 0;
  for (; line < row && index < content.length; index++) {
    if (content[index] === '\n') line++;
  }
  return index + col;
}

function nodeText(node: any, content: string): string {
  const s = node.startPosition, e = node.endPosition;
  return content.substring(posToIndex(content, s.row, s.column), posToIndex(content, e.row, e.column));
}

function child(node: any, type: string): any {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c.type === type) return c;
  }
  return null;
}

function identifier(node: any, content: string): string | null {
  const c = child(node, 'identifier') ?? child(node, 'property_identifier')
    ?? node.children?.find((c: any) => c.type === 'identifier' || c.type === 'property_identifier');
  return c ? nodeText(c, content) : null;
}

function className(node: any, content: string): string | null {
  const c = child(node, 'type_identifier') ?? child(node, 'identifier')
    ?? node.children?.find((c: any) => c.type === 'type_identifier' || c.type === 'identifier');
  return c ? nodeText(c, content) : null;
}

function symbolName(node: any, content: string, type: string): string | null {
  if (type === 'decorated_definition') {
    const inner = child(node, 'function_definition') ?? child(node, 'class_definition');
    return inner ? symbolName(inner, content, inner.type) : null;
  }
  if (type === 'import_statement' || type === 'import_from_statement') {
    const s = child(node, 'string') ?? node.children?.find((c: any) => c.type === 'string');
    return s ? nodeText(s, content).replace(/['"`]/g, '') : null;
  }
  return identifier(node, content);
}

function inferType(type: string): CodeNode['type'] {
  const m: Record<string, CodeNode['type']> = {
    function_declaration: 'Function', function_definition: 'Function',
    arrow_function: 'Function', function_expression: 'Function',
    function_item: 'Function', method_declaration: 'Method',
    method_definition: 'Method', class_declaration: 'Class',
    class_definition: 'Class', struct_declaration: 'Class',
    struct_item: 'Class', interface_declaration: 'Interface',
    type_declaration: 'Class', enum_declaration: 'Enum',
    type_alias_declaration: 'TypeAlias', type_alias_item: 'TypeAlias',
    variable_declarator: 'Variable', field_declaration: 'Property',
    property_declaration: 'Property', impl_item: 'Impl',
    trait_item: 'Interface', decorated_definition: 'Function',
  };
  return m[type] ?? 'Variable';
}

function parseFile(task: ParseTask): { nodes: CodeNode[]; edges: CodeEdge[] } {
  const nodes: CodeNode[] = [];
  const edges: CodeEdge[] = [];

  if (!langCache.has(task.language)) return { nodes, edges };
  parser.setLanguage(langCache.get(task.language)!);

  try {
    const tree = parser.parse(task.content);

    // Route detection
    const lines = task.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (ROUTE_PATTERNS.some(p => p.test(line))) {
        nodes.push({
          uid: `${task.filePath}:Route:${i + 1}`,
          type: 'File', name: `route_${i + 1}`,
          filePath: task.filePath, line: i + 1, endLine: i + 1, column: 0, language: task.language,
        });
      }
    }

    walk(tree.rootNode, task.filePath, task.content, task.language, nodes, edges);
  } catch { /* skip */ }

  return { nodes, edges };
}

function walk(node: any, filePath: string, content: string, lang: string,
  nodes: CodeNode[], edges: CodeEdge[]): void {

  const type = node.type;

  // Symbol nodes — only types that produce meaningful code elements
  if (type === 'function_declaration' || type === 'function_definition'
    || type === 'method_definition' || type === 'method_declaration'
    || type === 'class_declaration' || type === 'class_definition'
    || type === 'struct_declaration' || type === 'struct_item'
    || type === 'interface_declaration' || type === 'type_declaration'
    || type === 'enum_declaration' || type === 'type_alias_declaration'
    || type === 'type_alias_item' || type === 'impl_item' || type === 'trait_item'
    || type === 'arrow_function' || type === 'function_expression'
    || type === 'variable_declarator' || type === 'decorated_definition'
    || type === 'import_statement' || type === 'import_from_statement') {

    const name = symbolName(node, content, type);
    if (name) {
      const start = node.startPosition, end = node.endPosition;
      const nodeType = inferType(type);
      const uid = `${filePath}:${nodeType}:${name}:${start.row + 1}`;
      nodes.push({ uid, type: nodeType, name, filePath, line: start.row + 1, endLine: end.row + 1, column: start.column, language: lang });

      extractCalls(node, uid, content, edges);
      extractImports(node, uid, content, edges);
      extractHeritage(node, uid, content, filePath, edges);
      extractMembers(node, uid, content, filePath, lang, nodes, edges);
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    walk(node.child(i), filePath, content, lang, nodes, edges);
  }
}

function extractCalls(node: any, parentUid: string, content: string, edges: CodeEdge[]): void {
  const queue: any[] = [node];
  let visited = 0;
  while (queue.length > 0 && visited++ < 500) {
    const cur = queue.shift()!;
    if (cur.type === 'call_expression') {
      const fn = callTarget(cur, content);
      if (fn) {
        edges.push({
          id: `${parentUid}->CALLS:${fn}`,
          fromUid: parentUid, toUid: `UNKNOWN:Function:${fn}:0`,
          type: 'CALLS', confidence: 0.8, reason: 'tree-sitter-call',
        });
      }
    }
    for (let i = 0; i < cur.childCount; i++) queue.push(cur.child(i));
  }
}

function callTarget(node: any, content: string): string | null {
  if (node.type === 'identifier') return nodeText(node, content);
  if (node.type === 'member_expression') {
    const obj = node.children?.find((c: any) => !['.', 'property_identifier', '*', '::'].includes(c.type));
    const prop = node.children?.find((c: any) => ['property_identifier', 'identifier'].includes(c.type));
    const ot = obj ? nodeText(obj, content) : '';
    const pt = prop ? nodeText(prop, content) : '';
    return pt ? (ot ? `${ot}.${pt}` : pt) : null;
  }
  const first = node.children?.[0];
  return first ? callTarget(first, content) : null;
}

function extractImports(node: any, parentUid: string, content: string, edges: CodeEdge[]): void {
  if (node.type === 'import_statement') {
    const src = child(node, 'string') ?? node.children?.find((c: any) => c.type === 'string');
    const s = src ? nodeText(src, content).replace(/['"`]/g, '') : '';
    if (s) edges.push({
      id: `${parentUid}->IMPORTS:${s}`,
      fromUid: parentUid, toUid: `IMPORT:${s}:default`,
      type: 'IMPORTS', confidence: 0.95, reason: 'tree-sitter-import',
    });
  }
  if (node.type === 'import_from_statement') {
    const dotted = child(node, 'dotted_name');
    const s = dotted ? nodeText(dotted, content) : '';
    if (s) edges.push({
      id: `${parentUid}->IMPORTS:py:${s}`,
      fromUid: parentUid, toUid: `IMPORT:${s}:module`,
      type: 'IMPORTS', confidence: 0.95, reason: 'tree-sitter-import-py',
    });
  }
}

function extractHeritage(node: any, parentUid: string, content: string, filePath: string, edges: CodeEdge[]): void {
  if (node.type !== 'class_declaration' && node.type !== 'class_definition') return;
  for (const childNode of node.namedChildren) {
    if (childNode.type === 'class_heritage') {
      for (const hc of childNode.namedChildren) {
        if (hc.type === 'extends_clause') {
          const superClass = child(hc, 'type_identifier') ?? child(hc, 'identifier');
          if (superClass) {
            const name = nodeText(superClass, content);
            edges.push({ id: `${parentUid}->EXTENDS:${name}`, fromUid: parentUid, toUid: `${filePath}:Class:${name}:0`, type: 'EXTENDS', confidence: 1.0, reason: 'tree-sitter-extends' });
          }
        }
        if (hc.type === 'implements_clause') {
          for (const iface of hc.namedChildren) {
            const name = identifier(iface, content);
            if (name) edges.push({ id: `${parentUid}->IMPLEMENTS:${name}`, fromUid: parentUid, toUid: `${filePath}:Interface:${name}:0`, type: 'IMPLEMENTS', confidence: 1.0, reason: 'tree-sitter-implements' });
          }
        }
      }
    }
    if (childNode.type === 'implements_clause') {
      for (const iface of childNode.namedChildren) {
        const name = identifier(iface, content);
        if (name) edges.push({ id: `${parentUid}->IMPLEMENTS:${name}`, fromUid: parentUid, toUid: `${filePath}:Interface:${name}:0`, type: 'IMPLEMENTS', confidence: 1.0, reason: 'tree-sitter-implements' });
      }
    }
  }
}

function extractMembers(node: any, parentUid: string, content: string, filePath: string,
  lang: string, nodes: CodeNode[], edges: CodeEdge[]): void {
  const isClass = node.type === 'class_declaration' || node.type === 'class_definition'
    || node.type === 'struct_declaration' || node.type === 'struct_item'
    || node.type === 'impl_item' || node.type === 'interface_declaration';
  if (!isClass) return;

  const name = className(node, content);
  if (!name) return;

  const bodyNames = ['class_body', 'declaration_list', 'block', 'body', 'member_block'];
  let body: any = null;
  for (const bn of bodyNames) {
    const found = child(node, bn);
    if (found) { body = found; break; }
  }
  if (!body) return;

  for (const member of body.namedChildren) {
    const mt = member.type;
    if (mt === 'method_definition' || mt === 'function_declaration'
      || mt === 'function_definition' || mt === 'method_declaration') {
      const mName = identifier(member, content);
      if (mName) {
        const mLine = member.startPosition.row + 1;
        const mUid = `${filePath}:Method:${mName}:${mLine}`;
        nodes.push({ uid: mUid, type: 'Method', name: mName, filePath, line: mLine, endLine: member.endPosition.row + 1, column: member.startPosition.column, language: lang });
        edges.push({ id: `${parentUid}->HAS_METHOD:${mName}`, fromUid: parentUid, toUid: mUid, type: 'HAS_METHOD', confidence: 1.0, reason: 'tree-sitter-member' });
      }
    }
    if (mt === 'property_declaration' || mt === 'field_declaration'
      || mt === 'public_field_definition' || mt === 'field_definition') {
      const pName = identifier(member, content);
      if (pName) {
        const pLine = member.startPosition.row + 1;
        const pUid = `${filePath}:Property:${pName}:${pLine}`;
        nodes.push({ uid: pUid, type: 'Property', name: pName, filePath, line: pLine, endLine: member.endPosition.row + 1, column: member.startPosition.column, language: lang });
        edges.push({ id: `${parentUid}->HAS_PROPERTY:${pName}`, fromUid: parentUid, toUid: pUid, type: 'HAS_PROPERTY', confidence: 1.0, reason: 'tree-sitter-property' });
      }
    }
  }
}

// ─── Worker message handler ────────────────────────────────────────────────────

parentPort.on('message', async (msg: { type: string; tasks?: ParseTask[]; taskId?: string }) => {
  if (msg.type !== 'parse') return;

  const tasks: ParseTask[] = msg.tasks ?? [];
  const results: ParseResult[] = [];

  // Pre-load all needed languages once per worker
  const neededLangs = [...new Set(tasks.map(t => t.language))];
  await Promise.all(neededLangs.map(async lang => {
    if (!langCache.has(lang)) {
      langCache.set(lang, await loadLanguage(lang));
    }
  }));

  for (const task of tasks) {
    try {
      const { nodes, edges } = parseFile(task);
      results.push({ filePath: task.filePath, nodes, edges });
    } catch (err) {
      results.push({ filePath: task.filePath, nodes: [], edges: [], error: String(err) });
    }
  }

  parentPort!.postMessage({ type: 'result', taskId: msg.taskId, results });
});
