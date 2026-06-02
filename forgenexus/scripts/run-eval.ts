/**
 * Run Evaluation Script
 * 
 * Executes the evaluation suite and generates a report.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { EvaluationRunner, SystemUnderTest, GeneratedOutput } from '../src/evaluation/runner.js';
import { EVALUATION_DATASET, EvaluationCase } from '../src/evaluation/dataset.js';
import { generateReport, formatReport, transformResults } from '../src/evaluation/report.js';

// Mock system with realistic responses
class MockSystem implements SystemUnderTest {
  async generateWiki(input: string): Promise<GeneratedOutput> {
    const confidence = 0.82 + Math.random() * 0.1;
    const content = 'Based on code analysis, the system uses JWT tokens for authentication. The login function handles user credentials. The logout function clears sessions.';
    const claims = content.split('. ').filter(s => s.length > 10);
    return {
      content,
      claims,
      citations: ['auth/jwt.ts', 'auth/login.ts'],
      confidence,
      warnings: confidence < 0.7 ? ['Low confidence'] : []
    };
  }

  async generateImpact(input: string): Promise<GeneratedOutput> {
    const confidence = 0.78 + Math.random() * 0.1;
    const content = 'Changing this function would affect the auth middleware and related test files. The impact spans multiple modules.';
    const claims = content.split('. ').filter(s => s.length > 10);
    return {
      content,
      claims,
      citations: ['middleware/auth.ts', 'tests/auth.test.ts'],
      confidence,
      warnings: confidence < 0.7 ? ['Impact analysis uncertain'] : []
    };
  }

  async generateQuery(input: string): Promise<GeneratedOutput> {
    const confidence = 0.80 + Math.random() * 0.1;
    const content = 'Found authentication functions: login in auth/login.ts, logout in auth/logout.ts, and register in auth/register.ts.';
    const claims = content.split('. ').filter(s => s.length > 10);
    return {
      content,
      claims,
      citations: ['auth/login.ts', 'auth/logout.ts', 'auth/register.ts'],
      confidence,
      warnings: confidence < 0.7 ? ['Results may be incomplete'] : []
    };
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         FORGENEXUS EVALUATION SUITE                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n🚀 Running evaluation at ${new Date().toISOString()}\n`);

  console.log('📊 System: Mock (simulated responses)');
  console.log(`📋 Dataset: ${EVALUATION_DATASET.length} test cases\n`);

  const runner = new EvaluationRunner(new MockSystem());
  
  console.log('⏳ Running evaluation...');
  const results = await runner.runAll(EVALUATION_DATASET);
  console.log(`   ✓ Evaluated ${results.length} cases\n`);

  console.log('⏳ Transforming results...');
  const transformed = transformResults(results, EVALUATION_DATASET);
  console.log('   ✓ Results transformed\n');

  console.log('⏳ Generating report...');
  const report = generateReport(transformed);
  console.log('   ✓ Report generated\n');

  // Print formatted report
  console.log(formatReport(report));

  // Save results to file
  const resultsDir = path.join(__dirname, 'benchmarks');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const resultsPath = path.join(resultsDir, `eval-results-${date}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(transformed, null, 2));
  console.log(`\n📄 Results saved to: ${resultsPath}`);

  // Exit with appropriate code
  const allTargetsMet = report.eceTargetMet && report.hallucinationTargetMet && report.accuracyTargetMet;
  console.log(`\n${allTargetsMet ? '✅' : '⚠️'} Evaluation ${allTargetsMet ? 'PASSED' : 'COMPLETED WITH WARNINGS'}`);

  process.exit(allTargetsMet ? 0 : 1);
}

main().catch((error) => {
  console.error('\n❌ Evaluation failed:', error);
  process.exit(1);
});
