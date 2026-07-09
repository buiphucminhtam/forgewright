#!/usr/bin/env npx tsx
/**
 * Forgewright Security Scanner
 *
 * Core scanning engine that:
 * 1. Reads changed files from git diff
 * 2. Runs pattern matching against rules/
 * 3. Returns list of findings with severity (critical/high/medium/low)
 * 4. Integrates with skills/security-engineer/SKILL.md
 *
 * Usage:
 *   npx tsx .forgewright/security/scanner.ts [options]
 *
 * Options:
 *   --base <ref>      Base commit/branch to compare against (default: main)
 *   --files <glob>    Specific files to scan (default: all changed files)
 *   --rules <dir>     Rules directory (default: .forgewright/security/rules)
 *   --output <format> Output format: text|json|github (default: text)
 *   --fail-on <sev>   Exit with error on findings at or above severity
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, execFileSync } from 'child_process';
import * as yaml from 'js-yaml';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

interface SecurityRule {
  id: string;
  name: string;
  pattern: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  cwe?: string;
  owasp?: string;
  remediation?: string;
}

interface RuleFile {
  rules: SecurityRule[];
}

interface Finding {
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file: string;
  line: number;
  column: number;
  matchedText: string;
  cwe?: string;
  owasp?: string;
  description: string;
  remediation?: string;
}

interface ScanResult {
  timestamp: string;
  baseRef: string;
  headRef: string;
  filesScanned: number;
  totalLines: number;
  findings: Finding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

interface CliOptions {
  base: string;
  files: string | null;
  rulesDir: string;
  output: 'text' | 'json' | 'github';
  failOn: 'critical' | 'high' | 'medium' | 'low' | null;
}

// Severity order for sorting and comparison
const SEVERITY_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
};

/**
 * Parse command line arguments
 */
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    base: 'main',
    files: null,
    rulesDir: '.forgewright/security/rules',
    output: 'text',
    failOn: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--base':
        options.base = args[++i];
        break;
      case '--files':
        if (options.files) {
          options.files += ',' + args[++i];
        } else {
          options.files = args[++i];
        }
        break;
      case '--rules':
        options.rulesDir = args[++i];
        break;
      case '--output':
        options.output = args[++i] as 'text' | 'json' | 'github';
        break;
      case '--fail-on':
        options.failOn = args[++i] as 'critical' | 'high' | 'medium' | 'low';
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Forgewright Security Scanner

Usage:
  npx tsx .forgewright/security/scanner.ts [options]

Options:
  --base <ref>      Base commit/branch to compare against (default: main)
  --files <glob>    Specific files to scan (default: all changed files)
  --rules <dir>      Rules directory (default: .forgewright/security/rules)
  --output <format> Output format: text|json|github (default: text)
  --fail-on <sev>   Exit with error on findings at or above severity
                    (critical, high, medium, low)

Examples:
  # Scan changes vs main branch
  npx tsx .forgewright/security/scanner.ts

  # Scan specific files
  npx tsx .forgewright/security/scanner.ts --files "src/**/*.ts"

  # JSON output for automation
  npx tsx .forgewright/security/scanner.ts --output json

  # Fail build on high or critical findings
  npx tsx .forgewright/security/scanner.ts --fail-on high
`);
}

/**
 * Load all security rules from YAML files
 */
function loadRules(rulesDir: string): SecurityRule[] {
  const rules: SecurityRule[] = [];

  if (!fs.existsSync(rulesDir)) {
    console.warn(`Warning: Rules directory not found: ${rulesDir}`);
    return rules;
  }

  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of files) {
    const filePath = path.join(rulesDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const ruleFile = yaml.load(content) as RuleFile;

      if (ruleFile.rules) {
        for (const rule of ruleFile.rules) {
          // Validate rule has required fields
          if (!rule.id || !rule.name || !rule.pattern || !rule.severity) {
            console.warn(`Warning: Invalid rule in ${file}: missing required fields`);
            continue;
          }
          rules.push(rule);
        }
      }
    } catch (error) {
      console.warn(`Warning: Failed to load rules from ${file}: ${error}`);
    }
  }

  return rules;
}

/**
 * Get list of changed files from git diff
 */
function getChangedFiles(baseRef: string): string[] {
  try {
    try {
      execFileSync('git', ['rev-parse', '--verify', baseRef], { stdio: 'ignore' });
    } catch {
      console.warn(`Warning: Base ref '${baseRef}' not found, scanning all files`);
      return ['.'];
    }

    const files = new Set<string>();

    const getOutputZ = (args: string[]) => {
      try {
        return execFileSync('git', args, { encoding: 'utf-8' });
      } catch {
        return '';
      }
    };

    const addFiles = (out: string) => {
      if (!out) return;
      out.split('\0').filter(Boolean).forEach(f => files.add(f));
    };

    let mergeBase = '';
    try {
      mergeBase = execFileSync('git', ['merge-base', baseRef, 'HEAD'], { encoding: 'utf-8' }).trim();
    } catch {
      mergeBase = baseRef;
    }

    addFiles(getOutputZ(['diff', '--name-only', '--diff-filter=ACMR', '-z', mergeBase, 'HEAD']));
    addFiles(getOutputZ(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']));
    addFiles(getOutputZ(['diff', '--name-only', '--diff-filter=ACMR', '-z']));
    addFiles(getOutputZ(['ls-files', '--others', '--exclude-standard', '-z']));

    if (files.size === 0) {
      return [];
    }

    const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();

    const validFiles = Array.from(files).filter(f => {
      try {
        const fullPath = path.resolve(f);
        if (!fullPath.startsWith(repoRoot)) return false;
        const stat = fs.statSync(fullPath);
        return stat.isFile();
      } catch {
        return false;
      }
    });

    return validFiles.sort();
  } catch (error) {
    console.warn(`Warning: Git diff failed: ${error}`);
    return [];
  }
}

/**
 * Read file content with line numbers
 */
function readFileWithLines(filePath: string): { lines: string[]; content: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    return { lines, content };
  } catch {
    return { lines: [], content: '' };
  }
}

/**
 * Scan a single file for security issues
 */
function scanFile(
  filePath: string,
  rules: SecurityRule[],
  rulesDir: string
): Finding[] {
  const findings: Finding[] = [];
  const { lines, content } = readFileWithLines(filePath);

  if (lines.length === 0) {
    return findings;
  }

  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern, 'gi');

      // Search through entire file content for matches
      let match;
      while ((match = regex.exec(content)) !== null) {
        // Calculate line number from character position
        const lineNumber = content.substring(0, match.index).split('\n').length;

        // Get the line content for context
        const lineIndex = lineNumber - 1;
        const matchedText = lines[lineIndex]?.trim() || match[0];

        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          file: filePath,
          line: lineNumber,
          column: match.index - content.lastIndexOf('\n', match.index),
          matchedText: matchedText.substring(0, 100), // Truncate for readability
          cwe: rule.cwe,
          owasp: rule.owasp,
          description: rule.description,
          remediation: rule.remediation
        });

        // Prevent infinite loops on zero-width matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    } catch (error) {
      // Skip invalid regex patterns
      console.warn(`Warning: Invalid regex in rule ${rule.id}: ${rule.pattern}`);
    }
  }

  return findings;
}

/**
 * Scan multiple files
 */
function scanFiles(
  files: string[],
  rules: SecurityRule[],
  rulesDir: string
): ScanResult {
  const allFindings: Finding[] = [];
  let totalLines = 0;
  let filesScanned = 0;

  // Get current and base refs
  let headRef = 'HEAD';
  let baseRef = 'origin/main';

  try {
    headRef = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // Use default
  }

  for (const file of files) {
    // Skip vendor directories, etc.
    if (shouldSkipFile(file)) {
      continue;
    }

    if (file === '.') {
      // Scan all files in directory
      continue;
    }

    if (!fs.existsSync(file)) {
      continue;
    }

    const stat = fs.statSync(file);
    if (!stat.isFile()) {
      continue;
    }

    const findings = scanFile(file, rules, rulesDir);
    allFindings.push(...findings);

    const { lines } = readFileWithLines(file);
    totalLines += lines.length;
    filesScanned++;
  }

  // If files array contains '.', scan entire repository
  if (files.includes('.')) {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs', '.rb', '.php'];
    const allFiles = getAllCodeFiles('.', extensions);

    for (const file of allFiles) {
      const findings = scanFile(file, rules, rulesDir);
      allFindings.push(...findings);

      const { lines } = readFileWithLines(file);
      totalLines += lines.length;
      filesScanned++;
    }
  }

  // Sort findings by severity
  allFindings.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.file.localeCompare(b.file);
  });

  // Calculate summary
  const summary = {
    critical: allFindings.filter(f => f.severity === 'critical').length,
    high: allFindings.filter(f => f.severity === 'high').length,
    medium: allFindings.filter(f => f.severity === 'medium').length,
    low: allFindings.filter(f => f.severity === 'low').length,
    info: allFindings.filter(f => f.severity === 'info').length
  };

  return {
    timestamp: new Date().toISOString(),
    baseRef,
    headRef,
    filesScanned,
    totalLines,
    findings: allFindings,
    summary
  };
}

/**
 * Get all code files recursively
 */
function getAllCodeFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const skipDirs = [
    'node_modules', '.git', 'dist', 'build', '.next',
    '.venv', 'venv', '__pycache__', '.pytest_cache',
    'vendor', '.turbo', '.cache', 'antigravity'
  ];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip certain directories
      if (skipDirs.includes(entry.name)) {
        continue;
      }
      files.push(...getAllCodeFiles(fullPath, extensions));
    } else if (entry.isFile()) {
      if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Check if file path should be skipped (vendor directories, etc.)
 */
function shouldSkipFile(filePath: string): boolean {
  const skipPatterns = [
    /node_modules/, /\.git/, /\/dist\//, /\/build\//, /\.next\//,
    /\.venv\//, /\/venv\//, /__pycache__/, /\.pytest_cache\//,
    /\/vendor\//, /\.turbo\//, /\.cache\//, /antigravity\//
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(filePath)) {
      return true;
    }
  }
  return false;
}

/**
 * Format output as plain text
 */
function formatTextOutput(result: ScanResult, rulesDir: string): string {
  const lines: string[] = [];
  const grade = calculateGrade(result.summary);

  lines.push('═'.repeat(60));
  lines.push('  FORGEWRIGHT SECURITY SCAN REPORT');
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`Timestamp:  ${result.timestamp}`);
  lines.push(`Base Ref:   ${result.baseRef}`);
  lines.push(`Head Ref:   ${result.headRef}`);
  lines.push(`Files:      ${result.filesScanned}`);
  lines.push(`Lines:      ${result.totalLines}`);
  lines.push('');

  lines.push('─'.repeat(60));
  lines.push('  SUMMARY');
  lines.push('─'.repeat(60));
  lines.push(`  Grade:     ${getGradeEmoji(grade)} ${grade}`);
  lines.push(`  Critical:  ${result.summary.critical}`);
  lines.push(`  High:      ${result.summary.high}`);
  lines.push(`  Medium:    ${result.summary.medium}`);
  lines.push(`  Low:       ${result.summary.low}`);
  lines.push(`  Info:      ${result.summary.info}`);
  lines.push('');

  if (result.findings.length > 0) {
    lines.push('─'.repeat(60));
    lines.push('  DETAILED FINDINGS');
    lines.push('─'.repeat(60));
    lines.push('');

    // Group by severity
    const severityGroups = ['critical', 'high', 'medium', 'low', 'info'];
    for (const severity of severityGroups) {
      const findings = result.findings.filter(f => f.severity === severity);
      if (findings.length === 0) continue;

      lines.push(`[${severity.toUpperCase()}] ${findings.length} finding(s)`);
      lines.push('');

      for (const finding of findings) {
        lines.push(`  ${getSeverityIcon(severity)} ${finding.ruleName}`);
        lines.push(`     File:    ${finding.file}:${finding.line}`);
        lines.push(`     Rule:    ${finding.ruleId}`);
        if (finding.cwe) {
          lines.push(`     CWE:     ${finding.cwe}`);
        }
        lines.push(`     Code:    ${finding.matchedText}`);
        if (finding.remediation) {
          lines.push(`     Fix:     ${finding.remediation}`);
        }
        lines.push('');
      }
    }
  } else {
    lines.push('  ✓ No security issues found');
    lines.push('');
  }

  lines.push('═'.repeat(60));
  lines.push(`Scan completed at ${new Date().toISOString()}`);
  lines.push('═'.repeat(60));

  return lines.join('\n');
}

/**
 * Format output for GitHub Actions
 */
function formatGitHubOutput(result: ScanResult): object {
  const grade = calculateGrade(result.summary);
  const gradeColor = getGradeColor(grade);

  const summary = [
    `## 🔒 Forgewright Security Scan`,
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Grade | ${getGradeEmoji(grade)} ${grade} |`,
    `| Files Scanned | ${result.filesScanned} |`,
    `| Lines of Code | ${result.totalLines} |`,
    `| Critical | ${result.summary.critical} |`,
    `| High | ${result.summary.high} |`,
    `| Medium | ${result.summary.medium} |`,
    `| Low | ${result.summary.low} |`,
    ''
  ];

  const blocks: string[] = [];

  if (result.findings.length > 0) {
    // Group findings by severity and file
    const criticalHigh = result.findings.filter(f => f.severity === 'critical' || f.severity === 'high');

    if (criticalHigh.length > 0) {
      blocks.push('');
      blocks.push('### 🚨 Critical & High Severity Issues');
      blocks.push('');

      for (const finding of criticalHigh.slice(0, 10)) { // Limit to top 10
        blocks.push(`**${getSeverityIcon(finding.severity)} ${finding.ruleName}**`);
        blocks.push(`- File: \`${finding.file}:${finding.line}\``);
        blocks.push(`- Rule: \`${finding.ruleId}\``);
        if (finding.cwe) {
          blocks.push(`- CWE: ${finding.cwe}`);
        }
        if (finding.remediation) {
          blocks.push(`- Fix: ${finding.remediation}`);
        }
        blocks.push('');
      }

      if (criticalHigh.length > 10) {
        blocks.push(`_... and ${criticalHigh.length - 10} more critical/high issues_`);
        blocks.push('');
      }
    }

    const mediumLow = result.findings.filter(f => f.severity === 'medium' || f.severity === 'low');

    if (mediumLow.length > 0) {
      blocks.push('### ⚠️ Medium & Low Severity Issues');
      blocks.push(`_Found ${mediumLow.length} additional issues. See full report for details._`);
      blocks.push('');
    }
  } else {
    summary.push('✅ **No security issues found!**');
    summary.push('');
  }

  const shouldFail = grade === 'F' || result.summary.critical > 0;

  return {
    conclusion: shouldFail ? 'failure' : 'success',
    output: {
      title: `Security Scan: ${grade}`,
      summary: summary.join('\n'),
      text: blocks.join('\n')
    }
  };
}

/**
 * Calculate security grade
 */
function calculateGrade(summary: ScanResult['summary']): string {
  const { critical, high, medium, low } = summary;

  // A: 0 critical, 0 high
  if (critical === 0 && high === 0) return 'A';

  // B: 0 critical, ≤2 high
  if (critical === 0 && high <= 2) return 'B';

  // C: 0 critical, ≤5 high, ≤10 medium
  if (critical === 0 && high <= 5 && medium <= 10) return 'C';

  // D: ≤2 critical, ≤10 high
  if (critical <= 2 && high <= 10) return 'D';

  // F: >2 critical OR >10 high
  if (critical > 2 || high > 10) return 'F';

  // Default to C if conditions not met
  return 'C';
}

/**
 * Get grade color for GitHub
 */
function getGradeColor(grade: string): string {
  const colors: Record<string, string> = {
    'A': 'green',
    'B': 'brightgreen',
    'C': 'yellow',
    'D': 'orange',
    'F': 'red'
  };
  return colors[grade] || 'gray';
}

/**
 * Get emoji for grade
 */
function getGradeEmoji(grade: string): string {
  const emojis: Record<string, string> = {
    'A': '🟢',
    'B': '🔵',
    'C': '🟡',
    'D': '🟠',
    'F': '🔴'
  };
  return emojis[grade] || '⚪';
}

/**
 * Get icon for severity
 */
function getSeverityIcon(severity: string): string {
  const icons: Record<string, string> = {
    critical: '💀',
    high: '🚨',
    medium: '⚠️',
    low: 'ℹ️',
    info: '📝'
  };
  return icons[severity] || '•';
}

// Main execution
function main() {
  const options = parseArgs();
  const rulesDir = path.resolve(options.rulesDir);

  console.error(`Loading rules from: ${rulesDir}`);

  const rules = loadRules(rulesDir);
  console.error(`Loaded ${rules.length} security rules`);

  if (rules.length === 0) {
    console.error('No rules found. Exiting.');
    process.exit(0);
  }

  let files: string[] = [];
  if (options.files) {
    const patterns = options.files.split(',').map(f => f.trim().replace(/\\/g, '/'));
    let globSyncFunc: any;
    try {
      const glob = require('glob');
      globSyncFunc = glob.globSync || glob.sync;
    } catch {
      console.error('Error: glob library not found. Please ensure it is installed.');
      process.exit(1);
    }
    for (const pattern of patterns) {
      const matches = globSyncFunc(pattern, { absolute: true, windowsPathsNoEscape: true });
      if (!matches || matches.length === 0) {
        console.error(`Error: pattern '${pattern}' matched no files.`);
        process.exit(1);
      }
      for (const m of matches) {
        files.push(m);
      }
    }
    files = Array.from(new Set(files));
  } else {
    // Get changed files from git
    files = getChangedFiles(options.base);
  }

  if (files.length === 0) {
    // No changes or same ref - scan all files
    console.error('No changes detected or base ref matches HEAD. Use --files to specify files.');
    files = ['.'];
  }

  console.error(`Scanning ${files.length === 1 && files[0] === '.' ? 'all files' : files.length + ' file(s)'}`);

  const result = scanFiles(files, rules, rulesDir);

  // Output based on format
  switch (options.output) {
    case 'json':
      console.log(JSON.stringify(result, null, 2));
      break;

    case 'github':
      const githubOutput = formatGitHubOutput(result);
      console.log(JSON.stringify(githubOutput));
      break;

    default:
      console.log(formatTextOutput(result, rulesDir));
  }

  // Check fail conditions
  if (options.failOn) {
    const failSeverity = SEVERITY_ORDER[options.failOn];
    const hasFailingFinding = result.findings.some(
      f => SEVERITY_ORDER[f.severity] >= failSeverity
    );

    if (hasFailingFinding) {
      console.error(`\n✗ Exiting with error due to --fail-on ${options.failOn}`);
      process.exit(1);
    }
  }

  // Exit with error on F grade
  const grade = calculateGrade(result.summary);
  if (grade === 'F') {
    console.error('\n✗ Security grade is F. Merge blocked.');
    process.exit(1);
  }
}

// Export for testing
export {
  loadRules,
  scanFile,
  scanFiles,
  calculateGrade,
  formatTextOutput,
  formatGitHubOutput,
  Finding,
  ScanResult,
  SecurityRule
};

main();
