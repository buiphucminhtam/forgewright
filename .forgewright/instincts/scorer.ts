/**
 * Instinct Scorer — Confidence scoring for observed patterns
 * 
 * Scores range from 0.3 to 0.9 based on:
 * - Frequency: more occurrences = higher confidence
 * - Consistency: same pattern across files = higher confidence
 * - Recency: recent patterns weighted higher
 * - Cross-project: patterns seen in multiple projects = higher
 */

import type { ProjectContext, InstinctPattern } from './instinct-store.js';

// ─── Scoring Constants ─────────────────────────────────────────────

const MIN_CONFIDENCE = 0.3;
const MAX_CONFIDENCE = 0.9;

const WEIGHTS = {
  frequency: 0.30,     // Weight for occurrence count
  consistency: 0.25,   // Weight for cross-file consistency
  recency: 0.25,      // Weight for recency of patterns
  crossProject: 0.20,  // Weight for cross-project usage
};

// Scoring thresholds
const THRESHOLDS = {
  frequency: {
    initial: 3,        // Min occurrences for base score
    good: 5,           // Occurrences for good score
    excellent: 10,     // Occurrences for excellent score
  },
  recency: {
    // Hours after which recency score decays
    day: 24,
    week: 168,        // 7 days
    month: 720,       // 30 days
  },
};

// ─── Scoring Functions ─────────────────────────────────────────────

export interface ScoringInput {
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  projectContext: ProjectContext;
  crossProject: boolean;
  projectIds: string[];
  affectedFiles?: string[];  // Files touched in this session
  sessionToolCount?: number; // Total tools in session
}

export interface ScoringResult {
  confidence: number;
  breakdown: {
    frequency: number;
    consistency: number;
    recency: number;
    crossProject: number;
  };
  recommendation: 'low' | 'medium' | 'high' | 'promote';
}

/**
 * Calculate time decay factor (0 to 1, higher = more recent)
 */
function calculateRecencyScore(lastSeen: string, firstSeen: string): number {
  const now = Date.now();
  const last = new Date(lastSeen).getTime();
  const first = new Date(firstSeen).getTime();
  
  const hoursSinceLast = (now - last) / (1000 * 60 * 60);
  const hoursSinceFirst = (now - first) / (1000 * 60 * 60);
  
  // Decay function: exponential decay over 30 days
  const decayRate = 1 / (THRESHOLDS.recency.month); // Decay to ~37% after 30 days
  
  // Last-seen recency (most important)
  let lastSeenScore = Math.exp(-decayRate * hoursSinceLast);
  
  // First-seen recency (bonus for established patterns)
  let firstSeenScore = Math.exp(-decayRate * hoursSinceFirst * 0.5); // Slower decay
  
  // Combine with more weight on last seen
  return (lastSeenScore * 0.7) + (firstSeenScore * 0.3);
}

/**
 * Calculate frequency score based on occurrences
 */
function calculateFrequencyScore(occurrences: number): number {
  if (occurrences <= 1) return 0.2;
  if (occurrences < THRESHOLDS.frequency.initial) {
    return 0.2 + (occurrences / THRESHOLDS.frequency.initial) * 0.3;
  }
  if (occurrences < THRESHOLDS.frequency.good) {
    return 0.5 + ((occurrences - THRESHOLDS.frequency.initial) / 
      (THRESHOLDS.frequency.good - THRESHOLDS.frequency.initial)) * 0.2;
  }
  if (occurrences < THRESHOLDS.frequency.excellent) {
    return 0.7 + ((occurrences - THRESHOLDS.frequency.good) / 
      (THRESHOLDS.frequency.excellent - THRESHOLDS.frequency.good)) * 0.2;
  }
  return 0.9; // Cap at excellent
}

/**
 * Calculate consistency score
 * Higher when pattern is consistent across files/contexts
 */
function calculateConsistencyScore(
  occurrences: number,
  projectContext?: ProjectContext,
  affectedFiles?: string[]
): number {
  let score = 0.5; // Base score
  
  // Bonus for context specificity
  if (projectContext?.language) score += 0.1;
  if (projectContext?.framework) score += 0.1;
  if (projectContext?.projectType) score += 0.1;
  
  // Bonus for file type diversity (consistent across different file types)
  if (affectedFiles && affectedFiles.length > 1) {
    const extensions = new Set(
      affectedFiles
        .map(f => f.split('.').pop() || '')
        .filter(Boolean)
    );
    if (extensions.size > 1) {
      score += Math.min(0.1, extensions.size * 0.03);
    }
  }
  
  // Higher occurrences with consistent context = higher score
  if (occurrences >= 5) score += 0.1;
  
  return Math.min(score, 1.0);
}

/**
 * Calculate cross-project score
 */
function calculateCrossProjectScore(
  crossProject: boolean,
  projectIds: string[]
): number {
  if (crossProject) {
    // More projects = higher score (diminishing returns)
    return Math.min(0.9, 0.5 + (projectIds.length - 1) * 0.15);
  }
  
  // Single project: check if it's been used enough to suggest it might generalize
  // This is a soft signal, so lower score
  if (projectIds.length === 1) {
    return 0.3;
  }
  
  return 0.1;
}

/**
 * Calculate initial confidence for new patterns
 */
export function calculateInitialConfidence(
  toolCount: number,
  projectContext?: ProjectContext
): number {
  // New patterns start with base confidence
  let base = 0.3;
  
  // Bonus for longer tool sequences (more complex = more intentional)
  if (toolCount >= 3) base += 0.1;
  if (toolCount >= 5) base += 0.05;
  
  // Bonus for language-specific context
  if (projectContext?.language) base += 0.05;
  
  return Math.min(base, MAX_CONFIDENCE);
}

/**
 * Main scoring function
 */
export function scorePattern(input: ScoringInput): ScoringResult {
  const {
    occurrences,
    firstSeen,
    lastSeen,
    projectContext,
    crossProject,
    projectIds,
    affectedFiles,
  } = input;

  // Calculate individual component scores
  const frequencyScore = calculateFrequencyScore(occurrences);
  const recencyScore = calculateRecencyScore(lastSeen, firstSeen);
  const consistencyScore = calculateConsistencyScore(occurrences, projectContext, affectedFiles);
  const crossProjectScore = calculateCrossProjectScore(crossProject, projectIds);

  // Weighted combination
  const confidence = Math.min(
    MAX_CONFIDENCE,
    Math.max(
      MIN_CONFIDENCE,
      (frequencyScore * WEIGHTS.frequency) +
      (recencyScore * WEIGHTS.recency) +
      (consistencyScore * WEIGHTS.consistency) +
      (crossProjectScore * WEIGHTS.crossProject)
    )
  );

  // Determine recommendation
  let recommendation: ScoringResult['recommendation'];
  if (confidence >= 0.7 && crossProject) {
    recommendation = 'promote';
  } else if (confidence >= 0.6) {
    recommendation = 'high';
  } else if (confidence >= 0.45) {
    recommendation = 'medium';
  } else {
    recommendation = 'low';
  }

  return {
    confidence: Math.round(confidence * 100) / 100, // Round to 2 decimal places
    breakdown: {
      frequency: Math.round(frequencyScore * 100) / 100,
      consistency: Math.round(consistencyScore * 100) / 100,
      recency: Math.round(recencyScore * 100) / 100,
      crossProject: Math.round(crossProjectScore * 100) / 100,
    },
    recommendation,
  };
}

/**
 * Rescore an existing pattern
 */
export function rescorePattern(pattern: InstinctPattern): ScoringResult {
  return scorePattern({
    occurrences: pattern.occurrences,
    firstSeen: pattern.firstSeen,
    lastSeen: pattern.lastSeen,
    projectContext: pattern.projectContext,
    crossProject: pattern.crossProject,
    projectIds: pattern.projectIds,
  });
}

/**
 * Update confidence for an existing pattern (incremental update)
 */
export function updateConfidence(
  currentConfidence: number,
  occurrences: number,
  isRecent: boolean
): number {
  // Gradual update to avoid volatility
  const updateRate = 0.1; // 10% weight on new information
  
  const delta = isRecent ? 0.05 : -0.02;
  const newConfidence = currentConfidence + delta * updateRate;
  
  return Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, newConfidence));
}

// ─── Tool Sequence Analysis ────────────────────────────────────────

export interface ToolSequenceAnalysis {
  complexity: number;      // 1-5 scale
  intent: string;          // Detected intent category
  isHabitual: boolean;      // True if common pattern
  description: string;      // Human-readable description
}

/**
 * Normalize tool name for consistent comparison
 * Handles camelCase, PascalCase, snake_case
 */
function normalizeToolName(tool: string): string {
  return tool
    .replace(/([a-z])([A-Z])/g, '$1_$2')  // camelCase → snake_case
    .replace(/-/g, '_')                    // kebab-case → snake_case
    .toLowerCase();
}

/**
 * Analyze a tool sequence to detect patterns and intents
 */
export function analyzeToolSequence(tools: string[]): ToolSequenceAnalysis {
  const toolSet = new Set(tools.map(t => normalizeToolName(t)));
  
  // Detect intent categories (order matters - more specific first)
  let intent = 'general';
  let description = 'Tool sequence';
  
  if (toolSet.has('read') && (toolSet.has('str_replace') || toolSet.has('edit'))) {
    intent = 'edit';
    description = 'Read and modify code';
  } else if (toolSet.has('read') && toolSet.has('grep')) {
    intent = 'search';
    description = 'File search and content exploration';
  } else if (toolSet.has('write')) {
    intent = 'write';
    description = 'File creation or modification';
  } else if (toolSet.has('shell') || toolSet.has('bash')) {
    intent = 'execute';
    description = 'Shell command execution';
  } else if (toolSet.has('glob') || toolSet.has('grep')) {
    intent = 'explore';
    description = 'Project exploration and discovery';
  }
  
  // Complexity based on sequence length and diversity
  const uniqueRatio = toolSet.size / tools.length;
  const complexity = Math.min(5, Math.ceil(
    (tools.length * 0.3) + 
    (uniqueRatio * 2) + 
    (toolSet.size * 0.2)
  ));
  
  // Habitual if same tools used frequently in similar sequence
  const isHabitual = tools.length >= 3 && uniqueRatio < 0.8;
  
  return {
    complexity,
    intent,
    isHabitual,
    description,
  };
}

// ─── CLI Interface ────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo: score a sample pattern
  const sample: ScoringInput = {
    occurrences: 5,
    firstSeen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    lastSeen: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    projectContext: { language: 'typescript', framework: 'react' },
    crossProject: true,
    projectIds: ['project-a', 'project-b'],
    affectedFiles: ['src/App.tsx', 'src/components/Button.tsx'],
  };
  
  console.log('Sample scoring:');
  console.log(JSON.stringify(scorePattern(sample), null, 2));
}
