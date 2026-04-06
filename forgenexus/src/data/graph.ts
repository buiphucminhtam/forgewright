/**
 * Graph operations: community detection, process tracing, impact analysis.
 * Supports all edge types: CALLS, IMPORTS, HAS_METHOD, HAS_PROPERTY, ACCESSES,
 * EXTENDS, IMPLEMENTS, OVERRIDES, HANDLES_ROUTE, HANDLES_TOOL, QUERIES.
 */

import type { ForgeDB } from './db.js'
import type { Community, Process, ImpactResult, ImpactByDepth } from '../types.js'

interface AdjEntry {
  uid: string
  degree: number
  neighbors: Set<string>
}

// All edge types used for community detection
const COMMUNITY_EDGE_TYPES: import('../types.js').EdgeType[] = [
  'CALLS',
  'IMPORTS',
  'HAS_METHOD',
  'HAS_PROPERTY',
  'ACCESSES',
  'EXTENDS',
  'IMPLEMENTS',
  'STEP_IN_PROCESS',
  'MEMBER_OF',
]

// Edge types for impact analysis (all relationships that propagate change)
const IMPACT_EDGE_TYPES: import('../types.js').EdgeType[] = [
  'CALLS',
  'IMPORTS',
  'HAS_METHOD',
  'HAS_PROPERTY',
  'ACCESSES',
  'EXTENDS',
  'IMPLEMENTS',
  'OVERRIDES',
  'STEP_IN_PROCESS',
  'MEMBER_OF',
]

/**
 * Leiden-inspired community detection.
 * Greedy modularity optimization with label propagation.
 * Uses CALLS, IMPORTS, HAS_METHOD, HAS_PROPERTY, ACCESSES, EXTENDS, IMPLEMENTS edges.
 */
export function detectCommunities(db: ForgeDB): Community[] {
  const placeholders = COMMUNITY_EDGE_TYPES.map(() => '?').join(', ')
  const allEdges = (db as any).db
    .prepare(`SELECT from_uid, to_uid, type FROM edges WHERE type IN (${placeholders})`)
    .all(...COMMUNITY_EDGE_TYPES) as any[]

  const adj = new Map<string, AdjEntry>()
  for (const e of allEdges) {
    for (const pair of [
      [e.from_uid, e.to_uid],
      [e.to_uid, e.from_uid],
    ]) {
      if (!adj.has(pair[0])) {
        adj.set(pair[0], { uid: pair[0], degree: 0, neighbors: new Set() })
      }
      const entry = adj.get(pair[0])!
      entry.neighbors.add(pair[1])
      entry.degree++
    }
  }

  if (adj.size === 0) return []

  const nodes = Array.from(adj.keys())
  const comms = new Map<string, string>()
  nodes.forEach((n, i) => comms.set(n, `comm_${i}`))

  // Greedy modularity pass
  for (let iter = 0; iter < 30; iter++) {
    let improved = false
    for (const node of nodes) {
      const neighbors = adj.get(node)?.neighbors ?? new Set()
      if (neighbors.size === 0) continue
      const cur = comms.get(node)!
      let best = cur
      let bestGain = 0

      for (const nb of neighbors) {
        const nbComm = comms.get(nb)!
        if (nbComm === cur) continue
        // Simple gain: number of intra-community neighbors
        let intra = 0
        for (const n2 of neighbors) {
          if (comms.get(n2) === nbComm) intra++
        }
        if (intra > bestGain) {
          bestGain = intra
          best = nbComm
          improved = true
        }
      }
      if (best !== cur) comms.set(node, best)
    }
    if (!improved) break
  }

  // Build community objects
  const nodeNames = new Map<string, string>()
  for (const row of (db as any).db.prepare('SELECT uid, name FROM nodes').all() as any[]) {
    nodeNames.set(row.uid, row.name)
  }

  const commMap = new Map<string, Set<string>>()
  for (const [uid, cid] of comms) {
    if (!commMap.has(cid)) commMap.set(cid, new Set())
    commMap.get(cid)!.add(uid)
  }

  const result: Community[] = []
  for (const [cid, members] of commMap) {
    const names = [...members]
      .map((u) => nodeNames.get(u) ?? '')
      .filter(Boolean)
      .slice(0, 8)
    const keywords = [...new Set(names)].slice(0, 5)

    // Cohesion: edge density within community
    let internal = 0
    const memberList = [...members]
    for (const e of allEdges) {
      if (members.has(e.from_uid) && members.has(e.to_uid)) internal++
    }
    const maxEdges = (memberList.length * (memberList.length - 1)) / 2
    const cohesion = maxEdges > 0 ? internal / maxEdges : 0

    result.push({
      id: cid,
      name: keywords.join('-').toLowerCase() || cid,
      nodes: [...members],
      keywords,
      description: `${members.size} symbols: ${keywords.join(', ')}`,
      cohesion: Math.round(cohesion * 100) / 100,
      symbolCount: members.size,
    })
  }

  return result.sort((a, b) => b.cohesion - a.cohesion)
}

/**
 * Trace execution flows from entry points.
 * Entry points are functions with names like handler, route, command, main, controller, endpoint.
 */
export function traceProcesses(db: ForgeDB): Process[] {
  const entries = (db as any).db
    .prepare(
      `
    SELECT uid, name, file_path, type FROM nodes
    WHERE type IN ('Function', 'Method')
      AND (name LIKE '%handler%' OR name LIKE '%route%'
       OR name LIKE '%command%' OR name LIKE '%main%'
       OR name LIKE '%controller%' OR name LIKE '%endpoint%'
       OR name LIKE '%action%' OR name LIKE '%submit%')
    LIMIT 60
  `,
    )
    .all() as any[]

  const processes: Process[] = []
  const visited = new Set<string>()

  for (const entry of entries) {
    const steps = traceFromEntry(db, entry.uid, visited)
    if (steps.length < 2) continue

    const commSet = new Set<string>()
    for (const s of steps) {
      const n = db.getNode(s.uid)
      if (n?.community) commSet.add(n.community)
    }

    const fn = entry.file_path?.toLowerCase() ?? ''
    let type: Process['type'] = 'unknown'
    if (fn.includes('route') || fn.includes('handler') || fn.includes('controller')) type = 'http'
    else if (fn.includes('cli') || fn.includes('command')) type = 'cli'
    else if (fn.includes('pipeline') || fn.includes('workflow')) type = 'pipeline'
    else if (fn.includes('event') || fn.includes('listener') || fn.includes('consumer'))
      type = 'event'

    processes.push({
      id: `proc_${processes.length + 1}`,
      name: `${entry.name}→${steps[steps.length - 1]?.uid?.split(':')[2] ?? 'end'}`,
      type,
      steps: steps.map((s, i) => ({
        uid: s.uid,
        step: i,
        type: i === 0 ? 'entry' : i === steps.length - 1 ? 'terminal' : 'intermediate',
      })),
      entryPointUid: entry.uid,
      terminalUids: [steps[steps.length - 1]?.uid ?? entry.uid],
      communities: [...commSet],
    })
  }

  return processes
}

function traceFromEntry(db: ForgeDB, startUid: string, visited: Set<string>): { uid: string }[] {
  const steps: { uid: string }[] = []
  let current = startUid
  for (let i = 0; i < 25; i++) {
    if (visited.has(current)) break
    visited.add(current)
    const node = db.getNode(current)
    if (!node) break
    steps.push({ uid: current })
    const callees = db.getOutgoingEdges(current, 'CALLS')
    if (callees.length === 0) break
    const best = callees.sort((a, b) => b.confidence - a.confidence)[0]
    current = best.toUid
  }
  return steps
}

/**
 * BFS blast-radius analysis up to depth 3.
 * Uses CALLS, IMPORTS, HAS_METHOD, HAS_PROPERTY, ACCESSES, EXTENDS, IMPLEMENTS, OVERRIDES.
 */
export function analyzeImpact(
  db: ForgeDB,
  uid: string,
  maxDepth = 3,
  opts: { minConfidence?: number; includeTests?: boolean } = {},
): ImpactResult {
  const { minConfidence = 0.0, includeTests = false } = opts
  const byDepth: ImpactByDepth = { d1: [], d2: [], d3: [] }
  const visited = new Set<string>([uid])
  const queue: { uid: string; depth: number }[] = []
  const seen = new Set<string>()

  // Test file patterns (cross-language)
  const TEST_PATTERNS = [
    /test/i,
    /spec/i,
    /__tests__/i,
    /\.test\./i,
    /\.spec\./i,
    /_test\./i,
    /_spec\./i,
    /tests?\/|\/tests?/i,
  ]
  const isTestFile = (fp: string) => TEST_PATTERNS.some((pat) => pat.test(fp))

  // Seed with all incoming edges (upstream — who depends on this symbol)
  for (const edgeType of IMPACT_EDGE_TYPES) {
    for (const edge of db.getIncomingEdges(uid, edgeType)) {
      // Filter by confidence threshold
      if (edge.confidence < minConfidence) continue
      queue.push({ uid: edge.fromUid, depth: 1 })
    }
  }

  while (queue.length > 0) {
    const { uid: curUid, depth } = queue.shift()!
    const key = `${curUid}:${depth}`
    if (seen.has(key)) continue
    seen.add(key)
    const node = db.getNode(curUid)
    if (!node) continue
    if (visited.has(curUid)) continue

    // Filter test files unless includeTests=true
    if (!includeTests && isTestFile(node.filePath)) continue

    visited.add(curUid)

    if (depth === 1) byDepth.d1.push(curUid)
    else if (depth === 2) byDepth.d2.push(curUid)
    else if (depth === 3) byDepth.d3.push(curUid)
    else continue

    if (depth >= maxDepth) continue

    for (const edgeType of IMPACT_EDGE_TYPES) {
      for (const edge of db.getIncomingEdges(curUid, edgeType)) {
        if (edge.confidence < minConfidence) continue
        if (!visited.has(edge.fromUid)) {
          queue.push({ uid: edge.fromUid, depth: depth + 1 })
        }
      }
    }
  }

  const affectedProcesses = new Set<string>()
  const affectedModules = new Set<string>()
  const affectedTests = new Set<string>()

  for (const uid of [...byDepth.d1, ...byDepth.d2, ...byDepth.d3]) {
    const n = db.getNode(uid)
    if (!n) continue
    if (n?.process) affectedProcesses.add(n.process)
    if (n?.community) affectedModules.add(n.community)
    if (isTestFile(n.filePath)) affectedTests.add(n.filePath)
  }

  let risk: ImpactResult['risk'] = 'LOW'
  if (byDepth.d1.length > 10 || byDepth.d2.length > 50) risk = 'CRITICAL'
  else if (byDepth.d1.length > 5 || byDepth.d2.length > 20) risk = 'HIGH'
  else if (byDepth.d1.length > 0 || byDepth.d2.length > 5) risk = 'MEDIUM'

  const summary = [
    `Direct callers: ${byDepth.d1.length}`,
    `Indirect (d=2): ${byDepth.d2.length}`,
    `Transitive (d=3): ${byDepth.d3.length}`,
    `Affected processes: ${affectedProcesses.size}`,
    `Affected modules: ${affectedModules.size}`,
    `Affected tests: ${affectedTests.size}`,
  ].join(' | ')

  return {
    symbol: uid,
    risk,
    summary,
    affectedProcesses: [...affectedProcesses],
    affectedModules: [...affectedModules],
    affectedTests: [...affectedTests],
    byDepth,
  }
}

/**
 * Compute Method Resolution Order (MRO) for a class.
 * Returns the inheritance chain including the class itself.
 */
export function computeMRO(db: ForgeDB, classUid: string): string[] {
  const chain: string[] = [classUid]
  const visited = new Set<string>([classUid])

  let current = classUid
  for (let depth = 0; depth < 50; depth++) {
    const extends_ = db.getOutgoingEdges(current, 'EXTENDS')
    if (extends_.length === 0) break
    const parent = extends_[0].toUid
    if (visited.has(parent)) break // Diamond inheritance guard
    visited.add(parent)
    chain.push(parent)
    current = parent
  }

  return chain
}

/**
 * Find all overridden methods across an inheritance chain.
 */
export function findOverrides(db: ForgeDB, methodUid: string): string[] {
  const overrides: string[] = []
  const visited = new Set<string>()

  const queue: string[] = [methodUid]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (visited.has(cur)) continue
    visited.add(cur)

    const overrideEdges = db.getOutgoingEdges(cur, 'OVERRIDES')
    for (const edge of overrideEdges) {
      overrides.push(edge.toUid)
      queue.push(edge.toUid)
    }
  }

  return overrides
}
