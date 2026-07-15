import { MiddlewareChain } from '../middleware/chain.js';
import { randomUUID } from 'node:crypto';
import type { MiddlewareConfig, ToolResult } from '../middleware/types.js';
import {
  ProcessPolicyEvaluator,
  type PolicyAction,
  type PolicyEvaluator,
} from '../middleware/guardrail.js';

export interface ToolExecutionRequest {
  name: string;
  arguments: Record<string, unknown>;
  sessionId: string;
  turnNumber: number;
}

export interface ToolExecutionTelemetry {
  tool: string;
  authorized: boolean;
  cached?: boolean;
  middleware_ms?: number;
  quality?: 'pass' | 'warn' | 'blocked';
  verification?: 'pass' | 'fail';
  output_chars?: number;
  policy?: PolicyAction;
}

export class ToolExecutionGateway {
  private readonly chain: MiddlewareChain;

  constructor(
    private readonly options: {
      authorize?: (
        toolName: string,
        arguments_: Record<string, unknown>,
      ) => boolean | Promise<boolean>;
      telemetry?: (event: ToolExecutionTelemetry) => void;
      middleware?: MiddlewareConfig;
      policyEvaluator?: PolicyEvaluator;
    } = {},
  ) {
    this.chain = new MiddlewareChain({
      policyEvaluator: options.policyEvaluator ?? new ProcessPolicyEvaluator(),
      config: options.middleware ?? {
        tool_sandbox: { enabled: true },
        context_offload: { enabled: true, min_tokens_to_offload: 2_000 },
        session_deduplication: {
          enabled: true,
          include_tools: ['fw_get_current_phase', 'fw_check_pipeline_compliance'],
        },
      },
    });
  }

  async execute(
    request: ToolExecutionRequest,
    execute: () => Promise<ToolResult>,
  ): Promise<ToolResult> {
    const authorized = await (this.options.authorize?.(request.name, request.arguments) ?? true);
    if (!authorized) {
      this.options.telemetry?.({ tool: request.name, authorized: false });
      return {
        isError: true,
        content: [{ type: 'text', text: 'Tool execution is not authorized.' }],
      };
    }
    const completed = await this.chain.executeTool(
      {
        id: `${request.sessionId}:${request.turnNumber}:${request.name}:${randomUUID()}`,
        toolName: request.name,
        toolArgs: request.arguments,
        startTime: Date.now(),
      },
      'orchestrator',
      'feature',
      'build',
      request.turnNumber,
      request.sessionId,
      '',
      execute,
    );
    const quality = completed.qualityGate?.blocked
      ? 'blocked'
      : completed.qualityGate && completed.qualityGate.score < completed.qualityGate.threshold
        ? 'warn'
        : 'pass';
    const policyBlocked =
      completed.guardrail?.action === 'block' || completed.guardrail?.action === 'config-error';
    this.options.telemetry?.({
      tool: request.name,
      authorized: !policyBlocked,
      policy: completed.guardrail?.action,
      cached: completed.cached,
      middleware_ms: completed.middlewareMs,
      quality,
      verification: completed.verification?.status,
      output_chars: completed.result.content
        .map((block) => block.text.length)
        .reduce((total, size) => total + size, 0),
    });
    if (policyBlocked) return completed.result;
    if (!completed.offloadRef) return completed.result;
    return {
      ...completed.result,
      content: [
        {
          type: 'text',
          text: `${completed.result.content[0]?.text ?? ''}\n[offloaded result: ${completed.offloadRef}]`,
        },
      ],
    };
  }
}
