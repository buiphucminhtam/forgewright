/**
 * Semantic Energy Module for ForgeWright Anti-Hallucination System
 * 
 * Implements Semantic Energy for uncertainty quantification.
 * Based on research showing +13% AUROC improvement over Semantic Entropy.
 */

import type { SemanticEnergyResult } from './types.js';

// ============================================================================
// Semantic Energy Calculation
// ============================================================================

/**
 * Calculate Semantic Energy for uncertainty quantification
 * 
 * Uses ensemble-based method (fallback) since direct logits may not be available.
 * Research: Semantic Energy outperforms Semantic Entropy by +13% AUROC.
 */
export async function calculateSemanticEnergy(
  text: string,
  llm: {
    generate(prompt: string, options?: { temperature: number }): Promise<{ content: string }>;
  },
  options: {
    ensembleSize?: number;
    temperatures?: number[];
  } = {}
): Promise<SemanticEnergyResult> {
  const temperatures = options.temperatures ?? [0.3, 0.5, 0.7, 0.9];
  const ensembleSize = options.ensembleSize ?? temperatures.length;
  
  // Generate ensemble of responses with different temperatures
  const responses: string[] = [];
  const logProbs: number[] = [];
  
  for (const temp of temperatures.slice(0, ensembleSize)) {
    try {
      const response = await llm.generate(text, { temperature: temp });
      responses.push(response.content);
      // Approximate log probability based on temperature
      // Higher temperature = more uniform distribution = higher entropy
      logProbs.push(-temp * Math.log(temp + 0.001));
    } catch {
      // Skip failed generations
    }
  }
  
  if (responses.length === 0) {
    return {
      energy: 1.0,
      uncertainty: 1.0,
      confidence: 0,
      method: 'heuristic',
      details: { variance: 1 },
    };
  }
  
  // Calculate semantic variance using token overlap
  const semanticVariance = calculateSemanticVariance(responses);
  
  // Calculate energy based on variance
  const energy = Math.min(1, semanticVariance);
  
  // Calculate uncertainty
  const uncertainty = semanticVariance;
  
  // Confidence is inverse of uncertainty
  const confidence = 1 - uncertainty;
  
  return {
    energy,
    uncertainty,
    confidence: Math.max(0, confidence),
    method: 'ensemble',
    details: {
      variance: semanticVariance,
      ensembleScores: logProbs,
    },
  };
}

/**
 * Calculate semantic variance between responses
 * Uses token overlap as proxy for semantic similarity
 */
function calculateSemanticVariance(responses: string[]): number {
  if (responses.length < 2) return 0;
  
  const tokens = responses.map(tokenize);
  const n = tokens.length;
  
  // Calculate pairwise similarities
  let totalSimilarity = 0;
  let pairCount = 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const similarity = jaccardSimilarity(tokens[i], tokens[j]);
      totalSimilarity += similarity;
      pairCount++;
    }
  }
  
  const avgSimilarity = pairCount > 0 ? totalSimilarity / pairCount : 0;
  
  // Variance is inverse of similarity
  return 1 - avgSimilarity;
}

/**
 * Simple tokenization
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/[^\w]/g, ''))
      .filter(t => t.length > 2)
  );
}

/**
 * Jaccard similarity between two sets
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// ============================================================================
// Enhanced Confidence with Semantic Energy
// ============================================================================

/**
 * Calculate enhanced confidence combining base signals with Semantic Energy
 */
export async function calculateEnhancedConfidence(
  params: {
    text: string;
    baseConfidence: number;
    evidenceCount?: number;
    citationCount?: number;
  },
  llm: {
    generate(prompt: string, options?: { temperature: number }): Promise<{ content: string }>;
  }
): Promise<{
  confidence: number;
  semanticEnergy: SemanticEnergyResult;
  combinedScore: number;
  factors: string[];
}> {
  const { text, baseConfidence, evidenceCount = 0, citationCount = 0 } = params;
  const factors: string[] = [];
  
  // Calculate Semantic Energy
  const semanticEnergy = await calculateSemanticEnergy(text, llm);
  
  // Calculate evidence factor
  let evidenceFactor = 1;
  if (evidenceCount === 0) {
    evidenceFactor = 0.5;
    factors.push('No evidence (-50%)');
  } else if (evidenceCount >= 3) {
    evidenceFactor = 1.2;
    factors.push('Strong evidence (+20%)');
  }
  
  // Calculate citation factor
  let citationFactor = 1;
  if (citationCount === 0) {
    citationFactor = 0.8;
    factors.push('No citations (-20%)');
  } else if (citationCount >= 2) {
    citationFactor = 1.1;
    factors.push('Good citations (+10%)');
  }
  
  // Combine factors
  // Weight: base confidence 40%, semantic energy 30%, evidence 20%, citations 10%
  const combinedScore = 
    baseConfidence * 0.4 +
    (1 - semanticEnergy.energy) * 0.3 +
    Math.min(1, evidenceCount / 5) * 0.2 +
    Math.min(1, citationCount / 3) * 0.1;
  
  // Adjust by factors
  const finalConfidence = Math.max(0, Math.min(1, combinedScore * evidenceFactor * citationFactor));
  
  factors.push(`Base: ${(baseConfidence * 100).toFixed(0)}%`);
  factors.push(`Semantic Energy: ${(semanticEnergy.energy * 100).toFixed(0)}%`);
  
  return {
    confidence: Math.round(finalConfidence * 100) / 100,
    semanticEnergy,
    combinedScore: Math.round(combinedScore * 100) / 100,
    factors,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate energy threshold for flagging
 */
export function getEnergyThreshold(calibration: 'strict' | 'moderate' | 'lenient'): number {
  switch (calibration) {
    case 'strict':
      return 0.3;
    case 'moderate':
      return 0.5;
    case 'lenient':
      return 0.7;
  }
}

/**
 * Check if energy exceeds threshold
 */
export function isHighEnergy(result: SemanticEnergyResult, threshold: number = 0.5): boolean {
  return result.energy > threshold;
}

/**
 * Get uncertainty level description
 */
export function getUncertaintyLevel(result: SemanticEnergyResult): 'low' | 'medium' | 'high' {
  if (result.uncertainty < 0.3) return 'low';
  if (result.uncertainty < 0.6) return 'medium';
  return 'high';
}

/**
 * Format semantic energy result as string
 */
export function formatSemanticEnergy(result: SemanticEnergyResult): string {
  const level = getUncertaintyLevel(result);
  const levelEmojiMap: Record<string, string> = {
    low: '🟢',
    medium: '🟡',
    high: '🔴',
  };
  const levelEmoji = levelEmojiMap[level] ?? '⚪';
  
  return `${levelEmoji} ${level.toUpperCase()} Uncertainty\n` +
    `  Energy: ${(result.energy * 100).toFixed(1)}%\n` +
    `  Confidence: ${(result.confidence * 100).toFixed(1)}%\n` +
    `  Method: ${result.method}`;
}

/**
 * Create a combined confidence and energy check
 */
export function combinedCheck(
  confidence: number,
  semanticEnergy: SemanticEnergyResult
): {
  passed: boolean;
  confidence: number;
  energy: number;
  warnings: string[];
  recommendations: string[];
} {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  // Check confidence threshold
  if (confidence < 0.7) {
    warnings.push(`Low confidence: ${(confidence * 100).toFixed(0)}%`);
    recommendations.push('Add more evidence to support claims');
  }
  
  // Check semantic energy
  if (isHighEnergy(semanticEnergy, 0.5)) {
    warnings.push(`High semantic energy: ${(semanticEnergy.energy * 100).toFixed(0)}%`);
    recommendations.push('Content shows high variability - verify claims');
  }
  
  // Overall check
  const passed = confidence >= 0.7 && !isHighEnergy(semanticEnergy, 0.5);
  
  return {
    passed,
    confidence,
    energy: semanticEnergy.energy,
    warnings,
    recommendations,
  };
}
