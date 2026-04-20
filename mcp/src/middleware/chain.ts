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
import { SessionDeduplicationMiddleware } from './session-deduplication.js';

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
}

export class MiddlewareChain {
  private sessionDedup = new SessionDeduplicationMiddleware();
  private options: ChainOptions;

  constructor(options: ChainOptions) {
    this.options = options;
    this.sessionDedup.configure(options.config.session_deduplication);
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
    // ④b SessionDeduplication (the only implemented hook so far)
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

    // Store result in dedup store (for future cache hits)
    ctx.call.result = result;
    this.sessionDedup.after_tool(ctx);

    // ── after_tool hooks ────────────────────────────────
    // (Placeholder for QualityGate, BrownfieldSafety, etc.)
    const totalMs = Date.now() - chainStart;

    this.options.onMetrics?.('session-deduplication', 'after_tool', totalMs - execMs, 'ok');

    return {
      result,
      cached: false,
      middlewareMs: totalMs,
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

  /** Reset deduplication store (on session end). */
  resetSession() {
    this.sessionDedup.reset();
  }

  /** Reset metrics only. */
  resetMetrics() {
    this.sessionDedup.resetMetrics();
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
