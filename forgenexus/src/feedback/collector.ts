/**
 * Feedback Collector — captures user feedback during internal + beta testing
 */

export type FeedbackCategory = 
  | 'false-positive'
  | 'false-negative'
  | 'performance'
  | 'usability'
  | 'accuracy'
  | 'other';

export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface FeedbackEntry {
  id: string;
  timestamp: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  command: string;           // Which command triggered this (wiki, query, impact)
  feature: string;           // Which feature (skeptic, rag, confidence, etc.)
  description: string;
  expected: string;
  actual: string;
  confidenceScore?: number;
  resolved: boolean;
  resolution?: string;
}

export class FeedbackCollector {
  private entries: FeedbackEntry[] = [];
  private _id = 0;
  
  add(feedback: Omit<FeedbackEntry, 'id' | 'timestamp' | 'resolved'>): string {
    const id = `fb-${++this._id}-${Date.now().toString(36)}`;
    this.entries.push({
      ...feedback,
      id,
      timestamp: new Date().toISOString(),
      resolved: false,
    });
    return id;
  }
  
  markResolved(id: string, resolution: string): boolean {
    const entry = this.entries.find(e => e.id === id);
    if (entry) {
      entry.resolved = true;
      entry.resolution = resolution;
      return true;
    }
    return false;
  }
  
  getStats(): FeedbackStats {
    const total = this.entries.length;
    const resolved = this.entries.filter(e => e.resolved).length;
    const byCategory: Record<FeedbackCategory, number> = {
      'false-positive': 0,
      'false-negative': 0,
      'performance': 0,
      'usability': 0,
      'accuracy': 0,
      'other': 0,
    };
    const bySeverity: Record<FeedbackSeverity, number> = {
      'low': 0, 
      'medium': 0, 
      'high': 0, 
      'critical': 0,
    };
    
    for (const entry of this.entries) {
      byCategory[entry.category]++;
      bySeverity[entry.severity]++;
    }
    
    return {
      total,
      resolved,
      resolutionRate: total > 0 ? resolved / total : 0,
      byCategory,
      bySeverity,
      criticalUnresolved: this.entries.filter(e => e.severity === 'critical' && !e.resolved).length,
    };
  }
  
  getUnresolved(): FeedbackEntry[] {
    return this.entries.filter(e => !e.resolved);
  }
  
  getByCategory(category: FeedbackCategory): FeedbackEntry[] {
    return this.entries.filter(e => e.category === category);
  }
  
  getBySeverity(severity: FeedbackSeverity): FeedbackEntry[] {
    return this.entries.filter(e => e.severity === severity);
  }
  
  getAll(): FeedbackEntry[] {
    return [...this.entries];
  }
  
  getById(id: string): FeedbackEntry | undefined {
    return this.entries.find(e => e.id === id);
  }
  
  exportJSON(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      entries: this.entries,
      stats: this.getStats(),
    }, null, 2);
  }
  
  importJSON(json: string): number {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data.entries)) {
        for (const entry of data.entries as FeedbackEntry[]) {
          if (entry.id && entry.timestamp && entry.category && entry.severity) {
            this.entries.push(entry);
            // Update _id to be higher than any imported id
            const match = entry.id.match(/^fb-(\d+)-/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > this._id) this._id = num;
            }
          }
        }
        return this.entries.length;
      }
      return 0;
    } catch {
      return 0;
    }
  }
  
  clear(): void {
    this.entries = [];
    this._id = 0;
  }
}

export interface FeedbackStats {
  total: number;
  resolved: number;
  resolutionRate: number;
  byCategory: Record<FeedbackCategory, number>;
  bySeverity: Record<FeedbackSeverity, number>;
  criticalUnresolved: number;
}

// Global singleton for CLI usage
export const globalFeedback = new FeedbackCollector();

// CLI feedback command
export function printFeedbackStats(): string {
  const stats = globalFeedback.getStats();
  const unresolved = globalFeedback.getUnresolved();
  
  const lines: string[] = [
    '\x1b[1m📊 Feedback Statistics\x1b[0m',
    '─────────────────────',
    `Total: ${stats.total} | Resolved: ${stats.resolved} (${(stats.resolutionRate * 100).toFixed(0)}%)`,
    '',
    'By Category:',
    ...Object.entries(stats.byCategory).map(([cat, count]) => 
      `  ${cat}: ${count}`
    ),
    '',
    'By Severity:',
    ...Object.entries(stats.bySeverity).map(([sev, count]) => 
      `  ${sev}: ${count}`
    ),
    '',
    `⚠️  Critical unresolved: ${stats.criticalUnresolved}`,
    '',
  ];
  
  if (unresolved.length > 0) {
    lines.push('Recent Unresolved:');
    for (const u of unresolved.slice(0, 5)) {
      lines.push(`  [\x1b[31m${u.severity}\x1b[0m] ${u.id} — ${u.category}: ${u.description.slice(0, 60)}`);
    }
  }
  
  return lines.join('\n');
}

export function printFeedbackList(entries: FeedbackEntry[], limit = 20): string {
  if (entries.length === 0) {
    return 'No feedback entries found.';
  }
  
  const lines: string[] = [
    `\n\x1b[1mFeedback Entries (${entries.length})\x1b[0m\n`,
  ];
  
  for (const entry of entries.slice(0, limit)) {
    const statusIcon = entry.resolved ? '\x1b[32m✓\x1b[0m' : '\x1b[33m○\x1b[0m';
    const severityColor = entry.severity === 'critical' ? '\x1b[31m' : 
                          entry.severity === 'high' ? '\x1b[33m' : '';
    const resetColor = severityColor ? '\x1b[0m' : '';
    
    lines.push(`${statusIcon} [\x1b[1m${entry.id}\x1b[0m] ${severityColor}${entry.severity}${resetColor} | ${entry.category}`);
    lines.push(`   Command: ${entry.command} | Feature: ${entry.feature}`);
    lines.push(`   ${entry.description.slice(0, 80)}`);
    if (!entry.resolved) {
      lines.push(`   Expected: ${entry.expected.slice(0, 60)}`);
      lines.push(`   Actual:   ${entry.actual.slice(0, 60)}`);
    } else {
      lines.push(`   \x1b[32mResolved:\x1b[0m ${entry.resolution}`);
    }
    lines.push('');
  }
  
  if (entries.length > limit) {
    lines.push(`... and ${entries.length - limit} more (use --limit to see more)`);
  }
  
  return lines.join('\n');
}

// File-based persistence
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const FEEDBACK_FILE = join(homedir(), '.forgenexus', 'feedback.json');

export function loadFeedback(): void {
  try {
    if (existsSync(FEEDBACK_FILE)) {
      const data = readFileSync(FEEDBACK_FILE, 'utf8');
      globalFeedback.importJSON(data);
    }
  } catch {
    // Ignore errors, start fresh
  }
}

export function saveFeedback(): void {
  try {
    const dir = join(homedir(), '.forgenexus');
    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(FEEDBACK_FILE, globalFeedback.exportJSON(), 'utf8');
  } catch {
    // Ignore errors
  }
}

// Auto-save on process exit
if (typeof process !== 'undefined') {
  process.on('exit', () => saveFeedback());
  // Also save periodically
  setInterval(() => saveFeedback(), 60000); // Every minute
}
