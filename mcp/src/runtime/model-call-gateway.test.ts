import { describe, expect, it } from 'vitest';
import {
  BudgetLedger,
  ModelCallGateway,
  type CapabilityProbe,
  type ModelProvider,
} from './model-call-gateway.js';

const probe: CapabilityProbe = {
  async probe() {
    return [
      { id: 'gpt-5.6-luna', snapshot: 'luna-snapshot', tiers: ['scout'] },
      { id: 'gpt-5.6-terra', snapshot: 'terra-snapshot', tiers: ['builder', 'expert'] },
    ];
  },
};

function provider(run: ModelProvider['complete']): ModelProvider {
  return { complete: run };
}

describe('ModelCallGateway', () => {
  it('routes by risk and records usage_unavailable without recording prompts', async () => {
    const events: unknown[] = [];
    const gateway = new ModelCallGateway({ probe, telemetry: (event) => events.push(event) });
    const result = await gateway.execute(
      {
        taskId: 'task-1',
        accountId: 'account-1',
        riskSignals: ['public-api'],
        prompt: 'never log me',
      },
      provider(async () => ({ output: 'ok' })),
    );
    expect(result.route.tier).toBe('expert');
    expect(result.usageUnavailable).toBe(true);
    expect(JSON.stringify(events)).not.toContain('never log me');
    expect(events[0]).toMatchObject({ usage_unavailable: true, model: 'gpt-5.6-terra' });
  });

  it('fails closed when no expert capability is available for high-risk work', async () => {
    const gateway = new ModelCallGateway({
      probe: {
        async probe() {
          return [{ id: 'builder', snapshot: 'v1', tiers: ['builder'] }];
        },
      },
    });
    await expect(
      gateway.execute(
        { taskId: 'task', accountId: 'account', riskSignals: ['security'], prompt: 'x' },
        provider(async () => ({ output: 'x' })),
      ),
    ).rejects.toThrow('No capable model');
  });

  it('retries bounded transient failures then opens a circuit', async () => {
    let calls = 0;
    const gateway = new ModelCallGateway({
      probe,
      retry: { maxAttempts: 2, baseDelayMs: 0 },
      circuit: { failureThreshold: 2, resetAfterMs: 60_000 },
    });
    const failing = provider(async () => {
      calls++;
      throw Object.assign(new Error('temporary provider failure'), { retryable: true });
    });
    await expect(
      gateway.execute({ taskId: 'a', accountId: 'a', prompt: 'x' }, failing),
    ).rejects.toThrow('temporary');
    await expect(
      gateway.execute({ taskId: 'b', accountId: 'a', prompt: 'x' }, failing),
    ).rejects.toThrow('temporary');
    await expect(
      gateway.execute({ taskId: 'c', accountId: 'a', prompt: 'x' }, failing),
    ).rejects.toThrow('circuit');
    expect(calls).toBe(4);
  });

  it('enforces timeout, output and turn caps', async () => {
    const gateway = new ModelCallGateway({
      probe,
      caps: { timeoutMs: 5, maxOutputChars: 3, maxTurns: 1 },
    });
    const slow = provider(
      async () => new Promise((resolve) => setTimeout(() => resolve({ output: 'slow' }), 20)),
    );
    await expect(
      gateway.execute({ taskId: 'a', accountId: 'a', prompt: 'x' }, slow),
    ).rejects.toThrow('timed out');
    const capped = await gateway.execute(
      { taskId: 'b', accountId: 'a', prompt: 'x' },
      provider(async () => ({ output: 'hello' })),
    );
    expect(capped.output).toBe('hel');
    await expect(
      gateway.execute(
        { taskId: 'b', accountId: 'a', prompt: 'x' },
        provider(async () => ({ output: 'x' })),
      ),
    ).rejects.toThrow('turn cap');
  });

  it('checks budgets before calls at warning, authority, fail-closed, and explicit override thresholds', async () => {
    const ledger = new BudgetLedger({ taskLimit: 100, accountLimit: 100 });
    ledger.record('task', 'account', 79);
    expect(ledger.preflight('task', 'account', 1).status).toBe('warning');
    ledger.record('task', 'account', 15);
    expect(ledger.preflight('task', 'account', 1).status).toBe('authority_required');
    ledger.record('task', 'account', 5);
    expect(ledger.preflight('task', 'account', 1).status).toBe('blocked');
    expect(ledger.preflight('task', 'account', 1, { allowOverage: true }).status).toBe(
      'allowed_override',
    );
    const gateway = new ModelCallGateway({ probe, budget: ledger });
    await expect(
      gateway.execute(
        { taskId: 'new-task', accountId: 'account', prompt: 'x' },
        provider(async () => ({ output: 'x' })),
      ),
    ).rejects.toThrow('estimated cost');
  });

  it('atomically reserves budget before simultaneous provider calls with no deterministic overshoot', async () => {
    const ledger = new BudgetLedger({ taskLimit: 10, accountLimit: 10 });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let invocations = 0;
    const gateway = new ModelCallGateway({ probe, budget: ledger, retry: { maxAttempts: 1 } });
    const blocking = provider(async () => {
      invocations++;
      await pending;
      return { output: 'ok', usage: { inputTokens: 1, outputTokens: 1, cost: 5 } };
    });
    const first = gateway.execute(
      { taskId: 'task-a', accountId: 'account', prompt: 'x', estimatedCost: 6 },
      blocking,
    );
    await expect(
      gateway.execute(
        { taskId: 'task-b', accountId: 'account', prompt: 'x', estimatedCost: 6 },
        blocking,
      ),
    ).rejects.toThrow('Budget exhausted');
    expect(invocations).toBe(1);
    release();
    await first;
    expect(ledger.preflight('task-c', 'account', 4).status).toBe('warning');
  });

  it('settles a reservation using actual cost and refunds it after terminal failure', async () => {
    const ledger = new BudgetLedger({ taskLimit: 10, accountLimit: 10 });
    const gateway = new ModelCallGateway({ probe, budget: ledger, retry: { maxAttempts: 1 } });
    await gateway.execute(
      { taskId: 'task-a', accountId: 'account', prompt: 'x', estimatedCost: 8 },
      provider(async () => ({ output: 'ok', usage: { inputTokens: 1, outputTokens: 1, cost: 3 } })),
    );
    expect(ledger.preflight('task-b', 'account', 5).status).toBe('warning');
    await expect(
      gateway.execute(
        { taskId: 'task-c', accountId: 'account', prompt: 'x', estimatedCost: 5 },
        provider(async () => {
          throw new Error('invalid request');
        }),
      ),
    ).rejects.toThrow('invalid request');
    expect(ledger.preflight('task-d', 'account', 6).status).toBe('warning');
  });

  it('does not retry non-retryable provider errors or timeouts', async () => {
    let validationCalls = 0;
    const validationGateway = new ModelCallGateway({
      probe,
      retry: { maxAttempts: 3, baseDelayMs: 0 },
    });
    await expect(
      validationGateway.execute(
        { taskId: 'validation', accountId: 'account', prompt: 'x' },
        provider(async () => {
          validationCalls++;
          throw new Error('invalid request');
        }),
      ),
    ).rejects.toThrow('invalid request');
    expect(validationCalls).toBe(1);

    let timeoutCalls = 0;
    const timeoutGateway = new ModelCallGateway({
      probe,
      retry: { maxAttempts: 3, baseDelayMs: 0 },
      caps: { timeoutMs: 5 },
    });
    await expect(
      timeoutGateway.execute(
        { taskId: 'timeout', accountId: 'account', prompt: 'x' },
        provider(async () => {
          timeoutCalls++;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { output: 'late' };
        }),
      ),
    ).rejects.toThrow('timed out');
    expect(timeoutCalls).toBe(1);
  });
});
