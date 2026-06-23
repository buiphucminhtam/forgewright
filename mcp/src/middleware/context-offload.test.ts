import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ContextOffloadMiddleware, generateMermaidCanvas } from './context-offload.js';
import type { ToolContext, ToolResult } from './types.js';

function makeCtx(sessionId = 'test-session', turnNumber = 1): ToolContext {
  return {
    call: {
      id: 'call-1',
      toolName: 'Bash',
      toolArgs: { cmd: 'npm test' },
      startTime: 12345,
    },
    skillId: 'software-engineer',
    mode: 'feature',
    phase: 'build',
    turnNumber,
    sessionId,
    userMessage: 'run tests',
  };
}

describe('ContextOffloadMiddleware', () => {
  it('offloads large sanitized tool output to JSONL and raw refs', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'forgewright-offload-'));
    const mw = new ContextOffloadMiddleware();
    mw.configure({
      enabled: true,
      data_dir: dataDir,
      min_tokens_to_offload: 10,
      write_raw_refs: true,
      redact_secrets: true,
    });

    const original: ToolResult = {
      content: [
        {
          type: 'text',
          text: `password=supersecret ${'x'.repeat(200)}`,
        },
      ],
    };
    const processed: ToolResult = {
      content: [{ type: 'text', text: 'Bash output: 1 line' }],
    };

    const result = mw.processResult(makeCtx(), original, processed);

    expect(result.offloaded).toBe(true);
    expect(result.event?.result_ref).toBeDefined();
    expect(result.event?.summary).toBe('Bash output: 1 line');
    expect(mw.getMetrics().offloaded).toBe(1);

    const sessionDir = join(dataDir, 'test-session');
    expect(existsSync(join(sessionDir, 'events.jsonl'))).toBe(true);
    expect(existsSync(join(sessionDir, 'canvas.mmd'))).toBe(true);
    expect(existsSync(join(sessionDir, 'state.json'))).toBe(true);
    expect(mw.readCanvas('test-session')).toContain('flowchart TD');
    expect(mw.readCanvas('test-session')).toContain(result.event?.node_id);

    const refText = mw.readRef('test-session', result.event?.result_ref ?? '');
    expect(refText).toContain('[REDACTED]');
    expect(refText).not.toContain('supersecret');
  });

  it('loads events while skipping corrupt JSONL lines', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'forgewright-offload-'));
    const mw = new ContextOffloadMiddleware();
    mw.configure({
      enabled: true,
      data_dir: dataDir,
      min_tokens_to_offload: 1,
    });

    const result = mw.processResult(
      makeCtx(),
      { content: [{ type: 'text', text: 'large enough' }] },
      { content: [{ type: 'text', text: 'summary' }] },
    );
    expect(result.offloaded).toBe(true);

    appendFileSync(join(dataDir, 'test-session', 'events.jsonl'), 'not-json\n');

    const events = mw.loadEvents('test-session');
    expect(events).toHaveLength(1);
    expect(events[0].node_id).toBe(result.event?.node_id);
  });

  it('skips small successful results below threshold', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'forgewright-offload-'));
    const mw = new ContextOffloadMiddleware();
    mw.configure({
      enabled: true,
      data_dir: dataDir,
      min_tokens_to_offload: 1000,
    });

    const result = mw.processResult(
      makeCtx(),
      { content: [{ type: 'text', text: 'short' }] },
      { content: [{ type: 'text', text: 'short' }] },
    );

    expect(result.offloaded).toBe(false);
    expect(result.reason).toBe('below-threshold');
    expect(mw.getMetrics().skippedSmall).toBe(1);
  });

  it('offloads error results even when they are below threshold', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'forgewright-offload-'));
    const mw = new ContextOffloadMiddleware();
    mw.configure({
      enabled: true,
      data_dir: dataDir,
      min_tokens_to_offload: 1000,
    });

    const result = mw.processResult(
      makeCtx('unsafe/../../session'),
      { content: [{ type: 'text', text: 'boom' }], isError: true },
      { content: [{ type: 'text', text: 'boom' }], isError: true },
    );

    expect(result.offloaded).toBe(true);
    expect(result.event?.session_id).toBe('unsafe_.._.._session');
    expect(result.event?.status).toBe('error');
    expect(readFileSync(join(dataDir, 'unsafe_.._.._session', 'events.jsonl'), 'utf8')).toContain(
      result.event?.node_id ?? '',
    );
  });

  it('limits canvas to the configured number of most recent events', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'forgewright-offload-'));
    const mw = new ContextOffloadMiddleware();
    mw.configure({
      enabled: true,
      data_dir: dataDir,
      min_tokens_to_offload: 1,
      max_canvas_events: 2,
    });

    const first = mw.processResult(
      makeCtx('canvas-session', 1),
      { content: [{ type: 'text', text: 'first event body' }] },
      { content: [{ type: 'text', text: 'first event summary' }] },
    );
    const second = mw.processResult(
      makeCtx('canvas-session', 2),
      { content: [{ type: 'text', text: 'second event body' }] },
      { content: [{ type: 'text', text: 'second event summary' }] },
    );
    const third = mw.processResult(
      makeCtx('canvas-session', 3),
      { content: [{ type: 'text', text: 'third event body' }] },
      { content: [{ type: 'text', text: 'third event summary' }] },
    );

    const canvas = mw.readCanvas('canvas-session') ?? '';
    expect(canvas).not.toContain(first.event?.node_id);
    expect(canvas).toContain(second.event?.node_id);
    expect(canvas).toContain(third.event?.node_id);
    expect(canvas).toContain('-->');
  });

  it('maps unknown event status to skipped in generated canvas', () => {
    const canvas = generateMermaidCanvas([
      {
        node_id: 'n-unknown',
        session_id: 'session',
        turn_number: 1,
        tool: 'Bash',
        args_hash: 'abc',
        summary: 'summary',
        status: 'unexpected' as never,
        tokens_original: 10,
        tokens_summary: 2,
        created_at: '2026-06-23T00:00:00.000Z',
        source: 'mcp-context-offload',
      },
    ]);

    expect(canvas).toContain('n-unknown');
    expect(canvas).toContain(':::skipped');
  });
});
