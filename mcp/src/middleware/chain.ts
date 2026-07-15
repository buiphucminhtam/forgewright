/**
 * Middleware Chain Orchestrator
 *
 * Manages the ordered execution of all middleware around tool calls.
 * Follows the 13-step chain from middleware-chain.md:
 *
 * Pre-Skill (top → bottom):
 *   ① SessionData    → load profile, session state
 *   ② ContextLoader  → load memory, conventions
 *   ③ DryRunContext  → system prompt injection (mock mode)
 *   ③ SkillRegistry  → progressive skill discovery
 *   ④ Guardrail      → pre-tool authorization
 *   ④b SessionDedup  → deduplication cache check
 *   ⑤ Summarization  → auto-compress if > 70% budget
 *
 * Tool Execution (injected by chain)
 *
 * Post-Skill (bottom → top):
 *   ⑥ QualityGate     → post-skill validation
 *   ⑦ BrownfieldSafety → regression + protected paths
 *   ⑧ TaskTracking     → update todos, emit events
 *   ⑨ Memory          → async fact extraction + store
 *   ⑩ GracefulFailure  → retry logic, stuck detection
 *   ⑪ CircuitBreaker  → fault isolation + state machine
 *   ⑫ Verification    → contract + criteria check
 */

import type { ToolContext, ToolResult, MiddlewareConfig, ToolCall } from './types.js';
import { ContextOffloadMiddleware } from './context-offload.js';
import { QualityGateMiddleware, type QualityGateReport } from './quality-gate.js';
import { SessionDeduplicationMiddleware } from './session-deduplication.js';
import { ToolSandboxMiddleware } from './tool-sandbox.js';
import { VerificationMiddleware, type VerificationReport } from './verification.js';
import { GuardrailMiddleware, type PolicyEvaluation, type PolicyEvaluator } from './guardrail.js';

export type MiddlewareHook = 'before_tool' | 'after_tool' | 'on_error';

export interface ChainOptions {
  config: MiddlewareConfig;
  onMetrics?(
    name: string,
    hook: MiddlewareHook,
    durationMs: number,
    status: 'ok' | 'skip' | 'error',
  ): void;
  onCacheHit?(toolName: string, dedup: { seenCount: number; tokensSaved: number }): void;
  onCacheMiss?(toolName: string): void;
  policyEvaluator?: PolicyEvaluator;
}

export class MiddlewareChain {
  private sessionDedup = new SessionDeduplicationMiddleware();
  private toolSandbox = new ToolSandboxMiddleware();
  private contextOffload = new ContextOffloadMiddleware();
  private qualityGate = new QualityGateMiddleware();
  private verification = new VerificationMiddleware();
  private guardrail: GuardrailMiddleware;
  private options: ChainOptions;

  constructor(options: ChainOptions) {
    this.options = options;
    this.guardrail = new GuardrailMiddleware(options.policyEvaluator);
    this.sessionDedup.configure(options.config.session_deduplication);
    this.toolSandbox.configure(options.config.tool_sandbox || {});
    this.contextOffload.configure(options.config.context_offload);
    this.qualityGate.configure(options.config.quality_gate);
    this.verification.configure(options.config.verification);
  }

  /**
   * Execute middleware chain for a tool call.
   * Returns either a cached result (if dedup hit) or passes through for execution.
   */
  async executeTool(
    toolCall: ToolCall,
    skillId: string,
    mode: string,
    phase: string,
    turnNumber: number,
    sessionId: string,
    userMessage: string,
    execute: () => Promise<ToolResult>,
  ): Promise<{
    result: ToolResult;
    cached: boolean;
    dedup?: { seenCount: number; tokensSaved: number; summary: string };
    middlewareMs: number;
    qualityGate?: QualityGateReport;
    verification?: VerificationReport;
    offloadRef?: string;
    guardrail?: PolicyEvaluation;
  }> {
    const ctx: ToolContext = {
      call: toolCall,
      skillId: skillId as ToolContext['skillId'],
      mode: mode as ToolContext['mode'],
      phase: phase as ToolContext['phase'],
      turnNumber,
      sessionId,
      userMessage,
    };

    const chainStart = Date.now();
    let middlewareMs = 0;

    // ── before_tool hooks ───────────────────────────────
    // ④ Guardrail: policy authorization must happen before cache lookup or execution.
    const guardrailStart = Date.now();
    const guardrail = await this.guardrail.beforeTool(toolCall.toolName, toolCall.toolArgs);
    const guardrailMs = Date.now() - guardrailStart;
    this.options.onMetrics?.(
      'guardrail',
      'before_tool',
      guardrailMs,
      guardrail.action === 'allow' ? 'ok' : guardrail.action === 'warn' ? 'skip' : 'error',
    );
    if (guardrail.action === 'block' || guardrail.action === 'config-error') {
      middlewareMs = Date.now() - chainStart;
      return {
        result: {
          content: [
            {
              type: 'text' as const,
              text: `Blocked by execution policy (${guardrail.action}): ${guardrail.reason ?? 'no reason provided'}`,
            },
          ],
          isError: true,
        },
        cached: false,
        middlewareMs,
        guardrail,
      };
    }

    // ④b SessionDeduplication
    const dedupResult = this.sessionDedup.before_tool(ctx);
    middlewareMs = Date.now() - chainStart;

    if (dedupResult.action === 'cached') {
      this.options.onCacheHit?.(toolCall.toolName, {
        seenCount: dedupResult.dedup.seenCount,
        tokensSaved: dedupResult.dedup.tokensSaved,
      });
      this.options.onMetrics?.('session-deduplication', 'before_tool', middlewareMs, 'ok');

      return {
        result: dedupResult.cachedResult,
        cached: true,
        dedup: dedupResult.dedup,
        middlewareMs,
        guardrail,
      };
    }

    if (dedupResult.action === 'block') {
      this.options.onMetrics?.('session-deduplication', 'before_tool', middlewareMs, 'error');
      return {
        result: {
          content: [
            {
              type: 'text' as const,
              text: `Blocked by middleware: ${dedupResult.reason}`,
            },
          ],
          isError: true,
        },
        cached: false,
        middlewareMs,
        guardrail,
      };
    }

    // ── Tool Execution ────────────────────────────────────
    this.options.onCacheMiss?.(toolCall.toolName);
    const execStart = Date.now();
    let result: ToolResult;
    try {
      result = await execute();
    } catch (err) {
      // ── on_error hooks ─────────────────────────────────
      middlewareMs = Date.now() - chainStart;
      this.options.onMetrics?.('session-deduplication', 'on_error', middlewareMs, 'error');
      throw err;
    }
    const execMs = Date.now() - execStart;

    // ④c ToolSandbox: sanitize + compress before anything enters cache/model context.
    const sandboxStart = Date.now();
    let processedResult = result;
    let sandbox;
    if (this.toolSandbox.enabled) {
      const sandboxed = this.toolSandbox.processResult(ctx, result);
      processedResult = sandboxed.result;
      sandbox = sandboxed.sandbox;
      this.options.onMetrics?.(
        'tool-sandbox',
        'after_tool',
        Date.now() - sandboxStart,
        sandboxed.sandbox.injectionBlocked ? 'skip' : 'ok',
      );
    }

    // ④d ContextOffload: persist full sanitized output with trace handle.
    const offloadStart = Date.now();
    let offloadRef: string | undefined;
    if (this.contextOffload.enabled) {
      const offload = this.contextOffload.processResult(ctx, result, processedResult);
      offloadRef = offload.event?.result_ref;
      this.options.onMetrics?.(
        'context-offload',
        'after_tool',
        Date.now() - offloadStart,
        offload.offloaded ? 'ok' : 'skip',
      );
    }

    // ⑥ QualityGate: deterministic output validation.
    let qualityGateReport: QualityGateReport | undefined;
    const qualityGateStart = Date.now();
    if (this.qualityGate.enabled) {
      qualityGateReport = this.qualityGate.evaluate(ctx, processedResult, sandbox);
      this.options.onMetrics?.(
        'quality-gate',
        'after_tool',
        Date.now() - qualityGateStart,
        qualityGateReport.blocked
          ? 'error'
          : qualityGateReport.score < qualityGateReport.threshold
            ? 'skip'
            : 'ok',
      );

      if (qualityGateReport.blocked) {
        const totalMs = Date.now() - chainStart;
        return {
          result: {
            content: [
              {
                type: 'text' as const,
                text:
                  `Blocked by quality gate: score ${qualityGateReport.score}/${qualityGateReport.threshold}. ` +
                  qualityGateReport.failedCriteria
                    .map((item) => `${item.name}: ${item.reason}`)
                    .join('; '),
              },
            ],
            isError: true,
          },
          cached: false,
          middlewareMs: totalMs,
          qualityGate: qualityGateReport,
          guardrail,
        };
      }
    }

    // ⑭ Verification: Evidence-First output verification.
    let verificationReport: VerificationReport | undefined;
    const verificationStart = Date.now();
    if (this.verification.enabled) {
      verificationReport = this.verification.verify(
        ctx,
        processedResult,
        sandbox,
        qualityGateReport,
      );
      this.options.onMetrics?.(
        'verification',
        'after_tool',
        Date.now() - verificationStart,
        verificationReport.blocked ? 'error' : verificationReport.status === 'fail' ? 'skip' : 'ok',
      );

      if (verificationReport.blocked) {
        const totalMs = Date.now() - chainStart;
        return {
          result: {
            content: [
              {
                type: 'text' as const,
                text:
                  'Blocked by verification: ' +
                  verificationReport.checks
                    .filter((item) => item.status === 'fail')
                    .map((item) => `${item.name}: ${item.evidence}`)
                    .join('; '),
              },
            ],
            isError: true,
          },
          cached: false,
          middlewareMs: totalMs,
          qualityGate: qualityGateReport,
          verification: verificationReport,
          guardrail,
        };
      }
    }

    // Store processed, verified result in dedup store (for future cache hits)
    ctx.call.result = processedResult;
    this.sessionDedup.after_tool(ctx);

    // ── after_tool hooks ────────────────────────────────
    const totalMs = Date.now() - chainStart;

    this.options.onMetrics?.('session-deduplication', 'after_tool', totalMs - execMs, 'ok');

    return {
      result: processedResult,
      cached: false,
      middlewareMs: totalMs,
      qualityGate: qualityGateReport,
      verification: verificationReport,
      offloadRef,
      guardrail,
    };
  }

  /** Get deduplication metrics. */
  getDedupMetrics() {
    return {
      ...this.sessionDedup.getMetrics(),
      hitRate: this.sessionDedup.getHitRate(),
      storeSize: this.sessionDedup.getStoreSize(),
    };
  }

  /** Get tool sandbox metrics. */
  getSandboxMetrics() {
    return this.toolSandbox.getMetrics();
  }

  /** Get context offload metrics. */
  getOffloadMetrics() {
    return this.contextOffload.getMetrics();
  }

  /** Get quality gate metrics. */
  getQualityGateMetrics() {
    return this.qualityGate.getMetrics();
  }

  /** Get verification metrics. */
  getVerificationMetrics() {
    return this.verification.getMetrics();
  }

  /** Reset deduplication store (on session end). */
  resetSession() {
    this.sessionDedup.reset();
  }

  /** Reset metrics only. */
  resetMetrics() {
    this.sessionDedup.resetMetrics();
    this.toolSandbox.resetMetrics();
    this.contextOffload.resetMetrics();
    this.qualityGate.resetMetrics();
    this.verification.resetMetrics();
  }
}

/**
 * Create a dedup middleware instance for direct use (without the full chain).
 * Useful for testing or embedding in other contexts.
 */
export function createDedupMiddleware(
  config?: MiddlewareConfig['session_deduplication'],
): SessionDeduplicationMiddleware {
  const mw = new SessionDeduplicationMiddleware();
  mw.configure(config);
  return mw;
}
