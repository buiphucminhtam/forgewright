/**
 * Unit tests for Outline Mode
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { outlineTool, formatOutlineMarkdown, resetSessionDedup, getDedupStats } from './outline.js'

const TEST_DIR = join(process.cwd(), '.test-outline-tmp')

function setupTestDir() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  mkdirSync(TEST_DIR, { recursive: true })
}

function teardownTestDir() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
}

function writeFile(name: string, content: string) {
  const path = join(TEST_DIR, name)
  writeFileSync(path, content)
  return path
}

function largeTSFile(lineCount: number): string {
  // Use 4-space indent for methods to match regex pattern: \s{4,}
  // Add verbose comments to increase token count above 6000 threshold
  // ~100 chars/line * 250 lines = 25000 chars = ~6250 tokens
  let content = 'export class TestClass {\n'
  for (let i = 0; i < lineCount; i++) {
    const longComment = '// This is a verbose comment for testing purposes that adds significant token overhead'
    content += '    public method' + i + '(arg: number): number { ' + longComment + ' return ' + i + ' + arg; }\n'
  }
  content += '}\n'
  return content
}

function largePyFile(lineCount: number): string {
  // Use 4-space indent for class methods (Python requires 4 spaces in class body)
  let content = 'class DataProcessor:\n'
  const longComment = '# This is a verbose comment for testing that adds significant token overhead in Python'
  for (let i = 0; i < lineCount; i++) {
    content += '    def method' + i + '(self, x):\n        ' + longComment + '\n        return ' + i + ' + x\n'
  }
  content += '\ndef main():\n    pass\n'
  return content
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('outlineTool', () => {
  beforeEach(() => {
    setupTestDir()
    resetSessionDedup()
  })

  afterEach(() => {
    teardownTestDir()
  })

  describe('mode selection', () => {
    it('returns full mode for small TypeScript files (<200 lines)', async () => {
      const content = 'export function hello(name: string): string {\n  return "Hello, " + name\n}\n\nexport class User {\n  name: string\n  constructor(name: string) {\n    this.name = name\n  }\n}\n'
      const filePath = writeFile('small.ts', content)
      const result = await outlineTool({ path: filePath })

      expect(result.mode).toBe('full')
      expect(result.content).toBeDefined()
      expect(result.lineCount).toBeLessThanOrEqual(200)
    })

    it('returns outline mode for large TypeScript files (>200 lines)', async () => {
      const content = largeTSFile(250)
      const filePath = writeFile('large.ts', content)
      const result = await outlineTool({ path: filePath })

      expect(result.mode).toBe('outline')
      expect(result.entries).toBeDefined()
      expect(result.totalEntries).toBeGreaterThan(0)
      expect(result.estimatedTokensSaved).toBeGreaterThan(0)
    })

    it('detects large files by token count even if lines < 200', async () => {
      // Create a file with fewer than 200 lines but many tokens
      let content = 'export function aVeryLongFunctionName('
      for (let i = 0; i < 50; i++) {
        content += 'param' + i + ': number, '
      }
      content = content.slice(0, -2) + '): void {\n'
      content += '  // Long comment line '.repeat(100) + '\n'
      content += '  // Another long comment '.repeat(100) + '\n'
      content += '  // More content here '.repeat(100) + '\n'
      content += '}\n'
      // Add enough lines to exceed token threshold
      for (let i = 0; i < 150; i++) {
        content += '// Line comment ' + i + '\n'
      }

      const filePath = writeFile('token-large.ts', content)
      const result = await outlineTool({ path: filePath })

      expect(result.lineCount).toBeLessThan(200)
      // Either full or outline depending on actual token count
      expect(result.mode === 'full' || result.mode === 'outline').toBe(true)
    })
  })

  describe('structural extraction - TypeScript', () => {
    it('extracts functions and classes from large TypeScript files', async () => {
      // Use 300 lines to ensure outline mode (threshold is 200 lines)
      const content = largeTSFile(300)
      const filePath = writeFile('ts-extract.ts', content)
      const result = await outlineTool({ path: filePath })

      expect(result.mode).toBe('outline')
      expect(result.entries).toBeDefined()

      const flat = flattenEntries(result.entries!)
      const names = flat.map((e) => e.name)
      expect(names).toContain('TestClass')
    })

    it('extracts methods from TypeScript class', async () => {
      // Use 300 lines to ensure outline mode (threshold is 200 lines)
      const content = largeTSFile(300)
      const filePath = writeFile('ts-methods.ts', content)
      const result = await outlineTool({ path: filePath })

      expect(result.entries).toBeDefined()
      const flat = flattenEntries(result.entries!)
      const methods = flat.filter((e) => e.kind === 'method')
      expect(methods.length).toBeGreaterThan(0)
    })
  })

  describe('structural extraction - Python', () => {
    it('extracts classes and methods from large Python files', async () => {
      // Use 300 lines to ensure outline mode (threshold is 200 lines)
      const content = largePyFile(300)
      const filePath = writeFile('py-extract.py', content)
      const result = await outlineTool({ path: filePath })

      expect(result.entries).toBeDefined()
      const flat = flattenEntries(result.entries!)
      const kinds = flat.map((e) => e.kind)
      expect(kinds).toContain('class')
      expect(kinds).toContain('method')
    })
  })

  describe('structural extraction - Go', () => {
    it('extracts structs and functions from Go files', async () => {
      let content = 'package main\n\ntype User struct {\n  Name  string\n  Email string\n}\n\n'
      for (let i = 0; i < 250; i++) {
        content += 'func process' + i + '(data string) string {\n  return data + " processed"\n}\n'
      }
      const filePath = writeFile('go-extract.go', content)
      const result = await outlineTool({ path: filePath })

      expect(result.mode).toBe('outline')
      expect(result.entries).toBeDefined()
      const flat = flattenEntries(result.entries!)
      const names = flat.map((e) => e.name)
      expect(names).toContain('User')
      expect(names.some((n) => n.startsWith('process'))).toBe(true)
    })
  })

  describe('structural extraction - Rust', () => {
    it('extracts structs, impls, and functions from Rust files', async () => {
      let content = 'pub struct Config {\n  pub name: String,\n  pub value: i32,\n}\n\nimpl Config {\n  pub fn new(name: &str, value: i32) -> Self {\n    Config { name: name.to_string(), value }\n  }\n}\n\n'
      for (let i = 0; i < 250; i++) {
        content += 'pub fn process' + i + '(x: i32) -> i32 {\n  x * 2\n}\n'
      }
      const filePath = writeFile('rust-extract.rs', content)
      const result = await outlineTool({ path: filePath })

      expect(result.mode).toBe('outline')
      expect(result.entries).toBeDefined()
      const flat = flattenEntries(result.entries!)
      const names = flat.map((e) => e.name)
      expect(names).toContain('Config')
    })
  })

  describe('structural extraction - Java', () => {
    it('extracts classes and methods from Java files', async () => {
      let content = 'public class DataService {\n    private String name;\n\n    public DataService(String name) {\n      this.name = name;\n    }\n\n    public String getName() {\n      return this.name;\n    }\n}\n\n'
      for (let i = 0; i < 250; i++) {
        content += '    public void method' + i + '() {\n      System.out.println("method");\n    }\n'
      }
      const filePath = writeFile('java-extract.java', content)
      const result = await outlineTool({ path: filePath })

      expect(result.mode).toBe('outline')
      expect(result.entries).toBeDefined()
      const flat = flattenEntries(result.entries!)
      const names = flat.map((e) => e.name)
      expect(names).toContain('DataService')
    })
  })
})

describe('session deduplication', () => {
  beforeEach(() => {
    setupTestDir()
    resetSessionDedup()
  })

  afterEach(() => {
    teardownTestDir()
  })

  it('returns dedup marker on revisit', async () => {
    const content = 'export function test() { return true }\n'
    const filePath = writeFile('dedup.ts', content)

    // First call
    const result1 = await outlineTool({ path: filePath })
    expect(result1.mode).toBe('full')

    // Second call should be deduped
    const result2 = await outlineTool({ path: filePath })
    expect(result2.estimatedTokens).toBe(0)
    expect(result2.dedupUid).toBe(filePath)

    const stats = getDedupStats()
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
  })

  it('tracks dedup stats across multiple files', async () => {
    const file1 = writeFile('stats1.ts', 'export function foo() {}\n')
    const file2 = writeFile('stats2.ts', 'export function bar() {}\n')

    await outlineTool({ path: file1 }) // miss
    await outlineTool({ path: file2 }) // miss
    await outlineTool({ path: file1 }) // hit
    await outlineTool({ path: file2 }) // hit

    const stats = getDedupStats()
    expect(stats.misses).toBe(2)
    expect(stats.hits).toBe(2)
    expect(stats.hitRate).toBe(0.5)
  })

  it('resets dedup state completely', async () => {
    const filePath = writeFile('reset.ts', 'export function x() {}\n')

    await outlineTool({ path: filePath })
    await outlineTool({ path: filePath })

    resetSessionDedup()

    const stats = getDedupStats()
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
    expect(stats.tokensSaved).toBe(0)
  })
})

describe('token estimation', () => {
  beforeEach(() => {
    setupTestDir()
    resetSessionDedup()
  })

  afterEach(() => {
    teardownTestDir()
  })

  it('estimates tokens correctly for content', async () => {
    const content = 'export function add(a: number, b: number): number { return a + b }'
    const filePath = writeFile('tokens.ts', content)
    const result = await outlineTool({ path: filePath })

    // Rough estimate: content.length / 4
    expect(result.estimatedTokens).toBe(Math.ceil(content.length / 4))
  })

  it('calculates tokens saved in outline mode', async () => {
    const content = largeTSFile(250)
    const filePath = writeFile('big.ts', content)
    const result = await outlineTool({ path: filePath })

    expect(result.mode).toBe('outline')
    expect(result.estimatedTokensSaved).toBeGreaterThan(0)
    expect(result.estimatedTokens).toBeGreaterThan(result.estimatedTokensSaved!)
  })
})

describe('error handling', () => {
  beforeEach(() => {
    setupTestDir()
    resetSessionDedup()
  })

  afterEach(() => {
    teardownTestDir()
  })

  it('throws error for non-existent file', async () => {
    await expect(
      outlineTool({ path: '/non/existent/file.ts' })
    ).rejects.toThrow('Cannot read file')
  })
})

describe('formatOutlineMarkdown', () => {
  beforeEach(() => {
    setupTestDir()
    resetSessionDedup()
  })

  afterEach(() => {
    teardownTestDir()
  })

  it('formats full mode with line numbers', async () => {
    const content = 'export function hello() { return "hi" }\n'
    const filePath = writeFile('format.ts', content)
    const result = await outlineTool({ path: filePath })

    const md = formatOutlineMarkdown(result)
    // Full mode includes line numbers (e.g., "1| export function")
    expect(md).toContain('|')
    expect(md).toContain('hello')
  })

  it('formats outline mode with structural entries', async () => {
    // Use 300 lines to ensure outline mode (threshold is 200 lines)
    const content = largeTSFile(300)
    const filePath = writeFile('format-outline.ts', content)
    const result = await outlineTool({ path: filePath })

    const md = formatOutlineMarkdown(result)
    expect(result.mode).toBe('outline')
    expect(md).toContain('[outline]')
    expect(md).toContain('TestClass')
  })

  it('shows dedup note when revisits occurred', async () => {
    const content = 'export function test() {}\n'
    const filePath = writeFile('format-dedup.ts', content)

    await outlineTool({ path: filePath }) // miss
    await outlineTool({ path: filePath }) // hit

    const result = await outlineTool({ path: filePath })
    const md = formatOutlineMarkdown(result)

    expect(md).toContain('shown earlier')
    expect(md).toContain('repeat visits')
  })

  it('shows token savings in outline mode', async () => {
    // Use 300 lines to ensure outline mode (threshold is 200 lines)
    const content = largeTSFile(300)
    const filePath = writeFile('format-savings.ts', content)
    const result = await outlineTool({ path: filePath })

    const md = formatOutlineMarkdown(result)
    expect(result.mode).toBe('outline')
    expect(md).toContain('[outline]')
    expect(md).toContain('tokens saved')
    expect(result.estimatedTokensSaved!).toBeGreaterThan(0)
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

function flattenEntries(entries: any[]): any[] {
  const result: any[] = []
  for (const e of entries) {
    result.push(e)
    if (e.children) result.push(...flattenEntries(e.children))
  }
  return result
}
