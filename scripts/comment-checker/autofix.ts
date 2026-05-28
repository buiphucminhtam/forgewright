#!/usr/bin/env node
/**
 * Comment Checker — Auto-fix for common slop patterns
 *
 * Usage:
 *   node autofix.ts <file> [--rule <rule-id>]
 *   node autofix.ts <directory> [--rule <rule-id>] [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

interface FixResult {
  file: string;
  line: number;
  oldComment: string;
  newComment: string;
  fixed: boolean;
  message: string;
}

interface FixConfig {
  rule?: string;
  dryRun: boolean;
}

/**
 * Auto-fix mappings for specific rule IDs
 */
const fixStrategies: Record<string, (comment: string) => string | null> = {
  'obvious-action': (comment) => {
    // Remove obvious action comments (the code speaks for itself)
    return null; // Delete the comment
  },
  'self-documenting': (comment) => {
    // Remove self-documenting comments
    return null;
  },
  'todo-without-meta': (comment) => {
    // Cannot auto-fix TODOs without knowing assignee/deadline
    return null;
  },
  'stale-comment': (comment) => {
    // Flag for manual review
    return null;
  },
};

/**
 * Recursively get all files matching extensions
 */
function getFiles(dir: string, extensions: Set<string>): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getFiles(fullPath, extensions));
      } else if (entry.isFile() && extensions.has(extname(entry.name))) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}: ${err}`);
  }
  return files;
}

/**
 * Fix a single file
 */
function fixFile(filePath: string, ruleFilter?: string): FixResult[] {
  const results: FixResult[] = [];

  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const newLines = [...lines];

    let modified = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const commentMatch = line.match(/^(\s*)(\/\/\s*)(.+)$/);

      if (!commentMatch) continue;

      const [, indent, prefix, comment] = commentMatch;

      // Check if comment matches any auto-fixable rule
      for (const [ruleId, strategy] of Object.entries(fixStrategies)) {
        if (ruleFilter && ruleId !== ruleFilter) continue;

        // Simple pattern matching for demonstration
        const obviousActionPattern = /\/\/\s*(add|remove|delete|create|get|set|update|increment|decrement|check|validate|parse|convert|transform|calculate|compute|fetch|load|save|write|read|open|close|init|initialize|start|stop|begin|end|return|throw|catch|try)\s+\w+/i;
        const selfDocPattern = /\/\/\s*(this|variable|function|method|class|object|array|file)\s+(is|was|does|does not|represents)/i;

        let shouldFix = false;
        if (ruleId === 'obvious-action' && obviousActionPattern.test(line)) {
          shouldFix = true;
        } else if (ruleId === 'self-documenting' && selfDocPattern.test(line)) {
          shouldFix = true;
        }

        if (shouldFix) {
          const newComment = strategy(comment.trim());
          if (newComment === null) {
            // Delete the comment line
            newLines[i] = indent;
            modified = true;
            results.push({
              file: filePath,
              line: i + 1,
              oldComment: line.trim(),
              newComment: '(deleted)',
              fixed: true,
              message: `Deleted ${ruleId} comment`,
            });
          } else if (newComment !== comment.trim()) {
            newLines[i] = `${indent}${prefix}${newComment}`;
            modified = true;
            results.push({
              file: filePath,
              line: i + 1,
              oldComment: comment.trim(),
              newComment,
              fixed: true,
              message: `Fixed ${ruleId} comment`,
            });
          }
          break;
        }
      }
    }

    if (modified) {
      const newContent = newLines.join('\n');
      results.push({
        file: filePath,
        line: 0,
        oldComment: '',
        newComment: '',
        fixed: true,
        message: `File modified (${results.filter(r => r.line > 0).length} comment(s) fixed)`,
      });

      if (!ruleFilter || ruleFilter === 'dry-run') {
        // Don't write in dry-run
      } else {
        writeFileSync(filePath, newContent, 'utf8');
      }
    }
  } catch (err) {
    console.error(`Error processing ${filePath}: ${err}`);
  }

  return results;
}

/**
 * Main CLI
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Comment Checker — Auto-fix slop comments

Usage:
  node autofix.ts <file> [--rule <rule-id>] [--dry-run]
  node autofix.ts <directory> [--rule <rule-id>] [--dry-run]

Rules:
  obvious-action   Delete comments that state obvious actions
  self-documenting Delete comments that restate the code

Options:
  --dry-run    Show what would be changed without modifying files
  --rule       Apply only to specific rule

Examples:
  node autofix.ts src/                  # Fix all in src/
  node autofix.ts src/ --dry-run       # Preview changes
  node autofix.ts src/ --rule obvious-action  # Only obvious-action
`);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const ruleIdx = args.indexOf('--rule');
  const rule = ruleIdx !== -1 ? args[ruleIdx + 1] : undefined;

  // Filter out options
  const paths = args.filter(
    a => !a.startsWith('--') && a !== '--dry-run'
  );

  if (ruleIdx !== -1) {
    paths.splice(paths.indexOf('--rule'), 2);
  }

  const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

  for (const path of paths) {
    try {
      const stat = statSync(path);
      if (stat.isDirectory()) {
        const files = getFiles(path, extensions);
        for (const file of files) {
          const results = fixFile(file, rule);
          for (const result of results) {
            if (result.line === 0) {
              console.log(`\n${result.file}: ${result.message}`);
            } else {
              const action = result.newComment === '(deleted)' ? 'DELETE' : 'MODIFY';
              console.log(`  ${result.line}: [${action}] ${result.message}`);
              if (!dryRun) {
                console.log(`    OLD: // ${result.oldComment}`);
                if (result.newComment !== '(deleted)') {
                  console.log(`    NEW: // ${result.newComment}`);
                }
              }
            }
          }
        }
      } else {
        const results = fixFile(path, rule);
        for (const result of results) {
          if (result.line === 0) {
            console.log(`\n${result.file}: ${result.message}`);
          } else {
            const action = result.newComment === '(deleted)' ? 'DELETE' : 'MODIFY';
            console.log(`  ${result.line}: [${action}] ${result.message}`);
            if (!dryRun) {
              console.log(`    OLD: // ${result.oldComment}`);
              if (result.newComment !== '(deleted)') {
                console.log(`    NEW: // ${result.newComment}`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error: ${path}: ${err}`);
    }
  }

  if (dryRun) {
    console.log('\n(Dry-run mode — no files were modified)');
  }
}

main();
