#!/usr/bin/env node
/**
 * Comment Checker — Main CLI
 *
 * Usage:
 *   node check.ts <file> [--json] [--strict]
 *   node check.ts <directory> [--json] [--strict] [--ext .ts,.js]
 *   cat <file> | node check.ts --stdin [--json]
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { checkComment } from './patterns.js';

interface CheckResult {
  file: string;
  line: number;
  comment: string;
  ruleId: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

interface CheckSummary {
  total: number;
  errors: number;
  warnings: number;
  files: string[];
}

/**
 * Recursively get all files in a directory matching extensions
 */
function getFiles(dir: string, extensions: Set<string>): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFiles(fullPath, extensions));
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check a single file for comment slop
 */
function checkFile(filePath: string): CheckResult[] {
  const results: CheckResult[] = [];

  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Find single-line comments
      const commentMatch = line.match(/\/\/\s*(.+)$/);
      if (!commentMatch) continue;

      const comment = commentMatch[1].trim();
      const result = checkComment(comment);

      if (result && result.rule.type !== 'accept') {
        results.push({
          file: filePath,
          line: i + 1,
          comment,
          ruleId: result.rule.id,
          message: result.rule.message,
          severity: result.severity,
        });
      }
    }
  } catch (err) {
    console.error(`Error reading ${filePath}: ${err}`);
  }

  return results;
}

/**
 * Format a single result as text
 */
function formatResult(result: CheckResult, showPath = true): string {
  const prefix = showPath ? `${result.file}:${result.line}: ` : `${result.line}: `;
  const icon = result.severity === 'error' ? '✗' : result.severity === 'warning' ? '⚠' : 'ℹ';
  const sevLabel = result.severity.toUpperCase();
  return `${prefix}${icon} [${sevLabel}] [${result.ruleId}] ${result.message}\n  // ${result.comment}`;
}

/**
 * Main CLI
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Comment Checker — Detect AI-generated comment slop

Usage:
  node check.ts <file> [--json] [--strict]
  node check.ts <directory> [--json] [--strict] [--ext .ts,.js]
  cat <file> | node check.ts --stdin [--json]

Options:
  --json      Output JSON format
  --strict    Exit with code 1 if any errors found
  --ext       Comma-separated list of extensions (default: .ts,.tsx,.js,.jsx)
  --stdin     Read from stdin instead of files

Exit codes:
  0   No slop found (or only info-level)
  1   Errors or warnings found (in strict mode)
  2   File not found or error
`);
    process.exit(0);
  }

  const outputJson = args.includes('--json');
  const strict = args.includes('--strict');
  const stdin = args.includes('--stdin');

  // Parse extensions
  const extArg = args[args.indexOf('--ext') + 1];
  const extensions = new Set(
    (extArg || '.ts,.tsx,.js,.jsx').split(',').map(e => e.trim())
  );

  // Filter out options
  const paths = args.filter(
    a => !a.startsWith('--') && a !== '--json' && a !== '--strict' && a !== '--stdin'
  );

  let allResults: CheckResult[] = [];
  let allFiles: string[] = [];

  if (stdin) {
    const content = readFileSync('/dev/stdin', 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const commentMatch = lines[i].match(/\/\/\s*(.+)$/);
      if (!commentMatch) continue;
      const comment = commentMatch[1].trim();
      const result = checkComment(comment);
      if (result && result.rule.type !== 'accept') {
        allResults.push({
          file: 'stdin',
          line: i + 1,
          comment,
          ruleId: result.rule.id,
          message: result.rule.message,
          severity: result.severity,
        });
      }
    }
  } else {
    for (const path of paths) {
      try {
        const stat = statSync(path);
        if (stat.isDirectory()) {
          const files = getFiles(path, extensions);
          allFiles.push(...files);
          for (const file of files) {
            allResults.push(...checkFile(file));
          }
        } else {
          allFiles.push(path);
          allResults.push(...checkFile(path));
        }
      } catch (err) {
        console.error(`Error: ${path}: ${err}`);
        process.exit(2);
      }
    }
  }

  const summary: CheckSummary = {
    total: allResults.length,
    errors: allResults.filter(r => r.severity === 'error').length,
    warnings: allResults.filter(r => r.severity === 'warning').length,
    files: [...new Set(allResults.map(r => r.file))],
  };

  if (outputJson) {
    console.log(JSON.stringify({ results: allResults, summary }, null, 2));
  } else {
    if (allResults.length === 0) {
      console.log('✓ No comment slop found.');
    } else {
      console.log(`\nFound ${summary.errors} errors, ${summary.warnings} warnings in ${summary.files.length} file(s):\n`);
      for (const result of allResults) {
        console.log(formatResult(result));
      }
    }
  }

  if (strict && (summary.errors > 0 || summary.warnings > 0)) {
    process.exit(1);
  }
}

main();
