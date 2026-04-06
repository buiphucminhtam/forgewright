/**
 * ForgeNexus Claude Code PreToolUse Hook
 *
 * Purpose: Enrich AI search context with knowledge graph data BEFORE the tool runs.
 * Installed via: forgenexus setup (writes to ~/.claude/hooks/)
 *
 * Claude Code hook API (v0.3+):
 *   module.exports = { hooks: { async preToolUse({ tool, session, response }) {} } }
 *
 * Tool enrichment:
 *   - grep/search  → find callers of matching functions from graph
 *   - read          → show symbols in the file from the graph
 *   - edit/Write    → warn about callers of symbols being edited
 */

import { spawnSync } from 'child_process'

function execForgenexus(args: string[]): string {
  // Try local node_modules first, then global
  const localBin = './node_modules/.bin/forgenexus'
  const cmd = localBin
  const result = spawnSync(cmd, args, { encoding: 'utf8', timeout: 5000 })
  return result.stdout + result.stderr
}

function findGraphContext(toolName: string, toolArgs: Record<string, any>): string | null {
  try {
    // ── grep / search: find callers of matching functions ─────────────────
    if (toolName === 'grep' || toolName === 'grep_search' || toolName === 'search') {
      const query = toolArgs.query ?? ''
      if (!query || query.length < 2) return null

      // Query the graph for symbols matching the search
      const raw = execForgenexus(['search', query])
      if (!raw || raw.trim().length === 0) return null

      return `\n⚡ ForgeNexus graph context:\n${raw.slice(0, 1000)}\n`
    }

    // ── read: inject module context ─────────────────────────────────────────
    if (toolName === 'read' || toolName === 'Read') {
      const filePath = toolArgs.file_path ?? toolArgs.path ?? ''
      if (!filePath) return null

      // Use Claude Code's own file symbols if available, otherwise skip
      // (can't easily get graph data from CLI here without repo path)
      return null
    }

    // ── edit / Write: warn about callers ────────────────────────────────────
    if (toolName === 'edit' || toolName === 'Write' || toolName === 'write') {
      const filePath = toolArgs.file_path ?? toolArgs.path ?? ''
      if (!filePath) return null

      return `\n⚡ ForgeNexus: before editing, run \`forgenexus impact --target <symbol>\` to check callers.\n`
    }

    return null
  } catch {
    return null
  }
}

export const hooks = {
  async preToolUse({ tool, toolArgs, session }: { tool: string; toolArgs: Record<string, any>; session: any }) {
    const ctx = findGraphContext(tool, toolArgs)
    if (!ctx) return

    try {
      session.addContext?.(ctx)
    } catch {
      // Hook API not available
    }
  },
}
