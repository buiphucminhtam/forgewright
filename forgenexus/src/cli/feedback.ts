/**
 * Feedback CLI Command
 * 
 * Subcommands:
 *   feedback add    - Add a new feedback entry
 *   feedback stats  - Show feedback statistics
 *   feedback list   - List feedback entries
 *   feedback get    - Get a specific feedback entry
 *   feedback resolve - Mark a feedback entry as resolved
 *   feedback export - Export feedback to JSON
 *   feedback clear  - Clear all feedback
 */

import {
  globalFeedback,
  loadFeedback,
  saveFeedback,
  printFeedbackStats,
  printFeedbackList,
  FeedbackCategory,
  FeedbackSeverity,
  FeedbackEntry,
} from '../feedback/collector.js';

export interface FeedbackAddOptions {
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  command: string;
  feature: string;
  description: string;
  expected?: string;
  actual?: string;
  confidenceScore?: number;
}

export interface FeedbackListOptions {
  unresolved?: boolean;
  category?: FeedbackCategory;
  severity?: FeedbackSeverity;
  limit?: number;
}

export interface FeedbackResolveOptions {
  id: string;
  resolution: string;
}

export function addFeedback(opts: FeedbackAddOptions): string {
  loadFeedback();
  
  const id = globalFeedback.add({
    category: opts.category,
    severity: opts.severity,
    command: opts.command || 'unknown',
    feature: opts.feature || 'general',
    description: opts.description,
    expected: opts.expected || '',
    actual: opts.actual || '',
    confidenceScore: opts.confidenceScore,
  });
  
  saveFeedback();
  return id;
}

export function showFeedbackStats(): string {
  loadFeedback();
  return printFeedbackStats();
}

export function listFeedback(opts: FeedbackListOptions = {}): string {
  loadFeedback();
  
  let entries: FeedbackEntry[];
  
  if (opts.unresolved) {
    entries = globalFeedback.getUnresolved();
  } else if (opts.category) {
    entries = globalFeedback.getByCategory(opts.category);
  } else if (opts.severity) {
    entries = globalFeedback.getBySeverity(opts.severity);
  } else {
    entries = globalFeedback.getAll();
  }
  
  return printFeedbackList(entries, opts.limit || 20);
}

export function getFeedback(id: string): string {
  loadFeedback();
  
  const entry = globalFeedback.getById(id);
  if (!entry) {
    return `\x1b[31mError:\x1b[0m Feedback entry "${id}" not found.`;
  }
  
  const lines: string[] = [
    `\n\x1b[1mFeedback Entry: ${entry.id}\x1b[0m`,
    '════════════════════════════════════════',
    `Category:   ${entry.category}`,
    `Severity:   ${entry.severity}`,
    `Command:    ${entry.command}`,
    `Feature:    ${entry.feature}`,
    `Confidence: ${entry.confidenceScore ?? 'N/A'}`,
    `Timestamp:  ${entry.timestamp}`,
    `Status:     ${entry.resolved ? '\x1b[32mResolved\x1b[0m' : '\x1b[33mUnresolved\x1b[0m'}`,
    '',
    '\x1b[1mDescription:\x1b[0m',
    entry.description,
    '',
  ];
  
  if (!entry.resolved) {
    lines.push('\x1b[1mExpected:\x1b[0m', entry.expected || '(none)', '');
    lines.push('\x1b[1mActual:\x1b[0m', entry.actual || '(none)', '');
  } else {
    lines.push('\x1b[1mResolution:\x1b[0m', entry.resolution || '(none)', '');
  }
  
  return lines.join('\n');
}

export function resolveFeedback(opts: FeedbackResolveOptions): string {
  loadFeedback();
  
  const success = globalFeedback.markResolved(opts.id, opts.resolution);
  saveFeedback();
  
  if (success) {
    return `\x1b[32m✓\x1b[0m Feedback "${opts.id}" marked as resolved.`;
  } else {
    return `\x1b[31mError:\x1b[0m Feedback entry "${opts.id}" not found.`;
  }
}

export function exportFeedback(): string {
  loadFeedback();
  return globalFeedback.exportJSON();
}

export function clearFeedback(confirm = false): string {
  if (!confirm) {
    return '\x1b[33mWarning:\x1b[0m This will delete all feedback entries. Use "feedback clear --confirm" to proceed.';
  }
  
  loadFeedback();
  globalFeedback.clear();
  saveFeedback();
  
  return '\x1b[32m✓\x1b[0m All feedback entries cleared.';
}

export function feedbackCommand(args: string[]): void {
  const subcommand = args[0];
  
  if (!subcommand) {
    printFeedbackHelp();
    return;
  }
  
  switch (subcommand) {
    case 'add':
      handleAdd(args.slice(1));
      break;
      
    case 'stats':
      console.log(showFeedbackStats());
      break;
      
    case 'list':
      handleList(args.slice(1));
      break;
      
    case 'get':
      if (args[1]) {
        console.log(getFeedback(args[1]));
      } else {
        console.error('\x1b[31mError:\x1b[0m Missing feedback ID.');
        console.error('Usage: forgenexus feedback get <id>');
      }
      break;
      
    case 'resolve':
      handleResolve(args.slice(1));
      break;
      
    case 'export':
      console.log(exportFeedback());
      break;
      
    case 'clear':
      handleClear(args.slice(1));
      break;
      
    case 'help':
      printFeedbackHelp();
      break;
      
    default:
      console.error(`\x1b[31mUnknown subcommand: ${subcommand}\x1b[0m`);
      printFeedbackHelp();
      process.exit(1);
  }
}

function handleAdd(args: string[]): void {
  const opts: FeedbackAddOptions = {
    category: 'other',
    severity: 'medium',
    command: 'unknown',
    feature: 'general',
    description: '',
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    if (arg === '--category' || arg === '-c') {
      if (next && isValidCategory(next)) {
        opts.category = next;
        i++;
      }
    } else if (arg === '--severity' || arg === '-s') {
      if (next && isValidSeverity(next)) {
        opts.severity = next;
        i++;
      }
    } else if (arg === '--command') {
      if (next) {
        opts.command = next;
        i++;
      }
    } else if (arg === '--feature' || arg === '-f') {
      if (next) {
        opts.feature = next;
        i++;
      }
    } else if (arg === '--expected') {
      if (next) {
        opts.expected = next;
        i++;
      }
    } else if (arg === '--actual') {
      if (next) {
        opts.actual = next;
        i++;
      }
    } else if (arg === '--confidence') {
      if (next) {
        opts.confidenceScore = parseFloat(next);
        i++;
      }
    } else if (!arg.startsWith('-')) {
      // First non-flag is description
      opts.description = arg;
    }
  }
  
  if (!opts.description) {
    console.error('\x1b[31mError:\x1b[0m Missing --description.');
    console.error('Usage: forgenexus feedback add --description "..." [--category false-positive] [--severity high]');
    process.exit(1);
  }
  
  const id = addFeedback(opts);
  console.log(`\x1b[32m✓\x1b[0m Feedback added: ${id}`);
}

function handleList(args: string[]): void {
  const opts: FeedbackListOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    if (arg === '--unresolved' || arg === '-u') {
      opts.unresolved = true;
    } else if (arg === '--category' || arg === '-c') {
      if (next && isValidCategory(next)) {
        opts.category = next;
        i++;
      }
    } else if (arg === '--severity' || arg === '-s') {
      if (next && isValidSeverity(next)) {
        opts.severity = next;
        i++;
      }
    } else if (arg === '--limit' || arg === '-l') {
      if (next) {
        opts.limit = parseInt(next, 10);
        i++;
      }
    }
  }
  
  console.log(listFeedback(opts));
}

function handleResolve(args: string[]): void {
  let id: string | undefined;
  let resolution = '';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    if (arg === '--resolution' || arg === '-r') {
      if (next) {
        resolution = next;
        i++;
      }
    } else if (!arg.startsWith('-')) {
      id = arg;
    }
  }
  
  if (!id) {
    console.error('\x1b[31mError:\x1b[0m Missing feedback ID.');
    console.error('Usage: forgenexus feedback resolve <id> --resolution "..."');
    process.exit(1);
  }
  
  if (!resolution) {
    console.error('\x1b[31mError:\x1b[0m Missing --resolution.');
    console.error('Usage: forgenexus feedback resolve <id> --resolution "..."');
    process.exit(1);
  }
  
  console.log(resolveFeedback({ id, resolution }));
}

function handleClear(args: string[]): void {
  const confirm = args.includes('--confirm') || args.includes('-y');
  console.log(clearFeedback(confirm));
}

function isValidCategory(v: string): v is FeedbackCategory {
  return ['false-positive', 'false-negative', 'performance', 'usability', 'accuracy', 'other'].includes(v);
}

function isValidSeverity(v: string): v is FeedbackSeverity {
  return ['low', 'medium', 'high', 'critical'].includes(v);
}

function printFeedbackHelp(): void {
  console.log(`
\x1b[1mForgeNexus Feedback CLI\x1b[0m

\x1b[1mUsage:\x1b[0m
  forgenexus feedback <subcommand> [options]

\x1b[1mSubcommands:\x1b[0m
  \x1b[32madd\x1b[0m       Add a new feedback entry
  \x1b[32mstats\x1b[0m     Show feedback statistics
  \x1b[32mlist\x1b[0m      List feedback entries
  \x1b[32mget\x1b[0]      Get a specific feedback entry
  \x1b[32mresolve\x1b[0   Mark a feedback entry as resolved
  \x1b[32mexport\x1b[0    Export feedback to JSON
  \x1b[32mclear\x1b[0     Clear all feedback

\x1b[1mOptions for 'add':\x1b[0m
  --category, -c  Category: false-positive, false-negative, performance, usability, accuracy, other
  --severity, -s  Severity: low, medium, high, critical
  --command       Command that triggered this (wiki, query, impact)
  --feature, -f   Feature: skeptic, rag, confidence, citation, etc.
  --expected      Expected behavior
  --actual        Actual behavior
  --confidence    Confidence score (0-1)
  --description   Description of the issue (required)

\x1b[1mOptions for 'list':\x1b[0m
  --unresolved, -u  Show only unresolved entries
  --category, -c    Filter by category
  --severity, -s    Filter by severity
  --limit, -l       Limit number of entries (default: 20)

\x1b[1mOptions for 'resolve':\x1b[0m
  --resolution, -r  Resolution text (required)

\x1b[1mExamples:\x1b[0m
  forgenexus feedback add --category false-positive --severity high --command wiki \\
    --feature skeptic --description "Skeptic rejected valid claim"
    
  forgenexus feedback list --unresolved
  forgenexus feedback resolve fb-1-abc123 --resolution "Fixed in v2.3.1"
  forgenexus feedback stats
`);
}
