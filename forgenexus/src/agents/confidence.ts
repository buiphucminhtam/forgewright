/**
 * Confidence Module for ForgeWright Anti-Hallucination System
 * 
 * Provides confidence calculation based on multiple signals including
 * relevance, spread, evidence strength, and behavioral thresholds.
 */

import type { ConfidenceConfig, ConfidenceResult, ConfidenceLevel, ConfidenceBehavior, ConfidenceParams, SearchResult, Evidence } from './types.js';
import { DEFAULT_CONFIDENCE_CONFIG } from './types.js';

// ============================================================================
// Core Confidence Calculation
// ============================================================================

/**
 * Calculate confidence score based on various parameters
 */
export function calculateConfidence(params: ConfidenceParams): ConfidenceResult {
  switch (params.type) {
    case 'query':
      return calculateQueryConfidence(params.results ?? []);
    case 'wiki':
      return calculateWikiConfidence(params.evidence ?? []);
    case 'impact':
      return calculateImpactConfidence(params.evidence ?? []);
    case 'binding':
      return calculateBindingConfidence(params.bindings);
    default:
      return {
        level: 'medium',
        score: 0.5,
        behavior: 'note',
        reasons: ['Unknown type'],
        flags: ['unknown_type'],
      };
  }
}

/**
 * Calculate confidence for query results
 */
export function calculateQueryConfidence(results: SearchResult[]): ConfidenceResult {
  if (results.length === 0) {
    return {
      level: 'critical',
      score: 0,
      behavior: 'refuse',
      reasons: ['No results found'],
      flags: ['no_results'],
    };
  }

  const reasons: string[] = [];
  const flags: string[] = [];

  // Calculate average relevance
  const avgRelevance = results.reduce((sum, r) => sum + r.relevance, 0) / results.length;
  reasons.push(`Average relevance: ${(avgRelevance * 100).toFixed(0)}%`);

  // Calculate spread (variance in relevance scores)
  const variance = calculateVariance(results.map(r => r.relevance));
  const spread = Math.sqrt(variance);
  
  if (spread > 0.3) {
    flags.push('high_variance');
    reasons.push(`High variance in results (${(spread * 100).toFixed(0)}%)`);
  }

  // Score based on relevance and spread
  let score = avgRelevance * 0.7 + (1 - spread) * 0.3;

  // Apply penalties
  if (results.length > 20) {
    flags.push('too_many_results');
    score *= 0.8;
    reasons.push('Result count reduced confidence (too many results)');
  }

  if (avgRelevance < 0.5) {
    flags.push('low_relevance');
    reasons.push('Low relevance average');
  }

  // Apply bonuses
  if (results.length >= 3 && results.length <= 10) {
    score = Math.min(1, score * 1.1);
    reasons.push('Optimal result count');
  }

  // Normalize score
  score = Math.max(0, Math.min(1, score));

  return createConfidenceResult(score, flags, reasons);
}

/**
 * Calculate confidence for wiki/documentation content
 */
export function calculateWikiConfidence(evidence: Evidence[]): ConfidenceResult {
  const reasons: string[] = [];
  const flags: string[] = [];

  if (evidence.length === 0) {
    return {
      level: 'critical',
      score: 0,
      behavior: 'refuse',
      reasons: ['No evidence provided'],
      flags: ['no_evidence'],
    };
  }

  // Evidence quantity
  reasons.push(`Evidence count: ${evidence.length}`);
  if (evidence.length >= 5) {
    reasons.push('Strong evidence base');
  } else if (evidence.length >= 3) {
    reasons.push('Moderate evidence base');
  } else {
    flags.push('low_evidence_count');
    reasons.push('Limited evidence base');
  }

  // Evidence quality
  const avgRelevance = evidence.reduce((sum, e) => sum + e.relevance, 0) / evidence.length;
  reasons.push(`Evidence relevance: ${(avgRelevance * 100).toFixed(0)}%`);

  if (avgRelevance < 0.6) {
    flags.push('low_evidence_relevance');
    reasons.push('Evidence has low relevance');
  }

  // Evidence diversity
  const types = new Set(evidence.map(e => e.type));
  if (types.size >= 3) {
    reasons.push('Diverse evidence types');
  } else if (types.size === 1) {
    flags.push('single_evidence_type');
    reasons.push('All evidence from same source type');
  }

  // Calculate score
  let score = avgRelevance * 0.5 + Math.min(evidence.length / 10, 1) * 0.3 + (types.size / 5) * 0.2;
  
  // Penalize low evidence count
  if (evidence.length < 3) {
    score *= 0.7;
  }

  // Normalize
  score = Math.max(0, Math.min(1, score));

  return createConfidenceResult(score, flags, reasons);
}

/**
 * Calculate confidence for impact analysis
 */
export function calculateImpactConfidence(evidence: Evidence[]): ConfidenceResult {
  const reasons: string[] = [];
  const flags: string[] = [];

  if (evidence.length === 0) {
    return {
      level: 'critical',
      score: 0,
      behavior: 'refuse',
      reasons: ['No impact evidence found'],
      flags: ['no_evidence'],
    };
  }

  // Evidence strength for impact analysis
  const codeEvidence = evidence.filter(e => e.type === 'code');
  const otherEvidence = evidence.filter(e => e.type !== 'code');

  reasons.push(`Code evidence: ${codeEvidence.length}`);
  reasons.push(`Other evidence: ${otherEvidence.length}`);

  if (codeEvidence.length === 0) {
    flags.push('no_code_evidence');
    reasons.push('No direct code evidence for impact');
  }

  // Calculate score
  let score = 0.5;
  
  if (codeEvidence.length >= 3) {
    score += 0.3;
    reasons.push('Strong code evidence');
  } else if (codeEvidence.length >= 1) {
    score += 0.15;
  }

  if (otherEvidence.length >= 2) {
    score += 0.1;
    reasons.push('Supporting documentation');
  }

  // Penalize missing code evidence
  if (codeEvidence.length === 0 && otherEvidence.length < 2) {
    score *= 0.5;
    flags.push('weak_impact_evidence');
  }

  // Normalize
  score = Math.max(0, Math.min(1, score));

  return createConfidenceResult(score, flags, reasons);
}

/**
 * Calculate confidence for binding analysis
 */
export function calculateBindingConfidence(bindings?: { isConsistent: boolean; issues: unknown[] }): ConfidenceResult {
  if (!bindings) {
    return {
      level: 'critical',
      score: 0,
      behavior: 'refuse',
      reasons: ['No binding analysis provided'],
      flags: ['no_bindings'],
    };
  }

  const reasons: string[] = [];
  const flags: string[] = [];

  if (bindings.isConsistent) {
    reasons.push('Binding analysis is consistent');
  } else {
    flags.push('binding_inconsistencies');
    reasons.push(`Found ${bindings.issues.length} binding issues`);
  }

  let score = bindings.isConsistent ? 0.9 : 0.4;
  
  // Reduce based on issue count
  if (bindings.issues.length > 5) {
    score *= 0.5;
    flags.push('many_binding_issues');
  } else if (bindings.issues.length > 0) {
    score *= 0.8;
  }

  return createConfidenceResult(score, flags, reasons);
}

// ============================================================================
// Confidence Result Creation
// ============================================================================

/**
 * Create a confidence result with proper level and behavior
 */
export function createConfidenceResult(
  score: number,
  flags: string[],
  reasons: string[]
): ConfidenceResult {
  const level = getConfidenceLevel(score);
  const behavior = getBehavior(level);

  return {
    level,
    score: Math.round(score * 100) / 100,
    behavior,
    reasons,
    flags,
  };
}

/**
 * Determine confidence level from score
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.9) return 'high';
  if (score >= 0.7) return 'medium';
  if (score >= 0.5) return 'low';
  return 'critical';
}

/**
 * Get default behavior for a confidence level
 */
export function getBehavior(level: ConfidenceLevel): ConfidenceBehavior {
  switch (level) {
    case 'high':
      return 'note';
    case 'medium':
      return 'warn';
    case 'low':
      return 'block';
    case 'critical':
      return 'refuse';
  }
}

// ============================================================================
// Behavior Application
// ============================================================================

/**
 * Apply behavior based on confidence result
 */
export function applyBehavior(result: ConfidenceResult): BehaviorAction {
  const actions: Record<ConfidenceBehavior, BehaviorAction> = {
    note: {
      type: 'note',
      message: result.reasons.join('; '),
      shouldContinue: true,
      shouldBlock: false,
    },
    warn: {
      type: 'warn',
      message: `Warning: ${result.reasons.join('; ')}`,
      shouldContinue: true,
      shouldBlock: false,
    },
    block: {
      type: 'block',
      message: `Blocked: ${result.reasons.join('; ')}`,
      shouldContinue: false,
      shouldBlock: true,
      blockers: result.flags,
    },
    refuse: {
      type: 'refuse',
      message: `Refused: ${result.reasons.join('; ')}`,
      shouldContinue: false,
      shouldBlock: true,
      blockers: result.flags,
      requiresClarification: true,
    },
    clarify: {
      type: 'clarify',
      message: `Clarification needed: ${result.reasons.join('; ')}`,
      shouldContinue: false,
      shouldBlock: true,
      blockers: result.flags,
      requiresClarification: true,
    },
  };

  return actions[result.behavior];
}

export interface BehaviorAction {
  type: 'note' | 'warn' | 'block' | 'refuse' | 'clarify';
  message: string;
  shouldContinue: boolean;
  shouldBlock: boolean;
  blockers?: string[];
  requiresClarification?: boolean;
}

/**
 * Apply confidence with custom configuration
 */
export function applyConfidenceConfig(
  params: ConfidenceParams,
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG
): ConfidenceResult {
  const result = calculateConfidence(params);

  // Adjust level based on custom thresholds
  let adjustedScore = result.score;
  const reasons = [...result.reasons];
  const flags = [...result.flags];

  if (adjustedScore >= config.thresholds.high) {
    // High confidence - no changes
  } else if (adjustedScore >= config.thresholds.medium) {
    if (config.behaviors.medium === 'block') {
      adjustedScore = Math.min(adjustedScore, config.thresholds.medium - 0.01);
    }
  } else if (adjustedScore >= config.thresholds.low) {
    if (config.behaviors.low === 'block') {
      adjustedScore = Math.min(adjustedScore, config.thresholds.low - 0.01);
    }
  } else {
    if (config.behaviors.critical === 'refuse' || config.behaviors.critical === 'clarify') {
      adjustedScore = 0;
    }
  }

  return {
    ...result,
    score: adjustedScore,
    level: getConfidenceLevel(adjustedScore),
    behavior: getBehavior(getConfidenceLevel(adjustedScore)),
    reasons,
    flags,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate variance of an array
 */
export function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  
  return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
export function calculateStdDev(values: number[]): number {
  return Math.sqrt(calculateVariance(values));
}

/**
 * Calculate mean of an array
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Combine multiple confidence scores
 */
export function combineConfidenceScores(scores: number[]): number {
  if (scores.length === 0) return 0;
  
  // Geometric mean for combining probabilities
  const product = scores.reduce((prod, s) => prod * s, 1);
  return Math.pow(product, 1 / scores.length);
}

/**
 * Check if confidence meets threshold
 */
export function meetsThreshold(
  result: ConfidenceResult,
  threshold: number
): boolean {
  return result.score >= threshold;
}

/**
 * Get summary string for confidence result
 */
export function getConfidenceSummary(result: ConfidenceResult): string {
  const levelEmojiMap: Record<string, string> = {
    high: '🟢',
    medium: '🟡',
    low: '🟠',
    critical: '🔴',
  };
  const levelEmoji = levelEmojiMap[result.level] ?? '⚪';

  const reasons = result.reasons.slice(0, 2).join('; ');
  
  return `${levelEmoji} ${result.level.toUpperCase()} (${result.score.toFixed(2)}): ${reasons}`;
}
