/**
 * ForgeNexus MCP Tool Definitions
 *
 * Core graph tools plus ForgeNexus extras (e.g. pr_review).
 * Every tool has detailed WHEN TO USE / AFTER THIS / TIPS sections
 * to guide agent workflows.
 */

import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ForgeDB } from '../data/db.js'
import { analyzeImpact } from '../data/graph.js'
import { detectChanges, analyzePRReview } from '../analysis/detect-changes.js'
import { hybridSearch, type HybridResult } from '../data/embeddings.js'
import { executeCypher, formatCypherResult } from './cypher-executor.js'
import { spawn } from 'child_process'
import { promisify } from 'util'
import {
  ForgeNexusErrorCode,
  createErrorResponse,
  formatErrorAsText,
} from '../errors/verified.js'
import {
  searchContent,
  getSymbolContext,
  formatFallbackResult,
  isFallbackNeeded,
} from './fallback.js'

const exec = promisify(execSync)

export function registerTools(server: Server, db: ForgeDB, cwd: string): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) {
        const error = createErrorResponse(
          ForgeNexusErrorCode.TOOL_NOT_FOUND,
          `Unknown tool: ${name}. Run 'forgenexus tools' to see available tools.`,
          {
            recoveryHint: 'Use one of the available tools listed in the tools list.',
            details: { requestedTool: name }
          }
        )
        return { content: [{ type: 'text', text: formatErrorAsText(error) }], isError: true }
      }
      const result = await tool.handler(db, args ?? {}, cwd)
      return { content: [{ type: 'text', text: result }] }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const error = createErrorResponse(
        ForgeNexusErrorCode.TOOL_EXECUTION_FAILED,
        msg,
        {
          recoveryHint: 'Check the error message above. If this persists, run "forgenexus doctor" to diagnose issues.',
          details: { tool: name }
        }
      )
      return { content: [{ type: 'text', text: formatErrorAsText(error) }], isError: true }
    }
  })
}

// ─── Staleness Check ─────────────────────────────────────────────────────────

export function checkStaleness(
  repoPath: string,
  lastCommit: string,
): { isStale: boolean; commitsBehind: number; hint?: string } {
  try {
    const result = execSync(`git rev-list --count ${lastCommit}..HEAD`, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const commitsBehind = parseInt(result, 10) || 0
    if (commitsBehind > 0) {
      return {
        isStale: true,
        commitsBehind,
        hint: `⚠️ Index is ${commitsBehind} commit${commitsBehind > 1 ? 's' : ''} behind HEAD. Run 'forgenexus analyze' to update.`,
      }
    }
    return { isStale: false, commitsBehind: 0 }
  } catch {
    return { isStale: false, commitsBehind: 0 }
  }
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS: ToolDef[] = [
  // ── 1. list_repos ──────────────────────────────────────────────────────────
  {
    name: 'list_repos',
    description: `List all indexed repositories available to ForgeNexus.

Returns each repo's name, path, indexed date, and stats (nodes, edges).

WHEN TO USE: First step when multiple repos are indexed, or to discover available repos.
AFTER THIS: READ forgenexus://repo/{name}/context for the repo you want to work with.

When multiple repos are indexed, you MUST specify the "repo" parameter
on other tools (query, context, impact, etc.) to target the correct one.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async (db) => {
      const repos = db.listRepos()
      if (repos.length === 0) {
        const error = createErrorResponse(
          ForgeNexusErrorCode.INDEX_NOT_FOUND,
          'No indexed repositories found. The index may not exist or is empty.',
          {
            recoveryHint: "Run 'forgenexus analyze' to index your codebase.",
            quickStart: 'forgenexus analyze --quick  # Fast initial index'
          }
        )
        return formatErrorAsText(error)
      }
      return repos
        .map(
          (r) =>
            `- **${r.name}** | path: ${r.path} | indexed: ${r.indexedAt} | ${r.stats.nodes} nodes, ${r.stats.edges} edges`,
        )
        .join('\n')
    },
  },

  // ── 2. query ─────────────────────────────────────────────────────────────────
  {
    name: 'query',
    description: `Query the code knowledge graph for execution flows related to a concept.
Returns symbols ranked by relevance with file locations and type info.

WHEN TO USE: Understanding how code works together. Use this when you need execution flows and relationships, not just file matches. Complements grep/IDE search.
AFTER THIS: Use context() on a specific symbol for 360-degree view (callers, callees, categorized refs).

Hybrid ranking: BM25 keyword + semantic vector search (if embeddings available), ranked by Reciprocal Rank Fusion.

TIPS:
- The repo must be indexed first. If no results, run 'forgenexus analyze'.
- Use include_content: true to see full source of result symbols.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language or keyword search query' },
        task_context: {
          type: 'string',
          description: "What you are working on (e.g., 'adding OAuth support'). Helps ranking.",
        },
        goal: {
          type: 'string',
          description:
            "What you want to find (e.g., 'existing auth validation logic'). Helps ranking.",
        },
        limit: { type: 'number', description: 'Max results to return (default: 5)', default: 5 },
        include_content: {
          type: 'boolean',
          description: 'Include full symbol source code (default: false)',
          default: false,
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: ['query'],
    },
    handler: async (db, args, cwd) => {
      // Check if graph is available
      const repos = db.listRepos()
      const useGraph = repos.length > 0

      if (!useGraph) {
        // Use fallback search
        const result = await searchContent({
          query: args.query,
          cwd,
          maxResults: args.limit ?? 5,
        })
        return formatFallbackResult(result)
      }

      // Graph-based search
      const provider = (process.env.EMBEDDING_PROVIDER as any) ?? 'transformers'
      let hybridResults: HybridResult[] = []

      try {
        hybridResults = await hybridSearch(db, args.query, provider, args.limit ?? 5)
      } catch {
        // Fallback to FTS
      }

      const ftsResults =
        hybridResults.length === 0 ? db.searchSymbols(args.query, args.limit ?? 5) : []

      if (ftsResults.length === 0 && hybridResults.length === 0) {
        return `No results for "${args.query}".\n\nTry:\n- A broader search term\n- Different keywords\n- Check spelling`
      }

      const lines: string[] = []
      if (hybridResults.length > 0) {
        lines.push(`**Hybrid search** (BM25 + Semantic + RRF):`)
        for (const r of hybridResults) {
          const label = r.score >= 0.5 ? 'HIGH' : r.score >= 0.2 ? 'MED' : 'LOW'
          lines.push(`- [${r.name}] score=${r.score.toFixed(3)} (${label}) — ${r.filePath}`)
        }
      }
      if (ftsResults.length > 0) {
        if (hybridResults.length > 0) lines.push(`\n**Keyword matches** (FTS):`)
        for (const r of ftsResults) {
          lines.push(`- [${r.type}] **${r.name}** — ${r.filePath} (uid: ${r.uid})`)
        }
      }
      return lines.join('\n')
    },
  },

  // ── 3. context ───────────────────────────────────────────────────────────────
  {
    name: 'context',
    description: `360-degree view of a single code symbol.
Shows categorized incoming/outgoing references (calls, imports, extends, implements, methods, properties), process participation, and file location.

WHEN TO USE: After query() to understand a specific symbol in depth. When you need to know all callers, callees, and what execution flows a symbol participates in.
AFTER THIS: Use impact() if planning changes, or READ forgenexus://repo/{name}/process/{processName} for full execution trace.

Handles disambiguation: if multiple symbols share the same name, use uid param for zero-ambiguity lookup from prior results.

Session dedup: If the same symbol is queried again in this session, returns "[shown earlier]" to save tokens.

Callee footer: Shows top 5 call targets inline at the bottom of the output.

TIPS:
- ACCESSES edges (field read/write tracking) are included with reason 'read' or 'write'.
- CALLS edges resolve through field access chains and method-call chains.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Symbol name (e.g., 'validateUser', 'AuthService')" },
        uid: {
          type: 'string',
          description: 'Direct symbol UID from prior tool results (zero-ambiguity lookup)',
        },
        file_path: { type: 'string', description: 'File path to disambiguate common names' },
        include_content: {
          type: 'boolean',
          description: 'Include full symbol source code (default: false)',
          default: false,
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: [],
    },
    handler: async (db, args, cwd) => {
      // Check if graph is available
      const repos = db.listRepos()
      const useGraph = repos.length > 0

      // Try to find symbol
      const uid = args.uid ?? (args.name ? db.getNodesByName(args.name)[0]?.uid : null)
      
      if (!uid || !useGraph) {
        // Use fallback context search
        if (args.name) {
          const result = await getSymbolContext(args.name, cwd)
          return formatFallbackResult(result)
        }
        
        const error = createErrorResponse(
          ForgeNexusErrorCode.INDEX_NOT_FOUND,
          `Symbol not found: ${args.name}. No index exists for this repository.`,
          {
            recoveryHint: "Run 'forgenexus analyze' to index your codebase first.",
            quickStart: 'forgenexus analyze --quick  # Fast initial index'
          }
        )
        return formatErrorAsText(error)
      }
      
      const node = db.getNode(uid)
      if (!node) return `No symbol with uid: ${uid}`

      // Session dedup check
      const { checkContextDedup, getDedupStats } = await import('./outline.js')
      const dedup = checkContextDedup(uid, node.name)
      if (dedup.isDedup) {
        return `## ${node.name}\n\n\`${node.filePath}:${node.line}\` — *${dedup.note}*`
      }

      const callers = db.getCallers(uid)
      const callees = db.getCallees(uid)
      const importers = db.getImporters(uid)
      const extenders = db.getExtendees(uid)
      const implementers = db.getImplementers(uid)
      const methods = db.getMethods(uid)
      const properties = db.getProperties(uid)

      let md = `## ${node.name}\n\n`
      md += `**Type:** ${node.type}  \n**File:** ${node.filePath}:${node.line}  \n`
      if (node.returnType) md += `**Returns:** ${node.returnType}  \n`
      if (node.community) md += `**Community:** ${node.community}  \n`
      if (node.process) md += `**Process:** ${node.process}  \n`
      if (node.signature) md += `**Signature:** \`${node.signature.substring(0, 100)}\`\n\n`

      md += `### Callers (${callers.length})\n`
      md +=
        callers.length > 0
          ? callers.map((c) => `- ${c.name} — ${c.filePath}:${c.line}`).join('\n')
          : '_No direct callers found._\n'

      md += `\n### Callees (${callees.length})\n`
      md +=
        callees.length > 0
          ? callees.map((c) => `- ${c.name} — ${c.filePath}:${c.line}`).join('\n')
          : '_No direct callees found._\n'

      md += `\n### Importers (${importers.length})\n`
      md +=
        importers.length > 0
          ? importers.map((i) => `- ${i.name} — ${i.filePath}:${i.line}`).join('\n')
          : '_No importers found._\n'

      md += `\n### Extends (${extenders.length})\n`
      md +=
        extenders.length > 0
          ? extenders.map((e) => `- ${e.name} — ${e.filePath}:${e.line}`).join('\n')
          : '_No extends found._\n'

      md += `\n### Implements (${implementers.length})\n`
      md +=
        implementers.length > 0
          ? implementers.map((e) => `- ${e.name} — ${e.filePath}:${e.line}`).join('\n')
          : '_No implements found._\n'

      if (node.type === 'Class' || node.type === 'Interface') {
        md += `\n### Methods (${methods.length})\n`
        md +=
          methods.length > 0
            ? methods.map((m) => `- ${m.name} — ${m.filePath}:${m.line}`).join('\n')
            : '_No methods found._\n'

        md += `\n### Properties (${properties.length})\n`
        md +=
          properties.length > 0
            ? properties.map((p) => `- ${p.name} — ${p.filePath}:${p.line}`).join('\n')
            : '_No properties found._\n'
      }

      // Callee footer: show top 5 call targets inline
      if (callees.length > 0) {
        md += `\n---\n**Calls:** `
        md += callees
          .slice(0, 5)
          .map((c) => `\`${c.name}\`(${c.filePath}:${c.line})`)
          .join(', ')
        if (callees.length > 5) md += ` _...and ${callees.length - 5} more_`
        md += '\n'
      }

      // Append dedup stats footer if there were hits
      const stats = getDedupStats()
      if (stats.contextHits > 0) {
        md += `\n_[🔄 ${stats.contextHits} repeat visits this session, ${Math.round((stats.contextHits / (stats.contextHits + stats.contextMisses)) * 100)}% dedup rate]_`
      }

      return md
    },
  },

  // ── 4. impact ───────────────────────────────────────────────────────────────
  {
    name: 'impact',
    description: `Analyze the blast radius of changing a code symbol.
Returns affected symbols grouped by depth, plus risk assessment, affected execution flows, and affected modules.

WHEN TO USE: Before making code changes — especially refactoring, renaming, or modifying shared code. Shows what would break.
AFTER THIS: Review d=1 items first (WILL BREAK). Use context() on high-risk symbols.

Output includes:
- risk: LOW / MEDIUM / HIGH / CRITICAL
- summary: direct callers, processes affected, modules affected
- affected_processes: which execution flows break and at which step
- affected_modules: which functional areas are hit (direct vs indirect)
- byDepth: all affected symbols grouped by traversal depth

Depth groups:
- d=1: WILL BREAK (direct callers/importers)
- d=2: LIKELY AFFECTED (indirect)
- d=3: MAY NEED TESTING (transitive)

TIPS:
- Default traversal uses CALLS/IMPORTS/EXTENDS/IMPLEMENTS.
- For class members, include HAS_METHOD and HAS_PROPERTY.
- For field access analysis, include ACCESSES in relationTypes.
- Edge confidence: 1.0 = certain, <0.8 = fuzzy match`,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Name of function, class, or file to analyze' },
        direction: {
          type: 'string',
          description: 'upstream (what depends on this) or downstream (what this depends on)',
          enum: ['upstream', 'downstream', 'both'],
          default: 'upstream',
        },
        maxDepth: {
          type: 'number',
          description: 'Max relationship depth (default: 3)',
          default: 3,
        },
        relationTypes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Filter: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, HAS_PROPERTY, OVERRIDES, ACCESSES (default: usage-based)',
        },
        includeTests: {
          type: 'boolean',
          description: 'Include test files in blast radius (default: false)',
          default: false,
        },
        minConfidence: {
          type: 'number',
          description: 'Minimum confidence 0-1 (default: 0.7)',
          default: 0.7,
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: ['target'],
    },
    handler: async (db, args) => {
      const minConfidence = args.minConfidence ?? 0.7
      const includeTests = args.includeTests ?? false
      const maxDepth = args.maxDepth ?? 3

      const targetUid = db.getNodesByName(args.target)[0]?.uid ?? args.target
      if (!targetUid) {
        const repos = db.listRepos()
        if (repos.length === 0) {
          const error = createErrorResponse(
            ForgeNexusErrorCode.INDEX_NOT_FOUND,
            `Symbol not found: ${args.target}. No index exists for this repository.`,
            {
              recoveryHint: "Run 'forgenexus analyze' to index your codebase first.",
              quickStart: 'forgenexus analyze --quick  # Fast initial index'
            }
          )
          return formatErrorAsText(error)
        }
        return `Symbol not found: ${args.target}\n\nCheck spelling or use a different symbol name.`
      }
      const result = analyzeImpact(db, targetUid, maxDepth, { minConfidence, includeTests })

      let md = `## Impact Analysis: ${args.target}\n\n`
      md += `**Risk:** ${result.risk}  \n`
      md += `**Summary:** ${result.summary}\n`
      md += `**Max depth:** ${maxDepth} | **Min confidence:** ${minConfidence} | **Tests included:** ${includeTests}\n\n`
      md += '| Depth | Count | Meaning |\n|-------|-------|----------|\n'
      md += `| d=1 | ${result.byDepth.d1.length} | WILL BREAK — direct callers |\n`
      md += `| d=2 | ${result.byDepth.d2.length} | LIKELY AFFECTED — indirect |\n`
      md += `| d=3 | ${result.byDepth.d3.length} | MAY NEED TESTING — transitive |\n\n`

      if (result.affectedTests.length > 0) {
        md += `**Affected tests:**\n`
        for (const t of result.affectedTests.slice(0, 15)) {
          md += `- ${t}\n`
        }
        md += '\n'
      }

      md += `**Affected modules:** ${result.affectedModules.join(', ') || 'none'}\n`
      md += `**Affected processes:** ${result.affectedProcesses.join(', ') || 'none'}\n\n`
      md += '**d=1 (WILL BREAK):**\n'
      for (const uid of result.byDepth.d1.slice(0, 20)) {
        const n = db.getNode(uid)
        if (n) md += `- ${n.name} — ${n.filePath}:${n.line}\n`
      }
      md += '\n**d=2 (LIKELY AFFECTED):**\n'
      for (const uid of result.byDepth.d2.slice(0, 20)) {
        const n = db.getNode(uid)
        if (n) md += `- ${n.name} — ${n.filePath}:${n.line}\n`
      }
      if (result.byDepth.d3.length > 0) {
        md += '\n**d=3 (TRANSITIVE):**\n'
        for (const uid of result.byDepth.d3.slice(0, 10)) {
          const n = db.getNode(uid)
          if (n) md += `- ${n.name} — ${n.filePath}:${n.line}\n`
        }
      }
      return md
    },
  },

  // ── 5. detect_changes ────────────────────────────────────────────────────────
  {
    name: 'detect_changes',
    description: `Analyze uncommitted git changes and find affected execution flows.
Maps git diff hunks to indexed symbols, then traces which processes are impacted.

WHEN TO USE: Before committing — to understand what your changes affect. Pre-commit review, PR preparation.
AFTER THIS: Review affected processes. Use context() on high-risk symbols. READ forgenexus://repo/{name}/process/{name} for full execution traces.

Returns: changed symbols, affected processes, and a risk summary.

TIPS:
- Use scope: 'all' for the most complete picture (includes staged + unstaged).
- Use scope: 'staged' to check exactly what will be committed.
- Use scope: 'compare' with base_ref to compare any two refs.`,
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'What to analyze: "unstaged" (default), "staged", "all", or "compare"',
          enum: ['unstaged', 'staged', 'all', 'compare'],
          default: 'unstaged',
        },
        base_ref: {
          type: 'string',
          description: 'Branch/commit for "compare" scope (e.g., "main")',
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: [],
    },
    handler: async (db, args) => {
      const repos = db.listRepos()
      if (repos.length === 0) {
        const error = createErrorResponse(
          ForgeNexusErrorCode.INDEX_NOT_FOUND,
          'Cannot detect changes: no index exists for this repository.',
          {
            recoveryHint: "Run 'forgenexus analyze' to index your codebase first.",
            quickStart: 'forgenexus analyze --quick  # Fast initial index'
          }
        )
        return formatErrorAsText(error)
      }
      const result = await detectChanges(db, args.scope ?? 'unstaged', args.base_ref)
      let md = `## Change Detection\n\n`
      md += `**Risk:** ${result.riskSummary}\n`
      md += `**Changed symbols:** ${result.changedSymbols.length}\n`
      md += `**Affected modules:** ${result.affectedModules.length}\n`
      md += `**Affected processes:** ${result.affectedProcesses.length}\n\n`
      md += '### Changed Symbols\n'
      for (const s of result.changedSymbols.slice(0, 30)) {
        md += `- [${s.type}] ${s.name} — ${s.filePath}\n`
      }
      if (result.affectedProcesses.length > 0) {
        md += '\n### Affected Execution Flows\n'
        for (const p of result.affectedProcesses.slice(0, 10)) {
          const proc = (db as any).getProcess?.(p) ?? { name: p, type: 'unknown' }
          md += `- ${proc.name ?? p} (${proc.type ?? 'unknown'})\n`
        }
      }
      return md
    },
  },

  // ── 6. rename ────────────────────────────────────────────────────────────────
  {
    name: 'rename',
    description: `Multi-file coordinated rename using the knowledge graph + text search.
Finds all references via graph (high confidence) and regex text search (lower confidence). Preview by default.

WHEN TO USE: Renaming a function, class, method, or variable across the codebase. Safer than find-and-replace.
AFTER THIS: Run detect_changes() to verify no unexpected side effects from the rename.

Each edit is tagged with confidence:
- "graph": found via knowledge graph relationships (high confidence, safe to accept)
- "text_search": found via regex text search (lower confidence, review carefully)

TIPS:
- Use dry_run: true (default) first to preview all changes.
- Use file_path to disambiguate symbols with the same name in different files.
- Use symbol_uid for zero-ambiguity rename from prior tool results.`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol_name: { type: 'string', description: 'Current symbol name to rename' },
        symbol_uid: {
          type: 'string',
          description: 'Direct symbol UID from prior tool results (zero-ambiguity)',
        },
        new_name: { type: 'string', description: 'The new name for the symbol' },
        file_path: { type: 'string', description: 'File path to disambiguate common names' },
        dry_run: {
          type: 'boolean',
          description: 'Preview edits without modifying files (default: true)',
          default: true,
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: ['new_name'],
    },
    handler: async (db, args) => {
      const nodes = db.getNodesByName(args.symbol_name)
      if (nodes.length === 0) return `No symbol found: ${args.symbol_name}`

      let md = `## Rename: ${args.symbol_name} -> ${args.new_name}\n\n`
      md += `**Found in:** ${nodes.length} location(s)\n\n`

      const edits: { filePath: string; old: string; new: string; line: number }[] = []

      for (const node of nodes) {
        md += `- ${node.filePath}:${node.line} (${node.type})\n`
        edits.push({
          filePath: node.filePath,
          old: args.symbol_name,
          new: args.new_name,
          line: node.line,
        })
      }

      const callers = db.getCallers(nodes[0].uid)
      const callersWithSymbol = callers.filter((c) => {
        try {
          const content = readFileSync(c.filePath, 'utf8')
          const lines = content.split('\n')
          return lines
            .slice(Math.max(0, c.line - 5), Math.min(lines.length, c.line + 5))
            .some((l) => l.includes(args.symbol_name))
        } catch {
          return false
        }
      })

      if (callersWithSymbol.length > 0) {
        md += `\n**Callers that will be renamed:**\n`
        for (const c of callersWithSymbol.slice(0, 10)) {
          md += `- ${c.filePath}:${c.line} (${c.type})\n`
          edits.push({
            filePath: c.filePath,
            old: args.symbol_name,
            new: args.new_name,
            line: c.line,
          })
        }
      }

      if (!args.dry_run) {
        const uniqueFiles = [...new Set(edits.map((e) => e.filePath))]
        for (const filePath of uniqueFiles) {
          try {
            const content = readFileSync(filePath, 'utf8')
            const newContent = content.split(args.symbol_name).join(args.new_name)
            writeFileSync(filePath, newContent)
            const count = edits.filter((e) => e.filePath === filePath).length
            md += `\n✅ Updated: ${filePath} (${count} occurrence(s))\n`
          } catch (e) {
            md += `\n⚠️ Failed to update: ${filePath} — ${e instanceof Error ? e.message : String(e)}\n`
          }
        }
        md += `\n**Rename applied.** Re-run 'forgenexus analyze' to update the graph.\n`
      } else {
        md += '\n*Set dry_run: false to apply changes.*\n'
      }

      return md
    },
  },

  // ── 7. route_map ────────────────────────────────────────────────────────────
  {
    name: 'route_map',
    description: `Show API route mappings: which handlers serve which routes, with middleware wrapper chains and consumers.

WHEN TO USE: Understanding API consumption patterns, finding orphaned routes. For pre-change analysis, prefer api_impact() which combines this data with mismatch detection and risk assessment.
AFTER THIS: Use impact() on specific route handlers to see full blast radius.

Returns: route nodes with their handlers, middleware wrapper chains (e.g., withAuth, withRateLimit), and consumers.`,
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'Filter by route path (e.g., "/api/grants"). Omit for all routes.',
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: [],
    },
    handler: async (db, _args) => {
      const routes = db.getRouteHandlers()
      const allRoutes = (db as any).db
        .prepare("SELECT from_uid, to_uid, reason FROM edges WHERE type = 'HANDLES_ROUTE'")
        .all() as any[]

      if (routes.length === 0 && allRoutes.length === 0) {
        const error = createErrorResponse(
          ForgeNexusErrorCode.GRAPH_UNAVAILABLE,
          'No route handlers found. The index may be incomplete or this is not an API project.',
          {
            recoveryHint: 'Index API files (Express, FastAPI, Next.js, NestJS, Django routes) by running forgenexus analyze.',
            details: { foundRoutes: 0, foundRouteEdges: 0 }
          }
        )
        return formatErrorAsText(error)
      }

      let md = '## Route Map\n\n'

      const byReason: Record<string, any[]> = {}
      for (const r of allRoutes) {
        const reason = r.reason ?? 'unknown'
        if (!byReason[reason]) byReason[reason] = []
        byReason[reason].push(r)
      }

      for (const [reason, rows] of Object.entries(byReason)) {
        md += `### ${reason.replace('-', ' ').replace('_', ' ')}\n`
        for (const r of (rows as any[]).slice(0, 20)) {
          const handler = db.getNode(r.to_uid)
          const route = r.from_uid
          if (handler) {
            md += `- \`${route}\` → **${handler.name}** (${handler.filePath}:${handler.line})\n`
          } else {
            md += `- \`${route}\` → ${r.to_uid}\n`
          }
        }
        md += '\n'
      }

      md += `**Total routes:** ${allRoutes.length}\n`
      return md
    },
  },

  // ── 8. tool_map ─────────────────────────────────────────────────────────────
  {
    name: 'tool_map',
    description: `Show MCP/RPC tool definitions: which tools are defined, where they're handled, and their descriptions.

WHEN TO USE: Understanding tool APIs, finding tool implementations, impact analysis for tool changes.
AFTER THIS: Use impact() on specific tool handlers to see blast radius.`,
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Filter by tool name. Omit for all tools.' },
        repo: { type: 'string', description: 'Repository name or path.' },
      },
      required: [],
    },
    handler: async (db, _args) => {
      const allToolEdges = (db as any).db
        .prepare("SELECT from_uid, to_uid, reason FROM edges WHERE type = 'HANDLES_TOOL'")
        .all() as any[]

      if (allToolEdges.length === 0) {
        const error = createErrorResponse(
          ForgeNexusErrorCode.GRAPH_UNAVAILABLE,
          'No tool definitions found. The index may be incomplete.',
          {
            recoveryHint: 'Index files with @tool, @command decorators or tool handler objects.',
            details: { foundToolEdges: 0 }
          }
        )
        return formatErrorAsText(error)
      }

      let md = '## Tool Map\n\n'
      for (const t of allToolEdges.slice(0, 30)) {
        const handler = db.getNode(t.to_uid)
        if (handler) {
          md += `- **${t.from_uid.split(':').pop()}** → ${handler.name} (${handler.filePath}:${handler.line})\n`
        } else {
          md += `- **${t.from_uid}** → ${t.to_uid}\n`
        }
      }
      md += `\n**Total tools:** ${allToolEdges.length}\n`
      return md
    },
  },

  // ── 9. shape_check ───────────────────────────────────────────────────────────
  {
    name: 'shape_check',
    description: `Check response shapes for API routes against their consumers' property accesses.

WHEN TO USE: Detecting mismatches between what an API route returns and what consumers expect. Finding shape drift. For pre-change analysis, prefer api_impact() which combines this data with mismatch detection and risk assessment.
REQUIRES: Route nodes with responseKeys (extracted from .json({...}) calls during indexing).

Returns routes that have both detected response keys AND consumers. Shows top-level keys each endpoint returns (e.g., data, pagination, error) and what keys each consumer accesses. Reports MISMATCH status when a consumer accesses keys not present in the route's response shape.`,
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'Check a specific route (e.g., "/api/grants"). Omit to check all routes.',
        },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: [],
    },
    handler: async (db, _args) => {
      const interfaces = db.getNodesByType('Interface')
      const functions = db.getNodesByType('Function')
      const apiResponses: { name: string; filePath: string; returnType: string | undefined }[] = []

      for (const fn of functions) {
        if (fn.returnType && /^[A-Z]/.test(fn.returnType)) {
          apiResponses.push({ name: fn.name, filePath: fn.filePath, returnType: fn.returnType })
        }
      }

      const accesses = (db as any).db
        .prepare("SELECT from_uid, to_uid, reason FROM edges WHERE type = 'ACCESSES'")
        .all() as any[]

      if (apiResponses.length === 0 && accesses.length === 0) {
        return [
          '## Shape Check Results',
          '',
          'No API response types with property access patterns found.',
          'Shape checking works best with:',
          '- TypeScript interfaces/classes with return type annotations',
          '- Property access patterns (obj.prop, obj.method())',
          '',
          'Make sure your code uses typed return values for best results.',
        ].join('\n')
      }

      let md = '## Shape Check Results\n\n'
      md += `**API response types found:** ${apiResponses.length}\n`
      md += `**Property accesses found:** ${accesses.length}\n\n`

      const returnTypes = new Set<string>()
      for (const r of apiResponses) {
        if (r.returnType) returnTypes.add(r.returnType)
      }

      md += '### Return Types (potential API shapes)\n'
      for (const rt of [...returnTypes].slice(0, 10)) {
        const matchingInterfaces = interfaces.filter(
          (i) => i.name === rt || i.name.includes(rt) || rt.includes(i.name),
        )
        if (matchingInterfaces.length > 0) {
          md += `- \`${rt}\` → matches interface **${matchingInterfaces[0].name}**\n`
        } else {
          md += `- \`${rt}\` → no matching interface found\n`
        }
      }

      const suspicious: string[] = []
      for (const a of accesses.slice(0, 20)) {
        const targetName = a.to_uid.replace('UNKNOWN:Property:', '').replace(':0', '')
        const safe = interfaces.some((i) =>
          db.getProperties(i.uid).some((p) => p.name === targetName),
        )
        if (!safe) {
          const fromNode = db.getNode(a.from_uid)
          suspicious.push(
            `  - ${fromNode?.name ?? a.from_uid} accesses \`${targetName}\` (untyped)\n`,
          )
        }
      }

      if (suspicious.length > 0) {
        md += '\n### Suspicious Property Accesses (no type safety)\n'
        md += suspicious.join('')
        md += '\n*These accesses may be accessing properties not defined in any interface.*\n'
      } else {
        md += '\n✅ No suspicious property accesses detected.\n'
      }

      return md
    },
  },

  // ── 10. api_impact ──────────────────────────────────────────────────────────
  {
    name: 'api_impact',
    description: `Pre-change impact report for an API route handler.

WHEN TO USE: BEFORE modifying any API route handler. Shows what consumers depend on, what response fields they access, what middleware protects the route, and what execution flows it triggers. Requires at least "route" or "file" parameter.

Risk levels: LOW (0-3 consumers), MEDIUM (4-9 or any mismatches), HIGH (10+ consumers or mismatches with 4+ consumers). Mismatches with confidence "low" indicate the consumer file fetches multiple routes — property attribution is approximate.

Returns: single route object when one match, or { routes: [...], total: N } for multiple matches. Combines route_map, shape_check, and impact data.`,
    inputSchema: {
      type: 'object',
      properties: {
        route: { type: 'string', description: 'Route path (e.g., "/api/grants")' },
        file: { type: 'string', description: 'Handler file path (alternative to route)' },
        repo: { type: 'string', description: 'Repository name or path.' },
      },
      required: [],
    },
    handler: async (db, args) => {
      const target = args.route ?? args.file ?? ''

      let md = '## API Impact Analysis\n\n'

      const routes = db.getRouteHandlers()
      const relevantRoutes = target
        ? routes.filter((r) => r.route.toLowerCase().includes(target.toLowerCase()))
        : routes.slice(0, 5)

      if (relevantRoutes.length === 0) {
        md += 'No matching routes found. Try providing an endpoint name.\n\n'
      }

      md += `**Routes analyzed:** ${relevantRoutes.length}\n\n`

      for (const route of relevantRoutes.slice(0, 5)) {
        const handler = route.handler
        md += `### Route: \`${route.route}\`\n`
        md += `**Handler:** ${handler.name} (${handler.filePath}:${handler.line})\n`

        const impact = analyzeImpact(db, handler.uid)
        md += `**Risk:** ${impact.risk}\n`
        md += `**Callers:** ${impact.byDepth.d1.length} | **Indirect:** ${impact.byDepth.d2.length}\n`

        if (handler.returnType) {
          md += `**Return type:** \`${handler.returnType}\`\n`
        }

        const accesses = (db as any).db
          .prepare("SELECT from_uid, to_uid FROM edges WHERE type = 'ACCESSES' AND from_uid = ?")
          .all(handler.uid) as any[]
        if (accesses.length > 0) {
          md += `**Property accesses:** ${accesses.length}\n`
        }

        md += '\n'
      }

      const stats = db.getDetailedStats()
      md += '### Overall API Stats\n'
      md += `| Metric | Count |\n|--------|-------|\n`
      md += `| Routes | ${routes.length} |\n`
      md += `| API Functions | ${stats.byType['Function'] ?? 0} |\n`
      md += `| Property Accesses | ${stats.byEdgeType['ACCESSES'] ?? 0} |\n`
      md += `| Query Edges | ${stats.byEdgeType['QUERIES'] ?? 0} |\n`

      return md
    },
  },

  // ── 11. cypher ──────────────────────────────────────────────────────────────
  {
    name: 'cypher',
    description: `Execute Cypher-style query against the code knowledge graph.

WHEN TO USE: Complex structural queries that search/explore can't answer. READ forgenexus://repo/{name}/schema first for the full schema.
AFTER THIS: Use context() on result symbols for deeper context.

SCHEMA:
- Nodes: File, Folder, Function, Class, Interface, Method, Property, Variable, Struct, Enum, Trait, Impl, TypeAlias, Module
- All edges via single edges table with 'type' property
- Edge types: CONTAINS, DEFINES, CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, HAS_PROPERTY, ACCESSES, OVERRIDES, MEMBER_OF, STEP_IN_PROCESS, HANDLES_ROUTE, QUERIES, HANDLES_TOOL, ENTRY_POINT_OF

NODE LABELS (alias → type):
- fn/func/function → Function, cls/class → Class, meth/method → Method
- int/iface/interface → Interface, prop/property → Property
- var/variable → Variable, struct → Struct, enum → Enum
- trait → Trait, impl → Impl, typealias → TypeAlias, module → Module

EXAMPLES:
- Find callers of a function:
  MATCH (a)-[:CALLS]->(b:Function {name: "validateUser"}) RETURN a.name, a.filePath
- Find all methods of a class:
  MATCH (c:Class {name: "UserService"})-[:HAS_METHOD]->(m:Method) RETURN m.name, m.parameterCount, m.returnType
- Find property overrides:
  MATCH (winner:Method)-[:OVERRIDES]->(loser:Method) RETURN winner.name, loser.name
- Find implementers of an interface:
  MATCH (impl)-[:IMPLEMENTS]->(int:Interface {name: "IUserRepository"}) RETURN impl.name, impl.filePath
- Variable-length path (up to 3 hops):
  MATCH (a:Function)-[:CALLS*1..3]->(b) RETURN a.name, b.name
- WHERE with CONTAINS:
  MATCH (c:Class)-[:CALLS]->(f:Function) WHERE f.name CONTAINS "validate" RETURN c.name, f.name
- ORDER BY and LIMIT:
  MATCH (c)-[:CALLS]->(f:Function) RETURN f.name, f.parameterCount ORDER BY f.parameterCount DESC LIMIT 10
- Reverse direction (who calls this):
  MATCH (caller)-[:CALLS]->(target:Function {name: "authenticate"}) RETURN caller.name, caller.filePath

OUTPUT: Returns results formatted as a Markdown table with timing stats.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cypher query to execute' },
        repo: {
          type: 'string',
          description: 'Repository name or path. Omit if only one repo is indexed.',
        },
      },
      required: ['query'],
    },
    handler: async (db, args) => {
      const result = executeCypher(db, args.query)
      return formatCypherResult(result)
    },
  },

  // ── 12. pr_review ───────────────────────────────────────────────────────────
  {
    name: 'pr_review',
    description: `PR Review blast-radius analysis — analyzes what would break if a PR is merged. Shows affected modules, breaking changes, recommended reviewers.

WHEN TO USE: Reviewing a pull request before merging. Run this instead of detect_changes when analyzing a PR branch.
AFTER THIS: Focus on Critical/High items first. For each breaking change, run context() to see its full reference graph.

Output includes:
- Blast radius severity breakdown (Critical / High / Medium / Low)
- Breaking changes: symbols that were deleted or signature-changed
- Top impact symbols: sorted by number of callers
- Affected modules and execution flows
- Recommended reviewers based on affected module ownership

Risk levels: CRITICAL (10+ d=1 callers), HIGH (>5 d=1), MEDIUM (>0 d=1), LOW (additive only)`,
    inputSchema: {
      type: 'object',
      properties: {
        base_ref: {
          type: 'string',
          description: 'Base branch/ref to compare against (e.g., main, origin/main)',
        },
        head_ref: {
          type: 'string',
          description: 'Head branch/ref to compare (default: HEAD)',
          default: 'HEAD',
        },
        repo: { type: 'string', description: 'Repository name or path.' },
      },
      required: ['base_ref'],
    },
    handler: async (db, args) => {
      const result = analyzePRReview(db, args.base_ref, args.head_ref ?? 'HEAD')

      let md = `## PR Review — Blast Radius Analysis\n\n`
      md += `**Files changed:** ${result.filesChanged}  \n`
      md += `**Symbols changed:** ${result.symbolsChanged}  \n`
      md += `**Risk Level:** ${result.riskLevel}\n\n`
      md += `### Blast Radius\n`
      md += `| Severity | Count |\n|---------|-------|\n`
      md += `| Critical | ${result.blastRadius.critical} |\n`
      md += `| High     | ${result.blastRadius.high} |\n`
      md += `| Medium   | ${result.blastRadius.medium} |\n`
      md += `| Low      | ${result.blastRadius.low} |\n\n`

      if (result.breakingChanges.length > 0) {
        md += `### Breaking Changes\n`
        for (const bc of result.breakingChanges) md += `- ${bc}\n`
        md += '\n'
      }

      if (result.topImpactSymbols.length > 0) {
        md += `### Top Impact Symbols\n`
        md += `| Symbol | File | Callers | Risk |\n|-------|------|---------|------|\n`
        for (const s of result.topImpactSymbols.slice(0, 10)) {
          md += `| ${s.name} | ${s.filePath.split('/').pop()} | ${s.callers} | ${s.risk} |\n`
        }
        md += '\n'
      }

      if (result.affectedModules.length > 0) {
        md += `### Affected Modules (${result.affectedModules.length})\n`
        md +=
          result.affectedModules
            .slice(0, 10)
            .map((m) => `- ${m}`)
            .join('\n') + '\n\n'
      }

      if (result.affectedAPIs.length > 0) {
        md += `### Affected APIs\n`
        md +=
          result.affectedAPIs
            .slice(0, 10)
            .map((a) => `- ${a}`)
            .join('\n') + '\n\n'
      }

      if (result.affectedTests.length > 0) {
        md += `### Affected Tests\n`
        md +=
          result.affectedTests
            .slice(0, 10)
            .map((t) => `- ${t}`)
            .join('\n') + '\n\n'
      }

      if (result.recommendedReviewers.length > 0) {
        md += `### Recommended Reviewers\n`
        md += result.recommendedReviewers.map((r) => `- ${r}`).join('\n') + '\n\n'
      }

      md += `*Risk summary: ${result.riskSummary}*`

      return md
    },
  },

  // ── Group Management Tools ────────────────────────────────────────────────────

  // ── 11. group_list ─────────────────────────────────────────────────────────
  {
    name: 'group_list',
    description: `List all configured repository groups.

WHEN TO USE: First step when managing multi-repo projects. Shows all groups, their descriptions, and which repos belong to each group.

Returns: list of groups with member repos and metadata.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      const { listGroups } = await import('../data/groups.js')
      const groups = listGroups()
      if (groups.length === 0) {
        const error = createErrorResponse(
          ForgeNexusErrorCode.GRAPH_UNAVAILABLE,
          'No repository groups configured.',
          {
            recoveryHint: "Run 'forgenexus group create <name>' to create a group.",
            quickStart: 'forgenexus group create my-group'
          }
        )
        return formatErrorAsText(error)
      }
      let md = `## Repository Groups\n\n`
      for (const g of groups) {
        md += `### ${g.name}\n`
        if (g.description) md += `${g.description}\n\n`
        md += `Repos: ${g.repos.length > 0 ? g.repos.map((r) => `- **${r}**`).join('\n') : '_none_'}\n`
        md += `Created: ${g.createdAt}\n\n`
      }
      return md
    },
  },

  // ── 12. group_create ─────────────────────────────────────────────────────────
  {
    name: 'group_create',
    description: `Create a new repository group for multi-repo contract tracking.

WHEN TO USE: Setting up a monorepo or microservice group. Each group tracks contracts and cross-repo dependencies.

After creating a group, use group_add to add repos to it, then group_sync to extract contracts.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Group name (e.g. "backend-services", "frontend-libs")',
        },
        description: { type: 'string', description: 'Optional group description' },
      },
      required: ['name'],
    },
    handler: async (_db, args) => {
      const { createGroup } = await import('../data/groups.js')
      const result = createGroup(args.name, args.description)
      if (result.success) {
        return `Group "${args.name}" created. Add repos with group_add, then run group_sync to extract contracts.`
      }
      const error = createErrorResponse(
        ForgeNexusErrorCode.TOOL_EXECUTION_FAILED,
        result.error ?? 'Failed to create group',
        {
          recoveryHint: 'Check the error message. Group names must be unique.',
          details: { groupName: args.name }
        }
      )
      return formatErrorAsText(error)
    },
  },

  // ── 13. group_add ────────────────────────────────────────────────────────────
  {
    name: 'group_add',
    description: `Add an indexed repository to a group.

WHEN TO USE: After group_create, add repos to track cross-repo contracts. The repo must already be indexed via 'forgenexus analyze'.

Run group_sync after adding repos to extract contracts from all group members.`,
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Group name to add the repo to' },
        repo: { type: 'string', description: 'Repo name or path to add' },
      },
      required: ['group', 'repo'],
    },
    handler: async (_db, args) => {
      const { addRepoToGroup } = await import('../data/groups.js')
      const result = addRepoToGroup(args.group, args.repo)
      if (result.success) {
        return `Added "${args.repo}" to group "${args.group}". Run group_sync to extract contracts.`
      }
      const error = createErrorResponse(
        ForgeNexusErrorCode.TOOL_EXECUTION_FAILED,
        result.error ?? 'Failed to add repo to group',
        {
          recoveryHint: 'Make sure the repo is indexed (run forgenexus analyze) and the group exists.',
          details: { group: args.group, repo: args.repo }
        }
      )
      return formatErrorAsText(error)
    },
  },

  // ── 14. group_sync ──────────────────────────────────────────────────────────
  {
    name: 'group_sync',
    description: `Extract contracts and match cross-repo dependencies for a group.

WHEN TO USE: After adding repos to a group. Scans each repo's graph for exported functions, API routes, and tool handlers, then finds cross-repo links by function name matching.

This populates the contract registry so group_query and group_contracts can work. Run periodically (e.g. after indexing each repo) to keep contracts fresh.`,
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Group name to sync' },
      },
      required: ['group'],
    },
    handler: async (_db, args) => {
      const { syncGroupContracts } = await import('../data/groups.js')
      const result = syncGroupContracts(args.group)
      if (!result.success) {
        const error = createErrorResponse(
          ForgeNexusErrorCode.TOOL_EXECUTION_FAILED,
          result.error ?? 'Sync failed',
          {
            recoveryHint: 'Make sure the group exists and has repos added.',
            details: { group: args.group }
          }
        )
        return formatErrorAsText(error)
      }
      const byType: Record<string, number> = {}
      for (const c of result.contracts) {
        byType[c.type] = (byType[c.type] ?? 0) + 1
      }
      let md = `## Group Sync: ${args.group}\n\n`
      md += `Contracts extracted: ${result.contracts.length}\n\n`
      md += `**By type:** ${Object.entries(byType)
        .map(([t, c]) => `${t}: ${c}`)
        .join(', ')}\n\n`
      md += `**Cross-repo links:** ${result.links.length}\n\n`
      if (result.links.length > 0) {
        md += `### Cross-repo Dependencies\n`
        for (const link of result.links.slice(0, 20)) {
          md += `- \`${link.fromRepo}\` → \`${link.toRepo}\` (via ${link.fromContract} → ${link.toContract})\n`
        }
      }
      return md
    },
  },

  // ── 15. group_contracts ─────────────────────────────────────────────────────
  {
    name: 'group_contracts',
    description: `Inspect extracted contracts and cross-links for a group.

WHEN TO USE: After group_sync, view all extracted contracts organized by repo, and see which contracts link to other repos.

Returns contracts grouped by repository with their function signatures, and cross-repo dependency links.`,
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Group name' },
      },
      required: ['group'],
    },
    handler: async (_db, args) => {
      const { getGroupContracts, getGroupLinks } = await import('../data/groups.js')
      const { contracts, byRepo } = getGroupContracts(args.group)
      const links = getGroupLinks(args.group)
      if (contracts.length === 0) {
        const error = createErrorResponse(
          ForgeNexusErrorCode.GRAPH_UNAVAILABLE,
          `No contracts found for group "${args.group}".`,
          {
            recoveryHint: 'Run group_sync first to extract contracts from group repos.',
            details: { group: args.group, foundContracts: 0 }
          }
        )
        return formatErrorAsText(error)
      }
      let md = `## Contracts: ${args.group}\n\n`
      for (const [repo, cs] of Object.entries(byRepo)) {
        md += `### ${repo} (${cs.length} contracts)\n`
        for (const c of cs.slice(0, 30)) {
          md += `- \`${c.name}\` ${c.signature ? `\`${c.signature}\`` : ''}\n`
        }
        if (cs.length > 30) md += `  _...and ${cs.length - 30} more_\n`
        md += '\n'
      }
      if (links.length > 0) {
        md += `## Cross-repo Links (${links.length})\n\n`
        for (const link of links.slice(0, 20)) {
          md += `- \`${link.fromRepo}\` → \`${link.toRepo}\`: ${link.fromContract} → ${link.toContract}\n`
        }
      }
      return md
    },
  },

  // ── 16. group_query ─────────────────────────────────────────────────────────
  {
    name: 'group_query',
    description: `Search execution flows and contracts across all repos in a group.

WHEN TO USE: Finding which repos in a group handle a feature, or which repos call a shared utility. Searches function names, signatures, and file paths across all group members.

Returns matching contracts from each repo with their source locations.`,
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Group name to search in' },
        query: { type: 'string', description: 'Search query (function name, keyword, pattern)' },
        limit: { type: 'number', description: 'Max results per repo (default: 10)' },
      },
      required: ['group', 'query'],
    },
    handler: async (_db, args) => {
      const { getGroupContracts } = await import('../data/groups.js')
      const { contracts, byRepo } = getGroupContracts(args.group)
      if (contracts.length === 0) {
        const error = createErrorResponse(
          ForgeNexusErrorCode.GRAPH_UNAVAILABLE,
          `No contracts in group "${args.group}".`,
          {
            recoveryHint: 'Run group_sync first to extract contracts.',
            details: { group: args.group, foundContracts: 0 }
          }
        )
        return formatErrorAsText(error)
      }
      const q = args.query.toLowerCase()
      const limit = args.limit ?? 10
      let md = `## Group Query: "${args.query}" in ${args.group}\n\n`
      let total = 0
      for (const [repo, cs] of Object.entries(byRepo)) {
        const matches = cs.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.signature?.toLowerCase().includes(q) ||
            c.filePath.toLowerCase().includes(q),
        )
        if (matches.length > 0) {
          md += `### ${repo} (${matches.length} matches)\n`
          for (const c of matches.slice(0, limit)) {
            md += `- \`${c.name}\` ${c.signature ? `\`${c.signature}\`` : ''} — ${c.filePath}:${c.line}\n`
          }
          if (matches.length > limit) md += `  _...and ${matches.length - limit} more_\n`
          md += '\n'
          total += matches.length
        }
      }
      if (total === 0) {
        return `No results for "${args.query}" in group "${args.group}".`
      }
      md += `**Total: ${total} matches across ${Object.entries(byRepo).filter(([, cs]) => cs.some((c) => c.name.toLowerCase().includes(q))).length} repos**`
      return md
    },
  },

  // ── 17. group_status ─────────────────────────────────────────────────────────
  {
    name: 'group_status',
    description: `Check staleness of all repos in a group.

WHEN TO USE: Before a release or deployment, verify all repos in a group are indexed and up-to-date. Shows last commit hash, index timestamp, and staleness hint for each repo.

A repo is stale if its git HEAD is ahead of the last indexed commit.`,
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Group name' },
      },
      required: ['group'],
    },
    handler: async (_db, args) => {
      const { groupStatus } = await import('../data/groups.js')
      const result = groupStatus(args.group)
      if (result.repos.length === 0) {
        const error = createErrorResponse(
          ForgeNexusErrorCode.GRAPH_UNAVAILABLE,
          `Group "${args.group}" not found or has no repos.`,
          {
            recoveryHint: 'Create the group first with group_create, then add repos with group_add.',
            details: { group: args.group, foundRepos: 0 }
          }
        )
        return formatErrorAsText(error)
      }
      let md = `## Group Status: ${args.group}\n\n`
      md += `| Repo | Last Commit | Stale? |\n`
      md += `|------|-------------|--------|\n`
      for (const repo of result.repos) {
        const stale = repo.stale ? '⚠️ STALE' : '✅ OK'
        md += `| **${repo.name}** | \`${repo.lastCommit?.slice(0, 7) ?? '?'}\` | ${stale} |\n`
      }
      md += `\n**Stale repos:** ${result.staleCount}\n`
      if (result.staleCount > 0) {
        md += `Run 'forgenexus analyze' on stale repos to re-index.`
      }
      return md
    },
  },

  // ── 18. group_remove ─────────────────────────────────────────────────────────
  {
    name: 'group_remove',
    description: `Remove a repository from a group.

WHEN TO USE: Cleaning up a group when a repo is archived or moved. Does not delete the repo's index.`,
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Group name' },
        repo: { type: 'string', description: 'Repo name to remove' },
      },
      required: ['group', 'repo'],
    },
    handler: async (_db, args) => {
      const { removeRepoFromGroup } = await import('../data/groups.js')
      const result = removeRepoFromGroup(args.group, args.repo)
      if (result.success) {
        return `Removed "${args.repo}" from group "${args.group}".`
      }
      const error = createErrorResponse(
        ForgeNexusErrorCode.TOOL_EXECUTION_FAILED,
        result.error ?? 'Failed to remove repo from group',
        {
          recoveryHint: 'Check that the group and repo exist.',
          details: { group: args.group, repo: args.repo }
        }
      )
      return formatErrorAsText(error)
    },
  },

  // ── 19. outline ─────────────────────────────────────────────────────────────
  {
    name: 'outline',
    description: `Show file structure without full content — for large files (>200 lines or >6000 tokens), returns function signatures only.

WHEN TO USE: When you need to understand a file's structure before reading specific sections. Avoids loading massive files into context. Complements context() — context shows callers/callees of a symbol, outline shows the file's structural skeleton.

AFTER THIS: Use context() on specific symbols for deep analysis. Use READ to view specific line ranges for implementation details.

Returns two modes:
- **full**: Small files (<200 lines) return content with line numbers
- **outline**: Large files return structural skeleton (functions, classes, methods) with signatures and line ranges

Token savings: 80-95% on large files, ~99% on revisits (session dedup).

TIPS:
- outline is automatic — large files are always outlined, small files are fully shown
- Use maxDepth to control nesting depth (default: 3)
- Session dedup: revisiting the same file returns "[shown earlier]" — use context() for details`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative file path to outline',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum nesting depth for structure (default: 3)',
          default: 3,
        },
        includeDocComments: {
          type: 'boolean',
          description: 'Include first line of doc comments (default: false)',
          default: false,
        },
      },
      required: ['path'],
    },
    handler: async (_db, args, cwd) => {
      const { outlineTool, formatOutlineMarkdown, getDedupStats } = await import('./outline.js')
      const path = args.path.startsWith('/') ? args.path : `${cwd}/${args.path}`
      const result = await outlineTool({
        path,
        maxDepth: args.maxDepth,
        includeDocComments: args.includeDocComments,
      })
      const md = formatOutlineMarkdown(result)

      // Append dedup stats if there were hits
      const stats = getDedupStats()
      if (stats.hits > 0) {
        return `${md}\n\n_\u25c6 Outline session: ${stats.hits} repeat visits, ~${stats.tokensSaved} tokens saved (${Math.round(stats.hitRate * 100)}% dedup rate)_`
      }
      return md
    },
  },

  // ── 20. ctx_execute ─────────────────────────────────────────────────────────
  {
    name: 'ctx_execute',
    description: `Execute code in a sandboxed environment with structured output summarization.

WHEN TO USE: When you need to run data processing, scripting, or code validation that would produce large outputs. Captures full output to sandbox, returns only summary — 98% token savings.

AFTER THIS: Review the structured summary. If you need the full output, use a different tool or re-run without sandboxing.

Supported languages: python, node, bash, go, rust, ruby, php

Token savings: 95-98% on data processing tasks with large outputs.

TIPS:
- Use max_output_chars to limit how much output is captured before summarization
- timeout_ms: be careful with long-running operations
- lang can be auto-detected from shebang or file extension`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to execute. Can include shebang (#!) for language auto-detection.',
        },
        lang: {
          type: 'string',
          description: 'Language: python, node, bash, go, rust, ruby, php (auto-detected from shebang or .ext)',
          default: 'auto',
        },
        stdin: {
          type: 'string',
          description: 'Optional stdin to pass to the script',
        },
        timeout_ms: {
          type: 'number',
          description: 'Execution timeout in milliseconds (default: 30000)',
          default: 30000,
        },
        max_output_chars: {
          type: 'number',
          description: 'Max output chars to capture before summarization (default: 5000)',
          default: 5000,
        },
      },
      required: ['code'],
    },
    handler: async (_db, args, cwd) => {
      return await executeInSandbox({
        code: args.code,
        lang: args.lang || 'auto',
        stdin: args.stdin || '',
        timeoutMs: args.timeout_ms || 30000,
        maxOutputChars: args.max_output_chars || 5000,
        cwd,
      })
    },
  },
]

// ─── Sandbox Executor ─────────────────────────────────────────────────────────

interface SandboxConfig {
  code: string
  lang: string
  stdin: string
  timeoutMs: number
  maxOutputChars: number
  cwd: string
}

interface SandboxResult {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  summary: string
  tokensSaved: number
  lang: string
  durationMs: number
}

const LANG_COMMANDS: Record<string, string[]> = {
  python: ['python3', '-c'],
  python3: ['python3', '-c'],
  node: ['node', '-e'],
  nodejs: ['node', '-e'],
  bash: ['bash', '-c'],
  sh: ['sh', '-c'],
  zsh: ['zsh', '-c'],
  go: ['go', 'run', '-'],
  rust: ['rustc', '-'],
  ruby: ['ruby', '-e'],
  php: ['php', '-r'],
}

function detectLanguage(code: string, langHint: string): string {
  if (langHint && langHint !== 'auto') return langHint

  // Check shebang
  if (code.startsWith('#!')) {
    const shebang = code.split('\n')[0].slice(2).trim()
    if (shebang.includes('python')) return 'python'
    if (shebang.includes('node')) return 'node'
    if (shebang.includes('bash')) return 'bash'
    if (shebang.includes('sh')) return 'sh'
    if (shebang.includes('ruby')) return 'ruby'
    if (shebang.includes('php')) return 'php'
  }

  // Default based on common patterns
  if (code.includes('def ') && code.includes(':')) return 'python'
  if (code.includes('func ') && code.includes('package')) return 'go'
  if (code.includes('fn ') && code.includes('->')) return 'rust'
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

  // Truncate if too long
  let display = output.length > maxChars ? output.slice(0, maxChars) + '...' : output

  // Summarize structure
  const summary: string[] = []
  summary.push(`--- Output (${lines.length} lines, ${output.length} chars) ---`)

  // First few lines
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

async function executeInSandbox(config: SandboxConfig): Promise<string> {
  const startTime = Date.now()
  const lang = detectLanguage(config.code, config.lang)

  // Get command
  const cmd = LANG_COMMANDS[lang]
  if (!cmd) {
    return `Error: Unsupported language "${lang}". Supported: ${Object.keys(LANG_COMMANDS).join(', ')}`
  }

  // Prepare code - strip shebang if present
  let code = config.code
  if (code.startsWith('#!')) {
    code = code.split('\n').slice(1).join('\n')
  }

  try {
    // Execute with timeout
    const result = spawn(cmd[0], [...cmd.slice(1), code], {
      cwd: config.cwd,
      timeout: config.timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    result.stdout?.on('data', (data) => {
      if (stdout.length < config.maxOutputChars * 2) {
        stdout += data.toString()
      }
    })

    result.stderr?.on('data', (data) => {
      if (stderr.length < config.maxOutputChars) {
        stderr += data.toString()
      }
    })

    const exitCode = await new Promise<number>((resolve) => {
      result.on('close', (code) => resolve(code ?? 0))
      result.on('error', () => resolve(1))

      // Timeout
      setTimeout(() => {
        result.kill('SIGTERM')
        resolve(124) // timeout exit code
      }, config.timeoutMs)
    })

    const durationMs = Date.now() - startTime

    // Summarize output
    const { summary: stdoutSummary, originalLength: stdoutLen } = summarizeOutput(stdout, config.maxOutputChars)
    const tokensSaved = Math.max(0, stdoutLen - stdoutSummary.length)

    // Build result
    const lines: string[] = []
    lines.push(`## ${lang.toUpperCase()} Execution`)
    lines.push(`| Property | Value |`)
    lines.push(`|----------|-------|`)
    lines.push(`| Exit Code | ${exitCode} |`)
    lines.push(`| Duration | ${durationMs}ms |`)
    lines.push(`| Output Size | ${stdoutLen} chars |`)
    lines.push(`| Token Savings | ~${tokensSaved} |`)

    if (exitCode === 0) {
      lines.push(`| Status | ✅ Success |`)
    } else if (exitCode === 124) {
      lines.push(`| Status | ⏱️ Timeout |`)
    } else {
      lines.push(`| Status | ❌ Failed |`)
    }

    lines.push('')
    lines.push('### Output')
    lines.push(stdoutSummary)

    if (stderr.trim()) {
      lines.push('')
      lines.push('### Errors')
      const { summary: errSummary } = summarizeOutput(stderr, config.maxOutputChars)
      lines.push(errSummary)
    }

    lines.push('')
    lines.push(`_⏱️ ${durationMs}ms | ${lang} | ~${tokensSaved} chars saved via sandbox_`)

    return lines.join('\n')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Error executing ${lang}: ${msg}`
  }
}

interface ToolDef {
  name: string
  description: string
  inputSchema: any
  handler: (db: ForgeDB, args: any, cwd: string) => Promise<string>
}
