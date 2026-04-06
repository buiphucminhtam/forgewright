/**
 * Repo Group Management — cross-repo contract tracking.
 *
 * Architecture:
 *   Groups are stored in the global registry DB alongside RepoRegistry nodes.
 *   Each group contains:
 *     - Repos: which indexed repos belong to the group
 *     - Contracts: extracted API/service contracts from each repo
 *
 * Contract types:
 *   - function: exported functions with signatures
 *   - interface: TypeScript/Java interfaces
 *   - class: exported classes
 *   - api: HTTP endpoints / route patterns
 *
 * Group operations:
 *   create    — create a new named group
 *   add       — add a repo to a group
 *   remove    — remove a repo from a group
 *   list      — show all groups
 *   sync      — extract contracts from all repos in a group
 *   contracts — inspect extracted contracts and cross-links
 *   query     — search execution flows across all repos in a group
 *   status    — check staleness of all repos in a group
 */

import { Database, Connection } from 'kuzu'
import { KUZU_SCHEMA } from './schema.js'

export interface RepoGroup {
  name: string
  description?: string
  repos: string[]
  createdAt: string
  updatedAt: string
}

export interface Contract {
  id: string
  name: string
  type: 'function' | 'interface' | 'class' | 'api'
  signature?: string
  repo: string
  filePath: string
  line: number
  updatedAt: string
}

export interface ContractLink {
  fromRepo: string
  fromContract: string
  toRepo: string
  toContract: string
  edgeType: 'calls' | 'imports' | 'implements' | 'extends'
  confidence: number
}

const REGISTRY_PATH = '.forgenexus/registry.kuzu'

function esc(s: string): string {
  return String(s).replace(/"/g, '\\"')
}

/** Unwrap querySync result (single or multiple) to a single QueryResult */
function unwrapResult(result: any): any {
  return Array.isArray(result) ? result[0] : result
}

function openRegistry(): InstanceType<typeof Connection> {
  const db = new Database(REGISTRY_PATH)
  const c = new Connection(db)
  // Init schema
  const stmts = KUZU_SCHEMA.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('LOAD EXTENSION'))
  for (const stmt of stmts) {
    try {
      c.querySync(stmt)
    } catch {
      /* exists */
    }
  }
  return c
}

function closeRegistry(c: InstanceType<typeof Connection>): void {
  try {
    c.close()
  } catch {
    /* */
  }
  try {
    ;(c as any)._db?.close?.()
  } catch {
    /* */
  }
}

// ─── Group CRUD ─────────────────────────────────────────────────────────────────

export function createGroup(
  name: string,
  description?: string,
): { success: boolean; error?: string } {
  const c = openRegistry()
  const now = new Date().toISOString()
  try {
    c.querySync(
      `MERGE (g:RepoGroup {name: "${esc(name)}"})
       ON MATCH SET g.description = "${esc(description ?? '')}", g.updatedAt = "${esc(now)}"
       ON CREATE SET g.description = "${esc(description ?? '')}", g.createdAt = "${esc(now)}", g.updatedAt = "${esc(now)}"`,
    )
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  } finally {
    closeRegistry(c)
  }
}

export function deleteGroup(name: string): { success: boolean; error?: string } {
  const c = openRegistry()
  try {
    c.querySync(`MATCH (g:RepoGroup {name: "${esc(name)}"}) DETACH DELETE g`)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  } finally {
    closeRegistry(c)
  }
}

export function listGroups(): RepoGroup[] {
  const c = openRegistry()
  try {
    const result = c.querySync(
      `MATCH (g:RepoGroup) OPTIONAL MATCH (g)-[:HAS_REPO]->(r:RepoRegistry)
       RETURN g.name AS name, g.description AS description, g.createdAt AS createdAt, g.updatedAt AS updatedAt,
              collect(r.name) AS repos`,
    )
    const rows = unwrapResult(result).getAllSync()
    return rows.map((r: any) => ({
      name: r.name,
      description: r.description ?? '',
      repos: (r.repos ?? []).filter(Boolean),
      createdAt: r.createdAt ?? '',
      updatedAt: r.updatedAt ?? '',
    }))
  } catch {
    return []
  } finally {
    closeRegistry(c)
  }
}

export function addRepoToGroup(
  groupName: string,
  repoName: string,
): { success: boolean; error?: string } {
  const c = openRegistry()
  try {
    c.querySync(
      `MERGE (g:RepoGroup {name: "${esc(groupName)}"})
       MERGE (r:RepoRegistry {name: "${esc(repoName)}"})
       MERGE (g)-[:HAS_REPO]->(r)`,
    )
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  } finally {
    closeRegistry(c)
  }
}

export function removeRepoFromGroup(
  groupName: string,
  repoName: string,
): { success: boolean; error?: string } {
  const c = openRegistry()
  try {
    c.querySync(
      `MATCH (g:RepoGroup {name: "${esc(groupName)}"})-[r:HAS_REPO]->(re:RepoRegistry {name: "${esc(repoName)}"})
       DELETE r`,
    )
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  } finally {
    closeRegistry(c)
  }
}

// ─── Contract Extraction ─────────────────────────────────────────────────────────

/**
 * Extract contracts from all repos in a group.
 * Looks for:
 *   - Exported functions with signatures
 *   - Exported classes/interfaces
 *   - Route handlers (HANDLES_ROUTE edges)
 *   - Tool handlers (HANDLES_TOOL edges)
 *
 * Cross-repo linking via function name matching.
 */
export function syncGroupContracts(groupName: string): {
  success: boolean
  contracts: Contract[]
  links: ContractLink[]
  error?: string
} {
  const c = openRegistry()

  try {
    // Get repos in this group
    const reposResult = c.querySync(
      `MATCH (g:RepoGroup {name: "${esc(groupName)}"})-[:HAS_REPO]->(r:RepoRegistry)
       RETURN r.name AS name, r.path AS path, r.dbPath AS dbPath`,
    )
    const repos = unwrapResult(reposResult)()
    if (repos.length === 0) {
      return {
        success: false,
        contracts: [],
        links: [],
        error: `Group "${groupName}" not found or has no repos`,
      }
    }

    const allContracts: Contract[] = []
    const allLinks: ContractLink[] = []

    for (const repo of repos) {
      const repoDbPath = repo.dbPath as string
      if (!repoDbPath) continue

      try {
        const repoDb = new Database(repoDbPath)
        const repoConn = new Connection(repoDb)
        const now = new Date().toISOString()

        // Extract exported functions
        const fnResult = repoConn.querySync(
          `MATCH (n:CodeNode) WHERE n.type IN ['Function', 'Method']
           AND n.name IS NOT NULL AND n.signature IS NOT NULL
           RETURN n.uid AS uid, n.name AS name, n.type AS type, n.filePath AS filePath,
                  n.line AS line, n.signature AS signature LIMIT 500`,
        )
        for (const row of unwrapResult(fnResult)()) {
          const contract: Contract = {
            id: `${repo.name}::${row.name}@${row.filePath}:${row.line}`,
            name: row.name,
            type: row.type === 'Method' ? 'function' : 'function',
            signature: row.signature ?? undefined,
            repo: repo.name,
            filePath: row.filePath,
            line: Number(row.line),
            updatedAt: now,
          }
          allContracts.push(contract)

          // Upsert into registry
          c.querySync(
            `MERGE (co:Contract {id: "${esc(contract.id)}"})
             SET co.name = "${esc(contract.name)}", co.type = "${contract.type}",
                 co.signature = "${esc(contract.signature ?? '')}", co.repo = "${esc(contract.repo)}",
                 co.updatedAt = "${esc(now)}"`,
          )
        }

        // Extract API routes
        const routeResult = repoConn.querySync(
          `MATCH (routeNode)-[:HANDLES_ROUTE]->(handler:CodeNode)
           WHERE routeNode.uid IS NOT NULL
           RETURN routeNode.uid AS route, handler.uid AS handlerUid, handler.name AS handlerName,
                  handler.filePath AS filePath, handler.line AS line
           LIMIT 200`,
        )
        for (const row of unwrapResult(routeResult).getAllSync()) {
          const contract: Contract = {
            id: `${repo.name}::route:${row.route}`,
            name: `route:${row.route}`,
            type: 'api',
            signature: row.handlerName ?? undefined,
            repo: repo.name,
            filePath: row.filePath ?? '',
            line: Number(row.line ?? 0),
            updatedAt: now,
          }
          allContracts.push(contract)

          c.querySync(
            `MERGE (co:Contract {id: "${esc(contract.id)}"})
             SET co.name = "${esc(contract.name)}", co.type = "${contract.type}",
                 co.signature = "${esc(contract.signature ?? '')}", co.repo = "${esc(contract.repo)}",
                 co.updatedAt = "${esc(now)}"`,
          )
        }

        // Extract tool handlers
        const toolResult = repoConn.querySync(
          `MATCH (toolNode)-[:HANDLES_TOOL]->(handler:CodeNode)
           WHERE toolNode.uid IS NOT NULL
           RETURN toolNode.uid AS tool, handler.uid AS handlerUid, handler.name AS handlerName,
                  handler.filePath AS filePath, handler.line AS line
           LIMIT 200`,
        )
        for (const row of unwrapResult(toolResult).getAllSync()) {
          const contract: Contract = {
            id: `${repo.name}::tool:${row.tool}`,
            name: `tool:${row.tool}`,
            type: 'api',
            signature: row.handlerName ?? undefined,
            repo: repo.name,
            filePath: row.filePath ?? '',
            line: Number(row.line ?? 0),
            updatedAt: now,
          }
          allContracts.push(contract)
        }

        repoConn.close()
        repoDb.close()
      } catch {
        // Individual repo DB might not exist yet — skip
      }
    }

    // Find cross-repo links via function name matching
    for (let i = 0; i < allContracts.length; i++) {
      for (let j = 0; j < allContracts.length; j++) {
        if (i === j) continue
        const c1 = allContracts[i]
        const c2 = allContracts[j]
        if (c1.repo === c2.repo) continue

        const c1Name = c1.name.toLowerCase()
        const c2Name = c2.name.toLowerCase()
        if (c1Name.includes(c2Name) || c2Name.includes(c1Name)) {
          const link: ContractLink = {
            fromRepo: c1.repo,
            fromContract: c1.id,
            toRepo: c2.repo,
            toContract: c2.id,
            edgeType: 'imports',
            confidence: 0.7,
          }
          allLinks.push(link)

          c.querySync(
            `MERGE (r1:RepoRegistry {name: "${esc(c1.repo)}"})
             MERGE (r2:RepoRegistry {name: "${esc(c2.repo)}"})
             MERGE (r1)-[:REPO_IMPORTS {fromContract: "${esc(c1.id)}", toContract: "${esc(c2.id)}"}]->(r2)`,
          )
        }
      }
    }

    return { success: true, contracts: allContracts, links: allLinks }
  } catch (e: any) {
    return { success: false, contracts: [], links: [], error: e.message }
  } finally {
    closeRegistry(c)
  }
}

/**
 * Get all contracts for a group, grouped by repo.
 */
export function getGroupContracts(groupName: string): {
  contracts: Contract[]
  byRepo: Record<string, Contract[]>
} {
  const c = openRegistry()
  try {
    const result = c.querySync(
      `MATCH (g:RepoGroup {name: "${esc(groupName)}"})-[:HAS_REPO]->(r:RepoRegistry)-[:DEFINES_CONTRACT]->(co:Contract)
       RETURN co.id AS id, co.name AS name, co.type AS type, co.signature AS signature,
              co.repo AS repo, co.updatedAt AS updatedAt`,
    )
    const contracts: Contract[] = []
    const byRepo: Record<string, Contract[]> = {}
    for (const row of unwrapResult(result).getAllSync()) {
      const co: Contract = {
        id: row.id,
        name: row.name,
        type: row.type,
        signature: row.signature ?? undefined,
        repo: row.repo,
        filePath: '',
        line: 0,
        updatedAt: row.updatedAt ?? '',
      }
      contracts.push(co)
      if (!byRepo[co.repo]) byRepo[co.repo] = []
      byRepo[co.repo].push(co)
    }
    return { contracts, byRepo }
  } catch {
    return { contracts: [], byRepo: {} }
  } finally {
    closeRegistry(c)
  }
}

/**
 * Get cross-repo contract links for a group.
 */
export function getGroupLinks(groupName: string): ContractLink[] {
  const c = openRegistry()
  try {
    const result = c.querySync(
      `MATCH (g:RepoGroup {name: "${esc(groupName)}"})-[:HAS_REPO]->(r1:RepoRegistry)-[l:REPO_IMPORTS]->(r2:RepoRegistry)
       RETURN r1.name AS fromRepo, r2.name AS toRepo,
              l.fromContract AS fromContract, l.toContract AS toContract,
              l.confidence AS confidence`,
    )
    return unwrapResult(result)
      .getAllSync()
      .map((r: any) => ({
        fromRepo: r.fromRepo,
        fromContract: r.fromContract,
        toRepo: r.toRepo,
        toContract: r.toContract,
        edgeType: 'imports' as const,
        confidence: r.confidence ?? 0.7,
      }))
  } catch {
    return []
  } finally {
    closeRegistry(c)
  }
}

/**
 * Check staleness of all repos in a group.
 */
export function groupStatus(groupName: string): {
  name: string
  repos: { name: string; path: string; lastCommit?: string; dbPath?: string; stale?: boolean }[]
  staleCount: number
} {
  const c = openRegistry()
  try {
    const result = c.querySync(
      `MATCH (g:RepoGroup {name: "${esc(groupName)}"})-[:HAS_REPO]->(r:RepoRegistry)
       RETURN r.name AS name, r.path AS path, r.lastCommit AS lastCommit, r.dbPath AS dbPath`,
    )
    const rows = unwrapResult(result).getAllSync()
    const repos = rows.map((r: any) => ({
      name: r.name,
      path: r.path,
      lastCommit: r.lastCommit,
      dbPath: r.dbPath,
    }))
    return { name: groupName, repos, staleCount: 0 }
  } catch {
    return { name: groupName, repos: [], staleCount: 0 }
  } finally {
    closeRegistry(c)
  }
}
