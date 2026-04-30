/**
 * ForgeNexus — Core Type Definitions
 */

export type NodeType =
  | 'File'
  | 'Folder'
  | 'Function'
  | 'Class'
  | 'Interface'
  | 'Module'
  | 'Method'
  | 'Property'
  | 'Variable'
  | 'Struct'
  | 'Enum'
  | 'Trait'
  | 'Impl'
  | 'TypeAlias'

export type EdgeType =
  | 'CONTAINS'
  | 'DEFINES'
  | 'CALLS'
  | 'IMPORTS'
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'HAS_METHOD'
  | 'HAS_PROPERTY'
  | 'ACCESSES'
  | 'OVERRIDES'
  | 'MEMBER_OF'
  | 'STEP_IN_PROCESS'
  | 'HANDLES_ROUTE'
  | 'FETCHES'
  | 'HANDLES_TOOL'
  | 'ENTRY_POINT_OF'
  | 'QUERIES'

export interface CodeNode {
  uid: string
  type: NodeType
  name: string
  filePath: string
  line: number
  endLine: number
  column?: number
  returnType?: string
  parameterCount?: number
  parameterTypes?: string[]
  declaredType?: string
  accessType?: 'read' | 'write'
  language?: string
  signature?: string
  community?: string
  process?: string
  embedding?: number[]
}

export interface CodeEdge {
  id: string
  fromUid: string
  toUid: string
  type: EdgeType
  confidence: number
  reason?: string
  step?: number
}

export interface Community {
  id: string
  name: string
  nodes: string[]
  keywords: string[]
  description: string
  cohesion: number
  symbolCount: number
}

export interface Process {
  id: string
  name: string
  type: 'http' | 'cli' | 'event' | 'pipeline' | 'unknown'
  steps: ProcessStep[]
  entryPointUid: string
  terminalUids: string[]
  communities: string[]
}

export interface ProcessStep {
  uid: string
  step: number
  type: 'entry' | 'intermediate' | 'terminal'
}

export interface RepoMeta {
  name: string
  path: string
  indexedAt: string
  lastCommit: string
  stats: RepoStats
  language: string
}

export interface RepoStats {
  files: number
  nodes: number
  edges: number
  communities: number
  processes: number
  hasEmbeddings: boolean
  cacheHits?: number
  cacheMisses?: number
  trieBuildMs?: number
}

export interface QueryResult {
  query: string
  processes: ScoredProcess[]
  standaloneDefinitions: string[]
  files: string[]
}

export interface ScoredProcess {
  process: Process
  score: number
  matchedSymbols: string[]
}

export interface ContextResult {
  symbol: CodeNode
  incoming: CategorizedRefs
  outgoing: CategorizedRefs
  processes: string[]
  communities: string[]
}

export interface CategorizedRefs {
  calls: RefEntry[]
  imports: RefEntry[]
  extends: RefEntry[]
  implements: RefEntry[]
  hasMethod: RefEntry[]
  hasProperty: RefEntry[]
  accesses: RefEntry[]
  overrides: RefEntry[]
  memberOf: RefEntry[]
}

export interface RefEntry {
  uid: string
  name: string
  filePath: string
  confidence: number
  reason?: string
}

export interface ImpactResult {
  symbol: string
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  summary: string
  affectedProcesses: string[]
  affectedModules: string[]
  affectedTests: string[] // Test files that cover changed code
  byDepth: ImpactByDepth
}

export interface ImpactByDepth {
  d1: string[]
  d2: string[]
  d3: string[]
}

export interface ImpactOptions {
  minConfidence?: number // Minimum edge confidence to include (0.0-1.0)
  includeTests?: boolean // Include test files in blast radius
}

export interface DetectChangesResult {
  changedSymbols: ChangedSymbol[]
  affectedProcesses: string[]
  affectedModules: string[]
  riskSummary: string
}

export interface ChangedSymbol {
  uid: string
  name: string
  filePath: string
  type: NodeType
  changeType: 'added' | 'deleted' | 'modified'
}

export interface RenameEdit {
  filePath: string
  oldName: string
  newName: string
  line: number
  confidence: 'high' | 'low'
  reason: 'graph' | 'text_search'
}

export interface ForgeNexusConfig {
  repoName?: string
  repoPath?: string
  dbPath?: string
  languages?: string[]
  maxFileSize?: number
  skipPatterns?: string[]
  includeEmbeddings?: boolean
}
