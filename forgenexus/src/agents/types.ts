/**
 * Agent Types for ForgeWright Anti-Hallucination System
 * 
 * Core type definitions for the multi-agent verification system.
 */

// ============================================================================
// Configuration Types
// ============================================================================

export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'ollama';

export interface LLMClientConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxRetries: number;
  timeout: number;
  temperature?: number;
  maxTokens?: number;
}

export interface Guardrails {
  constraints: string[];
  citationRequired: boolean;
  calibration: 'strict' | 'moderate' | 'lenient';
  fallbackBehavior: 'refuse' | 'clarify' | 'best_effort';
}

// ============================================================================
// Agent Result Types
// ============================================================================

export interface AgentResult {
  content: string;
  confidence: number;
  citations: Citation[];
  warnings: string[];
  verified: boolean;
  metadata?: Record<string, unknown>;
}

export interface GuardedResult extends AgentResult {
  rawResponse: unknown;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ============================================================================
// Verification Types
// ============================================================================

export type VerificationStatus = 'confirmed' | 'unconfirmed' | 'uncertain';

export interface VerificationResult {
  status: VerificationStatus;
  confidence: number;
  reasoning: string;
  evidence: Evidence[];
  issues: string[];
  warnings?: string[];
  verified?: boolean;
}

export interface Evidence {
  type: 'code' | 'documentation' | 'test' | 'configuration';
  content: string;
  source: string;
  line?: number;
  relevance: number;
}

export interface DocumentVerification {
  verified: boolean;
  confidence: number;
  claims: ClaimVerification[];
  issues: string[];
  warnings: string[];
}

export interface ClaimVerification {
  claim: string;
  verified: boolean;
  status: VerificationStatus;
  evidence: Evidence[];
  issues: string[];
  sourceReferences: SourceReference[];
}

export interface SourceReference {
  file: string;
  line: number;
  context: string;
}

// ============================================================================
// Citation Types
// ============================================================================

export interface Citation {
  id: string;
  claim: string;
  source: string;
  line?: number;
  verified: boolean;
  verificationStatus?: VerificationStatus;
  relevance?: number;
}

export interface ExtractedCitation {
  claim: string;
  sourcePattern: string;
  file?: string;
  line?: number;
  verified: boolean;
}

export interface CitationVerification {
  citation: Citation;
  isValid: boolean;
  matchesSource: boolean;
  context?: string;
  issues?: string[];
}

// ============================================================================
// Confidence Types
// ============================================================================

export interface ConfidenceConfig {
  thresholds: {
    high: number;
    medium: number;
    low: number;
    critical: number;
  };
  behaviors: {
    medium: 'note' | 'warn' | 'block';
    low: 'warn' | 'block';
    critical: 'refuse' | 'clarify';
  };
}

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'critical';
export type ConfidenceBehavior = 'note' | 'warn' | 'block' | 'refuse' | 'clarify';

export interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number;
  behavior: ConfidenceBehavior;
  reasons: string[];
  flags: string[];
}

export interface ConfidenceParams {
  type: 'wiki' | 'impact' | 'query' | 'binding';
  text?: string;
  results?: SearchResult[];
  evidence?: Evidence[];
  bindings?: BindingAnalysis;
}

export interface SearchResult {
  id: string;
  file: string;
  line?: number;
  relevance: number;
  content: string;
  type: 'file' | 'function' | 'class' | 'variable' | 'import' | 'comment';
}

// ============================================================================
// Semantic Energy Types
// ============================================================================

export interface SemanticEnergyConfig {
  usePenultimateLayer: boolean;
  temperature: number;
  ensembleSize: number;
}

export interface SemanticEnergyResult {
  energy: number;
  uncertainty: number;
  confidence: number;
  method: 'logits' | 'ensemble' | 'heuristic';
  details?: {
    variance?: number;
    ensembleScores?: number[];
  };
}

// ============================================================================
// Binding Analysis Types
// ============================================================================

export interface BindingAnalysis {
  symbol: string;
  definitions: BindingLocation[];
  references: BindingLocation[];
  isConsistent: boolean;
  issues: BindingIssue[];
}

export interface BindingLocation {
  file: string;
  line: number;
  column: number;
  context: string;
}

export interface BindingIssue {
  type: 'missing' | 'ambiguous' | 'inconsistent' | 'circular';
  symbol: string;
  locations: string[];
  suggestion?: string;
  severity: 'error' | 'warning' | 'info';
}

// ============================================================================
// Multi-Agent Workflow Types
// ============================================================================

export type TaskType = 'wiki' | 'impact' | 'query' | 'binding';

export interface WorkflowConfig {
  task: TaskType;
  iterations: number;
  confidenceThreshold: number;
  timeout?: number;
}

export interface WorkflowResult {
  content: string;
  iterations: number;
  converged: boolean;
  finalConfidence: number;
  verificationResults: VerificationResult[];
  citations: Citation[];
  warnings: string[];
}

// ============================================================================
// Context Types
// ============================================================================

export interface GroundingContext {
  repoPath: string;
  chunks: Chunk[];
  citations: Citation[];
  relevance: number;
  freshness: 'fresh' | 'stale' | 'critical';
}

export interface Chunk {
  id: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  text: string;
  embedding?: number[];
  relevance?: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class VerificationError extends Error {
  constructor(
    message: string,
    public issues: string[],
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VerificationError';
  }
}

export class ConfidenceError extends Error {
  constructor(
    message: string,
    public level: ConfidenceLevel,
    public score: number
  ) {
    super(message);
    this.name = 'ConfidenceError';
  }
}

// ============================================================================
// Factory Defaults
// ============================================================================

export const DEFAULT_CONFIDENCE_CONFIG: ConfidenceConfig = {
  thresholds: {
    high: 0.9,
    medium: 0.7,
    low: 0.5,
    critical: 0.3,
  },
  behaviors: {
    medium: 'note',
    low: 'warn',
    critical: 'refuse',
  },
};

export const DEFAULT_GUARDRAILS: Guardrails = {
  constraints: [
    'Only describe functionality present in the evidence',
    'Cite specific file paths for each factual claim',
    'If functionality is unclear, say "NOT_VERIFIED"',
    'Do not speculate on undocumented behavior',
  ],
  citationRequired: true,
  calibration: 'moderate',
  fallbackBehavior: 'best_effort',
};
