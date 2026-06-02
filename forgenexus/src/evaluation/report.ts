/**
 * Evaluation Report Generator
 * 
 * Generates detailed evaluation reports from evaluation results.
 */

import type {
  EvaluationResult,
  AggregateMetrics,
  CaseMetrics,
  CaseDetails,
} from './runner.js';
import type { EvaluationCase } from './dataset.js';

// ============================================================================
// Report Types
// ============================================================================

export interface EvaluationResults {
  total: number;
  passed: number;
  failed: number;
  accuracy: number;
  precision: number;
  recall: number;
  ece: number;
  hallucinationRate: number;
  citationAccuracy: number;
  averageConfidence: number;
  cases: CaseResult[];
}

export interface CaseResult {
  id: string;
  category: string;
  type: string;
  difficulty: string;
  passed: boolean;
  accuracy: number;
  precision: number;
  recall: number;
  hallucinationRate: number;
  citationAccuracy: number;
  confidence: number;
  expectedClaims: number;
  actualClaims: number;
  verifiedClaims: number;
  hallucinations: string[];
  missingCitations: string[];
  reason?: string;
}

export interface EvalReport {
  timestamp: string;
  totalCases: number;
  passed: number;
  failed: number;
  accuracy: number;
  precision: number;
  recall: number;
  ece: number;
  hallucinationRate: number;
  citationAccuracy: number;
  averageConfidence: number;
  categories: Record<string, CategoryStats>;
  difficulties: Record<string, CategoryStats>;
  types: Record<string, CategoryStats>;
  calibrationBins: CalibrationBinResult[];
  failedCases: FailedCase[];
  eceTargetMet: boolean;
  hallucinationTargetMet: boolean;
  accuracyTargetMet: boolean;
}

export interface CategoryStats {
  passed: number;
  failed: number;
  total: number;
  accuracy: number;
  precision: number;
  recall: number;
  hallucinationRate: number;
}

export interface CalibrationBinResult {
  range: string;
  count: number;
  avgConfidence: number;
  avgAccuracy: number;
}

export interface FailedCase {
  id: string;
  category: string;
  type: string;
  difficulty: string;
  reason: string;
  metrics: {
    accuracy: number;
    hallucinationRate: number;
    citationAccuracy: number;
  };
}

// ============================================================================
// Targets (from Phase 4 Plan)
// ============================================================================

export const EVAL_TARGETS = {
  accuracy: 0.8,        // 80% minimum accuracy
  ece: 0.1,             // ECE < 0.1 (well-calibrated)
  hallucinationRate: 0.1, // < 10% hallucination rate
  citationAccuracy: 0.85, // 85% citation accuracy
};

// ============================================================================
// Results Transformation
// ============================================================================

export function transformResults(
  cases: EvaluationResult[],
  testCases: EvaluationCase[]
): EvaluationResults {
  const total = cases.length;
  const passed = cases.filter(c => c.passed).length;
  const failed = total - passed;

  // Calculate aggregate metrics
  const accuracy = total > 0
    ? cases.reduce((sum, c) => sum + c.metrics.accuracy, 0) / total
    : 0;
  const precision = total > 0
    ? cases.reduce((sum, c) => sum + c.metrics.precision, 0) / total
    : 0;
  const recall = total > 0
    ? cases.reduce((sum, c) => sum + c.metrics.recall, 0) / total
    : 0;
  const hallucinationRate = total > 0
    ? cases.reduce((sum, c) => sum + c.metrics.hallucinationRate, 0) / total
    : 0;
  const citationAccuracy = total > 0
    ? cases.reduce((sum, c) => sum + c.metrics.citationAccuracy, 0) / total
    : 0;

  // Calculate average confidence from test cases
  const averageConfidence = total > 0
    ? testCases.reduce((sum, c) => sum + c.expected.confidence, 0) / total
    : 0;

  // Transform cases to CaseResult format
  const caseResults: CaseResult[] = cases.map((c, i) => {
    const testCase = testCases[i];
    return {
      id: c.caseId,
      category: testCase?.tags[0] || 'unknown',
      type: c.type,
      difficulty: testCase?.difficulty || 'unknown',
      passed: c.passed,
      accuracy: c.metrics.accuracy,
      precision: c.metrics.precision,
      recall: c.metrics.recall,
      hallucinationRate: c.metrics.hallucinationRate,
      citationAccuracy: c.metrics.citationAccuracy,
      confidence: testCase?.expected.confidence || 0,
      expectedClaims: c.details.expectedClaims,
      actualClaims: c.details.actualClaims,
      verifiedClaims: c.details.verifiedClaims,
      hallucinations: c.details.hallucinations,
      missingCitations: c.details.missingCitations,
      reason: !c.passed ? getFailureReason(c, testCase) : undefined,
    };
  });

  return {
    total,
    passed,
    failed,
    accuracy,
    precision,
    recall,
    ece: calculateECE(cases),
    hallucinationRate,
    citationAccuracy,
    averageConfidence,
    cases: caseResults,
  };
}

function getFailureReason(result: EvaluationResult, testCase?: EvaluationCase): string {
  const reasons: string[] = [];

  if (result.metrics.accuracy < EVAL_TARGETS.accuracy) {
    reasons.push(`Low accuracy (${(result.metrics.accuracy * 100).toFixed(1)}% < ${(EVAL_TARGETS.accuracy * 100)}%)`);
  }

  if (result.metrics.hallucinationRate >= EVAL_TARGETS.hallucinationRate * 2) {
    reasons.push(`High hallucination rate (${(result.metrics.hallucinationRate * 100).toFixed(1)}%)`);
  }

  if (result.details.missingCitations.length > 0) {
    reasons.push('Missing citations');
  }

  if (result.details.hallucinations.length > 0) {
    reasons.push(`Hallucinations detected: ${result.details.hallucinations.slice(0, 2).join(', ')}`);
  }

  if (testCase?.groundTruth.incorrectClaims && testCase.groundTruth.incorrectClaims.length > 0) {
    reasons.push('Contains incorrect claims from ground truth');
  }

  return reasons.length > 0 ? reasons.join('; ') : 'Unknown failure';
}

// ============================================================================
// ECE Calculation
// ============================================================================

function calculateECE(cases: EvaluationResult[]): number {
  const bins = 10;
  const binSize = 1 / bins;
  const binCounts = new Array(bins).fill(0);
  const binAccuracies = new Array(bins).fill(0);
  const binConfidences = new Array(bins).fill(0);

  for (const c of cases) {
    // Calculate actual accuracy for this case
    const actualAccuracy = c.details.expectedClaims > 0
      ? c.details.verifiedClaims / c.details.expectedClaims
      : 0;

    // Calculate confidence (from test case expectation)
    const confidence = c.details.expectedClaims > 0
      ? c.details.verifiedClaims / c.details.expectedClaims
      : actualAccuracy;

    // Find the bin
    const binIndex = Math.min(Math.floor(confidence * bins), bins - 1);
    binCounts[binIndex]++;
    binAccuracies[binIndex] += actualAccuracy;
    binConfidences[binIndex] += confidence;
  }

  let ece = 0;
  for (let i = 0; i < bins; i++) {
    if (binCounts[i] === 0) continue;

    const avgAccuracy = binAccuracies[i] / binCounts[i];
    const avgConfidence = binConfidences[i] / binCounts[i];
    ece += (binCounts[i] / cases.length) * Math.abs(avgConfidence - avgAccuracy);
  }

  return ece;
}

// ============================================================================
// Report Generation
// ============================================================================

export function generateReport(results: EvaluationResults): EvalReport {
  const {
    total,
    passed,
    failed,
    accuracy,
    precision,
    recall,
    ece,
    hallucinationRate,
    citationAccuracy,
    averageConfidence,
    cases,
  } = results;

  // Calculate category stats
  const categories: Record<string, CategoryStats> = {};
  const difficulties: Record<string, CategoryStats> = {};
  const types: Record<string, CategoryStats> = {};

  for (const c of cases) {
    // By category (first tag)
    if (!categories[c.category]) {
      categories[c.category] = { passed: 0, failed: 0, total: 0, accuracy: 0, precision: 0, recall: 0, hallucinationRate: 0 };
    }
    if (c.passed) categories[c.category].passed++;
    else categories[c.category].failed++;
    categories[c.category].total++;

    // By difficulty
    if (!difficulties[c.difficulty]) {
      difficulties[c.difficulty] = { passed: 0, failed: 0, total: 0, accuracy: 0, precision: 0, recall: 0, hallucinationRate: 0 };
    }
    if (c.passed) difficulties[c.difficulty].passed++;
    else difficulties[c.difficulty].failed++;
    difficulties[c.difficulty].total++;

    // By type
    if (!types[c.type]) {
      types[c.type] = { passed: 0, failed: 0, total: 0, accuracy: 0, precision: 0, recall: 0, hallucinationRate: 0 };
    }
    if (c.passed) types[c.type].passed++;
    else types[c.type].failed++;
    types[c.type].total++;
  }

  // Calculate category accuracies
  for (const cat of Object.keys(categories)) {
    const s = categories[cat];
    s.accuracy = s.total > 0 ? s.passed / s.total : 0;
  }
  for (const diff of Object.keys(difficulties)) {
    const s = difficulties[diff];
    s.accuracy = s.total > 0 ? s.passed / s.total : 0;
  }
  for (const type of Object.keys(types)) {
    const s = types[type];
    s.accuracy = s.total > 0 ? s.passed / s.total : 0;
  }

  // Get failed cases
  const failedCases: FailedCase[] = cases
    .filter(c => !c.passed)
    .map(c => ({
      id: c.id,
      category: c.category,
      type: c.type,
      difficulty: c.difficulty,
      reason: c.reason || 'Unknown',
      metrics: {
        accuracy: c.accuracy,
        hallucinationRate: c.hallucinationRate,
        citationAccuracy: c.citationAccuracy,
      },
    }));

  // Calculate calibration bins
  const calibrationBins = calculateCalibrationBins(cases);

  return {
    timestamp: new Date().toISOString(),
    totalCases: total,
    passed,
    failed,
    accuracy,
    precision,
    recall,
    ece,
    hallucinationRate,
    citationAccuracy,
    averageConfidence,
    categories,
    difficulties,
    types,
    calibrationBins,
    failedCases,
    eceTargetMet: ece < EVAL_TARGETS.ece,
    hallucinationTargetMet: hallucinationRate < EVAL_TARGETS.hallucinationRate,
    accuracyTargetMet: accuracy >= EVAL_TARGETS.accuracy,
  };
}

function calculateCalibrationBins(cases: CaseResult[]): CalibrationBinResult[] {
  const bins = 10;
  const binSize = 1 / bins;
  const binData: { count: number; accuracySum: number; confidenceSum: number }[] = [];

  for (let i = 0; i < bins; i++) {
    binData.push({ count: 0, accuracySum: 0, confidenceSum: 0 });
  }

  for (const c of cases) {
    const binIndex = Math.min(Math.floor(c.confidence * bins), bins - 1);
    binData[binIndex].count++;
    binData[binIndex].accuracySum += c.accuracy;
    binData[binIndex].confidenceSum += c.confidence;
  }

  return binData.map((d, i) => ({
    range: `${(i * binSize * 100).toFixed(0)}-${((i + 1) * binSize * 100).toFixed(0)}%`,
    count: d.count,
    avgConfidence: d.count > 0 ? d.confidenceSum / d.count : 0,
    avgAccuracy: d.count > 0 ? d.accuracySum / d.count : 0,
  }));
}

// ============================================================================
// Formatters
// ============================================================================

export function formatReport(report: EvalReport): string {
  const lines: string[] = [];

  // Header
  lines.push('# ForgeNexus Evaluation Report');
  lines.push('');
  lines.push(`**Generated**: ${report.timestamp}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value | Target | Status |');
  lines.push('|--------|-------|--------|--------|');

  const formatTarget = (value: number, target: number, lowerIsBetter = false): string => {
    const met = lowerIsBetter ? value < target : value >= target;
    return met ? '✅' : '❌';
  };

  lines.push(`| Total Cases | ${report.totalCases} | - | - |`);
  lines.push(`| Passed | ${report.passed} | - | - |`);
  lines.push(`| Failed | ${report.failed} | - | - |`);
  lines.push(`| **Accuracy** | **${(report.accuracy * 100).toFixed(1)}%** | ≥${(EVAL_TARGETS.accuracy * 100)}% | ${formatTarget(report.accuracy, EVAL_TARGETS.accuracy)} |`);
  lines.push(`| Precision | ${(report.precision * 100).toFixed(1)}% | - | - |`);
  lines.push(`| Recall | ${(report.recall * 100).toFixed(1)}% | - | - |`);
  lines.push(`| **ECE** | **${report.ece.toFixed(3)}** | <${EVAL_TARGETS.ece} | ${formatTarget(report.ece, EVAL_TARGETS.ece, true)} |`);
  lines.push(`| **Hallucination Rate** | **${(report.hallucinationRate * 100).toFixed(1)}%** | <${(EVAL_TARGETS.hallucinationRate * 100)}% | ${formatTarget(report.hallucinationRate, EVAL_TARGETS.hallucinationRate, true)} |`);
  lines.push(`| Citation Accuracy | ${(report.citationAccuracy * 100).toFixed(1)}% | ≥${(EVAL_TARGETS.citationAccuracy * 100)}% | ${formatTarget(report.citationAccuracy, EVAL_TARGETS.citationAccuracy)} |`);
  lines.push(`| Avg Confidence | ${(report.averageConfidence * 100).toFixed(1)}% | - | - |`);
  lines.push('');

  // Targets summary
  lines.push('### Targets Summary');
  lines.push('');
  lines.push(`- Accuracy ≥${(EVAL_TARGETS.accuracy * 100)}%: ${report.accuracyTargetMet ? '✅ MET' : '❌ NOT MET'}`);
  lines.push(`- ECE <${EVAL_TARGETS.ece}: ${report.eceTargetMet ? '✅ MET' : '❌ NOT MET'}`);
  lines.push(`- Hallucination Rate <${(EVAL_TARGETS.hallucinationRate * 100)}%: ${report.hallucinationTargetMet ? '✅ MET' : '❌ NOT MET'}`);
  lines.push('');

  // By Type
  lines.push('## By Type');
  lines.push('');
  lines.push('| Type | Passed | Failed | Total | Accuracy |');
  lines.push('|------|--------|--------|-------|----------|');

  for (const [type, stats] of Object.entries(report.types)) {
    const pct = (stats.accuracy * 100).toFixed(1);
    lines.push(`| ${type} | ${stats.passed} | ${stats.failed} | ${stats.total} | ${pct}% |`);
  }
  lines.push('');

  // By Difficulty
  lines.push('## By Difficulty');
  lines.push('');
  lines.push('| Difficulty | Passed | Failed | Total | Accuracy |');
  lines.push('|------------|--------|--------|-------|----------|');

  const difficultyOrder = ['easy', 'medium', 'hard'];
  for (const diff of difficultyOrder) {
    if (report.difficulties[diff]) {
      const stats = report.difficulties[diff];
      const pct = (stats.accuracy * 100).toFixed(1);
      lines.push(`| ${diff} | ${stats.passed} | ${stats.failed} | ${stats.total} | ${pct}% |`);
    }
  }
  lines.push('');

  // Calibration Bins
  lines.push('## Confidence Calibration');
  lines.push('');
  lines.push('| Bin | Count | Avg Confidence | Avg Accuracy | Gap |');
  lines.push('|-----|-------|---------------|--------------|-----|');

  for (const bin of report.calibrationBins) {
    const gap = Math.abs(bin.avgConfidence - bin.avgAccuracy);
    const gapIcon = gap < 0.1 ? '✅' : gap < 0.2 ? '⚠️' : '❌';
    lines.push(`| ${bin.range} | ${bin.count} | ${(bin.avgConfidence * 100).toFixed(1)}% | ${(bin.avgAccuracy * 100).toFixed(1)}% | ${gapIcon} ${gap.toFixed(2)} |`);
  }
  lines.push('');

  // Failed Cases
  if (report.failedCases.length > 0) {
    lines.push('## Failed Cases');
    lines.push('');

    for (const fc of report.failedCases) {
      lines.push(`### ${fc.id} (${fc.type}/${fc.difficulty})`);
      lines.push(`- **Category**: ${fc.category}`);
      lines.push(`- **Reason**: ${fc.reason}`);
      lines.push(`- **Metrics**: Accuracy ${(fc.metrics.accuracy * 100).toFixed(1)}%, Hallucination ${(fc.metrics.hallucinationRate * 100).toFixed(1)}%, Citations ${(fc.metrics.citationAccuracy * 100).toFixed(1)}%`);
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push(`*Report generated at ${report.timestamp}*`);

  return lines.join('\n');
}

export function formatJSON(report: EvalReport): string {
  return JSON.stringify(report, null, 2);
}

// ============================================================================
// runEval - Main Entry Point
// ============================================================================

export async function runEval(
  system: import('./runner.js').SystemUnderTest
): Promise<EvaluationResults> {
  const { EvaluationRunner } = await import('./runner.js');
  const { EVALUATION_DATASET } = await import('./dataset.js');

  const runner = new EvaluationRunner(system);
  const results = await runner.runAll(EVALUATION_DATASET);

  return transformResults(results, EVALUATION_DATASET);
}
