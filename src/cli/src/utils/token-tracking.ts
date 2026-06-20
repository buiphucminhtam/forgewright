import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  getProjectName,
  readProductionConfig,
  readTopLevelBlock,
  upsertTopLevelBlock,
  writeProductionConfig,
} from './project-config.js';

export interface TokenBudget {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface UsageSummary {
  usageDir: string;
  days: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latestTimestamp: string | null;
}

export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  daily: 5,
  weekly: 25,
  monthly: 80,
};

export function getDefaultUsageDir(projectRoot: string): string {
  return join(homedir(), '.forgewright', 'usage', getProjectName(projectRoot));
}

export function getBudgetPath(projectRoot: string): string {
  return join(projectRoot, '.forgewright', 'budget.yaml');
}

export function setTokenTrackingEnabled(projectRoot: string, enabled: boolean): void {
  const content = readProductionConfig(projectRoot);
  const block = buildTokenTrackingBlock(enabled);
  writeProductionConfig(projectRoot, upsertTopLevelBlock(content, 'token_tracking', block));

  mkdirSync(getDefaultUsageDir(projectRoot), { recursive: true });
  ensureBudgetFile(projectRoot);
}

export function getTokenTrackingEnabled(projectRoot: string): boolean {
  const block = readTopLevelBlock(readProductionConfig(projectRoot), 'token_tracking');
  if (!block) {
    return false;
  }
  return /enabled:\s*true/i.test(block);
}

export function ensureBudgetFile(projectRoot: string, budget: TokenBudget = DEFAULT_TOKEN_BUDGET): string {
  const budgetPath = getBudgetPath(projectRoot);
  if (existsSync(budgetPath)) {
    return budgetPath;
  }

  writeBudgetFile(projectRoot, budget);
  return budgetPath;
}

export function writeBudgetFile(projectRoot: string, budget: TokenBudget): string {
  const budgetPath = getBudgetPath(projectRoot);
  mkdirSync(join(projectRoot, '.forgewright'), { recursive: true });
  writeFileSync(
    budgetPath,
    [
      'budget:',
      `  daily: ${budget.daily}`,
      `  weekly: ${budget.weekly}`,
      `  monthly: ${budget.monthly}`,
      '  alerts:',
      '    warning: 0.80',
      '    danger: 0.95',
      '    critical: 1.00',
      '',
    ].join('\n'),
    'utf-8',
  );
  return budgetPath;
}

export function readBudgetFile(projectRoot: string): TokenBudget | null {
  const budgetPath = getBudgetPath(projectRoot);
  if (!existsSync(budgetPath)) {
    return null;
  }

  const content = readFileSync(budgetPath, 'utf-8');
  return {
    daily: readNumber(content, 'daily', DEFAULT_TOKEN_BUDGET.daily),
    weekly: readNumber(content, 'weekly', DEFAULT_TOKEN_BUDGET.weekly),
    monthly: readNumber(content, 'monthly', DEFAULT_TOKEN_BUDGET.monthly),
  };
}

export function summarizeUsage(projectRoot: string, days: number): UsageSummary {
  const usageDir = getDefaultUsageDir(projectRoot);
  const minTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const summary: UsageSummary = {
    usageDir,
    days,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    latestTimestamp: null,
  };

  if (!existsSync(usageDir)) {
    return summary;
  }

  for (const file of readdirSync(usageDir)) {
    if (!file.endsWith('.jsonl')) {
      continue;
    }

    const path = join(usageDir, file);
    const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : null;
        if (timestamp && Date.parse(timestamp) < minTime) {
          continue;
        }

        const inputTokens = numberField(entry.inputTokens);
        const outputTokens = numberField(entry.outputTokens);
        const cost = numberField(entry.cost);

        summary.calls += 1;
        summary.inputTokens += inputTokens;
        summary.outputTokens += outputTokens;
        summary.totalTokens += inputTokens + outputTokens;
        summary.estimatedCostUsd += cost;

        if (timestamp && (!summary.latestTimestamp || timestamp > summary.latestTimestamp)) {
          summary.latestTimestamp = timestamp;
        }
      } catch {
        continue;
      }
    }
  }

  summary.estimatedCostUsd = Number(summary.estimatedCostUsd.toFixed(6));
  return summary;
}

function buildTokenTrackingBlock(enabled: boolean): string {
  return [
    'token_tracking:',
    `  enabled: ${enabled ? 'true' : 'false'}`,
    '  log_dir: "~/.forgewright/usage"',
    '  export_format: jsonl',
  ].join('\n');
}

function readNumber(content: string, key: string, defaultValue: number): number {
  const pattern = new RegExp(`^[ \\t]*${key}:[ \\t]*([0-9]+(?:\\.[0-9]+)?)`, 'm');
  const match = content.match(pattern);
  if (!match) {
    return defaultValue;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
