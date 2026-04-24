#!/usr/bin/env node
/**
 * CLI Module - Main Entry Point
 *
 * Features:
 *   - Rich argument parsing
 *   - Multiple commands: analyze, evaluate, wiki, impact, query, mcp, status, clean, list
 *   - Global flags: --help, --version, --silent, --verbose
 *   - Per-command flags with validation
 */

import { evaluateCommand } from './evaluate.js';
import { wikiCommand } from './wiki.js';
import { impactCommand } from './impact.js';
import { queryCommand } from './query.js';
import { analyze } from './analyze.js';
import { startMCPServer } from '../mcp/server.js';
import { status } from './status.js';
import { clean } from './clean.js';
import { Registry } from '../data/registry.js';
import { ForgeDB } from '../data/db.js';

export { evaluateCommand } from './evaluate.js';
export { wikiCommand, generateWiki } from './wiki.js';
export { impactCommand, analyzeImpact } from './impact.js';
export { queryCommand, query } from './query.js';

const VERSION = '2.2.1'

interface GlobalFlags {
  silent?: boolean
  verbose?: boolean
  help?: boolean
  version?: boolean
}

function parseGlobalFlags(args: string[]): { flags: GlobalFlags; positional: string[] } {
  const flags: GlobalFlags = {}
  const positional: string[] = []

  for (const arg of args) {
    if (arg === '--silent' || arg === '-s') flags.silent = true
    else if (arg === '--verbose' || arg === '-v') flags.verbose = true
    else if (arg === '--help' || arg === '-h') flags.help = true
    else if (arg === '--version' || arg === '-V') flags.version = true
    else positional.push(arg)
  }

  return { flags, positional }
}

function printHelp() {
  console.log(`
\x1b[1mForgeNexus\x1b[0m \x1b[2mCode Intelligence Engine v${VERSION}\x1b[0m

\x1b[1mUsage:\x1b[0m
  forgenexus <command> [options]
  forgenexus [global options]

\x1b[1mGlobal Options:\x1b[0m
  -s, --silent     Suppress all output except errors
  -v, --verbose    Enable detailed logging
  -h, --help       Show this help message
  -V, --version    Show version number

\x1b[1mCommands:\x1b[0m
  \x1b[32manalyze\x1b[0m    Index a repository (default: current directory)
  \x1b[32mstatus\x1b[0m     Check index freshness and stats
  \x1b[32mlist\x1b[0m       List all indexed repositories
  \x1b[32mquery\x1b[0m      Search the code base
  \x1b[32mcontext\x1b[0m    Get symbol context (alias: c)
  \x1b[32mimpact\x1b[0m      Analyze blast radius (alias: i)
  \x1b[32mcypher\x1b[0m     Execute Cypher query
  \x1b[32mevaluate\x1b[0m    Run anti-hallucination evaluation
  \x1b[32mwiki\x1b[0m       Generate documentation
  \x1b[32mclean\x1b[0m      Delete index for a repository
  \x1b[32mmcp\x1b[0m        Start MCP server (stdio mode)

\x1b[1manalyze options:\x1b[0m
  --force          Force full re-index (skip incremental)
  --embeddings     Enable embedding generation
  --no-incremental Disable incremental mode
  --lang <lang>    Specify language (default: all)

\x1b[1mExamples:\x1b[0m
  forgenexus analyze                    # Index current directory
  forgenexus analyze /path/to/repo     # Index specific directory
  forgenexus analyze --force           # Force full rebuild
  forgenexus analyze --embeddings      # With semantic search
  forgenexus status                    # Check index
  forgenexus query "findUser"          # Search symbol
  forgenexus context getUser           # Get symbol details
  forgenexus impact validateToken       # Blast radius
  forgenexus mcp                       # Start MCP server
`)
}

function printVersion() {
  console.log(`forgenexus v${VERSION}`)
}

export async function main() {
  const args = process.argv.slice(2)
  const { flags, positional } = parseGlobalFlags(args)

  // Set global flags
  if (flags.silent) process.env.FORGENEXUS_SILENT = '1'
  if (flags.verbose) process.env.FORGENEXUS_VERBOSE = '1'

  // Handle global flags that exit
  if (flags.version) {
    printVersion()
    process.exit(0)
  }

  const command = positional[0]
  const commandArgs = positional.slice(1)

  if (!command || flags.help) {
    printHelp()
    process.exit(0)
  }

  try {
    switch (command) {
      case 'analyze': {
        // Parse analyze-specific flags
        const analyzeOpts: {
          repoPath: string
          force?: boolean
          includeEmbeddings?: boolean
          incremental?: boolean
          languages?: string[]
        } = { repoPath: process.cwd() }

        for (let i = 0; i < commandArgs.length; i++) {
          const arg = commandArgs[i]
          if (arg === '--force') analyzeOpts.force = true
          else if (arg === '--embeddings') analyzeOpts.includeEmbeddings = true
          else if (arg === '--no-incremental') analyzeOpts.incremental = false
          else if (arg === '--lang' && commandArgs[i + 1]) {
            analyzeOpts.languages = [commandArgs[++i]]
          }
          else if (!arg.startsWith('-')) {
            // It's a path
            analyzeOpts.repoPath = arg
          }
        }

        await analyze(analyzeOpts)
        break
      }

      case 'status': {
        const path = commandArgs[0] || process.cwd()
        status({ repoPath: path })
        break
      }

      case 'clean': {
        const path = commandArgs[0] || process.cwd()
        const force = commandArgs.includes('--force')
        if (!force) {
          console.log('This will delete the ForgeNexus index for:', path)
          console.log('Use --force to skip confirmation')
          process.exit(0)
        }
        clean({ repoPath: path })
        break
      }

      case 'list': {
        const registry = new Registry()
        const repos = registry.list()
        registry.close()

        if (repos.length === 0) {
          console.log('\n\x1b[1mIndexed Repositories\x1b[0m')
          console.log('\n  No indexed repositories found.')
          console.log('\n  Run \x1b[32mforgenexus analyze\x1b[0m to index a repository.')
          return
        }

        console.log(`\n\x1b[1mIndexed Repositories\x1b[0m (${repos.length})\n`)

        for (const repo of repos) {
          try {
            const db = new ForgeDB(repo.path + '/.forgenexus/codebase.db')
            const stats = db.getStats()
            db.close()

            const hasEmbeddings = repo.stats?.hasEmbeddings
            const embedStr = hasEmbeddings ? '\x1b[35m+vectors\x1b[0m' : ''

            console.log(`  \x1b[36m${repo.name}\x1b[0m ${embedStr}`)
            console.log(`    Path:    ${repo.path}`)
            console.log(`    Stats:   ${stats.nodes.toLocaleString()} nodes, ${stats.edges.toLocaleString()} edges`)
            console.log(`    Indexed: ${new Date(repo.indexedAt).toLocaleString()}`)
            if (repo.lastCommit) {
              console.log(`    Commit:  ${repo.lastCommit.substring(0, 7)}`)
            }
            console.log('')
          } catch {
            // Skip repos with broken indexes
          }
        }
        break
      }

      case 'evaluate':
        await evaluateCommand(commandArgs)
        break

      case 'wiki':
        await wikiCommand(commandArgs)
        break

      case 'impact':
      case 'i':
        await impactCommand(commandArgs)
        break

      case 'query':
        await queryCommand(commandArgs)
        break

      case 'context':
      case 'c':
        // context is handled by query with --context flag
        await queryCommand(['--context', ...commandArgs])
        break

      case 'cypher':
        // cypher is handled by query with raw query
        await queryCommand(['--cypher', ...commandArgs])
        break

      case 'mcp':
        await startMCPServer(process.cwd())
        break

      default:
        console.error(`\x1b[31mUnknown command: ${command}\x1b[0m`)
        console.error(`Run 'forgenexus --help' for usage.`)
        process.exit(1)
    }
  } catch (err: unknown) {
    if (!flags.silent) {
      console.error(`\x1b[31mFatal:\x1b[0m ${err instanceof Error ? err.message : String(err)}`)
    }
    process.exit(1)
  }
}

// Only execute auto-routing if invoked directly as script (or via bin)
const isCLI = process.argv[1] && (
  process.argv[1].endsWith('dist/cli/index.js') ||
  process.argv[1].includes('forgenexus')
)
if (isCLI) {
  main()
}
