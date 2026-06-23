/**
 * Context Offload Middleware — Middleware ④d
 *
 * Persists large tool results outside model context with stable trace handles.
 * The model receives compact sandboxed output while full sanitized output lives
 * under .forgewright/offload/<session>/refs/<node_id>.md.
 */

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { ToolContext, ToolResult } from './types.js';

export interface ContextOffloadConfig {
  enabled?: boolean;
  data_dir?: string;
  min_tokens_to_offload?: number;
  write_raw_refs?: boolean;
  write_canvas?: boolean;
  redact_secrets?: boolean;
  max_summary_size?: number;
  max_canvas_events?: number;
}

export type OffloadStatus = 'queued' | 'running' | 'done' | 'error' | 'skipped';

export interface OffloadEvent {
  node_id: string;
  session_id: string;
  turn_number: number;
  tool: string;
  args_hash: string;
  summary: string;
  status: OffloadStatus;
  result_ref?: string;
  tokens_original: number;
  tokens_summary: number;
  created_at: string;
  source: 'mcp-context-offload';
}

interface OffloadMetrics {
  totalTools: number;
  offloaded: number;
  skippedSmall: number;
  writeFailures: number;
}

interface OffloadResult {
  event?: OffloadEvent;
  offloaded: boolean;
  reason?: string;
}

const DEFAULT_CONFIG: Required<ContextOffloadConfig> = {
  enabled: false,
  data_dir: '.forgewright/offload',
  min_tokens_to_offload: 1200,
  write_raw_refs: true,
  write_canvas: true,
  redact_secrets: true,
  max_summary_size: 512,
  max_canvas_events: 50,
};

const REDACT_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /key-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g,
  /password\s*[:=]\s*['"]?[^\s'"]{4,}/gi,
  /secret\s*[:=]\s*['"]?[^\s'"]{4,}/gi,
  /token\s*[:=]\s*['"]?[^\s'"]{8,}/gi,
  /postgres:\/\/\S+:\S+@/g,
  /mysql:\/\/\S+:\S+@/g,
  /mongodb(?:\+srv)?:\/\/\S+:\S+@/g,
];

const STATUS_CLASSES = new Set<OffloadStatus>(['queued', 'running', 'done', 'error', 'skipped']);

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\(B/g, '')
    .replace(/\r$/g, '');
}

function redactSecrets(text: string): string {
  let redacted = text;
  for (const pattern of REDACT_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

function normalizeArgs(args: Record<string, unknown>): string {
  function sortAndClean(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sortAndClean);

    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined && item !== null) sorted[key] = sortAndClean(item);
    }
    return sorted;
  }

  return JSON.stringify(sortAndClean(args), null, 0);
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function safeSegment(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return safe || 'unknown';
}

function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function resultText(result: ToolResult): string {
  return result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function summarize(text: string, maxSummarySize: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxSummarySize) return compact;
  return compact.slice(0, maxSummarySize - 3) + '...';
}

function ensureWithin(baseDir: string, targetPath: string): void {
  const resolvedBase = resolve(baseDir);
  const resolvedTarget = resolve(targetPath);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + '/')) {
    throw new Error(`Unsafe offload path: ${resolvedTarget}`);
  }
}

function mermaidId(nodeId: string): string {
  return `m_${safeSegment(nodeId).replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function mermaidLabel(event: OffloadEvent): string {
  const ref = event.result_ref ? `\\nref: ${event.result_ref}` : '';
  const summary = event.summary.replace(/["\\]/g, '').replace(/\s+/g, ' ').slice(0, 96);
  return `${event.turn_number}. ${event.tool}\\nid: ${event.node_id}\\n${summary}${ref}`;
}

export function generateMermaidCanvas(events: OffloadEvent[], maxEvents = 50): string {
  const selected = events.slice(-maxEvents);
  const lines = [
    'flowchart TD',
    '  classDef queued fill:#eef2ff,stroke:#4f46e5,color:#111827',
    '  classDef running fill:#fff7ed,stroke:#f97316,color:#111827',
    '  classDef done fill:#ecfdf5,stroke:#16a34a,color:#111827',
    '  classDef error fill:#fef2f2,stroke:#dc2626,color:#111827',
    '  classDef skipped fill:#f3f4f6,stroke:#6b7280,color:#111827',
  ];

  if (selected.length === 0) {
    lines.push('  empty["No offloaded tool events"]:::skipped');
    return lines.join('\n') + '\n';
  }

  for (const event of selected) {
    const statusClass = STATUS_CLASSES.has(event.status) ? event.status : 'skipped';
    lines.push(`  ${mermaidId(event.node_id)}["${mermaidLabel(event)}"]:::${statusClass}`);
  }

  for (let i = 1; i < selected.length; i++) {
    lines.push(`  ${mermaidId(selected[i - 1].node_id)} --> ${mermaidId(selected[i].node_id)}`);
  }

  return lines.join('\n') + '\n';
}

export class ContextOffloadMiddleware {
  name = 'context-offload';
  enabled = false;

  private config = { ...DEFAULT_CONFIG };
  private metrics: OffloadMetrics = {
    totalTools: 0,
    offloaded: 0,
    skippedSmall: 0,
    writeFailures: 0,
  };

  configure(config: ContextOffloadConfig | undefined): void {
    if (!config) return;
    this.enabled = config.enabled ?? this.enabled;
    this.config = {
      enabled: this.enabled,
      data_dir: config.data_dir ?? DEFAULT_CONFIG.data_dir,
      min_tokens_to_offload: config.min_tokens_to_offload ?? DEFAULT_CONFIG.min_tokens_to_offload,
      write_raw_refs: config.write_raw_refs ?? DEFAULT_CONFIG.write_raw_refs,
      write_canvas: config.write_canvas ?? DEFAULT_CONFIG.write_canvas,
      redact_secrets: config.redact_secrets ?? DEFAULT_CONFIG.redact_secrets,
      max_summary_size: config.max_summary_size ?? DEFAULT_CONFIG.max_summary_size,
      max_canvas_events: config.max_canvas_events ?? DEFAULT_CONFIG.max_canvas_events,
    };
  }

  processResult(
    ctx: ToolContext,
    originalResult: ToolResult,
    processedResult: ToolResult,
  ): OffloadResult {
    if (!this.enabled) return { offloaded: false, reason: 'disabled' };

    this.metrics.totalTools++;

    const rawText = resultText(originalResult);
    const sanitizedText = this.config.redact_secrets
      ? redactSecrets(stripAnsi(rawText))
      : stripAnsi(rawText);
    const tokensOriginal = countTokens(sanitizedText);

    if (tokensOriginal < this.config.min_tokens_to_offload && !originalResult.isError) {
      this.metrics.skippedSmall++;
      return { offloaded: false, reason: 'below-threshold' };
    }

    const argsHash = shortHash(normalizeArgs(ctx.call.toolArgs));
    const nodeId = safeSegment(
      `n-${ctx.turnNumber}-${ctx.call.toolName}-${argsHash}-${shortHash(String(ctx.call.startTime))}`,
    );
    const sessionId = safeSegment(ctx.sessionId);
    const sessionDir = join(this.config.data_dir, sessionId);
    const refsDir = join(sessionDir, 'refs');
    const resultRef = this.config.write_raw_refs ? `refs/${nodeId}.md` : undefined;
    const processedText = resultText(processedResult);

    const event: OffloadEvent = {
      node_id: nodeId,
      session_id: sessionId,
      turn_number: ctx.turnNumber,
      tool: ctx.call.toolName,
      args_hash: argsHash,
      summary: summarize(processedText || sanitizedText, this.config.max_summary_size),
      status: originalResult.isError ? 'error' : 'done',
      result_ref: resultRef,
      tokens_original: tokensOriginal,
      tokens_summary: countTokens(processedText),
      created_at: new Date().toISOString(),
      source: 'mcp-context-offload',
    };

    try {
      mkdirSync(sessionDir, { recursive: true });
      ensureWithin(this.config.data_dir, sessionDir);

      if (resultRef) {
        mkdirSync(refsDir, { recursive: true });
        const refPath = join(sessionDir, resultRef);
        ensureWithin(sessionDir, refPath);
        writeFileSync(refPath, sanitizedText);
      }

      appendFileSync(join(sessionDir, 'events.jsonl'), JSON.stringify(event) + '\n');
      if (this.config.write_canvas) {
        const events = this.loadEvents(sessionId);
        writeFileSync(
          join(sessionDir, 'canvas.mmd'),
          generateMermaidCanvas(events, this.config.max_canvas_events),
        );
      }
      writeFileSync(
        join(sessionDir, 'state.json'),
        JSON.stringify(
          {
            session_id: sessionId,
            last_node_id: nodeId,
            updated_at: event.created_at,
          },
          null,
          2,
        ),
      );
      this.metrics.offloaded++;
      return { event, offloaded: true };
    } catch {
      this.metrics.writeFailures++;
      return { offloaded: false, reason: 'write-failed' };
    }
  }

  loadEvents(sessionId: string): OffloadEvent[] {
    const safeSessionId = safeSegment(sessionId);
    const eventsPath = join(this.config.data_dir, safeSessionId, 'events.jsonl');
    if (!existsSync(eventsPath)) return [];

    return readFileSync(eventsPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as OffloadEvent];
        } catch {
          return [];
        }
      });
  }

  readRef(sessionId: string, resultRef: string): string | undefined {
    const safeSessionId = safeSegment(sessionId);
    const safeRef = join('refs', basename(resultRef));
    const refPath = join(this.config.data_dir, safeSessionId, safeRef);
    ensureWithin(join(this.config.data_dir, safeSessionId), refPath);
    if (!existsSync(refPath)) return undefined;
    return readFileSync(refPath, 'utf8');
  }

  readCanvas(sessionId: string): string | undefined {
    const safeSessionId = safeSegment(sessionId);
    const canvasPath = join(this.config.data_dir, safeSessionId, 'canvas.mmd');
    ensureWithin(join(this.config.data_dir, safeSessionId), canvasPath);
    if (!existsSync(canvasPath)) return undefined;
    return readFileSync(canvasPath, 'utf8');
  }

  getMetrics(): Readonly<OffloadMetrics> {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalTools: 0,
      offloaded: 0,
      skippedSmall: 0,
      writeFailures: 0,
    };
  }
}
