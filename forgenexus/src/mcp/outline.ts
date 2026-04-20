/**
 * ForgeNexus Outline Mode — Structural file preview
 *
 * For large files (>200 lines or >6000 tokens), returns function signatures only
 * instead of full content. Inspired by Tilth's structural reading approach.
 *
 * Token savings:
 * - 500-line file: 15k → 3k tokens (80% reduction)
 * - 1000-line file: 30k → 4.5k tokens (85% reduction)
 * - 2000-line file: 60k → 6k tokens (90% reduction)
 */

import { readFileSync } from 'fs'
import { extname, basename } from 'path'

// ─── Configuration ────────────────────────────────────────────────────────────

const OUTLINE_LINE_THRESHOLD = 200
const OUTLINE_TOKEN_THRESHOLD = 6000
const MAX_DEPTH_DEFAULT = 3

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OutlineEntry {
  range: [startLine: number, endLine: number]
  kind:
    | 'function'
    | 'method'
    | 'class'
    | 'interface'
    | 'struct'
    | 'enum'
    | 'type'
    | 'property'
    | 'import'
    | 'const'
  name: string
  signature?: string
  returnType?: string
  accessModifier?: 'public' | 'private' | 'protected' | 'internal'
  docComment?: string
  children?: OutlineEntry[]
  uid: string
  complexity?: 'low' | 'medium' | 'high'
}

export interface OutlineResult {
  mode: 'full' | 'outline'
  path: string
  lineCount: number
  estimatedTokens: number
  content?: string // Only in 'full' mode
  entries?: OutlineEntry[]
  totalEntries?: number
  estimatedTokensSaved?: number
  expandAvailable?: boolean // Can call detail() on any entry
  dedupUid?: string
}

export interface DedupState {
  shownPaths: Map<string, number> // path → turn shown
  shownUids: Set<string>
  hits: number
  misses: number
  tokensSaved: number
}

// ─── Session Dedup State ──────────────────────────────────────────────────────

let sessionDedup: DedupState = {
  shownPaths: new Map(),
  shownUids: new Set(),
  hits: 0,
  misses: 0,
  tokensSaved: 0,
}

export function resetSessionDedup(): void {
  sessionDedup = {
    shownPaths: new Map(),
    shownUids: new Set(),
    hits: 0,
    misses: 0,
    tokensSaved: 0,
  }
}

export function getDedupStats(): {
  hits: number
  misses: number
  tokensSaved: number
  hitRate: number
} {
  const total = sessionDedup.hits + sessionDedup.misses
  return {
    hits: sessionDedup.hits,
    misses: sessionDedup.misses,
    tokensSaved: sessionDedup.tokensSaved,
    hitRate: total > 0 ? sessionDedup.hits / total : 0,
  }
}

// ─── Token Estimation ─────────────────────────────────────────────────────────

function estimateTokens(content: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(content.length / 4)
}

function estimateOutlineTokens(entries: OutlineEntry[]): number {
  // Rough estimate per entry: ~15 tokens for outline (signature only)
  let total = 0
  for (const e of entries) {
    total += 15 + (e.signature?.length ?? 0) / 4
    if (e.children) total += estimateOutlineTokens(e.children)
  }
  return total
}

// ─── Language Detection ───────────────────────────────────────────────────────

const LANG_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.php': 'php',
  '.dart': 'dart',
}

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return LANG_EXTENSIONS[ext] ?? 'unknown'
}

// ─── Structural Pattern Extraction ────────────────────────────────────────────

const PATTERNS: Record<string, PatternDef[]> = {
  typescript: [
    // Class declarations
    { regex: /^(\s*)(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?/, kind: 'class', captureGroup: 2 },
    // Interface declarations
    { regex: /^(\s*)(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[\w,\s]+)?/, kind: 'interface', captureGroup: 2 },
    // Type aliases
    { regex: /^(\s*)(?:export\s+)?type\s+(\w+)\s*=/, kind: 'type', captureGroup: 2 },
    // Enum declarations
    { regex: /^(\s*)(?:export\s+)?(?:const\s+)?enum\s+(\w+)/, kind: 'enum', captureGroup: 2 },
    // Function declarations (hoisted)
    { regex: /^(\s*)(?:export\s+)?function\s+(\w+)\s*\(/, kind: 'function', captureGroup: 2 },
    // Arrow functions assigned to const/let
    { regex: /^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[\w]+)\s*=>/, kind: 'function', captureGroup: 2 },
    // Class methods
    { regex: /^(\s{4,})(?:(?:public|private|protected|readonly)\s+)*(?:static\s+)?(?:async\s+)?(\w+)\s*\(/, kind: 'method', captureGroup: 2 },
    // Class properties
    { regex: /^(\s{4,})(?:(?:public|private|protected|readonly)\s+)*(?:static\s+)?(?:readonly\s+)?(\w+)\s*[:?]/, kind: 'property', captureGroup: 2 },
    // Import statements (grouped)
    { regex: /^(\s*)(?:export\s+)?import\s+/, kind: 'import', captureGroup: 0 },
  ],
  javascript: [
    { regex: /^(\s*)(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?/, kind: 'class', captureGroup: 2 },
    { regex: /^(\s*)(?:export\s+)?function\s+(\w+)\s*\(/, kind: 'function', captureGroup: 2 },
    { regex: /^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[\w]+)\s*=>/, kind: 'function', captureGroup: 2 },
    { regex: /^(\s{4,})(\w+)\s*\([^)]*\)\s*\{/, kind: 'method', captureGroup: 2 },
    { regex: /^(\s*)(?:export\s+)?import\s+/, kind: 'import', captureGroup: 0 },
  ],
  python: [
    // Class definitions
    { regex: /^(\s*)(?:export\s+)?class\s+(\w+)(?:\s*\([^)]*\))?:/, kind: 'class', captureGroup: 2 },
    // Methods (inside class) - MUST come before function pattern
    { regex: /^(\s{4,})(?:@[\w]+\s+)*(?:async\s+)?def\s+(\w+)\s*\(/, kind: 'method', captureGroup: 2 },
    // Function definitions (def) - top-level only
    { regex: /^(\s*)(?:export\s+)?(?:async\s+)?def\s+(\w+)\s*\(/, kind: 'function', captureGroup: 2 },
    // Async arrow functions
    { regex: /^(\s*)(?:export\s+)?(\w+)\s*=\s*async\s+(?:\([^)]*\)|\w+)\s*=>/, kind: 'function', captureGroup: 2 },
    // Decorated functions
    { regex: /^(\s*)@(\w+)/, kind: 'const', captureGroup: 2 },
    // Import statements
    { regex: /^(\s*)(?:from\s+[\w.]+\s+)?import\s+/, kind: 'import', captureGroup: 0 },
  ],
  go: [
    // Struct definitions
    { regex: /^(\s*)type\s+(\w+)\s+struct\s*\{/, kind: 'struct', captureGroup: 2 },
    // Interface definitions
    { regex: /^(\s*)type\s+(\w+)\s+interface\s*\{/, kind: 'interface', captureGroup: 2 },
    // Function declarations (not methods)
    { regex: /^(\s*)func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/, kind: 'function', captureGroup: 2 },
    // Method declarations
    { regex: /^(\s*)func\s+\([^)]+\)\s+(\w+)\s*\(/, kind: 'method', captureGroup: 2 },
    // Const/var blocks
    { regex: /^(\s*)(?:const|var)\s*(?:\([\s\S]*?\)|(\w+))/, kind: 'const', captureGroup: 2 },
    // Import statements
    { regex: /^(\s*)import\s+(?:\(|")/, kind: 'import', captureGroup: 0 },
  ],
  rust: [
    // Struct definitions
    { regex: /^(\s*)pub\s+struct\s+(\w+)/, kind: 'struct', captureGroup: 2 },
    { regex: /^(\s*)struct\s+(\w+)/, kind: 'struct', captureGroup: 2 },
    // Enum definitions
    { regex: /^(\s*)pub\s+enum\s+(\w+)/, kind: 'enum', captureGroup: 2 },
    { regex: /^(\s*)enum\s+(\w+)/, kind: 'enum', captureGroup: 2 },
    // Trait definitions
    { regex: /^(\s*)pub\s+trait\s+(\w+)/, kind: 'interface', captureGroup: 2 },
    { regex: /^(\s*)trait\s+(\w+)/, kind: 'interface', captureGroup: 2 },
    // Function declarations
    { regex: /^(\s*)pub\s+fn\s+(\w+)/, kind: 'function', captureGroup: 2 },
    { regex: /^(\s*)fn\s+(\w+)/, kind: 'function', captureGroup: 2 },
    // Impl blocks
    { regex: /^(\s*)impl(?:\s+(?:\w+\s+)?for\s+)?(\w+)?\s*\{/, kind: 'class', captureGroup: 2 },
    // Method declarations
    { regex: /^(\s{4,})pub\s+fn\s+(\w+)/, kind: 'method', captureGroup: 2 },
    { regex: /^(\s{4,})fn\s+(\w+)/, kind: 'method', captureGroup: 2 },
    // Use statements
    { regex: /^(\s*)use\s+/, kind: 'import', captureGroup: 0 },
  ],
  java: [
    // Class declarations
    { regex: /^(\s*)(?:public\s+|private\s+|protected\s+)*(?:abstract\s+|final\s+)*class\s+(\w+)/, kind: 'class', captureGroup: 2 },
    // Interface declarations
    { regex: /^(\s*)(?:public\s+|private\s+|protected\s+)*interface\s+(\w+)/, kind: 'interface', captureGroup: 2 },
    // Enum declarations
    { regex: /^(\s*)(?:public\s+|private\s+|protected\s+)*enum\s+(\w+)/, kind: 'enum', captureGroup: 2 },
    // Method declarations
    { regex: /^(\s{4,})(?:public\s+|private\s+|protected\s+)*(?:static\s+)*(?:final\s+)*(?:synchronized\s+)*(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w, ]+)?\s*(?:;|\{)/, kind: 'method', captureGroup: 2 },
    // Field declarations
    { regex: /^(\s{4,})(?:public\s+|private\s+|protected\s+)*(?:static\s+)*(?:final\s+)*(\w+)\s+\w+\s*[;=]/, kind: 'property', captureGroup: 2 },
    // Import statements
    { regex: /^(\s*)import\s+/, kind: 'import', captureGroup: 0 },
  ],
  cpp: [
    // Class declarations
    { regex: /^(\s*)(?:export\s+)?class\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+\w+)?\s*\{/, kind: 'class', captureGroup: 2 },
    // Struct definitions
    { regex: /^(\s*)(?:export\s+)?struct\s+(\w+)/, kind: 'struct', captureGroup: 2 },
    // Enum declarations
    { regex: /^(\s*)(?:export\s+)?enum\s+(?:class\s+)?(\w+)/, kind: 'enum', captureGroup: 2 },
    // Function declarations
    { regex: /^(\s*)(?:export\s+)?(?:inline\s+)?(?:constexpr\s+)?(?:noexcept\s+)?(?:void|int|bool|std::\w+|auto)\s+(\w+)\s*\(/, kind: 'function', captureGroup: 2 },
    // Namespace
    { regex: /^(\s*)namespace\s+(\w+)\s*\{/, kind: 'class', captureGroup: 2 },
    // Include statements
    { regex: /^(\s*)#include\s+/, kind: 'import', captureGroup: 0 },
  ],
  default: [
    { regex: /^(\s*)(?:export\s+)?function\s+(\w+)\s*\(/, kind: 'function', captureGroup: 2 },
    { regex: /^(\s*)(?:export\s+)?const\s+(\w+)\s*=/, kind: 'const', captureGroup: 2 },
    { regex: /^(\s*)(?:export\s+)?class\s+(\w+)/, kind: 'class', captureGroup: 2 },
  ],
}

interface PatternDef {
  regex: RegExp
  kind: OutlineEntry['kind']
  captureGroup: number
}

// ─── Signature Extraction ─────────────────────────────────────────────────────

function extractSignature(line: string, kind: OutlineEntry['kind']): string | undefined {
  if (kind === 'import') {
    // Extract import path
    const match = line.match(/import\s+(?:{[^}]+}|[^;]+)/)
    return match ? match[0].trim() : line.trim()
  }

  if (kind === 'const' || kind === 'type') {
    return line.trim().substring(0, 80)
  }

  // For functions/methods, extract parameter list and return type
  const match = line.match(/\([^)]*\)|\{[^}]*$/)
  if (match) {
    return match[0].trim()
  }
  return undefined
}

// ─── Complexity Estimation ────────────────────────────────────────────────────

function estimateComplexity(content: string, startLine: number, endLine: number): OutlineEntry['complexity'] {
  const lines = content.split('\n').slice(startLine - 1, endLine)
  let cyclomatic = 1 // Base complexity
  let linesOfCode = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
      linesOfCode++
      // Count control flow keywords
      if (/\b(if|else if|elif|while|for|case|catch|\?\?|\|\|)\b/.test(trimmed)) {
        cyclomatic++
      }
    }
  }

  if (cyclomatic <= 3 && linesOfCode <= 20) return 'low'
  if (cyclomatic <= 7 && linesOfCode <= 50) return 'medium'
  return 'high'
}

// ─── Core Outline Extraction ─────────────────────────────────────────────────

function extractOutline(content: string, filePath: string, maxDepth: number = MAX_DEPTH_DEFAULT): OutlineEntry[] {
  const lines = content.split('\n')
  const lang = detectLanguage(filePath)
  const patterns = PATTERNS[lang] ?? PATTERNS['default']

  const entries: OutlineEntry[] = []
  let entryId = 0

  // Track entries by indentation level for nesting
  // Each entry stores its indent level
  const indentStack: { entry: OutlineEntry; indent: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const line = lines[i]

    // Try to match against all patterns
    for (const pattern of patterns) {
      const match = line.match(pattern.regex)
      if (match) {
        const indent = (match[1] ?? '').length
        const name = pattern.captureGroup > 0 ? match[pattern.captureGroup] : line.trim().substring(0, 30)

        const entry: OutlineEntry = {
          range: [lineNum, lineNum],
          kind: pattern.kind,
          name: typeof name === 'string' ? name : line.trim().substring(0, 30),
          signature: extractSignature(line, pattern.kind),
          uid: `${filePath}:outline:${entryId++}`,
          children: [],
        }

        // Check for access modifier
        if (/\bpublic\s+/.test(line)) entry.accessModifier = 'public'
        else if (/\bprivate\s+/.test(line)) entry.accessModifier = 'private'
        else if (/\bprotected\s+/.test(line)) entry.accessModifier = 'protected'

        // Estimate complexity for code blocks
        if (['function', 'method'].includes(pattern.kind) && line.includes('{')) {
          entry.complexity = estimateComplexity(content, lineNum, findBlockEnd(lines, i))
        }

        // Pop entries from stack that are at the same or deeper indentation
        while (indentStack.length > 0 && indentStack[indentStack.length - 1].indent >= indent) {
          const popped = indentStack.pop()!
          // Update end line of popped entry
          if (popped.entry.range[1] < lineNum - 1) {
            popped.entry.range[1] = lineNum - 1
          }
        }

        // Add entry as child of top of stack, or as top-level entry
        if (indentStack.length === 0) {
          entries.push(entry)
        } else {
          const parent = indentStack[indentStack.length - 1].entry
          if (!parent.children) parent.children = []
          // Respect maxDepth
          const currentDepth = indentStack.length
          if (currentDepth < maxDepth) {
            parent.children.push(entry)
          } else {
            // Flatten at max depth
            entries.push(entry)
          }
        }

        // Push to stack if this is a container (class, interface, etc.)
        if (['class', 'interface', 'struct', 'enum'].includes(pattern.kind)) {
          indentStack.push({ entry, indent })
        }

        break // Only match first pattern per line
      }
    }
  }

  // Final pass: assign UIDs with line numbers for dedup
  assignUids(entries, filePath)

  return entries
}

function findBlockEnd(lines: string[], startLine: number): number {
  let braceCount = 0
  let inBlock = false

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]
    for (const char of line) {
      if (char === '{') {
        braceCount++
        inBlock = true
      } else if (char === '}') {
        braceCount--
        if (inBlock && braceCount === 0) return i + 1
      }
    }
  }
  return lines.length
}

function assignUids(entries: OutlineEntry[], filePath: string): void {
  for (const entry of entries) {
    entry.uid = `${filePath}:${entry.kind}:${entry.name}:${entry.range[0]}`
    if (entry.children) assignUids(entry.children, filePath)
  }
}

// ─── Main Outline Function ───────────────────────────────────────────────────

export async function outlineTool(args: {
  path: string
  maxDepth?: number
  includeDocComments?: boolean
}): Promise<OutlineResult> {
  const { path: filePath, maxDepth = MAX_DEPTH_DEFAULT, includeDocComments: _includeDocComments = false } = args
  void _includeDocComments // TODO: implement doc comment extraction

  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    throw new Error(`Cannot read file: ${filePath}`)
  }

  const lineCount = content.split('\n').length
  const estimatedTokens = estimateTokens(content)

  // Check session dedup first
  if (sessionDedup.shownPaths.has(filePath)) {
    sessionDedup.hits++
    const tokensSaved = estimatedTokens
    sessionDedup.tokensSaved += tokensSaved
    return {
      mode: 'outline',
      path: filePath,
      lineCount,
      estimatedTokens: 0,
      dedupUid: filePath,
    }
  }

  sessionDedup.shownPaths.set(filePath, Date.now())
  sessionDedup.misses++

  // Decide: full vs outline mode
  const isLarge = lineCount > OUTLINE_LINE_THRESHOLD || estimatedTokens > OUTLINE_TOKEN_THRESHOLD

  if (!isLarge) {
    // Full mode: return content with line numbers
    return {
      mode: 'full',
      path: filePath,
      lineCount,
      estimatedTokens,
      content: addLineNumbers(content),
    }
  }

  // Outline mode: extract structure
  const entries = extractOutline(content, filePath, maxDepth)
  const outlineTokens = estimateOutlineTokens(entries)

  return {
    mode: 'outline',
    path: filePath,
    lineCount,
    estimatedTokens,
    estimatedTokensSaved: estimatedTokens - outlineTokens,
    entries,
    totalEntries: countEntries(entries),
    expandAvailable: true,
    dedupUid: computeDedupUid(filePath, entries),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countEntries(entries: OutlineEntry[]): number {
  let count = entries.length
  for (const e of entries) {
    if (e.children) count += countEntries(e.children)
  }
  return count
}

function addLineNumbers(content: string): string {
  const lines = content.split('\n')
  const width = String(lines.length).length
  return lines.map((line, i) => `${String(i + 1).padStart(width, ' ')}| ${line}`).join('\n')
}

function computeDedupUid(filePath: string, entries: OutlineEntry[]): string {
  // Simple dedup key: file path + first 5 entry names
  const names = entries.slice(0, 5).map((e) => `${e.kind}:${e.name}`).join('|')
  return `${filePath}#${names}`
}

// ─── Format Output ───────────────────────────────────────────────────────────

export function formatOutlineMarkdown(result: OutlineResult): string {
  if (result.mode === 'full') {
    return result.content ?? ''
  }

  // Check if this is a dedup marker (set by outlineTool on revisit)
  if (result.dedupUid && result.dedupUid === result.path) {
    const stats = getDedupStats()
    return `\`${result.path}\` — *[shown earlier — ${stats.hits} repeat visits, ~${stats.tokensSaved} tokens saved]*`
  }

  const lines: string[] = []
  const fileName = basename(result.path)

  lines.push(`# ${fileName} (${result.lineCount} lines, ~${result.estimatedTokens} tokens)  **[outline]**`)

  if (result.entries) {
    lines.push(formatEntries(result.entries, 0, result.path))
  }

  if (result.estimatedTokensSaved) {
    const savings = Math.round((result.estimatedTokensSaved / result.estimatedTokens) * 100)
    lines.push(`\n_[${result.totalEntries} entries — ~${result.estimatedTokensSaved} tokens saved (${savings}%)]_`)
  }

  return lines.join('\n')
}

function formatEntries(entries: OutlineEntry[], depth: number, filePath: string): string {
  const lines: string[] = []

  for (const entry of entries) {
    const indent = '  '.repeat(depth)
    const [start, end] = entry.range
    const rangeStr = start === end ? `[${start}]` : `[${start}-${end}]`

    // Access modifier
    const access = entry.accessModifier ? `(${entry.accessModifier}) ` : ''

    // Complexity indicator
    const complexity = entry.complexity ? ` [${entry.complexity}]` : ''

    // Build the line
    let line = `${indent}${rangeStr}  ${access}${entry.kind} **${entry.name}**`
    if (entry.signature) {
      line += `(${entry.signature.replace(/[{()}]/g, '').trim()})`
    }
    if (entry.returnType) {
      line += `: ${entry.returnType}`
    }
    line += complexity
    line += `  \`${entry.uid}\``

    lines.push(line)

    // Recurse for children
    if (entry.children && entry.children.length > 0) {
      lines.push(formatEntries(entry.children, depth + 1, filePath))
    }
  }

  return lines.join('\n')
}
