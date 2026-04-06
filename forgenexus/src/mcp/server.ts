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

  const db = new ForgeDB(dbPath)

  const server = new Server(
    { name: 'forgenexus', version: '1.0.0' },
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
  process.stdout.on('error', () => shutdown())
}
