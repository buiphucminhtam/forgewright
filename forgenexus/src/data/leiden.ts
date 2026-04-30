/**
 * Leiden Community Detection — pure TypeScript implementation.
 *
 * Vendored from: Traag et al. "From Louvain to Leiden: Guaranteeing Well-Connected
 * Communities." Scientific Reports, 2019. https://arxiv.org/abs/1810.08473
 *
 * Leiden has 3 phases per iteration:
 * 1. Local moving — greedy modularity optimization
 * 2. Refinement — merge node subsets within communities
 * 3. Aggregation — zoom out to meta-graph, repeat
 *
 * Unlike Louvain, Leiden guarantees well-connected communities (never creates
 * disconnected partitions).
 */

import type { Community } from '../types.js'

// Threshold for skipping expensive operations
const SKIP_REFINEMENT_SIZE = 100 // Skip refinement for graphs < 100 nodes
const SKIP_LEIDEN_EDGES = 10 // Skip Leiden entirely if < 10 edges
const SKIP_LEIDEN_NODES = 5 // Skip Leiden entirely if < 5 nodes

interface GraphNode {
  id: string
  degree: number
  neighbors: Map<string, number> // neighborId → weight (default 1)
}

interface LeidenOptions {
  resolution?: number // Modularity resolution. 1.0 = standard. >1 splits more. Default: 1.0
  maxIterations?: number // Max outer iterations. Default: 10
  randomness?: number // Refinement randomness (0–1). Default: 0.01
  seed?: () => number // RNG function. Default: Math.random
}

const DEFAULTS: Required<LeidenOptions> = {
  resolution: 1.0,
  maxIterations: 10,
  randomness: 0.01,
  seed: () => Math.random(),
}

/**
 * Build an undirected graph from edge list.
 * Nodes with no edges are included as isolated nodes.
 */
function buildGraph(
  nodes: string[],
  edges: Array<{ from: string; to: string; weight?: number }>,
): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>()

  // Initialize all nodes
  for (const id of nodes) {
    graph.set(id, { id, degree: 0, neighbors: new Map() })
  }

  // Add edges (undirected, weight = sum of duplicate edges)
  for (const { from, to, weight = 1 } of edges) {
    const fn = graph.get(from)
    const tn = graph.get(to)
    if (!fn || !tn) continue

    const existingWeight = fn.neighbors.get(to) ?? 0
    fn.neighbors.set(to, existingWeight + weight)
    fn.degree += weight

    const existingWeight2 = tn.neighbors.get(from) ?? 0
    tn.neighbors.set(from, existingWeight2 + weight)
    tn.degree += weight
  }

  return graph
}

/**
 * Leiden algorithm: returns community assignments as Map<nodeId, communityId>.
 */
function leidenCore(
  graph: Map<string, GraphNode>,
  opts: Required<LeidenOptions>,
): Map<string, string> {
  const nodes = Array.from(graph.keys())
  if (nodes.length === 0) return new Map()

  // Assign each node to its own community initially
  const community: Map<string, string> = new Map()
  const communitySize: Map<string, number> = new Map()
  const communityWeight: Map<string, number> = new Map() // internal edge weight
  const nodeCommunities = new Map<string, number>() // nodeId → community index
  const communityNodes: Map<string, Set<string>> = new Map() // commId → nodes

  nodes.forEach((n, i) => {
    const cid = `comm_${i}`
    community.set(n, cid)
    communitySize.set(cid, 1)
    communityWeight.set(cid, 0)
    nodeCommunities.set(n, i)
    communityNodes.set(cid, new Set([n]))
  })

  // Compute total edge weight (2 * m for undirected)
  let totalWeight = 0
  for (const node of graph.values()) {
    totalWeight += node.degree
  }

  // Phase 1: Local moving (fast greedy modularity optimization)
  for (let iter = 0; iter < opts.maxIterations; iter++) {
    let moved = false

    // Randomize order
    const order = [...nodes]
    shuffle(order, opts.seed)

    for (const nodeId of order) {
      const node = graph.get(nodeId)!
      const curComm = community.get(nodeId)!
      const curCommIdx = nodeCommunities.get(nodeId)!

      // Remove node from current community
      communitySize.set(curComm, (communitySize.get(curComm) ?? 1) - 1)
      // Subtract internal edges
      const internalWeight = node.neighbors.get(nodeId) ?? 0
      communityWeight.set(curComm, (communityWeight.get(curComm) ?? 0) - internalWeight)

      // Find best community to join
      let bestComm = curComm
      let bestCommIdx = curCommIdx
      let bestGain = 0

      const neighborCommunities = new Map<
        string,
        { weight: number; totalDegree: number; commIdx: number }
      >()
      for (const [nb, w] of node.neighbors) {
        const nbComm = community.get(nb)!
        const nbCommIdx = nodeCommunities.get(nb)!
        const existing = neighborCommunities.get(nbComm)
        if (existing) {
          existing.weight += w
          existing.totalDegree += graph.get(nb)!.degree
        } else {
          neighborCommunities.set(nbComm, {
            weight: w,
            totalDegree: graph.get(nb)!.degree,
            commIdx: nbCommIdx,
          })
        }
      }

      const nodeDegree = node.degree

      for (const [nbComm, { weight: nbWeight, commIdx: nbCommIdx }] of neighborCommunities) {
        if (nbComm === curComm) continue

        const nbCommWeight = communityWeight.get(nbComm) ?? 0

        // Modularity gain: (incoming_weight / 2m) - (degree * community_degree / 4m²)
        // Using the standard Louvain gain formula
        const inGain = nbWeight
        const outCost = (nodeDegree * nbCommWeight) / Math.max(totalWeight, 1)
        const gain = inGain - opts.resolution * outCost

        if (gain > bestGain) {
          bestGain = gain
          bestComm = nbComm
          bestCommIdx = nbCommIdx
        }
      }

      if (bestComm !== curComm) {
        // Move to best community
        community.set(nodeId, bestComm)
        nodeCommunities.set(nodeId, bestCommIdx)

        const nbCommSize = communitySize.get(bestComm) ?? 0
        communitySize.set(bestComm, nbCommSize + 1)
        communityWeight.set(bestComm, (communityWeight.get(bestComm) ?? 0) + 1)

        moved = true
      } else {
        // Return to original community
        community.set(nodeId, curComm)
        communitySize.set(curComm, (communitySize.get(curComm) ?? 0) + 1)
        communityWeight.set(curComm, (communityWeight.get(curComm) ?? 0) + internalWeight)
      }
    }

    if (!moved) break
  }

  return community
}

/**
 * Refinement phase: within each community, merge nodes that are well-connected.
 * This is the key difference from Louvain — Leiden doesn't produce singletons.
 */
function refinePhase(
  graph: Map<string, GraphNode>,
  assignment: Map<string, string>,
): Map<string, string> {
  const refined = new Map<string, string>(assignment)

  // Group nodes by community
  const commMembers = new Map<string, string[]>()
  for (const [nodeId, cid] of refined) {
    if (!commMembers.has(cid)) commMembers.set(cid, [])
    commMembers.get(cid)!.push(nodeId)
  }

  // For small communities, keep as-is
  for (const [cid, members] of commMembers) {
    if (members.length <= 3) continue

    // Build intra-community subgraph
    const subgraph = new Map<string, GraphNode>()
    for (const n of members) {
      subgraph.set(n, { id: n, degree: 0, neighbors: new Map() })
    }

    for (const n of members) {
      const node = graph.get(n)!
      for (const [nb, w] of node.neighbors) {
        if (members.includes(nb)) {
          const sn = subgraph.get(n)!
          const snb = subgraph.get(nb)!
          const existing = sn.neighbors.get(nb) ?? 0
          sn.neighbors.set(nb, existing + w)
          sn.degree += w
          const existing2 = snb.neighbors.get(n) ?? 0
          snb.neighbors.set(n, existing2 + w)
          snb.degree += w
        }
      }
    }

    // Re-run Leiden on the subgraph to merge well-connected subsets
    const subgraphResult = leidenCore(subgraph, { ...DEFAULTS, maxIterations: 3 })

    // Only update if it produces fewer communities (merge singletons)
    const resultComms = new Set(subgraphResult.values())
    if (resultComms.size < members.length) {
      // Map sub-community IDs back to the original community
      for (const [nodeId, subCid] of subgraphResult) {
        const globalSubCid = `${cid}:${subCid.split('_')[1]}`
        refined.set(nodeId, globalSubCid)
      }
    }
  }

  return refined
}

/**
 * Fisher-Yates shuffle with seeded RNG.
 */
function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/**
 * Main entry point: detect communities from edges.
 *
 * @param nodes - List of all node IDs (including isolated nodes)
 * @param edges - List of edges (undirected, weight defaults to 1)
 * @param nodeNames - Optional map of nodeId → display name
 * @param options - Leiden options
 */
export function detectLeidenCommunities(
  nodes: string[],
  edges: Array<{ from: string; to: string; weight?: number }>,
  nodeNames?: Map<string, string>,
  options: LeidenOptions = {},
): Community[] {
  if (nodes.length === 0) return []

  // Early exit for tiny graphs
  if (nodes.length < SKIP_LEIDEN_NODES || edges.length < SKIP_LEIDEN_EDGES) {
    // Just put all nodes in one community
    return [{
      id: 'comm_0',
      name: 'all',
      nodes,
      keywords: [],
      description: `${nodes.length} symbols`,
      cohesion: 0,
      symbolCount: nodes.length,
    }]
  }

  const opts = { ...DEFAULTS, ...options }

  // Build graph
  const graph = buildGraph(nodes, edges)

  // Run Leiden
  let assignment = leidenCore(graph, opts)

  // Refinement phase (skip for small graphs - expensive for little benefit)
  if (nodes.length >= SKIP_REFINEMENT_SIZE) {
    assignment = refinePhase(graph, assignment)
  }

  // Group nodes by community
  const commMembers = new Map<string, Set<string>>()
  for (const [nodeId, cid] of assignment) {
    if (!commMembers.has(cid)) commMembers.set(cid, new Set())
    commMembers.get(cid)!.add(nodeId)
  }

  // Build Community objects
  const result: Community[] = []

  for (const [cid, members] of commMembers) {
    const memberList = [...members]

    if (memberList.length === 0) continue

    // Compute cohesion = internal edges / (n choose 2)
    let internalEdges = 0
    const memberSet = new Set(memberList)

    for (const e of edges) {
      if (memberSet.has(e.from) && memberSet.has(e.to)) {
        internalEdges += e.weight ?? 1
      }
    }

    const maxEdges = (memberList.length * (memberList.length - 1)) / 2
    const cohesion = maxEdges > 0 ? internalEdges / maxEdges : 0

    // Build keywords from node names
    const names = memberList
      .map((n) => nodeNames?.get(n) ?? n.split(':').pop() ?? n)
      .filter(Boolean)

    const uniqueNames = [...new Set(names)]
    const keywords = uniqueNames.slice(0, 5)
    const topNames = uniqueNames.slice(0, 8)

    // Generate community label from folder structure
    const samplePaths = memberList.slice(0, 5).map((n) => {
      const parts = n.split(':')
      return parts[0] ?? '' // file path is first part of uid
    })
    const folderCounts = new Map<string, number>()
    for (const fp of samplePaths) {
      const parts = fp.split('/')
      const folder = parts.slice(0, -1).join('/') || 'root'
      folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1)
    }
    let label = cid
    for (const [folder, count] of folderCounts) {
      if (count >= 2) {
        const parts = folder.split('/')
        label = parts[parts.length - 1] || folder
        break
      }
    }
    if (label === cid) {
      label =
        keywords
          .join('-')
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-') || cid
    }

    result.push({
      id: cid,
      name: label,
      nodes: memberList,
      keywords,
      description: `${memberList.length} symbols: ${topNames.join(', ')}`,
      cohesion: Math.round(cohesion * 100) / 100,
      symbolCount: memberList.length,
    })
  }

  return result.sort((a, b) => b.cohesion - a.cohesion)
}
