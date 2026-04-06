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
} from '../data/groups.js'

function extractFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag)
  if (idx === -1) return null
  return args[idx + 1] ?? null
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
  group <cmd>       Multi-repo group management:
                     list, create <name> [desc],
                     add <group> <repo>, remove <group> <repo>, sync <group>

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
      const path = args[1] ?? process.cwd()
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
        if (!groupName || !repoName) {
          console.error('Usage: forgenexus group add <group> <repo>')
          break
        }
        const result = addRepoToGroup(groupName, repoName)
        console.log(
          result.success ? `Added "${repoName}" to "${groupName}".` : `Error: ${result.error}`,
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
      console.error('Usage: forgenexus group <list|create|add|remove|sync> ...')
      console.error('       forgenexus group list')
      console.error('       forgenexus group create <name> [description]')
      console.error('       forgenexus group add <group> <repo>')
      console.error('       forgenexus group remove <group> <repo>')
      console.error('       forgenexus group sync <group>')
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
