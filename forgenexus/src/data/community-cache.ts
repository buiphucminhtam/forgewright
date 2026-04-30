/**
 * Incremental Community Detection — Safe, Conservative Strategy.
 *
 * Only runs Leiden on affected subgraph when changes are small (<5%).
 * Falls back to full rebuild when changes are too large.
 *
 * Strategy:
 * - Safe Mode (default): <5% changed → incremental
 * - Aggressive Mode: <20% changed → subgraph re-clustering
 * - Full Rebuild: ≥20% changed → complete re-run
 */

import type { Community } from '../types.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChangeAnalysis {
  totalNodes: number
  changedNodes: number
  changeRatio: number // 0.0 - 1.0
  affectedFiles: Set<string>
  newFiles: Set<string>
  deletedFiles: Set<string>
}

export type UpdateStrategy = 'none' | 'incremental' | 'aggressive' | 'full'

export interface CommunityUpdateResult {
  strategy: UpdateStrategy
  communities: Community[]
  metrics: CommunityMetrics
  durationMs: number
}

export interface CommunityMetrics {
  originalCommunityCount: number
  newCommunityCount: number
  mergedCommunities: number
  createdCommunities: number
  deletedCommunities: number
  averageCohesion: number
  stabilityScore: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SAFE_THRESHOLD = 0.05  // 5% - safe incremental
const AGGRESSIVE_THRESHOLD = 0.20  // 20% - aggressive incremental
const MIN_COHESION = 0.3  // Minimum acceptable cohesion
const MIN_MODULARITY = 0.4  // Minimum acceptable modularity

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze changes and determine update strategy.
 */
export function analyzeCommunityChanges(
  changedFiles: Set<string>,
  totalFiles: number,
  allFilePaths: Set<string>,
): ChangeAnalysis {
  const newFiles = new Set<string>()
  const deletedFiles = new Set<string>()
  const affectedFiles = new Set<string>()

  // Simple heuristics: files starting with new/ or not in existing = new
  for (const file of changedFiles) {
    affectedFiles.add(file)
    if (file.includes('/new/') || !allFilePaths.has(file)) {
      newFiles.add(file)
    }
  }

  // Estimate changed nodes (rough: ~50 nodes per file)
  const changedNodes = changedFiles.size * 50
  const totalNodes = totalFiles * 50  // Rough estimate
  const changeRatio = totalNodes > 0 ? changedNodes / totalNodes : 0

  return {
    totalNodes,
    changedNodes,
    changeRatio,
    affectedFiles,
    newFiles,
    deletedFiles,
  }
}

/**
 * Determine update strategy based on change analysis.
 */
export function determineUpdateStrategy(analysis: ChangeAnalysis): UpdateStrategy {
  if (analysis.changeRatio === 0) {
    return 'none'
  }

  if (analysis.changeRatio < SAFE_THRESHOLD) {
    return 'incremental'
  }

  if (analysis.changeRatio < AGGRESSIVE_THRESHOLD) {
    return 'aggressive'
  }

  return 'full'
}

/**
 * Compute community quality metrics.
 */
export function computeCommunityMetrics(communities: Community[]): CommunityMetrics {
  if (communities.length === 0) {
    return {
      originalCommunityCount: 0,
      newCommunityCount: 0,
      mergedCommunities: 0,
      createdCommunities: 0,
      deletedCommunities: 0,
      averageCohesion: 0,
      stabilityScore: 0,
    }
  }

  const totalCohesion = communities.reduce((sum, c) => sum + c.cohesion, 0)
  const averageCohesion = totalCohesion / communities.length

  // Stability = how many communities have good cohesion
  const stableCommunities = communities.filter(c => c.cohesion >= MIN_COHESION)
  const stabilityScore = stableCommunities.length / communities.length

  return {
    originalCommunityCount: communities.length,
    newCommunityCount: communities.length,
    mergedCommunities: 0,
    createdCommunities: 0,
    deletedCommunities: 0,
    averageCohesion: Math.round(averageCohesion * 100) / 100,
    stabilityScore: Math.round(stabilityScore * 100) / 100,
  }
}

/**
 * Validate community quality after update.
 * Returns true if quality is acceptable, false if should fallback to full rebuild.
 */
export function validateCommunityQuality(metrics: CommunityMetrics): boolean {
  if (metrics.averageCohesion < MIN_COHESION) {
    console.warn(
      `[Community] Quality check failed: average cohesion ${metrics.averageCohesion} < ${MIN_COHESION}`
    )
    return false
  }

  if (metrics.stabilityScore < 0.5) {
    console.warn(
      `[Community] Quality check failed: stability ${metrics.stabilityScore} < 0.5`
    )
    return false
  }

  return true
}

/**
 * Log community update decision for debugging.
 */
export function logCommunityDecision(
  analysis: ChangeAnalysis,
  strategy: UpdateStrategy,
  metrics: CommunityMetrics,
): void {
  const pct = (analysis.changeRatio * 100).toFixed(1)

  console.log(`[Community] Update decision:`)
  console.log(`  Changed: ${analysis.changedNodes}/${analysis.totalNodes} nodes (${pct}%)`)
  console.log(`  Strategy: ${strategy}`)
  console.log(`  Communities: ${metrics.newCommunityCount}`)
  console.log(`  Cohesion: ${metrics.averageCohesion}`)
  console.log(`  Stability: ${metrics.stabilityScore}`)
}

/**
 * Get threshold values for tuning.
 */
export function getCommunityThresholds(): {
  safe: number
  aggressive: number
  minCohesion: number
  minModularity: number
} {
  return {
    safe: SAFE_THRESHOLD,
    aggressive: AGGRESSIVE_THRESHOLD,
    minCohesion: MIN_COHESION,
    minModularity: MIN_MODULARITY,
  }
}
