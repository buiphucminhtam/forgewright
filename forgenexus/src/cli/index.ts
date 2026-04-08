#!/usr/bin/env node
/**
 * ForgeNexus CLI Entry Point
 *
 * Commands:
 *   forgenexus analyze [path]   Index a codebase
 *   forgenexus clean [path]     Remove index
 *   forgenexus status [path]    Check index status
 *   forgenexus wiki [path]      Generate documentation from graph (LLM)
 *   forgenexus mcp [path]       Start MCP server (stdio)
 *   forgenexus setup            Setup ForgeNexus in current project
 */

import { analyze } from './analyze.js'
import { clean } from './clean.js'
import { setup } from './setup.js'
import { status } from './status.js'
import { wiki } from './wiki.js'
import { startMCPServer } from '../mcp/server.js'
import { applyLegacyGitnexusEnv } from '../env-legacy.js'
import {
  listGroups,
  createGroup,
  addRepoToGroup,
  removeRepoFromGroup,
  syncGroupContracts,
  getGroupContracts,
  getGroupLinks,
} from '../data/groups.js'
import { analyzePRReview } from '../analysis/detect-changes.js'
import { analyzeImpact } from '../data/graph.js'
import { ForgeDB } from '../data/db.js'
import { defaultCodebaseDbPath } from '../paths.js'
import type { PRReviewResult } from '../analysis/detect-changes.js'
import type { ImpactResult } from '../types.js'

function extractFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag)
  if (idx === -1) return null
  return args[idx + 1] ?? null
}

function formatPRReviewOutput(result: PRReviewResult): string {
  const riskEmoji: Record<string, string> = {
    LOW: '🟢',
    MEDIUM: '🟡',
    HIGH: '🟠',
    CRITICAL: '🔴',
  }

  const emoji = riskEmoji[result.riskLevel] || '⚪'

  const lines: string[] = []

  lines.push(`## 🔍 PR Review — Blast Radius Analysis`)
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Files Changed | ${result.filesChanged} |`)
  lines.push(`| Symbols Changed | ${result.symbolsChanged} |`)
  lines.push(`| Risk Level | ${emoji} **${result.riskLevel}** |`)
  lines.push('')

  lines.push(`### Blast Radius`)
  lines.push(`| Severity | Count |`)
  lines.push(`|---------|-------|`)
  lines.push(`| Critical | ${result.blastRadius.critical} |`)
  lines.push(`| High | ${result.blastRadius.high} |`)
  lines.push(`| Medium | ${result.blastRadius.medium} |`)
  lines.push(`| Low | ${result.blastRadius.low} |`)
  lines.push('')

  if (result.breakingChanges.length > 0) {
    lines.push(`### ⚠️ Breaking Changes`)
    for (const bc of result.breakingChanges.slice(0, 10)) {
      lines.push(`- ${bc}`)
    }
    lines.push('')
  }

  if (result.topImpactSymbols.length > 0) {
    lines.push(`### Top Impact Symbols`)
    lines.push(`| Symbol | File | Callers | Risk |`)
    lines.push(`|-------|------|---------|------|`)
    for (const s of result.topImpactSymbols.slice(0, 10)) {
      const fileName = s.filePath.split('/').pop() || s.filePath
      lines.push(`| ${s.name} | ${fileName} | ${s.callers} | ${s.risk} |`)
    }
    lines.push('')
  }

  if (result.affectedModules.length > 0) {
    lines.push(`### Affected Modules`)
    lines.push(result.affectedModules.slice(0, 10).map((m) => `- ${m}`).join('\n'))
    lines.push('')
  }

  if (result.affectedProcesses.length > 0) {
    lines.push(`### Affected Processes`)
    lines.push(result.affectedProcesses.slice(0, 10).map((p) => `- ${p}`).join('\n'))
    lines.push('')
  }

  if (result.recommendedReviewers.length > 0) {
    lines.push(`### 👤 Recommended Reviewers`)
    lines.push(result.recommendedReviewers.map((r) => `- ${r}`).join('\n'))
    lines.push('')
  }

  lines.push(`---\n*Risk summary: ${result.riskSummary}*`)

  return lines.join('\n')
}

function formatImpactOutput(symbol: string, impact: ImpactResult): string {
  const riskEmoji: Record<string, string> = {
    LOW: '🟢',
    MEDIUM: '🟡',
    HIGH: '🟠',
    CRITICAL: '🔴',
  }

  const emoji = riskEmoji[impact.risk] || '⚪'

  const lines: string[] = []

  lines.push(`## 🔍 Impact Analysis: ${symbol}`)
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Risk | ${emoji} **${impact.risk}** |`)
  lines.push(`| Summary | ${impact.summary} |`)
  lines.push('')

  lines.push(`### Blast Radius by Depth`)
  lines.push(`| Depth | Count | Meaning |`)
  lines.push(`|-------|-------|----------|`)
  lines.push(`| d=1 | ${impact.byDepth.d1.length} | WILL BREAK — direct callers |`)
  lines.push(`| d=2 | ${impact.byDepth.d2.length} | LIKELY AFFECTED — indirect |`)
  lines.push(`| d=3 | ${impact.byDepth.d3.length} | MAY NEED TESTING — transitive |`)
  lines.push('')

  if (impact.affectedProcesses.length > 0) {
    lines.push(`### Affected Processes`)
    lines.push(impact.affectedProcesses.slice(0, 10).map((p: string) => `- ${p}`).join('\n'))
    lines.push('')
  }

  if (impact.affectedModules.length > 0) {
    lines.push(`### Affected Modules`)
    lines.push(impact.affectedModules.slice(0, 10).map((m: string) => `- ${m}`).join('\n'))
    lines.push('')
  }

  if (impact.affectedTests.length > 0) {
    lines.push(`### Affected Tests`)
    lines.push(impact.affectedTests.slice(0, 10).map((t: string) => `- ${t}`).join('\n'))
    lines.push('')
  }

  if (impact.byDepth.d1.length > 0) {
    lines.push(`### d=1 (WILL BREAK)`)
    for (const uid of impact.byDepth.d1.slice(0, 20)) {
      const node = null // Would need db access to get node details
      lines.push(`- \`${uid}\``)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function printHelp() {
  console.log(`
ForgeNexus v2.0.0 — Self-hosted code intelligence for AI agents

Usage:
  forgenexus <command> [options]

Commands:
  analyze [path]    Index a codebase (default: current directory)
  clean [path]     Remove index from a codebase
  status [path]    Show index status, stats, and staleness
  wiki [path]      Generate architecture documentation (requires LLM API key)
  mcp [path]       Start MCP server for AI tool access
  setup            Setup ForgeNexus in current project
  pr-review <base> [head]  Analyze PR blast radius (dry-run: --dry-run)
  impact <symbol> [options]  Analyze symbol impact (dry-run: --dry-run)
  group <cmd>       Multi-repo group management:
                     list, create <name> [desc],
                     add <group> <repo>, remove <group> <repo>,
                     sync <group>, contracts <group>, query <group> <term>,
                     status <group>

Analyze Options:
  --embeddings                 Generate vector embeddings for semantic search
  --embedding-provider <prov> Embedding provider (default: auto-detect):
                                 transformers  — Local ML inference, no API key (RECOMMENDED)
                                 ollama        — Local Ollama server, no API key
                                 openai        — OpenAI API (needs OPENAI_API_KEY)
                                 gemini        — Google Gemini API (needs GEMINI_API_KEY)
                                 huggingface   — HuggingFace API (needs HUGGINGFACE_TOKEN)
  --force, --full            Force full re-index (default: incremental)
  --no-incremental           Disable incremental indexing

Examples:
  forgenexus analyze                                    # Index current project (incremental)
  forgenexus analyze --embeddings                       # Index + semantic embeddings (auto: transformers)
  forgenexus analyze --embeddings --embedding-provider gemini        # Gemini embeddings
  forgenexus analyze --force                            # Full re-index from scratch
  forgenexus analyze --embeddings --embedding-provider ollama        # Ollama embeddings
  forgenexus status                                     # Check index health
  forgenexus setup                                      # Setup MCP + auto-reindex hook

Environment Variables (for specific providers):
  GEMINI_API_KEY       Google Gemini API key (or set in .env)
  OPENAI_API_KEY       OpenAI API key
  HUGGINGFACE_TOKEN    HuggingFace API token
  OLLAMA_HOST          Ollama server (default: http://localhost:11434)
  EMBEDDING_PROVIDER   Override auto-detection (e.g. "transformers")

MCP configuration (.cursor/mcp.json):
  {
    "mcpServers": {
      "forgenexus": {
        "command": "node",
        "args": ["node_modules/forgenexus/dist/cli/index.js", "mcp"]
      }
    }
  }
`)
}

async function main() {
  applyLegacyGitnexusEnv()
  const args = process.argv.slice(2)
  const cmd = args[0] ?? 'help'

  switch (cmd) {
    case 'analyze': {
      // args[1] is a path only if it doesn't start with '-' (not a flag)
      const rawPath = args[1] ?? ''
      const path = rawPath && !rawPath.startsWith('-') ? rawPath : process.cwd()
      const includeEmbeddings = args.includes('--embeddings')
      const embeddingProvider = extractFlag(args, '--embedding-provider') ?? undefined
      const incremental = !args.includes('--no-incremental')
      const force = args.includes('--force') || args.includes('--full')
      await analyze({ repoPath: path, includeEmbeddings, embeddingProvider, incremental, force })
      break
    }
    case 'clean': {
      const path = args[1] ?? process.cwd()
      clean({ repoPath: path })
      break
    }
    case 'status': {
      const path = args[1] ?? process.cwd()
      status({ repoPath: path })
      break
    }
    case 'wiki': {
      const path = args[1] ?? process.cwd()
      await wiki({ repoPath: path, args: args.slice(2) })
      break
    }
    case 'mcp': {
      await startMCPServer(args[1])
      break
    }
    case 'setup': {
      await setup()
      break
    }
    case 'group': {
      const groupCmd = args[1]
      const groupArgs = args.slice(2)
      if (groupCmd === 'list') {
        const groups = listGroups()
        if (groups.length === 0) {
          console.log('No groups. Create one: forgenexus group create <name>')
          break
        }
        for (const g of groups) {
          console.log(`## ${g.name}${g.description ? ` — ${g.description}` : ''}`)
          console.log(`  Repos: ${g.repos.join(', ') || '(none)'}`)
        }
        break
      }
      if (groupCmd === 'create') {
        const name = groupArgs[0]
        if (!name) {
          console.error('Usage: forgenexus group create <name> [description]')
          break
        }
        const desc = groupArgs.slice(1).join(' ')
        const result = createGroup(name, desc || undefined)
        console.log(result.success ? `Group "${name}" created.` : `Error: ${result.error}`)
        break
      }
      if (groupCmd === 'add') {
        const groupName = groupArgs[0]
        const repoName = groupArgs[1]
        const repoPath = groupArgs[2]
        if (!groupName || !repoName) {
          console.error('Usage: forgenexus group add <group> <repo> [path]')
          break
        }
        // Auto-detect path: use provided path, or current dir if repo name matches
        const resolvedPath = repoPath || (repoName === 'forgewright' ? process.cwd() : undefined)
        const result = addRepoToGroup(groupName, repoName, resolvedPath)
        console.log(
          result.success
            ? `Added "${repoName}" to "${groupName}"${resolvedPath ? ` (path: ${resolvedPath})` : ''}.`
            : `Error: ${result.error}`,
        )
        break
      }
      if (groupCmd === 'remove') {
        const groupName = groupArgs[0]
        const repoName = groupArgs[1]
        if (!groupName || !repoName) {
          console.error('Usage: forgenexus group remove <group> <repo>')
          break
        }
        const result = removeRepoFromGroup(groupName, repoName)
        console.log(
          result.success ? `Removed "${repoName}" from "${groupName}".` : `Error: ${result.error}`,
        )
        break
      }
      if (groupCmd === 'sync') {
        const groupName = groupArgs[0]
        if (!groupName) {
          console.error('Usage: forgenexus group sync <group>')
          break
        }
        const result = syncGroupContracts(groupName)
        if (!result.success) {
          console.error(`Sync failed: ${result.error}`)
          break
        }
        console.log(
          `Synced ${result.contracts.length} contracts and ${result.links.length} cross-repo links.`,
        )
        break
      }
      if (groupCmd === 'contracts') {
        const groupName = groupArgs[0]
        if (!groupName) {
          console.error('Usage: forgenexus group contracts <group>')
          break
        }
        const { contracts, byRepo } = getGroupContracts(groupName)
        if (contracts.length === 0) {
          console.log(`No contracts found for group "${groupName}". Run 'forgenexus group sync <group>' first.`)
          break
        }
        console.log(`## Contracts — ${groupName} (${contracts.length} total)\n`)
        for (const [repo, reposContracts] of Object.entries(byRepo)) {
          console.log(`### ${repo} (${reposContracts.length})`)
          for (const c of reposContracts) {
            const sig = c.signature ? ` — ${c.signature}` : ''
            console.log(`  - \`${c.name}\`${sig}`)
            console.log(`    type: ${c.type} · updated: ${c.updatedAt || 'unknown'}`)
          }
          console.log('')
        }
        // Cross-repo links
        const links = getGroupLinks(groupName)
        if (links.length > 0) {
          console.log(`### Cross-Repo Links (${links.length})`)
          for (const l of links) {
            console.log(`  - \`${l.fromRepo}\` → \`${l.toRepo}\` (${l.edgeType}, conf: ${l.confidence})`)
          }
        }
        break
      }
      if (groupCmd === 'status') {
        const groupName = groupArgs[0]
        if (!groupName) {
          console.error('Usage: forgenexus group status <group>')
          break
        }
        const { groupStatus } = await import('../data/groups.js')
        const result = groupStatus(groupName)
        if (result.repos.length === 0) {
          console.error(`Group "${groupName}" not found or has no repos.`)
          break
        }
        console.log(`## Group Status — ${groupName}\n`)
        console.log(`| Repo | Path | Last Commit | Stale? |`)
        console.log(`|------|------|-------------|--------|`)
        for (const repo of result.repos) {
          const path = repo.path || '(unknown)'
          const commit = repo.lastCommit ? repo.lastCommit.slice(0, 7) : 'none'
          const stale = repo.stale ? '⚠ YES' : repo.exists === false ? '❌ missing' : '✅ ok'
          console.log(`| ${repo.name} | ${path} | ${commit} | ${stale} |`)
        }
        console.log('')
        if (result.staleCount > 0) {
          console.log(`⚠ ${result.staleCount}/${result.repos.length} repos need re-indexing.`)
        } else {
          console.log('✅ All repos up to date.')
        }
        break
      }
      if (groupCmd === 'query') {
        const groupName = groupArgs[0]
        const term = groupArgs.slice(1).join(' ')
        if (!groupName || !term) {
          console.error('Usage: forgenexus group query <group> <search-term>')
          break
        }
        const { listGroups: lg, getGroupContracts: ggc } = await import('../data/groups.js')
        const groups = lg()
        const group = groups.find((g) => g.name === groupName)
        if (!group) {
          console.error(`Group "${groupName}" not found.`)
          break
        }
        if (group.repos.length === 0) {
          console.error(`Group "${groupName}" has no repos. Add repos first.`)
          break
        }
        const { contracts } = ggc(groupName)
        const lower = term.toLowerCase()
        const matches = contracts.filter(
          (c) =>
            c.name.toLowerCase().includes(lower) ||
            (c.signature && c.signature.toLowerCase().includes(lower)) ||
            c.type.includes(lower),
        )
        if (matches.length === 0) {
          console.log(`No contracts match "${term}" in group "${groupName}".`)
          break
        }
        console.log(`## Query Results — "${term}" in ${groupName} (${matches.length} matches)\n`)
        const byRepo: Record<string, typeof matches> = {}
        for (const c of matches) {
          if (!byRepo[c.repo]) byRepo[c.repo] = []
          byRepo[c.repo].push(c)
        }
        for (const [repo, repoContracts] of Object.entries(byRepo)) {
          console.log(`### ${repo} (${repoContracts.length})`)
          for (const c of repoContracts) {
            const sig = c.signature ? ` — ${c.signature}` : ''
            console.log(`  - \`${c.name}\`${sig}`)
          }
          console.log('')
        }
        break
      }
      console.error('Usage: forgenexus group <list|create|add|remove|sync|contracts|query|status> ...')
      console.error('       forgenexus group list')
      console.error('       forgenexus group create <name> [description]')
      console.error('       forgenexus group add <group> <repo>')
      console.error('       forgenexus group remove <group> <repo>')
      console.error('       forgenexus group sync <group>')
      console.error('       forgenexus group contracts <group>')
      console.error('       forgenexus group query <group> <term>')
      console.error('       forgenexus group status <group>')
      break
    }
    case 'pr-review': {
      const baseRef = args[1]
      const headRef = args[2] ?? 'HEAD'
      if (!baseRef) {
        console.error('Usage: forgenexus pr-review <base_ref> [head_ref]')
        console.error('  base_ref: Branch/commit to compare against (e.g., main, origin/main)')
        console.error('  head_ref: Branch/commit to compare (default: HEAD)')
        console.error('')
        console.error('Example: forgenexus pr-review main HEAD')
        break
      }

      const repoPath = args[3] && !args[3].startsWith('-') ? args[3] : process.cwd()
      const dryRun = args.includes('--dry-run') || args.includes('-n')
      const force = args.includes('--force')
      const dbPath = defaultCodebaseDbPath(repoPath)

      try {
        // Nếu có lock conflict và không dùng force, báo lỗi rõ ràng
        if (force) {
          console.warn('⚠️  Force mode: ignoring any database locks')
        }

        const db = new ForgeDB(dbPath)

        // Kiểm tra index tồn tại bằng cách đếm nodes
        const nodeCount = db.getNodeCount()
        if (nodeCount === 0) {
          console.error(`❌ No ForgeNexus index found in ${repoPath}`)
          console.error('   Run "forgenexus analyze" first to index the codebase.')
          db.close()
          process.exit(1)
        }

        console.log(`🔍 Running PR Review: ${baseRef} → ${headRef}`)
        console.log(`   Repo: ${repoPath}`)
        console.log(`   Indexed: ${nodeCount} nodes`)
        if (dryRun) console.log('   Mode: DRY RUN\n')

        const result = analyzePRReview(db, baseRef, headRef)

        console.log('\n' + formatPRReviewOutput(result))

        if (dryRun) {
          console.log('\n🔍 DRY RUN — No actual review was submitted.')
        }

        db.close()
      } catch (err) {
        console.error(`❌ Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
      break
    }
    case 'impact': {
      const symbol = args[1]
      if (!symbol) {
        console.error('Usage: forgenexus impact <symbol> [options]')
        console.error('  symbol: Name of function, class, or symbol to analyze')
        console.error('')
        console.error('Options:')
        console.error('  --direction <dir>  upstream (callers) or downstream (callees), default: upstream')
        console.error('  --depth <n>        Max depth, default: 3')
        console.error('  --dry-run, -n     Dry run mode')
        console.error('')
        console.error('Examples:')
        console.error('  forgenexus impact validateUser')
        console.error('  forgenexus impact PaymentService --direction upstream --depth 5')
        break
      }

      const repoPath = args[2] && !args[2].startsWith('-') ? args[2] : process.cwd()
      const dryRun = args.includes('--dry-run') || args.includes('-n')
      const direction = (extractFlag(args, '--direction') as 'upstream' | 'downstream') ?? 'upstream'
      const maxDepth = parseInt(extractFlag(args, '--depth') ?? '3', 10)
      const dbPath = defaultCodebaseDbPath(repoPath)

      try {
        const db = new ForgeDB(dbPath)

        const nodeCount = db.getNodeCount()
        if (nodeCount === 0) {
          console.error(`❌ No ForgeNexus index found in ${repoPath}`)
          console.error('   Run "forgenexus analyze" first to index the codebase.')
          db.close()
          process.exit(1)
        }

        console.log(`🔍 Analyzing impact for: ${symbol}`)
        console.log(`   Repo: ${repoPath}`)
        console.log(`   Direction: ${direction}`)
        console.log(`   Max depth: ${maxDepth}`)
        if (dryRun) console.log('   Mode: DRY RUN\n')

        const targetUid = db.getNodesByName(symbol)[0]?.uid ?? symbol
        const impact = analyzeImpact(db, targetUid, maxDepth, {
          minConfidence: 0.7,
          includeTests: false,
        })

        console.log('\n' + formatImpactOutput(symbol, impact))

        if (dryRun) {
          console.log('\n🔍 DRY RUN — No changes were suggested.')
        }

        db.close()
      } catch (err) {
        console.error(`❌ Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
      break
    }
    case 'help':
    default:
      printHelp()
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`)
  process.exit(1)
})
