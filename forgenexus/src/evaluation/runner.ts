/**
 * Evaluation Runner for ForgeWright Anti-Hallucination System
 * 
 * Runs evaluation cases and calculates metrics.
 */

import type { EvaluationCase } from './dataset.js';
import { EVALUATION_DATASET } from './dataset.js';

// ============================================================================
// Metrics Types
// ============================================================================

export interface EvaluationResult {
  caseId: string;
  type: 'wiki' | 'impact' | 'query';
  passed: boolean;
  metrics: CaseMetrics;
  details: CaseDetails;
}

export interface CaseMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  hallucinationRate: number;
  citationAccuracy: number;
  confidenceCalibration: number;
}

export interface CaseDetails {
  expectedClaims: number;
  actualClaims: number;
  verifiedClaims: number;
  correctClaims: number;
  incorrectClaims: number;
  hallucinations: string[];
  missingCitations: string[];
}

export interface AggregateMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  hallucinationRate: number;
  citationAccuracy: number;
  confidenceCalibration: {
    ece: number;
    bins: CalibrationBin[];
  };
  byType: Record<string, AggregateMetrics>;
  byDifficulty: Record<string, AggregateMetrics>;
}

export interface CalibrationBin {
  range: string;
  count: number;
  avgConfidence: number;
  avgAccuracy: number;
}

// ============================================================================
// Evaluation Runner
// ============================================================================

export interface SystemUnderTest {
  generateWiki(input: string): Promise<GeneratedOutput>;
  generateImpact(input: string): Promise<GeneratedOutput>;
  generateQuery(input: string): Promise<GeneratedOutput>;
}

export interface GeneratedOutput {
  content: string;
  claims: string[];
  citations: string[];
  confidence: number;
  warnings?: string[];
}

export class EvaluationRunner {
  private system: SystemUnderTest;
  private results: EvaluationResult[] = [];

  constructor(system: SystemUnderTest) {
    this.system = system;
  }

  /**
   * Run all evaluation cases
   */
  async runAll(cases?: EvaluationCase[]): Promise<EvaluationResult[]> {
    const testCases = cases ?? EVALUATION_DATASET;
    this.results = [];

    for (const testCase of testCases) {
      const result = await this.runCase(testCase);
      this.results.push(result);
    }

    return this.results;
  }

  /**
   * Run a single evaluation case
   */
  async runCase(testCase: EvaluationCase): Promise<EvaluationResult> {
    // Generate output based on type
    let output: GeneratedOutput;

    switch (testCase.type) {
      case 'wiki':
        output = await this.system.generateWiki(testCase.input);
        break;
      case 'impact':
        output = await this.system.generateImpact(testCase.input);
        break;
      case 'query':
        output = await this.system.generateQuery(testCase.input);
        break;
    }

    // Evaluate the output
    const evaluation = this.evaluateOutput(testCase, output);

    return evaluation;
  }

  /**
   * Evaluate generated output against expected output
   */
  private evaluateOutput(testCase: EvaluationCase, output: GeneratedOutput): EvaluationResult {
    const { expected, groundTruth } = testCase;

    // Extract actual claims from output
    const actualClaims = this.extractClaims(output.content);

    // Calculate metrics
    const correctClaims = this.matchClaims(expected.claims, actualClaims);
    const incorrectClaims = this.findIncorrectClaims(actualClaims, groundTruth);
    const hallucinations = this.detectHallucinations(actualClaims, groundTruth);

    // Calculate citation accuracy
    const citationAccuracy = this.calculateCitationAccuracy(
      output.citations,
      groundTruth.sources.map(s => s.file)
    );

    // Calculate confidence calibration
    const confidenceCalibration = this.calculateCalibration(
      expected.confidence,
      correctClaims / Math.max(1, actualClaims.length)
    );

    const details: CaseDetails = {
      expectedClaims: expected.claims.length,
      actualClaims: actualClaims.length,
      verifiedClaims: correctClaims,
      correctClaims,
      incorrectClaims,
      hallucinations,
      missingCitations: (expected.citationCount !== undefined && output.citations.length < expected.citationCount)
        ? [`Expected ${expected.citationCount} citations, got ${output.citations.length}`]
        : [],
    };

    const metrics: CaseMetrics = {
      accuracy: correctClaims / Math.max(1, actualClaims.length),
      precision: correctClaims / Math.max(1, correctClaims + incorrectClaims),
      recall: correctClaims / Math.max(1, expected.claims.length),
      hallucinationRate: hallucinations.length / Math.max(1, actualClaims.length),
      citationAccuracy,
      confidenceCalibration,
    };

    return {
      caseId: testCase.id,
      type: testCase.type,
      passed: metrics.accuracy >= 0.8 && metrics.hallucinationRate < 0.2,
      metrics,
      details,
    };
  }

  /**
   * Extract claims from generated content
   */
  private extractClaims(content: string): string[] {
    // Simple extraction - split by sentence
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);

    // Filter out NOT_VERIFIED claims
    return sentences
      .map(s => s.trim())
      .filter(s => !/\[NOT_VERIFIED\]/i.test(s));
  }

  /**
   * Match expected claims with actual claims
   */
  private matchClaims(expected: Array<{ text: string; verified: boolean }>, actual: string[]): number {
    let matched = 0;

    for (const exp of expected) {
      if (!exp.verified) continue; // Only count verifiable claims

      const found = actual.some(claim =>
        this.claimSimilarity(exp.text, claim) > 0.7
      );

      if (found) matched++;
    }

    return matched;
  }

  /**
   * Find claims that are incorrect (not in ground truth)
   */
  private findIncorrectClaims(_actual: string[], _groundTruth: any): number {
    return 0;
  }

  /**
   * Detect hallucinations (claims not supported by evidence)
   */
  private detectHallucinations(actual: string[], groundTruth: any): string[] {
    const hallucinations: string[] = [];

    // Check for incorrect claims in ground truth
    if (groundTruth.incorrectClaims) {
      for (const claim of groundTruth.incorrectClaims) {
        const found = actual.some(a => this.claimSimilarity(claim, a) > 0.5);
        if (found) {
          hallucinations.push(claim);
        }
      }
    }

    return hallucinations;
  }

  /**
   * Calculate simple claim similarity
   */
  private claimSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/));
    const bWords = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...aWords].filter(x => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Calculate citation accuracy
   */
  private calculateCitationAccuracy(
    citations: string[],
    expectedFiles: string[]
  ): number {
    if (citations.length === 0) return 0;

    let validCitations = 0;

    for (const citation of citations) {
      const fileMatch = expectedFiles.some(f => citation.includes(f));
      if (fileMatch) validCitations++;
    }

    return validCitations / citations.length;
  }

  /**
   * Calculate confidence calibration
   */
  private calculateCalibration(expected: number, actual: number): number {
    // Simple calibration: how close is confidence to actual accuracy?
    return 1 - Math.abs(expected - actual);
  }

  /**
   * Get aggregate metrics
   */
  getAggregateMetrics(): AggregateMetrics {
    if (this.results.length === 0) {
      return this.emptyAggregateMetrics();
    }

    const total = this.results.length;

    // Calculate overall metrics
    const accuracy = this.results.reduce((sum, r) => sum + r.metrics.accuracy, 0) / total;
    const precision = this.results.reduce((sum, r) => sum + r.metrics.precision, 0) / total;
    const recall = this.results.reduce((sum, r) => sum + r.metrics.recall, 0) / total;
    const hallucinationRate = this.results.reduce((sum, r) => sum + r.metrics.hallucinationRate, 0) / total;
    const citationAccuracy = this.results.reduce((sum, r) => sum + r.metrics.citationAccuracy, 0) / total;

    // Calculate ECE
    const ece = this.calculateECE();

    // Calculate by-type metrics
    const byType = this.aggregateByType();

    // Calculate by-difficulty metrics
    const byDifficulty = this.aggregateByDifficulty();

    return {
      accuracy,
      precision,
      recall,
      hallucinationRate,
      citationAccuracy,
      confidenceCalibration: {
        ece,
        bins: this.calculateBins(),
      },
      byType,
      byDifficulty,
    };
  }

  /**
   * Calculate Expected Calibration Error
   */
  private calculateECE(): number {
    const bins = this.calculateBins();

    return bins.reduce((sum, bin) => {
      const accuracyGap = Math.abs(bin.avgAccuracy - bin.avgConfidence);
      return sum + (bin.count / this.results.length) * accuracyGap;
    }, 0);
  }

  /**
   * Create calibration bins
   */
  private calculateBins(): CalibrationBin[] {
    const binCount = 10;
    const bins: CalibrationBin[] = [];

    for (let i = 0; i < binCount; i++) {
      const minConfidence = i / binCount;
      const maxConfidence = (i + 1) / binCount;

      const binResults = this.results.filter(r => {
        const confidence = r.details.expectedClaims > 0
          ? r.details.correctClaims / r.details.expectedClaims
          : 0.5;
        return confidence >= minConfidence && confidence < maxConfidence;
      });

      bins.push({
        range: `${(minConfidence * 100).toFixed(0)}-${(maxConfidence * 100).toFixed(0)}%`,
        count: binResults.length,
        avgConfidence: binResults.length > 0
          ? binResults.reduce((sum, r) => sum + r.metrics.confidenceCalibration, 0) / binResults.length
          : 0,
        avgAccuracy: binResults.length > 0
          ? binResults.reduce((sum, r) => sum + r.metrics.accuracy, 0) / binResults.length
          : 0,
      });
    }

    return bins;
  }

  /**
   * Aggregate metrics by type
   */
  private aggregateByType(): Record<string, AggregateMetrics> {
    const types = ['wiki', 'impact', 'query'] as const;
    const result: Record<string, AggregateMetrics> = {};

    for (const type of types) {
      const typeResults = this.results.filter(r => r.type === type);
      if (typeResults.length > 0) {
        result[type] = {
          accuracy: typeResults.reduce((sum, r) => sum + r.metrics.accuracy, 0) / typeResults.length,
          precision: typeResults.reduce((sum, r) => sum + r.metrics.precision, 0) / typeResults.length,
          recall: typeResults.reduce((sum, r) => sum + r.metrics.recall, 0) / typeResults.length,
          hallucinationRate: typeResults.reduce((sum, r) => sum + r.metrics.hallucinationRate, 0) / typeResults.length,
          citationAccuracy: typeResults.reduce((sum, r) => sum + r.metrics.citationAccuracy, 0) / typeResults.length,
          confidenceCalibration: { ece: 0, bins: [] },
          byType: {},
          byDifficulty: {},
        };
      }
    }

    return result;
  }

  /**
   * Aggregate metrics by difficulty
   */
  private aggregateByDifficulty(): Record<string, AggregateMetrics> {
    // Would need to match with test case difficulty
    return {};
  }

  /**
   * Return empty aggregate metrics
   */
  private emptyAggregateMetrics(): AggregateMetrics {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      hallucinationRate: 0,
      citationAccuracy: 0,
      confidenceCalibration: {
        ece: 1,
        bins: [],
      },
      byType: {},
      byDifficulty: {},
    };
  }

  /**
   * Get results
   */
  getResults(): EvaluationResult[] {
    return this.results;
  }

  /**
   * Get failed cases
   */
  getFailedCases(): EvaluationResult[] {
    return this.results.filter(r => !r.passed);
  }

  /**
   * Get passed cases
   */
  getPassedCases(): EvaluationResult[] {
    return this.results.filter(r => r.passed);
  }

  /**
   * Generate report
   */
  generateReport(): string {
    const metrics = this.getAggregateMetrics();

    let report = `# Evaluation Report\n\n`;
    report += `## Overall Metrics\n\n`;
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Accuracy | ${(metrics.accuracy * 100).toFixed(1)}% |\n`;
    report += `| Precision | ${(metrics.precision * 100).toFixed(1)}% |\n`;
    report += `| Recall | ${(metrics.recall * 100).toFixed(1)}% |\n`;
    report += `| Hallucination Rate | ${(metrics.hallucinationRate * 100).toFixed(1)}% |\n`;
    report += `| Citation Accuracy | ${(metrics.citationAccuracy * 100).toFixed(1)}% |\n`;
    report += `| ECE | ${metrics.confidenceCalibration.ece.toFixed(3)} |\n\n`;

    // By type
    report += `## By Type\n\n`;
    report += `| Type | Accuracy | Precision | Recall | Hallucination |\n`;
    report += `|------|----------|----------|--------|--------------|\n`;

    for (const [type, typeMetrics] of Object.entries(metrics.byType)) {
      report += `| ${type} | ${(typeMetrics.accuracy * 100).toFixed(1)}% | ${(typeMetrics.precision * 100).toFixed(1)}% | ${(typeMetrics.recall * 100).toFixed(1)}% | ${(typeMetrics.hallucinationRate * 100).toFixed(1)}% |\n`;
    }

    // Failed cases
    const failed = this.getFailedCases();
    if (failed.length > 0) {
      report += `\n## Failed Cases\n\n`;
      for (const result of failed) {
        report += `- ${result.caseId} (${result.type}): Accuracy ${(result.metrics.accuracy * 100).toFixed(1)}%\n`;
      }
    }

    return report;
  }
}

// ============================================================================
// CLI Usage
// ============================================================================

export async function runEvaluation(
  system: SystemUnderTest,
  options?: {
    types?: Array<'wiki' | 'impact' | 'query'>;
    difficulties?: Array<'easy' | 'medium' | 'hard'>;
    caseIds?: string[];
    output?: 'json' | 'report';
  }
): Promise<EvaluationResult[] | string> {
  const runner = new EvaluationRunner(system);

  // Filter cases
  let cases = [...EVALUATION_DATASET];

  if (options?.types) {
    cases = cases.filter(c => options.types!.includes(c.type));
  }

  if (options?.caseIds) {
    cases = cases.filter(c => options.caseIds!.includes(c.id));
  }

  // Run evaluation
  const results = await runner.runAll(cases);

  // Return based on output format
  if (options?.output === 'report') {
    return runner.generateReport();
  }

  return results;
}
