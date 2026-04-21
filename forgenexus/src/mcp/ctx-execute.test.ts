import { describe, it, expect, beforeEach } from 'vitest'
import { spawn } from 'child_process'

// Test helper: execute sandbox directly for unit testing
const LANG_COMMANDS: Record<string, string[]> = {
  python: ['python3', '-c'],
  node: ['node', '-e'],
  bash: ['bash', '-c'],
}

function detectLanguage(code: string, langHint: string): string {
  if (langHint && langHint !== 'auto') return langHint

  if (code.startsWith('#!')) {
    const shebang = code.split('\n')[0].slice(2).trim()
    if (shebang.includes('python')) return 'python'
    if (shebang.includes('node')) return 'node'
    if (shebang.includes('bash')) return 'bash'
  }

  if (code.includes('def ') && code.includes(':')) return 'python'
  if (code.includes('console.log') || code.includes('const ') || code.includes('let ')) return 'node'

  return 'bash'
}

function summarizeOutput(output: string, maxChars: number): { summary: string; originalLength: number } {
  const lines = output.split('\n').filter(l => l.trim())
  const originalLength = output.length

  if (lines.length === 0) {
    return { summary: '(no output)', originalLength }
  }

  if (lines.length <= 3 && output.length <= maxChars) {
    return { summary: output, originalLength }
  }

  let display = output.length > maxChars ? output.slice(0, maxChars) + '...' : output

  const summary: string[] = []
  summary.push(`--- Output (${lines.length} lines, ${output.length} chars) ---`)

  if (lines.length > 5) {
    summary.push('First lines:')
    lines.slice(0, 3).forEach(l => summary.push(`  ${l.slice(0, 200)}`))
    summary.push('  ...')
    summary.push(`Last ${Math.min(3, lines.length - 5)} lines:`)
    lines.slice(-Math.min(3, lines.length - 5)).forEach(l => summary.push(`  ${l.slice(0, 200)}`))
  } else {
    summary.push('Output:')
    lines.forEach(l => summary.push(`  ${l.slice(0, 200)}`))
  }

  if (output.length > maxChars) {
    summary.push(`[Truncated ${output.length - maxChars} chars]`)
  }

  return { summary: summary.join('\n'), originalLength }
}

async function executeCode(code: string, lang: string = 'auto'): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const detectedLang = detectLanguage(code, lang)
  const cmd = LANG_COMMANDS[detectedLang] || ['bash', '-c']

  // Strip shebang if present
  let execCode = code
  if (code.startsWith('#!')) {
    execCode = code.split('\n').slice(1).join('\n')
  }

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const proc = spawn(cmd[0], [...cmd.slice(1), execCode], { timeout: 5000 })

    proc.stdout?.on('data', (data) => { stdout += data.toString() })
    proc.stderr?.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }))
    proc.on('error', () => resolve({ stdout, stderr, exitCode: 1 }))
  })
}

describe('ctx_execute: detectLanguage', () => {
  it('should use explicit lang hint', () => {
    expect(detectLanguage('code', 'python')).toBe('python')
    expect(detectLanguage('code', 'node')).toBe('node')
    expect(detectLanguage('code', 'bash')).toBe('bash')
  })

  it('should detect python shebang', () => {
    expect(detectLanguage('#!/usr/bin/env python\nprint("hi")', 'auto')).toBe('python')
    expect(detectLanguage('#!/usr/bin/python3\nprint("hi")', 'auto')).toBe('python')
  })

  it('should detect node shebang', () => {
    expect(detectLanguage('#!/usr/bin/env node\nconsole.log("hi")', 'auto')).toBe('node')
  })

  it('should detect bash shebang', () => {
    expect(detectLanguage('#!/bin/bash\necho hi', 'auto')).toBe('bash')
  })

  it('should detect python from syntax', () => {
    expect(detectLanguage('def foo():\n    pass', 'auto')).toBe('python')
    // class detection is ambiguous, skip
  })

  it('should detect node from syntax', () => {
    expect(detectLanguage('console.log("hi")', 'auto')).toBe('node')
    expect(detectLanguage('const x = 1', 'auto')).toBe('node')
    expect(detectLanguage('let y = 2', 'auto')).toBe('node')
  })

  it('should default to bash', () => {
    expect(detectLanguage('random text', 'auto')).toBe('bash')
  })
})

describe('ctx_execute: summarizeOutput', () => {
  it('should return "(no output)" for empty output', () => {
    const { summary } = summarizeOutput('', 100)
    expect(summary).toBe('(no output)')
  })

  it('should return full output if small', () => {
    const output = 'hello\nworld'
    const { summary } = summarizeOutput(output, 100)
    expect(summary).toBe('hello\nworld')
  })

  it('should truncate long output', () => {
    const output = 'x'.repeat(300)
    const { summary } = summarizeOutput(output, 100)
    // Should contain truncation indicator
    expect(summary).toContain('[Truncated')
  })

  it('should show first and last lines for long multi-line output', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n')
    const { summary } = summarizeOutput(lines, 50)
    expect(summary).toContain('First lines:')
    expect(summary).toContain('line 0')
    expect(summary).toContain('line 9')
    expect(summary).toContain('--- Output')
  })

  it('should handle short multi-line output', () => {
    const lines = 'a\nb\nc'
    const { summary } = summarizeOutput(lines, 100)
    // Short output (<=3 lines, <=maxChars) returns full output
    expect(summary).toBe('a\nb\nc')
  })

  it('should calculate original length correctly', () => {
    const output = 'hello world'
    const { originalLength } = summarizeOutput(output, 100)
    expect(originalLength).toBe(11)
  })
})

describe('ctx_execute: executeCode', () => {
  it('should execute python code', async () => {
    const result = await executeCode('print("hello from python")', 'python')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('hello from python')
  })

  it('should execute node code', async () => {
    const result = await executeCode('console.log("hello from node")', 'node')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('hello from node')
  })

  it('should execute bash code', async () => {
    const result = await executeCode('echo "hello from bash"', 'bash')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('hello from bash')
  })

  it('should handle code with shebang', async () => {
    const result = await executeCode('#!/usr/bin/env python\nprint("shebang works")')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('shebang works')
  })

  it('should capture stderr', async () => {
    const result = await executeCode('import sys; sys.stderr.write("error\\n")', 'python')
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain('error')
  })

  it('should return non-zero exit code on error', async () => {
    const result = await executeCode('exit 1', 'bash')
    expect(result.exitCode).not.toBe(0)
  })

  it('should handle arithmetic', async () => {
    const result = await executeCode('print(2 + 2)', 'python')
    expect(result.stdout).toContain('4')
  })

  it('should handle multi-line code', async () => {
    const code = `for i in range(3):
    print(i)`
    const result = await executeCode(code, 'python')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('0')
    expect(result.stdout).toContain('2')
  })
})

describe('ctx_execute: sandbox isolation', () => {
  it('should not persist variables between executions', async () => {
    await executeCode('x = 1', 'python')
    const result = await executeCode('print(x)', 'python')
    // x should not be defined
    expect(result.exitCode).not.toBe(0)
  })
})
