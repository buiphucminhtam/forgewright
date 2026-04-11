/**
 * CLI Evaluation Command for ForgeWright Anti-Hallucination System
 * 
 * Provides command-line interface for running evaluations.
 */

import { runEvaluation, EvaluationRunner } from '../evaluation/runner.js';
import { EVALUATION_DATASET } from '../evaluation/dataset.js';
import { createMockGuardedLLMClient } from '../agents/llm-client.js';
import { createSkepticAgent } from '../agents/skeptic.js';

// ============================================================================
// CLI Interface
// ============================================================================

export interface EvaluateOptions {
  dataset?: string;
  output?: 'json' | 'report' | 'table';
  outputFile?: string;
  types?: string[];
  difficulties?: string[];
  caseIds?: string[];
  verbose?: boolean;
  mock?: boolean;
}

/**
 * Main evaluation command
 */
export async function evaluate(options: EvaluateOptions = {}): Promise<void> {
  const {
    output = 'table',
    outputFile,
    types,
    difficulties,
    caseIds,
    verbose = false,
    mock = true,
  } = options;

  console.log('\n🔍 ForgeWright Anti-Hallucination Evaluation\n');
  console.log('='.repeat(50));

  // Create mock system for testing
  const system = createMockSystem();

  // Filter cases
  let cases = [...EVALUATION_DATASET];

  if (types && types.length > 0) {
    cases = cases.filter(c => types.includes(c.type));
  }

  if (difficulties && difficulties.length > 0) {
    cases = cases.filter(c => difficulties.includes(c.difficulty));
  }

  if (caseIds && caseIds.length > 0) {
    cases = cases.filter(c => caseIds.includes(c.id));
  }

  console.log(`\n📊 Running ${cases.length} evaluation cases...\n`);

  // Run evaluation
  const runner = new EvaluationRunner(system as any);
  const results = await runner.runAll(cases);

  // Get aggregate metrics
  const metrics = runner.getAggregateMetrics();

  // Output results
  switch (output) {
    case 'json':
      outputJSON(results, metrics, outputFile);
      break;
    case 'report':
      outputReport(runner, outputFile);
      break;
    case 'table':
    default:
      outputTable(results, metrics, outputFile);
  }

  // Verbose output
  if (verbose) {
    console.log('\n📝 Detailed Results:');
    console.log('-'.repeat(50));
    for (const result of results) {
      if (!result.passed) {
        console.log(`❌ ${result.caseId}: ${result.type} (${result.details.verifiedClaims}/${result.details.expectedClaims} claims)`);
      }
    }
  }

  console.log('\n✅ Evaluation complete!\n');
}

// ============================================================================
// Output Formatters
// ============================================================================

function outputJSON(
  results: any[],
  metrics: any,
  outputFile?: string
): void {
  const data = JSON.stringify({ results, metrics }, null, 2);

  if (outputFile) {
    require('fs').writeFileSync(outputFile, data);
    console.log(`📄 Results saved to ${outputFile}`);
  } else {
    console.log(data);
  }
}

function outputTable(
  results: any[],
  metrics: any,
  outputFile?: string
): void {
  const lines: string[] = [];

  // Header
  lines.push('\n┌─────────────────────────────────────────────────────────────┐');
  lines.push('│                    EVALUATION RESULTS                        │');
  lines.push('├─────────────────────────────────────────────────────────────┤');

  // Overall Metrics
  lines.push('│ OVERALL METRICS                                              │');
  lines.push('│                                                             │');
  lines.push(`│   Accuracy:           ${(metrics.accuracy * 100).toFixed(1).padStart(6)}%                        │`);
  lines.push(`│   Precision:          ${(metrics.precision * 100).toFixed(1).padStart(6)}%                        │`);
  lines.push(`│   Recall:             ${(metrics.recall * 100).toFixed(1).padStart(6)}%                        │`);
  lines.push(`│   Hallucination Rate:  ${(metrics.hallucinationRate * 100).toFixed(1).padStart(6)}%                        │`);
  lines.push(`│   Citation Accuracy:   ${(metrics.citationAccuracy * 100).toFixed(1).padStart(6)}%                        │`);
  lines.push(`│   ECE:                ${metrics.confidenceCalibration.ece.toFixed(3).padStart(8)}                          │`);
  lines.push('├─────────────────────────────────────────────────────────────┤');

  // By Type
  lines.push('│ BY TYPE                                                       │');
  lines.push('│                                                             │');
  for (const [type, typeMetrics] of Object.entries(metrics.byType) as [string, any][]) {
    if (typeMetrics) {
      lines.push(`│   ${type.toUpperCase().padEnd(12)} Accuracy: ${(typeMetrics.accuracy * 100).toFixed(1).padStart(6)}%  Hallucination: ${(typeMetrics.hallucinationRate * 100).toFixed(1).padStart(5)}%   │`);
    }
  }

  // Summary
  const passedCount = results.filter((r: any) => r.passed).length;
  lines.push('├─────────────────────────────────────────────────────────────┤');
  lines.push('│ SUMMARY                                                       │');
  lines.push('│                                                             │');
  lines.push(`│   Passed: ${String(passedCount).padStart(3)}/${String(results.length).padStart(3)} tests                                    │`);
  lines.push(`│   Pass Rate: ${((passedCount / results.length) * 100).toFixed(1).padStart(6)}%                                │`);
  lines.push('└─────────────────────────────────────────────────────────────┘\n');

  const output = lines.join('\n');

  if (outputFile) {
    require('fs').writeFileSync(outputFile, output);
    console.log(`📄 Results saved to ${outputFile}`);
  } else {
    console.log(output);
  }
}

function outputReport(runner: EvaluationRunner, outputFile?: string): void {
  const report = runner.generateReport();

  if (outputFile) {
    require('fs').writeFileSync(outputFile, report);
    console.log(`📄 Report saved to ${outputFile}`);
  } else {
    console.log(report);
  }
}

// ============================================================================
// Mock System for Testing
// ============================================================================

function createMockSystem() {
  const llm = createMockGuardedLLMClient();
  const skeptic = createSkepticAgent({ llm: llm as any });

  return {
    generateWiki: async (input: string) => ({
      content: `Generated wiki for: ${input}`,
      claims: ['auth function', 'login function'],
      citations: ['[source:auth.ts:10]'],
      confidence: 0.85,
    }),
    generateImpact: async (input: string) => ({
      content: `Impact analysis for: ${input}`,
      claims: ['affects middleware', 'affects tests'],
      citations: ['[source:middleware.ts:5]'],
      confidence: 0.9,
    }),
    generateQuery: async (input: string) => ({
      content: `Query results for: ${input}`,
      claims: ['found function'],
      citations: ['[source:utils.ts:20]'],
      confidence: 0.88,
    }),
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🔍 ForgeWright Anti-Hallucination Evaluation

Usage:
  forgenexus evaluate [options]

Options:
  --dataset <path>     Path to evaluation dataset
  --output <format>    Output format: json, report, table (default: table)
  --output-file <path> Save output to file
  --types <types>      Filter by types: wiki, impact, query
  --difficulties <d>    Filter by difficulty: easy, medium, hard
  --case-ids <ids>     Run specific case IDs
  --verbose             Show detailed results
  --mock                Use mock LLM (default: true)
  --help, -h           Show this help

Examples:
  forgenexus evaluate
  forgenexus evaluate --output json --output-file results.json
  forgenexus evaluate --types wiki,impact --difficulties easy,medium
  forgenexus evaluate --case-ids wiki-001,impact-001
  `);
  process.exit(0);
}

// Parse arguments
const options: EvaluateOptions = {
  output: args.includes('--output') ? args[args.indexOf('--output') + 1] as any : 'table',
  outputFile: args.includes('--output-file') ? args[args.indexOf('--output-file') + 1] : undefined,
  types: args.includes('--types') ? args[args.indexOf('--types') + 1].split(',') : undefined,
  difficulties: args.includes('--difficulties') ? args[args.indexOf('--difficulties') + 1].split(',') : undefined,
  caseIds: args.includes('--case-ids') ? args[args.indexOf('--case-ids') + 1].split(',') : undefined,
  verbose: args.includes('--verbose'),
  mock: !args.includes('--no-mock'),
};

evaluate(options).catch(console.error);
