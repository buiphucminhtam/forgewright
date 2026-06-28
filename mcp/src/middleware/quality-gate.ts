/**
 * Quality Gate Middleware
 *
 * Enforces a deterministic output quality score for every tool result that
 * passes through the runtime middleware chain. This does not replace the
 * project-level quality gate script; it makes the MCP runtime fail closed for
 * obviously bad tool outputs and emits machine-readable evidence for dashboards.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ToolContext, ToolResult, MiddlewareConfig } from './types.js';
import type { SandboxResult } from './tool-sandbox.js';

export interface QualityGateCriterion {
  name: string;
  score: number;
  maxScore: number;
  status: 'pass' | 'warn' | 'fail';
  reason: string;
}

export interface QualityGateReport {
  score: number;
  threshold: number;
  blockScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  blocked: boolean;
  failedCriteria: Array<{ name: string; score: number; reason: string }>;
  criteria: QualityGateCriterion[];
  evidence: {
    tool: string;
    skillId: string;
    mode: string;
    phase: string;
    sessionId: string;
    turnNumber: number;
    auditRef?: string;
    outputChars: number;
    injectionBlocked: boolean;
    truncated: boolean;
  };
}

interface QualityGateMetrics {
  totalEvaluations: number;
  blocked: number;
  warnings: number;
  lastScore: number | null;
}

const DEFAULT_CONFIG = {
  enabled: true,
  minimum_score: 90,
  block_score: 60,
  block_on_error: true,
  block_on_injection: false,
  require_non_empty_output: true,
  metrics_file: '.forgewright/quality-gate-events.jsonl',
};

function resultText(result: ToolResult): string {
  return result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function grade(score: number): QualityGateReport['grade'] {
  if (score >= 95) return 'A';
  if (score >= 90) return 'B';
  if (score >= 75) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export class QualityGateMiddleware {
  name = 'quality-gate';
  enabled = true;

  private config = { ...DEFAULT_CONFIG };
  private metrics: QualityGateMetrics = {
    totalEvaluations: 0,
    blocked: 0,
    warnings: 0,
    lastScore: null,
  };

  configure(config: MiddlewareConfig['quality_gate']): void {
    if (!config) return;
    this.enabled = config.enabled ?? this.enabled;
    this.config = {
      enabled: this.enabled,
      minimum_score: config.minimum_score ?? DEFAULT_CONFIG.minimum_score,
      block_score: config.block_score ?? DEFAULT_CONFIG.block_score,
      block_on_error: config.block_on_error ?? DEFAULT_CONFIG.block_on_error,
      block_on_injection: config.block_on_injection ?? DEFAULT_CONFIG.block_on_injection,
      require_non_empty_output:
        config.require_non_empty_output ?? DEFAULT_CONFIG.require_non_empty_output,
      metrics_file: config.metrics_file ?? DEFAULT_CONFIG.metrics_file,
    };
  }

  evaluate(ctx: ToolContext, result: ToolResult, sandbox?: SandboxResult): QualityGateReport {
    const text = resultText(result);
    const outputChars = text.trim().length;
    const injectionBlocked = sandbox?.injectionBlocked ?? false;
    const truncated = sandbox?.truncated ?? false;

    const criteria: QualityGateCriterion[] = [];

    criteria.push({
      name: 'Execution',
      score: result.isError ? 0 : 25,
      maxScore: 25,
      status: result.isError ? 'fail' : 'pass',
      reason: result.isError ? 'Tool returned an error result.' : 'Tool execution succeeded.',
    });

    const hasOutput = outputChars > 0 || !this.config.require_non_empty_output;
    criteria.push({
      name: 'Output Integrity',
      score: hasOutput ? 25 : 0,
      maxScore: 25,
      status: hasOutput ? 'pass' : 'fail',
      reason: hasOutput ? 'Tool produced non-empty output.' : 'Tool output is empty.',
    });

    criteria.push({
      name: 'Safety',
      score: injectionBlocked ? (this.config.block_on_injection ? 0 : 20) : 30,
      maxScore: 30,
      status: injectionBlocked ? (this.config.block_on_injection ? 'fail' : 'warn') : 'pass',
      reason: injectionBlocked
        ? 'Prompt-injection-looking output was detected by the sandbox.'
        : 'No prompt-injection-looking output detected.',
    });

    criteria.push({
      name: 'Traceability',
      score: sandbox?.auditRef ? 20 : 15,
      maxScore: 20,
      status: sandbox?.auditRef ? 'pass' : 'warn',
      reason: sandbox?.auditRef
        ? `Audit reference recorded: ${sandbox.auditRef}`
        : 'No audit reference recorded for this tool result.',
    });

    const score = criteria.reduce((sum, item) => sum + item.score, 0);
    const failedCriteria = criteria
      .filter((item) => item.status === 'fail')
      .map((item) => ({ name: item.name, score: item.score, reason: item.reason }));

    const blocked =
      score < this.config.block_score ||
      (this.config.block_on_error && Boolean(result.isError)) ||
      (this.config.block_on_injection && injectionBlocked);

    const report: QualityGateReport = {
      score,
      threshold: this.config.minimum_score,
      blockScore: this.config.block_score,
      grade: grade(score),
      blocked,
      failedCriteria,
      criteria,
      evidence: {
        tool: ctx.call.toolName,
        skillId: ctx.skillId,
        mode: ctx.mode,
        phase: ctx.phase,
        sessionId: ctx.sessionId,
        turnNumber: ctx.turnNumber,
        auditRef: sandbox?.auditRef,
        outputChars,
        injectionBlocked,
        truncated,
      },
    };

    this.record(report);
    return report;
  }

  getMetrics(): Readonly<QualityGateMetrics> {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalEvaluations: 0,
      blocked: 0,
      warnings: 0,
      lastScore: null,
    };
  }

  private record(report: QualityGateReport): void {
    this.metrics.totalEvaluations++;
    this.metrics.lastScore = report.score;
    if (report.blocked) this.metrics.blocked++;
    if (!report.blocked && report.score < report.threshold) this.metrics.warnings++;

    try {
      const file = this.config.metrics_file;
      const dir = dirname(file);
      if (dir && dir !== '.' && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      appendFileSync(
        file,
        JSON.stringify({
          type: 'QUALITY_GATE_EVALUATED',
          timestamp: new Date().toISOString(),
          report,
        }) + '\n',
      );
    } catch {
      // Metrics are diagnostic. Do not fail the tool path if recording fails.
    }
  }
}
