/**
 * ForgeNexus Claude Code PostToolUse Hook
 *
 * Purpose: Automatically re-index the codebase AFTER a git commit is detected.
 * Installed via: forgenexus setup (writes to ~/.claude/hooks/)
 *
 * Claude Code hook API (v0.3+):
 *   module.exports = { hooks: { async postToolUse({ tool, session, response }) {} } }
 */

import { execSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join, dirname } from 'path'

function findForgenexusRoot(): string | null {
  let cwd = process.cwd()
  for (let i = 0; i < 20; i++) {
    if (existsSync(join(cwd, '.forgenexus'))) return cwd
    const parent = dirname(cwd)
    if (parent === cwd) break
    cwd = parent
  }
  return null
}

function getLastCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', timeout: 5000 }).trim()
  } catch {
    return ''
  }
}

function runIncrementalIndex(cwd: string): void {
  const forgenexusBin = join(cwd, 'node_modules', '.bin', 'forgenexus')
  const useLocal = existsSync(forgenexusBin)
  const cmd = useLocal ? forgenexusBin : 'npx'
  const args = useLocal
    ? ['analyze', '--incremental']
    : ['-y', 'forgenexus@latest', 'analyze', '--incremental']

  const child = spawn(cmd, args, { cwd, stdio: 'pipe', detached: true })
  let stderr = ''
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
  child.on('exit', (code) => {
    if (code === 0) {
      console.error('[ForgeNexus] ✅ Incremental index updated after commit')
    } else {
      console.error(`[ForgeNexus] ⚠️ Incremental index failed: ${stderr}`)
    }
  })
  child.unref()
}

const COMMIT_TOOLS = [
  'bash', 'shell', 'Bash', 'Shell', 'cli',
  'run_command', 'Command', 'RunCommand',
]

export const hooks = {
  async postToolUse({ tool, response }: { tool: string; session: any; response: any }) {
    if (!COMMIT_TOOLS.includes(tool)) return

    const text = typeof response === 'string' ? response : JSON.stringify(response ?? '')
    const isCommit = /git (commit|push)/.test(text)
      || /commit [a-f0-9]{7,}/i.test(text)
      || /\[[a-zA-Z0-9_]+\s[a-f0-9]{7,}/.test(text)

    if (!isCommit) return

    const root = findForgenexusRoot()
    if (!root) return

    console.error('[ForgeNexus] 🔄 Git commit detected — running incremental index...')
    runIncrementalIndex(root)
  },
}
