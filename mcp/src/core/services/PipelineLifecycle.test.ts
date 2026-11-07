import { describe, expect, it, vi } from 'vitest';
import { PipelineService } from './PipelineService.js';
import { DEFAULT_STATE, type PipelineState } from '../models/PipelineState.js';

function harness(status: PipelineState['status'] = 'IN_PROGRESS', currentPhase = 1) {
  let state: PipelineState = structuredClone({
    ...DEFAULT_STATE,
    status,
    currentPhase,
    runId: '00000000-0000-4000-8000-000000000001',
    kind: 'existing' as const,
    startedAt: '2026-11-07T00:00:00.000Z',
  });
  const publish = vi.fn();
  const gate = { check: vi.fn(async () => undefined) };
  const repo = {
    load: async () => structuredClone(state),
    save: vi.fn(),
    update: vi.fn(),
    transact: vi.fn(async (fn: (s: PipelineState) => Promise<PipelineState | null>) => {
      const next = await fn(structuredClone(state));
      if (next) state = next;
      return next;
    }),
  };
  const service = Reflect.construct(PipelineService, [repo, { publish }, gate]) as PipelineService;
  return { service, gate, publish, state: () => state };
}

describe('canonical pipeline transition admission', () => {
  it.each(['IDLE', 'FAILED', 'COMPLETED'] as const)('never advances %s', async (status) => {
    const h = harness(status);
    const before = structuredClone(h.state());
    expect(await h.service.advancePhase()).toContain('Error:');
    expect(h.state()).toEqual(before);
    expect(h.publish).not.toHaveBeenCalled();
  });
  it('does not mutate or publish when executable prerequisites reject', async () => {
    const h = harness();
    h.gate.check.mockRejectedValue(new Error('research missing'));
    const before = structuredClone(h.state());
    expect(await h.service.advancePhase()).toContain('research missing');
    expect(h.state()).toEqual(before);
    expect(h.publish).not.toHaveBeenCalled();
  });
  it.each([1, 3, 4])('checks prerequisites before passing phase %i', async (phase) => {
    const h = harness('IN_PROGRESS', phase);
    await h.service.advancePhase();
    expect(h.gate.check).toHaveBeenCalledTimes(1);
  });
  it('human approval cannot erase a failing quality gate', async () => {
    const h = harness();
    await h.service.requestGateApproval('release', { score: 1, threshold: 8, failedCriteria: [] });
    h.publish.mockClear();
    expect(await h.service.approveGate()).toContain('Error:');
    expect(h.state().status).toBe('WAITING_FOR_GATE');
    expect(h.state().qualityGate?.score).toBe(1);
    expect(h.publish).not.toHaveBeenCalled();
  });
  it('rejects a concurrent state change while a gate is running outside the transaction', async () => {
    const h = harness();
    h.gate.check.mockImplementation(async () => {
      await h.service.updateSubTask('new owner work', 0.5);
    });
    expect(await h.service.advancePhase()).toContain('state changed');
    expect(h.state().currentPhase).toBe(1);
    expect(h.state().activeAction).toBe('new owner work');
    expect(h.publish).toHaveBeenCalledTimes(1);
  });
  it('cannot restart around human approval, or reopen a terminal run with an approval request', async () => {
    const h = harness();
    await h.service.requestGateApproval('wait');
    expect(await h.service.startPipeline('bypass')).toContain('Error:');
    expect(h.state().status).toBe('WAITING_FOR_GATE');
    await h.service.failPipeline('cancelled');
    expect(await h.service.requestGateApproval('revive')).toContain('Error:');
    expect(h.state().status).toBe('FAILED');
  });
  it('stops a third reported attempt and cannot clear terminal status by clearing healing', async () => {
    const h = harness();
    await h.service.updateSelfHealing({ isHealing: true, currentAttempt: 3, maxAttempts: 99 });
    expect(h.state().status).toBe('FAILED');
    expect(h.state().selfHealing?.maxAttempts).toBe(2);
    await h.service.updateSelfHealing(null);
    expect(await h.service.advancePhase()).toContain('Error:');
  });
  it('fails closed when no executable gate was wired', async () => {
    const repo = {
      load: async () => harness().state(),
      save: vi.fn(),
      update: vi.fn(),
      transact: vi.fn(),
    };
    const service = new PipelineService(repo, { publish: vi.fn() });
    expect(await service.advancePhase()).toContain('unavailable');
    expect(repo.transact).not.toHaveBeenCalled();
  });
  it('cannot erase rejected quality criteria by requesting approval without a replacement', async () => {
    const h = harness();
    await h.service.requestGateApproval('quality', { score: 1, threshold: 8, failedCriteria: [] });
    await h.service.requestGateApproval('try again');
    expect(await h.service.approveGate()).toContain('Error:');
    expect(h.state().qualityGate?.score).toBe(1);
  });
  it('cancellation during checks cannot commit a phase transition', async () => {
    const h = harness();
    const controller = new AbortController();
    h.gate.check.mockImplementation(async () => {
      controller.abort();
    });
    expect(await h.service.advancePhase(undefined, controller.signal)).toContain('cancelled');
    expect(h.state().currentPhase).toBe(1);
    expect(h.publish).not.toHaveBeenCalled();
  });
  it('cannot replace a failing threshold with a lower one', async () => {
    const h = harness();
    await h.service.requestGateApproval('quality', { score: 1, threshold: 8, failedCriteria: [] });
    expect(
      await h.service.requestGateApproval('bypass', { score: 1, threshold: 1, failedCriteria: [] }),
    ).toContain('Error:');
    expect(await h.service.approveGate()).toContain('Error:');
    expect(h.state().qualityGate?.threshold).toBe(8);
    await h.service.requestGateApproval('repaired', { score: 8, threshold: 8, failedCriteria: [] });
    expect(await h.service.approveGate()).not.toContain('Error:');
  });
  it('rejects oversized inputs before persisting or publishing them', async () => {
    const h = harness();
    const huge = 'x'.repeat(4097);
    expect(await h.service.requestGateApproval(huge)).toContain('Error:');
    expect(
      await h.service.requestGateApproval('quality', {
        score: 1,
        threshold: 8,
        failedCriteria: Array(51).fill({ name: 'x', reason: 'y', score: 1 }),
      }),
    ).toContain('Error:');
    expect(await h.service.failPipeline(huge)).toContain('Error:');
    await expect(h.service.updateSubTask(huge, 0.5)).rejects.toThrow();
    await expect(
      h.service.updateSelfHealing({
        isHealing: true,
        currentAttempt: 1,
        maxAttempts: 2,
        lastError: huge,
      }),
    ).rejects.toThrow();
    expect(h.publish).not.toHaveBeenCalled();
  });
});
