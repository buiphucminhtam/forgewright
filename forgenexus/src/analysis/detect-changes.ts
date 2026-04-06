/**
 * Git diff / PR diff -> affected symbols mapping with blast-radius analysis.
 * Supports: uncommitted changes, staged changes, commits, PR branches.
 *
 * This powers both:
 *   - detect_changes tool (pre-commit analysis)
 *   - PR review blast radius
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import type { ForgeDB } from '../data/db.js'
import type { DetectChangesResult, ChangedSymbol } from '../types.js'
import { analyzeImpact } from '../data/graph.js'

export type ChangeScope = 'unstaged' | 'staged' | 'all' | 'compare'

export interface PRReviewResult {
  filesChanged: number
  symbolsChanged: number
  blastRadius: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  affectedModules: string[]
  affectedProcesses: string[]
  affectedAPIs: string[]
  affectedTests: string[]
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  riskSummary: string
  topImpactSymbols: {
    uid: string
    name: string
    filePath: string
    callers: number
    risk: string
  }[]
  recommendedReviewers: string[]
  breakingChanges: string[]
  migrationNeeded: string[]
}

/**
 * Detect changed files from various sources.
 */
export function getChangedFiles(
  scope: ChangeScope,
  baseRef?: string,
): { path: string; status: 'added' | 'modified' | 'deleted' }[] {
  try {
    let cmd = ''
    switch (scope) {
      case 'unstaged':
        cmd = 'git diff --name-status HEAD'
        break
      case 'staged':
        cmd = 'git diff --cached --name-status HEAD'
        break
      case 'all':
        cmd = 'git diff --name-status HEAD'
        break
      case 'compare': {
        if (!baseRef) throw new Error('base_ref required for compare scope')
        cmd = `git diff --name-status ${baseRef} HEAD`
        break
      }
    }
    const output = execSync(cmd, { encoding: 'utf8' })
    return output
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [status, ...pathParts] = l.split('\t')
        const path = pathParts.join('\t')
        if (status === 'A' || status === 'A') return { path, status: 'added' as const }
        if (status === 'D') return { path, status: 'deleted' as const }
        return { path, status: 'modified' as const }
      })
  } catch {
    return []
  }
}

/**
 * Map a raw git diff to changed symbols in the knowledge graph.
 */
export function detectChanges(
  db: ForgeDB,
  scope: ChangeScope = 'unstaged',
  baseRef?: string,
): DetectChangesResult {
  const changedFiles = getChangedFiles(scope, baseRef)
  const changedSymbols: ChangedSymbol[] = []
  const deletedFiles: string[] = []

  for (const { path, status } of changedFiles) {
    if (status === 'deleted') {
      deletedFiles.push(path)
      const symbols = db.getNodesByFile(path)
      for (const symbol of symbols) {
        changedSymbols.push({
          uid: symbol.uid,
          name: symbol.name,
          filePath: symbol.filePath,
          type: symbol.type,
          changeType: 'deleted',
        })
      }
      continue
    }

    if (!existsSync(path)) continue
    const symbols = db.getNodesByFile(path)
    for (const symbol of symbols) {
      changedSymbols.push({
        uid: symbol.uid,
        name: symbol.name,
        filePath: symbol.filePath,
        type: symbol.type,
        changeType: status === 'added' ? 'added' : 'modified',
      })
    }
  }

  const affectedProcesses = new Set<string>()
  const affectedModules = new Set<string>()

  for (const symbol of changedSymbols) {
    const incoming = db.getIncomingEdges(symbol.uid)
    for (const edge of incoming) {
      const node = db.getNode(edge.fromUid)
      if (node?.process) affectedProcesses.add(node.process)
      if (node?.community) affectedModules.add(node.community)
    }
  }

  let riskSummary = ''
  if (changedSymbols.length === 0) {
    riskSummary = 'No indexed symbols affected. Low risk.'
  } else if (changedSymbols.length > 20) {
    riskSummary = `HIGH RISK: ${changedSymbols.length} symbols changed across ${affectedProcesses.size} processes.`
  } else if (changedSymbols.length > 5) {
    riskSummary = `MEDIUM RISK: ${changedSymbols.length} symbols changed. Review recommended.`
  } else {
    riskSummary = `LOW RISK: ${changedSymbols.length} symbols changed.`
  }

  if (deletedFiles.length > 0) {
    riskSummary += ` ${deletedFiles.length} file(s) deleted.`
  }

  return {
    changedSymbols,
    affectedProcesses: [...affectedProcesses],
    affectedModules: [...affectedModules],
    riskSummary,
  }
}

/**
 * PR Review blast-radius analysis.
 * Analyzes what would break if a PR is merged.
 *
 * This goes beyond simple diff analysis by:
 * 1. Mapping each changed symbol to its full blast radius (BFS up to depth 3)
 * 2. Identifying breaking changes vs additive changes
 * 3. Classifying risk by affected callers and API surface
 * 4. Recommending reviewers based on affected modules
 */
export function analyzePRReview(db: ForgeDB, baseRef: string, headRef = 'HEAD'): PRReviewResult {
  const diffOutput = execSync(`git diff --name-status ${baseRef} ${headRef}`, {
    encoding: 'utf8',
  }).trim()

  const changedFiles = diffOutput
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [status, ...rest] = l.split('\t')
      const path = rest.join('\t')
      return { path, status }
    })

  const changedSymbols: ChangedSymbol[] = []
  const deletedFiles: string[] = []

  for (const { path, status } of changedFiles) {
    if (status === 'D') {
      deletedFiles.push(path)
      const symbols = db.getNodesByFile(path)
      for (const sym of symbols) {
        changedSymbols.push({ ...sym, changeType: 'deleted' })
      }
      continue
    }
    if (!existsSync(path)) continue
    const symbols = db.getNodesByFile(path)
    for (const sym of symbols) {
      changedSymbols.push({ ...sym, changeType: status === 'A' ? 'added' : 'modified' })
    }
  }

  // Classify by type of change
  const breakingChanges: string[] = []
  const migrationNeeded: string[] = []
  const pureAdditions: string[] = []

  for (const sym of changedSymbols) {
    if (sym.changeType === 'deleted') {
      breakingChanges.push(`${sym.type} ${sym.name} in ${sym.filePath}`)
    } else if (
      sym.type === 'Function' ||
      sym.type === 'Method' ||
      sym.type === 'Interface' ||
      sym.type === 'Class'
    ) {
      // Check if signature changed by looking for return type changes
      // In practice this would require content diff analysis
      migrationNeeded.push(`${sym.type} ${sym.name}`)
    } else if (sym.changeType === 'added') {
      pureAdditions.push(`${sym.type} ${sym.name}`)
    }
  }

  // Blast radius per changed symbol
  const blastRadius = { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
  const topImpact: PRReviewResult['topImpactSymbols'] = []
  const allAffectedModules = new Set<string>()
  const allAffectedProcesses = new Set<string>()
  const allAffectedAPIs = new Set<string>()
  const allAffectedTests = new Set<string>()

  for (const sym of changedSymbols) {
    // Only analyze non-deleted symbols for blast radius
    if (sym.changeType === 'deleted') continue

    const impact = analyzeImpact(db, sym.uid, 3)
    const depth = impact.byDepth.d1.length

    blastRadius.total++
    if (depth > 10) blastRadius.critical++
    else if (depth > 5) blastRadius.high++
    else if (depth > 0) blastRadius.medium++
    else blastRadius.low++

    for (const module of impact.affectedModules) allAffectedModules.add(module)
    for (const proc of impact.affectedProcesses) allAffectedProcesses.add(proc)

    // Track affected API endpoints
    const apiFunctions = db
      .getNodesByFile(sym.filePath)
      .filter((n) => n.type === 'Function' || n.type === 'Method')
    for (const fn of apiFunctions) {
      allAffectedAPIs.add(`${fn.name} (${fn.filePath})`)
    }

    // Track test files
    if (sym.filePath.includes('test') || sym.filePath.includes('spec')) {
      allAffectedTests.add(sym.filePath)
    }

    // Top impacted symbols (sorted by depth-1 callers)
    if (impact.byDepth.d1.length > 0) {
      topImpact.push({
        uid: sym.uid,
        name: sym.name,
        filePath: sym.filePath,
        callers: impact.byDepth.d1.length,
        risk: impact.risk,
      })
    }
  }

  // Sort top impact by callers desc
  topImpact.sort((a, b) => b.callers - a.callers)

  // Determine risk level
  let riskLevel: PRReviewResult['riskLevel'] = 'LOW'
  if (blastRadius.critical > 0 || blastRadius.high > 5) riskLevel = 'CRITICAL'
  else if (blastRadius.high > 2 || blastRadius.medium > 10) riskLevel = 'HIGH'
  else if (blastRadius.medium > 0 || breakingChanges.length > 0) riskLevel = 'MEDIUM'

  // Generate risk summary
  const riskSummary = [
    `${changedSymbols.length} symbols changed (${breakingChanges.length} breaking)`,
    `Blast radius: ${blastRadius.critical} critical, ${blastRadius.high} high, ${blastRadius.medium} medium`,
    `${allAffectedModules.size} modules, ${allAffectedProcesses.size} processes affected`,
    `Risk level: ${riskLevel}`,
  ].join(' | ')

  // Recommended reviewers based on affected modules
  const recommendedReviewers: string[] = []
  const reviewerCandidates = new Map<string, number>()
  for (const module of allAffectedModules) {
    const nodes = db.getNodesByCommunity(module)
    for (const node of nodes.slice(0, 3)) {
      const author = getFileAuthor(node.filePath)
      if (author) {
        reviewerCandidates.set(author, (reviewerCandidates.get(author) ?? 0) + 1)
      }
    }
  }
  for (const [author, score] of [...reviewerCandidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)) {
    recommendedReviewers.push(`${author} (${score} affected files)`)
  }

  return {
    filesChanged: changedFiles.length,
    symbolsChanged: changedSymbols.length,
    blastRadius,
    affectedModules: [...allAffectedModules],
    affectedProcesses: [...allAffectedProcesses],
    affectedAPIs: [...allAffectedAPIs],
    affectedTests: [...allAffectedTests],
    riskLevel,
    riskSummary,
    topImpactSymbols: topImpact.slice(0, 15),
    recommendedReviewers,
    breakingChanges: breakingChanges.slice(0, 20),
    migrationNeeded: migrationNeeded.slice(0, 20),
  }
}

/**
 * Get the primary author of a file from git blame.
 */
function getFileAuthor(filePath: string): string | null {
  try {
    const output = execSync(
      `git blame --line-porcelain "${filePath}" | head -1 | sed 's/author //'`,
      { encoding: 'utf8' },
    ).trim()
    return output.startsWith('author ') ? output.replace('author ', '') : null
  } catch {
    return null
  }
}
