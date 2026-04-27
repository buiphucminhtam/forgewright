/**
 * ForgeNexus MCP Server - stdio transport.
 * Exposes 12 tools + 8 resources + 2 prompts to AI agents.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ForgeDB } from '../data/db.js'
import { Registry } from '../data/registry.js'
import { registerTools } from './tools.js'
import { registerResources } from './resources.js'
import { registerPrompts } from './prompts.js'
import { ensureNexusDataDirMigrated, defaultCodebaseDbPath } from '../paths.js'
import { applyLegacyGitnexusEnv } from '../env-legacy.js'
import { checkStaleness } from '../data/freshness.js'

// Parse --verbose flag
const isVerbose = process.argv.includes('--verbose')
const isLegacyErrors = process.argv.includes('--legacy-errors')

export async function startMCPServer(repoPath?: string) {
  applyLegacyGitnexusEnv()
  const cwd = repoPath ?? process.cwd()
  const registry = new Registry()
  const repo = registry.getByPath(cwd)

  // Determine which DB to use: registry entry takes priority,
  // otherwise fall back to the standard path directly.
  const indexRoot = repo?.path ?? cwd
  ensureNexusDataDirMigrated(indexRoot)
  const dbPath = defaultCodebaseDbPath(indexRoot)

  // RC4 fix: always chdir to the target project root so that relative
  // path operations (e.g. git diff, git status) resolve correctly.
  // This prevents forgewright from accidentally operating on the wrong
  // project when running as a submodule inside another repo.
  if (process.cwd() !== indexRoot) {
    try {
      process.chdir(indexRoot)
    } catch (e: any) {
      console.error(`[ForgeNexus] Could not chdir to ${indexRoot}: ${e.message}`)
    }
  }

  const db = new ForgeDB(dbPath, { readOnly: true })

  // ── Startup Checks ────────────────────────────────────────────────────────
  await runStartupChecks(db, cwd, isVerbose)

  const server = new Server(
    { name: 'forgenexus', version: '2.3.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  )

  registerTools(server, db, cwd)
  registerResources(server, db, cwd)
  registerPrompts(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // ── Graceful shutdown helpers ─────────────────────────────────────────────
  let shuttingDown = false
  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return
    shuttingDown = true
    try {
      db.close()
    } catch {
      /* no-op */
    }
    try {
      await server.close()
    } catch {
      /* no-op */
    }
    process.exit(exitCode)
  }

  // Handle SIGINT / SIGTERM — graceful exit
  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))

  // Log uncaught crashes to stderr so they aren't silently lost.
  // uncaughtException is fatal — shut down.
  process.on('uncaughtException', (err) => {
    process.stderr.write(`[ForgeNexus] uncaughtException: ${err?.stack ?? err}\n`)
    shutdown(1)
  })
  // unhandledRejection is logged but kept non-fatal (availability-first:
  // killing the server for one missed catch is worse than logging it).
  process.on('unhandledRejection', (reason: unknown) => {
    process.stderr.write(`[ForgeNexus] unhandledRejection: ${(reason as any)?.stack ?? reason}\n`)
  })

  // Handle stdio errors — stdin close means the parent process is gone
  process.stdin.on('end', () => shutdown(0))
  process.stdin.on('error', () => shutdown())
  process.stdin.on('error', () => shutdown())
}

// ── Startup Checks ────────────────────────────────────────────────────────────

async function runStartupChecks(db: ForgeDB, cwd: string, verbose: boolean): Promise<void> {
  const checks: { name: string; status: 'ok' | 'warn' | 'error'; message: string }[] = []

  // Check 1: Index exists
  const repos = db.listRepos()
  if (repos.length === 0) {
    checks.push({
      name: 'Index',
      status: 'error',
      message: 'No index found. Run "forgenexus analyze" to index your codebase.',
    })
  } else {
    checks.push({
      name: 'Index',
      status: 'ok',
      message: `${repos.length} repo(s) indexed`,
    })
  }

  // Check 2: Staleness
  if (repos.length > 0) {
    try {
      const lastCommit = db.getMeta('last_commit')
      const indexedAt = db.getMeta('indexed_at')
      if (lastCommit && indexedAt) {
        const lastIndexed = new Date(indexedAt)
        const hoursSinceIndex = (Date.now() - lastIndexed.getTime()) / (1000 * 60 * 60)
        const staleness = hoursSinceIndex > 24 ? 'critical' : hoursSinceIndex > 6 ? 'stale' : 'fresh'
        
        if (staleness !== 'fresh') {
          checks.push({
            name: 'Freshness',
            status: staleness === 'critical' ? 'error' : 'warn',
            message: `${staleness} (${hoursSinceIndex.toFixed(1)}h ago)`,
          })
        } else {
          checks.push({
            name: 'Freshness',
            status: 'ok',
            message: `Fresh (${hoursSinceIndex.toFixed(1)}h ago)`,
          })
        }
      }
    } catch {
      // Silently skip staleness check if metadata is unavailable
    }
  }

  // Check 3: Lock file
  const lockPath = `${cwd}/.forgenexus/.lock`
  try {
    const { statSync } = await import('fs')
    const lockStat = statSync(lockPath)
    const lockAge = Date.now() - lockStat.mtimeMs
    const lockAgeMinutes = Math.floor(lockAge / 60000)
    
    if (lockAgeMinutes > 5) {
      checks.push({
        name: 'Lock File',
        status: 'warn',
        message: `Stale lock detected (${lockAgeMinutes}m old). Run "pkill -f forgenexus" if server is not running.`,
      })
    }
  } catch {
    // No lock file - good
  }

  // Print startup banner if verbose or if there are issues
  const hasIssues = checks.some(c => c.status !== 'ok')
  if (verbose || hasIssues) {
    const lines: string[] = []
    lines.push('')
    lines.push('╔════════════════════════════════════════════════════════════════╗')
    lines.push('║                   ForgeNexus v2.3.0                            ║')
    lines.push('╠════════════════════════════════════════════════════════════════╣')
    
    for (const check of checks) {
      const icon = check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✗'
      const statusText = check.status === 'ok' ? 'OK' : check.status === 'warn' ? 'WARN' : 'ERROR'
      lines.push(`║  ${check.name.padEnd(12)} ${icon} ${statusText.padEnd(7)} ${check.message.substring(0, 35).padEnd(35)} ║`)
    }
    
    lines.push('╠════════════════════════════════════════════════════════════════╣')
    
    if (hasIssues) {
      const errorCount = checks.filter(c => c.status === 'error').length
      const warnCount = checks.filter(c => c.status === 'warn').length
      lines.push(`║  Status: ${errorCount} error(s), ${warnCount} warning(s)                          ║`)
      lines.push('║  Run "forgenexus doctor" for detailed diagnostics.         ║')
    } else {
      lines.push('║  Status: All checks passed                                    ║')
    }
    
    lines.push('╚════════════════════════════════════════════════════════════════╝')
    lines.push('')
    
    process.stderr.write(lines.join('\n'))
  }
}

// Export for doctor command
export { runStartupChecks }
