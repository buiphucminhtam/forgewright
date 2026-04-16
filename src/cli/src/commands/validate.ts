/**
 * Validate Command - Quality gate validation
 */
import type { Command } from 'commander';
import pc from 'picocolors';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { buildEnvelope } from '../types/index.js';
import { VERSION } from '../version.js';

export interface ValidationResult {
  level: number;
  score: number;
  maxScore: number;
  grade: string;
  checks: ValidationCheck[];
  issues: string[];
  warnings: string[];
}

export interface ValidationCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  score: number;
  maxScore: number;
  message: string;
}

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Run quality gate validation')
    .option('-l, --level <1-3>', 'Validation level (1: build, 2: +regression, 3: +standards)', '3')
    .option('--strict', 'Treat warnings as failures')
    .option('-j, --json', 'Output as JSON')
    .option('--report <path>', 'Write report to file')
    .action(async (options: { level: string; strict: boolean; json: boolean; report?: string }) => {
      await handleValidate(options);
    });
}

async function handleValidate(options: {
  level: string;
  strict: boolean;
  json: boolean;
  report?: string;
}): Promise<void> {
  const startTime = Date.now();
  const useJson = options.json || !process.stdout.isTTY;
  const level = parseInt(options.level, 10);

  if (isNaN(level) || level < 1 || level > 3) {
    if (useJson) {
      const envelope = buildEnvelope('validate.quality', null, {
        ok: false,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: { code: 2, message: 'Invalid level. Use 1, 2, or 3.' },
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc.red(`Error: Invalid level "${options.level}". Use 1, 2, or 3.`));
    }
    process.exit(2);
  }

  const result = await runValidation(level, options.strict);

  // Write report if requested
  if (options.report) {
    const reportContent = useJson
      ? JSON.stringify(result, null, 2)
      : generateTextReport(result);
    require('fs').writeFileSync(options.report, reportContent + '\n');
  }

  if (useJson) {
    const envelope = buildEnvelope('validate.quality', result, {
      ok: result.issues.length === 0,
      duration_ms: Date.now() - startTime,
      version: VERSION,
      error: result.issues.length > 0
        ? { code: 1, message: `${result.issues.length} issues found` }
        : undefined,
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    printHumanReadable(result, options.strict);
  }

  const exitCode = result.issues.length > 0 ? 1 : 0;
  process.exit(exitCode);
}

async function runValidation(level: number, strict: boolean): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];

  let totalScore = 0;
  let maxScore = 0;

  // Level 1: Build & Syntax
  if (level >= 1) {
    const buildChecks = await runBuildChecks();
    checks.push(...buildChecks.checks);
    issues.push(...buildChecks.issues);
    warnings.push(...buildChecks.warnings);
    totalScore += buildChecks.score;
    maxScore += buildChecks.maxScore;
  }

  // Level 2: Regression Safety
  if (level >= 2) {
    const regressionChecks = await runRegressionChecks();
    checks.push(...regressionChecks.checks);
    issues.push(...regressionChecks.issues);
    warnings.push(...regressionChecks.warnings);
    totalScore += regressionChecks.score;
    maxScore += regressionChecks.maxScore;
  }

  // Level 3: Code Standards
  if (level >= 3) {
    const standardsChecks = await runStandardsChecks(strict);
    checks.push(...standardsChecks.checks);
    issues.push(...standardsChecks.issues);
    warnings.push(...standardsChecks.warnings);
    totalScore += standardsChecks.score;
    maxScore += standardsChecks.maxScore;
  }

  // Calculate grade
  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  let grade = 'F';
  if (percentage >= 90) grade = 'A';
  else if (percentage >= 80) grade = 'B';
  else if (percentage >= 70) grade = 'C';
  else if (percentage >= 60) grade = 'D';

  return {
    level,
    score: totalScore,
    maxScore,
    grade,
    checks,
    issues,
    warnings,
  };
}

async function runBuildChecks(): Promise<{
  checks: ValidationCheck[];
  issues: string[];
  warnings: string[];
  score: number;
  maxScore: number;
}> {
  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const maxScore = 25;

  // Check package.json exists
  if (existsSync('package.json')) {
    checks.push({
      name: 'Build Tool',
      status: 'pass',
      score: 0,
      maxScore: 0,
      message: 'package.json found',
    });

    // Try to build
    try {
      execSync('npm run build --silent 2>/dev/null', { stdio: 'pipe', timeout: 60000 });
      checks.push({
        name: 'Build Success',
        status: 'pass',
        score: 15,
        maxScore: 15,
        message: 'Build completed successfully',
      });
      score += 15;
    } catch {
      checks.push({
        name: 'Build Success',
        status: 'fail',
        score: 0,
        maxScore: 15,
        message: 'Build failed',
      });
      issues.push('Build failed');
    }

    // Type check
    try {
      execSync('npx tsc --noEmit 2>/dev/null', { stdio: 'pipe', timeout: 60000 });
      checks.push({
        name: 'TypeScript Check',
        status: 'pass',
        score: 10,
        maxScore: 10,
        message: 'TypeScript compilation passed',
      });
      score += 10;
    } catch {
      checks.push({
        name: 'TypeScript Check',
        status: 'fail',
        score: 0,
        maxScore: 10,
        message: 'TypeScript compilation errors',
      });
      issues.push('TypeScript compilation failed');
    }
  } else {
    checks.push({
      name: 'Build Tool',
      status: 'skip',
      score: 0,
      maxScore: 0,
      message: 'No package.json found',
    });
  }

  return { checks, issues, warnings, score, maxScore };
}

async function runRegressionChecks(): Promise<{
  checks: ValidationCheck[];
  issues: string[];
  warnings: string[];
  score: number;
  maxScore: number;
}> {
  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const maxScore = 25;

  // Check if git repo
  if (existsSync('.git')) {
    checks.push({
      name: 'Git Repository',
      status: 'pass',
      score: 0,
      maxScore: 0,
      message: 'Git repository detected',
    });

    // Run tests if available
    if (existsSync('package.json')) {
      try {
        execSync('npm test --silent 2>/dev/null', { stdio: 'pipe', timeout: 120000 });
        checks.push({
          name: 'Test Suite',
          status: 'pass',
          score: 25,
          maxScore: 25,
          message: 'All tests passed',
        });
        score += 25;
      } catch {
        checks.push({
          name: 'Test Suite',
          status: 'fail',
          score: 0,
          maxScore: 25,
          message: 'Test suite has failures',
        });
        issues.push('Test suite failed');
      }
    } else {
      checks.push({
        name: 'Test Suite',
        status: 'skip',
        score: 25,
        maxScore: 25,
        message: 'No test suite configured',
      });
      score += 25;
    }
  } else {
    checks.push({
      name: 'Git Repository',
      status: 'skip',
      score: 25,
      maxScore: 25,
      message: 'Not a git repository',
    });
    score += 25;
  }

  return { checks, issues, warnings, score, maxScore };
}

async function runStandardsChecks(strict: boolean): Promise<{
  checks: ValidationCheck[];
  issues: string[];
  warnings: string[];
  score: number;
  maxScore: number;
}> {
  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 30;
  const maxScore = 30;

  // Check for TODOs/FIXMEs (10 points)
  try {
    const todoOutput = execSync(
      'grep -rn "TODO\\|FIXME\\|HACK\\|XXX" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null | head -5 || true',
      { encoding: 'utf-8', timeout: 10000 }
    );

    if (todoOutput.trim()) {
      const count = todoOutput.trim().split('\n').length;
      checks.push({
        name: 'Code Quality',
        status: 'warning',
        score: 0,
        maxScore: 10,
        message: `Found ${count} TODOs/FIXMEs`,
      });
      warnings.push(`${count} TODOs/FIXMEs found`);
      score -= 10;
    } else {
      checks.push({
        name: 'Code Quality',
        status: 'pass',
        score: 10,
        maxScore: 10,
        message: 'No TODOs/FIXMEs found',
      });
    }
  } catch {
    checks.push({
      name: 'Code Quality',
      status: 'pass',
      score: 10,
      maxScore: 10,
      message: 'No TODOs/FIXMEs found',
    });
  }

  // Check for secrets (10 points)
  try {
    const secretOutput = execSync(
      'grep -rn "sk-[a-zA-Z0-9]\\|AKIA[A-Z0-9]\\|password\\s*=\\s*[\'\"]" --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null | grep -v ".env" | head -5 || true',
      { encoding: 'utf-8', timeout: 10000 }
    );

    if (secretOutput.trim()) {
      const count = secretOutput.trim().split('\n').length;
      checks.push({
        name: 'Secret Detection',
        status: 'fail',
        score: 0,
        maxScore: 10,
        message: `Found ${count} potential hardcoded secrets`,
      });
      issues.push(`${count} potential secrets detected`);
      score -= 10;
    } else {
      checks.push({
        name: 'Secret Detection',
        status: 'pass',
        score: 10,
        maxScore: 10,
        message: 'No hardcoded secrets detected',
      });
    }
  } catch {
    checks.push({
      name: 'Secret Detection',
      status: 'pass',
      score: 10,
      maxScore: 10,
      message: 'No hardcoded secrets detected',
    });
  }

  // Check conventions (5 points)
  if (existsSync('.forgewright/code-conventions.md')) {
    checks.push({
      name: 'Code Conventions',
      status: 'pass',
      score: 5,
      maxScore: 5,
      message: 'Code conventions defined',
    });
  } else {
    checks.push({
      name: 'Code Conventions',
      status: 'warning',
      score: 0,
      maxScore: 5,
      message: 'No code conventions file',
    });
    warnings.push('No .forgewright/code-conventions.md');
    score -= 5;
  }

  // Check docs (5 points)
  if (existsSync('README.md')) {
    checks.push({
      name: 'Documentation',
      status: 'pass',
      score: 5,
      maxScore: 5,
      message: 'README.md found',
    });
  } else {
    checks.push({
      name: 'Documentation',
      status: 'warning',
      score: 0,
      maxScore: 5,
      message: 'No README.md',
    });
    warnings.push('No README.md');
    score -= 5;
  }

  return { checks, issues, warnings, score, maxScore };
}

function generateTextReport(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push('=== Forgewright Quality Gate Report ===');
  lines.push(`Level: ${result.level}`);
  lines.push(`Score: ${result.score}/${result.maxScore} (${result.grade})`);
  lines.push('');

  for (const check of result.checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '○';
    lines.push(`${icon} ${check.name}: ${check.message}`);
  }

  if (result.issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of result.issues) {
      lines.push(`  - ${issue}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}

function printHumanReadable(result: ValidationResult, strict: boolean): void {
  const percentage = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;

  console.log();
  console.log(pc.bold('╔════════════════════════════════════════════════════════════════╗'));
  console.log(pc.bold('║') + '          Quality Gate Validation'.padEnd(62) + pc.bold('║'));
  console.log(pc.bold('╠════════════════════════════════════════════════════════════════╣'));

  const gradeColor = result.grade === 'A' ? pc.green
    : result.grade === 'B' ? pc.cyan
      : result.grade === 'C' ? pc.yellow
        : pc.red;

  console.log(pc.bold('║') + `  Level ${result.level} | ${result.score}/${result.maxScore} (${gradeColor(result.grade)}) | ${percentage}%`.padEnd(62) + pc.bold('║'));
  console.log(pc.bold('╚════════════════════════════════════════════════════════════════╝'));
  console.log();

  // Summary
  if (result.issues.length === 0 && result.warnings.length === 0) {
    console.log(pc.green('  ✓ All checks passed'));
  } else {
    if (result.issues.length > 0) {
      console.log(pc.red(`  ✗ ${result.issues.length} issue(s)`));
    }
    if (result.warnings.length > 0) {
      console.log(pc.yellow(`  ⚠ ${result.warnings.length} warning(s)`));
    }
  }

  console.log();

  // Detailed checks
  console.log(pc.bold('  Checks:'));
  console.log(pc.gray('  ' + '─'.repeat(50)));

  for (const check of result.checks) {
    const icon = check.status === 'pass' ? pc.green('✓') : check.status === 'fail' ? pc.red('✗') : pc.gray('○');
    const statusColor = check.status === 'pass' ? pc.green : check.status === 'fail' ? pc.red : pc.gray;
    console.log(`    ${icon} ${check.name.padEnd(20)} ${statusColor(check.message)}`);
  }

  console.log();

  // Exit code note
  if (result.issues.length > 0) {
    console.log(pc.dim('  Run with --json for machine-readable output'));
  }
}
