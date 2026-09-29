import { describe, expect, it } from 'vitest';
import {
  hashLearningFoundryPayload,
  parseSanitizedTrajectorySummary,
  SANITIZED_TRAJECTORY_SUMMARY_SCHEMA_VERSION,
} from './learning-foundry.js';

function summary(startedAt: number, terminalAt: number) {
  const core = {
    schemaVersion: SANITIZED_TRAJECTORY_SUMMARY_SCHEMA_VERSION,
    workspaceId: 'clock-project',
    sessionId: 'clock-task',
    ledgerId: 'clock-ledger',
    origin: 'test-only',
    sourceAuthority: 'test-only',
    startedAt,
    terminalAt,
    ledgerHead: { sequence: 4, sha256: 'a'.repeat(64) },
    terminalOutcome: 'completed',
    quiescence: 'confirmed',
    counters: {
      eventCount: 4,
      recoveredCount: 0,
      scopeCount: 0,
      operationCount: 0,
      disposerCount: 0,
      cancellationCount: 0,
      finalizationReceiptCount: 1,
    },
  };
  return { ...core, summarySha256: hashLearningFoundryPayload(core) };
}
describe('learning summary epoch-millisecond regression', () => {
  it('accepts actual epoch milliseconds without relaxing counter limits', () => {
    const now = Date.now();
    const value = summary(now - 1000, now);
    expect(parseSanitizedTrajectorySummary(value).terminalAt).toBe(now);
    const { summarySha256, ...core } = value;
    expect(summarySha256).toMatch(/^[a-f0-9]{64}$/);
    core.counters.eventCount = 1_000_000_001;
    core.ledgerHead.sequence = core.counters.eventCount;
    expect(() =>
      parseSanitizedTrajectorySummary({ ...core, summarySha256: hashLearningFoundryPayload(core) }),
    ).toThrow();
  });
  it.each([-1, Number.MAX_SAFE_INTEGER + 1, 1.5])('rejects an invalid timestamp %s', (time) => {
    expect(() => parseSanitizedTrajectorySummary(summary(time, time))).toThrow();
  });
  it('rejects inverted event time ordering', () => {
    const now = Date.now();
    expect(() => parseSanitizedTrajectorySummary(summary(now, now - 1))).toThrow();
  });
});
