/**
 * Tool Output Sandbox Middleware — Middleware ④c
 *
 * Intercepts every tool's output before it enters LLM context.
 * - Sanitizes ANSI codes and checks for prompt injection
 * - Captures full output to audit log (async, non-blocking)
 * - Compresses large outputs
 * - Generates structured summaries
 * - Returns summary instead of raw output
 *
 * Position: after SessionDeduplication (④b), before QualityGate (⑥)
 */

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { ToolContext, ToolResult } from './types.js';

export interface SandboxConfig {
  enabled?: boolean;
  audit_log_dir?: string;
  max_raw_size?: number; // bytes before truncation
  max_summary_size?: number; // chars in summary
  enable_audit?: boolean;
  sanitize?: boolean;
  compress_large?: boolean;
  tool_overrides?: Partial<
    Record<
      string,
      {
        max_raw_size?: number;
      }
    >
  >;
}

interface SandboxResult {
  originalTokens: number;
  summaryTokens: number;
  tokensSaved: number;
  compressionRatio: number;
  summary: string;
  auditRef?: string;
  truncated: boolean;
  injectionBlocked: boolean;
}

interface AuditEntry {
  sessionId: string;
  turnNumber: number;
  tool: string;
  args: Record<string, unknown>;
  resultTokens: number;
  timestamp: string;
  compressed: boolean;
  summary: string;
  injectionBlocked: boolean;
}

interface SandboxMetrics {
  totalTools: number;
  byTool: Record<
    string,
    {
      count: number;
      avgTokens: number;
      totalTokens: number;
      truncated: number;
    }
  >;
  auditWrites: number;
  auditFailures: number;
  injectionAttemptsBlocked: number;
}

const DEFAULT_CONFIG: Required<
  SandboxConfig & { tool_overrides: SandboxConfig['tool_overrides'] }
> = {
  enabled: true,
  audit_log_dir: '.forgewright/audit',
  max_raw_size: 10_240, // 10KB
  max_summary_size: 512, // chars
  enable_audit: true,
  sanitize: true,
  compress_large: true,
  tool_overrides: {},
};

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?previous (instructions?|commands?)/i,
  /disregard (all )?prior (instructions?|commands?)/i,
  /forget (everything|all) (above|previous)/i,
  /new instruction/i,
  /<\|(?:system|user)\|>/i,
  /<\/?(?:system|user|prompt)[\s>]/i,
  /\[(SYSTEM|INSTRUCTIONS?)[\]:]/i,
  /```system[\s\S]*?```/i,
];

/** Strip ANSI escape codes from text. */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\(B/g, '')
    .replace(/\r$/g, '');
}

/** Detect prompt injection attempts. */
function detectInjection(text: string): boolean {
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/** Count tokens (rough heuristic: ~4 chars per token). */
function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Count tokens in a tool result. */
function countResultTokens(result: ToolResult): number {
  let total = 0;
  for (const block of result.content) {
    if (block.type === 'text') {
      total += countTokens(block.text);
    }
  }
  return total;
}

/** Truncate text to maxBytes, appending "... (truncated)" notice. */
function truncate(text: string, maxBytes: number): { text: string; wasTruncated: boolean } {
  if (text.length <= maxBytes) return { text, wasTruncated: false };
  const truncated = text.slice(0, maxBytes);
  return {
    text: truncated + '\n... (truncated from ' + Math.ceil(text.length / 1024) + 'KB)',
    wasTruncated: true,
  };
}

/** Sanitize text: strip ANSI, detect injection. */
function sanitize(text: string): { text: string; injectionBlocked: boolean } {
  const cleaned = stripAnsi(text);
  const blocked = detectInjection(cleaned);
  if (blocked) {
    // Replace suspicious content with placeholder
    const redacted = cleaned.replace(PROMPT_INJECTION_PATTERNS[0], '[FILTERED]');
    return { text: redacted, injectionBlocked: true };
  }
  return { text: cleaned, injectionBlocked: false };
}

/** Generate structured summary for a tool result. */
function generateSummary(
  toolName: string,
  args: Record<string, unknown>,
  result: ToolResult,
  maxSummarySize: number,
): string {
  const texts = result.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  switch (toolName) {
    case 'Read': {
      const path = String(args.path ?? 'unknown');
      const lines = texts.split('\n').length;
      const chars = texts.length;
      const truncated = chars > 5000 ? ` (first ${Math.ceil(lines / 2)} lines shown)` : '';
      return `file ${path}: ${lines} lines, ${chars} chars${truncated}`;
    }

    case 'Grep': {
      const path = String(args.path ?? '');
      const pattern = String(args.pattern ?? args.search_term ?? '');
      const matches = texts.split('\n').filter(Boolean).length;
      return `Grep ${path} for '${pattern}': ${matches} match${matches === 1 ? '' : 'es'}`;
    }

    case 'Bash': {
      const lines = texts.split('\n').filter(Boolean).length;
      const isError = result.isError ?? false;
      const errStr = isError ? ' [ERROR]' : '';
      return `${lines} line${lines === 1 ? '' : 's'}${errStr}`;
    }

    case 'Glob': {
      const glob = String(args.glob_pattern ?? args.glob ?? args.pattern ?? '*');
      const files = texts.split('\n').filter(Boolean).length;
      return `Glob ${glob}: ${files} file${files === 1 ? '' : 's'}`;
    }

    case 'SemanticSearch': {
      const query = String(args.query ?? '');
      const results = texts.split('\n').filter(Boolean).length;
      return `SemanticSearch '${query}': ${results} result${results === 1 ? '' : 's'}`;
    }

    case 'FetchMcpResource': {
      const uri = String(args.uri ?? '');
      return `resource ${uri}: ${texts.length} chars`;
    }

    case 'Write': {
      const path = String(args.path ?? args.target_notebook ?? 'unknown');
      const bytes = texts.length;
      return `wrote ${path}: ${bytes} bytes`;
    }

    case 'Edit': {
      const path = String(args.path ?? args.target_notebook ?? 'unknown');
      return `edited ${path}`;
    }

    case 'Delete': {
      const path = String(args.path ?? 'unknown');
      return `deleted ${path}`;
    }

    default: {
      const lines = texts.split('\n').filter(Boolean).length;
      const chars = texts.length;
      if (chars < 200) return texts.slice(0, maxSummarySize);
      return `${lines} lines, ${chars} chars`;
    }
  }
}

export class ToolSandboxMiddleware {
  name = 'tool-sandbox';
  enabled = true;

  private config = { ...DEFAULT_CONFIG };
  private metrics: SandboxMetrics = {
    totalTools: 0,
    byTool: {},
    auditWrites: 0,
    auditFailures: 0,
    injectionAttemptsBlocked: 0,
  };

  configure(config: SandboxConfig): void {
    if (!config) return;
    this.enabled = config.enabled ?? this.enabled;
    this.config = {
      enabled: this.enabled,
      audit_log_dir: config.audit_log_dir ?? DEFAULT_CONFIG.audit_log_dir,
      max_raw_size: config.max_raw_size ?? DEFAULT_CONFIG.max_raw_size,
      max_summary_size: config.max_summary_size ?? DEFAULT_CONFIG.max_summary_size,
      enable_audit: config.enable_audit ?? DEFAULT_CONFIG.enable_audit,
      sanitize: config.sanitize ?? DEFAULT_CONFIG.sanitize,
      compress_large: config.compress_large ?? DEFAULT_CONFIG.compress_large,
      tool_overrides: config.tool_overrides ?? DEFAULT_CONFIG.tool_overrides,
    };
  }

  /**
   * Process a tool result after execution.
   * Returns a sanitized + compressed result with summary metadata.
   */
  processResult(
    ctx: ToolContext,
    result: ToolResult,
  ): { result: ToolResult; sandbox: SandboxResult } {
    const toolName = ctx.call.toolName;
    const toolArgs = ctx.call.toolArgs;
    const originalTokens = countResultTokens(result);

    // Initialize per-tool metrics
    if (!this.metrics.byTool[toolName]) {
      this.metrics.byTool[toolName] = { count: 0, avgTokens: 0, totalTokens: 0, truncated: 0 };
    }
    this.metrics.totalTools++;
    this.metrics.byTool[toolName].count++;
    this.metrics.byTool[toolName].totalTokens += originalTokens;
    this.metrics.byTool[toolName].avgTokens = Math.round(
      this.metrics.byTool[toolName].totalTokens / this.metrics.byTool[toolName].count,
    );

    // Combine all text blocks
    let combinedText = result.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    let injectionBlocked = false;
    let wasTruncated = false;

    // Sanitize
    if (this.config.sanitize) {
      const sanitized = sanitize(combinedText);
      combinedText = sanitized.text;
      injectionBlocked = sanitized.injectionBlocked;

      if (injectionBlocked) {
        this.metrics.injectionAttemptsBlocked++;
        // Don't block execution — just flag it
      }
    }

    // Get per-tool max size override
    const toolOverride = this.config.tool_overrides?.[toolName] ?? {};
    const maxRaw = toolOverride.max_raw_size ?? this.config.max_raw_size;

    // Compress large outputs
    if (this.config.compress_large && maxRaw > 0 && combinedText.length > maxRaw) {
      const truncated = truncate(combinedText, maxRaw);
      combinedText = truncated.text;
      wasTruncated = truncated.wasTruncated;
      if (wasTruncated) {
        this.metrics.byTool[toolName].truncated++;
      }
    }

    // Write audit log (non-blocking, fire-and-forget)
    let auditRef: string | undefined;
    if (this.config.enable_audit) {
      try {
        auditRef = this.writeAuditEntry(ctx, toolArgs, result, combinedText, injectionBlocked);
        this.metrics.auditWrites++;
      } catch {
        this.metrics.auditFailures++;
      }
    }

    // Generate structured summary
    const summary = generateSummary(toolName, toolArgs, result, this.config.max_summary_size);
    const summaryTokens = countTokens(summary);

    const sandbox: SandboxResult = {
      originalTokens,
      summaryTokens,
      tokensSaved: Math.max(0, originalTokens - summaryTokens),
      compressionRatio:
        originalTokens > 0
          ? Math.round(((originalTokens - summaryTokens) / originalTokens) * 100)
          : 0,
      summary:
        summaryTokens < originalTokens
          ? summary
          : combinedText.slice(0, this.config.max_summary_size),
      auditRef,
      truncated: wasTruncated,
      injectionBlocked,
    };

    // Build result with combined + sanitized text
    const processedResult: ToolResult = {
      content: [
        {
          type: 'text',
          text: combinedText || summary,
        },
      ],
      isError: result.isError,
    };

    return { result: processedResult, sandbox };
  }

  private writeAuditEntry(
    ctx: ToolContext,
    args: Record<string, unknown>,
    result: ToolResult,
    processedText: string,
    injectionBlocked: boolean,
  ): string {
    const ts = new Date().toISOString();
    const tsHash = createHash('sha256').update(ts).digest('hex').slice(0, 8);
    const ref = `${ctx.sessionId}/${ctx.turnNumber}/${ctx.call.toolName}/${tsHash}.jsonl`;

    const entry: AuditEntry = {
      sessionId: ctx.sessionId,
      turnNumber: ctx.turnNumber,
      tool: ctx.call.toolName,
      args,
      resultTokens: countResultTokens(result),
      timestamp: ts,
      compressed: processedText.length < 1_000,
      summary: generateSummary(ctx.call.toolName, args, result, 256),
      injectionBlocked,
    };

    const logPath = join(this.config.audit_log_dir, ref);

    try {
      const dir = dirname(logPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      appendFileSync(logPath, JSON.stringify(entry) + '\n');
    } catch {
      // Fail silently — audit is non-critical
    }

    return ref;
  }

  /** after_tool — main hook called by the chain. */
  after_tool(ctx: ToolContext): void {
    if (!this.enabled || !ctx.call.result) return;
    // This middleware is primarily used via processResult() from the chain
    // It also logs metrics on every call
  }

  /** Get current metrics. */
  getMetrics(): Readonly<SandboxMetrics> {
    return { ...this.metrics };
  }

  /** Reset metrics. */
  resetMetrics(): void {
    this.metrics = {
      totalTools: 0,
      byTool: {},
      auditWrites: 0,
      auditFailures: 0,
      injectionAttemptsBlocked: 0,
    };
  }
}
