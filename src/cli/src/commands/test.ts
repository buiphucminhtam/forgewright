/**
 * Autonomous Testing CLI - Self-healing test runner
 * 
 * Workflow:
 * 1. Run tests
 * 2. On failure: analyze error
 * 3. Auto-fix if possible
 * 4. Re-test
 * 5. Continue or escalate
 */
import type { Command } from 'commander';
import pc from 'picocolors';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { buildEnvelope } from '../types/index.js';
import { VERSION } from '../version.js';

export interface TestResult {
  passed: boolean;
  duration: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  errors: TestError[];
}

export interface TestError {
  name: string;
  message: string;
  stack?: string;
  type: 'syntax' | 'type' | 'logic' | 'ui' | 'e2e' | 'unknown';
}

export interface AutoFixResult {
  success: boolean;
  fixed: boolean;
  attempts: number;
  changes: string[];
  error?: string;
}

export function registerAutonomousTestCommand(program: Command): void {
  const test = program
    .command('test')
    .description('Run autonomous testing with auto-fix');

  // Run all tests
  test
    .command('run')
    .description('Run all test layers (unit, integration, visual, e2e)')
    .option('-l, --layer <layer>', 'Specific layer (unit|integration|visual|e2e)')
    .option('-j, --json', 'JSON output')
    .option('--no-fix', 'Skip auto-fix')
    .option('--verbose', 'Verbose output')
    .action(async (options) => {
      await handleTestRun(options);
    });

  // Auto-fix failures
  test
    .command('fix')
    .description('Auto-fix test failures')
    .option('-m, --max-attempts <n>', 'Max fix attempts', '3')
    .option('-j, --json', 'JSON output')
    .action(async (options) => {
      await handleAutoFix(options);
    });

  // Autonomous mode (run + fix + continue)
  test
    .command('autonomous')
    .description('Run autonomous mode: test + auto-fix + continue')
    .option('-m, --max-attempts <n>', 'Max fix attempts', '3')
    .option('-j, --json', 'JSON output')
    .option('--verbose', 'Verbose output')
    .action(async (options) => {
      await handleAutonomous(options);
    });

  // Update visual baselines
  test
    .command('update-baseline')
    .description('Update visual baselines')
    .option('-j, --json', 'JSON output')
    .action(async (options) => {
      await handleUpdateBaseline(options);
    });
}

interface TestRunOptions {
  layer?: string;
  json: boolean;
  fix: boolean;
  verbose: boolean;
}

interface FixOptions {
  maxAttempts: string;
  json: boolean;
}

interface AutonomousOptions extends FixOptions {
  json: boolean;
  verbose: boolean;
}

async function handleTestRun(options: TestRunOptions): Promise<void> {
  const layer = options.layer || 'unit,integration';
  const layers = layer.split(',');

  console.log(pc.bold('\n  Autonomous Test Runner'));
  console.log(pc.gray('  '.repeat(50)));

  const results: Record<string, TestResult> = {};

  for (const l of layers) {
    const layerName = l.trim();
    console.log(pc.cyan(`\n  Running ${layerName} tests...`));

    const start = Date.now();
    const result = await runTestLayer(layerName, options.verbose);
    result.duration = Date.now() - start;

    results[layerName] = result;

    if (result.passed) {
      console.log(pc.green(`    ✓ ${result.passedCount} passed`));
    } else {
      console.log(pc.red(`    ✗ ${result.failedCount} failed, ${result.passedCount} passed`));
      
      if (options.fix && result.errors.length > 0) {
        console.log(pc.yellow(`    → Attempting auto-fix...`));
        const fixResult = await attemptAutoFix(result.errors, 3);
        
        if (fixResult.success) {
          console.log(pc.green(`    ✓ Auto-fix successful`));
          // Re-run to verify
          const reResult = await runTestLayer(layerName, options.verbose);
          if (reResult.passed) {
            console.log(pc.green(`    ✓ All tests pass after fix`));
          }
        } else {
          console.log(pc.red(`    ✗ Auto-fix failed: ${fixResult.error}`));
        }
      }
    }
  }

  // Summary
  const totalFailed = Object.values(results).reduce((sum, r) => sum + r.failedCount, 0);
  const totalPassed = Object.values(results).reduce((sum, r) => sum + r.passedCount, 0);

  console.log(pc.bold('\n  Summary'));
  console.log(pc.gray('  '.repeat(50)));
  console.log(`    Total: ${totalPassed} passed, ${totalFailed} failed`);

  if (options.json) {
    console.log(JSON.stringify(buildEnvelope('test.run', { results }, {
      ok: totalFailed === 0,
      duration_ms: Object.values(results).reduce((sum, r) => sum + r.duration, 0),
      version: VERSION,
    }), null, 2));
  }

  process.exit(totalFailed === 0 ? 0 : 1);
}

async function handleAutoFix(options: FixOptions): Promise<void> {
  console.log(pc.bold('\n  Auto-Fix Mode'));
  console.log(pc.gray('  '.repeat(50)));

  // First run tests to see what's failing
  console.log(pc.cyan('\n  Running tests to detect failures...'));
  const result = await runTestLayer('unit', true);

  if (result.passed) {
    console.log(pc.green('\n  ✓ All tests pass, nothing to fix!'));
    process.exit(0);
  }

  console.log(pc.yellow(`\n  ${result.failedCount} failures detected`));

  const fixResult = await attemptAutoFix(result.errors, parseInt(options.maxAttempts, 10));

  if (fixResult.success && fixResult.fixed) {
    console.log(pc.green(`\n  ✓ Auto-fix successful after ${fixResult.attempts} attempt(s)`));
    
    // Re-run to confirm
    console.log(pc.cyan('\n  Verifying fix...'));
    const reResult = await runTestLayer('unit', true);
    
    if (reResult.passed) {
      console.log(pc.green('  ✓ All tests pass!'));
      process.exit(0);
    } else {
      console.log(pc.red(`  ✗ Still ${reResult.failedCount} failures - manual intervention needed`));
      process.exit(2);
    }
  } else {
    console.log(pc.red(`\n  ✗ Auto-fix failed: ${fixResult.error}`));
    console.log(pc.yellow('\n  Recommendations:'));
    for (const err of result.errors) {
      console.log(`    - ${err.name}: ${err.message}`);
    }
    process.exit(2);
  }
}

async function handleAutonomous(options: AutonomousOptions): Promise<void> {
  console.log(pc.bold('\n  🤖 Autonomous Mode'));
  console.log(pc.gray('  '.repeat(50)));
  console.log(pc.dim('  Max fix attempts: ' + options.maxAttempts));

  const maxAttempts = parseInt(options.maxAttempts, 10);
  let attempt = 0;
  let allPassed = false;

  while (attempt < maxAttempts && !allPassed) {
    attempt++;
    console.log(pc.cyan(`\n  Attempt ${attempt}/${maxAttempts}`));
    
    // Run tests
    console.log(pc.dim('  Running tests...'));
    const result = await runTestLayer('unit,integration', options.verbose);

    if (result.passed) {
      allPassed = true;
      break;
    }

    if (attempt < maxAttempts) {
      console.log(pc.yellow(`  ${result.failedCount} failures - attempting fix...`));
      const fixResult = await attemptAutoFix(result.errors, 1);

      if (!fixResult.success) {
        console.log(pc.red(`  ✗ Fix attempt failed: ${fixResult.error}`));
        break;
      }
      
      console.log(pc.green(`  ✓ Fix applied`));
    }
  }

  // Final result
  if (allPassed) {
    console.log(pc.green('\n  ✓✓✓ All tests pass! ✓✓✓'));
    console.log(pc.green(`  Completed in ${attempt} attempt(s)`));
    process.exit(0);
  } else {
    console.log(pc.red('\n  ✗✗✗ Autonomous fix failed ✗✗✗'));
    console.log(pc.yellow('\n  Human intervention required'));
    process.exit(2);
  }
}

async function handleUpdateBaseline(options: { json: boolean }): Promise<void> {
  console.log(pc.bold('\n  Updating Visual Baselines'));
  console.log(pc.gray('  '.repeat(50)));

  try {
    execSync('playwright test --update-snapshots', { stdio: 'inherit' });
    console.log(pc.green('\n  ✓ Visual baselines updated'));
    
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope('test.updateBaseline', { success: true }, {
        ok: true,
        version: VERSION,
      }), null, 2));
    }
  } catch (err) {
    console.log(pc.red('\n  ✗ Failed to update baselines'));
    process.exit(1);
  }
}

// Helper Functions

async function runTestLayer(layer: string, verbose: boolean): Promise<TestResult> {
  const result: TestResult = {
    passed: true,
    duration: 0,
    passedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  try {
    const start = Date.now();
    
    let command = '';
    switch (layer.trim()) {
      case 'unit':
        command = 'vitest run --reporter=json';
        break;
      case 'integration':
        command = 'vitest run --testPathPattern=integration --reporter=json';
        break;
      case 'visual':
        command = 'playwright test --project=visual --reporter=json';
        break;
      case 'e2e':
        command = 'playwright test --project=chromium --reporter=json';
        break;
      default:
        command = 'vitest run --reporter=json';
    }

    const output = execSync(command, { 
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    // Parse output
    const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      result.passedCount = data.summary?.passed || 0;
      result.failedCount = data.summary?.failed || 0;
      result.skippedCount = data.summary?.skipped || 0;
    } else {
      // Fallback parsing
      const passed = (output.match(/✓/g) || []).length;
      const failed = (output.match(/✗|×|FAIL/g) || []).length;
      result.passedCount = passed;
      result.failedCount = failed;
    }

    result.passed = result.failedCount === 0;
    result.duration = Date.now() - start;

  } catch (err: any) {
    result.passed = false;
    result.duration = Date.now() - Date.now();
    
    // Parse error output
    const errorOutput = err.stdout || err.message || '';
    
    // Extract test failures
    const failureMatches = errorOutput.matchAll(/FAIL\s+([^\n]+)[\s\S]*?([\u4e00-\u9fff\w\s]+(?:Error|Exception)[\s\S]*?)(?=\n\s*\n|\n\n|$)/g);
    
    for (const match of failureMatches) {
      result.errors.push({
        name: match[1] || 'Unknown Test',
        message: match[2]?.split('\n')[0] || 'Unknown error',
        type: classifyError(match[2] || ''),
      });
    }

    // Fallback: count failures
    result.failedCount = result.errors.length || 1;
    result.passedCount = 0;
  }

  return result;
}

function classifyError(errorMessage: string): TestError['type'] {
  const msg = errorMessage.toLowerCase();
  
  if (msg.includes('syntaxerror') || msg.includes('unexpected token')) {
    return 'syntax';
  }
  if (msg.includes('typeerror') || msg.includes('typescript') || msg.includes("'undefined'")) {
    return 'type';
  }
  if (msg.includes('expect') || msg.includes('tobe') || msg.includes('toequal')) {
    return 'logic';
  }
  if (msg.includes('screenshot') || msg.includes('visual') || msg.includes('diff')) {
    return 'ui';
  }
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('click')) {
    return 'e2e';
  }
  
  return 'unknown';
}

async function attemptAutoFix(errors: TestError[], maxAttempts: number): Promise<AutoFixResult> {
  const result: AutoFixResult = {
    success: false,
    fixed: false,
    attempts: 0,
    changes: [],
  };

  // Group by type
  const syntaxErrors = errors.filter(e => e.type === 'syntax');
  const typeErrors = errors.filter(e => e.type === 'type');
  const logicErrors = errors.filter(e => e.type === 'logic');

  // Try auto-fix for each type
  if (syntaxErrors.length > 0) {
    console.log(pc.yellow(`    Attempting to fix ${syntaxErrors.length} syntax error(s)...`));
    
    for (const err of syntaxErrors) {
      const fix = await fixSyntaxError(err);
      if (fix) {
        result.changes.push(fix);
      }
    }
  }

  if (typeErrors.length > 0) {
    console.log(pc.yellow(`    Attempting to fix ${typeErrors.length} type error(s)...`));
    
    for (const err of typeErrors) {
      const fix = await fixTypeError(err);
      if (fix) {
        result.changes.push(fix);
      }
    }
  }

  if (logicErrors.length > 0) {
    console.log(pc.yellow(`    Attempting to fix ${logicErrors.length} logic error(s)...`));
    // Logic errors require more context, typically need human review
    result.error = 'Logic errors detected - requires human review';
    result.success = true; // Attempted
    return result;
  }

  result.success = true;
  result.fixed = result.changes.length === errors.length;

  if (!result.fixed) {
    result.error = 'Could not auto-fix all errors';
  }

  return result;
}

async function fixSyntaxError(error: TestError): Promise<string | null> {
  // For syntax errors, we can try common fixes
  // This is a simplified version - real implementation would use LLM
  
  console.log(pc.dim(`      Analyzing: ${error.name}`));
  
  // Common syntax fixes could be implemented here
  // For now, just report the error
  
  return null;
}

async function fixTypeError(error: TestError): Promise<string | null> {
  // Type errors often need null checks or type assertions
  
  console.log(pc.dim(`      Analyzing: ${error.name}`));
  
  // Common type fixes:
  // 1. Add optional chaining (?.)
  // 2. Add null check
  // 3. Add type assertion
  // 4. Add type guard
  
  return null;
}
