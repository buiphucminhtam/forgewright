/**
 * Verification Middleware
 *
 * Applies Evidence-First checks to every runtime tool result. At this layer the
 * available evidence is the tool result, sandbox audit reference, and execution
 * metadata; higher-level skill verification can add richer tests on top.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ToolContext, ToolResult, MiddlewareConfig } from './types.js';
import type { SandboxResult } from './tool-sandbox.js';
import type { QualityGateReport } from './quality-gate.js';

export interface VerificationReport {
  status: 'pass' | 'fail';
  blocked: boolean;
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    evidence: string;
  }>;
  evidenceTrail: {
    tool: string;
    skillId: string;
    mode: string;
    phase: string;
    sessionId: string;
    turnNumber: number;
    auditRef?: string;
    qualityScore?: number;
  };
}

interface VerificationMetrics {
  totalVerifications: number;
  failed: number;
  blocked: number;
}

const DEFAULT_CONFIG = {
  enabled: true,
  enforce_evidence_first: true,
  require_audit_ref: false,
  metrics_file: '.forgewright/verification-events.jsonl',
};

function resultText(result: ToolResult): string {
  return result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

export class VerificationMiddleware {
  name = 'verification';
  enabled = true;

  private config = { ...DEFAULT_CONFIG };
  private metrics: VerificationMetrics = {
    totalVerifications: 0,
    failed: 0,
    blocked: 0,
  };

  configure(config: MiddlewareConfig['verification']): void {
    if (!config) return;
    this.enabled = config.enabled ?? this.enabled;
    this.config = {
      enabled: this.enabled,
      enforce_evidence_first:
        config.enforce_evidence_first ?? DEFAULT_CONFIG.enforce_evidence_first,
      require_audit_ref: config.require_audit_ref ?? DEFAULT_CONFIG.require_audit_ref,
      metrics_file: config.metrics_file ?? DEFAULT_CONFIG.metrics_file,
    };
  }

  verify(
    ctx: ToolContext,
    result: ToolResult,
    sandbox?: SandboxResult,
    qualityGate?: QualityGateReport,
  ): VerificationReport {
    const text = resultText(result).trim();
    const checks: VerificationReport['checks'] = [];

    checks.push({
      name: 'Direct Tool Evidence',
      status: text.length > 0 ? 'pass' : 'fail',
      evidence:
        text.length > 0
          ? `Tool returned ${text.length} non-whitespace characters.`
          : 'Tool returned no textual evidence.',
    });

    checks.push({
      name: 'Quality Gate Decision',
      status: qualityGate && !qualityGate.blocked ? 'pass' : 'fail',
      evidence: qualityGate
        ? `Quality score ${qualityGate.score}/${qualityGate.threshold}; blocked=${qualityGate.blocked}.`
        : 'No quality gate report was produced.',
    });

    checks.push({
      name: 'Audit Reference',
      status: sandbox?.auditRef ? 'pass' : this.config.require_audit_ref ? 'fail' : 'warn',
      evidence: sandbox?.auditRef
        ? `Audit reference: ${sandbox.auditRef}`
        : 'No sandbox audit reference was recorded.',
    });

    const hasFailure = checks.some((check) => check.status === 'fail');
    const blocked = this.config.enforce_evidence_first && hasFailure;

    const report: VerificationReport = {
      status: hasFailure ? 'fail' : 'pass',
      blocked,
      checks,
      evidenceTrail: {
        tool: ctx.call.toolName,
        skillId: ctx.skillId,
        mode: ctx.mode,
        phase: ctx.phase,
        sessionId: ctx.sessionId,
        turnNumber: ctx.turnNumber,
        auditRef: sandbox?.auditRef,
        qualityScore: qualityGate?.score,
      },
    };

    this.record(report);
    return report;
  }

  getMetrics(): Readonly<VerificationMetrics> {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalVerifications: 0,
      failed: 0,
      blocked: 0,
    };
  }

  private record(report: VerificationReport): void {
    this.metrics.totalVerifications++;
    if (report.status === 'fail') this.metrics.failed++;
    if (report.blocked) this.metrics.blocked++;

    try {
      const file = this.config.metrics_file;
      const dir = dirname(file);
      if (dir && dir !== '.' && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      appendFileSync(
        file,
        JSON.stringify({
          type: 'VERIFICATION_EVALUATED',
          timestamp: new Date().toISOString(),
          report,
        }) + '\n',
      );
    } catch {
      // Verification metrics must not make successful tool execution fail.
    }
  }
}
